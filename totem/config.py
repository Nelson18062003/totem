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
import stat

CHEMINS = [
    os.environ.get("TOTEM_CONF", ""),
    "totem.conf",
    "/boot/firmware/totem.conf",
    "/etc/totem.conf",
]


class ErreurConfig(Exception):
    pass


def avertissements_droits(chemin):
    """Ce fichier laisse-t-il lire ses secrets à quelqu'un d'autre ?

    CE QU'IL PORTE : le jeton du robot Telegram — qui permet de PARLER à la
    place du robot, donc de piloter la SIM — et la clé de service Supabase,
    qui contourne toutes les règles de la base : la lire, c'est lire, écrire
    et effacer tout le grand livre. Le fichier d'exemple le dit lui-même :
    « ⚠ SECRÈTE : elle contourne… ».

    POURQUOI UN AVERTISSEMENT ET NON UN REFUS. Deux raisons, et la seconde
    est la vraie.

    D'abord, refuser de démarrer mettrait le robot à l'arrêt pour un défaut
    qui n'est pas une panne — et un robot arrêté, c'est une caisse qu'on ne
    surveille plus.

    Ensuite et surtout : le chemin RECOMMANDÉ est
    `/boot/firmware/totem.conf`, sur la partition de démarrage. Elle est en
    FAT — un système de fichiers qui n'a PAS de droits Unix. Aucun `chmod`
    n'y peut rien, et c'est un choix assumé : on veut pouvoir corriger la
    configuration depuis un PC Windows, en sortant la carte, sans être
    capable d'ouvrir un terminal. Refuser reviendrait à interdire
    l'installation ordinaire.

    Alors on le DIT. Un risque qu'on connaît et qu'on a choisi n'est pas le
    même qu'un risque qu'on ignore. Et le message dit quoi faire : déplacer
    le fichier vers `/etc/totem.conf`, où les droits existent vraiment.

    Rend une liste de phrases — vide si tout va bien.
    """
    try:
        mode = stat.S_IMODE(os.stat(chemin).st_mode)
    except OSError:
        return []
    if not mode & (stat.S_IRGRP | stat.S_IROTH):
        return []

    phrases = [
        f"Le fichier de configuration {chemin} est en {oct(mode)[-3:]} : "
        "d'autres comptes de cette machine peuvent le lire. Il porte le jeton "
        "du robot et la clé de service de la base."
    ]
    if _sur_partition_sans_droits(chemin):
        phrases.append(
            "Ce fichier est sur la partition de démarrage, en FAT : elle n'a "
            "pas de droits Unix, et « chmod » n'y changera rien. Pour le "
            "fermer vraiment, déplacez-le vers /etc/totem.conf "
            "(sudo mv " + chemin + " /etc/totem.conf && "
            "sudo chmod 600 /etc/totem.conf).")
    else:
        phrases.append(f"À refermer : sudo chmod 600 {chemin}")
    return phrases


def _sur_partition_sans_droits(chemin):
    """Le fichier est-il sur la partition de démarrage (FAT) ?

    On se fie au chemin plutôt qu'au type de système de fichiers : c'est
    lisible, cela ne dépend d'aucun outil, et ces deux emplacements sont les
    seuls que l'installateur propose là-bas."""
    reel = os.path.realpath(chemin)
    return reel.startswith("/boot/")


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


def _numeros(cfg):
    """Section [numeros] : le numéro de chaque puce, écrit à la main.

        orange = 696103864
        mtn    = 677123456

    Presque aucune SIM prépayée ne déclare son propre numéro au modem. Sans
    cette liste, TOTEM lit bien « Transfert de A vers B » mais ne sait pas
    laquelle des deux lignes est la sienne — et un reçu qui annonce
    « Montant reçu » sur un envoi est un faux document.

    La clé peut être l'ICCID de la puce, le libellé du compte ou le nom de
    l'opérateur : on prend ce que le propriétaire a sous les yeux.
    """
    if not cfg.has_section("numeros"):
        return {}
    return {cle.strip().lower(): re.sub(r"\D", "", valeur)
            for cle, valeur in cfg.items("numeros")
            if re.sub(r"\D", "", valeur)}


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
                    "nom": cfg.get("totem", "nom", fallback="TOTEM"),
                    # La langue du robot : « en » (défaut) ou « fr ». Les
                    # textes de l'opérateur, eux, restent toujours intacts.
                    "langue": cfg.get("totem", "langue", fallback="en").strip().lower(),
                    "heure_rapport": cfg.get("totem", "heure_rapport", fallback="21:00"),
                    "base": cfg.get("totem", "base", fallback="/var/lib/totem/journal.db"),
                    "delai_session": cfg.getint("totem", "delai_session", fallback=180),
                    "seuil_confirmation": cfg.getint("totem", "seuil_confirmation",
                                                     fallback=0),
                    "sauvegarde_quotidienne": cfg.getboolean(
                        "totem", "sauvegarde_quotidienne", fallback=True),
                    "raccourcis": _raccourcis(cfg),
                    "numeros": _numeros(cfg),
                    # Un reçu PDF joint aux opérations comprises. Se coupe
                    # d'un seul mot si l'on n'en veut pas.
                    "recus": cfg.getboolean("totem", "recus", fallback=True),
                    # Cloud : facultatif. Sans ces valeurs, TOTEM fonctionne
                    # exactement comme avant, entièrement hors ligne.
                    "cloud_url": cfg.get("cloud", "url", fallback="").strip(),
                    "cloud_cle": cfg.get("cloud", "cle", fallback="").strip(),
                    "terminal": cfg.get("cloud", "terminal", fallback="totem").strip(),
                    # D'OÙ VIENNENT CES VALEURS. Le robot en a besoin pour
                    # dire, au démarrage, si le fichier qui porte ses secrets
                    # est lisible par d'autres comptes de la machine.
                    "chemin_config": chemin,
                    "avertissements": avertissements_droits(chemin),
                }
            except KeyError as e:
                raise ErreurConfig(f"Clé manquante dans {chemin} : {e}")
            except ValueError as e:
                raise ErreurConfig(f"Valeur invalide dans {chemin} : {e}")
    raise ErreurConfig(
        "Aucun fichier totem.conf trouvé. Copiez config.example.conf "
        "vers /boot/firmware/totem.conf et remplissez-le."
    )
