# -*- coding: utf-8 -*-
"""Quelle version du code tourne réellement.

Sans cette information, impossible de distinguer « le correctif n'existe pas »
de « le correctif existe mais le Pi ne l'a pas encore ». Les deux se
ressemblent exactement vus depuis Telegram, et on peut y perdre des heures.

Le numéro est écrit dans un fichier VERSION au moment de l'installation. Si
le robot tourne directement depuis les sources, il interroge git.
"""

import os
import subprocess

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FICHIER = os.path.join(RACINE, "VERSION")

_memo = None


def version():
    """« a1b2c3d 2026-07-31 » ou « inconnue ». Jamais d'exception."""
    global _memo
    if _memo is None:
        _memo = _lire_fichier() or _lire_git() or "inconnue"
    return _memo


def _lire_fichier():
    try:
        with open(FICHIER, encoding="utf-8") as fichier:
            return fichier.read().strip()[:60] or None
    except OSError:
        return None


def _lire_git():
    try:
        resultat = subprocess.run(
            ["git", "-C", RACINE, "log", "-1", "--format=%h %cd", "--date=short"],
            capture_output=True, text=True, timeout=3)
    except Exception:
        return None
    return resultat.stdout.strip() or None if resultat.returncode == 0 else None
