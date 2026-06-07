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

**Voice + video send** use native modules (`@imcooder/opuslib`, `react-native-compressor`, `react-native-video-trim`). They do **not** run in Expo Go — use a dev client or EAS build:

```bash
npx expo prebuild --clean
npx expo run:android   # Windows/Linux
npx expo run:ios       # macOS only
```

**Video trim on Android** uses a native clip module (`expo-video-clip`, no FFmpeg). **Compress** uses `react-native-compressor`. After adding or changing native modules, rebuild once:

```bash
npx expo run:android
```

Metro reload alone does not pick up native code.

**Windows (`C:\Users\My PC\…` paths):** `npx expo run:android` from the repo often fails with NDK linker errors (`undefined symbol: __cxa_throw`, etc.) because spaces in the username break C++ builds. Use the short-path helper instead:

```powershell
cd mobile
npm run android:local
```

That syncs to `C:\wi`, uses NDK at `C:\ndk`, and installs the dev client on USB.

`@imcooder/opuslib` is an Expo module (auto-linked) — do **not** add it to `plugins` in `app.json`. Only `react-native-compressor` needs a config plugin entry there.

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
