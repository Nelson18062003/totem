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
  echo
  echo "  → Réponds aux 2 questions (colle les valeurs préparées sur Telegram) :"
  read -rp "  Clé du bot (@BotFather) : " JETON
  read -rp "  Votre ID Telegram (@userinfobot) : " CHATID
  sed -i "s|COLLEZ_ICI_LA_CLE_BOTFATHER|$JETON|" "$CONF"
  sed -i "s|COLLEZ_ICI_VOTRE_ID|$CHATID|" "$CONF"
fi
echo "  Config : $CONF"

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
