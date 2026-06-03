# WhatsApp Inbox — Mobile

Expo (React Native) app for the sales team. Expo Router, TanStack Query, Zustand,
NativeWind, Socket.io client, Expo SecureStore + Notifications.

> Versions are pinned in `package.json` (Expo SDK 52 line). When starting fresh,
> verify the current Expo LTS and run `npx expo install` to align native modules.

## Setup

```bash
cd mobile
npm install
cp .env.example .env   # point to your backend
npx expo start
```

`.env`:

```
EXPO_PUBLIC_API_URL=http://<your-machine-ip>:3001
EXPO_PUBLIC_SOCKET_URL=http://<your-machine-ip>:3001
```

Use your LAN IP (not `localhost`) when testing on a physical device.

## Login

Use a seeded account, e.g. `agent1@example.com` / `password123`.

## Structure

- `app/` — Expo Router screens
  - `(auth)/login.tsx`
  - `(tabs)/inbox/index.tsx` — list, filters, search, pull-to-refresh, pagination
  - `(tabs)/inbox/[id].tsx` — chat: all message types, status ticks, window banner,
    template flow, assign/resolve/attribution sheets
  - `(tabs)/team.tsx`, `settings.tsx`
- `components/` — `MessageBubble`, `ConversationItem`, `MediaMessage`,
  `AudioPlayer`, `WindowExpiryBanner`, `Toast`
- `hooks/` — `useSocket` (cache wiring), `useConversations`, `useMedia`, `useTeam`
- `services/api.ts` — axios + silent refresh interceptor (single-flight)
- `stores/authStore.ts` — tokens in SecureStore
- `lib/` — `socket`, `push`, `format`, `tokenStorage`

## Real-time

`useSocketSync` connects the socket after auth and patches the TanStack Query
cache directly for `new_message` / `message_status` / `media_ready`, and
invalidates the inbox list on `conversation_updated` / `conversation_assigned` /
`inbox_updated`. On token refresh the socket re-authenticates.

## Build

```bash
npm run typecheck
eas build --platform all --profile production
eas submit
```

Permissions configured in `app.json`: camera, media library, microphone,
notifications.
