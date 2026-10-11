# Implementation: Connector delete

_To be filled during implementation._

## Changed files

| File | Change |
|------|--------|
| `api/src/app/domains/agents/repository.py` | `detach_connector` protocol + impl |
| `api/src/app/domains/connectors/repository.py` | `delete_owned` protocol + impl |
| `api/src/app/domains/connectors/service.py` | `delete_connector`, `AgentRepository` dep |
| `api/src/app/domains/connectors/controller.py` | `delete` method |
| `api/src/app/domains/connectors/router.py` | `DELETE /{user_sso}/{connector_id}` |
| `api/src/app/api/deps.py` | pass `SqlAlchemyAgentRepository` to `ConnectorService` |
| `api/tests/unit/test_connector_service.py` | delete unit tests |
| `api/tests/integration/test_connectors_api.py` | delete integration tests |
| `fe/src/lib/api/queries.ts` | `useDeleteConnector` |
| `fe/src/components/connectors/connector-list.tsx` | actions column |
| `fe/src/mocks/handlers.ts` | delete MSW handler |
| `fe/src/mocks/state.ts` | `deleteConnector` helper |
| `fe/src/components/connectors/connector-list.test.tsx` | delete Vitest test |

## Known limitations

- Provisioned Docker containers (`cdb-{agent}-{connector}`) are not torn down on connector delete.
- Runs already executing with a cached connector bundle are not interrupted.
