import asyncio
import logging

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.scheduler.loop import run_forever


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    asyncio.run(run_forever(get_session_factory(), settings))


if __name__ == "__main__":
    main()
