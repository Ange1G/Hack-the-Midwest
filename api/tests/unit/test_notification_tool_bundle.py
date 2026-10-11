import uuid
from datetime import UTC, datetime

import pytest

from app.core.secrets import SecretCipher
from app.domains.agents.models import Agent
from app.domains.connectors.models import Connector
from app.domains.connectors.repository import ConnectorWithSecrets
from app.worker.bundle import BundleBuildError, build_http_tool_bundle

NOTIFY_ID = uuid.uuid4()
SLACK_URL = "https://hooks.slack.com/services/T000/B000/secret-token"


def _agent() -> Agent:
    now = datetime.now(UTC)
    return Agent(
        id=uuid.uuid4(),
        title="Pager",
        system_prompt="Alert on failures",
        configurations={"primitives": {str(NOTIFY_ID): {}}},
        owner_user_sso="sso-me",
        created_at=now,
        updated_at=now,
    )


def _notification(ciphertexts: dict[str, str]) -> ConnectorWithSecrets:
    connector = Connector(
        id=NOTIFY_ID,
        owner_user_sso="sso-me",
        type="notification",
        name="slack_alerts",
        contract={
            "type": "notification",
            "name": "slack_alerts",
            "credentials": {"webhookUrl": "********"},
            "config": {"bodyParams": ["text"], "payload": {"username": "agent"}},
            "options": {"timeout": 3000},
        },
    )
    return ConnectorWithSecrets(connector, ciphertexts)


def test_notification_spec_carries_no_destination_url() -> None:
    cipher = SecretCipher(SecretCipher.generate_key())
    loaded = _notification({"webhookUrl": cipher.encrypt(SLACK_URL)})

    bundle = build_http_tool_bundle(_agent(), [loaded], cipher)

    assert bundle.tools == [
        {
            "id": str(NOTIFY_ID),
            "name": "slack_alerts",
            "kind": "notification",
            "method": "POST",
            "timeout_ms": 3000,
            "retries": 0,
            "body_params": ["text"],
            "payload": {"username": "agent"},
        }
    ]
    assert bundle.credentials == {str(NOTIFY_ID): {"webhookUrl": SLACK_URL}}
    assert "secret-token" not in str(bundle.tools)


def test_notification_without_stored_destination_fails_closed() -> None:
    with pytest.raises(BundleBuildError) as exc:
        build_http_tool_bundle(_agent(), [_notification({})], cipher=None)
    assert exc.value.code == "notification_destination_missing"
