"""Provisions real database images with Docker. Opt-in, because it pulls images:

    RUN_DOCKER_TESTS=1 uv run pytest tests/docker -v          (bash)
    $env:RUN_DOCKER_TESTS=1; uv run pytest tests/docker -v    (PowerShell)

Needs a running Docker daemon that can pull postgres, mysql, mongo and redis images.
"""

import os
import secrets
import shutil
import subprocess
import uuid

import asyncpg
import pytest

from app.domains.primitives.database_contract import Engine
from app.runtime.database_provisioner import (
    DockerDatabaseProvisioner,
    ProvisionedDatabase,
    ProvisionRequest,
)

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_DOCKER_TESTS") != "1" or shutil.which("docker") is None,
    reason="set RUN_DOCKER_TESTS=1 (and run Docker) to provision real databases",
)

# Authenticated query per engine, run inside the container with the agent user's
# password from the container environment.
AUTHENTICATED_QUERY = {
    Engine.MYSQL: 'mysql -h 127.0.0.1 -u agent -p"$MYSQL_PASSWORD" agent -e "SELECT 1"',
    Engine.MONGODB: (
        'mongosh --quiet -u agent -p "$MONGO_INITDB_ROOT_PASSWORD" '
        '--authenticationDatabase admin --eval "db.runCommand({ping: 1}).ok"'
    ),
    Engine.REDIS: 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -h 127.0.0.1 SET probe 1',
}


def request(engine: Engine, version: str, lifecycle: str = "run") -> ProvisionRequest:
    named = engine is not Engine.REDIS
    return ProvisionRequest(
        agent_id=uuid.uuid4(),
        connector_id=uuid.uuid4(),
        engine=engine,
        version=version,
        database="agent" if named else None,
        username="agent" if named else None,
        password=secrets.token_urlsafe(24),
        admin_password=secrets.token_urlsafe(24),
        lifecycle=lifecycle,  # type: ignore[arg-type]
        memory_mb=512,
    )


def exists(db: ProvisionedDatabase) -> bool:
    out = subprocess.run(
        ["docker", "ps", "-aq", "--filter", f"name=^{db.container}$"],
        capture_output=True,
        text=True,
        check=True,
    )
    return bool(out.stdout.strip())


async def query_postgres(db: ProvisionedDatabase, password: str, sql: str) -> object:
    conn = await asyncpg.connect(
        host=db.host, port=db.port, user="agent", password=password, database="agent"
    )
    try:
        return await conn.fetchval(sql)
    finally:
        await conn.close()


async def test_postgres_run_database_accepts_its_credentials_and_is_removed() -> None:
    provisioner = DockerDatabaseProvisioner(ready_timeout=180)
    req = request(Engine.POSTGRES, "16")
    db = await provisioner.start(req)
    try:
        assert await query_postgres(db, req.password, "SELECT 1") == 1
        with pytest.raises(asyncpg.InvalidPasswordError):
            await query_postgres(db, "wrong-password", "SELECT 1")
    finally:
        await provisioner.release(db)
    assert not exists(db)


@pytest.mark.parametrize(
    ("engine", "version"), [(Engine.MYSQL, "8.4"), (Engine.MONGODB, "8.0"), (Engine.REDIS, "7")]
)
async def test_other_engines_start_with_working_credentials(engine: Engine, version: str) -> None:
    provisioner = DockerDatabaseProvisioner(ready_timeout=180)
    db = await provisioner.start(request(engine, version))
    try:
        result = subprocess.run(
            ["docker", "exec", db.container, "sh", "-c", AUTHENTICATED_QUERY[engine]],
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert result.returncode == 0, result.stderr
    finally:
        await provisioner.release(db)
    assert not exists(db)


async def test_agent_database_keeps_its_data_between_runs() -> None:
    provisioner = DockerDatabaseProvisioner(ready_timeout=180)
    req = request(Engine.POSTGRES, "16", lifecycle="agent")
    try:
        first = await provisioner.start(req)
        await query_postgres(first, req.password, "CREATE TABLE notes (body text)")
        await query_postgres(first, req.password, "INSERT INTO notes VALUES ('kept')")
        await provisioner.release(first)  # end of run 1: keeps running

        await provisioner.stop_agent(req.agent_id)  # e.g. host restart
        second = await provisioner.start(req)  # run 2
        assert await query_postgres(second, req.password, "SELECT body FROM notes") == "kept"
    finally:
        assert await provisioner.remove_agent(req.agent_id) == 1
