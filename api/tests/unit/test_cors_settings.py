from app.core.config import Settings, get_settings


def test_cors_origins_default_for_test_env() -> None:
    settings = Settings(app_env="test")
    assert settings.cors_origins == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3100",
    ]


def test_cors_origins_empty_for_production_when_unset() -> None:
    settings = Settings(app_env="production")
    assert settings.cors_origins == []


def test_cors_origins_parsed_from_comma_separated_env_style() -> None:
    settings = Settings(
        app_env="production",
        cors_origins="https://app.example.com, https://staging.example.com",
    )
    assert settings.cors_origins == [
        "https://app.example.com",
        "https://staging.example.com",
    ]


def test_get_settings_clears_cors_cache() -> None:
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.cors_origins is not None
