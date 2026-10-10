import asyncio
import logging

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.worker.docker_runner import LocalDockerRunner
from app.worker.loop import run_forever


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    if not settings.docker_enabled:
        raise SystemExit("DOCKER_ENABLED is false; refusing to start the local Docker worker")
    asyncio.run(run_forever(get_session_factory(), LocalDockerRunner(), settings))


if __name__ == "__main__":
    main()
