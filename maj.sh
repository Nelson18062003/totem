#!/usr/bin/env bash
# Mise à jour de TOTEM après un « git pull ».
#
#   sudo bash maj.sh
#
# Pourquoi ce script existe
# -------------------------
# Le service tourne depuis /opt/totem, pas depuis le dossier où l'on fait
# « git pull ». Sans recopie, le robot continue d'exécuter l'ancienne version —
# et rien ne le signale : on croit le correctif installé alors qu'il dort dans
# un dossier que personne ne lit.
#
# install.sh faisait déjà ce travail, mais il fait aussi huit autres choses :
# installer des paquets, relancer apt-get, poser le chien de garde, proposer
# Tailscale. Tout cela n'a lieu d'être qu'une fois. Pour une mise à jour, il
# ne faut que trois gestes : récupérer, recopier, relancer.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancez avec sudo : sudo bash maj.sh" >&2
  exit 1
fi

ICI="$(cd "$(dirname "$0")" && pwd)"
AVANT="$(cat /opt/totem/VERSION 2>/dev/null || echo "aucune")"

echo "=== TOTEM — mise à jour ==="
echo "Version en service : $AVANT"

# --- 1. Récupérer -----------------------------------------------------------
# On refuse d'avancer sur un dossier modifié à la main : écraser des retouches
# faites sur le Pi en pleine nuit serait pire que ne rien faire.
if [ -n "$(git -C "$ICI" status --porcelain 2>/dev/null)" ]; then
  echo >&2
  echo "STOP : des fichiers ont été modifiés localement dans $ICI." >&2
  echo "Ils seraient perdus. Regardez avec : git -C $ICI status" >&2
  exit 1
fi

echo "[1/3] Récupération du code…"
sudo -u "${SUDO_USER:-root}" git -C "$ICI" pull --ff-only

# --- 2. Recopier ------------------------------------------------------------
echo "[2/3] Copie vers /opt/totem…"
mkdir -p /opt/totem
rm -rf /opt/totem/totem          # sinon d'anciens fichiers survivent à la copie
cp -r "$ICI/totem" /opt/totem/
find /opt/totem -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
(cd "$ICI" && git log -1 --format="%h %cd" --date=short 2>/dev/null) \
  > /opt/totem/VERSION || echo "inconnue" > /opt/totem/VERSION

# Le fichier de service change rarement, mais quand il change il faut le dire
# à systemd — sans quoi la nouvelle consigne resterait lettre morte.
if ! cmp -s "$ICI/systemd/totem.service" /etc/systemd/system/totem.service; then
  echo "      (le service a changé : rechargement de systemd)"
  cp "$ICI/systemd/totem.service" /etc/systemd/system/
  systemctl daemon-reload
fi

# --- 3. Relancer ------------------------------------------------------------
echo "[3/3] Redémarrage du robot…"
systemctl restart totem.service
sleep 3

APRES="$(cat /opt/totem/VERSION)"
echo
if [ "$AVANT" = "$APRES" ]; then
  echo "=== Rien de nouveau : toujours en $APRES ==="
else
  echo "=== À jour : $AVANT  →  $APRES ==="
fi

if systemctl is-active --quiet totem.service; then
  echo "Le robot tourne. Il doit vous avoir écrit sur Telegram."
else
  echo "ATTENTION : le service n'est pas actif." >&2
  echo "Voir pourquoi : sudo journalctl -u totem -n 40 --no-pager" >&2
  exit 1
fi
