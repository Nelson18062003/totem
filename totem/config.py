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
import re

CHEMINS = [
    os.environ.get("TOTEM_CONF", ""),
    "totem.conf",
    "/boot/firmware/totem.conf",
    "/etc/totem.conf",
]


class ErreurConfig(Exception):
    pass


def _liste(valeur):
    """« 123, 456 » → [123, 456 ]. Tolère espaces, points-virgules, vide."""
    return [int(x) for x in re.split(r"[,;\s]+", valeur.strip()) if x]


def _raccourcis(cfg):
    """Section [raccourcis] : des macros USSD lancées en un seul bouton.

        solde = 💰 Solde | *126#, 5, 1

    Le libellé avant « | » est facultatif ; les étapes sont jouées dans
    l'ordre, la première étant le code à composer. Le déroulé s'interrompt
    de lui-même dès qu'un code PIN est demandé.
    """
    resultat = {}
    if not cfg.has_section("raccourcis"):
        return resultat
    for nom, valeur in cfg.items("raccourcis"):
        libelle, separateur, suite = valeur.partition("|")
        if not separateur:
            libelle, suite = f"⚡ {nom.capitalize()}", valeur
        etapes = [e.strip() for e in suite.split(",") if e.strip()]
        if etapes:
            resultat[nom[:24]] = {"libelle": libelle.strip()[:32], "etapes": etapes}
    return resultat


def charger():
    for chemin in CHEMINS:
        if chemin and os.path.isfile(chemin):
            cfg = configparser.ConfigParser()
            cfg.read(chemin, encoding="utf-8")
            try:
                chat_id = cfg["telegram"]["chat_id"].strip()
                return {
                    "jeton": cfg["telegram"]["jeton"].strip(),
                    "chat_id": chat_id,
                    "groupe": cfg.get("telegram", "groupe", fallback="").strip(),
                    "admins": _liste(cfg.get("telegram", "admins", fallback="")),
                    "sujets": {
                        canal: int(valeur)
                        for canal in ("encaissements", "alertes")
                        for valeur in [cfg.get("telegram", f"sujet_{canal}",
                                               fallback="").strip()]
                        if valeur
                    },
                    "port": cfg.get("modem", "port", fallback="/dev/ttyUSB2"),
                    "nom": cfg.get("totem", "nom", fallback="TOTEM"),
                    "heure_rapport": cfg.get("totem", "heure_rapport", fallback="21:00"),
                    "base": cfg.get("totem", "base", fallback="/var/lib/totem/journal.db"),
                    "delai_session": cfg.getint("totem", "delai_session", fallback=180),
                    "raccourcis": _raccourcis(cfg),
                }
            except KeyError as e:
                raise ErreurConfig(f"Clé manquante dans {chemin} : {e}")
            except ValueError as e:
                raise ErreurConfig(f"Valeur invalide dans {chemin} : {e}")
    raise ErreurConfig(
        "Aucun fichier totem.conf trouvé. Copiez config.example.conf "
        "vers /boot/firmware/totem.conf et remplissez-le."
    )
