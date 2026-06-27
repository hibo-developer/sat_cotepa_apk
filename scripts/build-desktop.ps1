param(
  [ValidateSet("nsis", "portable")]
  [string]$Target = "nsis"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$defaultOutputDir = Join-Path $repoRoot "release-desktop"
$fallbackOutputDir = Join-Path $repoRoot "release-desktop-fallback"

. (Join-Path $scriptDir "ensure-node-path.ps1")

function Read-EnvFile([string]$envPath) {
  $map = @{}
  if (-not (Test-Path $envPath)) {
    return $map
  }

  foreach ($linea in Get-Content -Path $envPath -ErrorAction SilentlyContinue) {
    $texto = [string]$linea
    if (-not $texto) {
      continue
    }

    $trim = $texto.Trim()
    if (-not $trim -or $trim.StartsWith('#')) {
      continue
    }

    $idx = $trim.IndexOf('=')
    if ($idx -le 0) {
      continue
    }

    $clave = $trim.Substring(0, $idx).Trim()
    $valor = $trim.Substring($idx + 1).Trim()
    if (($valor.StartsWith('"') -and $valor.EndsWith('"')) -or ($valor.StartsWith("'") -and $valor.EndsWith("'"))) {
      $valor = $valor.Substring(1, $valor.Length - 2)
    }

    if ($clave) {
      $map[$clave] = $valor
    }
  }

  return $map
}

function Read-PublicAppConfig([string]$repoRoot) {
  $map = @{}
  $configPath = Join-Path $repoRoot "public\app-config.js"
  if (-not (Test-Path $configPath)) {
    return $map
  }

  $contenido = Get-Content -Path $configPath -Raw -ErrorAction SilentlyContinue
  if (-not $contenido) {
    return $map
  }

  if ($contenido -match "SUPABASE_URL\s*:\s*['\""]([^'\""]*)['\""]") {
    $map["VITE_SUPABASE_URL"] = $Matches[1]
  }

  if ($contenido -match "SUPABASE_ANON_KEY\s*:\s*['\""]([^'\""]*)['\""]") {
    $map["VITE_SUPABASE_ANON_KEY"] = $Matches[1]
  }

  return $map
}

function Get-ConfigValue([hashtable]$envData, [hashtable]$publicConfig, [string]$key) {
  $desdeProceso = [Environment]::GetEnvironmentVariable($key)
  if (-not [string]::IsNullOrWhiteSpace($desdeProceso)) {
    return $desdeProceso.Trim()
  }

  if ($envData.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($envData[$key])) {
    return [string]$envData[$key]
  }

  if ($publicConfig.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($publicConfig[$key])) {
    return [string]$publicConfig[$key]
  }

  return ""
}

function Write-RuntimeAppConfig([string]$repoRoot) {
  $envData = Read-EnvFile (Join-Path $repoRoot ".env")
  $publicConfig = Read-PublicAppConfig $repoRoot
  $supabaseUrl = Get-ConfigValue $envData $publicConfig "VITE_SUPABASE_URL"
  $supabaseAnonKey = Get-ConfigValue $envData $publicConfig "VITE_SUPABASE_ANON_KEY"

  if ([string]::IsNullOrWhiteSpace($supabaseUrl) -or [string]::IsNullOrWhiteSpace($supabaseAnonKey)) {
    throw "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Define estas variables en el entorno o en .env antes de generar el EXE."
  }

  $distDir = Join-Path $repoRoot "dist"
  Ensure-Dir $distDir

  $configJson = @{
    SUPABASE_URL = $supabaseUrl
    SUPABASE_ANON_KEY = $supabaseAnonKey
  } | ConvertTo-Json -Compress

  $contenido = @(
    "window.__APP_CONFIG__ = Object.assign({}, window.__APP_CONFIG__ || {}, $configJson);"
    ""
  )

  $destino = Join-Path $distDir "app-config.js"
  Set-Content -Path $destino -Value $contenido -Encoding UTF8
  Write-Host "Runtime config generado: $destino"
}

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path | Out-Null
  }
}

$cacheRoot = Join-Path $repoRoot ".cache"
$electronCache = Join-Path $cacheRoot "electron"
$electronBuilderCache = Join-Path $cacheRoot "electron-builder"
Ensure-Dir $cacheRoot
Ensure-Dir $electronCache
Ensure-Dir $electronBuilderCache
$env:ELECTRON_CACHE = $electronCache
$env:ELECTRON_BUILDER_CACHE = $electronBuilderCache

function Remove-DirSafe([string]$path) {
  if (-not (Test-Path $path)) {
    return $true
  }

  try {
    Remove-Item -Recurse -Force -Path $path -ErrorAction Stop
    return $true
  }
  catch {
    $msg = $_.Exception.Message
    Write-Warning "No se pudo limpiar '$path': $msg"
    if ($msg -match 'Acceso denegado|being used by another process|en uso') {
      return $false
    }
    return $true
  }
}

function Stop-DesktopProcesses {
  $processNames = @("SAT Movil COTEPA", "electron")

  foreach ($name in $processNames) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
}

function Build-DesktopPortable([string]$outputDir) {
  npx electron-builder --win $Target --config.directories.output="$outputDir"
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo en electron-builder para target '$Target' y output '$outputDir' (exit code $LASTEXITCODE)."
  }
}

function Ensure-ReleaseFolder([string]$path) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path | Out-Null
  }
}

function Get-BuildArtifact([string]$outputDir) {
  $artifact = Get-ChildItem -Path $outputDir -Filter *.exe -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $artifact) {
    throw "No se encontro ningun .exe generado en '$outputDir'."
  }

  return $artifact
}

function Publish-ReleaseArtifact([string]$repoRoot, [string]$artifactPath) {
  $releaseRoot = Join-Path $repoRoot "release"
  $stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
  $releaseFolder = Join-Path $releaseRoot $stamp

  Ensure-ReleaseFolder $releaseRoot
  Ensure-ReleaseFolder $releaseFolder

  $artifactName = Split-Path $artifactPath -Leaf
  $destPath = Join-Path $releaseFolder $artifactName
  Copy-Item -Path $artifactPath -Destination $destPath -Force

  return $destPath
}

function Invoke-DesktopInstallerSigning([string]$artifactPath) {
  $signScript = Join-Path $scriptDir "sign-desktop-installer.ps1"
  $defaultPfxPath = "C:\secure\cotepa-code-signing\COTEPA-Internal-Code-Signing.pfx"
  $pfxPath = Get-ConfigValue @{} @{} "CODE_SIGNING_PFX_PATH"
  if ([string]::IsNullOrWhiteSpace($pfxPath)) {
    $pfxPath = $defaultPfxPath
  }

  if (-not (Test-Path $pfxPath)) {
    Write-Warning "No se encontro PFX de firma en '$pfxPath'. Se omite la firma del instalador."
    return
  }

  $timestampUrl = [Environment]::GetEnvironmentVariable("CODE_SIGNING_TIMESTAMP_URL")
  $description = [Environment]::GetEnvironmentVariable("CODE_SIGNING_DESCRIPTION")
  $descriptionUrl = [Environment]::GetEnvironmentVariable("CODE_SIGNING_DESCRIPTION_URL")
  $pfxPassword = [Environment]::GetEnvironmentVariable("CODE_SIGNING_PFX_PASSWORD")

  $args = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $signScript,
    "-InstallerPath", $artifactPath,
    "-PfxPath", $pfxPath
  )

  if ($timestampUrl) { $args += @("-TimestampUrl", $timestampUrl) }
  if ($description) { $args += @("-Description", $description) }
  if ($descriptionUrl) { $args += @("-DescriptionUrl", $descriptionUrl) }
  if ($pfxPassword) { $args += @("-PfxPassword", $pfxPassword) }

  & powershell @args
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo la firma del instalador (exit code $LASTEXITCODE)."
  }
}

Push-Location $repoRoot
try {
  Write-Host "[1/4] Build web (Vite)..."
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo en 'npm run build' (exit code $LASTEXITCODE)."
  }

  Write-RuntimeAppConfig $repoRoot

  Write-Host "[2/4] Cerrando procesos de escritorio que puedan bloquear artefactos..."
  Stop-DesktopProcesses

  Write-Host "[3/4] Limpiando salida previa en release-desktop..."
  $canUseDefaultOutput = $true
  Get-ChildItem -Path $defaultOutputDir -Filter *.exe -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -Path $defaultOutputDir -Filter *.blockmap -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  $defaultWinUnpacked = Join-Path $defaultOutputDir "win-unpacked"
  if (-not (Remove-DirSafe $defaultWinUnpacked)) {
    $canUseDefaultOutput = $false
    Write-Warning "release-desktop esta bloqueado. Se usara carpeta de fallback para empaquetar."
  }

  Write-Host "[4/4] Empaquetando build Windows ($Target)..."
  $outputDir = if ($canUseDefaultOutput) { $defaultOutputDir } else { $fallbackOutputDir }
  if ($outputDir -eq $fallbackOutputDir) {
    Get-ChildItem -Path $fallbackOutputDir -Filter *.exe -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $fallbackOutputDir -Filter *.blockmap -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Remove-DirSafe $fallbackOutputDir | Out-Null
  }
  Build-DesktopPortable $outputDir

  $artifact = Get-BuildArtifact $outputDir
  $artifactPath = $artifact.FullName

  if ($outputDir -ne $defaultOutputDir) {
    Ensure-ReleaseFolder $defaultOutputDir
    $finalArtifactPath = Join-Path $defaultOutputDir $artifact.Name
    Copy-Item -Path $artifactPath -Destination $finalArtifactPath -Force
    $artifactPath = $finalArtifactPath
  }

  $releaseArtifactPath = Publish-ReleaseArtifact $repoRoot $artifactPath

  if ($Target -eq "nsis") {
    Write-Host "[5/4] Firmando instalador Windows..."
    Invoke-DesktopInstallerSigning $releaseArtifactPath
  }

  Write-Host "Build desktop completado correctamente:"
  Get-Item $artifactPath | Select-Object FullName, Length, LastWriteTime | Format-List
  Write-Host "Publicacion en release completada:"
  Get-Item $releaseArtifactPath | Select-Object FullName, Length, LastWriteTime | Format-List
}
finally {
  Pop-Location
}
