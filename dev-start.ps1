# Starts (or restarts) the backend and the dashboard in the background. Expo is started by hand:
#   cd app; npx expo start --clear
# Logs: $env:TEMP\gh-server.err (backend), $env:TEMP\gh-dashboard.log (dashboard).
$root = $PSScriptRoot
$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' | Where-Object { $_.IPAddress -notmatch '^169\.' } | Select-Object -First 1).IPAddress

function Stop-OnPort([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

# Backend (Django + Channels): one process only, the channel layer is in memory
Stop-OnPort 8000
Start-Process -FilePath "$root\nadja\.venv\Scripts\python.exe" -WorkingDirectory "$root\nadja" `
  -ArgumentList 'manage.py', 'runserver', '0.0.0.0:8000', '--noreload' `
  -RedirectStandardOutput "$env:TEMP\gh-server.log" -RedirectStandardError "$env:TEMP\gh-server.err" -WindowStyle Hidden

# Dashboard (Vite) on a fixed port so the URL never changes
Stop-OnPort 5174
Start-Process -FilePath 'npm.cmd' -WorkingDirectory "$root\nadjda-dashboard" `
  -ArgumentList 'run', 'dev', '--', '--port', '5174', '--strictPort' `
  -RedirectStandardOutput "$env:TEMP\gh-dashboard.log" -RedirectStandardError "$env:TEMP\gh-dashboard.err" -WindowStyle Hidden

Start-Sleep 6
try { $ok = (Invoke-RestMethod "http://${ip}:8000/api/health/").ok } catch { $ok = $false }
Write-Host "Backend   : http://${ip}:8000  (health ok: $ok)"
Write-Host "Dashboard : http://localhost:5174"
Write-Host "Swagger   : http://${ip}:8000/api/docs/"
