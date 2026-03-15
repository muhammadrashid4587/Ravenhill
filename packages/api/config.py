from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    app_env: str = "development"
    api_port: int = 8000

    # Claude API
    anthropic_api_key: str = ""

    # Database
    database_url: str = "postgresql+asyncpg://eagent:eagent@localhost:5432/eagent"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # ETO
    eto_api_key: str = ""
    eto_api_url: str = "https://api.eto.markets/v1"

    model_config = {"env_file": "../../.env"}


settings = Settings()
