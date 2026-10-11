from app.domains.chains.handoff import HANDOFF_PREFIX, TOOLS_PREFIX, handoff_input, output_from_result


def test_output_from_result_reads_output_field() -> None:
    assert output_from_result({"output": "alpha", "tool_calls": []}) == "alpha"
    assert output_from_result({"message": "ignored"}) == ""
    assert output_from_result(None) == ""


def test_output_from_result_prefers_validated_structured_output() -> None:
    result = {
        "output": '```json\n{ "severity": "high",\n  "items": [] }\n```',
        "parsed": {"severity": "high", "items": []},
    }
    assert output_from_result(result) == '{"severity":"high","items":[]}'
    assert output_from_result({"output": "", "parsed": False}) == "false"


def test_handoff_prefixes_previous_output() -> None:
    assert handoff_input({"output": "step-a"}, max_bytes=10_000) == (
        f"{HANDOFF_PREFIX}step-a"
    )


def test_handoff_truncates_to_byte_budget() -> None:
    mapped = handoff_input({"output": "abcdefghij"}, max_bytes=len(HANDOFF_PREFIX) + 4)
    assert mapped == f"{HANDOFF_PREFIX}abcd"
    assert len(mapped.encode()) <= len(HANDOFF_PREFIX) + 4


def test_handoff_empty_result_still_has_prefix() -> None:
    assert handoff_input(None, max_bytes=10_000) == HANDOFF_PREFIX


def test_handoff_appends_tool_response_bodies() -> None:
    mapped = handoff_input(
        {
            "output": "summary",
            "tool_calls": [
                {"name": "fetch", "status": "HTTP 200", "response_body": '{"name":"ditto"}'},
            ],
        },
        max_bytes=10_000,
    )
    assert mapped.startswith(f"{HANDOFF_PREFIX}summary")
    assert TOOLS_PREFIX in mapped
    assert "[fetch]" in mapped
    assert '{"name":"ditto"}' in mapped


def test_handoff_includes_tools_when_output_empty() -> None:
    mapped = handoff_input(
        {
            "output": "",
            "tool_calls": [{"name": "fetch", "response_body": '{"id":132}'}],
        },
        max_bytes=10_000,
    )
    assert mapped.startswith(HANDOFF_PREFIX)
    assert '{"id":132}' in mapped


def test_handoff_skips_tool_calls_without_response_body() -> None:
    mapped = handoff_input(
        {
            "output": "summary",
            "tool_calls": [{"name": "fetch", "status": "HTTP 200"}],
        },
        max_bytes=10_000,
    )
    assert mapped == f"{HANDOFF_PREFIX}summary"


def test_handoff_truncates_tools_after_output() -> None:
    mapped = handoff_input(
        {
            "output": "aa",
            "tool_calls": [{"name": "fetch", "response_body": "abcdefghij"}],
        },
        max_bytes=len(HANDOFF_PREFIX) + 2,
    )
    assert mapped == f"{HANDOFF_PREFIX}aa"
    assert TOOLS_PREFIX not in mapped
