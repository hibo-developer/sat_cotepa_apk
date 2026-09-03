Param(
    [Parameter(Mandatory=$true)][string]$ToCommit,
    [string]$LogPrefix = "ROLLBACK-STAGING",
    [switch]$DryRun = $false
)

$ROOT = Split-Path -Parent $PSScriptRoot
$TS = Get-Date -Format "yyyyMMdd-HHmmss"
$LOGS = Join-Path $ROOT "logs"
$LOG  = Join-Path $LOGS ("{0}-{1}.log" -f $LogPrefix,$TS)

Push-Location $ROOT
$ErrorActionPreference = "Continue"
try {
    ("ROLLBACK STAGING | Timestamp={0} | ToCommit={1} | DryRun={2}" -f $TS,$ToCommit,$DryRun) | Set-Content $LOG
    Add-Content $LOG "== git status BEFORE =="
    git status --short 2>&1 | Add-Content $LOG

    if ($DryRun) {
        Write-Host "===== DRY RUN =====" -ForegroundColor Yellow
        Write-Host "[1] git stash push -m 'rollback-staging-pre-$TS' (para conservar cambios locales sueltos)" -ForegroundColor Cyan
        Write-Host "[2] git reset --hard $ToCommit (retroceder staging al commit baseline)" -ForegroundColor Cyan
        Write-Host "[3] Restablecer Edge Functions a pre-cors-fix.bak (si aplica, si el ToCommit es pre-step-3)" -ForegroundColor Cyan
        Write-Host "[4] Restablecer package*.json desde backup/ si las dependencias deben rollback" -ForegroundColor Cyan
        Write-Host "[5] npm ci desde package-lock.json (restablecer node_modules al punto deseado)" -ForegroundColor Cyan
        Write-Host "[6] RUN scripts/preflight-staging.ps1 como punto de control post-rollback" -ForegroundColor Cyan
        exit 0
    }

    # Paso 1 - Guardar cambios locales por si acaso
    Write-Host "[1/6] git stash (backup cambios sin commitear)" -ForegroundColor Yellow
    git stash push -u -m ("{0}-pre-{1}" -f $LogPrefix,$TS) 2>&1 | Add-Content $LOG

    # Paso 2 - Reset al commit indicado
    Write-Host "[2/6] git reset --hard $ToCommit" -ForegroundColor Yellow
    git reset --hard $ToCommit 2>&1 | Add-Content $LOG
    if ($LASTEXITCODE -ne 0) { Write-Host ("  [FAIL] git reset FALLIDO. Ver {0}" -f $LOG) -ForegroundColor Red; exit 1 }

    # Paso 3 - Rollback CORS edge functions (si los backups existen y son mas nuevos que ToCommit)
    Write-Host "[3/6] Rollback CORS whitelist (restaurando backups .pre-cors-fix.bak si existen)" -ForegroundColor Yellow
    $baks = Get-ChildItem -Path supabase/functions -Filter "index.ts.pre-cors-fix.bak" -Recurse -ErrorAction SilentlyContinue
    foreach ($b in $baks) {
        $target = Join-Path $b.Directory.FullName "index.ts"
        Add-Content $LOG ("Restore CORS backup: {0} -> {1}" -f $b.FullName,$target)
        Copy-Item $b.FullName $target -Force
    }

    # Paso 4 - Rollback package.json/package-lock.json si existen backups GOOD
    Write-Host "[4/6] Rollback dependencias (package*.json) si backup/*GOOD.json existe" -ForegroundColor Yellow
    if (Test-Path "backup/package-baseline.GOOD.json") {
        Copy-Item "backup/package-baseline.GOOD.json" "package.json" -Force
        Add-Content $LOG "Restore package.json <- backup/package-baseline.GOOD.json"
    }
    if (Test-Path "package-lock.json.baseline") {
        Copy-Item "package-lock.json.baseline" "package-lock.json" -Force
        Add-Content $LOG "Restore package-lock.json <- package-lock.json.baseline"
    }

    # Paso 5 - npm ci
    Write-Host "[5/6] npm ci (restablecer node_modules exacto)" -ForegroundColor Yellow
    if (Test-Path node_modules) { Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue }
    & npm ci 2>&1 | Add-Content $LOG
    if ($LASTEXITCODE -ne 0) { Write-Host ("  [FAIL] npm ci FALLIDO. Ver {0}" -f $LOG) -ForegroundColor Red; exit 1 }

    # Paso 6 - Run preflight
    Write-Host "[6/6] Validacion post-rollback: scripts/preflight-staging.ps1" -ForegroundColor Yellow
    & powershell -ExecutionPolicy Bypass -File "scripts/preflight-staging.ps1" -BaselineCommit $ToCommit 2>&1 | Add-Content $LOG
    if ($LASTEXITCODE -ne 0) { Write-Host ("  [FAIL] Preflight post-rollback FALLIDO - requiere intervencion humana. Ver {0}" -f $LOG) -ForegroundColor Red; exit 1 }

    Add-Content $LOG "ROLLBACK-STAGING COMPLETADO EXITOSAMENTE"
    Write-Host ("`n[OK] ROLLBACK STAGING COMPLETADO. Log: {0}" -f $LOG) -ForegroundColor Green
    exit 0
}
catch {
    Add-Content $LOG ("FATAL: " + $_.Exception.ToString())
    Write-Host "  [FAIL] ROLLBACK FALLIDO. Ver $LOG" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
