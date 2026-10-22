"""LE VIREMENT DES COMMISSIONS MTN — trois SMS, une seule entrée.

Un agent MTN vide son compte des commissions vers son compte principal ; MTN
envoie trois SMS sous le même numéro de transaction (voir
RE_VIREMENT_DES_COMMISSIONS). Sur la vraie base, deux d'entre eux se lisaient
comme des sorties de la carte, et leur « balance: 248 » passait pour le solde
de la carte. Les SMS ci-dessous ont la FORME des vrais ; noms, numéros,
montants et soldes sont inventés.
"""

import unittest
from unittest import mock

from totem import analyse_sms
from totem.analyse_sms import analyser, categoriser, du_compte_des_commissions
from totem.nuage import Nuage

NUMERO_DE_LA_CARTE = "237650112233"
AUTRE_CARTE = "237670445566"

COMPTE_DES_COMMISSIONS_1 = (
    "You have successfully transferred 7300FCFA commisions to your main account "
    "237650112233. Transaction ID: 41000000001. New Account balance: 120FCFA")
COMPTE_DES_COMMISSIONS_2 = (
    "You have transferred 7300 XAF to ESSAI Flash Services (237650112233) from your "
    "mobile money account 51234567 at 2026-08-25 06:04:23 FEES 0 FCFA. Your new "
    "balance: 120 XAF. Message from sender: . Message to receiver: . Financial "
    "Transaction Id: 41000000001. Back-to-School is Here... MoMo Got You!")
COMPTE_PRINCIPAL = (
    "You have received 7300 XAF from ESSAI Flash Services (237650112233) on your mobile "
    "money account at 2026-08-25 06:04:19. Message from sender: . Your new "
    "balance:18450 XAF. Financial Transaction Id: 41000000001.")
VERS_UNE_AUTRE_CARTE = (
    "You have transferred 50000 XAF to ESSAI Flash Services (237670445566) from your "
    "mobile money account 650112233 at 2026-08-25 09:10:00 FEES 0 FCFA. Your new "
    "balance: 9000 XAF. Financial Transaction Id: 41000000002.")


class FauxJournal:
    def __init__(self, numero):
        self.numero = numero

    def numero_de_la_carte(self, iccid):
        return self.numero


def ligne(texte, numero=NUMERO_DE_LA_CARTE):
    nuage = Nuage("", "", "douala", FauxJournal(numero))
    return nuage._ligne_paiement(1, "2026-08-25T06:04:20+01:00", "MobileMoney",
                                 texte, "MTN ·2233", "8923701000000000001")


class TestLeVirementDesCommissions(unittest.TestCase):

    def test_le_compte_des_commissions_qui_parle_est_un_doublon(self):
        self.assertEqual(categoriser(COMPTE_DES_COMMISSIONS_1), "doublon")
        self.assertIsNone(analyser(COMPTE_DES_COMMISSIONS_1))

    def test_temoin_sans_la_regle_c_etait_une_sortie(self):
        jamais = analyse_sms.re.compile(r"(?!x)x")
        with mock.patch.object(analyse_sms, "RE_VIREMENT_DES_COMMISSIONS", jamais):
            self.assertEqual(categoriser(COMPTE_DES_COMMISSIONS_1), "envoi")
            p = analyser(COMPTE_DES_COMMISSIONS_1)
            self.assertEqual((p.sens, p.montant), ("sortie", 7300))

    def test_la_sortie_vers_soi_meme_est_un_doublon_sans_solde(self):
        l = ligne(COMPTE_DES_COMMISSIONS_2)
        self.assertEqual(l["categorie"], "doublon")
        self.assertIsNone(l["solde_apres"], "120 F est le solde des commissions, pas celui de la carte")
        # La lecture brute la prend pour une sortie : c'est la ligne envoyée
        # au nuage qui tranche, avec le numéro de LA carte.
        self.assertEqual(analyser(COMPTE_DES_COMMISSIONS_2).sens, "sortie")

    def test_l_entree_sur_le_compte_principal_reste_une_entree(self):
        l = ligne(COMPTE_PRINCIPAL)
        self.assertEqual((l["categorie"], l["sens"], l["montant"], l["solde_apres"]),
                         ("encaissement", "entree", 7300, 18450))

    def test_un_transfert_vers_une_autre_carte_reste_une_sortie(self):
        l = ligne(VERS_UNE_AUTRE_CARTE)
        self.assertEqual((l["categorie"], l["sens"], l["solde_apres"]), ("envoi", "sortie", 9000))

    def test_sans_le_numero_de_la_carte_on_ne_tranche_pas(self):
        l = ligne(COMPTE_DES_COMMISSIONS_2, numero=None)
        self.assertEqual(l["categorie"], "envoi")
        self.assertFalse(du_compte_des_commissions(analyser(COMPTE_DES_COMMISSIONS_2), "12"))


if __name__ == "__main__":
    unittest.main()
