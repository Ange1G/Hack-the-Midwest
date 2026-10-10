from collections.abc import Collection

from pydantic import ValidationError


def describe_validation_errors(
    exc: ValidationError,
    *,
    prefix: str = "",
    tags: Collection[str] = (),
    root_field: str = "body",
) -> list[dict[str, str]]:
    """Client-facing validation errors: a dotted field path and a message.

    Submitted values are never included, so credentials are not echoed back.
    `tags` lists discriminated-union tags that Pydantic inserts as the first location
    element (e.g. "mcp" in mcp.config.URL); they are dropped so paths match the JSON
    the client sent. Errors with no location are reported under `root_field`.
    """
    described = []
    for err in exc.errors():
        loc = [str(part) for part in err["loc"]]
        if loc and loc[0] in tags:
            loc = loc[1:]
        field = ".".join(part for part in (prefix, *loc) if part) or root_field
        described.append({"field": field, "message": err["msg"]})
    return described
