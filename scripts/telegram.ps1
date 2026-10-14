$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
$taskRuntime = Join-Path $taskRoot '.runtime'
Set-Location -LiteralPath $taskRoot
if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) { throw 'Port 8000 is already occupied. Stop the previous app first.' }
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'frontend\dist\index.html'))) { throw 'Build frontend first: cd frontend; npm ci; npm run build' }
& $taskPython (Join-Path $PSScriptRoot 'telegram_check.py')
if ($LASTEXITCODE -ne 0) { throw 'Telegram bootstrap failed' }
$taskProcesses = @()
try {
    $taskTunnel = Start-Process -FilePath (Join-Path $taskRuntime 'cloudflared.exe') -ArgumentList @('tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:8000','--metrics','127.0.0.1:20241') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'tunnel.out.log') -RedirectStandardError (Join-Path $taskRuntime 'tunnel.err.log')
    $taskProcesses += @{ id=$taskTunnel.Id; started=$taskTunnel.StartTime.ToUniversalTime().ToString('o') }
    $taskUrl = $null
    for ($taskAttempt=0; $taskAttempt -lt 90; $taskAttempt++) {
        Start-Sleep -Milliseconds 500
        if ($taskTunnel.HasExited) { throw 'Cloudflare tunnel exited. Check .runtime/tunnel.err.log' }
        $taskLog = Get-Content -LiteralPath (Join-Path $taskRuntime 'tunnel.err.log') -Raw -ErrorAction SilentlyContinue
        if ($taskLog -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $taskUrl=$Matches[0]; break }
    }
    if (-not $taskUrl) { throw 'Cloudflare did not provide a URL in time' }
    $env:ATTENDANCE_QUICK_URL = $taskUrl
    & $taskPython -c "import os; from dotenv import set_key; set_key('.env','PUBLIC_APP_URL',os.environ['ATTENDANCE_QUICK_URL']); set_key('.env','APP_ENV','production'); set_key('.env','DEV_AUTH_BYPASS','false')"
    if ($LASTEXITCODE -ne 0) { throw 'Could not save app configuration' }
    $env:PUBLIC_APP_URL=$taskUrl
    $env:APP_ENV='production'
    $env:DEV_AUTH_BYPASS='false'
    Push-Location -LiteralPath (Join-Path $taskRoot 'backend')
    try { & $taskPython -m alembic upgrade head; if ($LASTEXITCODE -ne 0) { throw 'Database migration failed' } } finally { Pop-Location }
    $taskApp = Start-Process -FilePath $taskPython -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000','--workers','1','--no-access-log') -WorkingDirectory (Join-Path $taskRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'app.out.log') -RedirectStandardError (Join-Path $taskRuntime 'app.err.log')
    $taskProcesses += @{ id=$taskApp.Id; started=$taskApp.StartTime.ToUniversalTime().ToString('o') }
    $taskReady=$false
    for ($taskAttempt=0; $taskAttempt -lt 30; $taskAttempt++) {
        Start-Sleep -Milliseconds 500
        try { $taskResponse=Invoke-WebRequest -Uri 'http://127.0.0.1:8000/' -UseBasicParsing -TimeoutSec 2; if ($taskResponse.StatusCode -eq 200) { $taskReady=$true; break } } catch { }
        if ($taskApp.HasExited) { throw 'App exited. Check .runtime/app.err.log' }
    }
    if (-not $taskReady) { throw 'App did not start in time' }
    & $taskPython (Join-Path $PSScriptRoot 'telegram_check.py') menu
    if ($LASTEXITCODE -ne 0) { throw 'Telegram menu setup failed' }
    $taskBot = Start-Process -FilePath $taskPython -ArgumentList @('-m','app.bot') -WorkingDirectory (Join-Path $taskRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'bot.out.log') -RedirectStandardError (Join-Path $taskRuntime 'bot.err.log')
    $taskProcesses += @{ id=$taskBot.Id; started=$taskBot.StartTime.ToUniversalTime().ToString('o') }
    @{url=$taskUrl; processes=$taskProcesses} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskRuntime 'telegram-state.json') -Encoding utf8
    Write-Host "Attendance is running: $taskUrl"
    Write-Host 'Open your bot and send /start. Keep this computer awake.'
} catch {
    foreach ($taskProcess in $taskProcesses) { Stop-Process -Id $taskProcess.id -ErrorAction SilentlyContinue }
    throw
}
