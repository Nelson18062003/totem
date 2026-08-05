# -*- coding: utf-8 -*-
"""Santé physique du Raspberry Pi : tension, température, disque, mémoire.

À Douala, le danger n'est pas le logiciel : c'est le courant. Une alimentation
qui faiblit (coupure, onduleur en fin de charge, deux modems qui émettent en
même temps) fait chuter la tension du Pi. Il se met alors à brider, puis à
corrompre sa carte mémoire. Le Pi le sait et le dit — encore faut-il l'écouter.

Chaque alerte n'est envoyée qu'une fois : on ne signale que les changements
d'état (apparition, puis rétablissement), jamais la répétition.
"""

import os
import re
import shutil
import subprocess

from .textes import t

# Bits renvoyés par « vcgencmd get_throttled » (documentation Raspberry Pi).
SOUS_TENSION = 0x1          # sous-tension en ce moment
BRIDAGE_FREQ = 0x2          # fréquence bridée en ce moment
BRIDAGE = 0x4               # bridage thermique en ce moment
SOUS_TENSION_PASSEE = 0x10000   # c'est arrivé depuis le démarrage
BRIDAGE_PASSE = 0x40000

TEMP_ALERTE = 75.0          # °C — au-delà, le Pi commence à se brider
DISQUE_ALERTE = 90          # % d'occupation


def _commande(args):
    try:
        return subprocess.run(args, capture_output=True, text=True,
                              timeout=5).stdout.strip()
    except Exception:
        return ""


def temperature():
    """Température du processeur en °C, ou None si illisible."""
    try:
        with open("/sys/class/thermal/thermal_zone0/temp") as f:
            return int(f.read().strip()) / 1000.0
    except Exception:
        pass
    m = re.search(r"([\d.]+)", _commande(["vcgencmd", "measure_temp"]))
    return float(m.group(1)) if m else None


def bridage():
    """Drapeaux d'alimentation du Pi, ou None hors Raspberry Pi."""
    m = re.search(r"0x([0-9a-fA-F]+)", _commande(["vcgencmd", "get_throttled"]))
    return int(m.group(1), 16) if m else None


def disque(chemin="/"):
    """(pourcentage occupé, gigaoctets libres)."""
    try:
        u = shutil.disk_usage(chemin)
        return round(u.used / u.total * 100), round(u.free / 1e9, 1)
    except Exception:
        return None, None


def duree_marche():
    """Depuis combien de temps la machine tourne, en texte lisible."""
    try:
        with open("/proc/uptime") as f:
            secondes = float(f.read().split()[0])
    except Exception:
        return t("unknown", "inconnu")
    jours, reste = divmod(int(secondes), 86400)
    heures, reste = divmod(reste, 3600)
    minutes = reste // 60
    if jours:
        return t(f"{jours} d {heures} h", f"{jours} j {heures} h")
    if heures:
        return f"{heures} h {minutes} min"
    return f"{minutes} min"


class Sante:
    """Relève l'état du Pi et n'annonce que ce qui change."""

    def __init__(self):
        self.etats = {}     # nom d'alerte → True si l'alerte est active

    def resume(self):
        """Ligne d'état lisible pour /statut."""
        duree = duree_marche()
        parties = [t(f"up for {duree}", f"en marche depuis {duree}")]
        temp = temperature()
        if temp is not None:
            parties.append(f"{temp:.0f} °C")
        occupe, libre = disque()
        if occupe is not None:
            parties.append(t(f"disk {occupe}% ({libre} GB free)",
                             f"disque {occupe} % ({libre} Go libres)"))
        drapeaux = bridage()
        if drapeaux:
            if drapeaux & SOUS_TENSION:
                parties.append(t("UNDERVOLTAGE", "SOUS-TENSION"))
            elif drapeaux & SOUS_TENSION_PASSEE:
                parties.append(t("undervoltage earlier", "sous-tension passée"))
        return " · ".join(parties)

    def alertes(self):
        """Nouvelles alertes (et rétablissements) depuis le dernier appel."""
        messages = []
        drapeaux = bridage()

        if drapeaux is not None:
            messages += self._bascule(
                "tension", bool(drapeaux & SOUS_TENSION),
                t("The power supply is falling short: the Pi is undervolted. "
                  "Check the power supply and the cable, or move the modems "
                  "to a powered USB hub. The memory card is at risk of "
                  "corruption.",
                  "Alimentation insuffisante : le Pi est en sous-tension. "
                  "Vérifiez l'alimentation, le câble, ou passez les modems sur "
                  "un hub USB alimenté. Risque de corruption de la carte mémoire."),
                t("Power is back to normal.",
                  "Alimentation revenue à la normale."))
            messages += self._bascule(
                "bridage", bool(drapeaux & (BRIDAGE | BRIDAGE_FREQ)),
                t("The Pi is slowing itself down (heat or power). Responses "
                  "will take longer.",
                  "Le Pi se bride (chaleur ou tension). Les temps de réponse "
                  "vont s'allonger."),
                t("The Pi is running at full speed again.",
                  "Le Pi ne se bride plus."))

        temp = temperature()
        if temp is not None:
            messages += self._bascule(
                "temperature", temp >= TEMP_ALERTE,
                t(f"High temperature: {temp:.0f} °C. Give the device some "
                  "air, and check that the heat sinks are firmly attached.",
                  f"Température élevée : {temp:.0f} °C. Dégagez l'appareil, "
                  "vérifiez que les radiateurs sont bien collés."),
                t("Temperature is back to normal.",
                  "Température revenue à la normale."))

        occupe, libre = disque()
        if occupe is not None:
            messages += self._bascule(
                "disque", occupe >= DISQUE_ALERTE,
                t(f"Memory card {occupe}% full ({libre} GB free). "
                  "The log will soon have nowhere to write.",
                  f"Carte mémoire pleine à {occupe} % ({libre} Go libres). "
                  "Le journal ne pourra bientôt plus s'écrire."),
                t("Disk space is sufficient again.",
                  "Espace disque redevenu suffisant."))

        return messages

    def _bascule(self, nom, actif, message_alerte, message_retour):
        """N'émet un message que si l'état a changé depuis la dernière fois."""
        precedent = self.etats.get(nom, False)
        self.etats[nom] = actif
        if actif and not precedent:
            return [("alerte", message_alerte)]
        if precedent and not actif:
            return [("retour", message_retour)]
        return []


def sauvegarder_journal(chemin_db, gardees=7):
    """Copie datée du journal, en gardant les N dernières. Une carte mémoire
    qui meurt emporte tout : cette copie permet au moins de repartir."""
    import glob
    import sqlite3
    from datetime import datetime

    if not chemin_db or chemin_db == ":memory:" or not os.path.exists(chemin_db):
        return None
    dossier = os.path.join(os.path.dirname(chemin_db) or ".", "sauvegardes")
    os.makedirs(dossier, exist_ok=True)
    cible = os.path.join(dossier, f"journal-{datetime.now():%Y%m%d}.db")
    try:
        # sqlite3.backup : copie cohérente même si le robot écrit en même temps.
        source = sqlite3.connect(chemin_db)
        copie = sqlite3.connect(cible)
        with copie:
            source.backup(copie)
        source.close()
        copie.close()
    except Exception:
        return None
    anciennes = sorted(glob.glob(os.path.join(dossier, "journal-*.db")))
    for vieille in anciennes[:-gardees]:
        try:
            os.remove(vieille)
        except OSError:
            pass
    return cible
