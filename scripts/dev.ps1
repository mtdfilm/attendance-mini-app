param([switch]$Demo)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Create .venv and install requirements first; see README.md' }
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'frontend\dist\index.html'))) { throw 'Build frontend first: cd frontend; npm ci; npm run build' }
$env:APP_ENV='development'
$env:DEV_AUTH_BYPASS='true'
Set-Location -LiteralPath (Join-Path $taskRoot 'backend')
if ($Demo) { $env:DATABASE_URL='sqlite:///./data/demo.db' }
& $taskPython -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
if ($Demo) { & $taskPython -m app.seed }
Write-Host 'Attendance: http://127.0.0.1:8000 — local dev authentication enabled'
& $taskPython -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
