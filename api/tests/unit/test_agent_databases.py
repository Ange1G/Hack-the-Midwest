import uuid
from collections.abc import Collection
from dataclasses import dataclass, field
from typing import Any

import pytest

from app.core.secrets import SecretCipher
from app.domains.connectors.models import Connector
from app.domains.connectors.repository import ConnectorWithSecrets
from app.domains.primitives.database_contract import Engine
from app.domains.primitives.network import UnsafeTargetError, resolve_public_addresses
from app.domains.primitives.registry import parse_contract, split_credentials
from app.runtime.agent_databases import (
    AgentDatabaseError,
    DatabaseConnection,
    agent_databases,
)
from app.runtime.database_provisioner import (
    ProvisionedDatabase,
    ProvisioningError,
    ProvisionRequest,
)

OWNER = "sso-me"
CIPHER = SecretCipher(SecretCipher.generate_key())


@dataclass
class FakeAgent:
    configurations: dict[str, Any]
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    owner_user_sso: str = OWNER


class FakeConnectors:
    def __init__(self, *items: ConnectorWithSecrets, owner: str = OWNER) -> None:
        self.items = list(items)
        self.owner = owner
        self.requests: list[tuple[str, set[uuid.UUID]]] = []

    async def get_with_secrets(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> list[ConnectorWithSecrets]:
        self.requests.append((owner_user_sso, set(ids)))
        if owner_user_sso != self.owner:
            return []
        return [i for i in self.items if i.connector.id in ids]


class FakeProvisioner:
    def __init__(self, fail_for: set[str] = frozenset()) -> None:  # type: ignore[assignment]
        self.started: list[ProvisionRequest] = []
        self.released: list[ProvisionedDatabase] = []
        self.fail_for = fail_for

    async def start(self, request: ProvisionRequest) -> ProvisionedDatabase:
        if str(request.connector_id) in self.fail_for:
            raise ProvisioningError("postgres container cdb-x stopped while starting")
        self.started.append(request)
        return ProvisionedDatabase(
            container=f"cdb-{request.connector_id.hex[:8]}",
            host="127.0.0.1",
            port=49000 + len(self.started),
            lifecycle=request.lifecycle,
        )

    async def release(self, database: ProvisionedDatabase) -> None:
        self.released.append(database)


async def public(host: str, port: int) -> list[str]:
    return ["198.51.100.7"] if host == "db.example.com" else ["1.1.1.1"]


def stored(body: dict[str, Any], *, owner: str = OWNER) -> ConnectorWithSecrets:
    """A connector as the connectors service would have saved it."""
    contract, credentials = split_credentials(parse_contract(body))
    connector = Connector(
        id=uuid.uuid4(),
        owner_user_sso=owner,
        type=contract["type"],
        name=contract["name"],
        contract=contract,
    )
    return ConnectorWithSecrets(connector, {k: CIPHER.encrypt(v) for k, v in credentials.items()})


def database(
    name: str, config: dict[str, Any], credentials: dict[str, str] | None = None, **extra: Any
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "type": "database",
        "contractVersion": 1,
        "name": name,
        "config": config,
        **extra,
    }
    if credentials:
        body["credentials"] = credentials
    return body


EXTERNAL = database(
    "orders_db",
    {"mode": "external", "engine": "postgres", "host": "db.example.com", "database": "orders"},
    {"username": "reader", "password": "p@ss/word:1"},
    description="Orders replica",
    options={"timeout": 5000, "retries": 1},
)
SCRATCH = database("scratch", {"mode": "provisioned", "engine": "postgres"})
EPHEMERAL = database("cache", {"mode": "provisioned", "engine": "redis", "lifecycle": "run"})
HTTP = {
    "type": "http",
    "contractVersion": 1,
    "name": "issues",
    "config": {"method": "GET", "URL": "https://api.example.com/issues"},
}


def agent_for(*items: ConnectorWithSecrets) -> FakeAgent:
    return FakeAgent({"primitives": {str(i.connector.id): {} for i in items}})


async def open_databases(
    agent: FakeAgent,
    connectors: FakeConnectors,
    provisioner: FakeProvisioner,
    *,
    cipher: SecretCipher | None = CIPHER,
    resolve: Any = public,
) -> dict[str, DatabaseConnection]:
    async with agent_databases(
        agent, connectors=connectors, cipher=cipher, provisioner=provisioner, resolve=resolve
    ) as dbs:
        return dbs


# --- connections ----------------------------------------------------------------------


async def test_yields_connections_for_database_connectors_only() -> None:
    items = [stored(EXTERNAL), stored(SCRATCH), stored(HTTP)]
    agent = agent_for(*items)
    connectors = FakeConnectors(*items)
    dbs = await open_databases(agent, connectors, FakeProvisioner())

    assert set(dbs) == {"orders_db", "scratch"}
    assert connectors.requests == [(OWNER, {i.connector.id for i in items})]


async def test_external_connection_uses_decrypted_credentials_and_checked_addresses() -> None:
    item = stored(EXTERNAL)
    db = (await open_databases(agent_for(item), FakeConnectors(item), FakeProvisioner()))[
        "orders_db"
    ]
    assert db.username == "reader" and db.password == "p@ss/word:1"
    assert (db.host, db.port, db.database) == ("db.example.com", 5432, "orders")
    assert db.addresses == ("198.51.100.7",)
    assert db.read_only and not db.provisioned
    assert (db.timeout_ms, db.retries) == (5000, 1)
    assert db.url() == (
        "postgresql://reader:p%40ss%2Fword%3A1@db.example.com:5432/orders?sslmode=verify-full"
    )


async def test_provisioned_database_is_started_with_a_derived_password() -> None:
    item = stored(SCRATCH)
    agent = agent_for(item)
    provisioner = FakeProvisioner()
    db = (await open_databases(agent, FakeConnectors(item), provisioner))["scratch"]

    (request,) = provisioner.started
    assert request.agent_id == agent.id and request.connector_id == item.connector.id
    assert (request.engine, request.version, request.database) == (Engine.POSTGRES, "16", "agent")
    assert request.username == "agent" and request.lifecycle == "agent"
    assert request.password == CIPHER.derive_secret(
        f"provisioned-database/user/{agent.id}/{item.connector.id}"
    )
    assert request.admin_password != request.password
    assert (db.host, db.port, db.password) == ("127.0.0.1", 49001, request.password)
    assert db.provisioned and not db.read_only and db.tls == "disable"
    assert db.url(hide_password=True) == (
        "postgresql://agent:********@127.0.0.1:49001/agent?sslmode=disable"
    )


async def test_agent_database_password_is_the_same_on_every_run() -> None:
    item = stored(SCRATCH)
    agent = agent_for(item)
    provisioner = FakeProvisioner()
    await open_databases(agent, FakeConnectors(item), provisioner)
    await open_databases(agent, FakeConnectors(item), provisioner)
    first, second = provisioner.started
    assert first.password == second.password


async def test_run_database_gets_a_new_random_password_each_run() -> None:
    item = stored(EPHEMERAL)
    agent = agent_for(item)
    provisioner = FakeProvisioner()
    await open_databases(agent, FakeConnectors(item), provisioner, cipher=None)
    await open_databases(agent, FakeConnectors(item), provisioner, cipher=None)
    first, second = provisioner.started
    assert first.password != second.password
    assert first.username is None and first.database is None  # redis


async def test_supplied_credentials_are_used_for_provisioned_databases() -> None:
    item = stored(
        database(
            "app_db",
            {"mode": "provisioned", "engine": "mysql"},
            {"username": "app", "password": "supplied-password-1"},
        )
    )
    provisioner = FakeProvisioner()
    db = (await open_databases(agent_for(item), FakeConnectors(item), provisioner))["app_db"]
    (request,) = provisioner.started
    assert (request.username, request.password) == ("app", "supplied-password-1")
    assert db.url(hide_password=True) == (
        "mysql://app:********@127.0.0.1:49001/agent?ssl-mode=DISABLED"
    )


# --- clean-up -------------------------------------------------------------------------


async def test_databases_are_released_after_the_run() -> None:
    items = [stored(SCRATCH), stored(EPHEMERAL)]
    provisioner = FakeProvisioner()
    await open_databases(agent_for(*items), FakeConnectors(*items), provisioner)
    assert len(provisioner.released) == 2


async def test_databases_are_released_when_the_run_fails() -> None:
    item = stored(EPHEMERAL)
    provisioner = FakeProvisioner()
    with pytest.raises(RuntimeError, match="agent crashed"):
        async with agent_databases(
            agent_for(item),
            connectors=FakeConnectors(item),
            cipher=CIPHER,
            provisioner=provisioner,
            resolve=public,
        ):
            raise RuntimeError("agent crashed")
    assert [d.lifecycle for d in provisioner.released] == ["run"]


async def test_started_databases_are_released_when_a_later_one_fails() -> None:
    ok, broken = stored(EPHEMERAL), stored(SCRATCH)
    # Connectors load ordered by name: "cache" (ok) before "scratch" (broken).
    provisioner = FakeProvisioner(fail_for={str(broken.connector.id)})
    with pytest.raises(AgentDatabaseError, match="scratch: postgres container"):
        await open_databases(agent_for(ok, broken), FakeConnectors(ok, broken), provisioner)
    assert [d.container for d in provisioner.released] == [f"cdb-{ok.connector.id.hex[:8]}"]


async def test_release_errors_do_not_hide_the_others() -> None:
    items = [
        stored(EPHEMERAL),
        stored(database("cache2", {"mode": "provisioned", "engine": "redis", "lifecycle": "run"})),
    ]
    provisioner = FakeProvisioner()
    calls = []

    async def flaky_release(db: ProvisionedDatabase) -> None:
        calls.append(db)
        if len(calls) == 1:
            raise ProvisioningError("docker rm failed")

    provisioner.release = flaky_release  # type: ignore[method-assign]
    await open_databases(agent_for(*items), FakeConnectors(*items), provisioner)
    assert len(calls) == 2


# --- refusals -------------------------------------------------------------------------


async def test_external_host_resolving_to_a_private_address_is_refused() -> None:
    item = stored(EXTERNAL)

    async def rebinding(host: str, port: int) -> list[str]:
        raise UnsafeTargetError(f"{host} resolves to an address the platform does not reach")

    with pytest.raises(AgentDatabaseError, match="orders_db: db.example.com resolves"):
        await open_databases(
            agent_for(item), FakeConnectors(item), FakeProvisioner(), resolve=rebinding
        )


async def test_resolver_refuses_loopback_names() -> None:
    with pytest.raises(UnsafeTargetError):
        await resolve_public_addresses("localhost", 5432)


async def test_another_users_connector_is_not_loaded() -> None:
    theirs = stored(SCRATCH, owner="sso-them")
    provisioner = FakeProvisioner()
    dbs = await open_databases(
        agent_for(theirs), FakeConnectors(theirs, owner="sso-them"), provisioner
    )
    assert dbs == {} and provisioner.started == []


async def test_credentials_without_a_key_are_refused() -> None:
    item = stored(EXTERNAL)
    with pytest.raises(AgentDatabaseError, match="SECRETS_ENCRYPTION_KEY"):
        await open_databases(agent_for(item), FakeConnectors(item), FakeProvisioner(), cipher=None)


async def test_persistent_database_without_a_key_is_refused() -> None:
    item = stored(SCRATCH)
    with pytest.raises(AgentDatabaseError, match="kept between runs"):
        await open_databases(agent_for(item), FakeConnectors(item), FakeProvisioner(), cipher=None)


async def test_wrong_key_is_reported_without_leaking() -> None:
    item = stored(EXTERNAL)
    other = SecretCipher(SecretCipher.generate_key())
    with pytest.raises(AgentDatabaseError, match="cannot be decrypted") as exc:
        await open_databases(agent_for(item), FakeConnectors(item), FakeProvisioner(), cipher=other)
    assert exc.value.__cause__ is None and exc.value.__suppress_context__


async def test_invalid_stored_contract_error_hides_the_values() -> None:
    item = stored(EXTERNAL)
    item.connector.contract["config"]["host"] = "10.0.0.8"  # e.g. edited in the database
    with pytest.raises(AgentDatabaseError, match="no longer valid") as exc:
        await open_databases(agent_for(item), FakeConnectors(item), FakeProvisioner())
    # `from None`: the ValidationError (whose text includes input values) is not shown.
    assert exc.value.__cause__ is None and exc.value.__suppress_context__
    assert "p@ss" not in str(exc.value)


# --- connection details ---------------------------------------------------------------


def connection(**changes: Any) -> DatabaseConnection:
    base: dict[str, Any] = dict(
        connector_id=uuid.uuid4(),
        name="db",
        description=None,
        engine=Engine.POSTGRES,
        host="db.example.com",
        port=5432,
        database="app",
        username="u",
        password="pw",
    )
    return DatabaseConnection(**{**base, **changes})


@pytest.mark.parametrize(
    ("changes", "url"),
    [
        (
            {"engine": Engine.MYSQL, "port": 3306},
            "mysql://u:pw@db.example.com:3306/app?ssl-mode=VERIFY_IDENTITY",
        ),
        ({"tls": "require"}, "postgresql://u:pw@db.example.com:5432/app?sslmode=require"),
        (
            {"engine": Engine.MONGODB, "port": 27017},
            "mongodb://u:pw@db.example.com:27017/app?tls=true",
        ),
        (
            {"engine": Engine.MONGODB, "port": 27017, "tls": "disable", "provisioned": True},
            "mongodb://u:pw@db.example.com:27017/app?authSource=admin",
        ),
        (
            {"engine": Engine.REDIS, "port": 6379, "username": None, "database": "2"},
            "rediss://:pw@db.example.com:6379/2",
        ),
        (
            {
                "engine": Engine.REDIS,
                "port": 6379,
                "username": None,
                "database": None,
                "tls": "disable",
            },
            "redis://:pw@db.example.com:6379",
        ),
        ({"host": "2001:db8::5"}, "postgresql://u:pw@[2001:db8::5]:5432/app?sslmode=verify-full"),
    ],
)
def test_urls_per_engine(changes: dict[str, Any], url: str) -> None:
    assert connection(**changes).url() == url


def test_secrets_stay_out_of_repr_and_agent_description() -> None:
    db = connection(password="hunter2-secret", ca_certificate="-----BEGIN CERTIFICATE-----x")
    assert "hunter2" not in repr(db)
    assert "BEGIN CERTIFICATE" not in repr(db)
    described = db.describe()
    assert described == {
        "name": "db",
        "description": None,
        "engine": "postgres",
        "database": "app",
        "readOnly": True,
    }
