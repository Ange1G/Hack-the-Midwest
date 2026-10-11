import uuid
from collections.abc import Collection
from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.auth import CurrentUser
from app.core.exceptions import AppError, ForbiddenError
from app.domains.agents.models import Agent
from app.domains.agents.schemas import AgentCreate
from app.domains.agents.service import AgentService

ME = CurrentUser(user_sso="sso-me")
MY_HTTP = uuid.uuid4()
MY_MCP = uuid.uuid4()
THEIR_HTTP = uuid.uuid4()


class RecordingRepository:
    def __init__(self) -> None:
        self.created: list[Agent] = []

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[Agent], int]:
        return [], 0

    async def create(self, agent: Agent) -> Agent:
        now = datetime.now(UTC)
        agent.id = uuid.uuid4()
        agent.created_at = now
        agent.updated_at = now
        self.created.append(agent)
        return agent


class FakeConnectors:
    """Connector ownership as the database would report it."""

    owned = {
        ("sso-me", MY_HTTP): "http",
        ("sso-me", MY_MCP): "mcp",
        ("sso-them", THEIR_HTTP): "http",
    }

    def __init__(self) -> None:
        self.calls: list[tuple[str, set[uuid.UUID]]] = []

    async def types_by_id(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, str]:
        self.calls.append((owner_user_sso, set(ids)))
        return {
            i: t for (owner, i), t in self.owned.items() if owner == owner_user_sso and i in ids
        }


def body(primitives: dict[str, Any] | None = None, **schedule: Any) -> AgentCreate:
    return AgentCreate.model_validate(
        {
            "agentTitle": "  Issue triager  ",
            "systemPrompt": "Triage new issues.",
            "configurations": {"primitives": primitives or {}, **schedule},
        }
    )


async def create(primitives: dict[str, Any] | None = None, **schedule: Any) -> tuple[Any, Any]:
    repo, connectors = RecordingRepository(), FakeConnectors()
    result = await AgentService(repo).create_agent(
        "sso-me", body(primitives, **schedule), caller=ME, connectors=connectors
    )
    return result, (repo, connectors)


async def test_creates_agent_with_own_connectors() -> None:
    result, (repo, connectors) = await create(
        {str(MY_HTTP): {}, str(MY_MCP): {"allowedTools": ["search_issues"]}}, dayOfWeek=[1]
    )
    assert result.title == "Issue triager"
    assert result.owner_user_sso == "sso-me"
    assert result.configurations["primitives"] == {
        str(MY_HTTP): {},
        str(MY_MCP): {"allowedTools": ["search_issues"]},
    }
    assert result.configurations["dayOfWeek"] == [1]
    assert repo.created[0].owner_user_sso == "sso-me"
    # Ownership is checked for the caller, not for anything in the request body.
    assert connectors.calls == [("sso-me", {MY_HTTP, MY_MCP})]


async def test_agent_without_primitives_skips_connector_lookup() -> None:
    _, (_, connectors) = await create()
    assert connectors.calls == []


async def test_forbidden_when_creating_for_another_user() -> None:
    repo = RecordingRepository()
    with pytest.raises(ForbiddenError):
        await AgentService(repo).create_agent(
            "sso-them", body(), caller=ME, connectors=FakeConnectors()
        )
    assert repo.created == []


@pytest.mark.parametrize(
    ("primitives", "message_part"),
    [
        ({str(uuid.uuid4()): {}}, "not found"),
        ({str(THEIR_HTTP): {}}, "not found"),  # someone else's: same answer as missing
        ({str(MY_MCP): {}}, "allowedTools"),
        ({str(MY_HTTP): {"allowedTools": ["x"]}}, "only to MCP"),
    ],
)
async def test_invalid_references_are_rejected(
    primitives: dict[str, Any], message_part: str
) -> None:
    repo = RecordingRepository()
    with pytest.raises(AppError) as exc:
        await AgentService(repo).create_agent(
            "sso-me", body(primitives), caller=ME, connectors=FakeConnectors()
        )
    assert exc.value.status_code == 422
    assert exc.value.code == "invalid_configuration"
    (connector_id,) = primitives
    error = exc.value.details["errors"][0]
    assert error["field"] == f"configurations.primitives.{connector_id}"
    assert message_part in error["message"]
    assert repo.created == []


async def test_invalid_shape_is_rejected_before_lookup() -> None:
    repo, connectors = RecordingRepository(), FakeConnectors()
    with pytest.raises(AppError) as exc:
        await AgentService(repo).create_agent(
            "sso-me", body(timeOfDay=[1440]), caller=ME, connectors=connectors
        )
    assert exc.value.status_code == 422
    assert exc.value.details["errors"][0]["field"].startswith("configurations.timeOfDay")
    assert connectors.calls == []


def test_request_body_accepts_title_aliases() -> None:
    for key in ("agentTitle", "agentTile", "title"):
        parsed = AgentCreate.model_validate({key: "A", "systemPrompt": "", "configurations": {}})
        assert parsed.title == "A"
