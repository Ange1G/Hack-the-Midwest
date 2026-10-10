from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_env: Literal["development", "production", "test"] = "development"
    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/agent_platform"
    )
    default_page_size: int = 20
    max_page_size: int = 100
    # Fernet key for connector credentials. Unset: connectors without credentials still work.
    secrets_encryption_key: SecretStr | None = None
    execution_runner_image: str = Field(
        default="agent-platform-runner:local",
        validation_alias=AliasChoices(
            "execution_runner_image", "execution_stub_image", "EXECUTION_STUB_IMAGE"
        ),
    )
    # URL of this API as the container sees it (Docker Desktop: host.docker.internal).
    execution_callback_base_url: str = "http://host.docker.internal:8000"
    execution_timeout_seconds: int = 120
    worker_poll_interval_seconds: float = 1.0
    docker_enabled: bool = True
    # Platform-owned OpenAI key injected into the runner. Unset: worker fails the job.
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-4o-mini"
    max_active_executions_per_owner: int = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()
