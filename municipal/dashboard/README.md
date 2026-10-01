# 💻 municipal/dashboard — Municipal Corporation Dashboard

**Owner:** Paras · **Stack:** React + Vite + TypeScript + Tailwind CSS + TanStack Query · **Port:** 5173

One web app, different views by role: **Officer**, **Ward Representative**, **Mayor**, **Admin**, plus the public stats page.

## Planned structure
```
dashboard/
├── src/
│   ├── api/           client.ts, types.ts (from API.md), ws.ts
│   ├── pages/         login/, officer/, ward/, mayor/, admin/, public/
│   ├── components/    StatusChip, PriorityBadge, KpiCard, AiCard, Timeline, ComplaintTable …
│   ├── hooks/         useAuth, useWebSocket
│   ├── i18n/
│   └── theme/         tokens from Design.md (tailwind.config)
├── .env.example       VITE_API_URL, VITE_WS_URL
└── package.json
```

## Getting started (Phase 0)
```bash
npm create vite@latest . -- --template react-ts
npm install
npm run dev
```
