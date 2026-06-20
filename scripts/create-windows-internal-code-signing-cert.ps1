param(
  [string]$Subject = "CN=COTEPA Internal Code Signing",
  [string]$OutputDir = "C:\secure\cotepa-code-signing",
  [int]$ValidityYears = 2,
  [switch]$SkipPfxExport
)

$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
}

Ensure-Dir $OutputDir

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $Subject `
  -KeyAlgorithm RSA `
  -KeyLength 3072 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -KeyUsage DigitalSignature `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears($ValidityYears)

if (-not $cert) {
  throw "No se pudo crear el certificado de firma interna."
}

$safeName = ($Subject -replace '^CN=', '') -replace '[^a-zA-Z0-9\-_ ]', '' -replace '\s+', '-'
$cerPath = Join-Path $OutputDir "$safeName.cer"
$pfxPath = Join-Path $OutputDir "$safeName.pfx"

Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null

if (-not $SkipPfxExport) {
  $password1 = Read-Host "Introduce la contrasena del PFX" -AsSecureString
  $password2 = Read-Host "Repite la contrasena del PFX" -AsSecureString

  $bstr1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password1)
  $bstr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password2)
  try {
    $plain1 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr1)
    $plain2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr2)
  }
  finally {
    if ($bstr1 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr1) }
    if ($bstr2 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr2) }
  }

  if ($plain1 -ne $plain2) {
    throw "Las contrasenas del PFX no coinciden."
  }

  Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $password1 -Force | Out-Null
}

Write-Host "Certificado interno generado correctamente:" -ForegroundColor Green
Get-Item $cerPath | Select-Object FullName, Length, LastWriteTime | Format-List

if (-not $SkipPfxExport) {
  Write-Host "PFX exportado correctamente:" -ForegroundColor Green
  Get-Item $pfxPath | Select-Object FullName, Length, LastWriteTime | Format-List
}

Write-Host "Thumbprint: $($cert.Thumbprint)"
Write-Host "Store: Cert:\CurrentUser\My"
Write-Host "Siguiente paso: importar el .cer en Trusted Root y Trusted Publishers en los PCs de Cotepa."
