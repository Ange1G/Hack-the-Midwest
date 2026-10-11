"""The generic contract every primitive (connector) follows.

    { type, contractVersion, name, description?, options?, credentials?, config }

A connector type subclasses BaseContract and declares:
  type:        Literal["<type>"]
  credentials: <credentials model> | None = None   everything in it is a secret
  config:      <config model>
then adds one entry to `registry.CONNECTORS`. Encryption, masking and the catalog work
from these declarations.
"""

from typing import Annotated, Any, Literal, get_args

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints
from pydantic_core import PydanticCustomError

MAX_RETRIES = 5  # team spec
MIN_TIMEOUT_MS = 100  # below this, almost every real request would time out
MAX_TIMEOUT_MS = 60_000  # team spec; bounds how long one call can hold a worker
MAX_DESCRIPTION_LENGTH = 1_000
MAX_CREDENTIAL_LENGTH = 4_096  # far above real API keys/tokens; bounds storage

# Shown in place of a stored credential. Never accepted as a credential value.
SECRET_PLACEHOLDER = "********"

# Agents and their models refer to connectors by name, so keep names identifier-like.
ConnectorName = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,63}$")]


def _reject_placeholder(value: str | None) -> str | None:
    if value == SECRET_PLACEHOLDER:
        raise PydanticCustomError(
            "placeholder_credential", "Provide the actual credential, not the placeholder"
        )
    return value


Credential = Annotated[
    str | None,
    Field(min_length=1, max_length=MAX_CREDENTIAL_LENGTH, json_schema_extra={"writeOnly": True}),
    AfterValidator(_reject_placeholder),
]


class ContractPart(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ConnectorOptions(ContractPart):
    retries: int | None = Field(default=None, ge=0, le=MAX_RETRIES)
    timeout: int | None = Field(
        default=None, ge=MIN_TIMEOUT_MS, le=MAX_TIMEOUT_MS, description="Milliseconds"
    )


class HeaderCredentials(ContractPart):
    """Credentials sent as request headers (HTTP and MCP connectors)."""

    x_api_key: Credential = Field(default=None, alias="xApiKey")
    authorization_header: Credential = Field(default=None, alias="authorizationHeader")


class BaseContract(ContractPart):
    contract_version: Literal[1] = Field(alias="contractVersion")
    name: ConnectorName
    description: str | None = Field(
        default=None,
        max_length=MAX_DESCRIPTION_LENGTH,
        description="Tells the agent's model what this connector is for.",
    )
    options: ConnectorOptions | None = None

    @classmethod
    def credential_fields(cls) -> tuple[str, ...]:
        """JSON names of the fields in this contract's `credentials` section."""
        field = cls.model_fields.get("credentials")
        if field is None:
            return ()
        for candidate in (field.annotation, *get_args(field.annotation)):
            if isinstance(candidate, type) and issubclass(candidate, BaseModel):
                return tuple(f.alias or n for n, f in candidate.model_fields.items())
        return ()


def contract_dump(contract: BaseContract) -> dict[str, Any]:
    """JSON form of a contract using the team-spec (camelCase) field names."""
    return contract.model_dump(mode="json", by_alias=True, exclude_none=True)
