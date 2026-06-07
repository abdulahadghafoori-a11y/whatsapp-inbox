# Local Android dev build + install (no EAS).
#
# Windows needs:
#   - Short build path (C:\wi) - avoids MAX_PATH + C++ linker issues
#   - NDK at C:\ndk\27.1.12297006 (no spaces in username path)
#   - JAVA_HOME = Android Studio JBR
#   - GRADLE_USER_HOME = C:\gradle-wi (isolated cache)
#
# Run from your repo:  cd mobile && .\scripts\run-android-local.ps1
$ErrorActionPreference = "Stop"

$sourceMobile = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$buildRoot = "C:\wi"

$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:GRADLE_USER_HOME = "C:\gradle-wi"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"

if (-not (Test-Path $env:JAVA_HOME)) {
  throw "JAVA_HOME not found - install Android Studio."
}

# One-time: copy NDK to path without spaces (spaces in C:\Users\My PC\ break C++ linking).
$ndkVer = "27.1.12297006"
$ndkDst = "C:\ndk\$ndkVer"
if (-not (Test-Path "$ndkDst\toolchains")) {
  Write-Host "Copying NDK to C:\ndk (one-time)..."
  New-Item -ItemType Directory -Path "C:\ndk" -Force | Out-Null
  robocopy "$env:LOCALAPPDATA\Android\Sdk\ndk\$ndkVer" $ndkDst /E /NFL /NDL /NJH /NJS | Out-Null
}

# Sync source into short-path build tree.
if (-not (Test-Path $buildRoot)) { New-Item -ItemType Directory -Path $buildRoot | Out-Null }
robocopy $sourceMobile $buildRoot /MIR /XD node_modules .expo android\.cxx android\.gradle android\app\build android\build /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
Copy-Item "$sourceMobile\.env" "$buildRoot\.env" -Force -ErrorAction SilentlyContinue

$sdkProp = ($env:ANDROID_HOME -replace '\\', '/').Replace(':', '\:')
@(
  "sdk.dir=$sdkProp",
  "ndk.dir=C\:/ndk/$ndkVer"
) | Set-Content "$buildRoot\android\local.properties"

Set-Location $buildRoot
if (-not (Test-Path node_modules)) { npm ci }
node scripts/patch-opuslib-ndk.js 2>$null

adb reverse tcp:8081 tcp:8081
adb reverse tcp:3001 tcp:3001

npx expo run:android --no-bundler
