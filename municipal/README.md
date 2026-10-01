# Municipal System (System 1)

| Folder | What | Owner |
|---|---|---|
| [`backend/`](backend/) | FastAPI + PostgreSQL + AI agents | Paras |
| [`dashboard/`](dashboard/) | React web dashboard (officer / ward rep / mayor / admin) | Paras |

Clients: this dashboard and the [citizen app](../citizen-app/). Receives police data only through `/bridge/*` (see [API.md §11](../docs/API.md#11-bridge-api-police--municipal)).
