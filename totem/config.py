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

PROFIL_PAR_DEFAUT = "*"


class ErreurConfig(Exception):
    pass


def _liste(valeur):
    """« 123, 456 » → [123, 456]. Tolère espaces, points-virgules, vide."""
    return [int(x) for x in re.split(r"[,;\s]+", valeur.strip()) if x]


def _raccourcis(cfg, section):
    """Macros USSD lancées en un seul bouton :

        solde = 💰 Solde | *126#, 5, 1

    Le libellé avant « | » est facultatif ; les étapes sont jouées dans
    l'ordre, la première étant le code à composer. Le déroulé s'interrompt
    de lui-même dès qu'un code secret est demandé.
    """
    resultat = {}
    if not cfg.has_section(section):
        return resultat
    for nom, valeur in cfg.items(section):
        libelle, separateur, suite = valeur.partition("|")
        if not separateur:
            libelle, suite = f"⚡ {nom.capitalize()}", valeur
        etapes = [e.strip() for e in suite.split(",") if e.strip()]
        if etapes:
            resultat[nom[:24]] = {"libelle": libelle.strip()[:32], "etapes": etapes}
    return resultat


def _profils(cfg):
    """Un profil par opérateur : comment le reconnaître, quel code compose son
    menu, et quels raccourcis lui appartiennent.

        [operateur.orange]
        nom = Orange Money
        detection = Orange        ← cherché dans le nom du réseau vu par le modem
        menu = #148#

        [raccourcis.orange]
        solde = 💰 Solde | #148#, 4, 1

    La section [raccourcis] sans suffixe reste valable : elle sert de profil
    de repli quand l'opérateur détecté ne correspond à aucun profil.
    """
    profils = {}

    def creer(cle):
        return profils.setdefault(cle, {
            "nom": cle.upper() if cle != PROFIL_PAR_DEFAUT else "",
            "detection": "" if cle == PROFIL_PAR_DEFAUT else cle,
            "menu": "", "raccourcis": {},
        })

    for section in cfg.sections():
        famille, _, cle = section.partition(".")
        cle = cle.strip().lower()
        if famille == "operateur" and cle:
            profil = creer(cle)
            profil["nom"] = cfg.get(section, "nom", fallback=cle.upper()).strip()
            profil["detection"] = cfg.get(section, "detection", fallback=cle).strip()
            profil["menu"] = cfg.get(section, "menu", fallback="").strip()
        elif famille == "raccourcis" and cle:
            creer(cle)["raccourcis"] = _raccourcis(cfg, section)

    if cfg.has_section("raccourcis"):     # ancienne forme, sans opérateur
        creer(PROFIL_PAR_DEFAUT)["raccourcis"] = _raccourcis(cfg, "raccourcis")
    return profils


def charger():
    for chemin in CHEMINS:
        if chemin and os.path.isfile(chemin):
            cfg = configparser.ConfigParser()
            cfg.read(chemin, encoding="utf-8")
            try:
                return {
                    "jeton": cfg["telegram"]["jeton"].strip(),
                    "chat_id": cfg["telegram"]["chat_id"].strip(),
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
                    "seuil_confirmation": cfg.getint("totem", "seuil_confirmation",
                                                     fallback=0),
                    "sauvegarde_quotidienne": cfg.getboolean(
                        "totem", "sauvegarde_quotidienne", fallback=True),
                    "profils": _profils(cfg),
                }
            except KeyError as e:
                raise ErreurConfig(f"Clé manquante dans {chemin} : {e}")
            except ValueError as e:
                raise ErreurConfig(f"Valeur invalide dans {chemin} : {e}")
    raise ErreurConfig(
        "Aucun fichier totem.conf trouvé. Copiez config.example.conf "
        "vers /boot/firmware/totem.conf et remplissez-le."
    )
