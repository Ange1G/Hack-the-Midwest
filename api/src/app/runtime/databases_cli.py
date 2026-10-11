"""Start, stop or remove an agent's databases from the command line.

    uv run python -m app.runtime.databases_cli up <agent_id> [--show-passwords] [--no-wait]
    uv run python -m app.runtime.databases_cli stop <agent_id>
    uv run python -m app.runtime.databases_cli remove <agent_id>

`up` does what the start of an agent run does: it starts the agent's provisioned
databases (Docker must be running), checks its external ones, and prints how to connect.
It then waits for Ctrl+C and cleans up like the end of a run: lifecycle "run" databases
are removed, lifecycle "agent" databases keep running with their data.
`stop` stops an agent's databases (data kept); `remove` deletes them and their data.

Operator tool: it reads the database configured by DATABASE_URL directly and can print
credentials, so run it only where you could read SECRETS_ENCRYPTION_KEY anyway.
"""

import argparse
import asyncio
import sys
import uuid

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings, get_settings
from app.core.secrets import SecretCipher
from app.domains.agents.models import Agent
from app.domains.connectors.repository import SqlAlchemyConnectorRepository
from app.runtime.agent_databases import AgentDatabaseError, DatabaseConnection, agent_databases
from app.runtime.database_provisioner import DockerDatabaseProvisioner, ProvisioningError


def _cipher(settings: Settings) -> SecretCipher | None:
    key = settings.secrets_encryption_key
    return SecretCipher(key.get_secret_value()) if key and key.get_secret_value() else None


def _describe(db: DatabaseConnection, *, show_passwords: bool) -> str:
    kind = "provisioned" if db.provisioned else "external"
    access = "read-only" if db.read_only else "read-write"
    lines = [
        f"{db.name}  ({db.engine}, {kind}, {access})",
        f"  host      {db.host}:{db.port}",
        f"  database  {db.database or '-'}",
        f"  username  {db.username or '-'}",
        f"  url       {db.url(hide_password=not show_passwords)}",
    ]
    return "\n".join(lines)


async def _up(agent_id: uuid.UUID, *, show_passwords: bool, wait: bool) -> int:
    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            agent = await session.get(Agent, agent_id)
            if agent is None:
                print(f"No agent {agent_id}", file=sys.stderr)
                return 1
            provisioner = DockerDatabaseProvisioner.from_settings(settings)
            print(f"Starting databases for agent '{agent.title}' ({agent.id})...")
            async with agent_databases(
                agent,
                connectors=SqlAlchemyConnectorRepository(session),
                cipher=_cipher(settings),
                provisioner=provisioner,
            ) as databases:
                if not databases:
                    print("This agent references no database connectors.")
                    return 0
                for db in databases.values():
                    print(_describe(db, show_passwords=show_passwords))
                if wait:
                    print("\nDatabases are up. Press Ctrl+C to end the run.")
                    await asyncio.Event().wait()
            print("Run ended: lifecycle 'run' databases removed.")
            return 0
    except (AgentDatabaseError, ProvisioningError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    finally:
        await engine.dispose()


async def _stop(agent_id: uuid.UUID, *, remove: bool) -> int:
    provisioner = DockerDatabaseProvisioner.from_settings(get_settings())
    try:
        if remove:
            count = await provisioner.remove_agent(agent_id)
            print(f"Removed {count} database(s) and their data.")
        else:
            count = await provisioner.stop_agent(agent_id)
            print(f"Stopped {count} database(s); their data is kept.")
    except ProvisioningError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.runtime.databases_cli", description=__doc__.split("\n\n")[0]
    )
    commands = parser.add_subparsers(dest="command", required=True)
    up = commands.add_parser("up", help="start an agent's databases like a run would")
    up.add_argument("agent_id", type=uuid.UUID)
    up.add_argument("--show-passwords", action="store_true", help="print passwords in URLs")
    up.add_argument("--no-wait", action="store_true", help="clean up right away")
    for name, text in (
        ("stop", "stop an agent's databases"),
        ("remove", "delete them and their data"),
    ):
        command = commands.add_parser(name, help=text)
        command.add_argument("agent_id", type=uuid.UUID)
    args = parser.parse_args(argv)

    try:
        if args.command == "up":
            return asyncio.run(
                _up(args.agent_id, show_passwords=args.show_passwords, wait=not args.no_wait)
            )
        return asyncio.run(_stop(args.agent_id, remove=args.command == "remove"))
    except KeyboardInterrupt:
        print("\nRun ended: lifecycle 'run' databases removed.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
