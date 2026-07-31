# -*- coding: utf-8 -*-
"""Nommage des comptes : la carte fait foi, pas le réseau visité.

Le cas qui a motivé ces tests : une SIM MTN Cameroun essayée en France, donc
enregistrée en itinérance sur Orange France. Le modem répond honnêtement
« Orange F » à AT+COPS?. Nommer le compte d'après cette réponse le ferait
basculer de « Orange » à « MTN » le jour de l'arrivée à Douala — et la base,
qui indexe les comptes par libellé, en créerait un second, avec l'historique
coupé en deux.
"""

import unittest

from totem.detect import InfoModem, operateur_depuis_imsi


class TestOperateurDepuisImsi(unittest.TestCase):

    def test_cameroun(self):
        self.assertEqual(operateur_depuis_imsi("624011234567890"), "MTN")
        self.assertEqual(operateur_depuis_imsi("624029876543210"), "Orange")
        self.assertEqual(operateur_depuis_imsi("624041111111111"), "Nexttel")
        self.assertEqual(operateur_depuis_imsi("624072222222222"), "Camtel")

    def test_france(self):
        self.assertEqual(operateur_depuis_imsi("208013333333333"), "Orange F")
        self.assertEqual(operateur_depuis_imsi("208204444444444"), "Bouygues")

    def test_inconnu_ou_absent(self):
        self.assertIsNone(operateur_depuis_imsi("999991234567890"))
        self.assertIsNone(operateur_depuis_imsi(""))
        self.assertIsNone(operateur_depuis_imsi(None))
        self.assertIsNone(operateur_depuis_imsi("624"))  # trop court


class TestLibelle(unittest.TestCase):

    def test_sim_mtn_en_itinerance_reste_mtn(self):
        """Le cas réel : SIM MTN Cameroun, essayée depuis la France."""
        info = InfoModem("/dev/ttyUSB2", "862636058015015",
                         imsi="624011234567890", operateur="Orange F",
                         sim_prete=True, itinerance=True)
        self.assertEqual(info.libelle, "MTN")

    def test_meme_sim_arrivee_a_douala(self):
        """Même carte, réseau d'origine retrouvé : le libellé ne bouge pas."""
        info = InfoModem("/dev/ttyUSB2", "862636058015015",
                         imsi="624011234567890", operateur="MTN CM",
                         sim_prete=True, itinerance=False)
        self.assertEqual(info.libelle, "MTN")

    def test_repli_sur_le_nom_du_reseau_sans_imsi(self):
        """Sans IMSI lisible, mieux vaut le nom du réseau que rien."""
        info = InfoModem("/dev/ttyUSB0", "111111111111111",
                         imsi="", operateur="MTN CM", sim_prete=True)
        self.assertEqual(info.libelle, "MTN")

    def test_imsi_inconnu_repli_sur_le_reseau(self):
        info = InfoModem("/dev/ttyUSB0", "111111111111111",
                         imsi="999991234567890", operateur="Orange CM",
                         sim_prete=True)
        self.assertEqual(info.libelle, "Orange")

    def test_operateur_exotique_conserve_son_nom(self):
        info = InfoModem("/dev/ttyUSB0", "111111111111111",
                         imsi="", operateur="Vodacom", sim_prete=True)
        self.assertEqual(info.libelle, "Vodacom")

    def test_sans_sim(self):
        info = InfoModem("/dev/ttyUSB0", "111111111111111")
        self.assertEqual(info.libelle, "SIM inconnue")


class TestDescription(unittest.TestCase):

    def test_itinerance_signalee(self):
        info = InfoModem("/dev/ttyUSB2", "862636058015015",
                         imsi="624011234567890", operateur="Orange F",
                         sim_prete=True, itinerance=True)
        self.assertEqual(info.description, "MTN (itinérance sur Orange F)")

    def test_reseau_domestique_sans_mention(self):
        info = InfoModem("/dev/ttyUSB2", "862636058015015",
                         imsi="624011234567890", operateur="MTN CM",
                         sim_prete=True, itinerance=False)
        self.assertEqual(info.description, "MTN")


if __name__ == "__main__":
    unittest.main()
