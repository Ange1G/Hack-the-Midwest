import uuid
from urllib.parse import urlparse

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.domains.agents.models import Agent
from app.domains.connectors.models import Connector
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
            json={"status": "succeeded", "result": {"output": "ok", "model": "gpt-4o-mini"}},
            headers={"X-Execution-Callback-Token": request.callback_token},
        )
        return RunOutcome(
            exit_code=0 if response.is_success else 1,
            timed_out=False,
            runner_meta={"http_status": response.status_code},
        )


async def _seed(db_session: AsyncSession, allowed: list[str]) -> Agent:
    name = f"linear_{uuid.uuid4().hex[:8]}"
    connector = Connector(
        owner_user_sso=OWNER,
        type="mcp",
        name=name,
        contract={
            "type": "mcp",
            "contractVersion": 1,
            "name": name,
            "config": {
                "URL": "https://mcp.example.com/mcp",
                "transport": "streamableHttp",
            },
        },
    )
    db_session.add(connector)
    await db_session.flush()
    agent = Agent(
        title="MCP agent",
        system_prompt="Use Linear",
        configurations={
            "primitives": {str(connector.id): {"allowedTools": allowed}},
        },
        owner_user_sso=OWNER,
    )
    db_session.add(agent)
    await db_session.commit()
    await db_session.refresh(agent)
    return agent


async def test_worker_injects_allowlisted_mcp_tools(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _seed(db_session, ["list_issues", "create_issue"])
    enqueued = await client.post(
        f"/api/v1/agents/{OWNER}/{agent.id}/executions", headers=AUTH
    )
    assert enqueued.status_code == 202

    async def list_tools(url: str, headers: dict[str, str], timeout_s: float) -> list[str]:
        assert url == "https://mcp.example.com/mcp"
        return ["list_issues", "create_issue", "delete_issue"]

    runner = RecordingRunner(client)
    claimed = await process_once(
        get_session_factory(),
        runner,
        get_settings(),
        list_mcp_tools=list_tools,
    )
    assert claimed is True
    (request,) = runner.requests
    assert request.mcp_servers is not None
    assert request.mcp_servers[0]["tools"] == ["create_issue", "list_issues"]
    assert "delete_issue" not in request.mcp_servers[0]["tools"]


async def test_worker_fails_when_allowlisted_mcp_tool_is_missing(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _seed(db_session, ["list_issues", "wipe_workspace"])
    enqueued = await client.post(
        f"/api/v1/agents/{OWNER}/{agent.id}/executions", headers=AUTH
    )
    execution_id = enqueued.json()["data"]["id"]

    async def list_tools(url: str, headers: dict[str, str], timeout_s: float) -> list[str]:
        return ["list_issues"]

    runner = RecordingRunner(client)
    claimed = await process_once(
        get_session_factory(),
        runner,
        get_settings(),
        list_mcp_tools=list_tools,
    )
    assert claimed is False
    assert runner.requests == []

    fetched = await client.get(
        f"/api/v1/agents/{OWNER}/executions/{execution_id}", headers=AUTH
    )
    body = fetched.json()["data"]
    assert body["status"] == "failed"
    assert body["error_code"] == "mcp_tool_missing"
    assert "wipe_workspace" in body["error_message"]
