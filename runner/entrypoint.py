import json
import os
import sys

import httpx


def main() -> None:
    callback_url = os.environ["CALLBACK_URL"]
    token = os.environ["CALLBACK_TOKEN"]
    execution_id = os.environ["EXECUTION_ID"]
    agent_id = os.environ.get("AGENT_ID", "")
    raw_manifest = os.environ.get("AGENT_MANIFEST", "{}")
    try:
        manifest = json.loads(raw_manifest)
    except json.JSONDecodeError:
        manifest = {}

    payload = {
        "status": "succeeded",
        "result": {
            "message": "stub run complete",
            "execution_id": execution_id,
            "agent_id": agent_id,
            "manifest": manifest,
        },
    }
    response = httpx.post(
        callback_url,
        json=payload,
        headers={"X-Execution-Callback-Token": token},
        timeout=30.0,
    )
    response.raise_for_status()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"stub runner failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
