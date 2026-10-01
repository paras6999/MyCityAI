# 📱 citizen-app — MyCityAI Citizen App

**Owner:** Friend · **Stack:** React Native + Expo + expo-router + TypeScript

Citizens report civic issues with a photo, track their complaints and read ward announcements.

## Before coding
Read [docs/API.md](../docs/API.md) (§4 Auth, §5 Citizen, §7 Announcements, §8 Stats, §10.2 Push), [docs/Design.md](../docs/Design.md) and [docs/Rules.md](../docs/Rules.md).

## Planned structure
```
citizen-app/
├── app/                  expo-router screens
│   ├── (auth)/           phone.tsx, otp.tsx, ward.tsx
│   └── (tabs)/           report.tsx, complaints/, updates/, stats.tsx
├── src/
│   ├── api/              client.ts, types.ts (from API.md), mocks/
│   ├── components/
│   ├── i18n/             en.json, mr.json, hi.json
│   └── theme/            colors.ts, typography.ts (from Design.md)
├── .env.example          EXPO_PUBLIC_API_URL, EXPO_PUBLIC_USE_MOCKS
└── package.json
```

## Getting started (Phase 0)
```bash
npx create-expo-app@latest . --template tabs
npx expo start
```
Scan the QR code with **Expo Go** on your phone.

Use mock data (`EXPO_PUBLIC_USE_MOCKS=true`) until the backend endpoints are ready. Mocks must match API.md exactly.
