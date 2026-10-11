import uuid
from urllib.parse import urlparse

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.domains.agents.models import Agent
from app.domains.connectors.models import Connector
from app.runtime.database_provisioner import ProvisionedDatabase, ProvisionRequest
from app.worker.loop import process_once
from app.worker.runner import RunOutcome, RunRequest

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}


class RecordingRunner:
    def __init__(self, client: AsyncClient) -> None:
        self.requests: list[RunRequest] = []
        self._client = client

    async def run(self, request: RunRequest) -> RunOutcome:
        self.requests.append(request)
        path = urlparse(request.callback_url).path
        response = await self._client.post(
            path,
            json={"status": "succeeded", "result": {"output": "queried", "model": "gpt-4o-mini"}},
            headers={"X-Execution-Callback-Token": request.callback_token},
        )
        return RunOutcome(
            exit_code=0 if response.is_success else 1,
            timed_out=False,
            runner_meta={"http_status": response.status_code},
        )


class FakeProvisioner:
    def __init__(self, *, fail: bool = False) -> None:
        self.started: list[ProvisionRequest] = []
        self.released: list[ProvisionedDatabase] = []
        self.fail = fail

    async def start(self, request: ProvisionRequest) -> ProvisionedDatabase:
        if self.fail:
            from app.runtime.database_provisioner import ProvisioningError

            raise ProvisioningError("postgres container cdb-x stopped while starting")
        self.started.append(request)
        return ProvisionedDatabase(
            container="cdb-test",
            host="127.0.0.1",
            port=49001,
            lifecycle=request.lifecycle,
        )

    async def release(self, database: ProvisionedDatabase) -> None:
        self.released.append(database)


async def _seed_agent_with_db(
    db_session: AsyncSession, *, lifecycle: str = "run"
) -> Agent:
    name = f"scratch_{uuid.uuid4().hex[:8]}"
    connector = Connector(
        owner_user_sso=OWNER,
        type="database",
        name=name,
        contract={
            "type": "database",
            "contractVersion": 1,
            "name": name,
            "config": {
                "mode": "provisioned",
                "engine": "postgres",
                "version": "16",
                "database": "agent",
                "lifecycle": lifecycle,
                "memoryMb": 512,
            },
        },
    )
    db_session.add(connector)
    await db_session.flush()
    agent = Agent(
        title="DB agent",
        system_prompt="Query the scratch database",
        configurations={"primitives": {str(connector.id): {}}},
        owner_user_sso=OWNER,
    )
    db_session.add(agent)
    await db_session.commit()
    await db_session.refresh(agent)
    return agent


async def test_worker_injects_database_tools_and_releases_run_lifecycle(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _seed_agent_with_db(db_session)
    enqueued = await client.post(
        f"/api/v1/agents/{OWNER}/{agent.id}/executions", headers=AUTH
    )
    assert enqueued.status_code == 202, enqueued.text
    execution_id = enqueued.json()["data"]["id"]

    provisioner = FakeProvisioner()
    runner = RecordingRunner(client)
    claimed = await process_once(
        get_session_factory(),
        runner,
        get_settings(),
        provisioner=provisioner,
        resolve=_public,
    )
    assert claimed is True
    assert len(provisioner.started) == 1
    assert provisioner.started[0].lifecycle == "run"
    assert len(provisioner.released) == 1

    (request,) = runner.requests
    assert request.database_tools is not None
    assert request.database_tools[0]["name"].startswith("scratch_")
    assert request.database_tools[0]["host"] == "host.docker.internal"
    assert "password" not in request.database_tools[0]
    assert request.database_credentials is not None
    secret = next(iter(request.database_credentials.values()))["password"]
    assert secret
    assert secret not in str(request.database_tools)
    assert secret not in str(request.agent_manifest)

    fetched = await client.get(
        f"/api/v1/agents/{OWNER}/executions/{execution_id}", headers=AUTH
    )
    assert fetched.json()["data"]["status"] == "succeeded"
    assert secret not in fetched.text


async def test_worker_fails_execution_when_database_provisioning_fails(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _seed_agent_with_db(db_session)
    enqueued = await client.post(
        f"/api/v1/agents/{OWNER}/{agent.id}/executions", headers=AUTH
    )
    execution_id = enqueued.json()["data"]["id"]

    runner = RecordingRunner(client)
    claimed = await process_once(
        get_session_factory(),
        runner,
        get_settings(),
        provisioner=FakeProvisioner(fail=True),
        resolve=_public,
    )
    assert claimed is True
    assert runner.requests == []

    fetched = await client.get(
        f"/api/v1/agents/{OWNER}/executions/{execution_id}", headers=AUTH
    )
    body = fetched.json()["data"]
    assert body["status"] == "failed"
    assert body["error_code"] == "database_unavailable"
    assert "stopped while starting" in body["error_message"]
    assert "password" not in fetched.text.lower()


async def _public(_host: str, _port: int) -> list[str]:
    return ["198.51.100.7"]
