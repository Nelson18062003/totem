# -*- coding: utf-8 -*-
"""Le boîtier lit l'écran de l'opérateur EXACTEMENT comme le téléphone.

Le boîtier enchaîne lui-même les écrans prévus d'une opération — le menu,
« 5 », « 1 », le numéro, le montant — sans repasser par Internet entre deux.
Il décide donc à la place de l'écran du téléphone, et chaque décision touche
à l'argent : un « 5 » sur un menu renuméroté, un numéro envoyé là où
l'opérateur attendait le code secret.

`web/noyau/tests/ecrans-partages.json` porte plus de trois mille écrans —
ceux que les tests du noyau lisent vraiment, ceux des tests du robot, du faux
nuage, des écrans fabriqués aux formes de MTN et d'Orange, et leurs
mutations (majuscules, espaces insécables, lignes jointes, accents) — avec ce
que le NOYAU en juge. Ce test exige que `totem/ecran.py` juge pareil, écran
par écran, champ par champ. `web/noyau/tests/ecrans-partages.test.ts`
exige, lui, que le noyau d'aujourd'hui juge encore comme le fichier.

LE TÉMOIN : la même lecture avec la frontière de mot de Python (« \\b »),
qui voit « é » comme une lettre. Elle doit se tromper quelque part — sans
quoi le corpus ne distinguerait pas une traduction fidèle d'une traduction
approximative.
"""

import json
import os
import re
import unittest
from unittest import mock

from totem import ecran

CORPUS = os.path.join(os.path.dirname(__file__), "..", "web", "noyau", "tests",
                      "ecrans-partages.json")
GABARITS = ["0", "1", "2", "3", "5", "00", "98", "{numero}", "{montant}"]
PROPRES = {"numero": "677998877", "montant": "5000"}
NUMERO = {"cle": "numero", "type": "numero"}
MONTANT = {"cle": "montant", "type": "montant"}
RESTANTS = [[NUMERO, MONTANT], [NUMERO], [MONTANT]]


def charger():
    with open(CORPUS, encoding="utf-8") as f:
        return json.load(f)


def lecture(texte, reseau=None):
    lu = ecran.lire_ecran(texte, reseau)
    return [lu["attend"], [f"{c['numero']}|{c['libelle']}" for c in lu["choix"]],
            lu["parleDuCode"], lu["issue"], lu["texte"]]


def juger(t):
    """La forme exacte de `juger` (web/noyau/tests/jumelle.ts)."""
    question = ecran.champ_pour_question(t, [NUMERO, MONTANT])
    return {
        "t": t,
        "lu": [lecture(t), lecture(t, "attend"), lecture(t, "fini")],
        "code": ecran.demande_un_code(t),
        "confirmation": ecran.est_une_confirmation(t),
        "question": question["cle"] if question else None,
        "etapes": [g for g in GABARITS if ecran.etape_peut_partir(g, t, "attend")],
        "servir": [(ecran.champ_a_servir(t, "attend", r, PROPRES) or {}).get("cle")
                   for r in RESTANTS],
        "porte": [ecran.porte_la_valeur(t, "numero", PROPRES["numero"]),
                  ecran.porte_la_valeur(t, "montant", PROPRES["montant"])],
    }


def ecarts(corpus):
    """Les écrans lisibles où le boîtier ne juge pas comme le noyau."""
    trouves = []
    for attendu in corpus:
        if not ecran.lisible(attendu["t"]):
            continue
        obtenu = juger(attendu["t"])
        for cle in attendu:
            if obtenu[cle] != attendu[cle]:
                trouves.append((attendu["t"], cle, attendu[cle], obtenu[cle]))
    return trouves


class LeBoitierJugeCommeLeNoyau(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.corpus = charger()

    def test_le_corpus_est_consequent(self):
        self.assertGreater(len(self.corpus), 3000)
        lisibles = [j for j in self.corpus if ecran.lisible(j["t"])]
        # Un corpus que le boîtier refuserait presque entier ne prouverait rien.
        self.assertGreater(len(lisibles), 0.97 * len(self.corpus))
        # Il couvre chaque décision qui compte.
        attentes = {j["lu"][1][0] for j in self.corpus}
        self.assertTrue({"choix", "numero", "montant", "secret", "texte"} <= attentes)
        self.assertTrue(any(j["servir"][0] == "numero" for j in self.corpus))
        self.assertTrue(any(j["servir"][0] == "montant" for j in self.corpus))
        self.assertTrue(any("5" in j["etapes"] for j in self.corpus))

    def test_chaque_ecran_est_juge_pareil(self):
        trouves = ecarts(self.corpus)
        self.assertEqual(trouves[:8], [], f"{len(trouves)} écart(s)")

    def test_le_temoin_echoue(self):
        """La frontière de mot de Python : une traduction presque juste."""
        approximatif = {}
        for nom, valeur in vars(ecran).items():
            if isinstance(valeur, re.Pattern):
                approximatif[nom] = re.compile(
                    valeur.pattern.replace(ecran.B, r"\b"), valeur.flags)
        with mock.patch.multiple(ecran, **approximatif):
            self.assertNotEqual(ecarts(self.corpus), [])


class LeBoitierRendLaMainSurUnCaractereDouteux(unittest.TestCase):
    """Là où Python et JavaScript pourraient lire différemment, le boîtier ne
    lit pas : il s'arrête, et l'écran du téléphone décide."""

    def test_les_caracteres_douteux(self):
        for c in (" ", " ", "﻿", "\x85", "\x1c", "İ",
                  "ſ", "K", "🙂"):
            self.assertFalse(ecran.lisible(f"Enter amount{c}"), repr(c))

    def test_le_francais_ordinaire_se_lit(self):
        for t in ("Entrez le numéro du bénéficiaire :", "Montant à transférer ?",
                  "1. Dépôt\n2. Retrait", "Solde : 12\xa0000 FCFA",
                  "Transfert de flotte de 25 000 FCFA à ÉTS ÉLÉGANCE"):
            self.assertTrue(ecran.lisible(t), t)


if __name__ == "__main__":
    unittest.main()
