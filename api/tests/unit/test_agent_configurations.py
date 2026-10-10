import uuid

import pytest
from pydantic import ValidationError

from app.common.validation_errors import describe_validation_errors
from app.domains.agents.configurations import AgentConfigurations

HTTP_ID = str(uuid.uuid4())
MCP_ID = str(uuid.uuid4())


def configurations(**overrides: object) -> AgentConfigurations:
    body: dict[str, object] = {"primitives": {HTTP_ID: {}}}
    body.update(overrides)
    return AgentConfigurations.model_validate(body)


def test_accepts_team_spec_shape_with_connector_references() -> None:
    cfg = configurations(
        primitives={HTTP_ID: {}, MCP_ID: {"allowedTools": ["search_issues", "get_issue"]}},
        month=3,
        dayOfWeek=[1, 3, 5],
        timeOfDay=[540, 1020],
    )
    assert set(cfg.primitives) == {uuid.UUID(HTTP_ID), uuid.UUID(MCP_ID)}
    assert cfg.primitives[uuid.UUID(MCP_ID)].allowed_tools == ["search_issues", "get_issue"]
    assert cfg.month == 3
    assert cfg.day_of_week == [1, 3, 5]
    assert cfg.time_of_day == [540, 1020]


def test_everything_is_optional() -> None:
    cfg = AgentConfigurations.model_validate({})
    assert cfg.primitives == {}
    assert cfg.month is None and cfg.day_of_week == [] and cfg.time_of_day == []


def test_schedule_lists_are_deduplicated_and_sorted() -> None:
    cfg = configurations(dayOfWeek=[5, 1, 5], timeOfDay=[1020, 540, 540])
    assert cfg.day_of_week == [1, 5]
    assert cfg.time_of_day == [540, 1020]


def test_allowed_tools_are_deduplicated_preserving_order_and_case() -> None:
    cfg = configurations(primitives={MCP_ID: {"allowedTools": ["b", "a", "b", "A"]}})
    assert cfg.primitives[uuid.UUID(MCP_ID)].allowed_tools == ["b", "a", "A"]


def test_stored_form_uses_spec_names_and_string_ids() -> None:
    cfg = configurations(
        primitives={HTTP_ID: {}, MCP_ID: {"allowedTools": ["search"]}}, dayOfWeek=[1]
    )
    stored = cfg.model_dump(mode="json", by_alias=True, exclude_none=True)
    assert stored == {
        "primitives": {HTTP_ID: {}, MCP_ID: {"allowedTools": ["search"]}},
        "dayOfWeek": [1],
        "timeOfDay": [],
    }


@pytest.mark.parametrize(
    "override",
    [
        {"month": 0},
        {"month": 13},
        {"dayOfWeek": [7]},
        {"timeOfDay": [1440]},
        {"unknownKey": True},
        {"primitives": {"not-a-uuid": {}}},
        {"primitives": {HTTP_ID: {"unknown": 1}}},
        {"primitives": {MCP_ID: {"allowedTools": []}}},
        {"primitives": {MCP_ID: {"allowedTools": ["has space"]}}},
        {"primitives": {MCP_ID: {"allowedTools": ["*"]}}},
        {"primitives": {MCP_ID: {"allowedTools": ["x" * 129]}}},
        {"primitives": {str(uuid.uuid4()): {} for _ in range(21)}},
        {"primitives": {HTTP_ID: {"type": "http", "config": {}}}},
    ],
)
def test_rejects_invalid_configurations(override: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        configurations(**override)


def test_error_paths_point_at_the_offending_field() -> None:
    with pytest.raises(ValidationError) as exc:
        configurations(primitives={MCP_ID: {"allowedTools": []}})
    fields = [e["field"] for e in describe_validation_errors(exc.value, prefix="configurations")]
    assert fields == [f"configurations.primitives.{MCP_ID}.allowedTools"]
