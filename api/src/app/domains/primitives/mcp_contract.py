"""MCP connector: a user-provided remote MCP server.

Which of the server's tools an agent may call is decided per agent (the agent's
reference to this connector lists `allowedTools`), not here.
"""

from typing import Annotated, Literal

from pydantic import AliasChoices, Field, StringConstraints

from app.domains.primitives.base import BaseContract, ContractPart, HeaderCredentials
from app.domains.primitives.network import PublicHttpUrl

# MCP specification (2026-07-28) guidance: 1-128 characters of A-Z a-z 0-9 _ - .
McpToolName = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_.\-]{1,128}$")]


class McpConfig(ContractPart):
    url: PublicHttpUrl = Field(
        validation_alias=AliasChoices("URL", "url"), serialization_alias="URL"
    )
    # Streamable HTTP is the MCP spec's remote transport. `stdio` is deliberately not
    # accepted: it launches a process on the host running the agent.
    transport: Literal["streamableHttp"] = "streamableHttp"


class McpContract(BaseContract):
    type: Literal["mcp"]
    credentials: HeaderCredentials | None = None
    config: McpConfig
