# PRD.md — Product Requirements Document

**Project:** MyCityAI — Agentic AI Smart City Ecosystem
**Team:** Savej Shaikh, Paras Pilankar, Harsh Vanjare, Shanur Shaikh, Pranav Sangar · Guide: Mrs. Shamal C. Desai
**Institute:** Dept. of CSE (AIML), D. Y. Patil College of Engineering & Technology, Kolhapur · 2026–27
**Status:** Draft v0.1 · 2026-10-02

---

## 1. Problem
- Municipal departments (water, roads, waste, electricity) and the police work in silos; coordination happens over calls and letters.
- Complaints are handled first-come-first-served, not by severity, and the same issue is reported many times.
- Officers can mark complaints "resolved" without proof; citizens rarely get updates.
- Citizens are not told in advance about water cuts, power shutdowns or road closures, so they file avoidable complaints.
- Police CCTV sees accident hotspots and congestion daily, but this never reaches the people who plan roads.

## 2. Vision
An agentic AI platform where **specialised AI agents detect, prioritise, route and escalate civic issues automatically**, citizens can report and track issues from their phone, and authorities are held accountable — while police video stays private.

## 3. Goals
| # | Goal | Measured by |
|---|---|---|
| G1 | Faster routing of complaints than manual handling | Avg. time from submit → assigned (simulation vs manual baseline) |
| G2 | Fewer duplicate complaints | % complaints merged or auto-replied |
| G3 | Accountability | % complaints resolved within SLA, % with verified proof |
| G4 | Citizen trust | Satisfaction rating, reopen rate, public stats available |
| G5 | Privacy | Zero video/images leave the police system; video stored only with approval |

## 4. Non-goals (out of scope for this project)
- Real integration with Kolhapur Municipal Corporation or police systems (prototype uses simulated / recorded data).
- Real dispatch of ambulances or police units (simulated by alerts).
- Payments, property tax, birth/death certificates or other e-governance services.
- iOS release (Android APK only).
- Facial recognition or number-plate tracking.

## 5. Users
| User | System | Needs |
|---|---|---|
| **Citizen** | Citizen App | Report an issue in < 1 minute, know what's happening, get ward news in their language |
| **Department Officer** | Municipal Dashboard | See the most urgent work first, assign, prove resolution, inform citizens |
| **Ward Representative** | Municipal Dashboard | See everything in their ward, chase overdue work |
| **Mayor / Commissioner** | Municipal Dashboard | City-wide view, weak departments/wards, infrastructure decisions |
| **Police Operator** | Police Control Room | Watch live CCTV, get AI alerts, dispatch |
| **Police Supervisor** | Police Control Room | Approve evidence saves, audit |
| **Public** | Public stats page | Transparency on complaints received vs resolved |

## 6. Systems
| System | Parts | Owner (dev) |
|---|---|---|
| **System 1 — Municipal + Citizens** | `municipal/backend`, `municipal/dashboard`, `citizen-app` | Paras (backend + dashboard), Friend (citizen-app) |
| **System 2 — Police** | `police/backend`, `police/dashboard` | TBD (Phase 9) |
| **Bridge** | `shared/bridge-schema` + `/bridge/*` endpoints | Both backends |

Systems never share code or databases; they communicate only through the APIs in [API.md](API.md).

## 7. Features

Priority: **M** = Must (MVP) · **S** = Should · **C** = Could (if time)

### 7.1 Citizen App
| ID | Feature | Priority |
|---|---|---|
| CA-1 | Phone OTP login, select/detect ward | M |
| CA-2 | Report issue: photo (camera/gallery) + auto GPS + description | M |
| CA-3 | AI category shown before submit; duplicate warning | M |
| CA-4 | My complaints list with status chips | M |
| CA-5 | Complaint detail with timeline, assigned officer, SLA | M |
| CA-6 | Rate / confirm / reopen after resolution (with after-photo) | M |
| CA-7 | Push notifications for status changes and announcements | M |
| CA-8 | Ward announcements feed with priority colours | M |
| CA-9 | Language switch EN / मराठी / हिंदी | S |
| CA-10 | City stats tab (public statistics) | S |
| CA-11 | Auto-reply when an active announcement explains the issue | S |
| CA-12 | Voice description (speech-to-text) | C |
| CA-13 | Offline draft (submit when back online) | C |

### 7.2 Municipal Dashboard
| ID | Feature | Role | Priority |
|---|---|---|---|
| MD-1 | Staff login, role-based views | all | M |
| MD-2 | AI-sorted priority queue with filters and SLA timers | officer | M |
| MD-3 | Complaint detail: photo, map, timeline, duplicates | all | M |
| MD-4 | Assign / change status / reject with reason | officer | M |
| MD-5 | Upload after-photo; AI verification before `resolved` | officer | M |
| MD-6 | Live updates via WebSocket | all | M |
| MD-7 | Automatic escalation officer → ward rep → mayor | system | M |
| MD-8 | Ward rep view: ward KPIs, escalation inbox, remind/escalate | ward_rep | M |
| MD-9 | Mayor view: city KPIs, ward heatmap, department ranking | mayor | M |
| MD-10 | Post announcements (with permission limits) | officer, ward_rep, mayor | M |
| MD-11 | AI-drafted + auto-translated announcements, one-click approve | officer, ward_rep, mayor | S |
| MD-12 | AI suggestions panel (drafts, anomalies, auto-replies) | officer | S |
| MD-13 | Infrastructure insights from police bridge + work orders | mayor | S |
| MD-14 | Impact tracking (accidents before/after a fix) | mayor | C |
| MD-15 | Admin: manage users, wards, SLA config | admin | S |

### 7.3 Public Statistics
| ID | Feature | Priority |
|---|---|---|
| PS-1 | Totals, resolution rate, avg time, satisfaction | M |
| PS-2 | Monthly received vs resolved, by department, top wards | S |

### 7.4 Police Control Room (System 2)
| ID | Feature | Priority |
|---|---|---|
| PC-1 | Police login (operator / supervisor / admin) | M |
| PC-2 | Live CCTV grid (recorded video / webcam via MediaMTX, **no recording**) | M |
| PC-3 | AI detection: accident, congestion, crowd (YOLOv8) | M |
| PC-4 | Text-only alerts with dispatch / dismiss | M |
| PC-5 | Evidence save request → supervisor approval → encrypted clip, 30-day expiry | M |
| PC-6 | Audit log | M |
| PC-7 | Incident map | S |
| PC-8 | Fight detection (experimental) | C |
| PC-9 | Face blurring on exported clips | S |

### 7.5 AI Agents (municipal backend)
| ID | Agent | Priority |
|---|---|---|
| AI-1 | Orchestrator (LangGraph): routing, priority score, duplicate merging | M |
| AI-2 | Complaint classifier (Sentence-BERT + YOLOv8 on photo) | M |
| AI-3 | Before/after verification | M |
| AI-4 | Escalation agent (SLA scheduler) | M |
| AI-5 | Announcement agent (LLM draft + translate + complaint linking) | S |
| AI-6 | Utilities agent (LSTM forecast, Isolation Forest anomalies on simulated sensors) | S |
| AI-7 | Infrastructure insights agent (hotspots → recommendations) | S |

### 7.6 Bridge
| ID | Feature | Priority |
|---|---|---|
| BR-1 | `road_closure` → citizen announcement | M |
| BR-2 | `infra_issue` → municipal complaint | S |
| BR-3 | Monthly stats → infrastructure insights | S |

## 8. Key user stories
- *As a citizen*, I take a photo of a pothole and submit it in under a minute, without choosing a category.
- *As a citizen*, I get a notification when work starts and when it is fixed, with an after-photo.
- *As a water officer*, I see the most urgent complaints first and know which ones will breach SLA.
- *As a ward representative*, I am alerted when an officer misses a deadline in my ward.
- *As the mayor*, I see which wards and departments are failing and where accidents keep happening.
- *As a police operator*, I am alerted to an accident within seconds without watching every screen.
- *As a police supervisor*, no footage is stored unless I approve it.

## 9. Non-functional requirements
| Area | Requirement |
|---|---|
| Performance | Complaint submit → classified in < 5 s; dashboard live update < 2 s |
| Privacy | No personal data in public stats; police video never leaves police system; phone numbers masked for staff |
| Security | JWT auth, role checks on every endpoint, HMAC-signed bridge, secrets only in `.env` |
| Usability | Citizen app usable in Marathi/Hindi; large touch targets; works on low-end Android |
| Reliability | Clients handle offline / server errors gracefully |
| Explainability | Priority score and AI category always shown with confidence |

## 10. Success criteria (for final evaluation)
- End-to-end demo: citizen report → AI classification → officer dashboard live → proof → citizen confirms.
- Accident demo across systems: CCTV detection → police alert → bridge → citizen announcement + municipal task + hotspot insight.
- Metrics report: YOLO mAP, classifier F1, LSTM MAE, routing time vs manual, duplicates prevented.

## 11. Assumptions & constraints
- 16-week timeline (see [Phases.md](Phases.md)); small team, student laptops, Google Colab for training.
- Public datasets (RDD2022, garbage / accident datasets) + simulated sensor data + recorded CCTV clips.
- LLM via API (Gemini / Llama / GPT) with free-tier limits.
