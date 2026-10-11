import uuid

import pytest

from app.domains.primitives.database_contract import Engine
from app.runtime import databases_cli
from app.runtime.agent_databases import DatabaseConnection
from app.runtime.database_provisioner import ProvisioningError

AGENT = uuid.uuid4()


class FakeProvisioner:
    calls: list[tuple[str, uuid.UUID]] = []
    fail = False

    @classmethod
    def from_settings(cls, settings: object) -> "FakeProvisioner":
        return cls()

    async def stop_agent(self, agent_id: uuid.UUID) -> int:
        if self.fail:
            raise ProvisioningError("Docker is not available: Cannot connect to the Docker daemon")
        self.calls.append(("stop", agent_id))
        return 2

    async def remove_agent(self, agent_id: uuid.UUID) -> int:
        self.calls.append(("remove", agent_id))
        return 1


@pytest.fixture(autouse=True)
def fake_provisioner(monkeypatch: pytest.MonkeyPatch) -> type[FakeProvisioner]:
    FakeProvisioner.calls = []
    FakeProvisioner.fail = False
    monkeypatch.setattr(databases_cli, "DockerDatabaseProvisioner", FakeProvisioner)
    return FakeProvisioner


def test_stop_and_remove(capsys: pytest.CaptureFixture[str]) -> None:
    assert databases_cli.main(["stop", str(AGENT)]) == 0
    assert databases_cli.main(["remove", str(AGENT)]) == 0
    assert FakeProvisioner.calls == [("stop", AGENT), ("remove", AGENT)]
    out = capsys.readouterr().out
    assert "Stopped 2 database(s)" in out and "Removed 1 database(s)" in out


def test_docker_errors_exit_non_zero(capsys: pytest.CaptureFixture[str]) -> None:
    FakeProvisioner.fail = True
    assert databases_cli.main(["stop", str(AGENT)]) == 1
    assert "Docker is not available" in capsys.readouterr().err


def test_agent_id_must_be_a_uuid() -> None:
    with pytest.raises(SystemExit):
        databases_cli.main(["up", "not-a-uuid"])


def test_connection_details_hide_passwords_unless_asked() -> None:
    db = DatabaseConnection(
        connector_id=uuid.uuid4(),
        name="notes",
        description=None,
        engine=Engine.POSTGRES,
        host="127.0.0.1",
        port=49153,
        database="agent",
        username="agent",
        password="pw-visible-only-on-request",
        tls="disable",
        read_only=False,
        provisioned=True,
    )
    hidden = databases_cli._describe(db, show_passwords=False)
    assert "pw-visible-only-on-request" not in hidden and "********" in hidden
    assert "pw-visible-only-on-request" in databases_cli._describe(db, show_passwords=True)
