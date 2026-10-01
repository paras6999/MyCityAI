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

## Getting started (Phase 0)
```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install fastapi "uvicorn[standard]" pydantic-settings sqlalchemy alembic psycopg[binary] python-jose passlib[bcrypt] python-multipart
uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs
