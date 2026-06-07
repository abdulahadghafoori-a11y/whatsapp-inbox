# Forward phone localhost:8081/3001 -> PC (required for USB + 127.0.0.1 in .env).
$ErrorActionPreference = "Stop"
$env:PATH = "$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:PATH"

$lines = @(adb devices | Select-String "^\S+\s+\S+" | Where-Object { $_ -notmatch "List of devices" })
if ($lines.Count -eq 0) {
  throw @"
No device found.
- Plug in USB and enable Developer options > USB debugging
- Run: adb devices
"@
}

$unauth = $lines | Where-Object { $_ -match "\tunauthorized" }
if ($unauth) {
  throw @"
Phone is UNAUTHORIZED. On the phone tap Allow USB debugging (check Always allow).
Then run: adb kill-server
       adb devices
"@
}

$offline = $lines | Where-Object { $_ -match "\toffline" }
if ($offline) {
  throw "Device offline. Replug USB cable and run: adb kill-server && adb devices"
}

adb reverse tcp:8081 tcp:8081
adb reverse tcp:3001 tcp:3001
Write-Host "OK - adb reverse active:"
adb reverse --list
