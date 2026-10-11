import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.domains.agents.configurations import AgentConfigurations
from app.domains.agents.models import Agent
from app.domains.executions.service import agent_manifest

SCHEMA = {
    "type": "object",
    "required": ["summary"],
    "properties": {"summary": {"type": "string"}, "tags": {"$ref": "#/$defs/tags"}},
    "$defs": {"tags": {"type": "array", "items": {"type": "string"}}},
}


def test_accepts_a_json_schema_and_round_trips_it() -> None:
    config = AgentConfigurations.model_validate({"outputSchema": SCHEMA})
    assert config.output_schema == SCHEMA
    dumped = config.model_dump(mode="json", by_alias=True, exclude_none=True)
    assert dumped["outputSchema"] == SCHEMA


def test_schema_is_optional_and_omitted_when_unset() -> None:
    dumped = AgentConfigurations.model_validate({}).model_dump(
        mode="json", by_alias=True, exclude_none=True
    )
    assert "outputSchema" not in dumped


@pytest.mark.parametrize(
    ("schema", "reason"),
    [
        ({"type": "not-a-type"}, "invalid JSON Schema keyword value"),
        ({"required": "summary"}, "required must be an array"),
        ({"$ref": "https://example.com/schema.json"}, "remote $ref would fetch"),
        ({"properties": {"a": {"$ref": "file:///etc/passwd"}}}, "nested remote $ref"),
        ({"description": "x" * 16_001}, "size cap"),
        (["not", "an", "object"], "schema must be an object"),
    ],
)
def test_rejects_unusable_schemas(schema: object, reason: str) -> None:
    with pytest.raises(ValidationError):
        AgentConfigurations.model_validate({"outputSchema": schema})


def test_manifest_carries_the_schema_to_the_runner() -> None:
    now = datetime.now(UTC)
    agent = Agent(
        id=uuid.uuid4(),
        title="Triage",
        system_prompt="Classify",
        configurations={"primitives": {}, "outputSchema": SCHEMA},
        owner_user_sso="sso-me",
        created_at=now,
        updated_at=now,
    )
    assert agent_manifest(agent)["output_schema"] == SCHEMA


def test_manifest_without_schema_has_no_key() -> None:
    now = datetime.now(UTC)
    agent = Agent(
        id=uuid.uuid4(),
        title="Digest",
        system_prompt="Summarize",
        configurations={"primitives": {}},
        owner_user_sso="sso-me",
        created_at=now,
        updated_at=now,
    )
    assert "output_schema" not in agent_manifest(agent)
