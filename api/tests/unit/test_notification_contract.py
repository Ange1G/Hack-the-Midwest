import copy

import pytest
from pydantic import ValidationError

from app.domains.primitives.base import SECRET_PLACEHOLDER
from app.domains.primitives.notification_contract import NotificationContract
from app.domains.primitives.registry import parse_contract, split_credentials

SLACK_URL = "https://hooks.slack.com/services/T000/B000/secret-token"

VALID = {
    "type": "notification",
    "contractVersion": 1,
    "name": "slack_alerts",
    "credentials": {"webhookUrl": SLACK_URL},
    "config": {"bodyParams": ["text"]},
}


def with_changes(path: str, value: object) -> dict[str, object]:
    body = copy.deepcopy(VALID)
    target = body
    *parents, last = path.split(".")
    for key in parents:
        target = target.setdefault(key, {})  # type: ignore[assignment]
    if value is ...:
        target.pop(last, None)  # type: ignore[union-attr]
    else:
        target[last] = value  # type: ignore[index]
    return body


def test_accepts_a_slack_style_contract() -> None:
    contract = parse_contract(
        {
            **VALID,
            "credentials": {"webhookUrl": SLACK_URL, "authorizationHeader": "Bearer t"},
            "config": {"bodyParams": ["text", "text"], "payload": {"username": "agent"}},
        }
    )
    assert isinstance(contract, NotificationContract)
    assert contract.config.body_params == ["text"]
    assert contract.config.payload == {"username": "agent"}


def test_destination_url_is_stored_as_a_secret() -> None:
    stored, secrets = split_credentials(parse_contract(VALID))
    assert stored["credentials"] == {"webhookUrl": SECRET_PLACEHOLDER}
    assert secrets == {"webhookUrl": SLACK_URL}
    assert "secret-token" not in repr(stored)


def test_credential_fields_include_the_webhook_url() -> None:
    assert NotificationContract.credential_fields() == (
        "webhookUrl",
        "xApiKey",
        "authorizationHeader",
    )


@pytest.mark.parametrize(
    ("path", "value", "reason"),
    [
        ("credentials", ..., "destination is required"),
        ("credentials.webhookUrl", ..., "destination is required"),
        ("credentials.webhookUrl", "ftp://example.com/x", "http/https only"),
        ("credentials.webhookUrl", "http://localhost:8000/hook", "SSRF: localhost"),
        ("credentials.webhookUrl", "https://10.0.0.5/hook", "SSRF: private range"),
        ("credentials.webhookUrl", "http://169.254.169.254/latest", "SSRF: metadata"),
        ("credentials.webhookUrl", SECRET_PLACEHOLDER, "placeholder is not a URL"),
        ("config.bodyParams", ..., "the model must be able to fill something"),
        ("config.bodyParams", [], "bodyParams must be non-empty"),
        ("config.bodyParams", ["t"] * 21, "bodyParams max 20"),
        ("config.bodyParams", ["not a key"], "bodyParams must be identifier-like"),
        ("config.payload", ["not", "an", "object"], "static payload is an object"),
        ("config.payload", {"text": "fixed"}, "model keys cannot shadow fixed keys"),
        ("config.payload", {"blob": "x" * 8001}, "payload size cap"),
        ("config.URL", "https://hooks.example.com/x", "URL belongs in credentials"),
        ("config.method", "GET", "POST only, no method field"),
        ("config.queryParams", ["q"], "no query params"),
    ],
)
def test_rejects_invalid_contracts(path: str, value: object, reason: str) -> None:
    with pytest.raises(ValidationError):
        NotificationContract.model_validate(with_changes(path, value))
