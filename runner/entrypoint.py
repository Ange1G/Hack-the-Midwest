import inspect
import os
import sys

import httpx

from agent_run import failure_body, parse_manifest, run_turn
from http_tools import execute_http_tool, parse_json_env, summarize_call


def invoke_strands(system_prompt: str, user_message: str) -> object:
    from strands import Agent
    from strands.models.openai import OpenAIModel

    model_id = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    model = OpenAIModel(model_id=model_id)
    tools = _strands_http_tools()
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
