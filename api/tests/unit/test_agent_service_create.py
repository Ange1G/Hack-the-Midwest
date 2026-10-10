import uuid
from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.auth import CurrentUser
from app.core.exceptions import AppError, ForbiddenError
from app.core.secrets import SecretCipher
from app.domains.agents.configurations import SECRET_PLACEHOLDER
from app.domains.agents.models import Agent, AgentSecret
from app.domains.agents.schemas import AgentCreate
from app.domains.agents.service import AgentService


class RecordingRepository:
    """Stands in for the database: records what the service asks it to persist."""

    def __init__(self) -> None:
        self.created: list[tuple[Agent, list[AgentSecret]]] = []

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[Agent], int]:
        return [], 0

    async def create(self, agent: Agent, secrets: list[AgentSecret]) -> Agent:
        now = datetime.now(UTC)
        agent.id = uuid.uuid4()
        agent.created_at = now
        agent.updated_at = now
        self.created.append((agent, secrets))
        return agent


ME = CurrentUser(user_sso="sso-me")


def body(configurations: dict[str, Any] | None = None) -> AgentCreate:
    return AgentCreate.model_validate(
        {
            "agentTitle": "  Issue triager  ",
            "systemPrompt": "Triage new issues.",
            "configurations": configurations if configurations is not None else {},
        }
    )


async def test_creates_agent_owned_by_caller() -> None:
    repo = RecordingRepository()
    result = await AgentService(repo).create_agent("sso-me", body(), caller=ME, cipher=None)

    assert result.title == "Issue triager"
    assert result.owner_user_sso == "sso-me"
    assert result.system_prompt == "Triage new issues."
    agent, secrets = repo.created[0]
    assert agent.owner_user_sso == "sso-me"
    assert secrets == []


async def test_forbidden_when_caller_creates_for_another_user() -> None:
    repo = RecordingRepository()
    with pytest.raises(ForbiddenError):
        await AgentService(repo).create_agent("sso-other", body(), caller=ME, cipher=None)
    assert repo.created == []


async def test_invalid_configuration_raises_app_error_with_field_paths() -> None:
    repo = RecordingRepository()
    bad = {"primitives": {"fetch": {"contractVersion": 1, "method": "GET", "URL": "http://10.0.0.1"}}}

    with pytest.raises(AppError) as exc:
        await AgentService(repo).create_agent("sso-me", body(bad), caller=ME, cipher=None)

    assert exc.value.status_code == 422
    assert exc.value.code == "invalid_configuration"
    fields = [e["field"] for e in exc.value.details["errors"]]
    assert "configurations.primitives.fetch.URL" in fields
    assert repo.created == []


async def test_error_details_never_echo_submitted_values() -> None:
    repo = RecordingRepository()
    bad = {
        "primitives": {
            "fetch": {
                "contractVersion": 1,
                "method": "GET",
                "URL": "https://api.example.com",
                "xApiKey": "s" * 5000,
            }
        }
    }
    with pytest.raises(AppError) as exc:
        await AgentService(repo).create_agent("sso-me", body(bad), caller=ME, cipher=None)
    assert "sss" not in repr(exc.value.details)


async def test_credentials_are_encrypted_and_masked() -> None:
    repo = RecordingRepository()
    cipher = SecretCipher(SecretCipher.generate_key())
    cfg = {
        "primitives": {
            "create_issue": {
                "contractVersion": 1,
                "method": "POST",
                "URL": "https://api.example.com/issues",
                "xApiKey": "key-123",
            }
        }
    }

    result = await AgentService(repo).create_agent("sso-me", body(cfg), caller=ME, cipher=cipher)

    assert result.configurations["primitives"]["create_issue"]["xApiKey"] == SECRET_PLACEHOLDER
    agent, secrets = repo.created[0]
    assert "key-123" not in repr(agent.configurations)
    assert len(secrets) == 1
    assert secrets[0].primitive_name == "create_issue"
    assert secrets[0].field_name == "xApiKey"
    assert secrets[0].ciphertext != "key-123"
    assert cipher.decrypt(secrets[0].ciphertext) == "key-123"


async def test_credentials_without_encryption_key_are_refused() -> None:
    repo = RecordingRepository()
    cfg = {
        "primitives": {
            "create_issue": {
                "contractVersion": 1,
                "method": "POST",
                "URL": "https://api.example.com/issues",
                "authorizationHeader": "Bearer abc",
            }
        }
    }
    with pytest.raises(AppError) as exc:
        await AgentService(repo).create_agent("sso-me", body(cfg), caller=ME, cipher=None)
    assert exc.value.status_code == 503
    assert exc.value.code == "secret_storage_unavailable"
    assert repo.created == []


def test_request_body_accepts_title_aliases() -> None:
    for key in ("agentTitle", "agentTile", "title"):
        parsed = AgentCreate.model_validate({key: "A", "systemPrompt": "", "configurations": {}})
        assert parsed.title == "A"
