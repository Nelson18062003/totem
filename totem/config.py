# -*- coding: utf-8 -*-
"""Chargement de la configuration (format INI).

Ordre de recherche :
  1. variable d'environnement TOTEM_CONF
  2. ./totem.conf (dossier courant)
  3. /boot/firmware/totem.conf  (modifiable depuis un PC Windows/Mac !)
  4. /etc/totem.conf
"""

import configparser
import os

CHEMINS = [
    os.environ.get("TOTEM_CONF", ""),
    "totem.conf",
    "/boot/firmware/totem.conf",
    "/etc/totem.conf",
]


class ErreurConfig(Exception):
    pass


def charger():
    for chemin in CHEMINS:
        if chemin and os.path.isfile(chemin):
            cfg = configparser.ConfigParser()
            cfg.read(chemin, encoding="utf-8")
            try:
                return {
                    "jeton": cfg["telegram"]["jeton"].strip(),
                    "chat_id": cfg["telegram"]["chat_id"].strip(),
                    "port": cfg.get("modem", "port", fallback="/dev/ttyUSB2"),
                    "nom": cfg.get("totem", "nom", fallback="TOTEM"),
                    "heure_rapport": cfg.get("totem", "heure_rapport", fallback="21:00"),
                    "base": cfg.get("totem", "base", fallback="/var/lib/totem/journal.db"),
                }
            except KeyError as e:
                raise ErreurConfig(f"Clé manquante dans {chemin} : {e}")
    raise ErreurConfig(
        "Aucun fichier totem.conf trouvé. Copiez config.example.conf "
        "vers /boot/firmware/totem.conf et remplissez-le."
    )
