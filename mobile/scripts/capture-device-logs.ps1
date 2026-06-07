# Stream phone logs for Sales Inbox — paste output into Cursor chat when you hit an error.
# Run in a separate terminal while reproducing the issue on the phone.
$env:PATH = "$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:PATH"
Write-Host "Watching com.salesinbox.app (Ctrl+C to stop)..."
Write-Host "Reproduce the error on your phone now."
adb logcat -c
adb logcat ReactNativeJS:V ReactNative:V DevLauncher:E AndroidRuntime:E FFmpegKit:E VideoTrim:E ExpoVideoClip:E *:S
