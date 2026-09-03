Param(
    [string]$BaselineCommit = ""
)

$ErrorActionPreference = "Continue"
$ROOT = Split-Path -Parent $PSScriptRoot
$TS = Get-Date -Format "yyyyMMdd-HHmmss"
$LOGS = Join-Path $ROOT "logs"
$STAMP_FILE = Join-Path $LOGS "PREFLIGHT-STAGING-PASSED.$TS"

function WriteStep($n, $t) {
    Write-Host ("`n[{0}/6] {1}" -f $n, $t) -ForegroundColor Yellow
}

Push-Location $ROOT
$failures = 0
try {
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "  PREFLIGHT STAGING - Auditoria Seguridad H2-2026" -ForegroundColor Cyan
    Write-Host ("  Timestamp: {0}" -f $TS) -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan

    # 1. npm audit production
    WriteStep 1 "npm audit --production (0 vulnerabilidades requerido)"
    $auditLog = Join-Path $LOGS ("05-preflight-npm-audit-{0}.log" -f $TS)
    & npm audit --production --omit=dev 2>&1 | Tee-Object -FilePath $auditLog
    $auditRaw = Get-Content $auditLog -Raw
    $auditOk = ($LASTEXITCODE -eq 0) -and ($auditRaw | Select-String "found 0 vulnerabilities")
    if ($auditOk) { Write-Host "  [OK] PASS" -ForegroundColor Green } else { Write-Host "  [FAIL] FAIL" -ForegroundColor Red; $failures++ }

    # 2. vitest
    WriteStep 2 "npm run test (vitest - 0 fallos requerido)"
    $testLog = Join-Path $LOGS ("05-preflight-vitest-{0}.log" -f $TS)
    & npm run test 2>&1 | Tee-Object -FilePath $testLog
    $vitestExit = $LASTEXITCODE
    $testsOk = ($vitestExit -eq 0)
    if ($testsOk) { Write-Host "  [OK] PASS (vitest exit 0)" -ForegroundColor Green } else { Write-Host "  [FAIL] FAIL (vitest exit=$vitestExit)" -ForegroundColor Red; $failures++ }

    # 3. Build
    WriteStep 3 "npm run build (Vite build exit 0 requerido)"
    $buildLog = Join-Path $LOGS ("05-preflight-build-{0}.log" -f $TS)
    & npm run build 2>&1 | Tee-Object -FilePath $buildLog
    if ($LASTEXITCODE -eq 0) { Write-Host "  [OK] PASS" -ForegroundColor Green } else { Write-Host "  [FAIL] FAIL" -ForegroundColor Red; $failures++ }

    # 4. Scan secrets dist/
    WriteStep 4 "Escaneo secrets en dist/ (service_role / JWT eyJhbGci...)"
    $secretLog = Join-Path $LOGS ("05-preflight-secrets-scan-{0}.log" -f $TS)
    $hits = Get-ChildItem -Path dist -Recurse -File -ErrorAction SilentlyContinue | Select-String -Pattern "service_role|SUPABASE_SERVICE_ROLE_KEY|eyJhbGciOiJIUzI1Ni" -ErrorAction SilentlyContinue
    if ($hits) {
        ("SECRETS DETECTADOS EN DIST/: `n{0}" -f ($hits | Out-String)) | Set-Content $secretLog
        Write-Host "  [FAIL] FAIL - secretos detectados. Ver $secretLog" -ForegroundColor Red
        $failures++
    } else {
        "OK: 0 coincidencias" | Set-Content $secretLog
        Write-Host "  [OK] PASS" -ForegroundColor Green
    }

    # 5. CORS whitelist count == 5
    WriteStep 5 "Validacion CORS whitelist estricta (5 Edge Functions, 0 origin || '*' )"
    $corsLog = Join-Path $LOGS ("05-preflight-cors-{0}.log" -f $TS)
    $aoCount = (Get-ChildItem -Path supabase/functions -Filter index.ts -Recurse | Select-String -Pattern "ALLOWED_ORIGINS\s*=\s*new\s*Set").Count
    $badOrigin = (Get-ChildItem -Path supabase/functions -Filter index.ts -Recurse | Select-String -Pattern "origin\s*\|\|\s*'\*'").Count
    $corsOk = ($aoCount -eq 5) -and ($badOrigin -eq 0)
    ("ALLOWED_ORIGINS count={0} (esperado 5); origin || '*' count={1} (esperado 0); PASS={2}" -f $aoCount,$badOrigin,$corsOk) | Set-Content $corsLog
    if ($corsOk) { Write-Host ("  [OK] PASS (ALLOWED_ORIGINS={0}/5, origin||*={1}/0)" -f $aoCount,$badOrigin) -ForegroundColor Green } else { Write-Host "  [FAIL] FAIL - ver $corsLog" -ForegroundColor Red; $failures++ }

    # 6. Validacion sintaxis Edge Functions
    WriteStep 6 "Validacion estructural Edge Functions (imports y Deno.serve)"
    $edgeLog = Join-Path $LOGS ("05-preflight-edge-syntax-{0}.log" -f $TS)
    $edgeFuncs = @('admin-users','gdpr-delete-client','storage-signed-url','generate-part-pdf','send-sat-email')
    $edgeOkAll = $true
    foreach ($ef in $edgeFuncs) {
        $p = "supabase/functions/$ef/index.ts"
        $hasClient = Select-String -Path $p -Pattern "createClient\(" -Quiet
        $hasServe = Select-String -Path $p -Pattern "Deno\.serve" -Quiet
        $ok = $hasClient -and $hasServe
        if ($ok) { Add-Content $edgeLog ("{0} - OK (createClient + Deno.serve detectados)" -f $ef) } else { Add-Content $edgeLog ("{0} - FAIL (createClient={1}, Deno.serve={2})" -f $ef,$hasClient,$hasServe); $edgeOkAll = $false }
    }
    if ($edgeOkAll) { Write-Host "  [OK] PASS (5/5 funciones estructuralmente sanas)" -ForegroundColor Green } else { Write-Host "  [FAIL] FAIL - ver $edgeLog" -ForegroundColor Red; $failures++ }

    # Resumen
    Write-Host "`n================================================" -ForegroundColor Cyan
    if ($failures -eq 0) {
        ("PREFLIGHT STAGING PASADO | Timestamp={0} | BaselineCommit={1}" -f $TS,$BaselineCommit) | Set-Content $STAMP_FILE
        Write-Host ("  [OK] PREFLIGHT PASADO (6/6 checks). Stamp: {0}" -f $STAMP_FILE) -ForegroundColor Green
        exit 0
    } else {
        Write-Host ("  [FAIL] PREFLIGHT FALLIDO: {0} checks sin pasar." -f $failures) -ForegroundColor Red
        Write-Host ("  Revisar logs en logs/05-preflight-*-{0}.log" -f $TS)
        exit 1
    }
}
finally {
    Pop-Location
}
