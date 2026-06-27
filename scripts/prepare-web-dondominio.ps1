param(
  [switch]$Rebuild,
  [string]$OutputRoot
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")

if (-not $OutputRoot) {
  $OutputRoot = Join-Path $repoRoot "release-web-dondominio"
}

$distDir = Join-Path $repoRoot "dist"
$templateHtaccess = Join-Path $repoRoot "deploy\dondominio\.htaccess"
$templateSw = Join-Path $repoRoot "deploy\dondominio\sw.js"

if ($Rebuild) {
  Push-Location $repoRoot
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
      throw "Fallo en 'npm run build' (exit code $LASTEXITCODE)."
    }
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path $distDir)) {
  throw "No existe la carpeta dist. Ejecuta antes un build o usa -Rebuild."
}

if (-not (Test-Path $templateHtaccess)) {
  throw "No existe la plantilla .htaccess para Dondominio: $templateHtaccess"
}

if (-not (Test-Path $templateSw)) {
  throw "No existe la plantilla sw.js para Dondominio: $templateSw"
}

if (-not (Test-Path $OutputRoot)) {
  New-Item -ItemType Directory -Path $OutputRoot | Out-Null
}

$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$targetDir = Join-Path $OutputRoot $stamp
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

Copy-Item -Path (Join-Path $distDir "*") -Destination $targetDir -Recurse -Force
Copy-Item -Path $templateHtaccess -Destination (Join-Path $targetDir ".htaccess") -Force
Copy-Item -Path $templateSw -Destination (Join-Path $targetDir "sw.js") -Force

Write-Host "Paquete Dondominio preparado:" 
Get-Item $targetDir | Select-Object FullName, LastWriteTime | Format-List

Write-Host "Contenido clave:"
Get-ChildItem -Path $targetDir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
