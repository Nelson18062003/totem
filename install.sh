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

echo "[1/6] Paquets système…"
apt-get update -qq
apt-get install -y -qq python3 python3-serial > /dev/null

echo "[2/6] Copie du programme vers /opt/totem…"
mkdir -p /opt/totem /var/lib/totem
cp -r "$ICI/robot" /opt/totem/

echo "[3/6] Configuration…"
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

echo "[4/6] Service systemd (démarrage automatique + relance en cas de plantage)…"
cp "$ICI/systemd/totem.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable totem.service > /dev/null

echo "[5/6] Tailscale (accès à distance sécurisé) — optionnel…"
if ! command -v tailscale > /dev/null; then
  read -rp "  Installer Tailscale maintenant ? [O/n] " REP
  if [ "${REP:-O}" != "n" ]; then
    curl -fsSL https://tailscale.com/install.sh | sh
    echo "  → Ouvre le lien qui va s'afficher pour autoriser ce Pi :"
    tailscale up
  fi
fi

echo "[6/6] Démarrage du robot…"
systemctl restart totem.service
sleep 3
systemctl --no-pager -l status totem.service | head -8 || true

echo
echo "=== Terminé ! Le robot doit vous avoir écrit sur Telegram. ==="
echo "Journal en direct : sudo journalctl -u totem -f"
