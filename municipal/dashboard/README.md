# 💻 municipal/dashboard — Municipal Corporation Dashboard

**Owner:** Paras · **Stack:** React 19 + Vite + TypeScript (strict) + Tailwind CSS v4 + TanStack Query + React Router + i18next · **Port:** 5173

One web app, different views by role: **Officer**, **Ward Representative**, **Mayor**, **Admin**, plus the public stats page.

## Planned structure
```
dashboard/
├── src/
│   ├── api/           client.ts, types.ts (from API.md), ws.ts
│   ├── pages/         login/, officer/, ward/, mayor/, admin/, public/
│   ├── components/    StatusChip, PriorityBadge, KpiCard, AiCard, Timeline, ComplaintTable …
│   ├── hooks/         useAuth, useWebSocket
│   └── i18n/          en.json (all UI text)
│   index.css          Tailwind + design tokens from Design.md (@theme)
├── .env.example       VITE_API_URL, VITE_WS_URL
└── package.json
```

## Getting started
Run from `municipal/dashboard/`:
```bash
npm install
copy .env.example .env.local     # macOS/Linux: cp .env.example .env.local
npm run dev
```
Open http://localhost:5173. Start the [backend](../backend/) too (with database + seed data); the login page shows whether the server is reachable.

Sign in with a seeded staff account (usernames listed in the [backend README](../backend/README.md#getting-started)); each role lands on its own view: officer → `/officer`, ward rep → `/ward`, mayor → `/mayor`, admin → `/admin`.

| Command | What |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check + production build |
| `npm run lint` | Lint (oxlint) |

## Pages
| Route | Who | Page |
|---|---|---|
| `/officer` | officer | Complaint queue (AI-sorted; filters are kept in the URL) |
| `/officer/complaints/:id` | officer | Detail: photo, map, timeline, assign / start work / reject / comment |
| `/ward/complaints`, `/ward/complaints/:id` | ward rep | Same queue/detail for their ward; can only comment |

Use `python -m app.seed --demo` in the backend to get sample complaints.

**Live updates:** the layout opens `WS /ws/dashboard` (`src/hooks/useDashboardSocket.ts`). New or changed complaints refresh the lists automatically and new complaints pop up as a toast. The header shows **Live** / **Reconnecting…**; the socket reconnects with backoff and refreshes an expired token (close code 4401).

## How auth works
- `src/auth/AuthProvider.tsx` holds the signed-in user; `useAuth()` (in `src/auth/useAuth.ts`) gives `user`, `login`, `logout`.
- Tokens are stored by `src/auth/tokenStorage.ts`. `src/api/client.ts` adds the bearer token and, on `TOKEN_EXPIRED`, refreshes once and retries.
- `RequireRole` guards each role's routes; nav items per role live in `src/layouts/navigation.ts`.

## Conventions
- API calls only in `src/api/` (axios instance in `client.ts` turns API errors into `ApiError` with `code` / `message`).
- Types in `src/api/types.ts` mirror docs/API.md.
- All visible text via `t('key')` from `src/i18n/en.json`.
- Colours via design tokens (`bg-primary`, `text-muted`, `bg-danger-bg` …) defined in `src/index.css`, never raw hex.
