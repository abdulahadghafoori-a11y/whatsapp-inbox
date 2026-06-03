# Stable tunnel for whatsapp-inbox on inbox.afghanonline.store (tunnel: chakra-dev).
# Requires: backend on :3001, DNS route for inbox.afghanonline.store.

$ErrorActionPreference = "Stop"

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "Install cloudflared: winget install Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "WhatsApp inbox webhook URL:" -ForegroundColor Green
Write-Host "  https://inbox.afghanonline.store/api/webhook/whatsapp"
Write-Host ""
Write-Host "Verify token: WHATSAPP_WEBHOOK_VERIFY_TOKEN in backend/.env"
Write-Host "Starting tunnel chakra-dev (Ctrl+C to stop)..."
Write-Host ""

cloudflared tunnel run chakra-dev
