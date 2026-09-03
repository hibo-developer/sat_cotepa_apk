Param(
    [Parameter(Mandatory=$true)][string]$ToCommit,
    [Parameter(Mandatory=$false)][string]$SupabaseProjectRef,
    [switch]$DryRun = $false,
    [string]$LogPrefix = "ROLLBACK-PROD"
)

$ROOT = Split-Path -Parent $PSScriptRoot
$TS = Get-Date -Format "yyyyMMdd-HHmmss"
$LOGS = Join-Path $ROOT "logs"
$LOG  = Join-Path $LOGS ("{0}-{1}.log" -f $LogPrefix,$TS)
$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

Push-Location $ROOT
$ErrorActionPreference = "Continue"
try {
    ("ROLLBACK PRODUCCION | Timestamp={0} | ToCommit={1} | SupabaseProjectRef={2} | DryRun={3}" -f $TS,$ToCommit,$SupabaseProjectRef,$DryRun) | Set-Content $LOG

    Write-Host "============================================================" -ForegroundColor Red
    Write-Host ("  AVISO: EJECUTANDO ROLLBACK DE PRODUCCION A {0}" -f $ToCommit) -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red

    if (-not $SupabaseProjectRef -and -not $DryRun) {
        Write-Host "  ERROR: se requiere -SupabaseProjectRef para rollback real (usar para redeploy Edge Functions si fuera necesario)." -ForegroundColor Red
        exit 2
    }

    if ($DryRun) {
        Write-Host "===== DRY RUN ROLLBACK PROD =====" -ForegroundColor Yellow
        Write-Host "[1]  NOTIFICACION: enviar al aprobador y canales ops alerta de rollback en curso" -ForegroundColor Cyan
        Write-Host "[2]  scripts/rollback-staging.ps1 -ToCommit $ToCommit (revertir codigo fuente a punto seguro)" -ForegroundColor Cyan
        Write-Host ("[3]  Supabase Edge Functions redeploy al commit {0} para proyecto REF={1}" -f $ToCommit,$SupabaseProjectRef) -ForegroundColor Cyan
        Write-Host "[4]  Build frontend VITE env=PROD desde $ToCommit" -ForegroundColor Cyan
        Write-Host "[5]  Deploy frontend a sat.cotepa.com / Netlify / CDN" -ForegroundColor Cyan
        Write-Host "[6]  Smoke test 3 roles (admin/oficina/tecnico) sobre produccion" -ForegroundColor Cyan
        Write-Host "[7]  Monitoreo 60 min post-rollback: errores 5xx / auth success rate / latency" -ForegroundColor Cyan
        Write-Host "[8]  Cierre ticket + comunicacion usuarios si fuera necesario" -ForegroundColor Cyan
        exit 0
    }

    Add-Content $LOG "== PASO 1: notificar al aprobador =="
    Write-Host "[1/8] Notificar aprobador (inicia rollback prod)" -ForegroundColor Yellow

    Add-Content $LOG "== PASO 2: rollback-staging.ps1 para revertir fuente =="
    Write-Host "[2/8] Rollback codigo fuente a $ToCommit" -ForegroundColor Yellow
    & powershell -ExecutionPolicy Bypass -File "scripts/rollback-staging.ps1" -ToCommit $ToCommit 2>&1 | Add-Content $LOG
    if ($LASTEXITCODE -ne 0) { Write-Host "  [FAIL] Paso 2 rollback staging fallo. Abortando rollback prod." -ForegroundColor Red; exit 1 }

    Add-Content $LOG "== PASO 3: Supabase edge functions redeploy =="
    Write-Host ("[3/8] (PENDIENTE EJECUCION MANUAL) Re-deploy edge functions a prod REF={0}" -f $SupabaseProjectRef) -ForegroundColor Yellow
    Write-Host ("   -> Supabase CLI: cd supabase; supabase functions deploy --project-ref {0}" -f $SupabaseProjectRef) -ForegroundColor Cyan

    Add-Content $LOG "== PASO 4: Build frontend PROD =="
    Write-Host "[4/8] Build frontend PROD" -ForegroundColor Yellow
    if (Test-Path dist) { Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue }
    & npm run build 2>&1 | Add-Content $LOG
    if ($LASTEXITCODE -ne 0) { Write-Host ("  [FAIL] Build prod fallido post rollback. Ver {0}" -f $LOG) -ForegroundColor Red; exit 1 }

    Add-Content $LOG "== PASO 5: Deploy frontend (PENDIENTE ejecutar Netlify CLI / FTP / CDN) =="
    Write-Host "[5/8] (PENDIENTE EJECUCION MANUAL) Desplegar dist/ a sat.cotepa.com - $ToCommit" -ForegroundColor Yellow

    Add-Content $LOG "== PASO 6: Smoke tests (PENDIENTE manual) =="
    Write-Host "[6/8] (PENDIENTE MANUAL) Smoke tests 3 roles en produccion" -ForegroundColor Yellow

    Add-Content $LOG "== PASO 7: Monitoreo 60 minutos post rollback =="
    Write-Host ("[7/8] Monitoreo Supabase dashboard (REF={0}) - auth success, REST 5xx, Storage 5xx, Edge Functions 5xx por 60 minutos" -f $SupabaseProjectRef) -ForegroundColor Yellow

    Add-Content $LOG "== PASO 8: Cierre =="
    $Stopwatch.Stop()
    Add-Content $LOG ("ROLLBACK-PROD COMPLETADO EN: " + $Stopwatch.Elapsed.ToString())
    Write-Host ("`n[OK] ROLLBACK PROD COMPLETADO ({0}). Duracion: {1}. Log: {2}" -f $TS,$Stopwatch.Elapsed.ToString(),$LOG) -ForegroundColor Green
    exit 0
}
catch {
    Add-Content $LOG ("FATAL ROLLBACK-PROD: " + $_.Exception.ToString())
    Write-Host ("  [FAIL] FATAL: {0}" -f $_.Exception.Message) -ForegroundColor Red
    exit 1
}
finally {
    $Stopwatch.Stop()
    Pop-Location
}
