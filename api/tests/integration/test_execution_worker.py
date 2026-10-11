from urllib.parse import urlparse

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.domains.agents.models import Agent
from app.worker.loop import process_once
from app.worker.runner import RunOutcome, RunRequest

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}


class FakeCallbackRunner:
    def __init__(self, client: AsyncClient) -> None:
        self._client = client
        self.run_inputs: list[str | None] = []

    async def run(self, request: RunRequest) -> RunOutcome:
        self.run_inputs.append(request.run_input)
        assert request.openai_api_key
        assert "sk-" not in request.agent_manifest.get("system_prompt", "")
        assert request.http_tools == []
        assert not request.http_credentials
        path = urlparse(request.callback_url).path
        response = await self._client.post(
            path,
            json={
                "status": "succeeded",
                "result": {
                    "output": "model said this",
                    "model": request.openai_model,
                },
            },
            headers={"X-Execution-Callback-Token": request.callback_token},
        )
        return RunOutcome(
            exit_code=0 if response.is_success else 1,
            timed_out=False,
            runner_meta={"http_status": response.status_code},
        )


async def test_worker_with_fake_runner_marks_succeeded(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = Agent(
        title="Digest",
        system_prompt="Summarize",
        configurations={"primitives": {}},
        owner_user_sso=OWNER,
    )
    db_session.add(agent)
    await db_session.commit()
    await db_session.refresh(agent)

    enqueued = await client.post(
        f"/api/v1/agents/{OWNER}/{agent.id}/executions", headers=AUTH
    )
    assert enqueued.status_code == 202, enqueued.text
    execution_id = enqueued.json()["data"]["id"]

    claimed = await process_once(
        get_session_factory(), FakeCallbackRunner(client), get_settings()
    )
    assert claimed is True

    fetched = await client.get(
        f"/api/v1/agents/{OWNER}/executions/{execution_id}", headers=AUTH
    )
    body = fetched.json()["data"]
    assert body["status"] == "succeeded"
    assert body["result"]["output"] == "model said this"
    assert "sk-" not in fetched.text
    assert body["runner_meta"]["http_status"] == 200
    assert "input" not in (body["result"] or {})


async def test_worker_passes_run_input_to_runner(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = Agent(
        title="Digest",
        system_prompt="Summarize",
        configurations={"primitives": {}},
        owner_user_sso=OWNER,
    )
    db_session.add(agent)
    await db_session.commit()
    await db_session.refresh(agent)

    enqueued = await client.post(
        f"/api/v1/agents/{OWNER}/{agent.id}/executions",
        headers=AUTH,
        json={"input": "Focus on P1 tickets"},
    )
    assert enqueued.status_code == 202
    runner = FakeCallbackRunner(client)
    claimed = await process_once(get_session_factory(), runner, get_settings())
    assert claimed is True
    assert runner.run_inputs == ["Focus on P1 tickets"]
    fetched = await client.get(
        f"/api/v1/agents/{OWNER}/executions/{enqueued.json()['data']['id']}",
        headers=AUTH,
    )
    assert fetched.json()["data"]["status"] == "succeeded"
    assert "Focus on P1 tickets" not in str(fetched.json()["data"]["result"])
