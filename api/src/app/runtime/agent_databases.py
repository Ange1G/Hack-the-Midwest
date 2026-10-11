"""Databases for an agent run.

Called by whatever starts an agent run (the worker), before the agent gets its tools:

    async with agent_databases(agent, connectors=repo, cipher=cipher, provisioner=p) as dbs:
        dbs["scratch"].url()   # build the agent's database tools from these
        ...run the agent...
    # run-lifecycle databases are removed here, also when the run fails

Provisioned databases are started (or reused, for lifecycle "agent") and waited on;
external databases have their host re-checked against the SSRF rules, because a public
name can resolve to a private address after the connector was saved.
"""

import logging
import secrets
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Collection
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol
from urllib.parse import quote, urlencode

from pydantic import ValidationError

from app.core.secrets import SecretCipher
from app.domains.connectors.repository import ConnectorWithSecrets
from app.domains.primitives.base import SECRET_PLACEHOLDER
from app.domains.primitives.database_contract import (
    DatabaseContract,
    Engine,
    ExternalDatabaseConfig,
    ProvisionedDatabaseConfig,
)
from app.domains.primitives.network import UnsafeTargetError, resolve_public_addresses
from app.runtime.database_provisioner import (
    DatabaseProvisioner,
    ProvisionedDatabase,
    ProvisioningError,
    ProvisionRequest,
)

logger = logging.getLogger(__name__)

DEFAULT_PROVISIONED_USERNAME = "agent"

TlsMode = Literal["verifyFull", "require", "disable"]
Resolver = Callable[[str, int], Awaitable[list[str]]]

_SCHEMES = {
    Engine.POSTGRES: "postgresql",
    Engine.MYSQL: "mysql",
    Engine.MONGODB: "mongodb",
    Engine.REDIS: "redis",
}
_POSTGRES_SSLMODE = {"verifyFull": "verify-full", "require": "require", "disable": "disable"}
_MYSQL_SSL_MODE = {"verifyFull": "VERIFY_IDENTITY", "require": "REQUIRED", "disable": "DISABLED"}


class AgentDatabaseError(Exception):
    """A database could not be prepared for a run.

    Messages name the connector and the reason, never credentials, so they can be
    reported to the agent's owner.
    """


@dataclass(frozen=True)
class DatabaseConnection:
    connector_id: uuid.UUID
    name: str
    description: str | None
    engine: Engine
    host: str
    port: int
    database: str | None
    username: str | None
    password: str = field(repr=False)
    tls: TlsMode = "verifyFull"
    read_only: bool = True
    provisioned: bool = False
    # External databases: the public addresses `host` resolved to when the run started.
    # Connecting to one of these (with `host` for TLS verification) avoids re-resolving.
    addresses: tuple[str, ...] = ()
    ca_certificate: str | None = field(default=None, repr=False)
    timeout_ms: int | None = None
    retries: int | None = None

    def url(self, *, hide_password: bool = False) -> str:
        """Connection URL in each engine's usual format."""
        scheme = _SCHEMES[self.engine]
        if self.engine is Engine.REDIS and self.tls != "disable":
            scheme = "rediss"
        password = SECRET_PLACEHOLDER if hide_password else quote(self.password, safe="")
        username = quote(self.username, safe="") if self.username else ""
        host = f"[{self.host}]" if ":" in self.host else self.host
        path = f"/{quote(self.database, safe='')}" if self.database else ""
        query = urlencode(self._query())
        return f"{scheme}://{username}:{password}@{host}:{self.port}{path}" + (
            f"?{query}" if query else ""
        )

    def _query(self) -> dict[str, str]:
        match self.engine:
            case Engine.POSTGRES:
                return {"sslmode": _POSTGRES_SSLMODE[self.tls]}
            case Engine.MYSQL:
                return {"ssl-mode": _MYSQL_SSL_MODE[self.tls]}
            case Engine.MONGODB:
                query = {"authSource": "admin"} if self.provisioned else {}
                if self.tls != "disable":
                    query["tls"] = "true"
                if self.tls == "require":
                    query["tlsAllowInvalidCertificates"] = "true"
                return query
            case Engine.REDIS:
                return {"ssl_cert_reqs": "none"} if self.tls == "require" else {}

    def describe(self) -> dict[str, Any]:
        """What the agent's model may be told about this database (no location or secrets)."""
        return {
            "name": self.name,
            "description": self.description,
            "engine": str(self.engine),
            "database": self.database,
            "readOnly": self.read_only,
        }


class ConnectorSource(Protocol):
    async def get_with_secrets(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> list[ConnectorWithSecrets]: ...


class AgentLike(Protocol):
    id: uuid.UUID
    owner_user_sso: str
    configurations: dict[str, Any]


@asynccontextmanager
async def agent_databases(
    agent: AgentLike,
    *,
    connectors: ConnectorSource,
    cipher: SecretCipher | None,
    provisioner: DatabaseProvisioner,
    resolve: Resolver = resolve_public_addresses,
) -> AsyncIterator[dict[str, DatabaseConnection]]:
    """Connections for every database connector the agent references, keyed by name."""
    loaded = await _load_database_connectors(agent, connectors)
    started: list[ProvisionedDatabase] = []
    try:
        connections: dict[str, DatabaseConnection] = {}
        for item in loaded:
            contract = _contract_with_credentials(item, cipher)
            if isinstance(contract.config, ExternalDatabaseConfig):
                connection = await _external(item, contract, contract.config, resolve)
            else:
                connection = await _provisioned(
                    agent, item, contract, contract.config, cipher, provisioner, started
                )
            connections[contract.name] = connection
        yield connections
    finally:
        await _release(provisioner, started)


async def _load_database_connectors(
    agent: AgentLike, connectors: ConnectorSource
) -> list[ConnectorWithSecrets]:
    ids = []
    for key in (agent.configurations or {}).get("primitives", {}):
        try:
            ids.append(uuid.UUID(str(key)))
        except ValueError:
            continue  # not a connector reference; validated when the agent was saved
    # Owner-scoped: a reference to someone else's connector loads nothing.
    loaded = await connectors.get_with_secrets(agent.owner_user_sso, ids)
    return [item for item in loaded if item.connector.type == "database"]


def _contract_with_credentials(
    item: ConnectorWithSecrets, cipher: SecretCipher | None
) -> DatabaseContract:
    name = item.connector.name
    stored = dict(item.connector.contract)
    stored.pop("credentials", None)  # masked placeholders
    if item.ciphertexts:
        if cipher is None:
            raise AgentDatabaseError(
                f"{name}: credential storage is not configured (SECRETS_ENCRYPTION_KEY)"
            )
        try:
            stored["credentials"] = {
                field_name: cipher.decrypt(ciphertext)
                for field_name, ciphertext in item.ciphertexts.items()
            }
        except ValueError:
            raise AgentDatabaseError(
                f"{name}: stored credentials cannot be decrypted with the current key"
            ) from None
    try:
        return DatabaseContract.model_validate(stored)
    except ValidationError:
        # `from None`: a ValidationError's text includes input values, i.e. credentials.
        raise AgentDatabaseError(f"{name}: stored contract is no longer valid") from None


async def _external(
    item: ConnectorWithSecrets,
    contract: DatabaseContract,
    config: ExternalDatabaseConfig,
    resolve: Resolver,
) -> DatabaseConnection:
    assert config.port is not None and contract.credentials is not None  # set by validation
    try:
        addresses = await resolve(config.host, config.port)
    except UnsafeTargetError as exc:
        raise AgentDatabaseError(f"{contract.name}: {exc}") from None
    return DatabaseConnection(
        connector_id=item.connector.id,
        name=contract.name,
        description=contract.description,
        engine=config.engine,
        host=config.host,
        port=config.port,
        database=config.database,
        username=contract.credentials.username,
        password=contract.credentials.password or "",
        tls=config.tls,
        read_only=config.access == "readOnly",
        provisioned=False,
        addresses=tuple(addresses),
        ca_certificate=config.ca_certificate,
        **_options(contract),
    )


async def _provisioned(
    agent: AgentLike,
    item: ConnectorWithSecrets,
    contract: DatabaseContract,
    config: ProvisionedDatabaseConfig,
    cipher: SecretCipher | None,
    provisioner: DatabaseProvisioner,
    started: list[ProvisionedDatabase],
) -> DatabaseConnection:
    supplied = contract.credentials
    username = supplied.username if supplied and supplied.username else None
    if username is None and config.engine is not Engine.REDIS:
        username = DEFAULT_PROVISIONED_USERNAME

    def generated(purpose: str) -> str:
        if config.lifecycle == "run":
            return secrets.token_urlsafe(32)
        if cipher is None:
            raise AgentDatabaseError(
                f"{contract.name}: SECRETS_ENCRYPTION_KEY is required for databases kept "
                "between runs"
            )
        # Same value on every run of this agent, without storing it.
        return cipher.derive_secret(
            f"provisioned-database/{purpose}/{agent.id}/{item.connector.id}"
        )

    password = supplied.password if supplied and supplied.password else generated("user")
    request = ProvisionRequest(
        agent_id=agent.id,
        connector_id=item.connector.id,
        engine=config.engine,
        version=config.version or "",
        database=config.database,
        username=username,
        password=password,
        admin_password=generated("admin"),
        lifecycle=config.lifecycle,
        memory_mb=config.memory_mb,
    )
    try:
        database = await provisioner.start(request)
    except ProvisioningError as exc:
        raise AgentDatabaseError(f"{contract.name}: {exc}") from None
    started.append(database)
    return DatabaseConnection(
        connector_id=item.connector.id,
        name=contract.name,
        description=contract.description,
        engine=config.engine,
        host=database.host,
        port=database.port,
        database=config.database,
        username=username,
        password=password,
        tls="disable",  # loopback or an internal Docker network only
        read_only=False,  # the agent's own database
        provisioned=True,
        **_options(contract),
    )


def _options(contract: DatabaseContract) -> dict[str, int | None]:
    options = contract.options
    return {
        "timeout_ms": options.timeout if options else None,
        "retries": options.retries if options else None,
    }


async def _release(provisioner: DatabaseProvisioner, started: list[ProvisionedDatabase]) -> None:
    for database in reversed(started):
        try:
            await provisioner.release(database)
        except Exception as exc:  # keep releasing the others; never mask the run's error
            logger.warning("Could not release database container %s: %s", database.container, exc)
