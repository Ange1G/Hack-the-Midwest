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
            http_tools=[
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "name": "list_issues",
                    "method": "GET",
                    "URL": "https://api.example.com/issues",
                }
            ],
            http_credentials={"11111111-1111-1111-1111-111111111111": {"xApiKey": "key-live"}},
            database_tools=[
                {
                    "id": "22222222-2222-2222-2222-222222222222",
                    "name": "orders_db",
                    "engine": "postgres",
                    "host": "host.docker.internal",
                    "port": 49001,
                }
            ],
            database_credentials={
                "22222222-2222-2222-2222-222222222222": {"password": "db-secret"}
            },
            mcp_servers=[
                {
                    "id": "33333333-3333-3333-3333-333333333333",
                    "name": "linear",
                    "URL": "https://mcp.example.com/mcp",
                    "tools": ["list_issues"],
                }
            ],
            mcp_credentials={
                "33333333-3333-3333-3333-333333333333": {
                    "authorizationHeader": "Bearer mcp-secret"
                }
            },
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
    tools_flag = next(item for item in cmd if item.startswith("HTTP_TOOLS_JSON="))
    creds_flag = next(item for item in cmd if item.startswith("HTTP_CREDENTIALS_JSON="))
    db_tools_flag = next(item for item in cmd if item.startswith("DATABASE_TOOLS_JSON="))
    db_creds_flag = next(item for item in cmd if item.startswith("DATABASE_CREDENTIALS_JSON="))
    assert "sk-secret" not in manifest_flag
    assert "key-live" not in manifest_flag
    assert "key-live" not in tools_flag
    assert "Be terse." in manifest_flag
    assert "https://api.example.com/issues" in tools_flag
    assert "key-live" in creds_flag
    assert "orders_db" in db_tools_flag
    assert "db-secret" not in db_tools_flag
    assert "db-secret" not in manifest_flag
    assert "db-secret" in db_creds_flag
    mcp_flag = next(item for item in cmd if item.startswith("MCP_SERVERS_JSON="))
    mcp_creds_flag = next(item for item in cmd if item.startswith("MCP_CREDENTIALS_JSON="))
    assert "list_issues" in mcp_flag
    assert "mcp-secret" not in mcp_flag
    assert "mcp-secret" not in manifest_flag
    assert "mcp-secret" in mcp_creds_flag


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


def test_docker_command_mounts_ssl_ca_bundle_when_set() -> None:
    bundle_path = "/home/user/mac-ca.pem"
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
            ssl_ca_bundle=bundle_path,
        )
    )
    joined = " ".join(cmd)
    # Volume mount present
    assert "-v" in cmd
    mount_idx = cmd.index("-v")
    assert cmd[mount_idx + 1] == f"{bundle_path}:/tmp/ca-bundle.pem:ro"
    # SSL_CERT_FILE env var injected
    assert "SSL_CERT_FILE=/tmp/ca-bundle.pem" in cmd
    # Image is still last
    assert cmd[-1] == "agent-platform-runner:local"
    # Bundle path does not appear as a secret in env positions
    assert joined.count(bundle_path) == 1  # only in the -v flag, not duplicated


def test_docker_command_no_ssl_ca_bundle_by_default() -> None:
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
    assert "-v" not in cmd
    assert not any(item.startswith("SSL_CERT_FILE=") for item in cmd)
