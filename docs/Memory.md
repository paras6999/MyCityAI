# Memory.md — Project Progress Log

> **Purpose:** keeps humans and AI assistants up to date so nobody has to re-read the whole codebase.
> **Update it** at the end of every work session or merged PR: what changed, decisions made, what's next.
> Keep entries short. Newest entries at the top of the log.

---

## Current status
| Item | Value |
|---|---|
| Current phase | **Phase 0 — Setup** (see [Phases.md](Phases.md)) |
| API contract version | 0.1.0 (draft, not yet approved by both) |
| Last updated | 2026-10-02 |

### Built so far
| Part | State |
|---|---|
| `municipal/backend` | Phase 0 done: FastAPI app, `/api/v1/health`, `.env` settings, API.md error format, SQLAlchemy + Alembic set up, pytest + ruff. No models yet. |
| `municipal/dashboard` | Phase 0 done: Vite + React 19 + TS strict + Tailwind v4 tokens, i18n, axios client with `ApiError`, login page (UI only) with server status pill. |
| `citizen-app` | Not started (folder + README only) |
| `police/*` | Not started — planned for Phase 9 |
| `ml/` | Not started |
| Docs | PRD, Architecture, API, Rules, Phases, Design written |

### Next steps
1. Both: review API.md and approve v0.1 (or request changes)
2. Paras: add friend's GitHub username to CODEOWNERS, enable branch protection on `main`
3. Friend: Expo app skeleton with mock API (Phase 0)
4. Paras: Phase 1 — users/wards tables, auth endpoints, dashboard login + role routing

## Team
| Person | GitHub | Owns |
|---|---|---|
| Paras Pilankar | `paras6999` | `municipal/backend`, `municipal/dashboard` |
| Friend (name TBD) | `TBD` | `citizen-app` |

## Key decisions (do not change without discussion)
| Date | Decision | Why |
|---|---|---|
| 2026-09-29 | Two independent systems (Municipal + Police) joined by a one-way, anonymised bridge | Police data stays private; realistic separation |
| 2026-09-29 | Municipal dashboard = one web app with 3 role views (officer, ward rep, mayor) | Less code, same backend |
| 2026-09-29 | Stack: FastAPI + PostgreSQL + React + LangGraph; no Node backend, no MongoDB | Simpler, one language for AI + API |
| 2026-10-01 | Citizen side is a native app (React Native + Expo), not a PWA | Better camera/GPS/push; same React skills |
| 2026-10-01 | Police video: live view only, AI in RAM, clips saved only with supervisor approval | Privacy-by-design (DPDP Act principles) |
| 2026-10-02 | Monorepo with separate folders per system; API.md is the contract | Two people work in parallel without conflicts |
| 2026-10-02 | App name: **MyCityAI** | Team decision (repo name) |

## Open questions
- Friend's name and GitHub username (for CODEOWNERS)
- Which LLM API to use (Gemini free tier vs Groq/Llama vs OpenAI)?
- Cloud host for the demo backend (Render vs Railway) — or local only?
- Who builds the police system in Phase 9?

## Log
### 2026-10-02 — Municipal Phase 0
- Backend skeleton on branch `backend/phase0-setup`; dashboard skeleton on `dashboard/phase0-setup`.
- `docker-compose.yml` at repo root runs PostgreSQL 16 (`docker compose up -d db`). Backend also runs without DB; `/health` reports `database: unavailable`.
- Verified: dashboard on :5173 reaches backend on :8000 (CORS ok), tests + lint pass.
- Dashboard lint uses **oxlint** (Vite template default) instead of ESLint.

### 2026-10-02 — Repo initialised
- Created folder structure, planning docs (PRD, Architecture, API, Rules, Phases, Design, Memory), `shared/constants.json`, bridge JSON schema, CODEOWNERS template, `.gitignore`.
- Copied mockups and project PDF into `docs/assets/`.
