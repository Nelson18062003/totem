<#
.SYNOPSIS
    Allume le partage de connexion du PC et attend que le TOTEM s'y raccroche.

.DESCRIPTION
    Pendant la phase de test, le Raspberry Pi n'a pas de box à lui : il se
    connecte au partage Wi-Fi du PC Windows, qui lui sert à la fois de réseau
    et d'accès à Internet.

    Ce script fait les quatre gestes, dans l'ordre :

      1. il vérifie que le PC a bien une connexion à partager ;
      2. il pose le nom et le mot de passe du réseau — les mêmes que ceux
         inscrits dans la carte SD du Pi, sans quoi le Pi ne le reconnaîtra
         jamais ;
      3. il allume le partage ;
      4. il attend que le Pi apparaisse, et affiche son adresse.

    À LANCER D'UN SEUL COUP, jamais ligne par ligne. Collé morceau par
    morceau, PowerShell exécute le « if » dès qu'il est complet et refuse
    ensuite le « else » — le partage n'est alors jamais allumé, et rien ne le
    dit. C'est précisément pour éviter ça que ce fichier existe.

.PARAMETER Nom
    Le nom du réseau (SSID). Doit être IDENTIQUE à celui inscrit dans la carte
    SD du Pi au moment du flashage.

.PARAMETER Cle
    Le mot de passe du réseau. Huit caractères au minimum : Windows l'exige.

.PARAMETER Utilisateur
    Le nom du compte sur le Pi, pour la ligne de connexion affichée à la fin.

.PARAMETER Attente
    Combien de secondes guetter l'arrivée du Pi. 0 pour ne pas attendre.

.PARAMETER Arreter
    Éteint le partage au lieu de l'allumer.

.EXAMPLE
    .\outils\partage-wifi.ps1
    Allume le réseau « totempc » et attend le Pi jusqu'à trois minutes.

.EXAMPLE
    .\outils\partage-wifi.ps1 -Nom maison -Cle motdepasse123
    Utilise un autre nom de réseau.

.EXAMPLE
    .\outils\partage-wifi.ps1 -Arreter
    Éteint le partage.

.NOTES
    À lancer dans « Windows PowerShell » EN ADMINISTRATEUR — pas dans
    PowerShell 7, qui n'atteint pas les fonctions Windows employées ici.

    Si Windows refuse d'exécuter le fichier, autorisez-le pour cette fenêtre
    seulement :
        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#>

[CmdletBinding()]
param(
    [string]$Nom = 'totempc',
    [string]$Cle = 'totem12345',
    [string]$Utilisateur = 'totem',
    [int]$Attente = 180,
    [switch]$Arreter
)

$ErrorActionPreference = 'Stop'

function Dire($texte, $couleur = 'Gray') {
    Write-Host $texte -ForegroundColor $couleur
}

# --- Les refus francs, avant toute chose ------------------------------------
# Mieux vaut une phrase claire tout de suite qu'un message de Windows au
# milieu du travail.

if ($PSVersionTable.PSEdition -eq 'Core') {
    throw 'Ce script demande « Windows PowerShell » (le bleu), pas PowerShell 7.'
}

$moi = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $moi.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw ("Allumer le partage demande les droits administrateur. Fermez cette " +
           "fenêtre, cherchez « Windows PowerShell » dans le menu Démarrer, " +
           "clic droit → « Exécuter en tant qu'administrateur », et relancez.")
}

if ($Cle.Length -lt 8) {
    throw 'Le mot de passe du réseau doit faire au moins 8 caractères : Windows l''exige.'
}

# --- Atteindre les fonctions Windows ----------------------------------------
# Elles ne s'appellent pas comme des commandes ordinaires : il faut convertir
# leurs opérations asynchrones en quelque chose que PowerShell sache attendre.

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$conversion = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and
        $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

if ($null -eq $conversion) {
    throw ("Windows n'expose pas la conversion attendue (AsTask). Vérifiez que " +
           "vous êtes bien dans « Windows PowerShell » et non PowerShell 7.")
}

function Attendre-Windows($Operation, $Type) {
    # Exécute une opération Windows asynchrone et rend son résultat.
    #
    # Les noms des paramètres comptent : PowerShell ne distingue pas les
    # majuscules des minuscules, et un paramètre nommé $c aurait masqué
    # $conversion à l'intérieur de la fonction — l'erreur aurait alors parlé
    # d'un type qui « ne contient pas MakeGenericMethod », loin de sa cause.
    #
    # Rien d'autre ne doit sortir d'ici : tout ce qu'une fonction PowerShell
    # écrit part dans sa valeur de retour.
    $tache = $conversion.MakeGenericMethod($Type).Invoke($null, @($Operation))
    $tache.Wait(-1) | Out-Null
    return $tache.Result
}

$Resultat = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]
$Allume = [Windows.Networking.NetworkOperators.TetheringOperationalState, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]::On
$Succes = [Windows.Networking.NetworkOperators.TetheringOperationStatus, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]::Success
$Ipv4 = [Windows.Networking.HostNameType, Windows.Networking, ContentType = WindowsRuntime]::Ipv4

# --- La connexion que le PC va partager -------------------------------------
$connexion = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]::GetInternetConnectionProfile()
if ($null -eq $connexion) {
    throw ("Ce PC n'a aucune connexion à partager. Reliez-le à Internet " +
           "(Wi-Fi de la box, ou câble Ethernet), puis relancez.")
}

$partage = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]::CreateFromConnectionProfile($connexion)

# --- Laisser Windows finir ce qu'il avait commencé ---------------------------
# « InTransition » : le partage est en train de s'allumer ou de s'éteindre.
# C'est l'état où l'on retombe après une tentative interrompue en cours de
# route. Lui donner un ordre maintenant, c'est se le faire refuser sans
# explication ; on attend qu'il se pose.

if ("$($partage.TetheringOperationalState)" -eq 'InTransition') {
    Dire 'Windows termine une opération en cours…' Yellow
    $patience = (Get-Date).AddSeconds(30)
    while ("$($partage.TetheringOperationalState)" -eq 'InTransition' -and
           (Get-Date) -lt $patience) {
        Start-Sleep -Seconds 2
    }
}

# --- Extinction sur demande -------------------------------------------------
if ($Arreter) {
    if ($partage.TetheringOperationalState -ne $Allume) {
        Dire 'Le partage était déjà éteint.' Yellow
        return
    }
    $issue = Attendre-Windows ($partage.StopTetheringAsync()) $Resultat
    if ($issue.Status -ne $Succes) {
        throw "Extinction refusée : $($issue.Status) $($issue.AdditionalErrorMessage)"
    }
    Dire 'Partage de connexion éteint.' Green
    return
}

# --- Le nom et le mot de passe ----------------------------------------------
# C'est le point qui fait perdre le plus de temps. Si ce nom n'est pas celui
# inscrit dans la carte SD du Pi, le Pi cherchera un réseau qui n'existe pas
# et restera invisible — sans le moindre message d'erreur, nulle part.

$reglage = $partage.GetCurrentAccessPointConfiguration()
if ($reglage.Ssid -ne $Nom -or $reglage.Passphrase -ne $Cle) {
    if ($partage.TetheringOperationalState -eq $Allume) {
        # Windows refuse de renommer un réseau allumé.
        Attendre-Windows ($partage.StopTetheringAsync()) $Resultat | Out-Null
    }
    $reglage.Ssid = $Nom
    $reglage.Passphrase = $Cle
    $issue = Attendre-Windows ($partage.ConfigureAccessPointAsync($reglage)) $Resultat
    if ($issue.Status -ne $Succes) {
        throw "Réglage refusé : $($issue.Status) $($issue.AdditionalErrorMessage)"
    }
    Dire "Réseau renommé « $Nom »." Green
}

# --- Allumage ---------------------------------------------------------------
if ($partage.TetheringOperationalState -eq $Allume) {
    Dire 'Le partage de connexion était déjà allumé.' Yellow
}
else {
    $issue = Attendre-Windows ($partage.StartTetheringAsync()) $Resultat
    if ($issue.Status -ne $Succes) {
        throw "Allumage refusé : $($issue.Status) $($issue.AdditionalErrorMessage)"
    }
    Dire 'Partage de connexion allumé.' Green
}

Write-Host ''
Dire "  Réseau       : $Nom"
Dire "  Mot de passe : $Cle"
Write-Host ''

if ($Attente -le 0) {
    return
}

# --- L'attente du TOTEM -----------------------------------------------------
# Le Pi ne cherche son réseau qu'au démarrage, une seule fois. S'il a démarré
# avant que le partage soit allumé, il ne le verra jamais, même une heure
# après : il faut le rebrancher maintenant.

Dire 'Branchez le TOTEM maintenant — ou débranchez-le et rebranchez-le.' Cyan
Dire "Le Pi ne cherche son réseau qu'au démarrage : allumé après le partage," Cyan
Dire "il le trouve ; allumé avant, il ne le verra pas." Cyan
Write-Host ''
Write-Host 'Recherche du TOTEM' -NoNewline

$limite = (Get-Date).AddSeconds($Attente)
$vus = @()
while ((Get-Date) -lt $limite) {
    $vus = @($partage.GetTetheringClients())
    if ($vus.Count -gt 0) { break }
    Write-Host '.' -NoNewline
    Start-Sleep -Seconds 3
}
Write-Host ''
Write-Host ''

if ($vus.Count -eq 0) {
    Dire "Personne ne s'est connecté en $Attente secondes." Red
    Write-Host ''
    Dire 'Trois causes, de la plus fréquente à la plus rare :' Yellow
    Dire "  1. La carte SD du Pi porte un AUTRE nom de réseau que « $Nom »."
    Dire "     C'est le cas si vous avez inscrit le Wi-Fi de votre box en"
    Dire "     flashant. Reflashez la carte avec « $Nom », ou reliez le Pi à"
    Dire "     la box par un câble Ethernet."
    Dire '  2. Le Pi ne démarre pas : il faut une lumière rouge fixe ET une'
    Dire "     verte qui clignote. Rien du tout ? L'alimentation doit fournir"
    Dire '     3 A — un chargeur de téléphone ne tient pas le HAT modem.'
    Dire '  3. Le Pi a démarré avant le partage. Débranchez-le, rebranchez-le,'
    Dire '     et relancez ce script.'
    return
}

Dire 'TOTEM trouvé.' Green
Write-Host ''
foreach ($appareil in $vus) {
    foreach ($adresse in $appareil.HostNames) {
        if ($adresse.Type -ne $Ipv4) { continue }
        Dire "  Adresse : $($adresse.CanonicalName)" Green
        Write-Host ''
        Dire '  Pour vous y connecter :'
        Dire "      ssh $Utilisateur@$($adresse.CanonicalName)" White
        Write-Host ''
        Dire '  Une fois dedans, TOTEM tourne déjà tout seul :'
        Dire '      sudo systemctl status totem' White
        Dire '      sudo journalctl -u totem -f' White
    }
}
