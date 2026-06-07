# Run once as Administrator — allows phone on LAN to reach API (3001) and Metro (8081).
$rules = @(
  @{ Name = 'WhatsApp Inbox API 3001'; Port = 3001 },
  @{ Name = 'Expo Metro 8081'; Port = 8081 }
)
foreach ($r in $rules) {
  $existing = netsh advfirewall firewall show rule name="$($r.Name)" 2>$null
  if ($LASTEXITCODE -eq 0) { Write-Host "Rule exists: $($r.Name)"; continue }
  netsh advfirewall firewall add rule name="$($r.Name)" dir=in action=allow protocol=TCP localport=$($r.Port) profile=private
  Write-Host "Added: $($r.Name)"
}
