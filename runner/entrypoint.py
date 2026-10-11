import inspect
import os
import sys

import httpx

from agent_run import failure_body, parse_manifest, run_turn
from db_tools import execute_database_tool, summarize_db_call
from http_tools import execute_http_tool, parse_json_env, summarize_call
from mcp_tools import call_mcp_tool, summarize_mcp_call


def invoke_strands(system_prompt: str, user_message: str) -> object:
    from strands import Agent
    from strands.models.openai import OpenAIModel

    model_id = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    model = OpenAIModel(model_id=model_id)
    tools = _strands_http_tools() + _strands_database_tools() + _strands_mcp_tools()
    kwargs: dict = {"model": model, "callback_handler": None}
    if tools:
        kwargs["tools"] = tools
    if "system_prompt" in inspect.signature(Agent.__init__).parameters:
        kwargs["system_prompt"] = system_prompt
        return Agent(**kwargs)(user_message)
    return Agent(**kwargs)(f"{system_prompt}\n\n{user_message}")


def _strands_http_tools() -> list:
    from strands import tool

    specs = parse_json_env(os.environ.get("HTTP_TOOLS_JSON"), [])
    credentials = parse_json_env(os.environ.get("HTTP_CREDENTIALS_JSON"), {})
    if not isinstance(specs, list):
        return []
    built = []
    for spec in specs:
        if not isinstance(spec, dict) or not spec.get("name"):
            continue

        def _make(s: dict = spec) -> object:
            @tool(name=s["name"])
            def http_connector_call() -> str:
                creds = credentials.get(s.get("id"), {}) if isinstance(credentials, dict) else {}
                text = execute_http_tool(s, creds if isinstance(creds, dict) else {})
                TOOL_CALLS.append(summarize_call(s, text))
                return text

            return http_connector_call

        built.append(_make())
    return built


def _strands_database_tools() -> list:
    from strands import tool

    specs = parse_json_env(os.environ.get("DATABASE_TOOLS_JSON"), [])
    credentials = parse_json_env(os.environ.get("DATABASE_CREDENTIALS_JSON"), {})
    if not isinstance(specs, list):
        return []
    built = []
    for spec in specs:
        if not isinstance(spec, dict) or not spec.get("name"):
            continue

        def _make(s: dict = spec) -> object:
            @tool(name=s["name"])
            def database_connector_call(
                statement: str, params: list | None = None
            ) -> str:
                creds = credentials.get(s.get("id"), {}) if isinstance(credentials, dict) else {}
                text = execute_database_tool(
                    s,
                    creds if isinstance(creds, dict) else {},
                    statement,
                    params=params,
                )
                TOOL_CALLS.append(summarize_db_call(s, text))
                return text

            return database_connector_call

        built.append(_make())
    return built


def _strands_mcp_tools() -> list:
    from strands import tool

    servers = parse_json_env(os.environ.get("MCP_SERVERS_JSON"), [])
    credentials = parse_json_env(os.environ.get("MCP_CREDENTIALS_JSON"), {})
    if not isinstance(servers, list):
        return []
    built = []
    for server in servers:
        if not isinstance(server, dict):
            continue
        for tool_name in server.get("tools") or []:
            if not isinstance(tool_name, str) or not tool_name:
                continue
            strands_name = f"{server.get('name') or 'mcp'}__{tool_name}"

            def _make(s: dict = server, name: str = tool_name, registered: str = strands_name) -> object:
                @tool(name=registered)
                def mcp_connector_call(arguments: dict | None = None) -> str:
                    creds = (
                        credentials.get(s.get("id"), {}) if isinstance(credentials, dict) else {}
                    )
                    text = call_mcp_tool(
                        s,
                        creds if isinstance(creds, dict) else {},
                        name,
                        arguments,
                    )
                    TOOL_CALLS.append(summarize_mcp_call(s, name, text))
                    return text

                return mcp_connector_call

            built.append(_make())
    return built


TOOL_CALLS: list[dict] = []


def post_callback(url: str, token: str, payload: dict) -> None:
    response = httpx.post(
        url,
        json=payload,
        headers={"X-Execution-Callback-Token": token},
        timeout=30.0,
    )
    response.raise_for_status()


def main() -> None:
    callback_url = os.environ["CALLBACK_URL"]
    token = os.environ["CALLBACK_TOKEN"]
    model_id = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    manifest = parse_manifest(os.environ.get("AGENT_MANIFEST", "{}"))
    TOOL_CALLS.clear()
    try:
        payload = run_turn(
            manifest=manifest,
            model_id=model_id,
            invoke=invoke_strands,
            tool_calls=TOOL_CALLS,
        )
    except Exception as exc:
        payload = failure_body("llm_error", str(exc))
        try:
            post_callback(callback_url, token, payload)
        except Exception as callback_exc:
            print(f"callback failed after llm error: {callback_exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    post_callback(callback_url, token, payload)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        print(f"runner failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
