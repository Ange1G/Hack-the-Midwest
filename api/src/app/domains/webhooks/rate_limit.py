from time import monotonic


class SlidingWindowLimiter:
    """In-memory per-key count for the last `window_seconds`. Enough for a single API process."""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}

    def reset(self) -> None:
        self._hits.clear()

    def allow(
        self,
        key: str,
        limit: int,
        *,
        now: float | None = None,
        window_seconds: float = 60.0,
    ) -> bool:
        instant = monotonic() if now is None else now
        stamps = [stamp for stamp in self._hits.get(key, []) if instant - stamp < window_seconds]
        if len(stamps) >= limit:
            self._hits[key] = stamps
            return False
        stamps.append(instant)
        self._hits[key] = stamps
        return True


webhook_rate_limiter = SlidingWindowLimiter()
