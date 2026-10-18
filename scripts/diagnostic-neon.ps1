# Diagnostic de connexion à la base Neon depuis le réseau courant.
# N'affiche que l'adresse du serveur et les résultats : jamais l'identifiant ni le mot de passe.
# Usage (depuis le dossier miahy_back) :
#   powershell -ExecutionPolicy Bypass -File scripts\diagnostic-neon.ps1

$fichierEnv = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $fichierEnv)) { Write-Host "Fichier .env introuvable dans miahy_back." -ForegroundColor Red; exit 1 }

$ligne = (Get-Content $fichierEnv | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1)
$hote = ([regex]::Match("$ligne", '@([^/:?"'']+)')).Groups[1].Value
if (-not $hote) { Write-Host "DATABASE_URL introuvable ou illisible dans .env." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Serveur Neon : $hote" -ForegroundColor Cyan

# 1. Le réseau trouve-t-il l'adresse (DNS) ?
$dns = Resolve-DnsName $hote -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress } | Select-Object -First 1
$dnsOk = [bool]$dns
if (-not $dnsOk) {
  # Essai avec un DNS public : si ça marche, c'est le DNS du réseau qui bloque.
  $dnsPublic = Resolve-DnsName $hote -Server 1.1.1.1 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress } | Select-Object -First 1
}

# 2. Les portes réseau sont-elles ouvertes ?
$port5432 = (Test-NetConnection $hote -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded
$port443 = (Test-NetConnection $hote -Port 443 -WarningAction SilentlyContinue).TcpTestSucceeded

Write-Host ("DNS (adresse trouvée)       : " + $(if ($dnsOk) { "OUI" } else { "NON" }))
Write-Host ("Port 5432 (PostgreSQL)      : " + $(if ($port5432) { "OUVERT" } else { "FERMÉ" }))
Write-Host ("Port 443  (web)             : " + $(if ($port443) { "OUVERT" } else { "FERMÉ" }))
Write-Host ""

if (-not $dnsOk -and $dnsPublic) {
  Write-Host "Conclusion : le DNS de ce réseau ne trouve pas Neon (un DNS public le trouve). Changer le DNS de la carte réseau (1.1.1.1) ou utiliser un autre réseau." -ForegroundColor Yellow
} elseif (-not $dnsOk) {
  Write-Host "Conclusion : adresse introuvable même avec un DNS public. Vérifier l'accès Internet de ce réseau." -ForegroundColor Yellow
} elseif (-not $port5432 -and $port443) {
  Write-Host "Conclusion : ce réseau bloque le port 5432. Solution : pilote Neon par le port 443 (WebSocket)." -ForegroundColor Yellow
} elseif ($port5432 -and $port443) {
  Write-Host "Conclusion : le réseau laisse passer. Si l'application échoue quand même, vérifier dans Neon : Settings > Network security (liste d'IP autorisées)." -ForegroundColor Yellow
} else {
  Write-Host "Conclusion : aucune sortie possible depuis ce réseau. Essayer le partage de connexion du téléphone." -ForegroundColor Yellow
}
