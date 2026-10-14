$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskRuntime=Join-Path $taskRoot '.runtime'
$taskStatePath=Join-Path $taskRuntime 'telegram-state.json'
$taskState=Get-Content -LiteralPath $taskStatePath -Raw | ConvertFrom-Json
$taskSaved=$taskState.processes[1]
$taskProcess=Get-Process -Id $taskSaved.id -ErrorAction SilentlyContinue
if ($taskProcess -and $taskProcess.StartTime.ToUniversalTime().ToString('o') -ne ([datetime]$taskSaved.started).ToUniversalTime().ToString('o')) { throw 'Managed app PID belongs to a different process; refusing to stop it' }
$taskPython=Join-Path $taskRoot '.venv\Scripts\python.exe'
$env:APP_ENV='production'
$env:DEV_AUTH_BYPASS='false'
$env:PUBLIC_APP_URL=$taskState.url
Push-Location -LiteralPath (Join-Path $taskRoot 'backend')
try {
    & $taskPython -c "from app.backup import sqlite_backup; print('Pre-update backup: '+sqlite_backup())"
    if ($LASTEXITCODE -ne 0) { throw 'Backup failed; app restart cancelled' }
} finally { Pop-Location }
if ($taskProcess) {
    # Windows venv python.exe is a launcher with a child interpreter.
    $taskChildren=Get-CimInstance Win32_Process -Filter "ParentProcessId = $($taskProcess.Id)"
    foreach ($taskChild in $taskChildren) {
        if ($taskChild.CommandLine -match '-m uvicorn app\.main:app') { Stop-Process -Id $taskChild.ProcessId -ErrorAction SilentlyContinue }
    }
    if (Get-Process -Id $taskProcess.Id -ErrorAction SilentlyContinue) { Stop-Process -Id $taskProcess.Id -ErrorAction SilentlyContinue }
}
$taskNew=Start-Process -FilePath $taskPython -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000','--workers','1','--no-access-log') -WorkingDirectory (Join-Path $taskRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'app.out.log') -RedirectStandardError (Join-Path $taskRuntime 'app.err.log')
$taskState.processes[1].id=$taskNew.Id
$taskState.processes[1].started=$taskNew.StartTime.ToUniversalTime().ToString('o')
$taskState | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $taskStatePath -Encoding utf8
for ($taskAttempt=0; $taskAttempt -lt 30; $taskAttempt++) {
    Start-Sleep -Milliseconds 500
    if ($taskNew.HasExited) { throw 'Updated app exited; check .runtime/app.err.log' }
    try {
        $taskResponse=Invoke-WebRequest -Uri 'http://127.0.0.1:8000/' -UseBasicParsing -TimeoutSec 2
        if ($taskResponse.StatusCode -eq 200) { Write-Host 'App updated; existing tunnel and bot preserved'; exit }
    } catch { }
}
throw 'App did not become ready in time'
