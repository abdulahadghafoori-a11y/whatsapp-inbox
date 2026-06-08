# Release APK/AAB from short path C:\wi (same NDK/linker fix as android:local).
#
# Requires mobile/.env.production with HTTPS URLs (release builds reject http://).
#   EXPO_PUBLIC_API_URL=https://api.yourdomain.com
#   EXPO_PUBLIC_SOCKET_URL=https://api.yourdomain.com
#
# Output:
#   APK  -> C:\wi\android\app\build\outputs\apk\release\app-release.apk
#   AAB  -> C:\wi\android\app\build\outputs\bundle\release\app-release.aab
param(
  [switch]$Aab
)

$ErrorActionPreference = "Stop"

$sourceMobile = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$buildRoot = "C:\wi"
$envProduction = Join-Path $sourceMobile ".env.production"
$envExample = Join-Path $sourceMobile ".env.production.example"

if (-not (Test-Path $envProduction)) {
  if (Test-Path $envExample) {
    Copy-Item $envExample $envProduction
    Write-Host "Created .env.production from example - edit HTTPS URLs before shipping."
  } else {
    throw "Missing $envProduction - set EXPO_PUBLIC_API_URL and EXPO_PUBLIC_SOCKET_URL to https:// endpoints."
  }
}

function Import-DotEnv([string]$path) {
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
    Set-Item -Path "env:$key" -Value $val
  }
}

Import-DotEnv $envProduction

foreach ($key in @("EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_SOCKET_URL")) {
  $val = [Environment]::GetEnvironmentVariable($key)
  if (-not $val -or -not $val.StartsWith("https://")) {
    throw "$key must be https:// in .env.production (got '$val'). Release builds refuse plain HTTP."
  }
}

$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:GRADLE_USER_HOME = "C:\gradle-wi"
$env:NODE_ENV = "production"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

if (-not (Test-Path $env:JAVA_HOME)) {
  throw "JAVA_HOME not found - install Android Studio."
}

$ndkVer = "27.1.12297006"
$ndkDst = "C:\ndk\$ndkVer"
if (-not (Test-Path "$ndkDst\toolchains")) {
  Write-Host "Copying NDK to C:\ndk (one-time)..."
  New-Item -ItemType Directory -Path "C:\ndk" -Force | Out-Null
  robocopy "$env:LOCALAPPDATA\Android\Sdk\ndk\$ndkVer" $ndkDst /E /NFL /NDL /NJH /NJS | Out-Null
}

if (-not (Test-Path $buildRoot)) { New-Item -ItemType Directory -Path $buildRoot | Out-Null }
robocopy $sourceMobile $buildRoot /MIR /XD node_modules .expo android\.cxx android\.gradle android\app\build android\build /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
Copy-Item $envProduction "$buildRoot\.env" -Force

$sdkProp = ($env:ANDROID_HOME -replace '\\', '/').Replace(':', '\:')
@(
  "sdk.dir=$sdkProp",
  "ndk.dir=C\:/ndk/$ndkVer"
) | Set-Content "$buildRoot\android\local.properties"

Set-Location $buildRoot
if (-not (Test-Path node_modules)) { npm ci }
node scripts/patch-opuslib-ndk.js 2>$null

# Sentry Gradle plugin uploads source maps on release; skip when org/token are not set.
if (-not $env:SENTRY_ORG -or -not $env:SENTRY_AUTH_TOKEN) {
  $env:SENTRY_DISABLE_AUTO_UPLOAD = "true"
  Write-Host "Sentry source-map upload disabled (set SENTRY_ORG + SENTRY_AUTH_TOKEN to enable)."
}

$gradleTask = if ($Aab) { "bundleRelease" } else { "assembleRelease" }
Write-Host "Building release ($gradleTask) with API=$env:EXPO_PUBLIC_API_URL"

Set-Location "$buildRoot\android"
& .\gradlew.bat $gradleTask --no-daemon

if ($LASTEXITCODE -ne 0) { throw "Gradle $gradleTask failed (exit $LASTEXITCODE)" }

if ($Aab) {
  $out = "$buildRoot\android\app\build\outputs\bundle\release\app-release.aab"
} else {
  $out = "$buildRoot\android\app\build\outputs\apk\release\app-release.apk"
}

if (-not (Test-Path $out)) { throw "Expected output not found: $out" }

$destDir = Join-Path $sourceMobile "dist"
New-Item -ItemType Directory -Path $destDir -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$ext = if ($Aab) { "aab" } else { "apk" }
$dest = Join-Path $destDir "sales-inbox-$stamp.$ext"
Copy-Item $out $dest -Force

Write-Host ""
Write-Host "Release build OK"
Write-Host "  $dest"
Write-Host "  (gradle output: $out)"
