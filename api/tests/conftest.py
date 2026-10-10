import os

# Environment must be set before app settings are first loaded in a test process.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/agent_platform_test",
)
# Dummy key so worker tests can claim jobs without calling OpenAI.
# Override an empty value from api/.env so process_once does not skip Docker in tests.
if not os.environ.get("OPENAI_API_KEY"):
    os.environ["OPENAI_API_KEY"] = "test-openai-key-not-for-network"
