from typing import Any
from urllib.parse import urlparse

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.domains.agents.models import Agent
from app.domains.connectors.models import Connector
from app.domains.knowledge.models import KnowledgeDocument
from app.domains.memory.models import AgentMemory
from app.worker.loop import process_once
from app.worker.runner import RunOutcome, RunRequest

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}


class RecordingRunner:
    def __init__(self, client: AsyncClient, callback: dict[str, Any] | None = None) -> None:
        self.requests: list[RunRequest] = []
        self._client = client
        self._callback = callback or {"status": "succeeded", "result": {"output": "ok"}}

    async def run(self, request: RunRequest) -> RunOutcome:
        self.requests.append(request)
        response = await self._client.post(
            urlparse(request.callback_url).path,
            json=self._callback,
            headers={"X-Execution-Callback-Token": request.callback_token},
        )
        return RunOutcome(exit_code=0 if response.is_success else 1, timed_out=False)


def _connector(name: str, type_: str, config: dict[str, Any]) -> Connector:
    return Connector(
        owner_user_sso=OWNER,
        type=type_,
        name=name,
        contract={"type": type_, "contractVersion": 1, "name": name, "config": config},
    )


async def _agent(db: AsyncSession, title: str, configurations: dict[str, Any]) -> Agent:
    agent = Agent(
        title=title, system_prompt=f"{title} prompt", configurations=configurations,
        owner_user_sso=OWNER,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


async def _run(client: AsyncClient, agent: Agent, runner: RecordingRunner, **kwargs: Any) -> dict:
    enqueued = await client.post(f"/api/v1/agents/{OWNER}/{agent.id}/executions", headers=AUTH)
    assert enqueued.status_code == 202
    # Returns False when the claim fails closed before a container would start.
    await process_once(get_session_factory(), runner, get_settings(), **kwargs)
    fetched = await client.get(
        f"/api/v1/agents/{OWNER}/executions/{enqueued.json()['data']['id']}", headers=AUTH
    )
    return fetched.json()["data"]


async def test_plain_agent_has_no_run_context(client: AsyncClient, db_session: AsyncSession) -> None:
    agent = await _agent(db_session, "Plain", {"primitives": {}})
    runner = RecordingRunner(client)
    await _run(client, agent, runner)
    assert runner.requests[0].run_context is None


async def test_knowledge_memory_and_delegates_reach_the_runner(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    runbooks = _connector("runbooks", "knowledge", {"maxResults": 2})
    helper_kb = _connector("helper_kb", "knowledge", {"maxResults": 5})
    search = _connector(
        "web_search", "mcp", {"URL": "https://mcp.example.com/mcp", "transport": "streamableHttp"}
    )
    status = _connector(
        "status_api", "http", {"method": "GET", "URL": "https://status.example.com/api"}
    )
    db_session.add_all([runbooks, helper_kb, search, status])
    await db_session.flush()
    db_session.add_all(
        [
            KnowledgeDocument(
                connector_id=runbooks.id, owner_user_sso=OWNER, title="Pager",
                body="Escalate after 15 minutes.", size_bytes=26,
            ),
            KnowledgeDocument(
                connector_id=helper_kb.id, owner_user_sso=OWNER, title="Style",
                body="Cite sources.", size_bytes=13,
            ),
        ]
    )
    await db_session.commit()
    helper = await _agent(
        db_session,
        "Web Researcher",
        {
            "primitives": {
                str(search.id): {"allowedTools": ["search"]},
                str(helper_kb.id): {},
            }
        },
    )
    lead = await _agent(
        db_session,
        "Lead",
        {
            "primitives": {str(runbooks.id): {}, str(status.id): {}},
            "memory": True,
            "delegates": [str(helper.id)],
        },
    )
    db_session.add(AgentMemory(agent_id=lead.id, owner_user_sso=OWNER, key="last", value="v1"))
    await db_session.commit()

    async def list_tools(url: str, headers: dict[str, str], timeout_s: float) -> list[str]:
        return ["search", "admin_delete"]

    runner = RecordingRunner(client)
    execution = await _run(client, lead, runner, list_mcp_tools=list_tools)
    assert execution["status"] == "succeeded"

    request = runner.requests[0]
    context = request.run_context
    assert context is not None
    assert context["knowledge_ids"] == [str(runbooks.id)]
    by_id = {entry["id"]: entry for entry in context["knowledge"]}
    assert set(by_id) == {str(runbooks.id), str(helper_kb.id)}
    assert by_id[str(runbooks.id)]["max_results"] == 2
    assert by_id[str(runbooks.id)]["documents"][0]["body"] == "Escalate after 15 minutes."
    assert context["memory"] == {"entries": {"last": "v1"}}

    [delegate] = context["delegates"]
    assert delegate["tool_name"] == "ask_web_researcher"
    assert delegate["system_prompt"] == "Web Researcher prompt"
    assert delegate["knowledge_ids"] == [str(helper_kb.id)]
    assert [s["tools"] for s in delegate["mcp_servers"]] == [["search"]]
    assert delegate["http_tools"] == []
    # The parent's own tools are unchanged by delegation.
    assert [t["name"] for t in request.http_tools or []] == ["status_api"]
    assert request.mcp_servers == []


async def test_deleted_delegate_fails_closed(client: AsyncClient, db_session: AsyncSession) -> None:
    helper = await _agent(db_session, "Helper", {"primitives": {}})
    lead = await _agent(db_session, "Lead", {"primitives": {}, "delegates": [str(helper.id)]})
    await db_session.delete(helper)
    await db_session.commit()
    runner = RecordingRunner(client)
    execution = await _run(client, lead, runner)
    assert execution["status"] == "failed"
    assert execution["error_code"] == "delegate_missing"
    assert runner.requests == []


async def test_delegate_with_database_connector_fails_closed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    database = _connector("orders", "database", {"mode": "external"})
    db_session.add(database)
    await db_session.flush()
    helper = await _agent(db_session, "Analyst", {"primitives": {str(database.id): {}}})
    lead = await _agent(db_session, "Lead", {"primitives": {}, "delegates": [str(helper.id)]})
    runner = RecordingRunner(client)
    execution = await _run(client, lead, runner)
    assert execution["status"] == "failed"
    assert execution["error_code"] == "delegate_unsupported"
