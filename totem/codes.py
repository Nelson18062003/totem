# -*- coding: utf-8 -*-
"""Catalogue de départ : les codes relevés sur le terrain.

Ce fichier ne contient **rien de deviné**. Chaque ligne a été composée sur un
vrai téléphone, sur un vrai réseau, et dictée par l'utilisateur. Un code
inventé n'aurait rien à faire ici : une erreur de chiffre envoie de l'argent
au mauvais endroit.

Pourquoi c'est néanmoins sans danger d'en proposer l'installation
-----------------------------------------------------------------
Tous ces codes sont des **portes d'entrée**. Aucun ne mène seul au bout d'une
opération : chacun débouche sur une demande — un montant, un bénéficiaire, le
code secret. Un code erroné échoue donc sur un « service indisponible », sans
qu'un franc ait bougé.

C'est ce qui distingue ce catalogue d'une devinette : le pire cas est un
bouton qui ne marche pas, et qu'on supprime.

Le catalogue ne fait que **proposer**. Rien ne s'installe sans que
l'utilisateur appuie, et chaque bouton reste modifiable ou supprimable ensuite
— ou remplaçable en refaisant l'opération une fois (voir app.py, apprentissage
des raccourcis).
"""

import unicodedata

# {opérateur: [(libellé, code, ce qui est demandé ensuite), …]}
#
# La troisième colonne n'est pas décorative : elle rappelle à l'utilisateur
# que le bouton ne fait qu'ouvrir le guichet, et que la suite lui appartient.
CATALOGUE = {
    "Orange": [
        ("💰 Solde", "#148*5#", "le code secret"),
        ("📥 Dépôt", "#148*2#", "le montant, puis le numéro"),
        ("📤 Retrait", "#148*3#", "le montant, puis le téléphone"),
        ("↗️ Transfert", "#148*4#", "le numéro, puis le montant"),
        ("🪪 Mon numéro", "#148*7*6#", "le code secret"),
    ],
}


def catalogue(operateur):
    """Les codes connus pour cet opérateur, ou une liste vide."""
    return CATALOGUE.get(operateur, [])


def cle(libelle):
    """« 💰 Dépôt » → « depot » : le nom interne, sans emoji ni accent.

    Les accents sont retirés à dessein. Cette clé voyage dans la donnée d'un
    bouton Telegram et se tape en commande : « /depot » doit fonctionner sans
    que l'utilisateur ait à produire un « é » sur un clavier de téléphone.
    """
    sans_accent = unicodedata.normalize("NFKD", libelle or "")
    sans_accent = "".join(c for c in sans_accent if not unicodedata.combining(c))
    propre = "".join(c for c in sans_accent
                     if c.isascii() and (c.isalnum() or c.isspace())).strip()
    return "_".join(propre.lower().split())[:24] or "raccourci"
