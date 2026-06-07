# WhatsApp Inbox — Backend

Fastify + TypeScript API for a WhatsApp Business team sales inbox.

Stack: Fastify v4, Drizzle ORM + Neon (Postgres), Socket.io, AWS S3, Anthropic,
a DB-backed job queue (no Redis), and JWT auth (15-min access + 30-day rotating
refresh tokens with reuse detection).

## Requirements

- Node.js 20+ (developed on Node 22)
- A Neon Postgres database
- A WhatsApp Business Cloud API app (phone number id, access token, app secret)
- An AWS S3 bucket
- An Anthropic API key (for AI agents)

## Setup

```bash
cd backend
npm install
cp .env.example .env   # fill in real values
```

Pick the Graph API version in `.env` (`WHATSAPP_API_VERSION`, e.g. `v21.0`) — set
it from Meta's current stable version at project start, then bump quarterly in one
place.

## Database

```bash
npm run db:generate   # generate SQL migration from src/db/schema.ts (already includes 0000_init)
npm run db:migrate    # apply migrations to Neon (includes 0008_db_indexes — run after pulling)
npm run seed          # create 1 admin + 4 agents + 1 ai_agent
```

Seed default password: `password123` (override with `SEED_PASSWORD`). The AI agent
row has no password and cannot log in.

## Run

```bash
npm run dev      # tsx watch (pretty logs)
npm run build    # tsc -> dist/
npm start        # node dist/index.js  (production)
npm run typecheck
npm test         # vitest
```

Server listens on `PORT` (default 3001).

## Webhook

- `GET  /api/webhook/whatsapp` — Meta verification handshake (`hub.challenge`).
- `POST /api/webhook/whatsapp` — verifies `x-hub-signature-256` over the **raw**
  body, acks `200` immediately, then processes asynchronously. Inbound messages
  are deduplicated on `wa_message_id` (idempotent under Meta retries).

Configure your webhook URL in Meta as `https://<domain>/api/webhook/whatsapp`
with verify token = `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

Subscribe at least to **messages** and **message_echoes** (shown as
`smb_message_echoes` in the payload). Echoes are required so replies sent from
the WhatsApp Business app (or another tool on the same number) appear in this
inbox in real time.

## Key endpoints

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/login` | `{ accessToken, refreshToken, agent }` |
| POST | `/api/auth/refresh` | rotates refresh token; detects reuse |
| POST | `/api/auth/logout` | revokes a refresh token |
| POST | `/api/auth/revoke-all` | admin only; invalidates all of an agent's tokens |
| GET | `/api/conversations` | filters: `status`, `assignedTo=me`, `search`, `cursor` |
| GET | `/api/conversations/:id` | full detail + attribution |
| PATCH | `/api/conversations/:id` | `{ status?, assignedTo?, notes? }` |
| GET | `/api/conversations/:id/messages` | cursor pagination (`before`) |
| POST | `/api/conversations/:id/messages` | text (JSON) or media (multipart); 10/min/agent; `WINDOW_EXPIRED` when closed |
| POST | `/api/conversations/:id/messages/template` | works when window closed |
| POST | `/api/messages/:conversationId/read` | read receipt + unread reset |
| POST | `/api/messages/:conversationId/unread` | mark chat unread in inbox (local flag) |
| POST | `/api/messages/media/:messageId/retry` | re-download WhatsApp media → S3 |
| GET | `/api/media/*` | presigned S3 GET URL (1h) |
| GET | `/api/team` | members + AI agents |
| PATCH | `/api/team/me` | register Expo push token |
| GET | `/api/templates` | approved templates (cached 1h) |
| GET | `/health`, `/health/ready` | liveness / readiness (DB + worker heartbeat) |

## Job queue

`jobs` table polled every 5s. Jobs are claimed atomically with
`FOR UPDATE SKIP LOCKED` (safe even if a second instance is ever added).
Backoff: 1m → 5m → 30m, then `failed`. Types: `send_whatsapp_message`,
`download_media`, `send_push_notification`, `ai_agent_reply`.

Inbound media uses a single `download_media` job (WhatsApp → S3 → `media_ready`);
no binaries are stored in the jobs table.

## Outbound media (WhatsApp-aligned)

All uploads go through `prepareOutboundMedia` before Cloud API upload (validate caps/format; no server transcoding):

| Type | Client preparation | Server | Limit |
|------|-------------------|--------|-------|
| Image | Resize/re-encode (expo-image-manipulator) | Validate | 5MB |
| Sticker | WebP, 512px | Validate | 500KB |
| Video | Trim + hardware compress (native) | Validate MP4 | 16MB, 16 min |
| Audio (voice) | Opus encode → OGG (`@imcooder/opuslib`) | Validate | 16MB |
| Document | — | Filename sanitize, blocked executables | 100MB |

Multipart accepts up to 100MB (documents). Video/voice require a dev build (native modules).

## Deployment (single instance)

Hetzner CX21, Ubuntu 22.04, Caddy (TLS), PM2 with `instances: 1` (required for the
in-process Socket.io server + job poller). See `../infra` notes in the root README.
