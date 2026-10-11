from functools import lru_cache
from typing import Literal, Self

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_CORS_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3100",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_env: Literal["development", "production", "test"] = "development"
    cors_origins: list[str] | None = Field(
        default=None,
        validation_alias=AliasChoices("cors_origins", "CORS_ORIGINS"),
    )
    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5433/agent_platform"
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
    # Absolute path on the worker host to a PEM CA bundle that is volume-mounted
    # into every execution container. Set this when the host performs TLS inspection
    # (e.g. Zscaler / Netskope) or uses private CA roots not in the runner image.
    # Leave unset in standard production environments.
    execution_ssl_ca_bundle: str | None = None
    # Docker network for provisioned databases. Unset: ports are published on 127.0.0.1
    # (local development, platform code on the Docker host). Set: databases join this
    # network (created as --internal if missing) and are reached by container name.
    database_provisioner_network: str | None = None
    # Seconds to wait for a provisioned database to accept connections.
    database_provisioner_ready_timeout: int = 90

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object | None:
        if value is None or value == "":
            return None
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @model_validator(mode="after")
    def apply_cors_origin_defaults(self) -> Self:
        if self.cors_origins is None:
            origins = [] if self.app_env == "production" else list(_DEV_CORS_ORIGINS)
            object.__setattr__(self, "cors_origins", origins)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
