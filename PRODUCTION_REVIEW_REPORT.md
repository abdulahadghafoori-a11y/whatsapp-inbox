# Production Readiness Review — Final Report

Review and fixes applied per the full-app production plan (shared team inbox access model).

---

## 1. What was already correct

- **Webhook security**: Raw-body HMAC with `timingSafeEqual`, async `setImmediate` processing, production block on `WEBHOOK_SKIP_SIGNATURE`.
- **Auth**: Short-lived JWT (15m), opaque refresh tokens with rotation and reuse detection, `tokenRevokedAt` revocation.
- **Inbound reliability**: `wa_message_id` unique constraint + `onConflictDoNothing`, monotonic status upgrades via `shouldUpgradeStatus`.
- **Job queue**: `FOR UPDATE SKIP LOCKED`, stale lock recovery, exponential backoff, permanent-failure hooks updating message/media state.
- **Database**: Solid schema (FKs, indexes, cursor pagination on conversations/messages), versioned migrations, seed script.
- **WhatsApp API**: Pinned `WHATSAPP_API_VERSION`, `withRetry` on Graph calls, CTWA/referral storage, message echoes, read receipts (fire-and-forget).
- **Media pipeline**: WA download → S3 key in DB → presigned GET; mobile cache, retry, WA size limits.
- **Realtime**: Socket.io JWT + rooms; mobile TanStack cache patching for messages, inbox, status, media.
- **Mobile UX**: Inverted chat list, messaging window UI (`MessagingWindowTimer`), templates, assignment, swipe actions, offline text queue, SecureStore tokens.
- **Ops**: `/health` + `/health/ready`, PM2 + `infra/deploy.sh`, `npm run build` → `dist/`.

---

## 2. What was fixed (by category)

### Security

| Issue | Fix |
|-------|-----|
| Verify token `===` | Constant-time compare in [`backend/src/routes/webhook.ts`](backend/src/routes/webhook.ts) |
| JWT secret too short in prod | Min 64 chars at startup in [`backend/src/config.ts`](backend/src/config.ts) |
| CORS `*` in production | Startup failure if `CORS_ORIGINS=*` in prod |
| bcrypt cost 10 | Cost **12** via [`backend/src/utils/bcrypt.ts`](backend/src/utils/bcrypt.ts) |
| No login rate limit | 10 / 15 min per IP+email on `/api/auth/login` |
| No Helmet | `@fastify/helmet` in [`backend/src/index.ts`](backend/src/index.ts) |
| Media presign IDOR | `messageId` required; key must match row in [`backend/src/routes/media.ts`](backend/src/routes/media.ts) |
| Socket join any UUID | Conversation existence check in [`backend/src/plugins/socket.ts`](backend/src/plugins/socket.ts) |
| No request IDs | `genReqId` + `x-request-id` |
| Webhook on global rate limit | Allowlist for `POST /api/webhook/whatsapp` |
| Mobile HTTP in prod | [`mobile/lib/transportSecurity.ts`](mobile/lib/transportSecurity.ts) |

### Data loss / reliability

| Issue | Fix |
|-------|-----|
| Webhook ack before persist | `webhook_events` table + persist before 200 in [`backend/src/services/webhook-inbox.ts`](backend/src/services/webhook-inbox.ts); replay on startup |
| Duplicate outbound on job retry | Skip send if `waMessageId` set; reject empty `message_id` in [`backend/src/workers/job-processor.ts`](backend/src/workers/job-processor.ts) |
| Template send sync-only | `createOutboundTemplate` + job queue in [`backend/src/services/outbound.ts`](backend/src/services/outbound.ts) |
| `uploadMedia` no retry | `withRetry` in [`backend/src/services/whatsapp.ts`](backend/src/services/whatsapp.ts) |
| Assignment race | `UPDATE … WHERE assigned_to IS NULL` in [`backend/src/services/router.ts`](backend/src/services/router.ts) |
| Interactive/contact previews | `getPreview` / `inboundBody` in [`backend/src/services/webhook-processor.ts`](backend/src/services/webhook-processor.ts) |

### Mobile production

| Issue | Fix |
|-------|-----|
| Agent missing after cold start | `GET /auth/me` on hydrate in [`mobile/stores/authStore.ts`](mobile/stores/authStore.ts) |
| No message pagination | `useInfiniteQuery` + load older on scroll in [`mobile/hooks/useConversations.ts`](mobile/hooks/useConversations.ts) |
| FlatList perf | `initialNumToRender`, `windowSize`, `removeClippedSubviews` on inbox + chat |
| Push / deep link | [`mobile/components/PushNotificationBridge.tsx`](mobile/components/PushNotificationBridge.tsx), EAS `projectId` placeholder in `app.json` |
| Socket reconnect stale chat | Invalidate `['messages']` on connect in [`mobile/hooks/useSocket.ts`](mobile/hooks/useSocket.ts) |
| Dev errors in prod UI | [`mobile/lib/userFacingError.ts`](mobile/lib/userFacingError.ts) |
| Inbox search debounce | 300ms debounce in [`mobile/app/(tabs)/inbox.tsx`](mobile/app/(tabs)/inbox.tsx) |
| Socket disconnect UI | [`mobile/components/SocketConnectionBanner.tsx`](mobile/components/SocketConnectionBanner.tsx) |

### Polish (phase 4)

| Issue | Fix |
|-------|-----|
| Contact / interactive UI | [`ContactCardMessage.tsx`](mobile/components/ContactCardMessage.tsx), [`InteractiveMessage.tsx`](mobile/components/InteractiveMessage.tsx) |
| In-chat search | `?q=` on messages API + header search in chat |
| Typing indicator | Socket `typing_start` / `typing_stop` + [`mobile/hooks/useTyping.ts`](mobile/hooks/useTyping.ts) |
| Reopen / unassign | Overflow menu + AssignSheet |
| Dead banners | Removed `MessagingBanner.tsx`, `WindowExpiryBanner.tsx` |

### Deployment

- Added [`backend/Dockerfile`](backend/Dockerfile).

---

## 3. What was added

- `webhook_events` migration [`0004_webhook_events.sql`](backend/src/db/migrations/0004_webhook_events.sql)
- Webhook inbox service with startup replay
- Template outbound job type
- Message search API (`GET …/messages?q=`)
- Typing indicator socket events
- Mobile: transport security guard, message infinite cache helpers, push bridge, connection banner, typing hooks

---

## 4. Remaining recommendations (human / external)

- **EAS**: Run `eas init` and replace placeholder `extra.eas.projectId` in [`mobile/app.json`](mobile/app.json); configure FCM/APNs.
- **Bundle IDs**: Replace `com.example.salesinbox` before store submission.
- **Meta**: App Review, production WABA, webhook field subscriptions.
- **Secrets**: Set production `JWT_SECRET` (64+ chars), explicit `CORS_ORIGINS`, `S3_ENSURE_LIFECYCLE=true`.
- **CTWA FEP**: Code intentionally requires templates when CSW is closed even if FEP is open (see [`messaging-windows.test.ts`](backend/src/utils/messaging-windows.test.ts)); confirm against Meta policy if you need FEP free-form replies.
- **Certificate pinning**: Not implemented (optional hardening).
- **Shared types package**: Backend/mobile types still duplicated; add `packages/shared` when you want a single DTO source.
- **Multi-instance**: Still single-node (Socket.io + in-process jobs); Redis adapter + external workers if scaling horizontally.
- **Offline media queue**: Text-only offline queue remains; media sends require connectivity (or extend `offlineQueue.ts`).

---

## 5. Production go / no-go checklist

| Check | Status |
|-------|--------|
| `NODE_ENV=production` on server | Required before deploy |
| `WEBHOOK_SKIP_SIGNATURE=false` | Enforced |
| `CORS_ORIGINS` explicit (not `*`) | Enforced at startup |
| `JWT_SECRET` ≥ 64 characters | Enforced at startup |
| HTTPS (Caddy) + mobile `https://` URLs | Required for release builds |
| `npm run db:migrate` on deploy | Use [`infra/deploy.sh`](infra/deploy.sh) |
| S3 lifecycle 30d on `media/` | Set `S3_ENSURE_LIFECYCLE=true` |
| Webhook events processing healthy | Monitor `webhook_events` unprocessed rows |
| `/health/ready` green | DB + job heartbeat |
| EAS push + notification tap → chat | Configure EAS + test on device build |
| Rotate seed/default passwords | After first deploy |
| Run `npm test` in backend | 26 tests passing |

**Go** when the rows above are configured in your environment and you have validated on a physical device with a production API URL.

---

## Migrations

Run on deploy:

```bash
cd backend && npm run db:migrate
```

New table: `webhook_events`.
