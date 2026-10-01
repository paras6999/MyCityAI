# 🚓 Police System (System 2) — planned for Phase 9

Separate system: own backend (`:9000`), own database, own users, police network only.

| Folder | What |
|---|---|
| `backend/` | FastAPI: alerts, evidence approval, audit log, YOLO video analytics (RAM buffer), bridge client |
| `dashboard/` | React control room: live CCTV grid, alerts, pending approvals, incident map |
| `mediamtx.yml` | RTSP → WebRTC relay with **recording disabled** |

Privacy rules: live view only · frames analysed in RAM · text-only alerts · clips saved only after supervisor approval (encrypted, 30-day expiry) · every access audit-logged · only anonymised text events go to the municipal bridge.

See [Architecture.md §5.4](../docs/Architecture.md) and [API.md §11–12](../docs/API.md#11-bridge-api-police--municipal).
