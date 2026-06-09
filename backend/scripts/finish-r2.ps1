# Finish R2 setup: paste S3 API keys from Cloudflare dashboard into backend/.env
param(
  [string]$BucketName = "afghan-online-whatsapp-inbox-media",
  [string]$AccountId = "0d2490e16538ad3b1caa0757551d2f4e",
  [string]$EnvFile = (Join-Path (Join-Path $PSScriptRoot '..') '.env')
)

$ErrorActionPreference = "Stop"
$endpoint = "https://${AccountId}.r2.cloudflarestorage.com"

Write-Host ""
Write-Host "Paste the R2 S3 credentials (shown once after Create API token)." -ForegroundColor Cyan
Write-Host "Dashboard: https://dash.cloudflare.com/$AccountId/r2/overview" -ForegroundColor DarkGray
Write-Host ""

$accessKeyId = Read-Host "Access Key ID"
$secretPlain = Read-Host "Secret Access Key"
if ([string]::IsNullOrWhiteSpace($accessKeyId) -or [string]::IsNullOrWhiteSpace($secretPlain)) {
  throw "Both values are required."
}

$content = Get-Content $EnvFile -Raw
$content = $content -replace "(?ms)^# ---- AWS S3 ----\r?\n.*?(?=\r?\n# ----|\r?\n$)", ""
$content = $content -replace "(?ms)^# ---- Cloudflare R2 ----\r?\n.*?(?=\r?\n# ----|\r?\n$)", ""

$r2Block = @"
# ---- Cloudflare R2 ----
STORAGE_ENDPOINT=$endpoint
STORAGE_ACCESS_KEY_ID=$accessKeyId
STORAGE_SECRET_ACCESS_KEY=$secretPlain
STORAGE_BUCKET_NAME=$BucketName
STORAGE_REGION=auto

"@

if ($content -match "# ---- Anthropic") {
  $content = $content -replace "(# ---- Anthropic)", "$r2Block`$1"
} else {
  $content = $content.TrimEnd() + "`n`n" + $r2Block
}
$content = $content -replace "(\r?\n){3,}", "`n`n"

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($EnvFile, ($content.TrimEnd() + [Environment]::NewLine), $utf8NoBom)

Write-Host ''
Write-Host ('Updated ' + $EnvFile + ' - AWS S3 vars removed, R2 configured.') -ForegroundColor Green
Write-Host 'Restart the backend and send a test image.' -ForegroundColor Cyan
