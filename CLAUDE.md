# CLAUDE.md

Instructions for AI coding assistants (Claude Code and others) working in this repo.

Before writing any code, read:
1. [docs/Memory.md](docs/Memory.md) — current phase, what's built, decisions
2. [docs/Rules.md](docs/Rules.md) — folder ownership and do/don't rules (mandatory)
3. [docs/API.md](docs/API.md) — the API contract; never invent endpoints or fields
4. [docs/Architecture.md](docs/Architecture.md) — structure and stack
5. [docs/Phases.md](docs/Phases.md) — work only on the current phase
6. [docs/Design.md](docs/Design.md) — for any UI work

Key rules (full list in Rules.md):
- Only edit the folders owned by the person you are helping. Citizen app → `citizen-app/`. Dashboard/backend → `municipal/`.
- `docs/API.md` and `shared/` change only when the user explicitly asks.
- No imports across `citizen-app/`, `municipal/` and `police/`; they talk over HTTP only.
- Use enum values from `shared/constants.json`.
- Never store or send police video/images; no facial recognition.
- No secrets in code; use `.env` + `.env.example`.
- After finishing a task, add a short entry to `docs/Memory.md`.
