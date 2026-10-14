$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskStatePath=Join-Path $taskRoot '.runtime\telegram-state.json'
if (-not (Test-Path -LiteralPath $taskStatePath)) { Write-Host 'No managed Telegram launch found'; exit }
$taskState=Get-Content -LiteralPath $taskStatePath -Raw | ConvertFrom-Json
foreach ($taskSaved in $taskState.processes) {
    $taskProcess=Get-Process -Id $taskSaved.id -ErrorAction SilentlyContinue
    if ($taskProcess -and $taskProcess.StartTime.ToUniversalTime().ToString('o') -eq ([datetime]$taskSaved.started).ToUniversalTime().ToString('o')) {
        $taskChildren=Get-CimInstance Win32_Process -Filter "ParentProcessId = $($taskProcess.Id)"
        foreach ($taskChild in $taskChildren) {
            if ($taskChild.CommandLine -match '-m (uvicorn app\.main:app|app\.bot)') { Stop-Process -Id $taskChild.ProcessId -ErrorAction SilentlyContinue }
        }
        if (Get-Process -Id $taskProcess.Id -ErrorAction SilentlyContinue) { Stop-Process -Id $taskProcess.Id -ErrorAction SilentlyContinue }
    }
}
Write-Host 'Attendance app, bot and temporary tunnel stopped. Database preserved.'
