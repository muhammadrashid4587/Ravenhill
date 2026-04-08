"""
LLM provider abstraction — tries Cerebras, Groq, Anthropic, Gemini, then mock.

Entry points:
- `call_llm()` — standard text completion
- `call_llm_structured()` — structured JSON output via schema (Anthropic-native, JSON fallback)
- `stream_llm()` — async generator yielding text chunks (Anthropic-native, single-yield fallback)

Provider clients are lazily initialized so missing SDKs or empty keys never
cause import-time errors.

Cerebras is primary — ~2000 tok/s on wafer-scale chips, free tier, Llama 3.3 70B.
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

from config import settings

# Maximum time (seconds) to wait for a single LLM call before falling back
LLM_TIMEOUT = 15

log = logging.getLogger("llm")

# Model mapping per provider and tier
_MODELS = {
    "cerebras": {"fast": "llama3.1-8b", "reasoning": "qwen-3-235b-a22b-instruct-2507"},
    "groq": {"fast": "llama-3.3-70b-versatile", "reasoning": "llama-3.3-70b-versatile"},
    "anthropic": {"fast": "claude-haiku-4-5", "reasoning": "claude-haiku-4-5"},
    "gemini": {"fast": "gemini-2.5-flash", "reasoning": "gemini-2.5-flash"},
}

# Provider order for "auto" mode — fastest free tiers first
_AUTO_ORDER = ["cerebras", "groq", "anthropic", "gemini"]

# Providers disabled at runtime (auth failure, missing key, etc.)
_disabled: set[str] = set()

# Lazy-initialized clients
_clients: dict[str, object] = {}


def _has_key(provider: str) -> bool:
    key = {
        "anthropic": settings.anthropic_api_key,
        "groq": settings.groq_api_key,
        "gemini": settings.gemini_api_key,
        "cerebras": settings.cerebras_api_key,
    }.get(provider, "")
    return bool(key) and not key.startswith("your-")


def get_active_provider() -> str:
    """Return which provider will actually be used right now."""
    prov = settings.llm_provider
    if prov == "mock":
        return "mock"
    if prov != "auto":
        if _has_key(prov) and prov not in _disabled:
            return prov
        return "mock"
    for p in _AUTO_ORDER:
        if _has_key(p) and p not in _disabled:
            return p
    return "mock"


# ---- Cerebras ----

async def _call_cerebras(
    system: str, user_message: str, model: str, max_tokens: int, json_mode: bool
) -> str:
    if "cerebras" not in _clients:
        from cerebras.cloud.sdk import AsyncCerebras
        _clients["cerebras"] = AsyncCerebras(api_key=settings.cerebras_api_key)
    client = _clients["cerebras"]
    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ],
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    chat = await client.chat.completions.create(**kwargs)
    return chat.choices[0].message.content


# ---- Groq ----

async def _call_groq(
    system: str, user_message: str, model: str, max_tokens: int, json_mode: bool
) -> str:
    if "groq" not in _clients:
        from groq import AsyncGroq
        _clients["groq"] = AsyncGroq(api_key=settings.groq_api_key)
    client = _clients["groq"]
    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ],
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    chat = await client.chat.completions.create(**kwargs)
    return chat.choices[0].message.content


# ---- Anthropic ----

async def _call_anthropic(
    system: str, user_message: str, model: str, max_tokens: int, json_mode: bool
) -> str:
    if "anthropic" not in _clients:
        import anthropic
        _clients["anthropic"] = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    client = _clients["anthropic"]
    response = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )
    return response.content[0].text


# ---- Gemini ----

async def _call_gemini(
    system: str, user_message: str, model: str, max_tokens: int, json_mode: bool
) -> str:
    if "gemini" not in _clients:
        from google import genai
        _clients["gemini"] = genai.Client(api_key=settings.gemini_api_key)
    client = _clients["gemini"]
    config: dict = {"system_instruction": system, "max_output_tokens": max_tokens}
    if json_mode:
        config["response_mime_type"] = "application/json"
    response = await client.aio.models.generate_content(
        model=model,
        contents=user_message,
        config=config,
    )
    return response.text


# ---- Dispatcher ----

_CALLERS = {
    "cerebras": _call_cerebras,
    "groq": _call_groq,
    "anthropic": _call_anthropic,
    "gemini": _call_gemini,
}


async def call_llm(
    system: str,
    user_message: str,
    model_tier: str = "fast",
    max_tokens: int = 1024,
    json_mode: bool = False,
) -> str | None:
    """Call the best available LLM provider. Returns None when all fail (use mock)."""
    prov = settings.llm_provider

    if prov == "mock":
        return None

    providers = _AUTO_ORDER if prov == "auto" else [prov]

    for p in providers:
        if p in _disabled or not _has_key(p):
            continue
        model = _MODELS[p].get(model_tier, _MODELS[p]["fast"])
        caller = _CALLERS[p]
        try:
            result = await asyncio.wait_for(
                caller(system, user_message, model, max_tokens, json_mode),
                timeout=LLM_TIMEOUT,
            )
            log.info(f"[llm] Using {p}/{model}")
            return result
        except asyncio.TimeoutError:
            log.warning(f"[llm] {p}/{model} timed out after {LLM_TIMEOUT}s, trying next")
        except Exception as e:
            err = str(e).lower()
            if any(kw in err for kw in ("auth", "invalid", "credit", "quota", "api_key", "403")):
                _disabled.add(p)
                log.warning(f"[llm] {p} disabled: {e}")
            else:
                log.warning(f"[llm] {p} error (will try next): {e}")

    log.info("[llm] All providers exhausted, falling back to mock")
    return None


async def call_llm_structured(
    system: str,
    user_message: str,
    json_schema: dict,
    model_tier: str = "fast",
    max_tokens: int = 1024,
) -> dict | None:
    """Call the best available LLM with structured JSON output.

    For Anthropic, uses the native ``output_config.format`` with a JSON schema.
    For all other providers, falls back to ``call_llm`` with ``json_mode=True``
    and parses the result.  Returns ``None`` when all providers fail (use mock).
    """
    provider = get_active_provider()

    if provider == "anthropic":
        if "anthropic" not in _clients:
            import anthropic
            _clients["anthropic"] = anthropic.AsyncAnthropic(
                api_key=settings.anthropic_api_key,
            )
        client = _clients["anthropic"]
        model = _MODELS["anthropic"].get(model_tier, _MODELS["anthropic"]["fast"])
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user_message}],
                output_config={
                    "format": {"type": "json_schema", "schema": json_schema},
                },
            )
            text = response.content[0].text
            log.info(f"[llm] Structured call via anthropic/{model}")
            return json.loads(text)
        except Exception as e:
            err = str(e).lower()
            if any(
                kw in err
                for kw in ("auth", "invalid", "credit", "quota", "api_key", "403")
            ):
                _disabled.add("anthropic")
                log.warning(f"[llm] anthropic disabled: {e}")
            else:
                log.warning(f"[llm] anthropic structured error: {e}")
            return None

    # Non-Anthropic providers: fall back to call_llm with json_mode
    if provider != "mock":
        raw = await call_llm(
            system=system,
            user_message=user_message,
            model_tier=model_tier,
            max_tokens=max_tokens,
            json_mode=True,
        )
        if raw is not None:
            try:
                return json.loads(raw.strip())
            except json.JSONDecodeError:
                log.warning("[llm] Structured fallback JSON parse failed")
                return None

    return None


async def stream_llm(
    system: str,
    user_message: str,
    model_tier: str = "reasoning",
    max_tokens: int = 1024,
) -> AsyncGenerator[str, None]:
    """Stream text chunks from the best available LLM provider.

    For Anthropic, uses the native streaming API.
    For all other providers, falls back to a single yield of the full response
    from ``call_llm``.
    """
    provider = get_active_provider()

    if provider == "anthropic":
        if "anthropic" not in _clients:
            import anthropic
            _clients["anthropic"] = anthropic.AsyncAnthropic(
                api_key=settings.anthropic_api_key,
            )
        client = _clients["anthropic"]
        model = _MODELS["anthropic"].get(model_tier, _MODELS["anthropic"]["fast"])
        try:
            async with client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user_message}],
            ) as stream:
                async for text in stream.text_stream:
                    yield text
            log.info(f"[llm] Streamed via anthropic/{model}")
            return
        except Exception as e:
            err = str(e).lower()
            if any(
                kw in err
                for kw in ("auth", "invalid", "credit", "quota", "api_key", "403")
            ):
                _disabled.add("anthropic")
                log.warning(f"[llm] anthropic disabled: {e}")
            else:
                log.warning(f"[llm] anthropic stream error: {e}")
            # Fall through to call_llm fallback

    # Non-Anthropic or Anthropic stream failure: single yield via call_llm
    result = await call_llm(system, user_message, model_tier, max_tokens)
    if result:
        yield result
