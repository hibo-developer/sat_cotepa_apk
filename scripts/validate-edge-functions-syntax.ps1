Param(
    [switch]$JsonReport = $false
)

$ROOT = Split-Path -Parent $PSScriptRoot
Push-Location $ROOT

$EdgeFuncs = @('admin-users','gdpr-delete-client','storage-signed-url','generate-part-pdf','send-sat-email')
$RequiredPatterns = @(
    @{ label='Deno.serve handler';       regex='Deno\.serve\s*\(' },
    @{ label='ALLOWED_ORIGINS Set';      regex='ALLOWED_ORIGINS\s*=\s*new\s*Set\s*\(' },
    @{ label='createClient Supabase';    regex='createClient\s*\(' },
    @{ label='buildCorsHeaders';         regex='buildCorsHeaders\s*\(' }
)
$ForbiddenPatterns = @(
    @{ label="origin || '*' permissivo"; regex="origin\s*\|\|\s*'\*'" }
)

$report = @()
$globalPass = $true

Write-Host "=== Validacion Sintaxis/Estructura Edge Functions Supabase (5/5) ===" -ForegroundColor Cyan

foreach ($ef in $EdgeFuncs) {
    $p = Join-Path (Join-Path $ROOT "supabase/functions") "$ef/index.ts"
    if (-not (Test-Path $p)) {
        Write-Host "[SKIP] $ef - archivo $p no existe" -ForegroundColor DarkGray
        $report += [pscustomobject]@{ Func=$ef; Status='SKIP'; Razon='Archivo no encontrado'; Failures=@() }
        continue
    }
    $content = Get-Content $p -Raw
    $failures = @()
    foreach ($rp in $RequiredPatterns) {
        if (-not ($content | Select-String -Pattern $rp.regex -Quiet)) {
            $failures += ("Falta: {0}" -f $rp.label)
        }
    }
    foreach ($fp in $ForbiddenPatterns) {
        if ($content | Select-String -Pattern $fp.regex -Quiet) {
            $failures += ("Prohibido: {0}" -f $fp.label)
        }
    }
    $passed = $failures.Count -eq 0
    if (-not $passed) { $globalPass = $false }
    $report += [pscustomobject]@{ Func=$ef; Status=if($passed){'PASS'}else{'FAIL'}; Failures=$failures }
    $color = if ($passed) { 'Green' } else { 'Red' }
    Write-Host ("  [{0}] {1}" -f $report[-1].Status,$ef) -ForegroundColor $color
    foreach ($f in $failures) { Write-Host ("    - {0}" -f $f) -ForegroundColor Red }
}

Write-Host ("`nTotal: {0} funciones; PASS={1}; FAIL={2}" -f $EdgeFuncs.Count, $report.Where({$_.Status -eq 'PASS'}).Count, $report.Where({$_.Status -eq 'FAIL'}).Count) -ForegroundColor Cyan

if ($JsonReport) {
    $report | ConvertTo-Json -Depth 3 | Out-Host
}

Pop-Location
if (-not $globalPass) { exit 1 }
exit 0
