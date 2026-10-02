# Memory.md — Project Progress Log

> **Purpose:** keeps humans and AI assistants up to date so nobody has to re-read the whole codebase.
> **Update it** at the end of every work session or merged PR: what changed, decisions made, what's next.
> Keep entries short. Newest entries at the top of the log.

---

## Current status
| Item | Value |
|---|---|
| Current phase | **Phase 2 — Complaints core** done on municipal side; next: Phase 3 (see [Phases.md](Phases.md)) |
| API contract version | 0.1.2 (draft — friend still needs to approve 0.1.0–0.1.2) |
| Last updated | 2026-10-02 |

### Built so far
| Part | State |
|---|---|
| `municipal/backend` | Phase 2 done: auth (Phase 1) + complaints & timeline tables (migration 0002), photo upload to `MEDIA_DIR`, citizen submit/list/detail/timeline/home, staff queue (role scope, filters, sort, pagination), PATCH with transition/assignment rules, comments, staff list, nearest-ward detection, `seed --demo`. 43 tests. |
| `municipal/dashboard` | Phase 2 done: login + role routes (Phase 1), officer complaint queue (filters in URL, search, sort, pagination), complaint detail (photo, details, Leaflet map, timeline), assign / start work / reject / comment; ward rep "All Complaints" (read-only + comment). |
| `citizen-app` | Not started (folder + README only) |
| `police/*` | Not started — planned for Phase 9 |
| `ml/` | Not started |
| Docs | PRD, Architecture, API, Rules, Phases, Design written |

### Next steps
1. Both: review API.md and approve v0.1 (or request changes)
2. Paras: add friend's GitHub username to CODEOWNERS, enable branch protection on `main`
3. Friend: Expo app skeleton with mock API (Phase 0)
4. Friend: Phases 1–2 — OTP login, ward picker (`GET /wards`), Report screen (`POST /citizen/complaints`), My Complaints + detail + timeline
5. Paras: Phase 3 — WebSocket live updates on the dashboard, FCM push to citizens

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
### 2026-10-02 — Municipal Phase 2 (complaints)
- Branches `backend/phase2-complaints` and `dashboard/phase2-queue` (built on top of the backend branch).
- Backend reads enums/SLA/transitions from `shared/constants.json`; dashboard imports the same file (Vite `server.fs.allow`).
- Ward of a complaint = nearest ward centre point (sample coordinates in `app/seed.py`) — stand-in for real ward polygons.
- Priority is a fixed 50 until Phase 4 AI; demo seed sets varied scores to show sorting.
- Staff `comment` events are internal — hidden from the citizen timeline (API.md 0.1.2).
- `resolved` only via proof upload (Phase 5); staff cannot set closed/reopened/merged.
- Verified in browser with a real photo upload: queue → detail → assign → start work → comment; ward rep sees only Ward 12 and can only comment.
- Detail page is lazy-loaded (keeps Leaflet out of the main bundle).

### 2026-10-02 — Municipal Phase 1 (auth)
- Branches `backend/phase1-auth` (backend) and `dashboard/phase1-login` (dashboard, built on top of the backend branch).
- PyJWT + bcrypt instead of python-jose + passlib (passlib breaks with current bcrypt). Rules/Architecture updated.
- API.md 0.1.1: added `GET /wards`, OTP/login error codes, `type` claim in JWT. **Needs friend's approval.**
- Local Postgres moved to host port **5433** (5432 was taken by another project's container on Paras's PC).
- Dev logins: staff usernames in `municipal/backend/README.md`, password = `SEED_STAFF_PASSWORD`; citizen OTP = `DEV_OTP`.
- Verified in browser: wrong password error, officer → `/officer`, officer blocked from `/mayor`, reload keeps session, sign out, ward rep sees "Ward 12 · Rajarampuri", expired access token refreshed silently.
- Tokens are kept in localStorage (fine for the prototype; production would use httpOnly cookies).

### 2026-10-02 — Municipal Phase 0
- Backend skeleton on branch `backend/phase0-setup`; dashboard skeleton on `dashboard/phase0-setup`.
- `docker-compose.yml` at repo root runs PostgreSQL 16 (`docker compose up -d db`). Backend also runs without DB; `/health` reports `database: unavailable`.
- Verified: dashboard on :5173 reaches backend on :8000 (CORS ok), tests + lint pass.
- Dashboard lint uses **oxlint** (Vite template default) instead of ESLint.

### 2026-10-02 — Repo initialised
- Created folder structure, planning docs (PRD, Architecture, API, Rules, Phases, Design, Memory), `shared/constants.json`, bridge JSON schema, CODEOWNERS template, `.gitignore`.
- Copied mockups and project PDF into `docs/assets/`.
