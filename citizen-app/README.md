# 📱 citizen-app — MyCityAI Citizen App

**Stack:** React Native + Expo (SDK 57) + expo-router + TypeScript. Runs on Android, iOS and the web (same code).

Citizens report civic issues with a photo, get an AI analysis and duplicate check, then track the complaint until it is resolved.

## Run it
```bash
cd citizen-app
npm install
cp .env.example .env     # then edit, see below
npm run start            # scan the QR code with Expo Go;  press "w" for the browser
npm run typecheck
```

| Variable | Meaning |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend base URL, default `http://localhost:8000/api/v1`. On a real phone use your PC's LAN IP, e.g. `http://192.168.1.5:8000/api/v1`, and add that origin to the backend `CORS_ORIGINS` if you use the web build. |
| `EXPO_PUBLIC_USE_MOCKS` | `true` runs against in-app mock data that follows docs/API.md (no backend needed). Sign in with any valid phone number and OTP `123456`. |

Real backend: `docker compose up -d db`, then in `municipal/backend` run migrations, `python -m app.seed`, `uvicorn app.main:app --reload`. The dev OTP is `123456`.

## Structure
```
app/                       expo-router screens
  index.tsx                splash → login or home
  (auth)/                  login, register, otp
  (app)/                   signed-in area (guard in _layout)
    setup.tsx              name + ward after first sign-in
    (tabs)/                home, report, complaints, notifications, profile
    complaint/[id].tsx     details, timeline, map
    submitted/[id].tsx     success screen
    settings/              edit profile, language, privacy/help/about
src/
  api/                     client.ts (token, refresh, retry, errors), auth, complaints, users, notifications, mocks, types
  components/              design-system primitives (ui, Screen, feedback, Dialog), complaint cards/timeline, map, report steps
  i18n/                    en.ts, hi.ts, mr.ts + provider (hi/mr must define every key of en)
  store/                   auth, report draft, notifications (React context, no extra libraries)
  theme/                   tokens from docs/Design.md
  lib/                     domain mappings, formatting, photo/location/push helpers
```
UI components never call `fetch`; everything goes through `src/api/`.

## Backend contract notes
- **Auth** is phone + one-time code (docs/API.md §4.1). There is no email/password or separate register endpoint: "Create account" collects the name, and the account is created on the first successful OTP check. The name and ward are saved with `PATCH /auth/me`.
- **Notifications:** the backend has no notification-list endpoint yet, only push delivery (§10.2). The in-app list is built from the timelines of the citizen's own complaints; read state is stored on the device. Push registration (`POST /auth/device-token`) is implemented for phones.
- **Home stats** are counted from `GET /citizen/complaints` (first 100) because there is no stats endpoint.
- The map is Leaflet (as in the municipal dashboard) rendered in a WebView / iframe, so there is a single implementation for all platforms. Tiles come from OpenStreetMap.
