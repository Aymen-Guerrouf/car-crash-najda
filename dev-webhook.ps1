# Starts a cloudflared quick tunnel to the backend and registers its https URL as the SMS webhook
# on the gateway phone (which only accepts https:// URLs). The address changes on every run, so run
# this each time you start working, after dev-start.ps1.
$root = $PSScriptRoot
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'

# Settings come from nadja/.env and the phone's local server (Home screen of the gateway app)
$env = @{}
Get-Content "$root\nadja\.env" | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { $env[$Matches[1]] = $Matches[2] } }
$phone = ([Uri]$env['SMS_GATEWAY_API_URL']).GetLeftPart('Authority')   # e.g. http://10.99.87.151:8080
$cred = "$($env['SMS_GATEWAY_USER']):$($env['SMS_GATEWAY_PASS'])"
$token = $env['SMS_WEBHOOK_TOKEN']
if (-not $token) { throw 'SMS_WEBHOOK_TOKEN is empty in nadja/.env' }

Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -FilePath $cloudflared -ArgumentList 'tunnel', '--url', 'http://localhost:8000', '--no-autoupdate' `
  -RedirectStandardOutput "$env:TEMP\gh-tunnel.out" -RedirectStandardError "$env:TEMP\gh-tunnel.err" -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 30 -and -not $url; $i++) {
  Start-Sleep 1
  $m = Select-String -Path "$env:TEMP\gh-tunnel.err" -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($m) { $url = $m.Matches[0].Value }
}
if (-not $url) { throw "No tunnel URL after 30 s, see $env:TEMP\gh-tunnel.err" }

# Replace every webhook already on the phone (old tunnel addresses) with the new one
foreach ($hook in (curl.exe -s -m 6 -u $cred "$phone/webhooks" | ConvertFrom-Json)) {
  curl.exe -s -m 6 -X DELETE -u $cred "$phone/webhooks/$($hook.id)" | Out-Null
}
$body = @{ url = "$url/api/sms/webhook/$token/"; event = 'sms:received' } | ConvertTo-Json -Compress
$file = "$env:TEMP\gh-webhook.json"
[IO.File]::WriteAllText($file, $body)
$code = curl.exe -s -m 8 -o NUL -w '%{http_code}' -u $cred -H 'Content-Type: application/json' --data-binary "@$file" "$phone/webhooks"

Write-Host "Tunnel  : $url"
Write-Host "Webhook : registered on $phone (HTTP $code, expected 201)"
