"""Running host commands (the Docker CLI) from async code."""

import asyncio
import os
import subprocess
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0


class CommandRunner(Protocol):
    async def __call__(
        self,
        args: Sequence[str],
        *,
        env: Mapping[str, str] | None = None,
        timeout: float = 60,
    ) -> CommandResult: ...


class SubprocessRunner:
    """Runs a command in a worker thread.

    `env` is added to this process's environment for the child only. Secrets go there,
    never into `args`, which other users of the host can read from the process list.
    A thread (rather than asyncio subprocesses) works under every event loop, including
    the selector loop uvicorn uses on Windows.
    """

    async def __call__(
        self,
        args: Sequence[str],
        *,
        env: Mapping[str, str] | None = None,
        timeout: float = 60,
    ) -> CommandResult:
        command = list(args)
        child_env = {**os.environ, **env} if env else None

        def run() -> CommandResult:
            try:
                done = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=timeout,
                    env=child_env,
                    check=False,
                )
            except subprocess.TimeoutExpired:
                return CommandResult(124, "", f"{command[0]} timed out after {timeout:g}s")
            except FileNotFoundError:
                return CommandResult(127, "", f"{command[0]} is not installed or not on PATH")
            return CommandResult(done.returncode, done.stdout, done.stderr)

        return await asyncio.to_thread(run)
