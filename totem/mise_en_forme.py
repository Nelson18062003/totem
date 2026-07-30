# -*- coding: utf-8 -*-
"""Petits utilitaires de mise en forme des messages Telegram (mode HTML).

Telegram accepte un HTML très restreint : <b>, <i>, <code>, <pre>, <a>.
Tout texte venant du modem ou d'un SMS doit être échappé avant d'être inséré.
"""

import html
import re

RE_BALISE = re.compile(r"<[^>]+>")


def echap(texte):
    """Rend sûr un texte d'origine externe (menu USSD, SMS, nom d'expéditeur)."""
    return html.escape(str(texte), quote=False)


def gras(texte):
    return f"<b>{echap(texte)}</b>"


def mono(texte):
    return f"<code>{echap(texte)}</code>"


def bloc(texte):
    """Bloc à chasse fixe : idéal pour un menu USSD, qui garde son alignement."""
    return f"<pre>{echap(texte)}</pre>"


def brut(texte):
    """Retire le balisage : pour les transports texte (console, scénario)."""
    return html.unescape(RE_BALISE.sub("", texte))
