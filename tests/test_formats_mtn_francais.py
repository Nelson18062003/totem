# -*- coding: utf-8 -*-
"""Les SMS d'argent tels que la vraie base les montre — et ce qu'il faut en compter.

D'OÙ VIENNENT CES TESTS. L'export de la base (31 juillet – 16 octobre 2026,
2 007 SMS) a été relu par le lecteur, gabarit par gabarit :

  - MTN en anglais : 99 % lus ; MTN en FRANÇAIS : 21 %. Le dépôt, le retrait
    et le virement sortant français n'étaient pas compris — le virement,
    terminé par une réclame (« tente de gagner… »), passait même en
    PUBLICITÉ : 23 744 594 F sortis de la caisse sans une ligne ;
  - MTN annonce souvent UNE opération par DEUX SMS, au même numéro de
    transaction. Les seconds avis anglais étaient comptés EN PLUS :
    21 versements, 60 117 932 F d'entrées comptées deux fois ;
  - la commission d'Orange, versée sur un compte à part, entrait dans le
    solde principal : 45 des 46 ruptures de la suite des soldes de la carte
    Orange tombaient, au franc près, sur elle.

Chaque message ci-dessous a la FORME et la LONGUEUR d'un vrai SMS de la base ;
noms et numéros sont inventés. Les noms sont longs, abrégés, chiffrés,
ponctués : ce sont les raisons sociales qui ont les noms longs, et une donnée
d'essai trop sage cache le défaut au lieu de le montrer.

Le témoin : lancés sur le lecteur d'avant, ces tests échouent (voir le
message du commit qui les a ajoutés).
"""

import unittest

from totem.analyse_sms import (analyser, avis_en_double, categoriser,
                               commission_versee)

AGENT = "690000002"

# --- MTN, en français ------------------------------------------------------
DEPOT_FR = (
    "Dépot de 37500 XAF effectué le 2026-10-14 18:49:08 au STE. NOUVELLE "
    "BRASSERIE DU LITTORAL ET DES HAUTS PLATEAUX DE L'OUEST SARL "
    "(237690000003), a été effectué avec succès. Transaction ID:19234400000. "
    "Message:. Votre nouveau solde est de 347203 XAF. Commission ajoutée : "
    "66 XAF.")
RETRAIT_FR = (
    "Le retrait effectué par N A ESSAI NDEFO TAKAM BELLA (237690000004) le "
    "2026-09-19 10:22:50 a été effectué avec succès. Vous pouvez remettre au "
    "client la somme de 500000 XAF en espèces. Transaction ID:18850000000. "
    "Message:. Votre nouveau solde est de 11820690 XAF. Commission ajoutée : "
    "1350 XAF.")
REClAME_FR = (
    " C'est la Rentrée...MoMo Te Gère ! Pour toute transactions d'au moins "
    "5 237 F , tente de gagner chaque jour:  Un Laptop + 50 000 F + une Home "
    "Box. Tape *126*6# ou télécharge la New MoMo App : "
    "link.mtn.cm/NewMoMoAppRef. Infos : 8787 | WhatsApp : 677 55 00 00")
VIREMENT_FR = (
    "Transfert de 13000000 FCFA effectue avec succes a ESSAI GROSSISTE AND CO "
    "7 (237690000005) le 2026-09-19 11:38:39. FRAIS 0 FCFA. transaction Id: "
    "18851100000. Reference: . Nouveau solde est: 5564049 FCFA." + REClAME_FR)
FLOTTE_FR = (
    "Transfert de flotte de 13,000,000 FCFA a ESSAI GROSSISTE AND CO 7 "
    "(237690000005) le 2026-09-19 11:38:39 effectue avec success. Ref "
    "transaction: 18851100000. Nouveau solde: 5,564,049FCFA." + REClAME_FR)
RECU_FR = (
    "Vous avez recu 500000 XAF de ESSAI GROSSISTE SARL 2 (237690000006) sur "
    "votre compte mobile money à 2026-09-18 18:00:25. Message de "
    "l'expéditeur: . Votre nouveau solde: 500000 XAF. FRAIS: FCFA 0. "
    "Financial Transaction Id: 18841100000.")
FLOAT_RECU_FR = (
    "500,000 FCFA de float recu de - 2 (237690000006) sur votre compte le "
    "2026-09-18 18:00:25. Ref transaction: 18841100000. Nouveau solde: - "
    "FCFA.")

# --- MTN, en anglais : les paires -------------------------------------------
RECU_EN = (
    "You have received 5000000 XAF from ESSAI NANA PAUL (237690000007) on your "
    "mobile money account at 2026-10-03 12:10:54. Message from sender: . "
    "Your new balance:10200500 XAF. Financial Transaction Id: 19100000000.")
FLOAT_RECU_EN = (
    "You have received 5,000,000 FCFA from - ESSAI NANA PAUL (237690000007) on "
    "2026-10-03 12:10:54. Transaction Id: 19100000000. New account balance: "
    "- FCFA.")
VIREMENT_EN = (
    "You have transferred 1500000 XAF to ESSAI MBARGA ETOA (237690000008) "
    "from your mobile money account 90000017 at 2026-09-19 20:58:50 FEES 0 "
    "FCFA. Your new balance: 4016232 XAF. Message from sender: . Message to "
    "receiver: . Financial Transaction Id: 18860000000.")
SUCCES_EN = (
    "Successful transfer of 1,500,000 FCFA to ESSAI MBARGA ETOA "
    "(237690000008) at 2026-09-19 20:58:51. Transaction Id: 18860000000. Your "
    "new balance: 4,016,232 FCFA. Back-to-School is Here... MoMo Got You! For "
    "any transactions from XAF 5,237,  stand a chance to win everyday : A "
    "Laptop + XAF 50,000 + a Home Box every day. Dial *126*6# or download the "
    "New MoMo App : link.mtn.cm/NewMoMoAppRef.")
TECHNIQUE = "AMOUNT1,000,000 MSISDN_SENDER237690000009 REASON-"

# --- Orange : la commission, à part ----------------------------------------
COMMISSION_EN = (
    "You received the commission of 1350 FCFA for transaction Cash Out which "
    "is executed from ESSAI, 690000010 to BOUTIQUE ESSAI,690000002.")
COMMISSION_FR = ("Vous avez reÇu commission de 18F pour la transaction Cash in "
                 "faite entre 690000002 et 690000012.")


class LesGuichetsMtnEnFrancais(unittest.TestCase):
    def test_le_depot_chez_le_client_fait_sortir_l_argent(self):
        p = analyser(DEPOT_FR)
        self.assertIsNotNone(p)
        self.assertEqual((p.sens, p.montant), ("sortie", 37500))
        self.assertEqual(p.nom, "STE. NOUVELLE BRASSERIE DU LITTORAL ET DES "
                                "HAUTS PLATEAUX DE L'OUEST SARL")
        self.assertEqual(p.numero, "237690000003")
        self.assertEqual((p.reference, p.solde_apres, p.commission),
                         ("19234400000", 347203, 66))
        self.assertEqual(categoriser(DEPOT_FR), "depot")

    def test_le_retrait_du_client_fait_entrer_l_argent(self):
        p = analyser(RETRAIT_FR)
        self.assertIsNotNone(p)
        # La somme remise au client — pas le solde, pas la commission.
        self.assertEqual((p.sens, p.montant), ("entree", 500000))
        self.assertEqual(p.nom, "N A ESSAI NDEFO TAKAM BELLA")
        self.assertEqual((p.solde_apres, p.commission), (11820690, 1350))
        self.assertEqual(categoriser(RETRAIT_FR), "retrait")

    def test_le_virement_sortant_n_est_pas_une_reclame(self):
        p = analyser(VIREMENT_FR)
        self.assertIsNotNone(p, "13 000 000 F sortis, rangés en publicité")
        self.assertEqual((p.sens, p.montant, p.frais), ("sortie", 13000000, 0))
        self.assertEqual(p.nom, "ESSAI GROSSISTE AND CO 7")
        self.assertEqual((p.reference, p.solde_apres), ("18851100000", 5564049))
        self.assertNotEqual(categoriser(VIREMENT_FR), "publicite")

    def test_la_reclame_seule_reste_une_reclame(self):
        texte = ("Gagnez +25 XAF sur chaque retrait effectué via votre QR Code "
                 "avec l'app MoMo. 10 retraits QR/jour = +250 XAF par jour.")
        self.assertIsNone(analyser(texte))
        self.assertEqual(categoriser(texte), "publicite")


class UneOperationSeCompteUneFois(unittest.TestCase):
    """MTN annonce une opération par deux SMS : on la compte une fois."""

    PAIRES = (
        ("versement reçu, anglais", RECU_EN, FLOAT_RECU_EN, 5000000),
        ("versement reçu, français", RECU_FR, FLOAT_RECU_FR, 500000),
        ("virement sortant, anglais", VIREMENT_EN, SUCCES_EN, 1500000),
        ("virement sortant, français", VIREMENT_FR, FLOTTE_FR, 13000000),
    )

    def test_chaque_paire_compte_une_seule_fois(self):
        for nom, principal, avis, montant in self.PAIRES:
            with self.subTest(nom):
                lus = [p for p in (analyser(principal), analyser(avis)) if p]
                self.assertEqual([p.montant for p in lus], [montant])
                self.assertEqual(categoriser(avis), "doublon")
                self.assertTrue(avis_en_double(avis))
                self.assertFalse(avis_en_double(principal))

    def test_l_avis_technique_est_un_doublon(self):
        self.assertEqual(categoriser(TECHNIQUE), "doublon")
        self.assertIsNone(analyser(TECHNIQUE))

    def test_le_transfert_orange_n_est_pas_un_avis_mtn(self):
        """« Successful transfer FROM » (Orange) n'est pas « Successful
        transfer OF » (l'avis MTN) : un vrai virement, à compter."""
        orange = ("Successful transfer from 690000011 ETS ESSAI to 690000002 "
                  "BOUTIQUE ESSAI. Details: Transaction ID: PP261014.1113.A00001, "
                  "Transaction amount: 10000 FCFA, Charges: 0 FCFA, Commission: "
                  "0 FCFA, Net amount :10000 FCFA, New balance: 2814000.6 FCFA.")
        self.assertFalse(avis_en_double(orange))
        self.assertEqual(analyser(orange).montant, 10000)


class LaCommissionDOrangeEstAPart(unittest.TestCase):
    def test_elle_ne_touche_pas_au_solde_de_la_caisse(self):
        for texte, montant in ((COMMISSION_EN, 1350), (COMMISSION_FR, 18)):
            with self.subTest(texte[:30]):
                self.assertIsNone(analyser(texte))
                self.assertEqual(categoriser(texte), "commission")
                self.assertEqual(commission_versee(texte), montant)

    def test_le_cashout_lui_reste_un_retrait(self):
        cashout = ("CashOut success to 690000010 ESSAI from 690000002 BOUTIQUE "
                   "ESSAI. The details are as follows: transaction amount: "
                   "500000 FCFA, charges: 0 FCFA, commission: 0 FCFA, TXN id "
                   ":CO260807.1433.A00001")
        self.assertEqual(categoriser(cashout), "retrait")
        self.assertEqual(analyser(cashout).montant, 500000)
        self.assertIsNone(commission_versee(cashout))


class UnFormatInconnuSeSignale(unittest.TestCase):
    def test_un_numero_de_transaction_n_est_jamais_une_reclame(self):
        """Un SMS d'opération que le lecteur ne connaît pas, terminé par une
        réclame : il se dit « illisible » — l'alerte part —, il ne disparaît
        pas en publicité."""
        inconnu = ("Operation de 75000 FCFA validee avec succes chez ESSAI "
                   "BOUTIQUE (237690000013). transaction Id: 19300000000." + REClAME_FR)
        self.assertIsNone(analyser(inconnu))
        self.assertEqual(categoriser(inconnu), "illisible")


if __name__ == "__main__":
    unittest.main()
