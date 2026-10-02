# Phases.md — Build Plan

Build in small phases. Each phase ends with something **working and demoable**. AI assistants: work only on the current phase (see [Memory.md](Memory.md) for where we are).

Owners: **P** = Paras (municipal backend + dashboard) · **F** = Friend (citizen app) · **Both**

---

## Phase 0 — Setup (Week 1)
- [ ] Both: read PRD, Architecture, API, Rules, Design
- [ ] Both: review & approve API.md v0.1 (change anything now, it's cheapest)
- [ ] P: add both GitHub usernames to `.github/CODEOWNERS`, enable branch protection on `main`
- [x] P: `municipal/backend` skeleton — FastAPI app, `/api/v1/health`, config from `.env`, error handler
- [x] P: PostgreSQL running (local or Docker), Alembic initialised
- [x] P: `municipal/dashboard` skeleton — Vite + React + TS + Tailwind, theme from Design.md
- [ ] F: `citizen-app` skeleton — Expo + expo-router + TS, tab layout (Report · My Complaints · Updates · Stats), theme, i18n setup
- [ ] F: `src/api/` client with mock mode and types copied from API.md

**Done when:** all three run locally; app shows empty tabs; dashboard shows a login page; `/health` returns OK.

## Phase 1 — Auth (Week 2)
- [x] P: users & wards tables, seed data (officers per department, ward reps, mayor, admin)
- [x] P: `/auth/otp/request`, `/auth/otp/verify` (dev OTP `123456`), `/auth/login`, `/auth/refresh`, `/auth/me`
- [x] P: `require_role()` dependency
- [x] P: dashboard login page + role-based routing (officer / ward / mayor layouts)
- [ ] F: phone + OTP screens, store token securely (expo-secure-store), ward selection, logout

**Done when:** citizen logs in on phone; officer/ward rep/mayor each land on their own dashboard layout.

## Phase 2 — Complaints core (Weeks 3–4)
- [ ] P: complaint, timeline tables; media upload storage
- [ ] P: `POST /citizen/complaints` (category from user or `other` for now), `GET /citizen/complaints`, detail, timeline
- [ ] P: `GET /staff/complaints` with filters + role visibility, detail, `PATCH` status/assign with transition rules
- [ ] P: dashboard officer queue table + complaint detail page (photo, map, timeline) + assign/status actions
- [ ] F: Report screen — camera/gallery, GPS, description, submit
- [ ] F: My Complaints list + Complaint Detail with timeline
- [ ] Both: switch app from mocks to real backend on same Wi-Fi

**Done when:** complaint submitted from phone appears on officer dashboard (after refresh); status changes show in app.

## Phase 3 — Real-time & notifications (Week 5)
- [ ] P: WebSocket `/ws/dashboard` with role-scoped events
- [ ] P: FCM push sender + `/auth/device-token`
- [ ] P: dashboard live updates (new complaint appears without refresh, toast)
- [ ] F: register push token, handle notification tap → open screen
- [ ] F: pull-to-refresh, loading/empty/error states everywhere

**Done when:** officer sees new complaint instantly; citizen gets push on status change.

## Phase 4 — AI classification & priority (Weeks 6–7)
- [ ] P / ML: YOLOv8 model for potholes, garbage, waterlogging (train on Colab, weights outside git)
- [ ] P: text classifier (Sentence-BERT) + combine with photo result
- [ ] P: duplicate detection (embedding similarity + distance < 50 m) → `merged`
- [ ] P: priority score + SLA calculation
- [ ] P: `POST /citizen/complaints/analyze`
- [ ] P: LangGraph orchestrator wiring these steps; safe fallbacks if AI fails
- [ ] F: show AI category, confidence and duplicate warning before submit
- [ ] P: dashboard shows priority badge, AI summary, duplicate count; queue sorted by priority

**Done when:** pothole photo is auto-classified to Roads with priority; second nearby report is merged.

## Phase 5 — Resolution proof & feedback (Week 8)
- [ ] P: `POST /staff/complaints/{id}/proof` + before/after AI verification
- [ ] P: `POST /citizen/complaints/{id}/feedback`, auto-close after 72 h
- [ ] P: dashboard proof upload UI with before/after view
- [ ] F: after-photo shown in app, Rate / Confirm / Reopen

**Done when:** officer can't resolve without verified photo; citizen can reopen.

## Phase 6 — Announcements (Week 9)
- [ ] P: announcements CRUD with permission limits, ward targeting, recurrence
- [ ] P: AI draft + translation (LLM), publish flow, push for `important`/`emergency`
- [ ] P: auto-reply for complaints linked to active announcements
- [ ] P: dashboard "Post announcement" + AI suggestions panel
- [ ] F: Updates tab (ward feed, priority colours), language switch EN/मराठी/हिंदी, auto-reply message on Report screen

**Done when:** officer posts water delay → citizens in that ward get push in their language; "no water" complaint gets auto-reply.

## Phase 7 — Escalation, ward & mayor views (Weeks 10–11)
- [ ] P: escalation agent (scheduler) + manual escalate/remind
- [ ] P: summary endpoints (`/staff/summary*`)
- [ ] P: ward rep dashboard (KPIs, escalation inbox, department table, category chart)
- [ ] P: mayor dashboard (city KPIs, ward heatmap, department ranking)
- [ ] P: public stats endpoint + public stats page
- [ ] F: City Stats tab

**Done when:** overdue complaint automatically appears in ward rep inbox, then mayor's.

## Phase 8 — Utilities agent (Week 12)
- [ ] P / ML: simulated water & power sensor data generator
- [ ] P / ML: LSTM demand forecast + Isolation Forest anomaly detection
- [ ] P: anomalies → AI suggestions; forecast risk → priority score

**Done when:** simulated leak creates an anomaly suggestion on the water officer dashboard.

## Phase 9 — Police system (Weeks 13–14)
- [ ] police/backend skeleton (:9000), separate DB, police roles
- [ ] MediaMTX relay (recording off) + live grid in police dashboard
- [ ] YOLO video analytics with RAM buffer → text alerts → WebSocket
- [ ] Evidence request → supervisor approval → encrypted clip, 30-day expiry, audit log
- [ ] Anonymizer + bridge client (HMAC) → municipal `/bridge/events`, `/bridge/stats`
- [ ] P: municipal `/bridge/*` endpoints, road_closure → emergency announcement, infra_issue → complaint
- [ ] P: Infrastructure insights page (hotspots, recommendations, work order)

**Done when:** accident on recorded video → police alert → road closure announcement reaches citizen app.

## Phase 10 — Testing, evaluation, polish (Weeks 15–16)
- [ ] Model metrics: YOLO mAP/precision/recall, classifier F1, LSTM MAE/RMSE
- [ ] Simulation: manual routing vs agent routing time; duplicates prevented
- [ ] Usability test with 5–10 users
- [ ] Bug fixes, UI polish, README setup guide
- [ ] Android APK build (EAS), docker-compose demo, final report & presentation

---

## Parallel work map
| Week | Paras (backend + dashboard) | Friend (citizen app) |
|---|---|---|
| 1 | Backend + dashboard skeletons | App skeleton, mock API client |
| 2 | Auth APIs, dashboard login | OTP login screens |
| 3–4 | Complaint APIs, officer queue | Report + My Complaints (mocks → real) |
| 5 | WebSocket, FCM | Push notifications, states |
| 6–7 | AI classification, priority | AI preview + duplicate warning UI |
| 8 | Proof + feedback APIs | Rate / Reopen |
| 9 | Announcements + AI drafts | Updates tab + languages |
| 10–11 | Escalation, ward/mayor views | City Stats tab, polish |
| 12 | Utilities agent | App polish, offline handling |
| 13–14 | Bridge + insights (+ police) | Help with police dashboard |
| 15–16 | Evaluation, fixes | APK build, usability test |
