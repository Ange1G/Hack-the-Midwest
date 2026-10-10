import pytest
from pydantic import ValidationError

from app.domains.agents.configurations import (
    SECRET_PLACEHOLDER,
    AgentConfigurations,
    split_secrets,
)

GET_CONTRACT = {"contractVersion": 1, "method": "GET", "URL": "https://api.example.com/items"}


def configurations(**overrides: object) -> AgentConfigurations:
    body: dict[str, object] = {"primitives": {"list_items": GET_CONTRACT}}
    body.update(overrides)
    return AgentConfigurations.model_validate(body)


def test_accepts_team_spec_shape() -> None:
    cfg = configurations(month=3, dayOfWeek=[1, 3, 5], timeOfDay=[540, 1020])
    assert cfg.month == 3
    assert cfg.day_of_week == [1, 3, 5]
    assert cfg.time_of_day == [540, 1020]
    assert set(cfg.primitives) == {"list_items"}


def test_schedule_fields_are_optional() -> None:
    cfg = AgentConfigurations.model_validate({})
    assert cfg.primitives == {}
    assert cfg.month is None
    assert cfg.day_of_week == [] and cfg.time_of_day == []


def test_schedule_lists_are_deduplicated_and_sorted() -> None:
    cfg = configurations(dayOfWeek=[5, 1, 5], timeOfDay=[1020, 540, 540])
    assert cfg.day_of_week == [1, 5]
    assert cfg.time_of_day == [540, 1020]


@pytest.mark.parametrize(
    "override",
    [
        {"month": 0},
        {"month": 13},
        {"dayOfWeek": [7]},
        {"dayOfWeek": [-1]},
        {"timeOfDay": [1440]},
        {"timeOfDay": [-5]},
        {"unknownKey": True},
        {"primitives": {"Bad Name": GET_CONTRACT}},
        {"primitives": {"1starts_with_digit": GET_CONTRACT}},
        {"primitives": {f"tool_{i}": GET_CONTRACT for i in range(21)}},
        {"primitives": {"bad": {**GET_CONTRACT, "URL": "http://localhost/"}}},
    ],
)
def test_rejects_invalid_configurations(override: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        configurations(**override)


def test_error_location_points_at_the_offending_contract_field() -> None:
    with pytest.raises(ValidationError) as exc:
        configurations(primitives={"fetch": {**GET_CONTRACT, "URL": "http://10.0.0.1/"}})
    locations = [err["loc"] for err in exc.value.errors()]
    assert ("primitives", "fetch", "URL") in locations


def test_split_secrets_masks_credentials_and_returns_them_separately() -> None:
    cfg = configurations(
        primitives={
            "create_issue": {
                "contractVersion": 1,
                "method": "POST",
                "URL": "https://api.example.com/issues",
                "payload": {"title": "x"},
                "xApiKey": "key-123",
                "authorizationHeader": "Bearer abc",
            },
            "list_items": GET_CONTRACT,
        },
        dayOfWeek=[1],
    )
    stored, secrets = split_secrets(cfg)

    assert stored["primitives"]["create_issue"]["xApiKey"] == SECRET_PLACEHOLDER
    assert stored["primitives"]["create_issue"]["authorizationHeader"] == SECRET_PLACEHOLDER
    assert "xApiKey" not in stored["primitives"]["list_items"]
    assert stored["dayOfWeek"] == [1]
    assert "key-123" not in repr(stored) and "Bearer abc" not in repr(stored)

    extracted = {(s.primitive_name, s.field_name): s.value for s in secrets}
    assert extracted == {
        ("create_issue", "xApiKey"): "key-123",
        ("create_issue", "authorizationHeader"): "Bearer abc",
    }


def test_split_secrets_without_credentials_returns_no_secrets() -> None:
    stored, secrets = split_secrets(configurations())
    assert secrets == []
    assert stored["primitives"]["list_items"]["URL"] == "https://api.example.com/items"


def test_placeholder_is_not_accepted_as_a_credential() -> None:
    with pytest.raises(ValidationError):
        configurations(primitives={"x": {**GET_CONTRACT, "xApiKey": SECRET_PLACEHOLDER}})
