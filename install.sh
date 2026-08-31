#!/usr/bin/env bash
# Installation du TOTEM sur Raspberry Pi OS (Lite).
# Usage : sudo bash install.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancez avec sudo : sudo bash install.sh" >&2
  exit 1
fi

ICI="$(cd "$(dirname "$0")" && pwd)"
echo "=== TOTEM — installation ==="

echo "[1/8] Paquets système…"
apt-get update -qq
apt-get install -y -qq python3 python3-serial > /dev/null

echo "[2/8] Copie du programme vers /opt/totem…"
mkdir -p /opt/totem /var/lib/totem
# Le service tourne en root, mais on veut aussi pouvoir lancer le robot à la
# main depuis son compte (diagnostics, mode simulation) sans se heurter aux
# droits du journal.
[ -n "${SUDO_USER:-}" ] && chown -R "$SUDO_USER" /var/lib/totem 2>/dev/null || true
# ET ON REFERME AUX AUTRES. « mkdir » suit le umask du système, qui vaut 022
# sur un Raspberry Pi : le dossier naissait donc lisible par tous, et le
# journal SQLite avec lui — montants, tiers, numéros de téléphone, soldes.
# Un Pi n'est pas une machine à un seul utilisateur : il a un compte « pi »,
# souvent un accès SSH partagé pour la maintenance. Le propriétaire du
# dossier ne change pas ; seuls les AUTRES sont mis dehors.
chmod 700 /var/lib/totem
rm -rf /opt/totem/totem /opt/totem/brand   # sinon d'anciens fichiers survivent
cp -r "$ICI/totem" /opt/totem/   # /opt/totem/totem : « python3 -m totem » le trouve
# La charte : le symbole des reçus PDF y est décrit une seule fois, et TOTEM
# ne le redessine pas de son côté. Sans ce dossier, pas de logo sur les reçus.
cp -r "$ICI/brand" /opt/totem/
find /opt/totem -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
# Trace de la version installée : le robot l'affiche au démarrage et dans
# /diagnostic. Sans elle, impossible de savoir si le Pi a bien la correction.
(cd "$ICI" && git log -1 --format="%h %cd" --date=short 2>/dev/null) \
  > /opt/totem/VERSION || echo "inconnue" > /opt/totem/VERSION
echo "  Version installée : $(cat /opt/totem/VERSION)"

echo "[3/8] Configuration…"
CONF=/boot/firmware/totem.conf
[ -f /boot/totem.conf ] && CONF=/boot/totem.conf
if [ ! -f "$CONF" ] || grep -q COLLEZ_ICI "$CONF"; then
  if ! cp "$ICI/config.example.conf" "$CONF" 2>/dev/null; then
    CONF=/etc/totem.conf
    cp "$ICI/config.example.conf" "$CONF"
  fi
  # ON REFERME AVANT D'ÉCRIRE DEDANS. « cp » a copié l'exemple avec le umask
  # du système (0644 sur un Pi) ; si l'on posait les secrets d'abord, ils
  # existeraient en clair et lisibles par tous, ne serait-ce qu'un instant.
  # L'ordre n'est pas décoratif.
  chmod 600 "$CONF" 2>/dev/null || true
  echo
  echo "  → Réponds aux 2 questions (colle les valeurs préparées sur Telegram) :"
  # « -s » : le jeton ne s'affiche pas. Une installation se fait souvent en
  # partage d'écran, ou devant quelqu'un qui aide — et un jeton de robot
  # Telegram permet de PARLER à la place du robot, donc de piloter la SIM.
  read -rsp "  Clé du bot (@BotFather) : " JETON
  echo
  read -rp "  Votre ID Telegram (@userinfobot) : " CHATID
  sed -i "s|COLLEZ_ICI_LA_CLE_BOTFATHER|$JETON|" "$CONF"
  sed -i "s|COLLEZ_ICI_VOTRE_ID|$CHATID|" "$CONF"
fi
# Sur une installation DÉJÀ faite, le fichier peut dater d'avant cette
# consigne : on le referme aussi, à chaque passage.
chmod 600 "$CONF" 2>/dev/null || true
echo "  Config : $CONF"

# LA PARTITION DE DÉMARRAGE N'A PAS DE DROITS. Elle est en FAT, pour qu'on
# puisse corriger la configuration depuis un PC Windows en sortant la carte —
# c'est un choix, et il est utile. Mais « chmod » n'y fait rien, et le
# fichier reste lisible par tout compte de la machine. On le DIT, avec le
# geste pour y remédier : un risque qu'on a choisi n'est pas un risque qu'on
# ignore.
case "$CONF" in
  /boot/*)
    echo
    echo "  ⚠ $CONF est sur la partition de démarrage (FAT)."
    echo "    Elle n'a pas de droits Unix : le jeton du robot et la clé de la"
    echo "    base y sont lisibles par tout compte de ce Pi. C'est le prix de"
    echo "    pouvoir corriger la config depuis un PC Windows."
    echo "    Pour la refermer vraiment, quand un terminal suffit :"
    echo "      sudo mv $CONF /etc/totem.conf && sudo chmod 600 /etc/totem.conf"
    ;;
esac

echo "[4/8] Service systemd (démarrage automatique + relance en cas de plantage)…"
cp "$ICI/systemd/totem.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable totem.service > /dev/null

echo "[5/8] Chien de garde matériel (le Pi se relance seul s'il se fige)…"
# Dernier filet de sécurité : si le système entier se bloque, la puce
# watchdog du Raspberry Pi coupe et rallume la machine toute seule.
if ! grep -q "^RuntimeWatchdogSec" /etc/systemd/system.conf; then
  printf '\nRuntimeWatchdogSec=15\nRebootWatchdogSec=2min\n' >> /etc/systemd/system.conf
  echo "  activé (effectif au prochain redémarrage)"
else
  echo "  déjà configuré"
fi

echo "[6/8] Limite du journal système (la carte mémoire ne doit pas se remplir)…"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/totem.conf <<'EOF'
[Journal]
SystemMaxUse=64M
MaxRetentionSec=1month
EOF
systemctl restart systemd-journald || true

echo "[7/8] Tailscale (accès à distance sécurisé) — optionnel…"
if ! command -v tailscale > /dev/null; then
  read -rp "  Installer Tailscale maintenant ? [O/n] " REP
  if [ "${REP:-O}" != "n" ]; then
    curl -fsSL https://tailscale.com/install.sh | sh
    echo "  → Ouvre le lien qui va s'afficher pour autoriser ce Pi :"
    tailscale up
  fi
fi

echo "[8/8] Démarrage du robot…"
systemctl restart totem.service
sleep 3
systemctl --no-pager -l status totem.service | head -8 || true

echo
echo "=== Terminé ! Le robot doit vous avoir écrit sur Telegram. ==="
echo "Journal en direct : sudo journalctl -u totem -f"
echo "État             : sudo systemctl status totem"
