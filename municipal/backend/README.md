# ⚙ municipal/backend — Municipal API + AI Agents

**Owner:** Paras · **Stack:** Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, PostgreSQL, LangGraph · **Port:** 8000

Implements everything in [docs/API.md](../../docs/API.md) except §12 (police).

## Planned structure
```
backend/
├── app/
│   ├── main.py
│   ├── core/          config.py, security.py (JWT, roles), db.py, errors.py
│   ├── models/        SQLAlchemy models
│   ├── schemas/       Pydantic models — names match API.md
│   ├── routes/        auth, citizen*, complaints_staff, ward, mayor, announcements, stats, insights, bridge, ws
│   ├── services/      status transitions, SLA, push (FCM), media
│   └── agents/        orchestrator, classifier, vision, verification, escalation, announcement, utilities, insights
├── alembic/
├── tests/
├── requirements.txt
└── .env.example
```
`*` `routes/citizen.py` + `schemas/citizen.py` may also be edited by the citizen-app owner via PR.

## Getting started
Run all commands from `municipal/backend/`.

**1. Python environment**
```bash
python -m venv .venv
.venv\Scripts\activate          # Windows (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          # macOS/Linux: cp .env.example .env
```

**2. Database (PostgreSQL in Docker)** — start Docker Desktop, then from the repo root:
```bash
docker compose up -d db
```
The API also starts without a database; `/health` then reports `"database": "unavailable"`.

**3. Run the API**
```bash
uvicorn app.main:app --reload --port 8000
```
- Health check: http://localhost:8000/api/v1/health
- Interactive API docs: http://localhost:8000/docs
- From a phone on the same Wi-Fi: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`, then use `http://<laptop-ip>:8000`

**4. Tests & lint**
```bash
pytest
ruff check . && ruff format .
```

**5. Migrations** (once models exist)
```bash
alembic revision --autogenerate -m "add users table"
alembic upgrade head
```

## Conventions
- Raise `APIError(status, "CODE", "message")` from `app/core/errors.py` — all errors use the API.md format.
- Routes are mounted under `/api/v1` in `app/main.py`.
- New models: subclass `Base` from `app/models/__init__.py` and import them there so Alembic sees them.
