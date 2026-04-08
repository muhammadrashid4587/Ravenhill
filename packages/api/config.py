"""App-wide configuration — reads from environment variables and optional .env file."""

from pathlib import Path
from pydantic_settings import BaseSettings

# Load .env into os.environ before pydantic-settings reads it.
# This ensures the values are available as real env vars regardless of CWD.
_ENV_FILE = Path(__file__).parent.parent.parent / ".env"
try:
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=True)
except ImportError:
    pass


class Settings(BaseSettings):
    # App
    app_env: str = "development"
    api_port: int = 8000
    web_port: int = 3000

    # Claude API
    anthropic_api_key: str = ""

    # Database
    database_url: str = "postgresql+asyncpg://eagent:eagent@localhost:5432/eagent"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # LLM provider: "cerebras" | "groq" | "gemini" | "anthropic" | "auto" | "mock"
    llm_provider: str = "auto"
    cerebras_api_key: str = ""
    groq_api_key: str = ""
    gemini_api_key: str = ""

    # ETO
    eto_api_key: str = ""
    eto_api_url: str = "https://api.eto.markets/v1"

    # Frontend
    next_public_api_url: str = "http://localhost:8000"

    # env_file is a best-effort load: pydantic-settings v2 silently skips it
    # when the file doesn't exist (e.g. on Fly.io where secrets are injected
    # as real env vars).  The relative path works when running from repo root
    # via `cd packages/api && uvicorn ...`.
    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
