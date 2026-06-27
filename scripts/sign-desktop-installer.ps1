param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [string]$PfxPath = "C:\secure\cotepa-code-signing\COTEPA-Internal-Code-Signing.pfx",
  [string]$TimestampUrl = "",
  [string]$Description = "SAT Movil COTEPA",
  [string]$DescriptionUrl = "",
  [string]$PfxPassword = ""
)

$ErrorActionPreference = "Stop"

function Find-SignTool {
  $candidates = @(
    "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe"
  )

  $versioned = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "x64\signtool.exe" }

  foreach ($path in ($candidates + $versioned)) {
    if ($path -and (Test-Path $path)) {
      return $path
    }
  }

  return $null
}

if (-not (Test-Path $InstallerPath)) {
  throw "No se encontro el instalador: $InstallerPath"
}

if (-not (Test-Path $PfxPath)) {
  throw "No se encontro el PFX de firma interna: $PfxPath"
}

$signtool = Find-SignTool
if (-not $signtool) {
  throw "No se encontro signtool.exe. Instala el Windows SDK o el App Certification Kit para poder firmar el setup.exe."
}

$plainPassword = $PfxPassword
if ([string]::IsNullOrWhiteSpace($plainPassword)) {
  $plainPassword = [Environment]::GetEnvironmentVariable('CODE_SIGNING_PFX_PASSWORD')
}

if ([string]::IsNullOrWhiteSpace($plainPassword)) {
  $password = Read-Host "Introduce la contrasena del PFX" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
  try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }
}

$arguments = @(
  "sign",
  "/fd", "SHA256",
  "/f", $PfxPath,
  "/p", $plainPassword,
  "/d", $Description
)

if ($DescriptionUrl) {
  $arguments += @("/du", $DescriptionUrl)
}

if ($TimestampUrl) {
  $arguments += @("/tr", $TimestampUrl, "/td", "SHA256")
}

$arguments += $InstallerPath

& $signtool @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Signtool devolvio exit code $LASTEXITCODE al firmar el instalador."
}

& $signtool verify /pa /v $InstallerPath
if ($LASTEXITCODE -ne 0) {
  throw "La verificacion de la firma fallo con exit code $LASTEXITCODE."
}

Write-Host "Instalador firmado correctamente:" -ForegroundColor Green
Get-Item $InstallerPath | Select-Object FullName, Length, LastWriteTime | Format-List
