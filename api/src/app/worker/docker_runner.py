import asyncio
import json
import subprocess

from app.worker.runner import RunOutcome, RunRequest

CONTAINER_MEMORY = "256m"
CONTAINER_CPUS = "0.5"


def docker_run_command(request: RunRequest) -> list[str]:
    name = container_name(request.execution_id)
    env = [
        f"EXECUTION_ID={request.execution_id}",
        f"AGENT_ID={request.agent_id}",
        f"CALLBACK_URL={request.callback_url}",
        f"CALLBACK_TOKEN={request.callback_token}",
        f"AGENT_MANIFEST={json.dumps(request.agent_manifest)}",
        f"OPENAI_MODEL={request.openai_model}",
        "HOME=/tmp",
    ]
    if request.openai_api_key:
        env.append(f"OPENAI_API_KEY={request.openai_api_key}")
    if request.http_tools is not None:
        env.append(f"HTTP_TOOLS_JSON={json.dumps(request.http_tools)}")
    if request.http_credentials:
        env.append(f"HTTP_CREDENTIALS_JSON={json.dumps(request.http_credentials)}")
    if request.database_tools is not None:
        env.append(f"DATABASE_TOOLS_JSON={json.dumps(request.database_tools)}")
    if request.database_credentials:
        env.append(f"DATABASE_CREDENTIALS_JSON={json.dumps(request.database_credentials)}")
    # When a CA bundle is configured on the host, mount it read-only into the
    # container at a fixed path and tell Python/httpx to use it via SSL_CERT_FILE.
    # This is needed on hosts that perform TLS interception or that have private
    # CA roots not present in the base image (e.g. Zscaler, Netskope, corp PKI).
    # In production without TLS inspection, leave EXECUTION_SSL_CA_BUNDLE unset.
    _ca_bundle_container_path = "/tmp/ca-bundle.pem"
    volume_args: list[str] = []
    if request.ssl_ca_bundle:
        env.append(f"SSL_CERT_FILE={_ca_bundle_container_path}")
        volume_args = ["-v", f"{request.ssl_ca_bundle}:{_ca_bundle_container_path}:ro"]
    command = [
        "docker",
        "run",
        "--rm",
        "--name",
        name,
        "--memory",
        CONTAINER_MEMORY,
        "--cpus",
        CONTAINER_CPUS,
        "--read-only",
        "--tmpfs",
        "/tmp",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--add-host",
        "host.docker.internal:host-gateway",
    ]
    command.extend(volume_args)
    for item in env:
        command.extend(["-e", item])
    command.append(request.image)
    return command


def container_name(execution_id: object) -> str:
    return f"agent-exec-{execution_id}"


class LocalDockerRunner:
    async def run(self, request: RunRequest) -> RunOutcome:
        cmd = docker_run_command(request)
        try:
            completed = await asyncio.to_thread(
                subprocess.run,
                cmd,
                capture_output=True,
                text=True,
                timeout=request.timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired:
            await asyncio.to_thread(_force_remove, container_name(request.execution_id))
            return RunOutcome(
                exit_code=None,
                timed_out=True,
                runner_meta={"image": request.image, "timed_out": True},
            )
        except FileNotFoundError:
            return RunOutcome(
                exit_code=127,
                timed_out=False,
                runner_meta={"image": request.image, "error": "docker_unavailable"},
            )
        return RunOutcome(
            exit_code=completed.returncode,
            timed_out=False,
            runner_meta={
                "image": request.image,
                "exit_code": completed.returncode,
            },
        )


def _force_remove(name: str) -> None:
    subprocess.run(
        ["docker", "rm", "-f", name],
        capture_output=True,
        text=True,
        check=False,
    )
