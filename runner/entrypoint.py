import os
import sys

import httpx

from agent_run import failure_body, parse_manifest, run_turn


def invoke_strands(system_prompt: str, user_message: str) -> object:
    import inspect

    from strands import Agent
    from strands.models.openai import OpenAIModel

    model_id = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    model = OpenAIModel(model_id=model_id)
    kwargs: dict = {"model": model, "callback_handler": None}
    if "system_prompt" in inspect.signature(Agent.__init__).parameters:
        kwargs["system_prompt"] = system_prompt
        return Agent(**kwargs)(user_message)
    return Agent(**kwargs)(f"{system_prompt}\n\n{user_message}")


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
    try:
        payload = run_turn(manifest=manifest, model_id=model_id, invoke=invoke_strands)
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
