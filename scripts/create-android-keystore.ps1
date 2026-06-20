param(
  [string]$KeystorePath = "C:\secure\sat-release.keystore",
  [string]$Alias = "sat-key",
  [string]$CommonName = "COTEPA S.L.",
  [string]$OrgUnit = "SAT",
  [string]$Organization = "COTEPA S.L.",
  [string]$City = "Paiporta",
  [string]$State = "Valencia",
  [string]$Country = "ES",
  [int]$ValidityDays = 3650
)

$ErrorActionPreference = "Stop"

function Resolve-KeytoolPath {
  if ($env:JAVA_HOME) {
    $javaHomeKeytool = Join-Path $env:JAVA_HOME "bin\keytool.exe"
    if (Test-Path $javaHomeKeytool) {
      return $javaHomeKeytool
    }
  }

  $candidates = @(
    "C:\Program Files\Java\jdk-21.0.10\bin\keytool.exe",
    "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  $cmd = Get-Command keytool.exe -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  throw "No se encontró keytool.exe. Configura JAVA_HOME o instala un JDK."
}

function ConvertTo-PlainText([Security.SecureString]$secure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    if ($ptr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
  }
}

if (Test-Path $KeystorePath) {
  throw "Ya existe un keystore en '$KeystorePath'. Elimínalo o usa otra ruta."
}

$keytoolPath = Resolve-KeytoolPath
$keystoreDir = Split-Path -Parent $KeystorePath
if ($keystoreDir -and -not (Test-Path $keystoreDir)) {
  New-Item -ItemType Directory -Path $keystoreDir -Force | Out-Null
}

Write-Host "Keytool detectado en: $keytoolPath"
Write-Host "Se generará el keystore en: $KeystorePath"
Write-Host "Alias: $Alias"

$storePasswordSecure = Read-Host "Introduce la contraseña del keystore" -MaskInput
$storePasswordConfirmSecure = Read-Host "Repite la contraseña del keystore" -MaskInput
$storePassword = ConvertTo-PlainText $storePasswordSecure
$storePasswordConfirm = ConvertTo-PlainText $storePasswordConfirmSecure

if ($storePassword -ne $storePasswordConfirm) {
  throw "Las contraseñas del keystore no coinciden."
}

$useSamePassword = Read-Host "¿Usar la misma contraseña para la clave? (S/n)"
$keyPassword = $storePassword

if ($useSamePassword -match '^(n|no)$') {
  $keyPasswordSecure = Read-Host "Introduce la contraseña de la clave" -MaskInput
  $keyPasswordConfirmSecure = Read-Host "Repite la contraseña de la clave" -MaskInput
  $keyPassword = ConvertTo-PlainText $keyPasswordSecure
  $keyPasswordConfirm = ConvertTo-PlainText $keyPasswordConfirmSecure

  if ($keyPassword -ne $keyPasswordConfirm) {
    throw "Las contraseñas de la clave no coinciden."
  }
}

$dname = "CN=$CommonName, OU=$OrgUnit, O=$Organization, L=$City, ST=$State, C=$Country"

& $keytoolPath `
  -genkeypair `
  -v `
  -keystore $KeystorePath `
  -alias $Alias `
  -keyalg RSA `
  -keysize 4096 `
  -sigalg SHA256withRSA `
  -validity $ValidityDays `
  -dname $dname `
  -storepass $storePassword `
  -keypass $keyPassword

if (-not (Test-Path $KeystorePath)) {
  throw "Keytool terminó pero no se encontró el fichero '$KeystorePath'."
}

Write-Host ""
Write-Host "Keystore generado correctamente."
Write-Host "Ruta: $KeystorePath"
Write-Host "Alias: $Alias"
Write-Host ""
Write-Host "Variables para esta sesión PowerShell:"
Write-Host ('$env:KEYSTORE_FILE="{0}"' -f $KeystorePath)
Write-Host ('$env:KEY_ALIAS="{0}"' -f $Alias)
Write-Host '$env:KEYSTORE_PASSWORD="<tu_password>"'
Write-Host '$env:KEY_PASSWORD="<tu_password>"'
