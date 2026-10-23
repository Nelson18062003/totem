# -*- coding: utf-8 -*-
"""LES RÉSEAUX QU'UNE CARTE PEUT EMPRUNTER — et comment on les nomme.

POURQUOI CE MODULE EXISTE
-------------------------
Le boîtier est en France ; ses cartes camerounaises empruntent des antennes
françaises, et chaque carte choisit la sienne. Le 23 octobre, MTN ·6414 était
la seule sur SFR : quinze pertes de réseau en une matinée, des codes refusés
par le réseau (« unknown network message »), pendant que ses deux sœurs, sur
Orange F, travaillaient sans un accroc. Un téléphone offre « Choisir le
réseau manuellement » ; le modem aussi (AT+COPS). Ce module donne au
propriétaire les mots pour le dire dans `totem.conf`, et au robot la façon de
le nommer au journal.

Un réseau se désigne par son code (pays + opérateur, « 20801 ») ou par un nom
courant. Le code est ce que le modem comprend ; le nom est ce que le
propriétaire lit.
"""

import re

# code → nom lisible. Les réseaux visités en France, et les deux de la maison.
RESEAUX_CONNUS = {
    "20801": "Orange F",
    "20810": "SFR",
    "20815": "Free Mobile",
    "20820": "Bouygues Telecom",
    "62401": "MTN Cameroun",
    "62402": "Orange Cameroun",
}

# Ce que le propriétaire peut écrire, en plus du code.
_NOMS = {
    "orange f": "20801", "orange france": "20801", "orangef": "20801",
    "sfr": "20810",
    "free": "20815", "free mobile": "20815",
    "bouygues": "20820", "bouygues telecom": "20820",
    "mtn": "62401", "mtn cameroun": "62401", "mtn cm": "62401",
    "orange cameroun": "62402", "orange cm": "62402",
}


def _normaliser(valeur):
    return re.sub(r"\s+", " ", (valeur or "").strip().lower())


def code_du_reseau(valeur):
    """Le code à cinq ou six chiffres d'un réseau, d'après un code ou un
    nom connu — ou None si l'on ne sait pas de quel réseau il s'agit."""
    v = _normaliser(valeur)
    if re.fullmatch(r"\d{5,6}", v):
        return v
    return _NOMS.get(v)


def nom_du_reseau(code):
    """« Orange F (20801) », ou le code seul s'il n'est pas connu."""
    nom = RESEAUX_CONNUS.get(code or "")
    return f"{nom} ({code})" if nom else (code or "?")


def noms_acceptes():
    """Pour le message d'erreur de la configuration : ce qu'on peut écrire."""
    return sorted(set(RESEAUX_CONNUS.values()))
