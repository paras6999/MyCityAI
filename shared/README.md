# shared — data shared between systems

Contains **data files only** (no code). Changes need approval from both owners.

| File | Used by |
|---|---|
| [`constants.json`](constants.json) | Enums used by app, dashboard and backend (roles, categories, statuses, SLA …). Must match [API.md §2](../docs/API.md#2-shared-enums). |
| [`bridge-schema/bridge_event.schema.json`](bridge-schema/bridge_event.schema.json) | Police → municipal events (road closure, infra issue) |
| [`bridge-schema/bridge_stats.schema.json`](bridge-schema/bridge_stats.schema.json) | Police → municipal aggregated statistics |

Bridge schemas use `additionalProperties: false`, so any extra field (e.g. an image) is rejected.
