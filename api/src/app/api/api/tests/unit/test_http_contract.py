import copy

import pytest
from pydantic import ValidationError

from app.domains.primitives.base import SECRET_PLACEHOLDER, BaseContract
from app.domains.primitives.http_contract import HttpContract, HttpMethod

PUBLIC_URL = "https://api.example.com/v1/items"

VALID = {
    "type": "http",
    "contractVersion": 1,
    "name": "list_items",
    "config": {"method": "GET", "URL": PUBLIC_URL},
}


def with_changes(path: str, value: object) -> dict[str, object]:
    """Copy of VALID with one dotted path set (or removed when value is ...)."""
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


def test_accepts_the_generic_shape() -> None:
    c = HttpContract.model_validate(
        {
            "type": "http",
            "contractVersion": 1,
            "name": "create_issue",
            "description": "Create an issue in the tracker",
            "options": {"retries": 5, "timeout": 2500},
            "credentials": {"xApiKey": "key-123", "authorizationHeader": "Bearer abc"},
            "config": {"method": "POST", "URL": PUBLIC_URL, "payload": {"title": "hi"}},
        }
    )
    assert isinstance(c, BaseContract)
    assert c.config.method is HttpMethod.POST
    assert str(c.config.url) == PUBLIC_URL
    assert c.config.payload == {"title": "hi"}
    assert c.credentials is not None and c.credentials.x_api_key == "key-123"
    assert c.options is not None and c.options.retries == 5


def test_optional_sections_may_be_omitted_or_null() -> None:
    c = HttpContract.model_validate(
        {**VALID, "description": None, "options": None, "credentials": None}
    )
    assert c.options is None and c.credentials is None


def test_serializes_with_spec_field_names() -> None:
    body = with_changes("credentials", {"xApiKey": "k"})
    dumped = HttpContract.model_validate(body).model_dump(
        mode="json", by_alias=True, exclude_none=True
    )
    assert set(dumped) == {"type", "contractVersion", "name", "credentials", "config"}
    assert set(dumped["config"]) == {"method", "URL"}
    assert dumped["credentials"] == {"xApiKey": "k"}


def test_credential_fields_are_the_credentials_section() -> None:
    assert HttpContract.credential_fields() == ("xApiKey", "authorizationHeader")


@pytest.mark.parametrize(
    ("path", "value", "reason"),
    [
        ("type", ..., "type is required"),
        ("type", "mcp", "wrong type for this contract"),
        ("contractVersion", ..., "version required"),
        ("contractVersion", 2, "unknown version"),
        ("name", ..., "name required"),
        ("name", "List Items", "name must be identifier-like"),
        ("name", "1items", "name must start with a letter"),
        ("description", "d" * 1001, "description max 1000"),
        ("options", {"retries": 6}, "retries max 5"),
        ("options", {"timeout": 60_001}, "timeout max 60000 ms"),
        ("options", {"timeout": 99}, "timeout min 100 ms"),
        ("options", {"retry": 1}, "unknown option"),
        ("config", ..., "config required"),
        ("config.method", "DELETE", "GET/POST only"),
        ("config.method", "get", "uppercase methods"),
        ("config.URL", ..., "URL required"),
        ("config.URL", "ftp://example.com/x", "http/https only"),
        ("config.URL", "http://localhost:8000", "SSRF: localhost"),
        ("config.URL", "https://10.0.0.5/", "SSRF: private range"),
        ("config.URL", "http://169.254.169.254/latest", "SSRF: cloud metadata"),
        ("config.URL", "https://[::1]/", "SSRF: IPv6 loopback"),
        ("config.URL", "https://db.internal/", "SSRF: internal name"),
        ("config.URL", "https://intranet/", "SSRF: single-label name"),
        ("config.payload", {"q": 1}, "GET cannot carry a payload"),
        ("config.headers", {}, "unknown config field"),
        ("credentials", {"password": "x"}, "unknown credential field"),
        ("credentials", {"xApiKey": ""}, "empty credential"),
        ("credentials", {"xApiKey": "x" * 4097}, "credential too long"),
        ("credentials", {"xApiKey": SECRET_PLACEHOLDER}, "placeholder is not a credential"),
        ("method", "GET", "flat HTTP fields belong in config"),
    ],
)
def test_rejects_invalid_contracts(path: str, value: object, reason: str) -> None:
    with pytest.raises(ValidationError):
        HttpContract.model_validate(with_changes(path, value))


def test_url_error_message_is_readable() -> None:
    with pytest.raises(ValidationError) as exc:
        HttpContract.model_validate(with_changes("config.URL", "http://10.0.0.1/"))
    assert any("not allowed" in err["msg"] for err in exc.value.errors())
