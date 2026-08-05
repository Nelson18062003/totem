# -*- coding: utf-8 -*-
"""La langue du robot : anglais d'abord, français au choix.

Tout texte que TOTEM écrit lui-même — messages Telegram, boutons, reçus,
rapports, alertes — passe par `t()` : les deux versions vivent côte à côte,
au même endroit que le message. L'anglais n'est pas une traduction plaquée :
chaque phrase est écrite pour elle-même.

Ce que la langue ne touche jamais : le texte venu du réseau. Les réponses
USSD, les menus de la SIM et les SMS de l'opérateur s'affichent mot pour
mot, dans la langue où la carte les a reçus. La langue de ces contenus se
règle chez l'opérateur (souvent par une option de son menu USSD), pas ici.

Le choix vient de `totem.conf` :

    [totem]
    langue = en        ; « en » (défaut) ou « fr »
"""

LANGUES = ("en", "fr")

_langue = "en"


def normaliser(valeur):
    """« FR », « fr  » → « fr » ; tout le reste retombe sur « en »."""
    valeur = (valeur or "").strip().lower()
    return valeur if valeur in LANGUES else "en"


def definir_langue(valeur):
    """Fixe la langue du robot pour toute la suite (appelé au démarrage)."""
    global _langue
    _langue = normaliser(valeur)


def langue_active():
    return _langue


def t(en, fr, langue=None):
    """Choisit la version dans la langue active — ou celle demandée.

    L'appel porte les deux textes : `t("Balance", "Solde")`. Une demande
    venue de la plateforme peut imposer sa langue via le paramètre.
    """
    choisie = normaliser(langue) if langue else _langue
    return en if choisie == "en" else fr
