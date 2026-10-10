import uuid

from app.worker.docker_runner import docker_run_command
from app.worker.runner import RunRequest


def test_docker_command_isolates_container_and_passes_callback_env() -> None:
    execution_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    cmd = docker_run_command(
        RunRequest(
            execution_id=execution_id,
            agent_id=agent_id,
            owner_user_sso="sso-me",
            callback_url="http://host.docker.internal:8000/api/v1/internal/executions/x/complete",
            callback_token="tok",
            agent_manifest={"title": "A", "system_prompt": "Be terse."},
            timeout_seconds=30,
            image="agent-platform-runner:local",
            openai_api_key="sk-secret-do-not-leak",
            openai_model="gpt-4o-mini",
        )
    )
    joined = " ".join(cmd)
    assert cmd[:3] == ["docker", "run", "--rm"]
    assert "--memory" in cmd and "--cpus" in cmd
    assert "--cap-drop" in cmd and "ALL" in cmd
    assert "--read-only" in cmd
    assert "host.docker.internal:host-gateway" in cmd
    assert "docker.sock" not in joined
    assert f"EXECUTION_ID={execution_id}" in cmd
    assert "CALLBACK_TOKEN=tok" in cmd
    assert "OPENAI_API_KEY=sk-secret-do-not-leak" in cmd
    assert "OPENAI_MODEL=gpt-4o-mini" in cmd
    assert "agent-platform-runner:local" == cmd[-1]
    manifest_flag = next(item for item in cmd if item.startswith("AGENT_MANIFEST="))
    assert "sk-secret" not in manifest_flag
    assert "Be terse." in manifest_flag


def test_docker_command_omits_openai_key_when_missing() -> None:
    cmd = docker_run_command(
        RunRequest(
            execution_id=uuid.uuid4(),
            agent_id=uuid.uuid4(),
            owner_user_sso="sso-me",
            callback_url="http://example.test/complete",
            callback_token="tok",
            agent_manifest={"title": "A"},
            timeout_seconds=30,
            image="agent-platform-runner:local",
        )
    )
    assert not any(item.startswith("OPENAI_API_KEY=") for item in cmd)
