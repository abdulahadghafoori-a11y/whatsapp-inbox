# WhatsApp Inbox — Mobile

Expo (React Native) app for the sales team. Expo Router, TanStack Query, Zustand,
NativeWind, Socket.io client, Expo SecureStore + Notifications.

> Versions are pinned in `package.json` (Expo SDK 54). When upgrading, run
> `npx expo install --fix` to align native modules with the SDK.

## Setup

```bash
cd mobile
npm install
cp .env.example .env   # point to your backend
npx expo start
```

Create `mobile/.env` (gitignored) from `.env.example`:

```
EXPO_PUBLIC_API_URL=http://<your-wifi-ipv4>:3001
EXPO_PUBLIC_SOCKET_URL=http://<your-wifi-ipv4>:3001
```

**Physical device:** use your PC’s Wi‑Fi IPv4 (`ipconfig` on Windows). `localhost` points at the phone, not your PC.

**After changing `.env`:** restart Metro with a clean cache: `npx expo start -c`. On boot, the dev console logs `[env] EXPO_PUBLIC_API_URL=…` so you can confirm the bundle picked up the right values.

**Backend:** must be running on the same machine (`cd backend && npm run dev`) and listening on `0.0.0.0:3001` (default). Phone and PC must be on the same Wi‑Fi; allow port 3001 through Windows Firewall if requests time out.

**EAS builds:** URLs come from `eas.json` profiles, not `.env`. Development profile still uses `localhost` — use a preview/production profile or override `env` for device testing.

## Login

Use a seeded account, e.g. `agent1@example.com` / `password123`.

## Structure

- `app/` — Expo Router screens
  - `(auth)/login.tsx`
  - `(tabs)/inbox.tsx` — list, filters, search, pull-to-refresh, pagination
  - `(tabs)/team.tsx`, `settings.tsx`
  - `conversation/[id].tsx` — chat: all message types, status ticks, window banner,
    template flow, assign/resolve/attribution sheets
- `components/` — `MessageBubble`, `ConversationItem`, `MediaMessage`,
  `AudioPlayer`, `MessagingWindowTimer`, `Toast`
- `hooks/` — `useSocket` (cache wiring), `useConversations`, `useMedia`, `useTeam`
- `services/api.ts` — axios + silent refresh interceptor (single-flight)
- `stores/authStore.ts` — tokens in SecureStore; logout wipes local cache/media
- `lib/` — `socket`, `push`, `format`, `tokenStorage`, `offlineQueue`, `messageMediaCache`

## Real-time

`useSocketSync` connects the socket after auth and patches the TanStack Query
cache directly for `new_message` / `message_status` / `media_ready`, and
invalidates the inbox list on `conversation_updated` / `conversation_assigned` /
`inbox_updated`. On token refresh the socket re-authenticates.

## Build

```bash
npm run typecheck
eas init                                   # creates the EAS project + real projectId
eas build --platform all --profile production
eas submit
```

Build profiles live in `eas.json` (`development`, `preview`, `production`). Before
shipping:

- Run `eas init` and replace the placeholder `extra.eas.projectId` in `app.json`
  (the all-zeros UUID disables push at runtime by design).
- Replace the `com.salesinbox.app` bundle identifiers in `app.json` with your org's
  reverse-domain IDs.
- Set the production `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_SOCKET_URL` (HTTPS — release
  builds refuse plain HTTP) in `eas.json` profiles.
- Optionally set `EXPO_PUBLIC_SENTRY_DSN` to enable crash reporting.

Permissions configured in `app.json`: camera, media library, microphone,
notifications, location.
