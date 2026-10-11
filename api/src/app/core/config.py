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
    # Docker network for provisioned databases. Unset: ports are published on 127.0.0.1
    # (local development, platform code on the Docker host). Set: databases join this
    # network (created as --internal if missing) and are reached by container name.
    database_provisioner_network: str | None = None
    # Seconds to wait for a provisioned database to accept connections.
    database_provisioner_ready_timeout: int = 90


@lru_cache
def get_settings() -> Settings:
    return Settings()
