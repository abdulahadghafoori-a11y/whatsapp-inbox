# Connect dev client over USB (Metro must already be running on 8081).
# Terminal 1:  npx expo start --dev-client -c
# Terminal 2:  .\scripts\connect-android-usb.ps1
$ErrorActionPreference = "Stop"
$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& "$PSScriptRoot\adb-reverse.ps1"

$listening = netstat -ano | Select-String ":8081\s+.*LISTENING"
if (-not $listening) {
  throw "Metro is not on port 8081. In mobile/: npx expo start --dev-client -c"
}
Write-Host "Metro is listening on 8081"

$env:PATH = "$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:PATH"
$package = "com.salesinbox.app"
$installed = adb shell pm path $package 2>$null
if (-not $installed -or $installed -notmatch $package) {
  throw @"
Dev client not installed on the phone ($package).

Install it once (Windows - use short path build):
  cd mobile
  npm run android:local

Then open Sales Inbox from the app drawer, or run connect:android again.
"@
}

$url = "exp+whatsapp-sales-inbox://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
Write-Host "Opening app -> http://127.0.0.1:8081"
adb shell am force-stop $package 2>$null
$start = adb shell am start -a android.intent.action.VIEW -d $url 2>&1
if ($LASTEXITCODE -ne 0 -or ($start -match "Error:")) {
  Write-Host $start
  Write-Host ""
  Write-Host "Deep link failed - open Sales Inbox manually from the app drawer."
  adb shell monkey -p $package -c android.intent.category.LAUNCHER 1 2>$null | Out-Null
} else {
  Write-Host $start
}
Write-Host "Done. Metro should log Android Bundled when the app connects."
