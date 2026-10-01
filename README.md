# MyCityAI — Agentic AI Smart City Ecosystem

AI agents that detect, prioritise, route and escalate civic issues — connecting **citizens**, the **Municipal Corporation** and the **police**, with privacy built in.

> Final-year project · Dept. of CSE (AIML), D. Y. Patil College of Engineering & Technology, Kolhapur · 2026–27
> Guide: Mrs. Shamal C. Desai

![Architecture](docs/assets/7_architecture.png)

## Systems
| System | Folder | What it is |
|---|---|---|
| 📱 Citizen App | [`citizen-app/`](citizen-app/) | React Native (Expo) app: report issues with a photo, track status, ward announcements |
| 💻 Municipal Dashboard | [`municipal/dashboard/`](municipal/dashboard/) | React web app with officer / ward rep / mayor views |
| ⚙ Municipal Backend | [`municipal/backend/`](municipal/backend/) | FastAPI + PostgreSQL + AI agents (LangGraph, YOLOv8, NLP) |
| 🚓 Police Control Room | [`police/`](police/) | Separate system: live CCTV (no recording), AI alerts, evidence approval |
| 🔗 Bridge | [`shared/bridge-schema/`](shared/bridge-schema/) | One-way, anonymised police → municipal events |
| 🧪 ML | [`ml/`](ml/) | Model training & evaluation notebooks |

## Start here (read before coding)
| Doc | What's inside |
|---|---|
| [PRD.md](docs/PRD.md) | What we're building, for whom, feature list |
| [Architecture.md](docs/Architecture.md) | System design, folder structure, tech stack, ports |
| [API.md](docs/API.md) | **The contract** between app, dashboard and backends |
| [Rules.md](docs/Rules.md) | Folder ownership, coding rules, rules for AI assistants |
| [Phases.md](docs/Phases.md) | Step-by-step build plan |
| [Design.md](docs/Design.md) | Colours, fonts, components |
| [Memory.md](docs/Memory.md) | Current progress and decisions — update after every session |

## Who works where
| Person | Folders |
|---|---|
| Paras (`@paras6999`) | `municipal/backend/`, `municipal/dashboard/` |
| Friend | `citizen-app/` |
| Both (PR approval from both) | `docs/API.md`, `shared/` |

## Workflow
1. `git pull origin main`
2. `git checkout -b app/<feature>` (or `dashboard/…`, `backend/…`)
3. Work only in your own folders · follow [API.md](docs/API.md)
4. Push the branch → open a Pull Request → other person reviews → merge
5. Add a line to [Memory.md](docs/Memory.md) if something important changed

## Running locally
Setup steps are added per folder as each part is built (see each folder's README). Ports: backend `8000`, dashboard `5173`, Expo `8081`, police backend `9000`.

## Team
Savej Shaikh · Paras Pilankar · Harsh Vanjare · Shanur Shaikh · Pranav Sangar
