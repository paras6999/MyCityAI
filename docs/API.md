# API.md — MyCityAI API Contract

> **This file is the agreement between the Citizen App, the Municipal Dashboard and the backends.**
> If code and this file disagree, this file wins. Change it only through a Pull Request approved by both owners (see [Rules.md](Rules.md#3-api-contract-rules)).

**Version:** 0.1.6 (draft) · **Last updated:** 2026-10-02

---

## Contents
1. [Conventions](#1-conventions)
2. [Shared enums](#2-shared-enums)
3. [Data models](#3-data-models)
4. [Auth](#4-auth)
5. [Citizen endpoints](#5-citizen-endpoints) — used by Citizen App
6. [Staff endpoints](#6-staff-endpoints) — used by Municipal Dashboard
7. [Announcements](#7-announcements)
8. [Public statistics](#8-public-statistics)
9. [Infrastructure insights](#9-infrastructure-insights)
10. [Real-time: WebSocket & push](#10-real-time-websocket--push)
11. [Bridge API (Police → Municipal)](#11-bridge-api-police--municipal)
12. [Police system API (internal)](#12-police-system-api-internal)
13. [Change log](#13-change-log)

---

## 1. Conventions

| Item | Rule |
|---|---|
| Municipal base URL (dev) | `http://localhost:8000/api/v1` (phone on same Wi-Fi: `http://<laptop-ip>:8000/api/v1`) |
| Police base URL (dev) | `http://localhost:9000/api/v1` |
| Format | JSON, UTF-8. File uploads use `multipart/form-data` |
| Field names | `snake_case` |
| IDs | integers (`id`). Human-readable complaint code in `code`, e.g. `"KMC-2026-04187"` |
| Timestamps | ISO 8601 with timezone, e.g. `"2026-10-02T09:12:00+05:30"` |
| Coordinates | `lat`, `lng` as decimal degrees (numbers) |
| Auth header | `Authorization: Bearer <access_token>` |
| Optional fields | Always present in responses; value `null` when empty (never omitted) |
| Unknown values | Clients must not crash on unknown enum values — show a generic label |

### Pagination
List endpoints accept `?page=1&page_size=20` (max 100) and return:
```json
{ "items": [ ... ], "page": 1, "page_size": 20, "total": 134 }
```

### Error format (all errors)
```json
{ "error": { "code": "COMPLAINT_NOT_FOUND", "message": "Complaint 4187 not found", "details": null } }
```

| HTTP | `code` examples | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad input (`details` lists fields as `{ "field", "message" }`) |
| 400 | `OTP_INVALID`, `OTP_EXPIRED` | Wrong / expired OTP |
| 401 | `INVALID_CREDENTIALS` | Wrong staff username or password |
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED` | Missing / invalid / expired token |
| 403 | `FORBIDDEN` | Logged in, but role not allowed |
| 404 | `*_NOT_FOUND` | Resource does not exist (or not visible to this user) |
| 409 | `INVALID_STATUS_TRANSITION` | e.g. closing an unresolved complaint |
| 413 | `FILE_TOO_LARGE` | Upload over limit (photos: 8 MB) |
| 429 | `RATE_LIMITED` | Too many requests (e.g. OTP) |
| 500 | `INTERNAL_ERROR` | Server bug |

---

## 2. Shared enums

The same lists live in machine-readable form in [`shared/constants.json`](../shared/constants.json). **Both apps must use these exact strings.**

### 2.1 `role`
| Value | Who | Uses |
|---|---|---|
| `citizen` | Public | Citizen App |
| `officer` | Department officer (has `department`) | Dashboard |
| `ward_rep` | Ward representative (has `ward_id`) | Dashboard |
| `mayor` | Mayor / commissioner | Dashboard |
| `admin` | System admin (users, wards, config) | Dashboard |

### 2.2 `department`
`water` · `roads` · `waste` · `electricity` · `drainage` · `health` · `other`

### 2.3 `category` (what the issue is)
| Category | Default department | Default SLA |
|---|---|---|
| `pothole` | roads | 48 h |
| `road_damage` | roads | 72 h |
| `garbage` | waste | 24 h |
| `illegal_dumping` | waste | 48 h |
| `water_leakage` | water | 24 h |
| `no_water_supply` | water | 12 h |
| `pipeline_burst` | water | 6 h |
| `contaminated_water` | water | 12 h |
| `streetlight` | electricity | 72 h |
| `power_outage` | electricity | 12 h |
| `drainage_overflow` | drainage | 24 h |
| `waterlogging` | drainage | 12 h |
| `fallen_tree` | roads | 24 h |
| `stray_animals` | health | 72 h |
| `other` | other | 72 h |

### 2.4 `status` and allowed transitions
```
new ──► assigned ──► in_progress ──► resolved ──► closed
 │          │             │              │
 │          └─────────────┴──► rejected  └──► reopened ──► assigned / in_progress
 └──► merged   (duplicate merged into another complaint)
```
| Status | Meaning | Who sets it |
|---|---|---|
| `new` | Submitted, AI classified, not yet assigned | System |
| `merged` | Duplicate; see `merged_into_id` | System |
| `assigned` | Officer / field staff assigned | Officer |
| `in_progress` | Work started | Officer |
| `resolved` | Fixed; after-photo uploaded and passed the AI check (or AI could not check) | Officer (needs proof) |
| `closed` | Citizen confirmed, or no response within 72 h of `resolved` | Citizen / System |
| `reopened` | Citizen says not fixed | Citizen |
| `rejected` | Invalid / not municipal responsibility (reason required) | Officer |

Invalid transitions return `409 INVALID_STATUS_TRANSITION`.

### 2.5 `priority_level` (derived from `priority_score` 0–100)
| Level | Score | Colour |
|---|---|---|
| `low` | 0–39 | green |
| `medium` | 40–69 | amber |
| `high` | 70–89 | red |
| `critical` | 90–100 | dark red |

### 2.6 `escalation_level`
`0` = officer · `1` = ward_rep · `2` = mayor

### 2.7 `announcement_priority`
`emergency` (push + pinned) · `important` (push) · `general` (feed only)

### 2.8 `language`
`en` · `mr` (Marathi) · `hi` (Hindi)

### 2.9 `source` (where a complaint came from)
`citizen_app` · `police_bridge` · `sensor` (Utilities agent) · `staff` (entered by staff)

---

## 3. Data models

### 3.1 `User`
```json
{
  "id": 42,
  "name": "Er. S. Kulkarni",
  "phone": "+919876543210",
  "role": "officer",
  "department": "water",
  "ward_id": null,
  "language": "en",
  "created_at": "2026-10-02T09:00:00+05:30"
}
```
`department` only for `officer`; `ward_id` for `citizen` (home ward) and `ward_rep`.

### 3.2 `Ward`
```json
{ "id": 12, "number": 12, "name": "Rajarampuri", "rep_user_id": 7 }
```

### 3.3 `Location`
```json
{ "lat": 16.6968, "lng": 74.2433, "address": "Near Rajarampuri bus stop", "ward_id": 12 }
```
`address` may be `null`. `ward_id` is computed by the backend from coordinates (prototype: nearest ward centre point).

### 3.4 `Complaint` (full — what the dashboard sees)
```json
{
  "id": 4187,
  "code": "KMC-2026-04187",
  "source": "citizen_app",
  "description": "Big pothole near bus stop, two-wheelers falling at night",
  "category": "pothole",
  "department": "roads",
  "location": { "lat": 16.6968, "lng": 74.2433, "address": "Near Rajarampuri bus stop", "ward_id": 12 },
  "photo_url": "/media/complaints/4187/photo.jpg",
  "status": "in_progress",
  "priority_score": 82,
  "priority_level": "high",
  "ai": {
    "category_confidence": 0.94,
    "detected_objects": ["pothole"],
    "summary": "Large pothole at bus stop causing two-wheeler falls at night",
    "severity": 72,
    "sensitive_location": true,
    "model": "yolo",
    "detections": [ { "label": "pothole", "confidence": 0.91, "box": [0.33, 0.68, 0.59, 0.87] } ]
  },
  "duplicate_count": 3,
  "merged_into_id": null,
  "assigned_to": { "id": 42, "name": "Er. V. Patil" },
  "sla_hours": 48,
  "sla_due_at": "2026-09-30T09:12:00+05:30",
  "escalation_level": 0,
  "proof": null,
  "feedback": null,
  "reporter": { "id": 101, "name": "Ravi P.", "phone_masked": "+91******3210" },
  "created_at": "2026-09-28T09:12:00+05:30",
  "updated_at": "2026-09-29T11:40:00+05:30"
}
```

- `photo_url` is a path on the backend (prefix it with the server origin, e.g. `http://<host>:8000/media/...`). It is `null` for complaints without a photo (`police_bridge`, `sensor`, `staff` sources).
- `ai.model`: `"yolo"` when our local YOLO model detected objects in the photo, `"gemini"` when Google Gemini analysed it, `"keywords"` for the text-only fallback. Category priority: citizen's choice > YOLO > Gemini > keywords. `ai.summary` comes from Gemini only (else `null`).
- `ai.detections`: objects found by YOLO — `label` (a category), `confidence`, `box` = `[x1, y1, x2, y2]` as fractions (0–1) of the photo's width/height, so apps can draw boxes at any size.
- `priority_score` = AI severity (0–100) + boosts: +5 per merged duplicate (max +20), +15 near a school/hospital/bus stop etc., up to +15 as the SLA deadline approaches, up to +10 forecast risk (Phase 8). Capped at 100.

### 3.5 `CitizenComplaint` (what the Citizen App sees)
Same as `Complaint` **minus** `reporter`, `escalation_level`, `assigned_to.id` and all `ai` fields except `category_confidence` and `summary`. Citizens see their own complaints, plus any complaint their report was merged into (`merged_into_id`).

### 3.6 `TimelineEvent`
```json
{
  "id": 9001,
  "complaint_id": 4187,
  "type": "status_changed",
  "from_status": "assigned",
  "to_status": "in_progress",
  "note": "Team on site",
  "actor": { "id": 42, "name": "Er. V. Patil", "role": "officer" },
  "created_at": "2026-09-29T11:40:00+05:30"
}
```
`type`: `created` · `classified` · `merged` · `assigned` · `status_changed` · `escalated` · `proof_uploaded` · `proof_verified` · `feedback` · `reopened` · `comment` · `auto_reply`

### 3.7 `Proof`
```json
{
  "after_photo_url": "/media/complaints/4187/after-1759200000.jpg",
  "note": "Pothole filled and levelled",
  "ai_verified": true,
  "ai_confidence": 0.91,
  "reason": "Pothole seen before is no longer visible",
  "method": "yolo",
  "uploaded_at": "2026-09-30T08:00:00+05:30"
}
```
`ai_verified`: `true` = AI confirmed the fix · `false` = AI says not fixed (latest failed attempt) · `null` = AI could not check (the citizen's confirmation is the check).
`method`: `identical` (same photo as the complaint) · `yolo` (our model: problem seen before, gone after) · `gemini` (before/after comparison) · `none`.
Complaints also carry `resolved_at` (time of the last resolution, `null` otherwise).

### 3.8 `Feedback`
```json
{ "rating": 4, "comment": "Fixed quickly", "action": "confirm", "created_at": "2026-09-30T10:00:00+05:30" }
```
`action`: `confirm` (→ `closed`), `reopen` (→ `reopened`, `comment` required) or `auto_closed` (system closed it 72 h after resolution without an answer). `rating` 1–5 or `null`.

### 3.9 `Announcement`
```json
{
  "id": 310,
  "title": { "en": "Water Supply Delayed", "mr": "पाणीपुरवठा उशिरा", "hi": "जल आपूर्ति में देरी" },
  "message": { "en": "Supply delayed by 2 hours today (pipeline repair). New timing: 8–10 AM.", "mr": "...", "hi": "..." },
  "priority": "important",
  "department": "water",
  "ward_ids": [12],
  "city_wide": false,
  "author": { "id": 42, "name": "Er. S. Kulkarni", "role": "officer" },
  "source": "staff",
  "ai_drafted": true,
  "valid_from": "2026-10-02T06:00:00+05:30",
  "valid_until": "2026-10-02T12:00:00+05:30",
  "recurrence": null,
  "linked_categories": ["no_water_supply"],
  "created_at": "2026-10-02T05:30:00+05:30"
}
```
- `title` / `message` always contain `en`; `mr` / `hi` may be `null` until translated.
- `source`: `staff` · `police_bridge` · `system`.
- `recurrence`: `null` or `{ "rule": "daily" | "weekly", "days": ["mon","tue"], "time": "06:00" }`.
- `linked_categories`: while active, new complaints in these categories from these wards get an automatic reply.

---

## 4. Auth

### 4.1 Citizen login (phone OTP) — *Citizen App*
**`POST /auth/otp/request`**
```json
{ "phone": "+919876543210" }
```
→ `200 { "sent": true, "expires_in": 300 }` · In development the OTP is always `123456` and is also printed in the backend log.
Requesting again within 30 s → `429 RATE_LIMITED`.

**`POST /auth/otp/verify`**
```json
{ "phone": "+919876543210", "otp": "123456" }
```
→ `200`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": { "...User..." },
  "is_new_user": true
}
```

Errors: `400 OTP_INVALID` (wrong code), `400 OTP_EXPIRED`, `429 RATE_LIMITED` (after 5 wrong attempts — request a new OTP), `403 FORBIDDEN` (phone belongs to a staff account).
A new citizen has `name: null` and `ward_id: null` — the app should ask for name and ward and save them with `PATCH /auth/me`.

### 4.2 Staff login — *Dashboard*
**`POST /auth/login`**
```json
{ "username": "kulkarni.water", "password": "••••••" }
```
→ same response shape as 4.1 (without `is_new_user`). Wrong username/password → `401 INVALID_CREDENTIALS`.

### 4.3 Common
| Method | Path | Body / Response |
|---|---|---|
| `POST` | `/auth/refresh` | `{ "refresh_token": "..." }` → new tokens |
| `GET` | `/auth/me` | → `User` |
| `PATCH` | `/auth/me` | `{ "name"?, "language"?, "ward_id"? }` → `User` (`ward_id` only for citizens; staff → `403`) |
| `POST` | `/auth/device-token` | `{ "token": "ExponentPushToken[...]", "platform": "android" }` → `204` (Citizen App, for push — see §10.2) |
| `DELETE` | `/auth/device-token` | same body → `204` (call on logout) |

JWT payload:
```json
{ "sub": "42", "role": "officer", "department": "water", "ward_id": null, "type": "access", "exp": 1759400000 }
```
`type` is `access` or `refresh`; a refresh token is rejected on normal endpoints.

### 4.4 Wards — *Citizen App + Dashboard*
**`GET /wards`** — no login required (used by the ward picker on first login)
```json
{ "items": [ { "id": 12, "number": 12, "name": "Rajarampuri", "rep_user_id": 7 } ] }
```
Sorted by `number`. `rep_user_id` is `null` when the ward has no representative.

---

## 5. Citizen endpoints
Backend file: `municipal/backend/app/routes/citizen.py` · Role: `citizen`

### 5.1 Pre-check a photo (optional, before submit)
**`POST /citizen/complaints/analyze`** — `multipart/form-data`: `photo` (file), `lat`, `lng`

Shows the AI category and duplicate warning before the citizen presses Submit.
```json
{
  "suggested_category": "pothole",
  "department": "roads",
  "confidence": 0.94,
  "priority_level": "high",
  "summary": "Large pothole at bus stop",
  "is_civic_issue": true,
  "detections": [ { "label": "pothole", "confidence": 0.91, "box": [0.33, 0.68, 0.59, 0.87] } ],
  "nearby_duplicates": [ { "id": 4180, "code": "KMC-2026-04180", "category": "pothole", "distance_m": 18, "status": "assigned" } ],
  "active_announcement": null
}
```
If an active announcement explains the issue (e.g. planned water shutdown), `active_announcement` contains that `Announcement` and the app should show it (from Phase 6).
`is_civic_issue: false` means the AI thinks the photo shows no municipal problem — the app can ask the citizen to retake it, but submitting is still allowed. `nearby_duplicates` lists open same-category complaints within 50 m (max 5). Nothing is saved by this call.

### 5.2 Submit complaint
**`POST /citizen/complaints`** — `multipart/form-data`

| Field | Type | Required |
|---|---|---|
| `photo` | image (jpg/png, ≤ 8 MB) | yes |
| `description` | string (≤ 1000 chars) | no |
| `lat`, `lng` | number | yes |
| `address` | string | no |
| `category` | `category` | no — AI decides if missing |
| `language` | `language` | no (default user's language) |

→ `201` `CitizenComplaint`. If it duplicates an open complaint (same category, within 50 m, similar text when available): `status = "merged"`, `merged_into_id` set. The citizen can open the original with `GET /citizen/complaints/{merged_into_id}` and receives its push notifications.
A missing `category` is chosen by the AI (or the keyword fallback); a category the citizen picked is kept. Non-JPG/PNG photo → `400 VALIDATION_ERROR`; over 8 MB → `413 FILE_TOO_LARGE`.

### 5.3 My complaints
| Method | Path | Response |
|---|---|---|
| `GET` | `/citizen/complaints?status=&page=` | paginated `CitizenComplaint` |
| `GET` | `/citizen/complaints/{id}` | `CitizenComplaint` |
| `GET` | `/citizen/complaints/{id}/timeline` | `{ "items": [TimelineEvent] }` — staff `comment` events are internal and not included |

### 5.4 Feedback (confirm or reopen)
**`POST /citizen/complaints/{id}/feedback`** — only when status is `resolved`
```json
{ "action": "reopen", "rating": 2, "comment": "Pothole is back after rain" }
```
→ `200` `CitizenComplaint`. Errors: `409` if not `resolved`, `400` if `reopen` without `comment`, `403` if the user is only following a merged complaint (only the original reporter answers). Without an answer the complaint closes automatically 72 h after resolution.

### 5.5 Home screen summary
**`GET /citizen/home`**
```json
{
  "open_complaints": 2,
  "recent_complaints": [ "...CitizenComplaint (max 3)..." ],
  "announcements": [ "...Announcement (max 5, active, my ward)..." ],
  "ward": { "id": 12, "number": 12, "name": "Rajarampuri" }
}
```

---

## 6. Staff endpoints
Backend files: `routes/complaints_staff.py`, `routes/ward.py`, `routes/mayor.py` · Roles: `officer`, `ward_rep`, `mayor`, `admin`

### 6.1 Visibility (applied automatically by the backend)
| Role | Sees |
|---|---|
| `officer` | complaints where `department` = own department |
| `ward_rep` | complaints where `location.ward_id` = own ward |
| `mayor`, `admin` | all complaints |

### 6.2 Complaint queue
**`GET /staff/complaints`**

Query params (all optional): `status`, `category`, `department`, `ward_id`, `priority_level`, `escalation_level`, `sla` (`overdue` \| `due_soon`), `q` (text search), `sort` (`priority` default \| `created_at` \| `sla_due_at`), `page`, `page_size`

→ paginated `Complaint`. Without a `status` filter, `merged` reports are left out (they are listed under their original via §6.3 duplicates); use `status=merged` to see them.

### 6.3 Complaint detail
| Method | Path | Response |
|---|---|---|
| `GET` | `/staff/complaints/{id}` | `Complaint` |
| `GET` | `/staff/complaints/{id}/timeline` | `{ "items": [TimelineEvent] }` |
| `GET` | `/staff/complaints/{id}/duplicates` | `{ "items": [Complaint] }` reports merged into this one (oldest first) |

### 6.4 Update complaint
**`PATCH /staff/complaints/{id}`**
```json
{ "status": "in_progress", "assigned_to_id": 42, "note": "Team on site", "category": null, "department": null }
```
All fields optional. Roles: `officer` (own department), `mayor`, `admin`; `ward_rep` → `403`.

Rules:
- Setting `assigned_to_id` on a `new`/`reopened` complaint also moves it to `assigned`. The assignee must be an active officer of the complaint's department (else `400`).
- `status` must follow §2.4 transitions, else `409 INVALID_STATUS_TRANSITION`.
- `resolved` is only reachable through the proof upload (§6.5); `closed`, `reopened` and `merged` are set by the citizen / system, never by staff → `409`.
- `rejected` requires `note` (`400` otherwise). A `note` without a status change is stored as a comment.
- Changing `category`/`department` re-routes the complaint (only while `new`/`assigned`/`reopened`, else `409`). Moving to another department clears the assignee and returns an `assigned` complaint to `new`.
→ `Complaint`

### 6.5 Upload resolution proof
**`POST /staff/complaints/{id}/proof`** — `multipart/form-data`: `after_photo` (file), `note`

Only while the complaint is `in_progress` (else `409`). The AI checks the after-photo (see §3.7 `method`):
- `ai_verified: true` or `null` (could not check) → status becomes `resolved`, the reporter (and followers) get a `feedback_request` push.
- `ai_verified: false` → stays `in_progress`; the reason is added to the timeline. Upload a better photo to try again.
```json
{ "complaint": { "...Complaint..." }, "verification": { "ai_verified": false, "ai_confidence": 0.88, "reason": "Pothole still visible (88%)", "method": "yolo" } }
```

### 6.6 Comment / escalate
| Method | Path | Body |
|---|---|---|
| `POST` | `/staff/complaints/{id}/comments` | `{ "note": "Material ordered" }` |
| `POST` | `/staff/complaints/{id}/escalate` | `{ "reason": "Needs extra budget" }` (manual escalation, +1 level) |
| `POST` | `/staff/complaints/{id}/remind` | `{}` (ward rep / mayor reminds the assigned officer) |

Automatic escalation: when `sla_due_at` passes and status is not `resolved`/`closed`, the Escalation Agent raises `escalation_level` by 1 and sets a new deadline (24 h).

### 6.7 Staff list (for assignment)
**`GET /staff/users?department=water&role=officer`** → `{ "items": [User] }`

### 6.8 Dashboard summaries
**`GET /staff/summary`** — KPI cards for the logged-in role
```json
{
  "open": 38,
  "due_soon": 7,
  "overdue": 3,
  "resolved_this_week": 64,
  "avg_resolution_hours": 21.4,
  "escalated_to_me": 5,
  "satisfaction_avg": 4.1,
  "duplicates_merged": 1127
}
```
Fields not relevant to a role are `null`.

**`GET /staff/summary/departments?ward_id=`**
```json
{ "items": [ { "department": "water", "open": 6, "resolved": 58, "resolution_rate": 0.91, "avg_resolution_hours": 19, "sla_breaches": 8 } ] }
```

**`GET /staff/summary/wards`** — mayor / admin (heatmap)
```json
{ "items": [ { "ward_id": 7, "number": 7, "name": "Mahadwar Road", "pending": 41, "resolved": 1215, "resolution_rate": 0.68 } ] }
```

**`GET /staff/summary/categories?ward_id=`**
```json
{ "items": [ { "category": "garbage", "count": 52 } ] }
```

### 6.9 AI suggestions panel
**`GET /staff/ai-suggestions`**
```json
{
  "items": [
    { "id": 77, "type": "announcement_draft", "title": "Draft announcement ready", "body": "Water supply in Ward 12 delayed by 2 hours...", "ref": { "announcement_id": 311 } },
    { "id": 78, "type": "anomaly", "title": "Possible leak / theft in Ward 7", "body": "Night-time flow +38% above normal", "ref": { "ward_id": 7 } },
    { "id": 79, "type": "auto_replies", "title": "Auto-replied 14 complaints", "body": "Linked to scheduled shutdown in Ward 5", "ref": { "announcement_id": 305 } }
  ]
}
```
`type`: `announcement_draft` · `anomaly` · `auto_replies` · `hotspot` · `escalation_risk`
**`POST /staff/ai-suggestions/{id}/dismiss`** → `204`

---

## 7. Announcements
Backend file: `routes/announcements.py`

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/announcements?ward_id=12&lang=mr&active=true&page=` | citizen, staff | Feed (citizens: own ward + city-wide only) |
| `GET` | `/announcements/{id}` | citizen, staff | One announcement |
| `POST` | `/announcements` | officer, ward_rep, mayor | Create |
| `PATCH` | `/announcements/{id}` | author, mayor | Edit |
| `DELETE` | `/announcements/{id}` | author, mayor | Remove |
| `POST` | `/announcements/draft` | officer, ward_rep, mayor | AI draft from short text |
| `POST` | `/announcements/{id}/publish` | officer, ward_rep, mayor | Approve an AI draft |

**`POST /announcements`**
```json
{
  "title_en": "Water Supply Delayed",
  "message_en": "Supply delayed by 2 hours today (pipeline repair). New timing: 8–10 AM.",
  "priority": "important",
  "department": "water",
  "ward_ids": [12],
  "city_wide": false,
  "valid_from": "2026-10-02T06:00:00+05:30",
  "valid_until": "2026-10-02T12:00:00+05:30",
  "recurrence": null,
  "linked_categories": ["no_water_supply"],
  "auto_translate": true
}
```
Permission limits: officer → own department only · ward_rep → own ward only · `city_wide: true` → mayor only.
→ `201` `Announcement` (translations filled asynchronously when `auto_translate` is true).

**`POST /announcements/draft`**
```json
{ "text": "pipeline repair ward 12, water 2 hrs late, new time 8-10", "department": "water", "ward_ids": [12] }
```
→ `201` `Announcement` with `ai_drafted: true` (not visible to citizens until published).

---

## 8. Public statistics
Backend file: `routes/stats.py` · **No login required** (Citizen App "City Stats" tab + public web page + dashboard)

**`GET /stats/public?period=2026`** (`period`: `YYYY` or `YYYY-MM`)
```json
{
  "period": "2026",
  "total_complaints": 48905,
  "resolved": 42117,
  "resolution_rate": 0.861,
  "avg_resolution_hours": 27,
  "satisfaction_avg": 4.0,
  "ratings_count": 31420,
  "monthly": [ { "month": "2026-09", "received": 6482, "resolved": 5391 } ],
  "by_department": [ { "department": "water", "resolution_rate": 0.91 } ],
  "top_wards": [ { "ward_id": 16, "name": "Tarabai Park", "resolved": 612, "resolution_rate": 0.95 } ]
}
```
No personal data is ever returned by this endpoint.

---

## 9. Infrastructure insights
Backend file: `routes/insights.py` · Roles: `mayor`, `admin` (read), `ward_rep` (own ward). Data comes from the police bridge (§11).

| Method | Path | Response |
|---|---|---|
| `GET` | `/insights/hotspots?period=2026-09` | accident hotspots |
| `GET` | `/insights/congestion?period=2026-09` | congestion patterns |
| `GET` | `/insights/recommendations` | AI recommendations |
| `POST` | `/insights/recommendations/{id}/work-order` | creates a `staff`-source complaint for the right department |
| `GET` | `/insights/impact/{location_id}` | before/after accident counts |

**Hotspot item**
```json
{ "location_id": "dabholkar-corner", "name": "Dabholkar Corner", "lat": 16.70, "lng": 74.24, "ward_id": 11, "accidents": 14, "months": 3, "peak_hours": "19-21" }
```
**Recommendation item**
```json
{ "id": 5, "location_id": "dabholkar-corner", "title": "Accident hotspot: Dabholkar Corner", "reason": "14 accidents in 3 months, 71% between 7–9 PM", "actions": ["street lighting", "speed breaker", "zebra crossing"], "status": "open" }
```

---

## 10. Real-time: WebSocket & push

### 10.1 Dashboard WebSocket
**`WS /ws/dashboard?token=<access_token>`** (no `/api/v1` prefix, e.g. `ws://localhost:8000/ws/dashboard?token=...`) — server pushes events the user is allowed to see (same scope as §6.1). `data` is the staff `Complaint` (§3.4).

Close codes: `4401` = token missing/invalid/expired → refresh the token and reconnect · `4403` = role not allowed (citizens) → don't retry.
```json
{ "event": "complaint.created", "data": { "...Complaint..." }, "at": "2026-10-02T09:12:03+05:30" }
```
| `event` | When |
|---|---|
| `complaint.created` | New complaint in my scope |
| `complaint.updated` | Status / assignment / priority changed |
| `complaint.escalated` | Escalated to my level *(from Phase 7)* |
| `complaint.feedback` | Citizen confirmed or reopened |
| `announcement.published` | New announcement *(from Phase 6)* |
| `suggestion.created` | New AI suggestion *(from Phase 6)* |
| `insight.updated` | New bridge statistics arrived *(from Phase 9)* |

`complaint.updated` is also sent for comments and re-routing (when a complaint moves department, the old department's dashboards get it too so they can drop it from their queue).

Client should reconnect with backoff (1 s, 2 s, 5 s, 10 s…) and re-fetch the queue after reconnecting.

### 10.2 Citizen push notifications (Expo push service)
The Citizen App is built with Expo, so the backend sends notifications through the **Expo push service** — it works in Expo Go during development and needs no Firebase setup.

App side: request permission and get the token with `Notifications.getExpoPushTokenAsync()` (expo-notifications), then `POST /auth/device-token` with `{ "token": "ExponentPushToken[...]", "platform": "android" }`. Only Expo push tokens are accepted (`400` otherwise). Call `DELETE /auth/device-token` on logout.

Sent today for these status changes: `assigned`, `in_progress`, `rejected` (body includes the reason) and `resolved` (as `type: "feedback_request"` — open the complaint with Confirm / Reopen buttons). The message is in the citizen's `language`. More types arrive with later phases.

Push `data` payload:
```json
{ "type": "complaint_status", "complaint_id": "4187", "status": "in_progress", "title": "Complaint KMC-2026-04187", "body": "Repair work has started" }
```
| `type` | Opens screen |
|---|---|
| `complaint_status` | Complaint details |
| `announcement` | Announcement details (`announcement_id`) |
| `feedback_request` | Complaint details with Rate/Reopen visible |

`data` values are always strings.

---

## 11. Bridge API (Police → Municipal)
Backend file: `municipal/backend/app/routes/bridge.py` · Called **only** by the police backend. JSON Schema: [`shared/bridge-schema/`](../shared/bridge-schema/)

**Security**
- HTTPS in production.
- Header `X-Bridge-Key: <shared secret>` and `X-Bridge-Signature: sha256=<HMAC of raw body with secret>`; `X-Bridge-Timestamp` within ±5 min.
- Strict schema: **unknown fields are rejected (400)**. No field may contain images, video, faces, number plates or personal data.
- One-way: the municipal backend exposes **no** endpoint that returns police data.

### 11.1 `POST /bridge/events`
```json
{
  "event_id": "pol-2026-10-02-0091",
  "type": "road_closure",
  "occurred_at": "2026-10-02T19:41:00+05:30",
  "location": { "lat": 16.6968, "lng": 74.2433, "area": "Dabholkar Corner" },
  "affected_ward_ids": [11, 12],
  "details": { "reason": "accident", "until": "2026-10-02T22:00:00+05:30", "diversion": "Use Tarabai Park route" }
}
```
| `type` | `details` fields | Municipal action |
|---|---|---|
| `road_closure` | `reason`, `until`, `diversion` | Auto `emergency` announcement to `affected_ward_ids` |
| `road_reopened` | — | Ends the related announcement |
| `infra_issue` | `issue` (`waterlogging` \| `fallen_tree` \| `broken_signal` \| `pothole` \| `road_damage`) | Creates complaint with `source: "police_bridge"` |

→ `202 { "accepted": true, "event_id": "pol-2026-10-02-0091" }` · Duplicate `event_id` → `200` (idempotent).

### 11.2 `POST /bridge/stats`
Sent daily (prototype: on demand).
```json
{
  "period": "2026-09",
  "accident_hotspots": [ { "location_id": "dabholkar-corner", "name": "Dabholkar Corner", "lat": 16.70, "lng": 74.24, "accidents": 14, "peak_hours": "19-21" } ],
  "congestion": [ { "road": "Station Road", "peak_windows": ["09-11", "18-20"], "avg_speed_kmph": 8 } ]
}
```
→ `202 { "accepted": true }`

---

## 12. Police system API (internal)
Base: `http://localhost:9000/api/v1` · Used only by `police/dashboard` · Separate users, DB and secrets. Detailed later in Phase 9 — outline:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Police staff login (`operator`, `supervisor`, `admin`) |
| `GET` | `/cameras` | Camera list + live stream URLs (WebRTC via MediaMTX) |
| `GET` | `/alerts?status=` | Alerts (text only) |
| `PATCH` | `/alerts/{id}` | `dismiss`, `dispatch` |
| `POST` | `/alerts/{id}/evidence-request` | Operator requests a clip save (`reason` required) |
| `POST` | `/evidence-requests/{id}/approve` · `/reject` | Supervisor only |
| `GET` | `/evidence/{id}` | Supervisor only, audit-logged |
| `GET` | `/audit-log` | Supervisor / admin |
| `WS` | `/ws/alerts` | Live alerts |

Alert model:
```json
{ "id": 581, "camera_id": "CAM-014", "type": "accident", "confidence": 0.91, "location": { "lat": 16.6968, "lng": 74.2433, "area": "Dabholkar Corner" }, "status": "new", "evidence": "none", "created_at": "2026-10-02T19:41:00+05:30" }
```
`type`: `accident` · `congestion` · `crowd` · `fight` (experimental) · `infra_issue` · `evidence`: `none` · `requested` · `saved` · `rejected` · `expired`

---

## 13. Change log
| Version | Date | Change | Approved by |
|---|---|---|---|
| 0.1.0 | 2026-10-02 | First draft | — |
| 0.1.1 | 2026-10-02 | Added `GET /wards` (§4.4), OTP/login error codes, `type` in JWT payload | Paras · *Friend: pending* |
| 0.1.6 | 2026-10-02 | Resolution proof with AI check (`proof.reason/method`, `ai_verified` may be `null`), `resolved_at`, feedback rules, auto-close 72 h, `reopened → in_progress` allowed | Paras · *Friend: pending* |
| 0.1.5 | 2026-10-02 | Local YOLO detection: `ai.model` adds `"yolo"`, new `ai.detections` (boxes) in complaints and the analyze response | Paras · *Friend: pending* |
| 0.1.4 | 2026-10-02 | AI triage live: `ai.severity/sensitive_location/model`, priority formula, analyze response adds `summary` + `is_civic_issue`, duplicate merging + citizens can view the original | Paras · *Friend: pending* |
| 0.1.3 | 2026-10-02 | Push via Expo push tokens (not raw FCM); `DELETE /auth/device-token`; WebSocket close codes and implemented events | Paras · *Friend: pending* |
| 0.1.2 | 2026-10-02 | `photo_url` nullable for non-photo sources; documented complaint submit errors, PATCH rules and roles; citizen timeline excludes internal comments | Paras · *Friend: pending* |

> To change this contract: open a PR that edits this file + adds a row here. Prefer **adding** optional fields over renaming/removing (see [Rules.md](Rules.md#3-api-contract-rules)).
