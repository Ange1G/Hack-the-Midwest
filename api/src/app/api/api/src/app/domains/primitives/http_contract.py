"""HTTP connector: one HTTP call an agent may make.

The team's original HTTP contract, nested into the generic shape:
credentials { xApiKey, authorizationHeader }, config { method, URL, payload }.
"""

from enum import StrEnum
from typing import Literal

from pydantic import AliasChoices, Field, JsonValue, model_validator
from pydantic_core import PydanticCustomError

from app.domains.primitives.base import BaseContract, ContractPart, HeaderCredentials
from app.domains.primitives.network import PublicHttpUrl


class HttpMethod(StrEnum):
    GET = "GET"
    POST = "POST"


class HttpConfig(ContractPart):
    method: HttpMethod
    url: PublicHttpUrl = Field(
        validation_alias=AliasChoices("URL", "url"), serialization_alias="URL"
    )
    payload: JsonValue = None

    @model_validator(mode="after")
    def _get_has_no_payload(self) -> "HttpConfig":
        if self.method is HttpMethod.GET and self.payload is not None:
            raise PydanticCustomError(
                "payload_not_allowed",
                "GET requests cannot include a payload; put parameters in the URL",
            )
        return self


class HttpContract(BaseContract):
    type: Literal["http"]
    credentials: HeaderCredentials | None = None
    config: HttpConfig
