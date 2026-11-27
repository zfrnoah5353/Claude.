param([string]$ExeDir = "")

# ---------------------------------------------------------------------------
#  Installation "PC accessible à distance"
#   1. Mot de passe d'accès
#   2. Installation de RustDesk (voir + contrôler l'écran) en service Windows
#   3. Récupération des adresses (IP locale, IP publique, box)
#   4. Configuration du Wake-on-LAN (allumage à distance)
#   5. Enregistrement des infos + allumage.cfg pour Telecommande.exe
# ---------------------------------------------------------------------------

$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$RustDeskFallback = 'https://github.com/rustdesk/rustdesk/releases/download/1.4.4/rustdesk-1.4.4-x86_64.exe'

function Titre($t)     { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Ok($t)        { Write-Host "  [OK] $t" -ForegroundColor Green }
function Info($t)      { Write-Host "  $t" }
function Attention($t) { Write-Host "  [!] $t" -ForegroundColor Yellow }
function Erreur($t)    { Write-Host "  [ERREUR] $t" -ForegroundColor Red }

Write-Host ""
Write-Host "  ==============================================" -ForegroundColor Cyan
Write-Host "     Rendre ce PC accessible et allumable" -ForegroundColor Cyan
Write-Host "     à distance" -ForegroundColor Cyan
Write-Host "  ==============================================" -ForegroundColor Cyan

# --- 1. Mot de passe -------------------------------------------------------
Titre "1/5 - Mot de passe d'accès"

function New-Password {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    $rng   = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 14
    $rng.GetBytes($bytes)
    -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

$Password = $null
while (-not $Password) {
    $saisie = Read-Host "  Choisis un mot de passe (8 caractères min, sans espace)`n  ou appuie sur Entrée pour en générer un solide"
    if ([string]::IsNullOrWhiteSpace($saisie)) {
        $Password = New-Password
        Ok "Mot de passe généré : $Password"
    } elseif ($saisie -match '^[^\s"''`]{8,}$') {
        $Password = $saisie
        Ok "Mot de passe enregistré."
    } else {
        Attention "Au moins 8 caractères, sans espace ni guillemet. Recommence."
    }
}

# --- 2. RustDesk -------------------------------------------------------------
Titre "2/5 - Installation de RustDesk (voir et contrôler l'écran)"

$RdExe = Join-Path $env:ProgramFiles 'RustDesk\rustdesk.exe'

if (Test-Path $RdExe) {
    Ok "RustDesk est déjà installé."
} else {
    $url = $null
    try {
        $rel   = Invoke-RestMethod 'https://api.github.com/repos/rustdesk/rustdesk/releases/latest' -Headers @{ 'User-Agent' = 'PC-Distance-Setup' } -TimeoutSec 20
        $asset = $rel.assets | Where-Object { $_.name -match '^rustdesk-[\d\.]+-x86_64\.exe$' } | Select-Object -First 1
        if ($asset) { $url = $asset.browser_download_url }
    } catch {}
    if (-not $url) { $url = $RustDeskFallback }

    $tmp = Join-Path $env:TEMP 'rustdesk-setup.exe'
    Info "Téléchargement : $url"
    try {
        Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    } catch {
        Erreur "Téléchargement impossible : $($_.Exception.Message)"
        Erreur "Vérifie la connexion internet puis relance."
        exit 1
    }

    Info "Installation silencieuse (jusqu'à 2 minutes)..."
    Start-Process -FilePath $tmp -ArgumentList '--silent-install'
    $t = 0
    while (-not (Test-Path $RdExe) -and $t -lt 120) { Start-Sleep -Seconds 2; $t += 2 }
    if (-not (Test-Path $RdExe)) {
        Erreur "RustDesk ne s'est pas installé. Lance $tmp à la main puis relance ce programme."
        exit 1
    }
    Start-Sleep -Seconds 15
    Ok "RustDesk installé."
}

# Service Windows : RustDesk tourne même sans session ouverte et au démarrage
$svc = Get-Service -Name 'RustDesk' -ErrorAction SilentlyContinue
if (-not $svc) {
    Info "Installation du service..."
    Start-Process -FilePath $RdExe -ArgumentList '--install-service' -Wait
    Start-Sleep -Seconds 10
    $svc = Get-Service -Name 'RustDesk' -ErrorAction SilentlyContinue
}
if ($svc) {
    Set-Service -Name 'RustDesk' -StartupType Automatic -ErrorAction SilentlyContinue
    if ($svc.Status -ne 'Running') { Start-Service -Name 'RustDesk' -ErrorAction SilentlyContinue; Start-Sleep -Seconds 5 }
    Ok "Service RustDesk actif (démarre automatiquement avec Windows)."
} else {
    Attention "Service RustDesk introuvable : l'accès marchera seulement quand une session est ouverte."
}

# Mot de passe permanent (accès sans que personne n'accepte sur le PC)
& $RdExe --password $Password | Out-Null
Start-Sleep -Seconds 2
Ok "Mot de passe permanent appliqué."

# ID RustDesk
$RdId = $null
for ($i = 0; $i -lt 15 -and -not $RdId; $i++) {
    $out = (& $RdExe --get-id | Out-String).Trim()
    if ($out -match '(\d{6,})') { $RdId = $Matches[1] } else { Start-Sleep -Seconds 3 }
}
if ($RdId) { Ok "ID de ce PC : $RdId" } else { Attention "ID pas encore disponible : ouvre RustDesk, il est affiché en haut à gauche." ; $RdId = '' }

# --- 3. Adresses -------------------------------------------------------------
Titre "3/5 - Adresses réseau"

$adapters = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue)
$main = $adapters | Where-Object { $_.Status -eq 'Up' -and $_.PhysicalMediaType -eq '802.3' } | Select-Object -First 1
$filaire = [bool]$main
if (-not $main) { $main = $adapters | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1 }
if (-not $main) { $main = $adapters | Select-Object -First 1 }

$Mac = ''; $IpLocale = ''; $Box = ''
if ($main) {
    $Mac = $main.MacAddress
    $ip = Get-NetIPAddress -InterfaceIndex $main.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ip) { $IpLocale = $ip.IPAddress }
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -InterfaceIndex $main.ifIndex -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
    if ($route) { $Box = $route.NextHop }
    Ok "Carte réseau : $($main.Name) ($($main.InterfaceDescription))"
    Ok "Adresse MAC  : $Mac"
    Ok "IP locale    : $IpLocale"
    if ($Box) { Ok "Box internet : $Box" }
} else {
    Erreur "Aucune carte réseau trouvée."
}

$IpPublique = ''
try { $IpPublique = (Invoke-RestMethod 'https://api.ipify.org' -TimeoutSec 15).ToString().Trim() } catch {}
if ($IpPublique) { Ok "IP publique  : $IpPublique" } else { Attention "IP publique introuvable." }

# --- 4. Wake-on-LAN ------------------------------------------------------------
Titre "4/5 - Allumage à distance (Wake-on-LAN)"

# Le "démarrage rapide" de Windows empêche le Wake-on-LAN depuis un PC éteint
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Power" /v HiberbootEnabled /t REG_DWORD /d 0 /f | Out-Null
Ok "Démarrage rapide Windows désactivé (nécessaire pour l'allumage à distance)."

$motsCles = '*WakeOnMagicPacket', 'S5WakeOnLan', 'WakeOnMagicPacketFromS5', 'EnablePME', '*ModernStandbyWoLMagicPacket', 'WolShutdownLinkSpeed'
foreach ($a in $adapters) {
    if ($a.PhysicalMediaType -ne '802.3') { continue }
    $props = @(Get-NetAdapterAdvancedProperty -Name $a.Name -AllProperties -ErrorAction SilentlyContinue)
    foreach ($kw in $motsCles) {
        # comparaison exacte (le "*" fait partie du nom, ce n'est pas un joker)
        $prop = $props | Where-Object { $_.RegistryKeyword -eq $kw } | Select-Object -First 1
        if ($prop) {
            $val = '1'
            if ($kw -eq 'WolShutdownLinkSpeed') { $val = '2' }   # "Not Speed Down" (Realtek)
            if ($prop.ValidRegistryValues -and ($prop.ValidRegistryValues -notcontains $val)) { continue }
            $prop | Set-NetAdapterAdvancedProperty -RegistryValue $val -NoRestart -ErrorAction SilentlyContinue
        }
    }
    Set-NetAdapterPowerManagement -Name $a.Name -WakeOnMagicPacket Enabled -NoRestart -ErrorAction SilentlyContinue
    powercfg /deviceenablewake "$($a.InterfaceDescription)" 2>$null | Out-Null
    Ok "Réveil par le réseau activé sur : $($a.Name)"
}

if (-not $filaire) {
    Attention "Ce PC n'est pas branché en câble Ethernet."
    Attention "L'allumage à distance ne marche presque jamais en Wi-Fi : branche un câble."
}

# Applique les réglages de la carte (coupure réseau de quelques secondes)
foreach ($a in $adapters) {
    if ($a.PhysicalMediaType -eq '802.3' -and $a.Status -eq 'Up') {
        Restart-NetAdapter -Name $a.Name -ErrorAction SilentlyContinue
    }
}

# --- 5. Enregistrement ---------------------------------------------------------
Titre "5/5 - Enregistrement des informations"

$cfg = @"
# Fichier pour Telecommande.exe - copie-le à côté de Telecommande.exe
nom=$env:COMPUTERNAME
mac=$Mac
adresse=$IpPublique
port=9
id=$RdId
"@

$Bureau = [Environment]::GetFolderPath('Desktop')
$cibles = @($Bureau)
if ($ExeDir -and (Test-Path $ExeDir)) { $cibles += $ExeDir }
foreach ($d in ($cibles | Select-Object -Unique)) {
    try { Set-Content -Path (Join-Path $d 'allumage.cfg') -Value $cfg -Encoding UTF8; Ok "allumage.cfg enregistré dans $d" } catch {}
}

$infoPath = Join-Path $Bureau 'PC-a-distance-INFOS.txt'
$info = @"
=====================================================
  ACCÈS À DISTANCE À CE PC ($env:COMPUTERNAME)
=====================================================

  ID RustDesk   : $RdId
  Mot de passe  : $Password

  Adresse MAC   : $Mac
  IP locale     : $IpLocale
  IP publique   : $IpPublique
  Box internet  : $Box

-----------------------------------------------------
  VOIR ET CONTRÔLER LE PC
-----------------------------------------------------
  Sur un autre PC Windows : lance Telecommande.exe
  (avec allumage.cfg à côté) puis choisis "Contrôler".
  Sur téléphone : installe l'appli "RustDesk", tape
  l'ID ci-dessus puis le mot de passe.

-----------------------------------------------------
  ALLUMER LE PC À DISTANCE - À FAIRE UNE FOIS
-----------------------------------------------------
  1) BIOS : au démarrage du PC, appuie sur Suppr ou F2.
     Active "Wake on LAN" / "Power On By PCI-E" /
     "Resume by LAN" et désactive "ErP" / "EuP".
  2) Le PC doit rester branché sur secteur ET en câble
     Ethernet. Éteins-le normalement (Démarrer > Arrêter).
  3) Depuis l'extérieur (4G, autre maison), dans ta box
     ($Box dans un navigateur) :
       - Bail DHCP statique : $IpLocale  <->  $Mac
       - Redirection de port : UDP 9 -> $IpLocale port 9
     Astuce : beaucoup de box (Freebox, Livebox, Bbox,
     SFR) ont aussi un bouton "Wake on LAN" / "Réveil"
     dans leur appli : c'est le plus fiable.
  4) Si ton IP publique change souvent, crée un nom DynDNS
     (souvent gratuit dans la box) et mets-le dans
     allumage.cfg à la ligne adresse=

  Garde ce fichier en lieu sûr : il contient le mot de passe.
"@
Set-Content -Path $infoPath -Value $info -Encoding UTF8
Ok "Infos enregistrées : $infoPath"

Write-Host ""
Write-Host "  ==============================================" -ForegroundColor Green
Write-Host "   TERMINÉ !" -ForegroundColor Green
Write-Host "   ID : $RdId    Mot de passe : $Password" -ForegroundColor Green
Write-Host "  ==============================================" -ForegroundColor Green
Write-Host ""
Info "Étape suivante : copie Telecommande.exe + allumage.cfg sur l'autre appareil."
Info "N'oublie pas le réglage BIOS (voir le fichier d'infos qui s'ouvre)."

Start-Process notepad.exe -ArgumentList "`"$infoPath`""
