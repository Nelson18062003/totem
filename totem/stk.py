# -*- coding: utf-8 -*-
"""Sonde du SIM Toolkit : la carte SIM porte-t-elle une applet Mobile Money ?

Pourquoi cette sonde
--------------------
En USSD, l'opérateur n'envoie que du texte. Rien n'indique s'il attend un
montant, un numéro ou un code secret — d'où la nécessité de deviner d'après
le vocabulaire, et la fragilité qui va avec.

Le **SIM Toolkit** répond exactement à ce manque : c'est un petit programme
logé dans la carte SIM, qui envoie des commandes *structurées* — une vraie
liste d'items pour un menu, et une demande de saisie accompagnée de son type
et d'un drapeau « ne pas révéler ». Plus rien à deviner.

Mais tout cela ne vaut que si l'applet Mobile Money est réellement présente
sur la carte, ce qui varie selon les pays, les opérateurs et les offres.
**Cette sonde répond à cette question et à elle seule.**

Ce qu'elle ne fait pas
----------------------
Elle est **strictement en lecture**. Elle n'ouvre aucune session, ne valide
rien, ne saisit aucun code, ne confirme aucune opération. Elle interroge le
modem, note ce qu'il répond, et se tait. On peut la lancer sur une SIM qui
contient de l'argent sans aucun risque.
"""

import re

from .textes import t

# Les firmwares SIMCom n'exposent pas tous les mêmes commandes. On les essaie
# toutes et on retient ce qui répond — plutôt que de conclure trop vite.
# Chaque description porte ses deux langues : (anglais, français).
SONDES = [
    ("AT+STK=?",     ("does the modem know the STK command?",
                      "le modem connaît-il la commande STK ?")),
    ("AT+STK?",      ("is the SIM Toolkit switched on?",
                      "le SIM Toolkit est-il activé ?")),
    ("AT+STK=1",     ("switching the SIM Toolkit on",
                      "activation du SIM Toolkit")),
    ("AT+STSM?",     ("the card's main menu (raw form)",
                      "menu principal de la carte (format brut)")),
    ("AT+STGI=0",    ("the card's main menu (readable form)",
                      "menu principal de la carte (format lisible)")),
    ("AT+CUSATA=?",  ("standard 3GPP variant (+CUSAT)",
                      "variante normalisée 3GPP (+CUSAT)")),
]

RE_ITEM = re.compile(r'"([^"]{2,40})"')
RE_ERREUR = re.compile(r"\bERROR\b", re.I)
# Mots qui trahissent une applet de paiement dans le menu de la carte.
RE_MOBILE_MONEY = re.compile(
    r"momo|mobile\s*money|orange\s*money|mtn|om\b|portefeuille|wallet", re.I)


class Resultat:
    """Ce que la sonde a observé, et ce qu'on peut en conclure."""

    def __init__(self):
        self.echanges = []       # [(commande, description, réponse brute)]
        self.items = []          # intitulés lus dans le menu de la carte
        self.supporte = False    # le modem accepte-t-il les commandes STK ?

    @property
    def applet_probable(self):
        return bool(RE_MOBILE_MONEY.search(" ".join(self.items)))

    def verdict(self):
        if not self.supporte:
            return t(
                "This firmware does not expose the SIM Toolkit over AT "
                "commands.\n"
                "→ USSD remains the only way on this modem. There is nothing "
                "better to do, and the card is not at fault.",
                "Ce firmware n'expose pas le SIM Toolkit par commandes AT.\n"
                "→ L'USSD reste la seule voie sur ce modem. Il n'y a rien "
                "de mieux à faire, et ce n'est pas un défaut de la carte.")
        if self.applet_probable:
            return t(
                "A payment applet appears to be present on the card.\n"
                "→ The SIM Toolkit route is worth taking: the operator could "
                "declare itself what each input expects, and the secret-code "
                "pad would no longer rest on guessed vocabulary.",
                "Une applet de paiement semble présente sur la carte.\n"
                "→ La voie SIM Toolkit est jouable : l'opérateur pourrait "
                "déclarer lui-même le type de chaque saisie, et le pavé du "
                "code ne reposerait plus sur du vocabulaire deviné.")
        if self.items:
            return t(
                "The SIM Toolkit answers, but no menu entry looks like a "
                "payment service.\n"
                "→ Check the other SIM before concluding: the applet depends "
                "on the operator and the plan.",
                "Le SIM Toolkit répond, mais aucun intitulé ne ressemble à "
                "un service de paiement.\n"
                "→ Vérifiez sur l'autre SIM avant de conclure : l'applet "
                "dépend de l'opérateur et de l'offre.")
        return t(
            "The SIM Toolkit answers, but the card offers no menu.\n"
            "→ This SIM carries no applet. USSD remains the way.",
            "Le SIM Toolkit répond, mais la carte ne propose aucun menu.\n"
            "→ Cette SIM n'embarque pas d'applet. L'USSD reste la voie.")


def sonder(modem):
    """Interroge le modem, sans rien modifier. Ne lève jamais d'exception."""
    resultat = Resultat()
    for commande, description in SONDES:
        try:
            with modem.verrou:
                reponse = modem._envoyer(commande, delai=4)
        except Exception as e:
            reponse = t(f"(failed: {e})", f"(échec : {e})")
        resultat.echanges.append((commande, description, reponse.strip()))
        if "OK" in reponse and not RE_ERREUR.search(reponse):
            resultat.supporte = True
        for item in RE_ITEM.findall(reponse):
            if item not in resultat.items:
                resultat.items.append(item)
    return resultat


def rapport(resultat):
    """Compte rendu lisible, destiné à être lu — pas seulement au journal."""
    lignes = [t("=== SIM Toolkit: what does this card carry? ===",
                "=== SIM Toolkit : que porte cette carte ? ==="), ""]
    for commande, description, reponse in resultat.echanges:
        # La description accompagne la commande sous ses deux langues.
        dite = t(*description) if isinstance(description, tuple) else description
        lignes.append(f"{commande:<14} {dite}")
        for ligne in (reponse or t("(no reply)", "(aucune réponse)")).splitlines():
            if ligne.strip():
                lignes.append(f"    {ligne.strip()}")
        lignes.append("")
    if resultat.items:
        lignes.append(t("Entries read from the card:",
                        "Intitulés lus dans la carte :"))
        lignes += [f"  · {item}" for item in resultat.items]
        lignes.append("")
    lignes.append(resultat.verdict())
    lignes.append("")
    lignes.append(t(
        "This probe is read-only: no session opened, no code entered, "
        "no operation confirmed.",
        "Cette sonde est en lecture seule : aucune session ouverte, "
        "aucun code saisi, aucune opération confirmée."))
    return "\n".join(lignes)
