"""Database connector: a database an agent may use.

`config.mode` selects one of two shapes:

  external     a database the user already runs; host and credentials are passed in.
  provisioned  the platform starts a database for the agent when the agent's run starts
               (see app.runtime.agent_databases); credentials are optional and generated
               when omitted.
"""

import re
from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, ValidationInfo, field_validator, model_validator
from pydantic_core import PydanticCustomError

from app.domains.primitives.base import BaseContract, ContractPart, Credential
from app.domains.primitives.network import PublicHost


class Engine(StrEnum):
    POSTGRES = "postgres"
    MYSQL = "mysql"
    MONGODB = "mongodb"
    REDIS = "redis"


@dataclass(frozen=True)
class EngineInfo:
    default_port: int
    versions: tuple[str, ...]  # versions the platform can provision
    default_version: str
    min_memory_mb: int
    named_databases: bool  # redis numbers its databases instead of naming them


ENGINES: dict[Engine, EngineInfo] = {
    Engine.POSTGRES: EngineInfo(5432, ("15", "16", "17"), "16", 256, True),
    Engine.MYSQL: EngineInfo(3306, ("8.0", "8.4"), "8.4", 512, True),
    Engine.MONGODB: EngineInfo(27017, ("7.0", "8.0"), "8.0", 512, True),
    Engine.REDIS: EngineInfo(6379, ("7",), "7", 256, False),
}

# Discriminator values of DatabaseConfig. Pydantic inserts them into error locations.
DATABASE_MODES = ("external", "provisioned")

MIN_MEMORY_MB = 256
MAX_MEMORY_MB = 2048
DEFAULT_MEMORY_MB = 512
DEFAULT_DATABASE_NAME = "agent"
MIN_SUPPLIED_PASSWORD_LENGTH = 12
MAX_CA_CERTIFICATE_LENGTH = 16_384

# Names the platform creates itself: safe as identifiers in every engine.
ProvisionedName = Annotated[str, StringConstraints(pattern=r"^[a-z_][a-z0-9_]{0,62}$")]
_PROVISIONED_USERNAME = re.compile(r"^[a-z_][a-z0-9_]{0,31}$")
# Existing databases: identifier-like, plus the hyphens some providers use.
_EXTERNAL_DATABASE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_\-]{0,62}$")
_REDIS_DATABASE_INDEX = re.compile(r"^(?:[0-9]|1[0-5])$")


def _error(kind: str, message: str) -> PydanticCustomError:
    return PydanticCustomError(kind, message)


class ExternalDatabaseConfig(ContractPart):
    mode: Literal["external"]
    engine: Engine
    host: PublicHost
    port: int | None = Field(default=None, ge=1, le=65_535, description="Default per engine")
    database: str | None = Field(
        default=None,
        min_length=1,
        max_length=63,
        description="Database name; for redis, the database number 0-15",
    )
    # Credentials cross the internet, so plaintext is not offered. `require` encrypts
    # without verifying the server certificate (self-signed providers).
    tls: Literal["verifyFull", "require"] = "verifyFull"
    ca_certificate: str | None = Field(
        default=None,
        alias="caCertificate",
        max_length=MAX_CA_CERTIFICATE_LENGTH,
        pattern=r"^-----BEGIN CERTIFICATE-----",
        description="PEM CA certificate for managed databases with a private CA",
    )
    # Least privilege by default. The runtime opens read-only sessions where the engine
    # supports it; a read-only database user is the real guarantee.
    access: Literal["readOnly", "readWrite"] = "readOnly"

    @model_validator(mode="after")
    def _apply_engine_rules(self) -> "ExternalDatabaseConfig":
        info = ENGINES[self.engine]
        if self.port is None:
            self.port = info.default_port
        if not info.named_databases:
            if self.database is not None and not _REDIS_DATABASE_INDEX.match(self.database):
                raise _error("invalid_database", "Redis databases are numbered 0 to 15")
        elif self.database is None:
            raise _error("missing_database", f"database is required for {self.engine}")
        elif not _EXTERNAL_DATABASE_NAME.match(self.database):
            raise _error(
                "invalid_database",
                "database may contain letters, digits, underscores and hyphens, "
                "starting with a letter or underscore",
            )
        return self


class ProvisionedDatabaseConfig(ContractPart):
    mode: Literal["provisioned"]
    engine: Engine
    version: str | None = Field(default=None, description="Default per engine")
    database: ProvisionedName | None = Field(
        default=None, description=f'Default "{DEFAULT_DATABASE_NAME}"; not used by redis'
    )
    # agent: kept with its data between runs. run: fresh for every run, removed after.
    lifecycle: Literal["agent", "run"] = "agent"
    memory_mb: int = Field(
        default=DEFAULT_MEMORY_MB, alias="memoryMb", ge=MIN_MEMORY_MB, le=MAX_MEMORY_MB
    )

    @model_validator(mode="after")
    def _apply_engine_rules(self) -> "ProvisionedDatabaseConfig":
        info = ENGINES[self.engine]
        if self.version is None:
            self.version = info.default_version
        elif self.version not in info.versions:
            raise _error(
                "unsupported_version",
                f"{self.engine} version must be one of: {', '.join(info.versions)}",
            )
        if info.named_databases:
            self.database = self.database or DEFAULT_DATABASE_NAME
        elif self.database is not None:
            raise _error("invalid_database", "Redis has no named databases; omit database")
        if self.memory_mb < info.min_memory_mb:
            raise _error(
                "insufficient_memory",
                f"{self.engine} needs memoryMb of at least {info.min_memory_mb}",
            )
        return self


DatabaseConfig = Annotated[
    ExternalDatabaseConfig | ProvisionedDatabaseConfig, Field(discriminator="mode")
]


class DatabaseCredentials(ContractPart):
    username: Credential = None
    password: Credential = None


class DatabaseContract(BaseContract):
    type: Literal["database"]
    config: DatabaseConfig
    # Declared after config so its validator can check credentials against the mode.
    credentials: DatabaseCredentials | None = Field(default=None, validate_default=True)

    @field_validator("credentials")
    @classmethod
    def _credentials_fit_config(
        cls, value: DatabaseCredentials | None, info: ValidationInfo
    ) -> DatabaseCredentials | None:
        config = info.data.get("config")
        if config is None:  # config is invalid and reported on its own
            return value
        username = value.username if value else None
        password = value.password if value else None
        if isinstance(config, ExternalDatabaseConfig):
            if password is None:
                raise _error("missing_credential", "External databases need credentials.password")
            if username is None and config.engine is not Engine.REDIS:
                raise _error(
                    "missing_credential",
                    f"External {config.engine} databases need credentials.username",
                )
            return value
        if username is not None:
            if config.engine is Engine.REDIS:
                raise _error(
                    "invalid_credential",
                    "Provisioned redis uses its default user; omit credentials.username",
                )
            if not _PROVISIONED_USERNAME.match(username):
                raise _error(
                    "invalid_credential",
                    "credentials.username must be 1-32 lowercase letters, digits or "
                    "underscores, starting with a letter or underscore",
                )
            if config.engine is Engine.MYSQL and username == "root":
                raise _error("invalid_credential", "credentials.username cannot be root for mysql")
        if password is not None and len(password) < MIN_SUPPLIED_PASSWORD_LENGTH:
            raise _error(
                "weak_credential",
                f"credentials.password must be at least {MIN_SUPPLIED_PASSWORD_LENGTH} characters",
            )
        return value
