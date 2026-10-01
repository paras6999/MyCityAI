# Rules.md — Rules for the Team and for AI Assistants

These rules apply to **every human and every AI coding assistant** (Claude, Copilot, Cursor, ChatGPT, Gemini …) working in this repo. AI assistants: read this file, [Architecture.md](Architecture.md), [API.md](API.md) and [Memory.md](Memory.md) before writing code.

---

## 1. Folder ownership (most important)

| Folder | Owner | Rule |
|---|---|---|
| `citizen-app/` | Friend | Only the owner edits. |
| `municipal/dashboard/` | Paras | Only the owner edits. |
| `municipal/backend/` | Paras | Friend may edit `app/routes/citizen.py` and `app/schemas/citizen.py` via PR. |
| `police/` | TBD | Not started until Phase 9. |
| `shared/`, `docs/API.md` | Both | PR approved by **both** owners. |

- An AI assistant working for one person must **only change files in that person's folders**. If a change elsewhere is needed, stop and describe it (e.g. "backend needs endpoint X") instead of editing.
- Never move, rename or reformat files you don't own.

## 2. System boundaries
1. **No code imports across systems.** `citizen-app`, `municipal/*` and `police/*` never import each other's code.
2. Apps talk to backends **only over HTTP/WebSocket** as defined in API.md.
3. Police and municipal have **separate databases, secrets and users**. The only connection is the one-way Bridge API.
4. `shared/` contains **data files only** (JSON), no executable code.

## 3. API contract rules
- [API.md](API.md) is the single source of truth. Code must match it exactly (field names, enums, status codes).
- Enum values come from [`shared/constants.json`](../shared/constants.json) — never hard-code new strings.
- **Changing the contract:** open a PR editing API.md (+ change-log row) → both approve → then implement.
- **Add, don't break:** add new *optional* fields; don't rename/remove fields or change types. If unavoidable, bump the version and agree a switch date.
- Clients must handle unknown enum values without crashing (show a generic label).
- Frontends start with **mock data shaped exactly like API.md** (`EXPO_PUBLIC_USE_MOCKS=true` / mock files) so nobody waits for the backend.

## 4. Libraries

### Use
| Area | Library |
|---|---|
| Backend | FastAPI, Pydantic v2, SQLAlchemy 2 (typed), Alembic, python-jose, passlib[bcrypt], httpx, pytest |
| AI | ultralytics (YOLOv8), sentence-transformers, scikit-learn, torch, langgraph |
| Web | React + Vite + TypeScript, Tailwind CSS, TanStack Query, React Router, axios, Recharts, react-leaflet, lucide-react, i18next |
| Mobile | Expo + expo-router + TypeScript, TanStack Query, axios, expo-image-picker, expo-location, expo-notifications, i18next, react-native-maps |

### Avoid
- Django / Flask / Express for the backends (we use FastAPI only).
- MongoDB or a second database type (PostgreSQL only).
- Redux (use TanStack Query for server state, React state/context for UI state).
- Heavy UI kits that fight Tailwind (MUI, Ant Design) on the dashboard.
- Bare React Native CLI / ejecting from Expo unless absolutely required.
- Adding a new dependency without a reason in the PR description.

## 5. Coding conventions

### General
- Small, focused functions; descriptive names; no dead code or commented-out blocks.
- Comments explain *why*, not *what*.
- No secrets, API keys, tokens or real phone numbers in code or commits — use `.env` and `.env.example`.

### Python (backends)
- Python 3.11+, type hints everywhere, format with **ruff** (`ruff format`, `ruff check`).
- Route handlers stay thin: validation in `schemas/`, logic in `services/`, AI in `agents/`.
- Pydantic schemas mirror API.md names exactly.
- Every role check uses the shared dependency (e.g. `require_role("officer")`), never inline `if` checks scattered around.
- DB changes only through Alembic migrations.

### TypeScript (app + dashboards)
- TypeScript strict mode; format with **Prettier**, lint with ESLint.
- All API calls live in `src/api/` — components never call `axios` directly.
- Types for API responses live in `src/api/types.ts`, copied from API.md.
- All user-visible text goes through i18n (`t("key")`), no hard-coded strings in screens.
- Colours, spacing and fonts come from the theme (see [Design.md](Design.md)), not inline hex values.

## 6. Error handling
- **Backend:** raise errors in the standard format from API.md §1 (`{"error": {"code", "message", "details"}}`) via one exception handler. Never return stack traces to clients. Log errors with context (user id, complaint id), never log OTPs, tokens or passwords.
- **Frontends:** every request handles loading, empty and error states. Show friendly messages ("Couldn't load complaints. Tap to retry."), not raw errors. On `401 TOKEN_EXPIRED` try `/auth/refresh` once, then log out.
- **AI agents:** if a model or LLM call fails, fall back safely (e.g. category `other`, priority `medium`, flag for manual review) — a complaint must never be lost because AI failed.
- **Uploads:** validate type and size on both client and server.

## 7. Privacy & security (non-negotiable)
- Police video and images **never** leave the police system and are **never** stored without supervisor approval.
- Bridge messages contain only fields allowed by `shared/bridge-schema`; unknown fields are rejected.
- No facial recognition, no number-plate storage.
- Staff see masked citizen phone numbers; public stats contain no personal data.
- Passwords hashed (bcrypt); JWT secrets only in `.env`; HTTPS in deployment.

## 8. Git workflow
- `main` must always run. **No direct pushes to `main`.**
- Branch names: `app/<feature>`, `dashboard/<feature>`, `backend/<feature>`, `police/<feature>`, `docs/<topic>` (e.g. `app/report-screen`).
- `git pull origin main` before starting work each day; merge small PRs often (every 1–2 days).
- Commit messages: short imperative summary, e.g. `Add complaint queue filters`.
- PR checklist: runs locally, matches API.md, no secrets, Memory.md updated if something important changed.
- Large files (datasets, `.pt` weights, videos) never go in git — store on Google Drive / Hugging Face and link in `ml/README.md`.

## 9. What AI assistants should do
- Read the docs listed at the top before coding; follow the current phase in [Phases.md](Phases.md).
- Build one small, working step at a time; run it/test it before moving on.
- Reuse existing helpers and patterns in the folder instead of creating parallel ones.
- Ask the user when requirements are unclear or a change would touch another owner's folder or API.md.
- After finishing a task, add a short entry to [Memory.md](Memory.md) (what was done, decisions, next step).

## 10. What AI assistants must NOT do
- Edit files outside the requesting person's folders, or change API.md / shared files without being asked.
- Invent endpoints, fields or enum values that aren't in API.md.
- Add libraries from the "Avoid" list or switch frameworks.
- Commit secrets, generate fake "real" credentials, or disable auth/role checks "for testing" in committed code.
- Store or transmit police video/images, or add facial recognition.
- Rewrite large working parts of the code base when a small change is enough.
- Push to `main` or force-push.
