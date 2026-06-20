param(
  [Parameter(Mandatory = $true)]
  [string]$CertificatePath,
  [ValidateSet("CurrentUser", "LocalMachine")]
  [string]$Scope = "CurrentUser"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CertificatePath)) {
  throw "No se encontro el certificado publico: $CertificatePath"
}

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertificatePath)
if (-not $cert.Thumbprint) {
  throw "El archivo indicado no parece un certificado valido."
}

if ($Scope -eq "LocalMachine") {
  $rootStore = "Cert:\LocalMachine\Root"
  $publisherStore = "Cert:\LocalMachine\TrustedPublisher"
} else {
  $rootStore = "Cert:\CurrentUser\Root"
  $publisherStore = "Cert:\CurrentUser\TrustedPublisher"
}

Import-Certificate -FilePath $CertificatePath -CertStoreLocation $rootStore | Out-Null
Import-Certificate -FilePath $CertificatePath -CertStoreLocation $publisherStore | Out-Null

Write-Host "Certificado importado correctamente para confianza interna." -ForegroundColor Green
Write-Host "Thumbprint: $($cert.Thumbprint)"
Write-Host "Root store: $rootStore"
Write-Host "TrustedPublisher store: $publisherStore"
Write-Host "Recomendacion: distribuir este .cer por GPO, Intune o script de inicio en los equipos de Cotepa."
