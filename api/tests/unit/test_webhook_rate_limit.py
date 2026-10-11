from app.domains.webhooks.rate_limit import SlidingWindowLimiter


def test_allows_up_to_limit_then_rejects() -> None:
    limiter = SlidingWindowLimiter()
    assert limiter.allow("hook-1", limit=2, now=100.0)
    assert limiter.allow("hook-1", limit=2, now=101.0)
    assert not limiter.allow("hook-1", limit=2, now=102.0)


def test_window_expiry_frees_quota() -> None:
    limiter = SlidingWindowLimiter()
    assert limiter.allow("hook-1", limit=1, now=100.0, window_seconds=60.0)
    assert not limiter.allow("hook-1", limit=1, now=150.0, window_seconds=60.0)
    assert limiter.allow("hook-1", limit=1, now=160.0, window_seconds=60.0)


def test_keys_are_independent() -> None:
    limiter = SlidingWindowLimiter()
    assert limiter.allow("a", limit=1, now=1.0)
    assert limiter.allow("b", limit=1, now=1.0)
    assert not limiter.allow("a", limit=1, now=1.0)
