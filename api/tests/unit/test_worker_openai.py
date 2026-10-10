from pydantic import SecretStr

from app.core.config import Settings
from app.worker.loop import platform_openai_key


def test_platform_openai_key_none_when_unset() -> None:
    settings = Settings(app_env="test", openai_api_key=None)
    assert platform_openai_key(settings) is None


def test_platform_openai_key_none_when_blank() -> None:
    settings = Settings(app_env="test", openai_api_key=SecretStr("  "))
    assert platform_openai_key(settings) is None


def test_platform_openai_key_returns_value() -> None:
    settings = Settings(app_env="test", openai_api_key=SecretStr("sk-live"))
    assert platform_openai_key(settings) == "sk-live"
