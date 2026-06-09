# Configure Cloudflare R2 for backend/.env (no lifecycle, no AWS migration).
param(
  [string]$BucketName = "afghan-online-whatsapp-inbox-media",
  [string]$EnvFile = (Join-Path (Join-Path $PSScriptRoot '..') '.env')
)

$ErrorActionPreference = "Stop"

function Invoke-Wrangler {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $out = & npx wrangler @Args 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($out | Out-String)
  }
  return $out
}

Write-Host ""
Write-Host "=== Cloudflare R2 setup (whatsapp-inbox backend) ===" -ForegroundColor Cyan
Write-Host ""

# --- 1. Cloudflare login ---
Write-Host "Step 1/4: Cloudflare login (browser opens if needed)..." -ForegroundColor Yellow
try {
  $whoami = Invoke-Wrangler whoami | Out-String
} catch {
  Write-Host "Not logged in — opening browser for wrangler login..." -ForegroundColor Yellow
  Invoke-Wrangler login | Out-Null
  $whoami = Invoke-Wrangler whoami | Out-String
}

if ($whoami -notmatch "Account ID:\s*([a-f0-9]+)") {
  Write-Host $whoami
  throw "Could not parse Account ID from wrangler whoami."
}
$accountId = $Matches[1]
Write-Host "  Account ID: $accountId" -ForegroundColor Green

$endpoint = "https://${accountId}.r2.cloudflarestorage.com"

# --- 2. Create bucket ---
Write-Host ""
Write-Host "Step 2/4: R2 bucket '$BucketName'..." -ForegroundColor Yellow
try {
  Invoke-Wrangler r2 bucket create $BucketName | Out-Null
  Write-Host "  Bucket created." -ForegroundColor Green
} catch {
  if ($_.Exception.Message -match "already exists|AlreadyExists|409") {
    Write-Host "  Bucket already exists — OK." -ForegroundColor Green
  } else {
    throw
  }
}

# --- 3. R2 S3 API credentials (dashboard one-time) ---
Write-Host ""
Write-Host "Step 3/4: R2 S3 API token (shown once in dashboard)..." -ForegroundColor Yellow
Write-Host "  Dashboard -> R2 -> Manage R2 API Tokens -> Create API token"
Write-Host "  Permission: Object Read & Write | Bucket: $BucketName"
Write-Host ""
$tokenUrl = "https://dash.cloudflare.com/$accountId/r2/overview"
Write-Host "  Opening: $tokenUrl"
Start-Process $tokenUrl

$accessKeyId = Read-Host "  Paste Access Key ID"
$secretPlain = Read-Host "  Paste Secret Access Key"
if ([string]::IsNullOrWhiteSpace($accessKeyId) -or [string]::IsNullOrWhiteSpace($secretPlain)) {
  throw "Access Key ID and Secret Access Key are required."
}

# --- 4. Patch backend/.env ---
Write-Host ""
Write-Host "Step 4/4: Updating $EnvFile ..." -ForegroundColor Yellow
if (-not (Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

$content = Get-Content $EnvFile -Raw

# Remove AWS S3 block
$content = $content -replace "(?ms)^# ---- AWS S3 ----\r?\n.*?(?=\r?\n# ----|\r?\n$)", ""

# Remove any existing STORAGE block
$content = $content -replace "(?ms)^# ---- Cloudflare R2 ----\r?\n.*?(?=\r?\n# ----|\r?\n$)", ""

$r2Block = @"
# ---- Cloudflare R2 ----
STORAGE_ENDPOINT=$endpoint
STORAGE_ACCESS_KEY_ID=$accessKeyId
STORAGE_SECRET_ACCESS_KEY=$secretPlain
STORAGE_BUCKET_NAME=$BucketName
STORAGE_REGION=auto

"@

# Insert before Anthropic section if present, else append
if ($content -match "# ---- Anthropic") {
  $content = $content -replace "(# ---- Anthropic)", "$r2Block`$1"
} else {
  $content = $content.TrimEnd() + "`n`n" + $r2Block
}

# Normalize excessive blank lines
$content = $content -replace "(\r?\n){3,}", "`n`n"

Set-Content -Path $EnvFile -Value $content.TrimEnd() -NoNewline -Encoding utf8
Add-Content -Path $EnvFile -Value "" -Encoding utf8

Write-Host ""
Write-Host "Done. R2 configured (no lifecycle, fresh bucket — no AWS migration)." -ForegroundColor Green
Write-Host "  Endpoint: $endpoint"
Write-Host "  Bucket:   $BucketName"
Write-Host ""
Write-Host "Restart the backend, then send a test image to verify uploads." -ForegroundColor Cyan
