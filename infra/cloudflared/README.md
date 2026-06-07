# Cloudflare Tunnel — local WhatsApp webhooks (Meta)

Expose your local backend (`http://localhost:3001`) over **HTTPS** so Meta can call:

| Method | Path |
|--------|------|
| `GET` | `/api/webhook/whatsapp` — verification (`hub.challenge`) |
| `POST` | `/api/webhook/whatsapp` — inbound messages (HMAC signed) |

Your app registers webhooks at prefix `/api/webhook` (see `backend/src/index.ts`).

---

## Prerequisites

1. **Backend running** on port 3001:

   ```powershell
   cd backend
   npm run dev
   ```

2. **`backend/.env`** must include (real values from [Meta for Developers](https://developers.facebook.com/)):

   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — any secret string **you choose**; same value goes in Meta’s webhook UI
   - `WHATSAPP_APP_SECRET` — App → Settings → Basic → **App secret** (required for `POST` signature checks)
   - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, etc. for sending/receiving

3. **Install `cloudflared`** (Windows):

   ```powershell
   winget install Cloudflare.cloudflared
   ```

   Or download: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

   Check:

   ```powershell
   cloudflared --version
   ```

---

## Option A — Quick tunnel (fastest, URL changes each run)

Good for a first test. The public URL changes every time you restart the tunnel.

```powershell
cd infra\cloudflared
.\start-quick-tunnel.ps1
```

Or manually:

```powershell
cloudflared tunnel --url http://localhost:3001
```

Copy the `https://….trycloudflare.com` URL from the output.

**Meta callback URL:**

```text
https://<your-subdomain>.trycloudflare.com/api/webhook/whatsapp
```

Leave this terminal open while testing.

---

## Afghan Online (`afghanonline.store`) — project setup

This repo uses the existing **`chakra-dev`** tunnel with:

| Hostname | Local | Use |
|----------|-------|-----|
| `inbox.afghanonline.store` | `http://127.0.0.1:3001` | **WhatsApp inbox API** (this repo) |
| `hooks.afghanonline.store` | `http://127.0.0.1:3000` | Legacy Next.js app |

**Meta webhook URL:**

```text
https://inbox.afghanonline.store/api/webhook/whatsapp
```

**Start tunnel** (backend must be on :3001):

```powershell
cd infra\cloudflared
.\start-afghanonline.ps1
```

DNS for `inbox.afghanonline.store` is routed via `cloudflared tunnel route dns chakra-dev inbox.afghanonline.store`.

### Chakra Chat (relay)

Chakra does **not** send Meta’s `x-hub-signature-256` header. It signs with
`X-Chakra-Signature-256` (HMAC-SHA256 of the raw body, hex digest **without**
`sha256=` prefix) using a team secret from Chakra Admin → Team → Secrets.

**Production / stable tunnel:** set in `backend/.env` (and Render env):

```env
WEBHOOK_SKIP_SIGNATURE=false
CHAKRA_WEBHOOK_HMAC_SECRET=<your-chakra-team-hmac-secret>
```

**Local dev only** (unsigned pass-through):

```env
WEBHOOK_SKIP_SIGNATURE=true
```

Restart the API after changing env. Use Meta’s direct webhook + `WHATSAPP_APP_SECRET`
when you no longer relay through Chakra.

The inbox still expects the **Meta webhook JSON shape** (`entry[].changes[].value.messages`). If Chakra sends a different format, you’ll get `200` but no new conversations until the payload matches or an adapter is added.

---

## Option B — Named tunnel + your domain (stable URL, recommended)

Use a hostname on a domain you manage in Cloudflare (e.g. `inbox-dev.example.com`).

### 1. Log in to Cloudflare

```powershell
cloudflared tunnel login
```

Browser opens; pick the zone (domain) you want to use.

### 2. Create a tunnel

```powershell
cloudflared tunnel create whatsapp-inbox-dev
```

Note the **tunnel UUID** printed (and credentials file under `%USERPROFILE%\.cloudflared\`).

### 3. Configure ingress

Copy the example and edit hostname + credentials path:

```powershell
copy infra\cloudflared\config.yml.example %USERPROFILE%\.cloudflared\config.yml
notepad %USERPROFILE%\.cloudflared\config.yml
```

Set:

- `tunnel:` → your tunnel UUID  
- `credentials-file:` → path to `<UUID>.json` from step 2  
- `hostname:` → e.g. `inbox-dev.yourdomain.com`  
- `service:` → `http://localhost:3001`

### 4. DNS route

```powershell
cloudflared tunnel route dns whatsapp-inbox-dev inbox-dev.yourdomain.com
```

### 5. Run the tunnel

```powershell
cloudflared tunnel run whatsapp-inbox-dev
```

**Meta callback URL (stable):**

```text
https://inbox-dev.yourdomain.com/api/webhook/whatsapp
```

---

## Configure Meta (WhatsApp)

1. [developers.facebook.com](https://developers.facebook.com/) → your app → **WhatsApp** → **Configuration**.
2. **Webhook** → **Edit**:
   - **Callback URL:** `https://<public-host>/api/webhook/whatsapp`
   - **Verify token:** exact value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in `backend/.env`
3. Click **Verify and save** (Meta sends `GET` with `hub.challenge`; backend must be running + tunnel up).
4. **Webhook fields** → Subscribe at least **`messages`** (and any others you need).

### Troubleshooting verification

| Symptom | Fix |
|---------|-----|
| Verify fails | Tunnel not running, wrong URL path (`/api/webhook/whatsapp`), or verify token mismatch |
| Verify OK, no messages | Not subscribed to `messages`; or wrong WhatsApp Business phone / test number |
| `403 Invalid signature` on POST | Set `WHATSAPP_APP_SECRET` in `.env` to match the Meta app secret |
| Nothing in inbox | Check backend logs; ensure `DATABASE_URL` is set and migrations/seed ran |

### Quick local test (verification handshake)

Replace host and token:

```powershell
curl "https://inbox-dev.yourdomain.com/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=12345"
```

Expected response body: `12345`

---

## Daily dev workflow

1. Terminal 1: `cd backend && npm run dev`
2. Terminal 2: quick tunnel **or** `cloudflared tunnel run whatsapp-inbox-dev`
3. Meta webhook URL must match the **current** public HTTPS URL (update Meta if you restarted a quick tunnel)
4. Send a WhatsApp message to your business number → should appear in the mobile inbox after processing

---

## Security notes

- Quick tunnel URLs are **public**; anyone with the URL could hit your API. Acceptable for short local dev only.
- Never commit `.env` or tunnel credential JSON files.
- Production: use a real domain + Caddy (see `infra/Caddyfile`) or a named Cloudflare Tunnel on your server.
