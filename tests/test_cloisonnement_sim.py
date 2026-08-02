# -*- coding: utf-8 -*-
"""Deux SIM qui se succèdent dans le berceau sont deux comptes.

Le scénario qu'on éprouve ici est celui du quotidien : retirer une puce MTN,
en mettre une autre — MTN aussi — et exiger que les deux caisses restent
séparées. C'est le seul genre de bug qu'on ne remarque pas tout de suite : les
chiffres s'additionnent silencieusement et ne correspondent plus à aucun solde
réel.
"""

import unittest

from totem.carte import Carte
from totem.compte import Compte
from totem.simulator import ModemSimule
from totem.storage import Journal

MTN_A = "89237010000000000011"
MTN_B = "89237010000000000099"
IMSI_MTN = "624010000000011"

RECU_25K = ("Vous avez recu 25 000 FCFA de NGONO Marie (677123456). "
            "Nouveau solde : 100 000 FCFA.")
RECU_5K = ("Vous avez recu 5 000 FCFA de TCHOUMI Paul (699887766). "
           "Nouveau solde : 40 000 FCFA.")


class TestRegistreDesCartes(unittest.TestCase):

    def setUp(self):
        self.journal = Journal(":memory:")

    def test_premiere_vue_puis_carte_connue(self):
        carte = Carte(iccid=MTN_A, imsi=IMSI_MTN)
        self.assertEqual(self.journal.voir_carte(carte), "nouvelle")
        self.assertEqual(self.journal.voir_carte(carte), "connue")

    def test_sans_iccid_rien_n_est_enregistre(self):
        self.assertEqual(self.journal.voir_carte(Carte(imsi=IMSI_MTN)), "inconnue")
        self.assertEqual(self.journal.cartes(), [])

    def test_le_numero_declare_survit_au_recensement(self):
        # C1 : le propriétaire déclare un numéro ; le recensement suivant (le
        # robot relit la puce toutes les 60 s, numéro vide sur une prépayée) ne
        # doit PAS l'effacer — c'est la donnée qui tranche le sens des dépôts.
        carte = Carte(iccid=MTN_A, imsi=IMSI_MTN)      # prépayée : pas de numéro
        self.journal.voir_carte(carte)
        self.journal.definir_identite(MTN_A, numero="696103864")
        self.journal.voir_carte(carte)                 # un tour de recensement
        self.assertEqual(self.journal.identite(MTN_A)[0], "696103864")
        self.assertIn("696103864", self.journal.numeros_declares())

    def test_un_numero_lu_sur_la_puce_est_enregistre(self):
        # L'inverse doit rester vrai : si la puce déclare un numéro, on le garde.
        self.journal.voir_carte(Carte(iccid=MTN_A, imsi=IMSI_MTN, numero="650000000"))
        self.assertEqual(self.journal.identite(MTN_A)[0], "650000000")

    def test_une_carte_retiree_puis_remise_reste_la_meme_ligne(self):
        a = Carte(iccid=MTN_A, imsi=IMSI_MTN)
        b = Carte(iccid=MTN_B, imsi=IMSI_MTN)
        self.journal.voir_carte(a)
        self.journal.voir_carte(b)
        self.assertEqual(self.journal.voir_carte(a), "connue")
        self.assertEqual(len(self.journal.cartes()), 2)

    def test_le_registre_compte_les_encaissements_par_carte(self):
        self.journal.voir_carte(Carte(iccid=MTN_A, imsi=IMSI_MTN))
        self.journal.voir_carte(Carte(iccid=MTN_B, imsi=IMSI_MTN))
        self.journal.sms("MobileMoney", RECU_25K, "MTN ·0011", MTN_A)
        self.journal.sms("MobileMoney", RECU_5K, "MTN ·0099", MTN_B)
        par_carte = {iccid: (nb, total)
                     for iccid, _, _, _, _, _, nb, total in self.journal.cartes()}
        self.assertEqual(par_carte[MTN_A], (1, 25000))
        self.assertEqual(par_carte[MTN_B], (1, 5000))


class TestCloisonnement(unittest.TestCase):

    def setUp(self):
        self.journal = Journal(":memory:")
        self.journal.sms("MobileMoney", RECU_25K, "MTN ·0011", MTN_A)
        self.journal.sms("MobileMoney", RECU_5K, "MTN ·0099", MTN_B)

    def test_le_rapport_ne_melange_pas_les_deux_caisses(self):
        nb, total, _ = self.journal.rapport_du_jour([MTN_A])
        self.assertEqual((nb, total), (1, 25000))
        nb, total, _ = self.journal.rapport_du_jour([MTN_B])
        self.assertEqual((nb, total), (1, 5000))

    def test_deux_cartes_en_place_se_cumulent(self):
        """Avec deux modems, le bilan du jour doit couvrir les deux : n'en
        montrer qu'un ferait disparaître les recettes de l'autre."""
        nb, total, _ = self.journal.rapport_du_jour([MTN_A, MTN_B])
        self.assertEqual((nb, total), (2, 30000))

    def test_sans_filtre_tout_est_visible(self):
        nb, total, _ = self.journal.rapport_du_jour()
        self.assertEqual((nb, total), (2, 30000))

    def test_les_sms_sont_filtres_aussi(self):
        lignes = self.journal.derniers_sms(10, [MTN_A])
        self.assertEqual(len(lignes), 1)
        self.assertIn("25 000", lignes[0][2])

    def test_export_csv_filtre_et_porte_la_carte(self):
        csv = self.journal.export_csv(7, [MTN_B]).decode("utf-8-sig")
        self.assertIn(MTN_B, csv)
        self.assertNotIn(MTN_A, csv)
        self.assertIn("carte", csv.splitlines()[0])

    def test_les_lignes_anterieures_restent_visibles(self):
        """Les SMS enregistrés avant le cloisonnement n'ont pas d'ICCID. Les
        masquer donnerait l'impression d'un historique amputé."""
        self.journal.sms("MobileMoney", RECU_5K, "MTN")   # sans carte
        nb, total, _ = self.journal.rapport_du_jour([MTN_A])
        self.assertEqual((nb, total), (2, 30000))


class TestChangementDeCarte(unittest.TestCase):
    """Le remplacement physique de la puce, vu depuis le compte."""

    def setUp(self):
        self.modem = ModemSimule("MTN")
        self.compte = Compte(self.modem, carte=Carte(iccid=MTN_A, imsi=IMSI_MTN))

    def test_carte_inchangee_ne_signale_rien(self):
        self.modem.changer_de_carte(MTN_A)
        self.assertIsNone(self.compte.relire_carte())

    def test_echange_de_puce_rend_l_ancienne(self):
        self.modem.changer_de_carte(MTN_B, imsi=IMSI_MTN)
        ancienne = self.compte.relire_carte()
        self.assertIsNotNone(ancienne)
        self.assertEqual(ancienne.iccid, MTN_A)
        self.assertEqual(self.compte.carte.iccid, MTN_B)

    def test_le_libelle_suit_la_nouvelle_carte(self):
        self.modem.changer_de_carte(MTN_B, imsi=IMSI_MTN)
        self.compte.relire_carte()
        self.assertEqual(self.compte.libelle, "MTN ·0099")

    def test_changement_d_operateur(self):
        self.modem.changer_de_carte("89237020000000000022",
                                    imsi="624020000000022")
        self.compte.relire_carte()
        self.assertEqual(self.compte.carte.operateur, "Orange")

    def test_iccid_illisible_ne_conclut_a_rien(self):
        """Une lecture ratée ne doit ni alerter, ni faire basculer le journal
        vers un compte fantôme."""
        self.modem.changer_de_carte("")
        self.assertIsNone(self.compte.relire_carte())
        self.assertEqual(self.compte.carte.iccid, MTN_A)

    def test_premiere_identification_n_est_pas_un_echange(self):
        """Modem dont l'ICCID était illisible au démarrage : la première
        lecture réussie remplit la fiche, elle ne signale pas un remplacement."""
        compte = Compte(ModemSimule("MTN"), libelle="MTN")
        self.assertIsNone(compte.relire_carte())
        self.assertTrue(compte.carte.identifiee)


if __name__ == "__main__":
    unittest.main()
