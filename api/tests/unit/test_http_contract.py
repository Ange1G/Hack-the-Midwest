import pytest
from pydantic import ValidationError

from app.domains.primitives.http_contract import HttpContract, HttpMethod

PUBLIC_URL = "https://api.example.com/v1/items"


def contract(**overrides: object) -> HttpContract:
    body: dict[str, object] = {"contractVersion": 1, "method": "GET", "URL": PUBLIC_URL}
    body.update(overrides)
    return HttpContract.model_validate(body)


def test_accepts_team_spec_shape() -> None:
    c = HttpContract.model_validate(
        {
            "contractVersion": 1,
            "method": "POST",
            "URL": PUBLIC_URL,
            "payload": {"title": "hello"},
            "xApiKey": "key-123",
            "authorizationHeader": "Bearer abc",
            "options": {"retries": 5, "timeout": 2500},
        }
    )
    assert c.method is HttpMethod.POST
    assert str(c.url) == PUBLIC_URL
    assert c.payload == {"title": "hello"}
    assert c.options is not None
    assert c.options.retries == 5
    assert c.options.timeout == 2500


def test_optional_fields_may_be_omitted_or_null() -> None:
    c = contract(payload=None, xApiKey=None, authorizationHeader=None, options=None)
    assert c.payload is None and c.options is None


def test_options_fields_may_be_null() -> None:
    c = contract(options={"retries": None, "timeout": None})
    assert c.options is not None
    assert c.options.retries is None and c.options.timeout is None


def test_serializes_with_team_spec_field_names() -> None:
    dumped = contract(xApiKey="k").model_dump(mode="json", by_alias=True, exclude_none=True)
    assert set(dumped) == {"contractVersion", "method", "URL", "xApiKey"}


def test_lowercase_url_key_is_also_accepted() -> None:
    c = HttpContract.model_validate({"contractVersion": 1, "method": "GET", "url": PUBLIC_URL})
    assert str(c.url) == PUBLIC_URL


@pytest.mark.parametrize(
    ("override", "reason"),
    [
        ({"method": "DELETE"}, "only GET and POST are supported"),
        ({"method": "get"}, "methods are uppercase"),
        ({"contractVersion": 2}, "unknown contract version"),
        ({"options": {"retries": 6}}, "retries max 5"),
        ({"options": {"retries": -1}}, "retries min 0"),
        ({"options": {"timeout": 50}}, "timeout min 100 ms"),
        ({"options": {"timeout": 60_001}}, "timeout max 60,000 ms"),
        ({"options": {"retry": 1}}, "unknown option"),
        ({"payload": {"q": 1}}, "GET cannot carry a payload"),
        ({"headers": {}}, "unknown field"),
        ({"URL": "ftp://example.com/file"}, "http/https only"),
        ({"URL": "http://localhost:8000/admin"}, "localhost"),
        ({"URL": "http://127.0.0.1/"}, "loopback"),
        ({"URL": "https://10.0.0.5/"}, "private range"),
        ({"URL": "https://192.168.1.10/"}, "private range"),
        ({"URL": "https://172.16.0.1/"}, "private range"),
        ({"URL": "http://169.254.169.254/latest/meta-data"}, "cloud metadata"),
        ({"URL": "https://[::1]/"}, "IPv6 loopback"),
        ({"URL": "https://db.internal/"}, "internal name"),
        ({"URL": "https://printer.local/"}, "mDNS name"),
        ({"URL": "https://intranet/"}, "single-label name"),
        ({"xApiKey": "x" * 4097}, "credential too long"),
    ],
)
def test_rejects_invalid_contracts(override: dict[str, object], reason: str) -> None:
    with pytest.raises(ValidationError):
        contract(**override)


def test_missing_required_fields_are_rejected() -> None:
    with pytest.raises(ValidationError) as exc:
        HttpContract.model_validate({})
    missing = {err["loc"][0] for err in exc.value.errors()}
    assert {"contractVersion", "method", "URL"} <= missing


def test_url_errors_carry_a_readable_message() -> None:
    with pytest.raises(ValidationError) as exc:
        contract(URL="http://10.0.0.1/")
    messages = [err["msg"] for err in exc.value.errors()]
    assert any("not allowed" in m for m in messages)
