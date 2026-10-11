import pytest

from app.core.exceptions import AppError
from app.domains.agents.configurations import AgentConfigurations
from app.domains.integrations.catalog import (
    AGENT_TEMPLATES,
    INTEGRATIONS,
    INTEGRATIONS_BY_ID,
)
from app.domains.integrations.schemas import IntegrationInstall
from app.domains.integrations.service import (
    install_contract,
    list_agent_templates,
    list_integrations,
)
from app.domains.primitives.registry import parse_contract


@pytest.mark.parametrize("integration", INTEGRATIONS, ids=lambda i: i.id)
def test_catalog_contracts_validate_with_and_without_key(integration) -> None:
    parse_contract(install_contract(integration, IntegrationInstall(api_key="k-123")))
    if not integration.credential.required:
        parse_contract(install_contract(integration, IntegrationInstall()))


def test_catalog_ids_and_connector_names_are_unique() -> None:
    assert len({i.id for i in INTEGRATIONS}) == len(INTEGRATIONS)
    assert len({i.contract["name"] for i in INTEGRATIONS}) == len(INTEGRATIONS)


def test_mcp_defaults_are_advertised_tools_and_valid_allowlists() -> None:
    for integration in INTEGRATIONS:
        if integration.connector_type != "mcp":
            assert integration.default_allowed_tools == ()
            continue
        assert integration.default_allowed_tools
        assert set(integration.default_allowed_tools) <= set(integration.tools)


def test_templates_reference_known_integrations_and_tools() -> None:
    for template in AGENT_TEMPLATES:
        assert template.integrations
        for integration_id in template.integrations:
            assert integration_id in INTEGRATIONS_BY_ID
        for integration_id, tools in template.allowed_tools.items():
            assert integration_id in template.integrations
            assert set(tools) <= set(INTEGRATIONS_BY_ID[integration_id].tools)


def test_template_reads_resolve_default_allowed_tools_and_fit_agent_schema() -> None:
    reads = {t.id: t for t in list_agent_templates()}
    assert reads["research_assistant"].allowed_tools == {
        "exa": ["web_search_exa", "web_fetch_exa"]
    }
    assert reads["page_watcher"].allowed_tools == {"agenty": ["markdown"]}
    assert reads["page_watcher"].memory is True
    assert reads["web_data_extractor"].allowed_tools == {}
    for template in reads.values():
        AgentConfigurations.model_validate({"memory": template.memory})


def test_required_key_missing_raises_api_key_required() -> None:
    agenty = INTEGRATIONS_BY_ID["agenty"]
    with pytest.raises(AppError) as exc:
        install_contract(agenty, IntegrationInstall())
    assert exc.value.code == "api_key_required"
    assert exc.value.status_code == 422


def test_install_formats_credentials_per_vendor() -> None:
    agenty = install_contract(INTEGRATIONS_BY_ID["agenty"], IntegrationInstall(api_key="ag"))
    assert agenty["credentials"] == {"authorizationHeader": "Bearer ag"}
    exa = install_contract(INTEGRATIONS_BY_ID["exa"], IntegrationInstall(api_key="ex"))
    assert exa["credentials"] == {"xApiKey": "ex"}
    renamed = install_contract(
        INTEGRATIONS_BY_ID["exa"], IntegrationInstall(name="exa_team")
    )
    assert renamed["name"] == "exa_team"
    assert "credentials" not in renamed
    # The catalog entry itself is never mutated by an install.
    assert "credentials" not in INTEGRATIONS_BY_ID["exa"].contract
    assert INTEGRATIONS_BY_ID["exa"].contract["name"] == "exa_search"


def test_agentql_only_lets_the_model_set_url_prompt_query() -> None:
    contract = parse_contract(
        install_contract(INTEGRATIONS_BY_ID["agentql"], IntegrationInstall(api_key="q"))
    )
    dumped = contract.model_dump(by_alias=True)
    assert dumped["config"]["bodyParams"] == ["url", "prompt", "query"]
    assert dumped["config"]["method"] == "POST"


def test_integration_reads_expose_no_secrets() -> None:
    for read in list_integrations():
        assert "credentials" not in read.model_dump_json()
