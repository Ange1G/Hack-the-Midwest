"""Starts databases for agents as Docker containers.

This is trusted platform code, run by the worker (or the databases CLI). Agents never
get Docker access; they receive connection details only.

Each container is labelled with the agent and connector it belongs to, limited in
memory, CPU and processes, started with no-new-privileges, and reachable only on the
host's loopback interface or on an internal Docker network. Secrets are handed to the
Docker CLI through its environment (`--env NAME` without a value), never as arguments.
"""

import asyncio
import secrets
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Literal, Protocol

from app.core.config import Settings
from app.domains.primitives.database_contract import Engine
from app.runtime.commands import CommandResult, CommandRunner, SubprocessRunner

Lifecycle = Literal["agent", "run"]

LABEL_MANAGED = "constitution.managed"
LABEL_AGENT = "constitution.agent"
LABEL_CONNECTOR = "constitution.connector"
LABEL_LIFECYCLE = "constitution.lifecycle"
LABEL_ENGINE = "constitution.engine"
MANAGED_DATABASE = "database"

CPUS = "1"
PIDS_LIMIT = "256"
RUN_TIMEOUT_S = 600  # first use of an image includes pulling it
COMMAND_TIMEOUT_S = 60
READY_CHECK_TIMEOUT_S = 15
READY_POLL_INTERVAL_S = 1.0


class ProvisioningError(Exception):
    """A database could not be started. Messages never contain credentials."""


@dataclass(frozen=True)
class ProvisionRequest:
    agent_id: uuid.UUID
    connector_id: uuid.UUID
    engine: Engine
    version: str
    database: str | None
    username: str | None
    password: str = field(repr=False)
    # Engine superuser where it differs from `username` (mysql root). Never given to agents.
    admin_password: str = field(repr=False)
    lifecycle: Lifecycle = "agent"
    memory_mb: int = 512


@dataclass(frozen=True)
class ProvisionedDatabase:
    container: str
    host: str
    port: int
    lifecycle: Lifecycle


class DatabaseProvisioner(Protocol):
    async def start(self, request: ProvisionRequest) -> ProvisionedDatabase: ...

    async def release(self, database: ProvisionedDatabase) -> None: ...


@dataclass(frozen=True)
class _EngineSpec:
    image: str
    port: int
    data_path: str
    env: dict[str, str] = field(repr=False)
    ready_check: tuple[str, ...]
    ready_output: str | None = None  # substring stdout must contain, if any
    ready_on_container_address: bool = False  # "{address}" in ready_check
    command: tuple[str, ...] = ()
    user: str | None = None


def _engine_spec(request: ProvisionRequest) -> _EngineSpec:
    """How each official image is initialised and probed.

    Every image initialises its server on the first start from environment variables.
    The readiness checks only pass on the final server, not on the temporary server the
    images run while initialising: postgres's listens on its socket only, mysql's skips
    networking, and mongodb's binds 127.0.0.1, so mongodb is probed on the container's
    network address instead.
    """
    v, user, db = request.version, request.username or "", request.database or ""
    match request.engine:
        case Engine.POSTGRES:
            return _EngineSpec(
                image=f"postgres:{v}-alpine",
                port=5432,
                data_path="/var/lib/postgresql/data",
                env={
                    "POSTGRES_USER": user,
                    "POSTGRES_PASSWORD": request.password,
                    "POSTGRES_DB": db,
                },
                ready_check=(
                    "pg_isready",
                    "-q",
                    "-h",
                    "127.0.0.1",
                    "-p",
                    "5432",
                    "-U",
                    user,
                    "-d",
                    db,
                ),
            )
        case Engine.MYSQL:
            return _EngineSpec(
                image=f"mysql:{v}",
                port=3306,
                data_path="/var/lib/mysql",
                env={
                    "MYSQL_ROOT_PASSWORD": request.admin_password,
                    "MYSQL_DATABASE": db,
                    "MYSQL_USER": user,
                    "MYSQL_PASSWORD": request.password,
                },
                # Exits 0 whenever the server answers, even with "access denied".
                ready_check=("mysqladmin", "ping", "--silent", "-h", "127.0.0.1"),
            )
        case Engine.MONGODB:
            return _EngineSpec(
                image=f"mongo:{v}",
                port=27017,
                data_path="/data/db",
                env={
                    "MONGO_INITDB_ROOT_USERNAME": user,
                    "MONGO_INITDB_ROOT_PASSWORD": request.password,
                    "MONGO_INITDB_DATABASE": db,
                },
                ready_check=(
                    "mongosh",
                    "--quiet",
                    "--host",
                    "{address}",
                    "--eval",
                    "db.adminCommand({ping: 1}).ok",
                ),
                ready_on_container_address=True,
            )
        case Engine.REDIS:
            return _EngineSpec(
                image=f"redis:{v}-alpine",
                port=6379,
                data_path="/data",
                env={"REDIS_PASSWORD": request.password},
                # The shell expands the password inside the container, so it is not part
                # of the container's configured command.
                command=(
                    "sh",
                    "-c",
                    'exec redis-server --requirepass "$REDIS_PASSWORD" --appendonly yes',
                ),
                user="redis",  # the image's unprivileged user (a shell skips its gosu step)
                ready_check=(
                    "sh",
                    "-c",
                    'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -h 127.0.0.1 ping',
                ),
                ready_output="PONG",
            )
    raise ProvisioningError(f"Engine {request.engine} cannot be provisioned")


def container_name(request: ProvisionRequest) -> str:
    """Deterministic for agent-lifecycle databases, so the agent's next run finds it.

    Short enough (< 63 characters) to work as a DNS name on a Docker network.
    """
    name = f"cdb-{request.agent_id.hex[:16]}-{request.connector_id.hex[:16]}"
    return name if request.lifecycle == "agent" else f"{name}-{secrets.token_hex(4)}"


def _first_line(text: str) -> str:
    return next((line.strip() for line in text.splitlines() if line.strip()), "no output")


class DockerDatabaseProvisioner:
    def __init__(
        self,
        runner: CommandRunner | None = None,
        *,
        network: str | None = None,
        ready_timeout: float = 90,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._run = runner or SubprocessRunner()
        self._network = network
        self._ready_timeout = ready_timeout
        self._sleep = sleep
        self._clock = clock
        self._network_ready = False

    @classmethod
    def from_settings(
        cls, settings: Settings, runner: CommandRunner | None = None
    ) -> "DockerDatabaseProvisioner":
        return cls(
            runner,
            network=settings.database_provisioner_network,
            ready_timeout=settings.database_provisioner_ready_timeout,
        )

    # --- lifecycle ---------------------------------------------------------------------

    async def start(self, request: ProvisionRequest) -> ProvisionedDatabase:
        """Start (or, for agent lifecycle, reuse) a database and wait until it is ready."""
        spec = _engine_spec(request)
        name = container_name(request)
        state = await self._state(name) if request.lifecycle == "agent" else None
        if state is None:
            await self._create(request, spec, name)
        elif state != "running":
            await self._docker("start", name)
        try:
            host, port = await self._endpoint(request, name, spec.port)
            await self._wait_until_ready(request, spec, name)
        except ProvisioningError:
            if request.lifecycle == "run":
                await self._remove_quietly(name)
            raise
        return ProvisionedDatabase(
            container=name, host=host, port=port, lifecycle=request.lifecycle
        )

    async def release(self, database: ProvisionedDatabase) -> None:
        """End of a run: remove run-lifecycle databases with their data.

        Agent-lifecycle databases keep running; another run of the same agent may be
        using them. stop_agent / remove_agent end them explicitly.
        """
        if database.lifecycle == "run":
            await self._docker("rm", "--force", "--volumes", database.container)

    async def stop_agent(self, agent_id: uuid.UUID) -> int:
        """Stop an agent's running databases, keeping their data. Returns how many."""
        ids = await self._list("ps", "--quiet", *self._agent_filters(agent_id))
        if ids:
            await self._docker("stop", *ids)
        return len(ids)

    async def remove_agent(self, agent_id: uuid.UUID) -> int:
        """Remove all of an agent's databases and their data. Returns how many."""
        ids = await self._list("ps", "--all", "--quiet", *self._agent_filters(agent_id))
        if ids:
            await self._docker("rm", "--force", "--volumes", *ids)
        volumes = await self._list("volume", "ls", "--quiet", *self._agent_filters(agent_id))
        if volumes:
            await self._docker("volume", "rm", *volumes)
        return len(ids)

    # --- steps -------------------------------------------------------------------------

    async def _create(self, request: ProvisionRequest, spec: _EngineSpec, name: str) -> None:
        labels = {
            LABEL_MANAGED: MANAGED_DATABASE,
            LABEL_AGENT: str(request.agent_id),
            LABEL_CONNECTOR: str(request.connector_id),
            LABEL_LIFECYCLE: request.lifecycle,
            LABEL_ENGINE: str(request.engine),
        }
        label_args = [arg for k, v in labels.items() for arg in ("--label", f"{k}={v}")]
        args = ["run", "--detach", "--name", name, *label_args]
        memory = f"{request.memory_mb}m"
        args += ["--memory", memory, "--memory-swap", memory, "--cpus", CPUS]
        args += ["--pids-limit", PIDS_LIMIT, "--security-opt", "no-new-privileges"]
        if self._network:
            await self._ensure_network()
            args += ["--network", self._network]
        else:
            args += ["--publish", f"127.0.0.1::{spec.port}"]  # random host port, loopback only
        if request.lifecycle == "agent":
            volume = f"{name}-data"
            await self._docker("volume", "create", *label_args, volume)
            args += ["--volume", f"{volume}:{spec.data_path}", "--restart", "unless-stopped"]
        if spec.user:
            args += ["--user", spec.user]
        for variable in spec.env:
            args += ["--env", variable]  # value comes from the CLI's environment
        args += [spec.image, *spec.command]

        result = await self._run(["docker", *args], env=spec.env, timeout=RUN_TIMEOUT_S)
        if result.ok:
            return
        if request.lifecycle == "agent" and "already in use" in result.stderr:
            # Another run of this agent created it first.
            if await self._state(name) != "running":
                await self._docker("start", name)
            return
        if request.lifecycle == "run":
            await self._remove_quietly(name)
        raise ProvisioningError(
            f"Could not start {request.engine} container {name}: {_first_line(result.stderr)}"
        )

    async def _endpoint(self, request: ProvisionRequest, name: str, port: int) -> tuple[str, int]:
        if self._network:
            return name, port
        result = await self._run(["docker", "port", name, f"{port}/tcp"], timeout=COMMAND_TIMEOUT_S)
        if not result.ok:
            if await self._state(name) != "running":
                raise self._stopped(request, name)  # exited before its port was assigned
            raise ProvisioningError(f"docker port failed: {_first_line(result.stderr)}")
        for line in result.stdout.splitlines():
            host, _, host_port = line.strip().rpartition(":")
            if host == "127.0.0.1" and host_port.isdigit():
                return host, int(host_port)
        raise ProvisioningError(f"Container {name} has no published port for {port}")

    async def _wait_until_ready(
        self, request: ProvisionRequest, spec: _EngineSpec, name: str
    ) -> None:
        check = list(spec.ready_check)
        if spec.ready_on_container_address:
            address = await self._address(name)
            check = [part.replace("{address}", address) for part in check]
        deadline = self._clock() + self._ready_timeout
        while True:
            result = await self._run(
                ["docker", "exec", name, *check], timeout=READY_CHECK_TIMEOUT_S
            )
            if result.ok and (spec.ready_output is None or spec.ready_output in result.stdout):
                return
            if await self._state(name) != "running":
                raise self._stopped(request, name)
            if self._clock() >= deadline:
                raise ProvisioningError(
                    f"{request.engine} container {name} was not ready within "
                    f"{self._ready_timeout:g}s; see `docker logs {name}`"
                )
            await self._sleep(READY_POLL_INTERVAL_S)

    async def _address(self, name: str) -> str:
        result = await self._docker(
            "inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}", name
        )
        addresses = result.stdout.split()
        if not addresses:
            raise ProvisioningError(f"Container {name} has no network address")
        return addresses[0]

    async def _ensure_network(self) -> None:
        if self._network_ready or not self._network:
            return
        found = await self._run(
            ["docker", "network", "inspect", self._network], timeout=COMMAND_TIMEOUT_S
        )
        if not found.ok:
            # Internal: provisioned databases need no route to the internet.
            created = await self._run(
                [
                    "docker",
                    "network",
                    "create",
                    "--internal",
                    "--label",
                    f"{LABEL_MANAGED}=network",
                    self._network,
                ],
                timeout=COMMAND_TIMEOUT_S,
            )
            if not created.ok and "already exists" not in created.stderr:
                reason = _first_line(created.stderr)
                raise ProvisioningError(f"Could not create Docker network {self._network}: {reason}")
        self._network_ready = True

    # --- docker helpers ----------------------------------------------------------------

    async def _state(self, name: str) -> str | None:
        """Container state ("running", "exited", ...), or None if it does not exist."""
        result = await self._run(
            ["docker", "inspect", "--type", "container", "--format", "{{.State.Status}}", name],
            timeout=COMMAND_TIMEOUT_S,
        )
        if result.ok:
            return result.stdout.strip()
        if "no such" in result.stderr.lower():
            return None
        raise ProvisioningError(f"Docker is not available: {_first_line(result.stderr)}")

    async def _docker(self, *args: str) -> CommandResult:
        result = await self._run(["docker", *args], timeout=COMMAND_TIMEOUT_S)
        if not result.ok:
            raise ProvisioningError(f"docker {args[0]} failed: {_first_line(result.stderr)}")
        return result

    async def _list(self, *args: str) -> list[str]:
        return (await self._docker(*args)).stdout.split()

    async def _remove_quietly(self, name: str) -> None:
        await self._run(["docker", "rm", "--force", "--volumes", name], timeout=COMMAND_TIMEOUT_S)

    @staticmethod
    def _stopped(request: ProvisionRequest, name: str) -> ProvisioningError:
        return ProvisioningError(
            f"{request.engine} container {name} stopped while starting; see `docker logs {name}`"
        )

    @staticmethod
    def _agent_filters(agent_id: uuid.UUID) -> list[str]:
        return [
            "--filter",
            f"label={LABEL_MANAGED}={MANAGED_DATABASE}",
            "--filter",
            f"label={LABEL_AGENT}={agent_id}",
        ]
