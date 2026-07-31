# -*- coding: utf-8 -*-
"""Tests de lecture des SMS Mobile Money.

Les formulations ci-dessous reprennent celles rencontrées chez MTN Cameroun et
Orange Cameroun, avec leurs variantes : accents présents ou absents (contrainte
GSM), montants espacés ou collés, nom parfois donné, parfois seulement le
numéro, référence sous des étiquettes différentes.

Lancer :  python3 -m unittest discover -s tests
"""

import unittest

from totem.analyse_sms import analyser


class TestEncaissements(unittest.TestCase):
    def test_mtn_forme_complete(self):
        p = analyser(
            "MobileMoney: Vous avez recu 25 000 FCFA de NGONO Marie "
            "(677123456). Ref: PP250730.0947.A12345. "
            "Nouveau solde: 872 500 FCFA.")
        self.assertIsNotNone(p)
        self.assertEqual(p.sens, "entree")
        self.assertEqual(p.montant, 25000)
        self.assertEqual(p.nom, "NGONO Marie")
        self.assertEqual(p.numero, "677123456")
        self.assertEqual(p.reference, "PP250730.0947.A12345")
        self.assertEqual(p.solde_apres, 872500)

    def test_avec_accents(self):
        p = analyser("Vous avez reçu 15 000 FCFA de TCHOUMI Paul (699102233).")
        self.assertEqual(p.montant, 15000)
        self.assertEqual(p.nom, "TCHOUMI Paul")

    def test_orange_money(self):
        p = analyser(
            "Orange Money: Vous avez recu 35000 F CFA de 655128899. "
            "Reference OM0112.E11223. Solde: 400000 F CFA")
        self.assertEqual(p.sens, "entree")
        self.assertEqual(p.montant, 35000)
        self.assertEqual(p.numero, "655128899")
        self.assertEqual(p.reference, "OM0112.E11223")
        self.assertEqual(p.solde_apres, 400000)

    def test_montant_avec_points(self):
        p = analyser("Vous avez recu 1.250.000 FCFA de ABENA Rose (690334455)")
        self.assertEqual(p.montant, 1250000)

    def test_devise_xaf(self):
        p = analyser("You have received 50000 XAF from 677445566. Ref: TX99")
        self.assertEqual(p.sens, "entree")
        self.assertEqual(p.montant, 50000)

    def test_sans_nom_seulement_numero(self):
        p = analyser("Vous avez recu 5 000 FCFA de 699887766.")
        self.assertEqual(p.montant, 5000)
        self.assertIsNone(p.nom)
        self.assertEqual(p.numero, "699887766")
        self.assertEqual(p.tiers, "699887766")   # on affiche le numéro à défaut


class TestEnvois(unittest.TestCase):
    def test_transfert_sortant(self):
        p = analyser(
            "Vous avez envoye 80 000 FCFA a Fournisseur SARL (690334455). "
            "Frais: 800 FCFA. Nouveau solde: 797 500 FCFA")
        self.assertEqual(p.sens, "sortie")
        self.assertEqual(p.montant, 80000)
        self.assertEqual(p.frais, 800)
        self.assertEqual(p.solde_apres, 797500)

    def test_retrait(self):
        p = analyser("Vous avez retire 20000 FCFA chez AGENT DOUALA (650000000)")
        self.assertEqual(p.sens, "sortie")
        self.assertEqual(p.montant, 20000)


class TestCeQuiNestPasUnPaiement(unittest.TestCase):
    """Un faux encaissement fausserait les comptes : mieux vaut ne rien
    comprendre que comprendre de travers."""

    def test_publicite(self):
        self.assertIsNone(analyser(
            "PROMO! Rechargez 5000 FCFA et gagnez 1000 FCFA de bonus !"))

    def test_code_de_verification(self):
        self.assertIsNone(analyser(
            "Votre code de verification est 123456. Ne partagez ce code avec "
            "personne."))

    def test_message_quelconque(self):
        self.assertIsNone(analyser("Bonjour, es-tu disponible demain ?"))

    def test_message_vide(self):
        self.assertIsNone(analyser(""))
        self.assertIsNone(analyser("   "))
        self.assertIsNone(analyser(None))

    def test_montant_illisible(self):
        self.assertIsNone(analyser("Vous avez recu un virement FCFA de Marie"))


class TestRobustesse(unittest.TestCase):
    def test_texte_toujours_conserve(self):
        brut = "Vous avez recu 25 000 FCFA de NGONO Marie (677123456)."
        self.assertEqual(analyser(brut).texte, brut)

    def test_espaces_insecables(self):
        p = analyser("Vous avez recu 25 000 FCFA de 677123456")
        self.assertEqual(p.montant, 25000)

    def test_sms_tronque(self):
        """Un SMS coupé garde ce qu'on peut en tirer, sans inventer le reste."""
        p = analyser("Vous avez recu 25 000 FCFA de NGONO Ma")
        self.assertEqual(p.montant, 25000)
        self.assertIsNone(p.solde_apres)
        self.assertIsNone(p.reference)

    def test_retours_a_la_ligne(self):
        p = analyser("MobileMoney:\nVous avez recu 25 000 FCFA\nde 677123456\n"
                     "Nouveau solde: 100 000 FCFA")
        self.assertEqual(p.montant, 25000)
        self.assertEqual(p.solde_apres, 100000)

    def test_serialisation(self):
        d = analyser("Vous avez recu 25 000 FCFA de NGONO Marie (677123456)").en_dict()
        self.assertEqual(d["montant"], 25000)
        self.assertEqual(d["sens"], "entree")
        self.assertIn("texte", d)


if __name__ == "__main__":
    unittest.main()
