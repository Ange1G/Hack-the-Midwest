"""Knowledge connector: owner-provided text documents an agent can search.

Documents live in `knowledge_documents` (see domains.knowledge), not in the contract.
There are no credentials.
"""

from typing import Literal

from pydantic import Field

from app.domains.primitives.base import BaseContract, ContractPart

MAX_SEARCH_RESULTS = 10
DEFAULT_SEARCH_RESULTS = 5


class KnowledgeConfig(ContractPart):
    max_results: int = Field(
        default=DEFAULT_SEARCH_RESULTS,
        ge=1,
        le=MAX_SEARCH_RESULTS,
        alias="maxResults",
        description="Hits returned per search",
    )


class KnowledgeContract(BaseContract):
    type: Literal["knowledge"]
    config: KnowledgeConfig = Field(default_factory=KnowledgeConfig)
