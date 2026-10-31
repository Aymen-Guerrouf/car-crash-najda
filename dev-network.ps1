# Points the backend, the mobile app and the dashboard at the current network.
# Run it every time you join a different Wi-Fi / hotspot, then restart the three (dev-start.ps1 + expo).
#
# Assumes the Android SMS-gateway phone is the Wi-Fi hotspot, so the phone is the laptop's default gateway.
# Pass -PhoneIp to use another address for the gateway phone.
param(
  [string]$PhoneIp,
  [string]$GatewayNumber   # SIM number of the gateway phone, e.g. +213XXXXXXXXX (kept if omitted)
)

$root = $PSScriptRoot
$wifi = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' -ErrorAction Stop |
  Where-Object { $_.IPAddress -notmatch '^169\.' } | Select-Object -First 1
$laptop = $wifi.IPAddress
if (-not $PhoneIp) {
  $PhoneIp = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -InterfaceAlias 'Wi-Fi' | Select-Object -First 1).NextHop
}

# Sets KEY=value in an env file: replaces the line if present, appends it otherwise.
function Set-EnvLine([string]$File, [string]$Key, [string]$Value) {
  $lines = if (Test-Path $File) { @(Get-Content $File) } else { @() }
  $found = $false
  $lines = $lines | ForEach-Object { if ($_ -match "^$Key=") { $found = $true; "$Key=$Value" } else { $_ } }
  if (-not $found) { $lines += "$Key=$Value" }
  [IO.File]::WriteAllText($File, (($lines | Where-Object { $_ -ne $null }) -join "`n") + "`n")
}

Set-EnvLine "$root\nadja\.env" 'SMS_GATEWAY_API_URL' "http://${PhoneIp}:8080/message"
Set-EnvLine "$root\app\.env" 'EXPO_PUBLIC_API_URL' "http://${laptop}:8000"
if ($GatewayNumber) { Set-EnvLine "$root\app\.env" 'EXPO_PUBLIC_SMS_GATEWAY_NUMBER' $GatewayNumber }
Set-EnvLine "$root\nadjda-dashboard\.env" 'VITE_API_URL' "http://${laptop}:8000"
Set-EnvLine "$root\nadjda-dashboard\.env" 'VITE_WS_URL' "ws://${laptop}:8000/ws/dashboard/"

Write-Host "Laptop (backend, dashboard) : $laptop"
Write-Host "Gateway phone (SMS gateway) : $PhoneIp"
Write-Host "Updated nadja/.env, app/.env, nadjda-dashboard/.env. Restart the backend, the dashboard and Expo (--clear)."
