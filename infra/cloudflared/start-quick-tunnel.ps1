# Exposes http://localhost:3001 via a temporary https://*.trycloudflare.com URL.
# Requires: cloudflared in PATH, backend running on port 3001.

$ErrorActionPreference = "Stop"

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "cloudflared not found. Install with: winget install Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Starting Cloudflare quick tunnel -> http://localhost:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "Meta webhook callback URL (copy from cloudflared output):" -ForegroundColor Yellow
Write-Host "  https://<subdomain>.trycloudflare.com/api/webhook/whatsapp"
Write-Host ""
Write-Host "Verify token: same as WHATSAPP_WEBHOOK_VERIFY_TOKEN in backend/.env"
Write-Host "Keep this window open. Press Ctrl+C to stop."
Write-Host ""

cloudflared tunnel --url http://localhost:3001
