from app.domains.chains.handoff import HANDOFF_PREFIX, handoff_input, output_from_result


def test_output_from_result_reads_output_field() -> None:
    assert output_from_result({"output": "alpha", "tool_calls": []}) == "alpha"
    assert output_from_result({"message": "ignored"}) == ""
    assert output_from_result(None) == ""


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
