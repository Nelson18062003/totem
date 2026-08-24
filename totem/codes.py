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

from .textes import t

# {opérateur: [((libellé anglais, libellé français), code,
#               (aide anglaise, aide française)), …]}
#
# La troisième colonne n'est pas décorative : elle rappelle à l'utilisateur
# que le bouton ne fait qu'ouvrir le guichet, et que la suite lui appartient.
#
# Les deux langues vivent côte à côte, mais la CLÉ d'un bouton (voir `cle`)
# reste dérivée de la forme française, quelle que soit la langue affichée :
# c'est elle qui est stockée dans les raccourcis et tapée en commande, et
# elle ne doit pas bouger quand le robot change de langue.
CATALOGUE = {
    "Orange": [
        (("💰 Balance", "💰 Solde"), "#148*5#",
         ("your secret code", "le code secret")),
        (("📥 Deposit", "📥 Dépôt"), "#148*2#",
         ("the amount, then the number", "le montant, puis le numéro")),
        (("📤 Withdrawal", "📤 Retrait"), "#148*3#",
         ("the amount, then the phone", "le montant, puis le téléphone")),
        (("↗️ Transfer", "↗️ Transfert"), "#148*4#",
         ("the number, then the amount", "le numéro, puis le montant")),
        (("🪪 My number", "🪪 Mon numéro"), "#148*7*6#",
         ("your secret code", "le code secret")),
    ],
    # MTN : seule la porte d'entrée MoMo est relevée pour l'instant — c'est
    # elle que le fichier de configuration cite en exemple depuis le début.
    # Les codes profonds (dépôt direct, solde direct…) se relèvent sur le
    # vrai téléphone puis s'apprennent (💾) : on ne les devine pas.
    "MTN": [
        (("🧭 MoMo menu", "🧭 Menu MoMo"), "*126#",
         ("the menu guides you, step by step",
          "le menu vous guide, étape par étape")),
    ],
}


def catalogue(operateur):
    """Les codes connus pour cet opérateur, ou une liste vide.

    Chaque entrée sort dans la langue du moment : (libellé, code, aide)."""
    return [(t(*libelles), code, t(*aides))
            for libelles, code, aides in CATALOGUE.get(operateur, [])]


def _deriver(libelle):
    """« 💰 Dépôt » → « depot » : le nom interne, sans emoji ni accent."""
    sans_accent = unicodedata.normalize("NFKD", libelle or "")
    sans_accent = "".join(c for c in sans_accent if not unicodedata.combining(c))
    propre = "".join(c for c in sans_accent
                     if c.isascii() and (c.isalnum() or c.isspace())).strip()
    return "_".join(propre.lower().split())[:24] or "raccourci"


# Le même bouton, quelle que soit sa langue, mène à la même clé : celle de sa
# forme française. Sans cette table, installer « 💰 Balance » créerait un
# raccourci « balance » à côté du « solde » historique — deux boutons pour le
# même code, et « /solde » qui cesse de répondre après un changement de langue.
_CLES_STABLES = {}
for _entrees in CATALOGUE.values():
    for (_en, _fr), _code, _aide in _entrees:
        _CLES_STABLES[_deriver(_en)] = _deriver(_fr)


def cle(libelle):
    """« 💰 Dépôt » comme « 📥 Deposit » → « depot » : le nom interne.

    Les accents sont retirés à dessein. Cette clé voyage dans la donnée d'un
    bouton Telegram et se tape en commande : « /depot » doit fonctionner sans
    que l'utilisateur ait à produire un « é » sur un clavier de téléphone.

    Pour les libellés du catalogue, la clé est celle de la forme FRANÇAISE,
    dans les deux langues : ce qui est stocké ne dépend jamais de la langue.
    """
    brute = _deriver(libelle)
    return _CLES_STABLES.get(brute, brute)
