"""A small in-memory stand-in for the Docker CLI, for provisioner tests."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from app.runtime.commands import CommandResult


@dataclass
class Call:
    args: tuple[str, ...]
    env: dict[str, str]


@dataclass
class Container:
    name: str
    labels: dict[str, str]
    state: str = "running"
    host_port: int = 49153
    checks_until_ready: int = 0  # failed readiness checks before the engine answers
    crash_on_check: bool = False


@dataclass
class FakeDocker:
    exit_on_start: bool = False  # the engine exits right away (e.g. bad configuration)
    calls: list[Call] = field(default_factory=list)
    containers: dict[str, Container] = field(default_factory=dict)
    volumes: dict[str, dict[str, str]] = field(default_factory=dict)
    networks: set[str] = field(default_factory=set)
    daemon_up: bool = True
    run_error: str | None = None
    checks_until_ready: int = 0
    crash_on_check: bool = False
    next_port: int = 49153

    async def __call__(
        self,
        args: Sequence[str],
        *,
        env: Mapping[str, str] | None = None,
        timeout: float = 60,
    ) -> CommandResult:
        args = tuple(args)
        self.calls.append(Call(args, dict(env or {})))
        assert args[0] == "docker"
        if not self.daemon_up:
            return CommandResult(1, "", "Cannot connect to the Docker daemon. Is it running?")
        handler = getattr(self, "_" + args[1])
        return handler(list(args[2:]))

    # --- helpers for assertions -----------------------------------------------------

    def commands(self, verb: str) -> list[Call]:
        return [c for c in self.calls if c.args[1] == verb]

    # --- docker verbs -----------------------------------------------------------------

    @staticmethod
    def _labels(args: list[str]) -> dict[str, str]:
        labels = {}
        for flag, value in zip(args, args[1:]):
            if flag == "--label":
                key, _, val = value.partition("=")
                labels[key] = val
        return labels

    @staticmethod
    def _filters(args: list[str]) -> dict[str, str]:
        wanted = {}
        for flag, value in zip(args, args[1:]):
            if flag == "--filter":
                _, _, label = value.partition("label=")
                key, _, val = label.partition("=")
                wanted[key] = val
        return wanted

    def _run(self, args: list[str]) -> CommandResult:
        name = args[args.index("--name") + 1]
        if name in self.containers:
            return CommandResult(
                125, "", f'Conflict. The container name "/{name}" is already in use'
            )
        if self.run_error:
            return CommandResult(125, "", self.run_error)
        self.containers[name] = Container(
            name,
            self._labels(args),
            host_port=self.next_port,
            checks_until_ready=self.checks_until_ready,
            crash_on_check=self.crash_on_check,
            state="exited" if self.exit_on_start else "running",
        )
        self.next_port += 1
        return CommandResult(0, "f00dcafe\n", "")

    def _inspect(self, args: list[str]) -> CommandResult:
        name = args[-1]
        container = self.containers.get(name)
        if container is None:
            return CommandResult(1, "", f"Error: No such container: {name}")
        if "{{.State.Status}}" in args:
            return CommandResult(0, f"{container.state}\n", "")
        return CommandResult(0, "172.17.0.5 \n", "")

    def _start(self, args: list[str]) -> CommandResult:
        self.containers[args[-1]].state = "running"
        return CommandResult(0, args[-1] + "\n", "")

    def _port(self, args: list[str]) -> CommandResult:
        container = self.containers[args[0]]
        if container.state != "running":
            return CommandResult(
                1, "", f"Error: No public port '{args[1]}' published for {args[0]}"
            )
        return CommandResult(0, f"127.0.0.1:{container.host_port}\n", "")

    def _exec(self, args: list[str]) -> CommandResult:
        container = self.containers[args[0]]
        if container.crash_on_check:
            container.state = "exited"
            return CommandResult(1, "", "container is not running")
        if container.checks_until_ready > 0:
            container.checks_until_ready -= 1
            return CommandResult(1, "", "")
        return CommandResult(0, "PONG\n" if "redis-cli" in " ".join(args) else "", "")

    def _rm(self, args: list[str]) -> CommandResult:
        for name in [a for a in args if not a.startswith("--")]:
            self.containers.pop(name, None)
        return CommandResult(0, "", "")

    def _stop(self, args: list[str]) -> CommandResult:
        for name in args:
            self.containers[name].state = "exited"
        return CommandResult(0, "", "")

    def _matching(self, args: list[str], *, all_states: bool) -> list[str]:
        wanted = self._filters(args)
        return [
            c.name
            for c in self.containers.values()
            if all(c.labels.get(k) == v for k, v in wanted.items())
            and (all_states or c.state == "running")
        ]

    def _ps(self, args: list[str]) -> CommandResult:
        names = self._matching(args, all_states="--all" in args)
        return CommandResult(0, "".join(f"{n}\n" for n in names), "")

    def _volume(self, args: list[str]) -> CommandResult:
        verb, rest = args[0], args[1:]
        if verb == "create":
            self.volumes[rest[-1]] = self._labels(rest)
            return CommandResult(0, rest[-1] + "\n", "")
        if verb == "ls":
            wanted = self._filters(rest)
            names = [
                n
                for n, labels in self.volumes.items()
                if all(labels.get(k) == v for k, v in wanted.items())
            ]
            return CommandResult(0, "".join(f"{n}\n" for n in names), "")
        if verb == "rm":
            for name in rest:
                self.volumes.pop(name, None)
            return CommandResult(0, "", "")
        raise AssertionError(f"unexpected docker volume {verb}")

    def _network(self, args: list[str]) -> CommandResult:
        verb, name = args[0], args[-1]
        if verb == "inspect":
            if name in self.networks:
                return CommandResult(0, "[]", "")
            return CommandResult(1, "", f"Error: network {name} not found")
        if verb == "create":
            self.networks.add(name)
            return CommandResult(0, "abc\n", "")
        raise AssertionError(f"unexpected docker network {verb}")
