"""LLM data sanitization — strips PII before sending to external LLM providers.

When sensitive_mode is enabled, this layer:
1. Detects PII patterns (emails, phone numbers, SSNs, credit cards)
2. Replaces them with placeholders before sending to the LLM
3. Restores them in the response (so the user sees real data)

This ensures that sensitive employee data never reaches external LLM providers
in identifiable form.
"""

import logging
import re

from config import settings

log = logging.getLogger("security.sanitizer")


# PII detection patterns
_PATTERNS = {
    "email": (
        re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
        "[EMAIL]",
    ),
    "phone": (
        re.compile(r"(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"),
        "[PHONE]",
    ),
    "ssn": (
        re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
        "[SSN]",
    ),
    "credit_card": (
        re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"),
        "[CARD]",
    ),
    "ip_address": (
        re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
        "[IP]",
    ),
}


def sanitize(text: str) -> tuple[str, dict[str, str]]:
    """Strip PII from text, return sanitized text + replacement map.

    The replacement map allows restoring original values in the response.

    Only active when settings.sensitive_mode is True.
    Returns original text unchanged when sensitive_mode is False.
    """
    if not settings.sensitive_mode:
        return text, {}

    if not text:
        return text, {}

    replacements: dict[str, str] = {}
    sanitized = text
    counter = 0

    for pii_type, (pattern, placeholder_base) in _PATTERNS.items():
        for match in pattern.finditer(sanitized):
            original = match.group()
            if original in replacements.values():
                continue  # already mapped
            counter += 1
            placeholder = f"{placeholder_base[:-1]}_{counter}]"
            replacements[placeholder] = original
            sanitized = sanitized.replace(original, placeholder)

    if replacements:
        log.info(f"Sanitized {len(replacements)} PII instances from text")

    return sanitized, replacements


def restore(text: str, replacements: dict[str, str]) -> str:
    """Restore original PII values in text using the replacement map.

    Call this on the LLM's response to put back the real values
    before showing to the user.
    """
    if not replacements or not text:
        return text

    restored = text
    for placeholder, original in replacements.items():
        restored = restored.replace(placeholder, original)

    return restored


def sanitize_for_llm(system: str, user_message: str) -> tuple[str, str, dict[str, str]]:
    """Convenience: sanitize both system prompt and user message.

    Returns (sanitized_system, sanitized_user, combined_replacements).
    """
    sys_clean, sys_map = sanitize(system)
    usr_clean, usr_map = sanitize(user_message)
    combined = {**sys_map, **usr_map}
    return sys_clean, usr_clean, combined
