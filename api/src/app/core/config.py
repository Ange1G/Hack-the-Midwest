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
    # Fernet key for agent credentials. Unset: agents without credentials still work.
    secrets_encryption_key: SecretStr | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
