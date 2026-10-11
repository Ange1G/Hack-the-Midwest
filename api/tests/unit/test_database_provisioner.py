import uuid
from dataclasses import replace

import pytest
from fake_docker import FakeDocker

from app.domains.primitives.database_contract import Engine
from app.runtime.commands import CommandResult
from app.runtime.database_provisioner import (
    DockerDatabaseProvisioner,
    ProvisionedDatabase,
    ProvisioningError,
    ProvisionRequest,
    container_name,
)

AGENT = uuid.UUID("11111111-2222-3333-4444-555555555555")
CONNECTOR = uuid.UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
PASSWORD = "user-pass-Zq81xL0p2"
ADMIN = "admin-pass-Rt55aa91"

POSTGRES = ProvisionRequest(
    agent_id=AGENT,
    connector_id=CONNECTOR,
    engine=Engine.POSTGRES,
    version="16",
    database="agent",
    username="agent",
    password=PASSWORD,
    admin_password=ADMIN,
    lifecycle="agent",
    memory_mb=512,
)


class Clock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def make(docker: FakeDocker, **kwargs: object) -> tuple[DockerDatabaseProvisioner, Clock]:
    clock = Clock()
    provisioner = DockerDatabaseProvisioner(
        docker,
        sleep=clock.sleep,
        clock=clock,
        **kwargs,  # type: ignore[arg-type]
    )
    return provisioner, clock


def run_args(docker: FakeDocker) -> list[str]:
    (call,) = docker.commands("run")
    return list(call.args)


def flag_values(args: list[str], flag: str) -> list[str]:
    return [value for f, value in zip(args, args[1:]) if f == flag]


# --- docker run -----------------------------------------------------------------------


async def test_starts_postgres_with_limits_labels_and_loopback_port() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    db = await provisioner.start(POSTGRES)

    name = "cdb-1111111122223333-aaaaaaaabbbbcccc"
    assert db == ProvisionedDatabase(
        container=name, host="127.0.0.1", port=49153, lifecycle="agent"
    )
    args = run_args(docker)
    assert args[:4] == ["docker", "run", "--detach", "--name"]
    assert args[-1] == "postgres:16-alpine"
    assert flag_values(args, "--publish") == ["127.0.0.1::5432"]
    assert flag_values(args, "--memory") == ["512m"]
    assert flag_values(args, "--memory-swap") == ["512m"]
    assert flag_values(args, "--cpus") == ["1"]
    assert flag_values(args, "--pids-limit") == ["256"]
    assert flag_values(args, "--security-opt") == ["no-new-privileges"]
    assert flag_values(args, "--restart") == ["unless-stopped"]
    assert flag_values(args, "--volume") == [f"{name}-data:/var/lib/postgresql/data"]
    assert set(flag_values(args, "--label")) == {
        "constitution.managed=database",
        f"constitution.agent={AGENT}",
        f"constitution.connector={CONNECTOR}",
        "constitution.lifecycle=agent",
        "constitution.engine=postgres",
    }
    assert docker.volumes[f"{name}-data"]["constitution.agent"] == str(AGENT)


async def test_secrets_go_through_the_environment_never_arguments() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    await provisioner.start(replace(POSTGRES, engine=Engine.MYSQL, version="8.4"))

    for call in docker.calls:
        assert PASSWORD not in " ".join(call.args)
        assert ADMIN not in " ".join(call.args)
    (run,) = docker.commands("run")
    assert flag_values(list(run.args), "--env") == [
        "MYSQL_ROOT_PASSWORD",
        "MYSQL_DATABASE",
        "MYSQL_USER",
        "MYSQL_PASSWORD",
    ]
    assert run.env == {
        "MYSQL_ROOT_PASSWORD": ADMIN,
        "MYSQL_DATABASE": "agent",
        "MYSQL_USER": "agent",
        "MYSQL_PASSWORD": PASSWORD,
    }


@pytest.mark.parametrize(
    ("engine", "version", "image", "port", "env_names"),
    [
        (
            Engine.POSTGRES,
            "17",
            "postgres:17-alpine",
            "5432",
            ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"],
        ),
        (
            Engine.MYSQL,
            "8.0",
            "mysql:8.0",
            "3306",
            ["MYSQL_ROOT_PASSWORD", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"],
        ),
        (
            Engine.MONGODB,
            "7.0",
            "mongo:7.0",
            "27017",
            ["MONGO_INITDB_ROOT_USERNAME", "MONGO_INITDB_ROOT_PASSWORD", "MONGO_INITDB_DATABASE"],
        ),
        (Engine.REDIS, "7", "redis:7-alpine", "6379", ["REDIS_PASSWORD"]),
    ],
)
async def test_engine_images_ports_and_variables(
    engine: Engine, version: str, image: str, port: str, env_names: list[str]
) -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    request = replace(POSTGRES, engine=engine, version=version)
    if engine is Engine.REDIS:
        request = replace(request, username=None, database=None)
    await provisioner.start(request)
    args = run_args(docker)
    assert image in args
    assert flag_values(args, "--publish") == [f"127.0.0.1::{port}"]
    assert flag_values(args, "--env") == env_names


async def test_redis_runs_as_its_own_user_and_expands_the_password_inside() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    await provisioner.start(
        replace(POSTGRES, engine=Engine.REDIS, version="7", username=None, database=None)
    )
    args = run_args(docker)
    assert flag_values(args, "--user") == ["redis"]
    assert args[-3:] == [
        "sh",
        "-c",
        'exec redis-server --requirepass "$REDIS_PASSWORD" --appendonly yes',
    ]
    (check,) = docker.commands("exec")
    assert "redis-cli" in check.args[-1] and "REDISCLI_AUTH" in check.args[-1]


async def test_mongodb_is_probed_on_its_network_address() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    await provisioner.start(replace(POSTGRES, engine=Engine.MONGODB, version="8.0"))
    (check,) = docker.commands("exec")
    assert check.args[3:7] == ("mongosh", "--quiet", "--host", "172.17.0.5")


async def test_run_lifecycle_gets_a_fresh_container_without_volume_or_restart() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    request = replace(POSTGRES, lifecycle="run")
    first = await provisioner.start(request)
    second = await provisioner.start(request)
    assert first.container != second.container
    assert first.container.startswith(container_name(POSTGRES) + "-")
    for call in docker.commands("run"):
        assert "--volume" not in call.args and "--restart" not in call.args
    assert docker.commands("volume") == []


def test_container_names_fit_in_a_dns_label() -> None:
    assert len(container_name(replace(POSTGRES, lifecycle="run"))) <= 63


# --- readiness ------------------------------------------------------------------------


async def test_waits_until_the_engine_answers() -> None:
    docker = FakeDocker(checks_until_ready=3)
    provisioner, clock = make(docker)
    await provisioner.start(POSTGRES)
    assert len(docker.commands("exec")) == 4
    assert clock.sleeps == [1.0, 1.0, 1.0]
    (check,) = {c.args[3] for c in docker.commands("exec")}
    assert check == "pg_isready"


async def test_gives_up_after_the_ready_timeout() -> None:
    docker = FakeDocker(checks_until_ready=1000)
    provisioner, _ = make(docker, ready_timeout=5)
    with pytest.raises(ProvisioningError, match="not ready within 5s"):
        await provisioner.start(POSTGRES)


async def test_container_that_stops_while_starting_fails_fast() -> None:
    docker = FakeDocker(crash_on_check=True)
    provisioner, clock = make(docker)
    with pytest.raises(ProvisioningError, match="stopped while starting"):
        await provisioner.start(POSTGRES)
    assert clock.sleeps == []


async def test_container_that_exits_immediately_is_reported_as_stopped() -> None:
    docker = FakeDocker(exit_on_start=True)
    provisioner, _ = make(docker)
    with pytest.raises(ProvisioningError, match="stopped while starting; see `docker logs"):
        await provisioner.start(replace(POSTGRES, lifecycle="run"))
    assert docker.containers == {}


async def test_failed_run_database_is_removed_but_agent_database_is_kept() -> None:
    docker = FakeDocker(crash_on_check=True)
    provisioner, _ = make(docker)
    with pytest.raises(ProvisioningError):
        await provisioner.start(replace(POSTGRES, lifecycle="run"))
    assert docker.containers == {}

    with pytest.raises(ProvisioningError):
        await provisioner.start(POSTGRES)
    assert container_name(POSTGRES) in docker.containers  # left for `docker logs`


async def test_docker_run_failure_is_reported_without_secrets() -> None:
    docker = FakeDocker(
        run_error="Unable to find image 'postgres:16-alpine' locally\npull access denied"
    )
    provisioner, _ = make(docker)
    with pytest.raises(ProvisioningError) as exc:
        await provisioner.start(replace(POSTGRES, lifecycle="run"))
    assert "Unable to find image" in str(exc.value)
    assert PASSWORD not in str(exc.value)


async def test_docker_daemon_down_is_reported() -> None:
    provisioner, _ = make(FakeDocker(daemon_up=False))
    with pytest.raises(ProvisioningError, match="Docker is not available"):
        await provisioner.start(POSTGRES)


# --- reuse ----------------------------------------------------------------------------


async def test_agent_database_is_reused_by_the_next_run() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    first = await provisioner.start(POSTGRES)
    second = await provisioner.start(POSTGRES)
    assert first == second
    assert len(docker.commands("run")) == 1


async def test_stopped_agent_database_is_started_again() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    await provisioner.start(POSTGRES)
    docker.containers[container_name(POSTGRES)].state = "exited"
    await provisioner.start(POSTGRES)
    assert len(docker.commands("run")) == 1
    assert [c.args[-1] for c in docker.commands("start")] == [container_name(POSTGRES)]


async def test_concurrent_first_runs_share_one_container() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    await provisioner.start(POSTGRES)
    # Another worker checked before this container existed, then lost the race to
    # create it: its first inspect says "no such container", its docker run conflicts.
    real_inspect = docker._inspect
    first = {"inspect": True}

    def missing_once(args: list[str]) -> CommandResult:
        if first.pop("inspect", False):
            return CommandResult(1, "", "Error: No such container")
        return real_inspect(args)

    docker._inspect = missing_once  # type: ignore[method-assign]
    db = await provisioner.start(POSTGRES)
    assert db.container == container_name(POSTGRES)
    assert len(docker.containers) == 1
    assert len(docker.commands("run")) == 2  # the second one conflicted


# --- release, stop, remove ------------------------------------------------------------


async def test_release_removes_run_databases_and_keeps_agent_databases() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    run_db = await provisioner.start(replace(POSTGRES, lifecycle="run"))
    agent_db = await provisioner.start(POSTGRES)

    await provisioner.release(run_db)
    await provisioner.release(agent_db)

    assert set(docker.containers) == {agent_db.container}
    (rm,) = docker.commands("rm")
    assert rm.args == ("docker", "rm", "--force", "--volumes", run_db.container)


async def test_stop_and_remove_only_touch_this_agents_databases() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    mine = await provisioner.start(POSTGRES)
    other_agent = replace(POSTGRES, agent_id=uuid.uuid4())
    theirs = await provisioner.start(other_agent)

    assert await provisioner.stop_agent(AGENT) == 1
    assert docker.containers[mine.container].state == "exited"
    assert docker.containers[theirs.container].state == "running"

    assert await provisioner.remove_agent(AGENT) == 1
    assert set(docker.containers) == {theirs.container}
    assert set(docker.volumes) == {f"{theirs.container}-data"}
    (ps,) = [c for c in docker.commands("ps") if "--all" in c.args]
    assert "label=constitution.managed=database" in ps.args
    assert f"label=constitution.agent={AGENT}" in ps.args


async def test_stop_with_nothing_running_is_a_no_op() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker)
    assert await provisioner.stop_agent(AGENT) == 0
    assert docker.commands("stop") == []


# --- internal network -----------------------------------------------------------------


async def test_network_mode_creates_an_internal_network_and_publishes_nothing() -> None:
    docker = FakeDocker()
    provisioner, _ = make(docker, network="constitution-agents")
    db = await provisioner.start(POSTGRES)
    await provisioner.start(replace(POSTGRES, connector_id=uuid.uuid4()))

    assert db.host == db.container and db.port == 5432
    creates = [c for c in docker.commands("network") if c.args[2] == "create"]
    assert len(creates) == 1
    assert "--internal" in creates[0].args
    for call in docker.commands("run"):
        assert "--publish" not in call.args
        assert flag_values(list(call.args), "--network") == ["constitution-agents"]
    assert docker.commands("port") == []
