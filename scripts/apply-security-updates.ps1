Param(
    [switch]$SkipTests,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot
$TS = Get-Date -Format "yyyyMMdd-HHmmss"
$LOGS = Join-Path $ROOT "logs"
$BACKUP = Join-Path $ROOT "backup"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  SEC(step-2): Aplicar actualizaciones de seguridad" -ForegroundColor Cyan
Write-Host "  Timestamp: $TS" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

Push-Location $ROOT
try {
    # 1. Backup
    Write-Host "`n[1/6] Backup package.json y package-lock.json..." -ForegroundColor Yellow
    Copy-Item package.json (Join-Path $BACKUP "package-$TS.before-updates.json") -Force
    Copy-Item package-lock.json (Join-Path $BACKUP "package-lock-$TS.before-updates.json") -Force
    Write-Host "  → Backup guardado en backup/" -ForegroundColor Green

    # 2. npm audit fix
    Write-Host "`n[2/6] Ejecutando: npm audit fix --omit=dev..." -ForegroundColor Yellow
    $auditFixLog = Join-Path $LOGS "02-pre-npm-audit-fix-$TS.log"
    & npm audit fix --omit=dev 2>&1 | Tee-Object -FilePath $auditFixLog
    Write-Host "  → npm audit fix completado" -ForegroundColor Green

    # 3. Bump react-router-dom (>= 7.18.2 = parche GHSA-qwww-vcr4-c8h2)
    Write-Host "`n[3/6] Actualizando react-router-dom@^7.18.2 (fix GHSA-qwww-vcr4-c8h2)..." -ForegroundColor Yellow
    $routerLog = Join-Path $LOGS "02-pre-react-router-update-$TS.log"
    & npm install react-router-dom@^7.18.2 --save 2>&1 | Tee-Object -FilePath $routerLog
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ERROR: npm install react-router-dom falló. Rollback automático."
        Copy-Item (Join-Path $BACKUP "package-$TS.before-updates.json") package.json -Force
        Copy-Item (Join-Path $BACKUP "package-lock-$TS.before-updates.json") package-lock.json -Force
        & npm ci
        exit 1
    }
    Write-Host "  → react-router-dom actualizado" -ForegroundColor Green

    # 4. Verificación residual de vulnerabilidades
    Write-Host "`n[4/6] Verificación: npm ls react-router-dom react-router..." -ForegroundColor Yellow
    $lsLog = Join-Path $LOGS "02-post-updates-npm-ls-router.log"
    & npm ls react-router-dom react-router 2>&1 | Tee-Object -FilePath $lsLog

    $auditLog = Join-Path $LOGS "02-post-updates-npm-audit.log"
    Write-Host "`n[4.2/6] Verificación final: npm audit --production..." -ForegroundColor Yellow
    & npm audit --production --omit=dev 2>&1 | Tee-Object -FilePath $auditLog
    $vulnCount = (Get-Content $auditLog -Raw | Select-String -Pattern "(\d+) vulnerabilities" -AllMatches).Matches.Groups[1].Value
    Write-Host "  → Vulnerabilidades post-fix: $vulnCount" -ForegroundColor Cyan

    # 5. Tests
    if (-not $SkipTests) {
        Write-Host "`n[5/6] Ejecutando suite de tests vitest..." -ForegroundColor Yellow
        $testLog = Join-Path $LOGS "02-post-updates-vitest.log"
        & npm run test 2>&1 | Tee-Object -FilePath $testLog
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ERROR: Tests fallaron tras actualizaciones de seguridad. Revisar."
            exit 2
        }
        Write-Host "  → Todos los tests pasan" -ForegroundColor Green
    }

    # 6. Build + escaneo secrets dist/
    if (-not $SkipBuild) {
        Write-Host "`n[6/6] Build producción + escaneo secretos..." -ForegroundColor Yellow
        $buildLog = Join-Path $LOGS "02-post-updates-build.log"
        & npm run build 2>&1 | Tee-Object -FilePath $buildLog
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ERROR: build falló tras actualizaciones. Revisar."
            exit 3
        }

        $secretLog = Join-Path $LOGS "02-post-updates-secrets-scan.log"
        $secretsFound = Select-String -Path dist\*.*,dist\**\*.* -Pattern "service_role|SUPABASE_SERVICE_ROLE_KEY|eyJhbGciOiJIUzI1Ni" -ErrorAction SilentlyContinue
        if ($secretsFound) {
            "SECRETS DETECTADOS EN DIST/:`n" + ($secretsFound | Out-String) | Set-Content $secretLog
            Write-Error "ERROR: secretos detectados en dist/. Rollback manual requerido."
            exit 4
        } else {
            "OK: 0 coincidencias de 'service_role' / JWT en dist/" | Set-Content $secretLog
            Write-Host "  → Build OK, 0 secretos detectados en dist/" -ForegroundColor Green
        }
    }

    Write-Host "`n================================================" -ForegroundColor Green
    Write-Host "  ✅ PASO 2 COMPLETADO: Actualizaciones de seguridad aplicadas." -ForegroundColor Green
    Write-Host "     - Logs: $LOGS\02-*" -ForegroundColor Gray
    Write-Host "     - Backup: $BACKUP\package-*-$TS.*" -ForegroundColor Gray
    Write-Host "================================================" -ForegroundColor Green

    exit 0
}
finally {
    Pop-Location
}
