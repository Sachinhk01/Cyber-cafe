# Runs the full API test against a separate TEST database, without touching your real data or .env.
#   cd backend
#   npm run test:api
# It starts a second API on port 5055 (database "cyber_cafe_test", test payments, emails/SMS printed only),
# runs scripts/smoke-test.js against it, then stops that server. Your normal server on 5000 can keep running.

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Test-Path '.env')) { Write-Host 'backend/.env not found. Create it first (copy .env.example to .env).' -ForegroundColor Red; exit 1 }
$line = (Select-String -Path '.env' -Pattern '^\s*MONGO_URI\s*=' | Select-Object -First 1).Line
if (-not $line) { Write-Host 'MONGO_URI is missing in backend/.env' -ForegroundColor Red; exit 1 }
$uri = ($line -replace '^\s*MONGO_URI\s*=\s*', '').Trim().Trim('"')

# Same cluster, different database name: .../cyber_cafe?...  ->  .../cyber_cafe_test?...
if ($uri -match '/([A-Za-z0-9_-]+)(\?|$)') {
  $db = $Matches[1]
  $testDb = if ($db -like '*_test') { $db } else { "${db}_test" }
  $env:MONGO_URI = $uri -replace "/$db(\?|$)", "/$testDb`$1"
} else {
  $env:MONGO_URI = $uri.TrimEnd('/') + '/cyber_cafe_test'
  $testDb = 'cyber_cafe_test'
}

$env:PORT = '5055'
$env:NODE_ENV = 'development'
$env:TEST_MODE = '1'          # test payments, emails/SMS only printed
$env:UPLOAD_DIR = 'uploads-test'
$env:BACKUP_DIR = 'off'
$env:API_URL = 'http://127.0.0.1:5055'

Write-Host "Starting a test API on port 5055 (database: $testDb) ..." -ForegroundColor Cyan
$server = Start-Process -FilePath 'node' -ArgumentList 'src/server.js' -PassThru -NoNewWindow `
  -RedirectStandardOutput 'test-server.log' -RedirectStandardError 'test-server.err.log'

$code = 1
try {
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    if ($server.HasExited) { break }
    try {
      $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5055/api/health' -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
  }
  if (-not $ready) {
    Write-Host 'The test API did not start. Its output:' -ForegroundColor Red
    Get-Content 'test-server.log', 'test-server.err.log' -ErrorAction SilentlyContinue | Select-Object -Last 30
    exit 1
  }

  node scripts/smoke-test.js --yes
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Write-Host "`nLast lines from the test API (test-server.err.log):" -ForegroundColor Yellow
    Get-Content 'test-server.err.log' -ErrorAction SilentlyContinue | Select-Object -Last 25
  }
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
exit $code
