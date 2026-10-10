from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "production", "test"] = "development"
    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/agent_platform"
    )
    default_page_size: int = 20
    max_page_size: int = 100
    # Fernet key for connector credentials. Unset: connectors without credentials still work.
    secrets_encryption_key: SecretStr | None = None
    execution_stub_image: str = "agent-platform-runner:local"
    # URL of this API as the stub container sees it (Docker Desktop: host.docker.internal).
    execution_callback_base_url: str = "http://host.docker.internal:8000"
    execution_timeout_seconds: int = 60
    worker_poll_interval_seconds: float = 1.0
    docker_enabled: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
