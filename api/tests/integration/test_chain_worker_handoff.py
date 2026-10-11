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
CHAINS = f"/api/v1/chains/{OWNER}"

STEP_A_RESULT = {
    "output": "line1\nline2",
    "model": "gpt-4o-mini",
    "tool_calls": [
        {
            "name": "fetch",
            "status": "HTTP 200",
            "response_body": '{"name":"ditto"}',
        }
    ],
}


class RecordingCallbackRunner:
    def __init__(self, client: AsyncClient) -> None:
        self._client = client
        self.run_inputs: list[str | None] = []
        self._calls = 0

    async def run(self, request: RunRequest) -> RunOutcome:
        self._calls += 1
        self.run_inputs.append(request.run_input)
        path = urlparse(request.callback_url).path
        result = STEP_A_RESULT if self._calls == 1 else {"output": "xml-from-b", "model": request.openai_model}
        response = await self._client.post(
            path,
            json={"status": "succeeded", "result": result},
            headers={"X-Execution-Callback-Token": request.callback_token},
        )
        return RunOutcome(
            exit_code=0 if response.is_success else 1,
            timed_out=False,
            runner_meta={"http_status": response.status_code},
        )


async def test_worker_two_step_chain_passes_handoff_to_second_run(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    first = Agent(
        title="A",
        system_prompt="Fetch",
        configurations={"primitives": {}},
        owner_user_sso=OWNER,
    )
    second = Agent(
        title="B",
        system_prompt="Transform",
        configurations={"primitives": {}},
        owner_user_sso=OWNER,
    )
    db_session.add_all([first, second])
    await db_session.commit()
    await db_session.refresh(first)
    await db_session.refresh(second)

    created = await client.post(
        CHAINS,
        headers=AUTH,
        json={
            "title": "Pipeline",
            "steps": [{"agent_id": str(first.id)}, {"agent_id": str(second.id)}],
        },
    )
    assert created.status_code == 201, created.text
    chain_id = created.json()["data"]["id"]

    started = await client.post(f"{CHAINS}/{chain_id}/runs", headers=AUTH)
    assert started.status_code == 202, started.text
    run_id = started.json()["data"]["id"]

    runner = RecordingCallbackRunner(client)
    factory = get_session_factory()
    settings = get_settings()
    assert await process_once(factory, runner, settings) is True
    assert await process_once(factory, runner, settings) is True

    assert len(runner.run_inputs) == 2
    second_input = runner.run_inputs[1]
    assert second_input is not None
    assert "Previous step output:\nline1\nline2" in second_input
    assert '{"name":"ditto"}' in second_input

    finished = await client.get(f"{CHAINS}/runs/{run_id}", headers=AUTH)
    assert finished.json()["data"]["status"] == "succeeded"
    assert finished.json()["data"]["final_result"]["output"] == "xml-from-b"
