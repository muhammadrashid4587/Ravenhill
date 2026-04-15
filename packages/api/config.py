"""App-wide configuration — reads from environment variables and optional .env file."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    app_env: str = "development"
    api_port: int = 8000
    web_port: int = 3000

    # Claude API
    anthropic_api_key: str = ""

    # Database
    database_url: str = "postgresql+asyncpg://eagent:eagent@localhost:5433/eagent"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # LLM provider: "cerebras" | "groq" | "gemini" | "anthropic" | "auto" | "mock"
    llm_provider: str = "auto"
    cerebras_api_key: str = ""
    groq_api_key: str = ""
    gemini_api_key: str = ""

    # Google OAuth (for Google Meet transcript integration)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:3000/meetings/google/callback"

    # Security
    encryption_key: str = ""  # Fernet key for encrypting data at rest. Auto-generated if empty.
    sensitive_mode: bool = False  # When true, PII is stripped before sending to LLM

    # Slack Events API (Phase 1 ingestion)
    slack_signing_secret: str = ""  # verifies webhook authenticity; empty = skip (dev/test)
    slack_bot_token: str = ""  # xoxb-... used for future user/channel resolution

    # The Singularity (formerly ETO)
    singularity_api_key: str = ""
    singularity_api_url: str = "https://api.eto.markets/v1"

    # Frontend
    next_public_api_url: str = "http://localhost:8000"

    # env_file is a best-effort load: pydantic-settings v2 silently skips it
    # when the file doesn't exist (e.g. on Fly.io where secrets are injected
    # as real env vars).  The relative path works when running from repo root
    # via `cd packages/api && uvicorn ...`.
    model_config = {"env_file": "../../.env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
