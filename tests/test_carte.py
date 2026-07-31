# -*- coding: utf-8 -*-
"""Identité d'une carte SIM : opérateur, libellé, itinérance.

Le cas qui a motivé ce module : la vraie SIM MTN Cameroun, essayée depuis la
France, donc enregistrée en itinérance sur un réseau français. Le modem répond
honnêtement « Orange F » à AT+COPS?. Nommer le compte d'après cette réponse le
ferait basculer de « Orange » à « MTN » le jour de l'arrivée à Douala — et la
base, qui indexe par carte, se retrouverait avec un historique coupé en deux.
"""

import unittest

from totem.carte import Carte, masquer, operateur_depuis_imsi

# Deux SIM MTN Cameroun distinctes : même opérateur, même préfixe d'IMSI,
# ICCID différents. C'est exactement le cas que l'opérateur seul ne sait pas
# distinguer.
MTN_A = Carte(iccid="89237010000000000011", imsi="624010000000011")
MTN_B = Carte(iccid="89237010000000000099", imsi="624010000000099")


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
        self.assertIsNone(operateur_depuis_imsi("624"))   # trop court


class TestOperateur(unittest.TestCase):

    def test_sim_mtn_en_itinerance_reste_mtn(self):
        """Le cas réel : SIM MTN Cameroun, essayée depuis la France."""
        c = Carte(iccid="8923701", imsi="624010000000011",
                  reseau="Orange F", itinerance=True)
        self.assertEqual(c.operateur, "MTN")

    def test_meme_carte_arrivee_a_douala(self):
        """Même puce, réseau d'origine retrouvé : rien ne bouge."""
        c = Carte(iccid="8923701", imsi="624010000000011", reseau="MTN CM")
        self.assertEqual(c.operateur, "MTN")

    def test_repli_sur_le_reseau_sans_imsi(self):
        c = Carte(iccid="8923701", imsi="", reseau="MTN CM")
        self.assertEqual(c.operateur, "MTN")

    def test_imsi_inconnu_repli_sur_le_reseau(self):
        c = Carte(iccid="8923701", imsi="999990000000011", reseau="Orange CM")
        self.assertEqual(c.operateur, "Orange")

    def test_operateur_exotique_conserve_son_nom(self):
        c = Carte(iccid="8923701", reseau="Vodacom")
        self.assertEqual(c.operateur, "Vodacom")

    def test_carte_vide(self):
        self.assertEqual(Carte().operateur, "SIM inconnue")


class TestLibelle(unittest.TestCase):

    def test_deux_sim_du_meme_operateur_ne_portent_pas_le_meme_nom(self):
        """Le cœur du problème : sans l'ICCID, ces deux cartes seraient
        toutes deux « MTN », et leurs historiques se confondraient."""
        self.assertEqual(MTN_A.libelle, "MTN ·0011")
        self.assertEqual(MTN_B.libelle, "MTN ·0099")
        self.assertNotEqual(MTN_A.libelle, MTN_B.libelle)

    def test_sans_iccid_le_libelle_se_reduit_a_l_operateur(self):
        self.assertEqual(Carte(imsi="624010000000011").libelle, "MTN")

    def test_masquer(self):
        self.assertEqual(masquer("89237010000000000011"), "·0011")
        self.assertEqual(masquer(""), "?")

    def test_masquer_ne_revele_pas_le_numero_de_serie(self):
        iccid = "89237010000000000011"
        self.assertNotIn(iccid[:10], masquer(iccid))


class TestDescription(unittest.TestCase):

    def test_itinerance_signalee(self):
        c = Carte(iccid="89237010000000000011", imsi="624010000000011",
                  reseau="Orange F", itinerance=True)
        self.assertEqual(c.description, "MTN ·0011 (itinérance sur Orange F)")

    def test_reseau_domestique_sans_mention(self):
        c = Carte(iccid="89237010000000000011", imsi="624010000000011",
                  reseau="MTN CM", itinerance=False)
        self.assertEqual(c.description, "MTN ·0011")


class TestComparaison(unittest.TestCase):

    def test_identifiee(self):
        self.assertTrue(MTN_A.identifiee)
        self.assertFalse(Carte(imsi="624010000000011").identifiee)

    def test_meme_carte(self):
        self.assertTrue(MTN_A.meme_carte(Carte(iccid=MTN_A.iccid)))
        self.assertFalse(MTN_A.meme_carte(MTN_B))

    def test_sans_iccid_on_ne_conclut_pas(self):
        """Répondre « oui » masquerait un changement de carte ; répondre
        « non » déclencherait une fausse alerte à chaque lecture ratée."""
        self.assertIsNone(MTN_A.meme_carte(Carte()))
        self.assertIsNone(Carte().meme_carte(MTN_A))
        self.assertIsNone(MTN_A.meme_carte(None))


if __name__ == "__main__":
    unittest.main()
