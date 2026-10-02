# Memory.md — Project Progress Log

> **Purpose:** keeps humans and AI assistants up to date so nobody has to re-read the whole codebase.
> **Update it** at the end of every work session or merged PR: what changed, decisions made, what's next.
> Keep entries short. Newest entries at the top of the log.

---

## Current status
| Item | Value |
|---|---|
| Current phase | **Phase 5 — Resolution proof & feedback** done on municipal side; next: Phase 6 announcements (see [Phases.md](Phases.md)) |
| API contract version | 0.1.6 (draft — friend still needs to approve 0.1.0–0.1.6) |
| Last updated | 2026-10-02 |

### Built so far
| Part | State |
|---|---|
| `municipal/backend` | Phase 2 done: auth (Phase 1) + complaints & timeline tables (migration 0002), photo upload to `MEDIA_DIR`, citizen submit/list/detail/timeline/home, staff queue (role scope, filters, sort, pagination), PATCH with transition/assignment rules, comments, staff list, nearest-ward detection, `seed --demo`. Phase 3: `WS /ws/dashboard` (role-scoped events), device tokens, Expo push on status change (citizen's language). Phase 4: LangGraph triage (Gemini photo+text, keyword fallback), priority score, duplicate merging (≤50 m), `/citizen/complaints/analyze`, `/staff/complaints/{id}/duplicates`. Phase 4b: local YOLO detection step (placeholder HF pothole model + COCO animals, registry `ml/vision/models.json`). Phase 5: proof upload with AI check (identical / YOLO before-after + same-place OpenCV match / Gemini / not checked), citizen confirm-rate-reopen, auto-close 72 h via in-process scheduler. 98 tests (+1 opt-in). |
| `municipal/dashboard` | Phase 2 done: login + role routes (Phase 1), officer complaint queue (filters in URL, search, sort, pagination), complaint detail (photo, details, Leaflet map, timeline), assign / start work / reject / comment; ward rep "All Complaints" (read-only + comment). Phase 3: live updates via WebSocket (auto-refresh, "New complaint" toast, Live/Reconnecting indicator, auto-reconnect + token refresh). Phase 4: AI analysis card, duplicate reports list, merged banner, AI summary in queue, YOLO boxes drawn on the photo. Phase 5: proof upload form (verdict toast), before/after card with AI verdict, citizen feedback (stars, reopen reason). |
| `citizen-app` | Not started (folder + README only) |
| `police/*` | Not started — planned for Phase 9 |
| `ml/` | Not started |
| Docs | PRD, Architecture, API, Rules, Phases, Design written |

### Next steps
1. Both: review API.md and approve v0.1 (or request changes)
2. Paras: add friend's GitHub username to CODEOWNERS, enable branch protection on `main`
3. Friend: Expo app skeleton with mock API (Phase 0)
4. Friend: Phases 1–3 — OTP login, ward picker, Report screen, My Complaints + detail + timeline, push (`getExpoPushTokenAsync` → `POST /auth/device-token`)
5. Paras: put a Gemini key in `municipal/backend/.env` (`GEMINI_API_KEY`) and try a real photo
6. Paras: Phase 6 — announcements (CRUD, ward targeting, AI draft/translate, auto-reply to linked complaints)
7. ML team: follow docs/ML.md — collect/label data, train `mycityai-yolov8s-v1` on Colab, then swap it into `ml/vision/models.json` (no code change)

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
| 2026-10-02 | AI = **Google Gemini** (photo+text in one call, embeddings); keyword fallback when unavailable; YOLO later | No trained YOLO models yet; one API covers vision + text |
| 2026-10-02 | **Own trained YOLO model is the main photo AI** (free, offline); Gemini optional (summary/translation); free HF pothole model as placeholder until ours is trained | No API cost, works offline, better for viva (own model + metrics) |
| 2026-10-02 | V-JEPA 2 (Meta, MIT) planned for police CCTV action recognition (fight/accident) in Phase 9 | YOLO sees objects, not actions |

## Open questions
- Friend's name and GitHub username (for CODEOWNERS)
- Cloud host for the demo backend (Render vs Railway) — or local only?
- Who builds the police system in Phase 9?

## Log
### 2026-10-02 — Municipal Phase 5 (proof & feedback)
- Branches `backend/phase5-proof` and `dashboard/phase5-proof`.
- Verification order: identical photo → YOLO (problem seen before gone after) → Gemini before/after → "not checked" (resolve; citizen's confirmation is the check). `proof.ai_verified` = true / false / null.
- **Gap found in live testing:** YOLO "verified" a repair using an unrelated bus photo. Added `app/agents/scene.py` (ORB + RANSAC): same place ≈ 390 matches, different ≈ 0–7; threshold 25. Different place → downgraded to "not checked".
- **Placeholder limitation:** pothole model marks mountains as pothole (49 %) → blocked a simulated genuine repair. Fix = train with sky/hill negatives (ML.md). Not worked around in code.
- `shared/constants.json`: `reopened → in_progress` allowed (officer still assigned). Needs friend's approval.
- Scheduler (`app/services/scheduler.py`) runs auto-close every 5 min in the API process; Phase 7 escalation will join it.

### 2026-10-02 — Phase 4b (local YOLO vision)
- Branch `backend/phase4b-vision` (contains backend + dashboard + docs; built on `dashboard/phase4-ai`).
- New LangGraph node `detect` before `analyze`. Models from `ml/vision/models.json` (labels → categories, SHA-256 checked, auto-download to `municipal/backend/models/`, preloaded at startup). Ultralytics/torch are optional (`requirements-ml.txt`, CPU wheels).
- Placeholder: peterhdd/pothole-detection-yolov8 (Apache-2.0, class "0" = pothole) + YOLOv8n COCO for dog/cow/horse/sheep → stray_animals.
- Verified live: real pothole photo with description "please fix this" → pothole, 3 boxes drawn on dashboard, ~0.15–0.3 s per photo on CPU after warm-up. **False positive seen** (mountains marked as pothole 74 %) — motivates training our own model.
- docs/ML.md = training guide (classes, datasets, labelling, Colab, deploy, metrics); `ml/vision/train.py`.

### 2026-10-02 — Municipal Phase 4 (AI triage)
- Branches `backend/phase4-ai` and `dashboard/phase4-ai`.
- Gemini (`gemini-2.5-flash`, `gemini-embedding-001`, both set in `.env`) returns category, severity, summary, objects, sensitive-location flag as JSON. **Not yet tested with a real key** — only with a faked Gemini in tests and the keyword fallback live.
- Priority = severity + boosts (duplicates, sensitive place, SLA waiting, forecast) — Architecture §5.2 updated (replaces the weighted-sum draft).
- Duplicates: same category, open, ≤ 50 m, last 30 days, cosine ≥ 0.6 when both have embeddings. Duplicate becomes `merged`, original gains +5 priority per report; merged reporters can view the original and get its pushes (message uses the original reporter's language).
- Merged reports are hidden from the default staff queue (`status=merged` shows them).
- Verified live (keyword fallback): "khadda near school" → pothole, priority 75; second report 15 m away → merged, original 80 with 2 reports; dashboard shows AI card, duplicates, merged banner.

### 2026-10-02 — Municipal Phase 3 (real-time)
- Branches `backend/phase3-realtime` and `dashboard/phase3-live`.
- **Push uses the Expo push service** (Expo push tokens), not raw FCM — works in Expo Go, no Firebase project needed. API.md 0.1.3. `PUSH_ENABLED=false` logs instead of sending.
- WebSocket hub is in-process (single backend worker). Multiple workers would need Redis pub/sub.
- Bug found in browser testing: events published from `async` routes (complaint submit) were silently dropped — asyncio tasks were garbage-collected. Fixed by holding task references.
- Bug found: app log lines (dev OTP, push) never printed — added `logging.basicConfig` in `app/main.py`.
- Verified: dashboard shows Live, new complaint appears with toast without refresh, Reconnecting when backend stops and Live again after restart, push message built in the citizen's language.

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
