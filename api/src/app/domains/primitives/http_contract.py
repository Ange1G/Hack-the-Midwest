"""HTTP connector: one HTTP call an agent may make.

The team's original HTTP contract, nested into the generic shape:
credentials { xApiKey, authorizationHeader }, config { method, URL, payload }.

Optional `queryParams` / `bodyParams` allowlists let the model fill values. The
stored URL (scheme, host, path) cannot change.
"""

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import AfterValidator, AliasChoices, Field, JsonValue, model_validator
from pydantic_core import PydanticCustomError

from app.domains.primitives.base import BaseContract, ContractPart, HeaderCredentials
from app.domains.primitives.network import PublicHttpUrl

MAX_HTTP_PARAMS = 20
HttpParamName = Annotated[str, Field(pattern=r"^[A-Za-z][A-Za-z0-9_\-]{0,63}$")]


def _dedupe_preserving_order(names: list[str] | None) -> list[str] | None:
    return None if names is None else list(dict.fromkeys(names))


class HttpMethod(StrEnum):
    GET = "GET"
    POST = "POST"


class HttpConfig(ContractPart):
    method: HttpMethod
    url: PublicHttpUrl = Field(
        validation_alias=AliasChoices("URL", "url"), serialization_alias="URL"
    )
    payload: JsonValue = None
    query_params: Annotated[
        list[HttpParamName] | None, AfterValidator(_dedupe_preserving_order)
    ] = Field(
        default=None,
        alias="queryParams",
        min_length=1,
        max_length=MAX_HTTP_PARAMS,
        description="Query keys the agent may set. Omit for a fixed URL.",
    )
    body_params: Annotated[
        list[HttpParamName] | None, AfterValidator(_dedupe_preserving_order)
    ] = Field(
        default=None,
        alias="bodyParams",
        min_length=1,
        max_length=MAX_HTTP_PARAMS,
        description="JSON body keys the agent may set (POST only).",
    )

    @model_validator(mode="after")
    def _get_has_no_payload_or_body_params(self) -> "HttpConfig":
        if self.method is HttpMethod.GET and self.payload is not None:
            raise PydanticCustomError(
                "payload_not_allowed",
                "GET requests cannot include a payload; put parameters in the URL",
            )
        if self.method is HttpMethod.GET and self.body_params:
            raise PydanticCustomError(
                "body_params_not_allowed",
                "GET requests cannot include bodyParams; use queryParams",
            )
        return self


class HttpContract(BaseContract):
    type: Literal["http"]
    credentials: HeaderCredentials | None = None
    config: HttpConfig
