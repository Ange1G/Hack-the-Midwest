"""Notification connector: POST a JSON message to one user-chosen destination.

Slack incoming webhooks, pagers and similar endpoints authenticate with the URL
itself, so the destination is a credential (`credentials.webhookUrl`): encrypted at
rest, never returned, never shown to the model. The model only fills the JSON keys
listed in `config.bodyParams`; `config.payload` holds fixed keys it cannot change.
"""

import json
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, JsonValue, model_validator
from pydantic_core import PydanticCustomError

from app.domains.primitives.base import BaseContract, ContractPart, Credential
from app.domains.primitives.http_contract import MAX_HTTP_PARAMS, HttpParamName
from app.domains.primitives.network import PublicHttpUrl

# Matches the runner's request body cap (runner/http_tools.py MAX_BODY_CHARS).
MAX_NOTIFICATION_BODY_CHARS = 8_000


def _dedupe_preserving_order(names: list[str]) -> list[str]:
    return list(dict.fromkeys(names))


class NotificationCredentials(ContractPart):
    webhook_url: PublicHttpUrl = Field(
        alias="webhookUrl",
        description="Destination URL. Stored encrypted because it often embeds a token.",
        json_schema_extra={"writeOnly": True},
    )
    x_api_key: Credential = Field(default=None, alias="xApiKey")
    authorization_header: Credential = Field(default=None, alias="authorizationHeader")


class NotificationConfig(ContractPart):
    body_params: Annotated[list[HttpParamName], AfterValidator(_dedupe_preserving_order)] = (
        Field(
            alias="bodyParams",
            min_length=1,
            max_length=MAX_HTTP_PARAMS,
            description="JSON body keys the agent fills, e.g. text for Slack.",
        )
    )
    payload: dict[str, JsonValue] | None = Field(
        default=None, description="Fixed JSON keys sent with every message."
    )

    @model_validator(mode="after")
    def _payload_is_fixed_and_bounded(self) -> "NotificationConfig":
        if not self.payload:
            return self
        shadowed = sorted(set(self.payload) & set(self.body_params))
        if shadowed:
            raise PydanticCustomError(
                "body_param_shadows_payload",
                "bodyParams cannot repeat keys fixed in payload: {keys}",
                {"keys": ", ".join(shadowed)},
            )
        if len(json.dumps(self.payload)) > MAX_NOTIFICATION_BODY_CHARS:
            raise PydanticCustomError(
                "payload_too_large",
                "payload must be at most {limit} characters of JSON",
                {"limit": MAX_NOTIFICATION_BODY_CHARS},
            )
        return self


class NotificationContract(BaseContract):
    type: Literal["notification"]
    credentials: NotificationCredentials
    config: NotificationConfig
