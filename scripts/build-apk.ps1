param(
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")

. (Join-Path $scriptDir "ensure-node-path.ps1")

function Ensure-JavaDisponible {
  $javaCmd = Get-Command java -ErrorAction SilentlyContinue
  if ($javaCmd) {
    Write-Host "JAVA detectado en PATH: $($javaCmd.Source)"
    return
  }

  if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
    $env:Path = (Join-Path $env:JAVA_HOME "bin") + ";" + $env:Path
    Write-Host "JAVA_HOME detectado: $env:JAVA_HOME"
    return
  }

  $instalacion = $null

  try {
    $instalacion = Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
      Where-Object { ($_.DisplayName -like 'Microsoft Build of OpenJDK*') -and $_.InstallLocation } |
      Select-Object -First 1 -ExpandProperty InstallLocation
  } catch {}

  if (-not $instalacion) {
    $instalacion = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "Programs\Microsoft") -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'jdk-*' } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }

  if ($instalacion -and (Test-Path (Join-Path $instalacion "bin\java.exe"))) {
    $env:JAVA_HOME = $instalacion.TrimEnd('\')
    $env:Path = (Join-Path $env:JAVA_HOME "bin") + ";" + $env:Path
    Write-Host "JAVA_HOME configurado: $env:JAVA_HOME"
    return
  }

  throw "JAVA_HOME no está configurado y no se encontró Java. Instala un JDK (17 recomendado) y vuelve a ejecutar el empaquetado."
}

function Ensure-AndroidSdkDisponible([string]$repoRoot) {
  $localPropsPath = Join-Path $repoRoot "android\local.properties"
  if (-not (Test-Path $localPropsPath)) {
    throw "No se encontró android\\local.properties. Abre Android Studio una vez para generar la configuración y vuelve a ejecutar."
  }

  $lineaSdk = (Get-Content -Path $localPropsPath -ErrorAction SilentlyContinue) |
    Where-Object { $_ -like 'sdk.dir=*' } |
    Select-Object -First 1

  if (-not $lineaSdk) {
    throw "No se encontró 'sdk.dir=' en android\\local.properties. Configura el Android SDK en Android Studio y vuelve a ejecutar."
  }

  $sdkRaw = ($lineaSdk -replace '^sdk\.dir=', '').Trim()
  if (-not $sdkRaw) {
    throw "sdk.dir está vacío en android\\local.properties. Configura el Android SDK en Android Studio y vuelve a ejecutar."
  }

  $sdkPath = $sdkRaw -replace '\\\\', '\' -replace '\\:', ':'
  if (-not (Test-Path $sdkPath)) {
    throw "No se encontró el Android SDK en: $sdkPath. En Android Studio: Settings > Android SDK, instala el SDK y copia esa ruta a android\\local.properties (sdk.dir=...)."
  }

  $variablesGradlePath = Join-Path $repoRoot "android\variables.gradle"
  $compileSdk = $null
  if (Test-Path $variablesGradlePath) {
    $contenido = Get-Content -Path $variablesGradlePath -ErrorAction SilentlyContinue
    $lineaCompile = $contenido | Where-Object { $_ -match 'compileSdkVersion\s*=\s*\d+' } | Select-Object -First 1
    if ($lineaCompile -and ($lineaCompile -match 'compileSdkVersion\s*=\s*(\d+)')) {
      $compileSdk = [int]$Matches[1]
    }
  }

  if ($compileSdk) {
    $platformPath = Join-Path $sdkPath ("platforms\android-{0}" -f $compileSdk)
    if (-not (Test-Path $platformPath)) {
      throw "Falta el paquete del SDK: platforms;android-$compileSdk (no existe '$platformPath'). Instálalo en Android Studio > Settings > Android SDK."
    }

    if ($compileSdk -ge 35) {
      $buildToolsPath = Join-Path $sdkPath "build-tools\35.0.0"
      if (-not (Test-Path $buildToolsPath)) {
        throw "Falta el paquete del SDK: build-tools;35.0.0 (no existe '$buildToolsPath'). Instálalo en Android Studio > Settings > Android SDK > SDK Tools."
      }
    }
  }
}

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

  if ($contenido -match "SUPABASE_URL\s*:\s*['""]([^'""]*)['""]") {
    $map["VITE_SUPABASE_URL"] = $Matches[1]
  }

  if ($contenido -match "SUPABASE_ANON_KEY\s*:\s*['""]([^'""]*)['""]") {
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
    throw "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Define estas variables en el entorno o en .env antes de generar el APK release."
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

function Remove-DirSafe([string]$path) {
  if (-not (Test-Path $path)) {
    return
  }

  try {
    Remove-Item -Recurse -Force -Path $path -ErrorAction Stop
  }
  catch {
    Write-Warning "No se pudo limpiar '$path': $($_.Exception.Message)"
  }
}

function Sync-CapacitorAndroid([string]$repoRoot) {
  npx cap sync android
  if ($LASTEXITCODE -eq 0) {
    return
  }

  Write-Warning "cap sync falló. Intentando recuperación de carpetas bloqueadas y reintento..."
  Remove-DirSafe (Join-Path $repoRoot "android\capacitor-cordova-android-plugins\build\intermediates")
  Remove-DirSafe (Join-Path $repoRoot "android\app\build\intermediates")

  npx cap sync android
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo en 'npx cap sync android' tras reintento (exit code $LASTEXITCODE)."
  }
}

function Build-GradleRelease([string]$androidRoot, [bool]$forceClean) {
  $gradleArgs = @('assembleRelease', '--quiet')
  if ($forceClean) {
    $gradleArgs = @('clean', 'assembleRelease', '--quiet')
  }

  .\gradlew.bat @gradleArgs
  if ($LASTEXITCODE -eq 0) {
    return
  }

  Write-Warning "Gradle assembleRelease falló. Intentando desbloqueo de artefactos y reintento..."
  .\gradlew.bat --stop | Out-Null

  Remove-DirSafe (Join-Path $androidRoot "app\build\intermediates\incremental\packageRelease\tmp")
  Remove-DirSafe (Join-Path $androidRoot "app\build\intermediates")
  Remove-DirSafe (Join-Path $androidRoot "build")
  Remove-DirSafe (Join-Path $androidRoot "capacitor-cordova-android-plugins\build\intermediates")

  .\gradlew.bat @gradleArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo en Gradle assembleRelease tras reintento (exit code $LASTEXITCODE). Cierra Android Studio/Explorer sobre carpeta android y pausa OneDrive temporalmente."
  }
}

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path | Out-Null
  }
}

function Publish-ReleaseArtifact([string]$repoRoot, [string]$artifactPath) {
  $releaseRoot = Join-Path $repoRoot "release"
  $stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
  $releaseFolder = Join-Path $releaseRoot $stamp

  Ensure-Dir $releaseRoot
  Ensure-Dir $releaseFolder

  $artifactName = Split-Path $artifactPath -Leaf
  $destPath = Join-Path $releaseFolder $artifactName
  Copy-Item -Path $artifactPath -Destination $destPath -Force

  return $destPath
}

Push-Location $repoRoot
try {
  Ensure-JavaDisponible
  Ensure-AndroidSdkDisponible $repoRoot
  Write-Host "[1/3] Build web (Vite)..."
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo en 'npm run build' (exit code $LASTEXITCODE)."
  }

  Write-RuntimeAppConfig $repoRoot

  Write-Host "[2/3] Sync Capacitor Android..."
  Sync-CapacitorAndroid $repoRoot

  if ($Clean) {
    Write-Host "[3/3] Build APK release (clean)..."
  }
  else {
    Write-Host "[3/3] Build APK release..."
  }
  Remove-DirSafe (Join-Path $repoRoot "node_modules\@capacitor\android\capacitor\build")
  $apkPath = Join-Path $repoRoot "android\app\build\outputs\apk\release\app-release.apk"
  $apkPrevio = if (Test-Path $apkPath) { Get-Item $apkPath } else { $null }

  Push-Location (Join-Path $repoRoot "android")
  try {
    Build-GradleRelease (Join-Path $repoRoot "android") $Clean.IsPresent
  }
  finally {
    Pop-Location
  }

  if (-not (Test-Path $apkPath)) {
    throw "No se encontró el APK release en: $apkPath"
  }

  $apkActual = Get-Item $apkPath
  if ($Clean) {
    Write-Host "Compilacion limpia completada."
  }
  elseif ($apkPrevio -and $apkActual.LastWriteTime -le $apkPrevio.LastWriteTime) {
    Write-Warning "Gradle terminó sin generar un APK nuevo (UP-TO-DATE). Se reutiliza el APK existente."
  }

  Write-Host "APK generado correctamente:"
  $apkActual | Select-Object FullName, Length, LastWriteTime | Format-List

  $releaseArtifactPath = Publish-ReleaseArtifact $repoRoot $apkPath
  Write-Host "Publicacion en release completada:"
  Get-Item $releaseArtifactPath | Select-Object FullName, Length, LastWriteTime | Format-List
}
finally {
  Pop-Location
}
