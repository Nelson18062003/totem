# -*- coding: utf-8 -*-
"""Tests de lecture des SMS Mobile Money.

Les formulations ci-dessous reprennent celles rencontrées chez MTN Cameroun et
Orange Cameroun, avec leurs variantes : accents présents ou absents (contrainte
GSM), montants espacés ou collés, nom parfois donné, parfois seulement le
numéro, référence sous des étiquettes différentes.

Lancer :  python3 -m unittest discover -s tests
"""

import unittest

from totem.analyse_sms import (analyser, categoriser, code_a_usage_unique,
                               formater_montant, solde_annonce)

# Le vrai SMS d'Orange Money, relevé sur les captures du propriétaire en
# juillet 2026. Il sert de référence à tout ce fichier : c'est lui qu'il faut
# continuer à comprendre, pas une reformulation commode.
TRANSFERT_ORANGE = (
    "Transfert de 656483918 PRIX MONO SARL vers 696103864 WONDER PHONE reussi. "
    "Details: ID transaction: PP260731.1319.B45805, "
    "Montant Transaction: 184137FCFA, Frais: 0 FCFA, Commission: 0 FCFA, "
    "Montant Net: 184137 FCFA, Nouveau Solde: 2784137.6 FCFA")


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

    def test_mtn_sent_anglais(self):
        p = analyser("You have sent 15000 FCFA to KAMDEM Paul (699112233). "
                     "Fee: 100 FCFA. New balance: 5000 FCFA")
        self.assertEqual(p.sens, "sortie")
        self.assertEqual(p.montant, 15000)
        self.assertEqual(p.nom, "KAMDEM Paul")

    def test_mtn_cash_in_anglais(self):
        p = analyser("Cash In of 40000 FCFA. Your balance is 60000 FCFA.")
        self.assertEqual(p.sens, "entree")
        self.assertEqual(p.montant, 40000)


class TestOperationAgent(unittest.TestCase):
    """Dépôts et retraits d'agent : le bénéficiaire est nommé APRÈS « vers »
    (numéro d'abord, nom ensuite), et l'émetteur parfois en fin de message.
    Avant correction, ces SMS tombaient en « message quelconque » et le nom
    comme le numéro du client ne s'affichaient nulle part."""

    DEPOT = ("Depot de 50000 FCFA vers 690933686 NGANGOM NOUBEWE reussi "
             "from 80684177. Frais: 0 FCFA, Nouveau Solde: 2768937.6 FCFA")

    def test_les_deux_parties_sont_lues(self):
        p = analyser(self.DEPOT)
        self.assertIsNotNone(p)
        self.assertEqual(p.montant, 50000)
        self.assertEqual(p.beneficiaire.numero, "690933686")
        self.assertEqual(p.beneficiaire.nom, "NGANGOM NOUBEWE")
        self.assertEqual(p.emetteur.numero, "80684177")

    def test_sens_tranche_par_ma_carte(self):
        # 80684177 est une de mes SIM : le dépôt part de chez moi → sortie,
        # et le tiers affiché est l'autre partie, avec son numéro.
        p = analyser(self.DEPOT, numeros=["80684177"])
        self.assertEqual(p.sens, "sortie")
        self.assertEqual(p.nom, "NGANGOM NOUBEWE")
        self.assertEqual(p.numero, "690933686")

    def test_un_seul_tiers_nomme_reste_affichable(self):
        # Retrait sans émetteur cité : on ne tranche pas le sens, mais le nom
        # et le numéro du client restent visibles (plus jamais « Inconnu »).
        p = analyser("Retrait de 30000 FCFA vers 690933686 NGANGOM NOUBEWE "
                     "effectue. Frais: 300 FCFA")
        self.assertEqual(p.montant, 30000)
        self.assertIn("NGANGOM NOUBEWE", p.tiers)
        self.assertIn("690933686", p.tiers)

    def test_sans_montant_lisible_on_ninvente_pas(self):
        # Aucun montant de transaction (que des frais et un solde) : la règle
        # d'or interdit d'inventer, le SMS reste affiché tel quel.
        p = analyser("Depot vers 690933686 NGANGOM NOUBEWE reussi from 80684177. "
                     "Frais: 0 FCFA, Nouveau Solde: 2768937.6 FCFA")
        self.assertIsNone(p)

    def test_operation_echouee_nest_pas_un_paiement(self):
        self.assertIsNone(analyser(
            "Depot de 50000 FCFA vers 690933686 NGANGOM NOUBEWE echoue. "
            "Solde insuffisant."))

    # Le vrai SMS de dépôt reçu en production, avec ses deux parties nommées,
    # son montant dans les champs détaillés, sa référence et son solde.
    VRAI_DEPOT = (
        "Depot vers 690933686 NGANGOM NOUBEWE reussi from 696103864 WONDER "
        "PHONE. Informations detaillees : Montant transaction : 10000FCFA, "
        "ID de Transaction : CI260801.1355.D50164, Frais : 0FCFA, Commission "
        ": 0 FCFA, Montant Net Debite : 10000FCFA, Nouveau Solde : 2773937.6FCFA.")

    def test_vrai_depot_de_production(self):
        p = analyser(self.VRAI_DEPOT)
        self.assertEqual(p.montant, 10000)
        self.assertEqual(p.reference, "CI260801.1355.D50164")
        self.assertEqual(p.frais, 0)
        self.assertEqual(p.solde_apres, 2773937.6)
        self.assertEqual(p.emetteur.nom, "WONDER PHONE")        # majuscules gardées
        self.assertEqual(p.emetteur.numero, "696103864")
        self.assertEqual(p.beneficiaire.nom, "NGANGOM NOUBEWE")
        self.assertEqual(p.beneficiaire.numero, "690933686")

    def test_vrai_depot_sens_selon_ma_carte(self):
        # WONDER PHONE (696103864) dépose vers le client : l'argent sort de
        # ma carte, et c'est le client qu'on affiche en face.
        p = analyser(self.VRAI_DEPOT, numeros=["696103864"])
        self.assertEqual(p.sens, "sortie")
        self.assertEqual(p.nom, "NGANGOM NOUBEWE")
        self.assertEqual(p.numero, "690933686")


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


class TestCategoriser(unittest.TestCase):
    """La catégorie d'un SMS, pour la boîte de réception. Un paiement est
    toujours tranché AVANT la publicité : un motif de réclame ne doit jamais
    requalifier un vrai encaissement."""

    MIENS = ["696103864"]

    def c(self, texte):
        return categoriser(texte, numeros=self.MIENS)

    def test_depot(self):
        self.assertEqual(self.c(
            "Depot vers 690933686 NGANGOM NOUBEWE reussi from 696103864 WONDER "
            "PHONE. Montant transaction : 10000FCFA"), "depot")

    def test_transfert(self):
        self.assertEqual(self.c(
            "Transfert de 696103864 WONDER PHONE vers 697457589 NKENGAFAC "
            "reussi. Montant Net: 100 FCFA"), "transfert")

    def test_retrait(self):
        self.assertEqual(self.c("Vous avez retire 30000 FCFA chez AGENT"), "retrait")

    def test_encaissement(self):
        self.assertEqual(self.c(
            "Vous avez recu 25000 FCFA de NGONO Marie (677123456)"), "encaissement")

    def test_solde(self):
        self.assertEqual(self.c("Le solde de votre compte est de 2773937.6FCFA."),
                         "solde")

    def test_code(self):
        self.assertEqual(self.c("Le code de 696103864 est: 515318. Merci."), "code")

    def test_publicite(self):
        self.assertEqual(self.c(
            "Entre nous, c'est l'amour fou! 2 millions a gagner chaque jour "
            "avec Orange Money! Tape #150*0#"), "publicite")

    def test_message_quelconque(self):
        self.assertEqual(self.c("Salut, tu es dispo demain ?"), "message")

    def test_vide(self):
        self.assertEqual(self.c(""), "message")
        self.assertEqual(categoriser(None), "message")


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

    def test_le_tiers_inconnu_suit_la_langue(self):
        from totem import textes
        from totem.analyse_sms import Partie
        self.assertEqual(str(Partie()), "Unknown")
        textes.definir_langue("fr")
        try:
            self.assertEqual(str(Partie()), "Inconnu")
        finally:
            textes.definir_langue("en")

    def test_nombre_demesure_ne_leve_jamais(self):
        # Un SMS trafiqué avec des milliers de chiffres ferait lever « int »
        # ou « 10 ** n ». analyser() doit renvoyer None, jamais planter.
        for taille in (309, 4400):
            enorme = "9" * taille + " FCFA"
            self.assertIsNone(analyser(f"Vous avez recu {enorme} de Marie"))


class TestTransfertOrange(unittest.TestCase):
    """La forme réelle d'Orange Money : elle nomme les deux parties et
    détaille l'opération. Avant correction, `analyser()` renvoyait None et
    aucun reçu n'aurait jamais pu se déclencher."""

    def test_champ_par_champ(self):
        p = analyser(TRANSFERT_ORANGE)
        self.assertIsNotNone(p)
        self.assertEqual(p.emetteur.numero, "656483918")
        self.assertEqual(p.emetteur.nom, "PRIX MONO SARL")
        self.assertEqual(p.beneficiaire.numero, "696103864")
        self.assertEqual(p.beneficiaire.nom, "WONDER PHONE")
        self.assertEqual(p.reference, "PP260731.1319.B45805")
        self.assertEqual(p.montant_brut, 184137)
        self.assertEqual(p.frais, 0)
        self.assertEqual(p.commission, 0)
        self.assertEqual(p.montant, 184137)        # le Montant Net d'Orange
        self.assertEqual(p.solde_apres, 2784137.6)

    def test_le_sens_reste_inconnu_sans_notre_numero(self):
        """Le SMS dit qui envoie et qui reçoit, pas laquelle des deux lignes
        est la nôtre. Trancher au hasard inverserait le libellé du reçu."""
        p = analyser(TRANSFERT_ORANGE)
        self.assertIsNone(p.sens)
        self.assertFalse(p.sens_connu)

    def test_sens_encaissement(self):
        p = analyser(TRANSFERT_ORANGE, numeros=["696103864"])
        self.assertEqual(p.sens, "entree")
        self.assertEqual(p.nom, "PRIX MONO SARL")    # le tiers, c'est l'autre
        self.assertEqual(p.numero, "656483918")

    def test_sens_envoi(self):
        p = analyser(TRANSFERT_ORANGE, numeros=["+237656483918"])
        self.assertEqual(p.sens, "sortie")
        self.assertEqual(p.nom, "WONDER PHONE")

    def test_numero_etranger_ne_tranche_rien(self):
        p = analyser(TRANSFERT_ORANGE, numeros=["677000000"])
        self.assertIsNone(p.sens)

    def test_transfert_echoue_nest_pas_un_paiement(self):
        self.assertIsNone(analyser(
            "Transfert de 656483918 PRIX MONO SARL vers 696103864 WONDER "
            "PHONE echoue. Solde insuffisant."))

    def test_sans_les_noms(self):
        p = analyser("Transfert de 656483918 vers 696103864 reussi. "
                     "Montant Net: 5000 FCFA")
        self.assertEqual(p.montant, 5000)
        self.assertEqual(p.emetteur.numero, "656483918")
        self.assertIsNone(p.emetteur.nom)

    def test_le_texte_reste_intact(self):
        self.assertEqual(analyser(TRANSFERT_ORANGE).texte, TRANSFERT_ORANGE)


class TestTransfertOrangeAnglais(unittest.TestCase):
    """La même forme d'Orange, la ligne réglée en anglais chez l'opérateur.

    Texte relevé sur une vraie capture de production (août 2026) : le mot de
    réussite vient AVANT le verbe, les parties après « from » et « to », et
    les champs s'appellent Transaction amount / Charges / Net amount /
    New balance.
    """

    TEXTE = ("Successful transfer from 696413104 IBRAHIM DAHIROU to "
             "696103864 WONDER PHONE. Details: Transaction ID: "
             "PP260805.1402.C55918, Transaction amount: 1300000 FCFA, "
             "Charges: 0 FCFA, Commission: 0 FCFA, Net amount :1300000 FCFA, "
             "New balance: 6335788.6 FCFA.")

    def test_tout_est_lu(self):
        p = analyser(self.TEXTE, numeros=("696103864",))
        self.assertIsNotNone(p)
        self.assertEqual(p.sens, "entree")
        self.assertEqual(p.montant, 1300000)
        self.assertEqual(p.reference, "PP260805.1402.C55918")
        self.assertEqual(p.solde_apres, 6335788.6)
        self.assertEqual(p.frais, 0)
        self.assertEqual(p.emetteur.nom, "IBRAHIM DAHIROU")
        self.assertEqual(p.emetteur.numero, "696413104")
        self.assertEqual(p.beneficiaire.nom, "WONDER PHONE")

    def test_categorise_transfert_pas_solde(self):
        """Le bug vécu : « New balance » faisait passer tout le transfert
        pour une interrogation de solde."""
        self.assertEqual(categoriser(self.TEXTE), "transfert")
        self.assertIsNone(solde_annonce(self.TEXTE))

    def test_la_reussite_en_fin_de_phrase(self):
        texte = ("Transfer of 50000 FCFA from 655001122 to 696103864 "
                 "WONDER PHONE successful. Transaction ID: AB12.CD34.")
        p = analyser(texte, numeros=("696103864",))
        self.assertIsNotNone(p)
        self.assertEqual((p.sens, p.montant, p.reference),
                         ("entree", 50000, "AB12.CD34"))

    def test_sans_mot_de_reussite_rien(self):
        texte = ("Transfer from 655001122 to 696103864 failed. "
                 "Insufficient balance.")
        self.assertIsNone(analyser(texte))
        self.assertIsNone(solde_annonce(texte))

    def test_depot_et_retrait_anglais(self):
        depot = ("Deposit of 50000 FCFA to 690933686 NGANGOM NOUBEWE "
                 "successful from 80684177 AGENT SNC. New balance: 150000 FCFA.")
        self.assertEqual(categoriser(depot), "depot")
        p = analyser(depot)
        self.assertEqual((p.montant, p.solde_apres), (50000, 150000))
        retrait = ("Withdrawal of 25000 FCFA to 690933686 NGANGOM NOUBEWE "
                   "completed. Fees: 500 FCFA.")
        self.assertEqual(categoriser(retrait), "retrait")
        q = analyser(retrait)
        self.assertEqual((q.montant, q.frais), (25000, 500))

    def test_le_solde_anglais_reste_un_solde(self):
        texte = "The balance of your account is 5035788.6FCFA."
        self.assertEqual(categoriser(texte), "solde")
        self.assertEqual(solde_annonce(texte), 5035788.6)


class TestVerbesAnglais(unittest.TestCase):
    """Les tournures anglaises de MTN et d'Orange, hors transfert détaillé."""

    def test_recu_anglais(self):
        texte = ("You have received 25000 FCFA from NGONO Marie (677123456). "
                 "Transaction ID: 1234567890. New balance: 50000 FCFA.")
        p = analyser(texte)
        self.assertEqual((p.sens, p.montant), ("entree", 25000))
        self.assertEqual((p.nom, p.numero), ("NGONO Marie", "677123456"))
        self.assertEqual(p.solde_apres, 50000)
        self.assertEqual(categoriser(texte), "encaissement")

    def test_credite_anglais(self):
        texte = "Your account has been credited 5000 FCFA from 670000001."
        p = analyser(texte)
        self.assertEqual((p.sens, p.montant), ("entree", 5000))

    def test_paye_anglais(self):
        texte = "You have paid 10000 FCFA to SHOP XYZ. Fees: 100 FCFA."
        p = analyser(texte)
        self.assertEqual((p.sens, p.montant, p.frais), ("sortie", 10000, 100))
        self.assertEqual(categoriser(texte), "envoi")

    def test_transfere_anglais(self):
        texte = "You have transferred 15000 FCFA to 699112233 JOHN DOE."
        p = analyser(texte)
        self.assertEqual((p.sens, p.montant), ("sortie", 15000))

    def test_retire_anglais(self):
        texte = "You have withdrawn 20000 FCFA. New balance: 5000 FCFA."
        p = analyser(texte)
        self.assertEqual((p.sens, p.montant, p.solde_apres),
                         ("sortie", 20000, 5000))


class TestBruitAnglais(unittest.TestCase):
    """Publicités, codes et pièges anglophones : rien ne devient un paiement."""

    def test_la_reclame_ne_paie_pas(self):
        pub = "Congratulations! You have won 2,000,000 FCFA with Orange Money!"
        self.assertIsNone(analyser(pub))
        self.assertEqual(categoriser(pub), "publicite")

    def test_le_forfait_reste_une_reclame(self):
        pub = "Win big! Buy a data bundle today and get free airtime."
        self.assertIsNone(analyser(pub))
        self.assertEqual(categoriser(pub), "publicite")

    def test_le_code_anglais_est_range_mais_jamais_modifie(self):
        # Un code à usage unique est RANGÉ dans la catégorie « code » (une
        # icône, pas de reçu). Mais le SMS n'est PAS modifié : le
        # propriétaire reçoit son code en entier — c'est le sien.
        code = "Your one-time password is 481516. Do not share it."
        self.assertEqual(categoriser(code), "code")
        self.assertTrue(code_a_usage_unique(code))

    def test_une_entreprise_nommee_win_paie_quand_meme(self):
        """« win » est un mot de réclame, mais WIN TELECOM est un client :
        le rejet du bruit ne doit jamais tuer un vrai transfert."""
        texte = ("Successful transfer from 655001122 WIN TELECOM to "
                 "696103864 WONDER PHONE. Net amount :5000 FCFA, "
                 "New balance: 100000 FCFA.")
        p = analyser(texte, numeros=("696103864",))
        self.assertIsNotNone(p)
        self.assertEqual(p.montant, 5000)
        self.assertEqual(p.emetteur.nom, "WIN TELECOM")


class TestSeparateurDecimal(unittest.TestCase):
    """Le point sépare des milliers dans « 1.250.000 » et des décimales dans
    « 2784137.6 ». La confusion lisait le solde dix fois trop grand."""

    def test_solde_decimal(self):
        self.assertEqual(analyser(TRANSFERT_ORANGE).solde_apres, 2784137.6)

    def test_pas_dix_fois_trop_grand(self):
        self.assertNotEqual(analyser(TRANSFERT_ORANGE).solde_apres, 27841376)

    def test_milliers_toujours_compris(self):
        p = analyser("Vous avez recu 1.250.000 FCFA de ABENA Rose (690334455)")
        self.assertEqual(p.montant, 1250000)

    def test_un_montant_rond_reste_entier(self):
        """Les sommes du bilan, l'export et le cloud n'ont pas à changer de
        type pour un montant qui n'a jamais eu de décimale."""
        self.assertIsInstance(analyser(TRANSFERT_ORANGE).montant, int)

    def test_formatage(self):
        """Anglais par défaut : virgule pour les milliers, point décimal."""
        self.assertEqual(formater_montant(0), "0")
        self.assertEqual(formater_montant(184137), "184,137")
        self.assertEqual(formater_montant(2784137.6), "2,784,137.6")
        self.assertEqual(formater_montant(999.5), "999.5")

    def test_formatage_francais(self):
        """La forme camerounaise : espace pour les milliers, virgule décimale.
        Par le paramètre ponctuel comme par la langue du robot."""
        self.assertEqual(formater_montant(184137, langue="fr"), "184 137")
        self.assertEqual(formater_montant(2784137.6, langue="fr"), "2 784 137,6")
        from totem import textes
        textes.definir_langue("fr")
        try:
            self.assertEqual(formater_montant(999.5), "999,5")
        finally:
            textes.definir_langue("en")


class TestSoldeSeul(unittest.TestCase):
    """« Le solde de votre compte est de 2784137.6FCFA. » — ni référence, ni
    horodatage. C'est la réponse à une interrogation USSD."""

    def test_solde_lu(self):
        self.assertEqual(
            solde_annonce("Le solde de votre compte est de 2784137.6FCFA."),
            2784137.6)

    def test_un_paiement_nest_pas_une_interrogation_de_solde(self):
        self.assertIsNone(solde_annonce(TRANSFERT_ORANGE))
        self.assertIsNone(solde_annonce(
            "Vous avez recu 25 000 FCFA de NGONO Marie (677123456). "
            "Nouveau solde: 872 500 FCFA."))

    def test_ni_publicite_ni_code(self):
        self.assertIsNone(solde_annonce(
            "PROMO! Solde de bonus 1000 FCFA offert !"))
        self.assertIsNone(solde_annonce(
            "Le code de 696103864 est: 515318.Orange Money vous remercie."))


class TestCodeAUsageUnique(unittest.TestCase):
    """Un code à usage unique ne doit ni devenir un reçu, ni être archivé en
    clair, ni être relayé tel quel."""

    CODE = "Le code de 696103864 est: 515318.Orange Money vous remercie."

    def test_reconnu(self):
        self.assertTrue(code_a_usage_unique(self.CODE))

    def test_nest_pas_un_paiement(self):
        self.assertIsNone(analyser(self.CODE))

    def test_le_code_est_reconnu_mais_le_sms_reste_entier(self):
        # On ne masque plus RIEN : le SMS du propriétaire, code compris, se
        # lit tel qu'il est arrivé. `code_a_usage_unique` sert seulement à le
        # RANGER (catégorie « code », pas de reçu), jamais à le cacher.
        self.assertTrue(code_a_usage_unique(self.CODE))
        self.assertEqual(categoriser(self.CODE), "code")

    def test_un_encaissement_avec_le_mot_code_reste_un_paiement(self):
        """Un encaissement qui contient le mot « code » (« Code marchand »)
        n'est pas pris pour un code à usage unique : il reste un paiement,
        lisible en entier."""
        sms = ("Vous avez recu 25 000 FCFA de NGONO Marie (677123456). "
               "Code marchand: 4455. Nouveau solde: 872 500 FCFA.")
        self.assertFalse(code_a_usage_unique(sms))
        self.assertEqual(analyser(sms).montant, 25000)

    def test_autres_tournures(self):
        self.assertTrue(code_a_usage_unique("Votre code OTP: 483920"))
        self.assertTrue(code_a_usage_unique(
            "Votre code de verification est 123456. Ne partagez ce code."))

    def test_un_message_ordinaire_nest_pas_un_secret(self):
        self.assertFalse(code_a_usage_unique("Bonjour, es-tu disponible ?"))
        self.assertFalse(code_a_usage_unique(TRANSFERT_ORANGE))


class TestLaReference(unittest.TestCase):
    """Une fausse référence est pire qu'aucune : elle sert de garde-fou contre
    les doublons, et deux paiements qui la partagent n'en produisent qu'un."""

    def test_la_vraie_capture(self):
        self.assertEqual(analyser(TRANSFERT_ORANGE).reference,
                         "PP260731.1319.B45805")

    def test_le_mot_transaction_nest_jamais_une_reference(self):
        """Trop courte pour le motif, la référence faisait reculer
        l'expression sur « id » — qui capturait le mot « transaction ». Deux
        transferts recevaient alors la même, et le second perdait son reçu."""
        a = analyser("Transfert de 656483918 A vers 696103864 B reussi. "
                     "Details: ID transaction: PP1, Montant Net: 100 FCFA")
        b = analyser("Transfert de 656483918 A vers 696103864 B reussi. "
                     "Details: ID transaction: XY2, Montant Net: 200 FCFA")
        self.assertNotEqual(a.reference, "transaction")
        self.assertIsNone(a.reference)
        self.assertNotEqual((a.reference, b.reference), ("transaction",) * 2)

    def test_les_autres_formes_restent_comprises(self):
        self.assertEqual(
            analyser("Vous avez recu 25 000 FCFA de NGONO Marie (677123456). "
                     "Ref: PP250730.0947.A12345.").reference,
            "PP250730.0947.A12345")
        self.assertEqual(
            analyser("Orange Money: Vous avez recu 35000 F CFA de 655128899. "
                     "Reference OM0112.E11223.").reference,
            "OM0112.E11223")


if __name__ == "__main__":
    unittest.main()


class TestCashOutAnglais(unittest.TestCase):
    """Le retrait d'agent en anglais — relevé sur une vraie capture.

    Ce message échappait à TOUS les motifs et retombait en « message
    quelconque » : ni montant, ni tiers, ni reçu possible. C'est le genre de
    silence qui ne se voit pas — le SMS s'affiche, il a l'air normal, et il
    n'est simplement compté nulle part.

    Deux causes se cumulaient : « cashout » n'était dans aucune liste de
    verbes d'opération, et le mot de réussite vient AVANT « to », alors que
    tous les motifs existants l'attendaient après le bénéficiaire.
    """

    REEL = ("CashOut success to 693377266 MANGA from 696103864 WONDER PHONE. "
            "The details are as follows: transaction amount: 500000 FCFA, "
            "charges: 0 FCFA, commission: 0 FCFA, TXN id :CO260808.1609.D57821")

    def test_le_message_est_enfin_compris(self):
        self.assertIsNotNone(analyser(self.REEL),
                             "ce SMS ne doit plus retomber en « message »")

    def test_le_montant(self):
        self.assertEqual(analyser(self.REEL).montant, 500000)

    def test_les_deux_parties_dans_le_bon_sens(self):
        """L'ordre est l'inverse du transfert anglais : le bénéficiaire suit
        « to », l'émetteur suit « from »."""
        p = analyser(self.REEL)
        self.assertEqual(p.beneficiaire.numero, "693377266")
        self.assertEqual(p.beneficiaire.nom, "MANGA")
        self.assertEqual(p.emetteur.numero, "696103864")
        self.assertEqual(p.emetteur.nom, "WONDER PHONE")

    def test_la_reference(self):
        self.assertEqual(analyser(self.REEL).reference, "CO260808.1609.D57821")

    def test_frais_et_commission_nuls_sont_lus_comme_tels(self):
        p = analyser(self.REEL)
        self.assertEqual(p.frais, 0)
        self.assertEqual(p.commission, 0)

    def test_le_sens_reste_indetermine_sans_nos_numeros(self):
        """Le SMS nomme les deux parties sans dire laquelle est la nôtre.
        Deviner ici retournerait le libellé du reçu."""
        self.assertIsNone(analyser(self.REEL).sens)

    def test_le_sens_se_tranche_avec_nos_numeros(self):
        p = analyser(self.REEL, numeros=["696103864"])
        self.assertEqual(p.sens, "sortie")
        self.assertEqual(p.tiers, "MANGA")

    def test_vu_de_l_autre_cote_c_est_une_entree(self):
        p = analyser(self.REEL, numeros=["693377266"])
        self.assertEqual(p.sens, "entree")
        self.assertEqual(p.tiers, "WONDER PHONE")

    def test_la_categorie_est_un_retrait(self):
        self.assertEqual(categoriser(self.REEL), "retrait")

    def test_le_depot_symetrique(self):
        depot = self.REEL.replace("CashOut", "CashIn")
        self.assertIsNotNone(analyser(depot))
        self.assertEqual(categoriser(depot), "depot")

    def test_un_cashout_echoue_n_est_pas_un_mouvement(self):
        """Sans mot de réussite, rien ne doit être compté."""
        echec = self.REEL.replace("CashOut success to", "CashOut failed to")
        p = analyser(echec)
        if p is not None:
            self.assertIsNone(p.emetteur, "un échec ne nomme pas de parties")

    def test_ce_n_est_pas_pris_pour_une_interrogation_de_solde(self):
        self.assertIsNone(solde_annonce(self.REEL))


class TestReleveMoMoParSms(unittest.TestCase):
    """MTN, en itinérance, répond au relevé PAR SMS — l'USSD ne passe pas.

    Le message porte deux montants, mais chacun est étiqueté : le
    porte-monnaie fait foi, jamais le crédit d'appel. C'est la seule
    exception admise à « deux champs d'argent = refus », et elle ne joue
    que sur l'étiquette explicite « Mobile Money »."""

    RELEVE = "Mobile Money Balance: 0 FCFA. Airtime balance: 7,943FCFA."

    def test_le_solde_momo_etiquete_fait_foi(self):
        self.assertEqual(solde_annonce(self.RELEVE), 0)

    def test_un_solde_non_nul_se_lit_aussi(self):
        self.assertEqual(
            solde_annonce("Mobile Money Balance: 12,500 FCFA. "
                          "Airtime balance: 500FCFA."),
            12500)

    def test_la_categorie_est_un_solde_pas_une_reclame(self):
        # « airtime » sent la réclame (RE_PUB) ; l'étiquette MoMo tranche
        # avant — ce SMS finissait rangé « publicité », sans reçu possible.
        self.assertEqual(categoriser(self.RELEVE), "solde")

    def test_un_transfert_qui_cite_le_solde_momo_reste_un_transfert(self):
        self.assertIsNone(solde_annonce(
            "Transfert reussi de 5000 FCFA vers 677123456. "
            "Mobile Money balance: 12,000 FCFA."))

    def test_un_echec_qui_cite_le_solde_momo_reste_un_echec(self):
        self.assertIsNone(solde_annonce(
            "Transaction failed. Mobile Money balance: 12,000 FCFA."))


class TestCarnetAgentMtn(unittest.TestCase):
    """Le carnet COMPLET d'une ligne d'agent MTN, dicté par le terrain —
    chaque message ici est un vrai SMS reçu sur la carte du propriétaire.

    Sur une ligne d'agent, le mot seul ment : un « Cash in » CRÉDITE le
    client et VIDE la caisse de l'agent (les soldes annoncés le prouvent :
    506 330 − 125 000 = 381 330) ; un « Cash out » la REMPLIT. C'est la
    tournure complète qui donne le sens."""

    SOLDE_AGENT = ("Current balance: 8910 FCFA ; Available balance: 8910 "
                   "FCFA ; Airtime  balance: 7,943 FCFA ; MTN MoMo Gift "
                   "Balance: 0.")
    RECU_FLOAT = ("You have received 10000 XAF from BABY FRANCIS NOUBI "
                  "TCHASSEM (23767835223) on your mobile money account at "
                  "2026-07-08 11:30:58. Message from sender: . Your new "
                  "balance:89255 XAF. Financial Transaction Id: 17848350682.")
    TRANSFERT = ("You have transferred 50000 XAF to LUCY LIZETTE JEME "
                 "LIMUNGA (237677453011) from your mobile money account "
                 "93368555 at 2026-08-02 21:22:17 FEES 0 FCFA. Your new "
                 "balance: 6330 XAF. Message from sender: . Message to "
                 "receiver: . Financial Transaction Id: 18191577531.  "
                 "Borrow up to 100,000 FCFA in advance in just seconds for "
                 "your transactions. Dial *126*6# or access the new MoMo "
                 "App here:link.mtn.cm/NewMoMoAppRef.")
    CASH_IN = ("Cash in of 500000 XAF on 2026-08-08 17:36:26 to GAELLE "
               "MICHELE NGASSAM NYA (237674419489) has been successfully "
               "completed. Transaction ID:18269064283. Message:. Your new "
               "balance: 506330 XAF. Added commission: 890 XAF.")
    CASH_OUT = ("Cash out initiated by EDGARD MANGA (237676684303) on "
                "DATETIME} is successfully completed. You can payout the "
                "amount: 500000 XAF in cash to the customer. Transaction "
                "ID: 18292698523| Message: Your new balance: 1831330 XAF. "
                "Added commission: 1300 XAF.")
    PUB_QR = ("Earn +25 XAF on every Cash Out made via your QR Code with "
              "MoMo App. 10 QR Cash Outs/day = +250 XAF daily. Faster, "
              "safer, fraud free. Switch to QR today!.")
    DEBRIS = "AMOUNT10,000 MSISDN_SENDER237678738594 REASON-"

    def test_le_releve_d_agent_donne_le_solde_courant(self):
        """« Current balance » fait foi — jamais le crédit d'appel ni le
        « Gift », qui rangeait ce relevé en réclame."""
        self.assertEqual(solde_annonce(self.SOLDE_AGENT), 8910)
        self.assertEqual(categoriser(self.SOLDE_AGENT), "solde")

    def test_le_float_recu_est_un_encaissement_complet(self):
        p = analyser(self.RECU_FLOAT)
        self.assertEqual(p.sens, "entree")
        self.assertEqual(p.montant, 10000)
        self.assertEqual(p.tiers, "BABY FRANCIS NOUBI TCHASSEM")
        self.assertEqual(p.solde_apres, 89255)
        self.assertEqual(p.reference, "17848350682")
        self.assertEqual(categoriser(self.RECU_FLOAT), "encaissement")

    def test_le_transfert_sortant_se_lit_malgre_la_reclame_en_queue(self):
        p = analyser(self.TRANSFERT)
        self.assertEqual(p.sens, "sortie")
        self.assertEqual(p.montant, 50000)
        self.assertEqual(p.tiers, "LUCY LIZETTE JEME LIMUNGA")
        self.assertEqual(p.frais, 0)
        self.assertEqual(p.solde_apres, 6330)
        self.assertEqual(p.reference, "18191577531")

    def test_le_cash_in_vide_la_caisse_de_l_agent(self):
        p = analyser(self.CASH_IN)
        self.assertEqual(p.sens, "sortie",
                         "l'agent crédite le client : sa caisse baisse")
        self.assertEqual(p.montant, 500000)
        self.assertEqual(p.tiers, "GAELLE MICHELE NGASSAM NYA")
        self.assertEqual(p.solde_apres, 506330)
        self.assertEqual(p.commission, 890)
        self.assertIsNone(p.frais, "la commission est un gain, pas des frais")
        self.assertEqual(p.reference, "18269064283")
        self.assertEqual(categoriser(self.CASH_IN), "depot")

    def test_le_cash_out_remplit_la_caisse_de_l_agent(self):
        p = analyser(self.CASH_OUT)
        self.assertIsNotNone(p, "ce message était illisible avant")
        self.assertEqual(p.sens, "entree",
                         "le client retire chez l'agent : sa caisse monte")
        self.assertEqual(p.montant, 500000)
        self.assertEqual(p.tiers, "EDGARD MANGA")
        self.assertEqual(p.solde_apres, 1831330)
        self.assertEqual(p.commission, 1300)
        self.assertEqual(p.reference, "18292698523")
        self.assertEqual(categoriser(self.CASH_OUT), "retrait")

    def test_la_reclame_qr_est_une_reclame(self):
        self.assertIsNone(analyser(self.PUB_QR))
        self.assertEqual(categoriser(self.PUB_QR), "publicite")

    def test_les_debris_techniques_restent_des_messages(self):
        """Les fragments de gabarit de MTN (« AMOUNT10,000 MSISDN_… ») ne
        deviennent jamais des paiements : pas de devise, pas de lecture."""
        self.assertIsNone(analyser(self.DEBRIS))
        self.assertEqual(categoriser(self.DEBRIS), "message")

    def test_un_echec_avec_solde_courant_reste_un_echec(self):
        self.assertIsNone(solde_annonce(
            "Transaction failed. Current balance: 8910 FCFA."))


class TestSoldeEtrangerAuPorteMonnaie(unittest.TestCase):
    """Un solde n'est pas l'autre : le crédit d'appel n'est pas l'argent.

    MTN glisse « Airtime balance » AVANT « New balance » dans ses SMS
    d'opération. Le lecteur prenait le premier « balance » venu — le crédit
    téléphonique s'affichait donc comme le solde après opération, et l'alerte
    de solde bas s'en nourrissait.
    """

    TRANSFERT = ("Transfer of 5,000 FCFA to 677123456 NGONO Marie completed. "
                 "Fee: 100 FCFA. Airtime balance: 7,943 FCFA. "
                 "New balance: 8,910 FCFA. Financial Transaction Id: 123456789.")

    def test_le_solde_apres_saute_le_credit_dappel(self):
        p = analyser(self.TRANSFERT)
        self.assertIsNotNone(p)
        self.assertEqual(p.montant, 5000)
        self.assertEqual(p.solde_apres, 8910)   # et non 7943, le crédit d'appel

    def test_un_releve_de_credit_dappel_seul_nannonce_aucun_solde(self):
        # Mieux vaut aucun solde qu'un solde faux : ce message ne dit rien de
        # l'argent du compte.
        self.assertIsNone(solde_annonce("Airtime balance: 7,943 FCFA."))

    def test_les_soldes_etiquetes_restent_lus_dans_les_deux_ordres(self):
        for texte in ("Mobile Money Balance: 12000 FCFA. Airtime balance: 7,943 FCFA.",
                      "Airtime balance: 7,943 FCFA. Mobile Money Balance: 12000 FCFA."):
            self.assertEqual(solde_annonce(texte), 12000, texte)

    def test_un_solde_nul_reste_nul(self):
        # 0 est une réponse, pas une absence de réponse.
        self.assertEqual(
            solde_annonce("Mobile Money Balance: 0 FCFA. Airtime balance: 7,943 FCFA."),
            0)


class TestFraisJamaisPrisPourLeMontant(unittest.TestCase):
    """« Fee amount » porte le mot « amount » sans être le montant.

    On lisait le prix du service à la place de la somme : un retrait passait
    pour un mouvement de 100 FCFA, et le même nombre paraissait en montant ET
    en frais.
    """

    def test_fee_amount_ne_devient_pas_le_montant(self):
        p = analyser("Cash Out completed from 677123456 NGONO Marie. "
                     "Fee amount: 100 FCFA. New balance: 5000 FCFA.")
        # Aucun montant d'opération n'est annoncé : on refuse plutôt que
        # d'annoncer les frais comme la somme.
        self.assertIsNone(p)

    def test_des_frais_ecrits_avant_le_montant_ne_le_masquent_pas(self):
        p = analyser("Depot reussi. Frais: 100 FCFA. Montant: 5000 FCFA. "
                     "vers 677123456 NGONO Marie. Nouveau solde: 20000 FCFA.")
        self.assertIsNotNone(p)
        self.assertEqual(p.montant, 5000)

    def test_un_depot_ordinaire_garde_montant_et_frais(self):
        p = analyser("Depot de 50000 FCFA vers 677123456 NGONO Marie reussi. "
                     "Frais: 100 FCFA. Nouveau solde: 150000 FCFA.")
        self.assertIsNotNone(p)
        self.assertEqual(p.montant, 50000)
        self.assertEqual(p.frais, 100)
        self.assertEqual(p.solde_apres, 150000)


class TestChiffresEtrangers(unittest.TestCase):
    """Un montant qui n'est pas celui qu'on lit — trouvé en fuzzant.

    Python voit un chiffre dans bien plus que « 0 » à « 9 » : l'arabe-indien
    (« \u0665 »), la pleine chasse (« \uff15 »), et une douzaine d'autres
    écritures. `\d` les capture et `int()` les convertit SANS RIEN DIRE.

    « Depot de 5\u0665\u0660\u0660\u06600000 FCFA » était donc lu 550 000 000 FCFA — un nombre
    que personne ne lit dans le message. Et comme le SMS s'affiche tel qu'il
    est arrivé, l'écart restait invisible : la liste montrait le texte reçu,
    le bilan et le reçu portaient l'autre nombre.

    N'importe qui connaissant le numéro de la SIM peut envoyer un tel SMS ;
    un opérateur camerounais, jamais.
    """

    ARABE = "\u0665\u0660\u0660\u0660"          # « 5000 » en arabe-indien
    PLEINE = "\uff15\uff10\uff10\uff10"         # « 5000 » en pleine chasse

    def test_un_montant_en_chiffres_etrangers_ne_se_lit_pas(self):
        from totem.analyse_sms import _nombre
        for faux in (self.ARABE, self.PLEINE, "5" + self.ARABE + "0000"):
            self.assertIsNone(_nombre(faux), faux)

    def test_les_chiffres_arabes_ne_font_pas_un_paiement(self):
        p = analyser(f"Depot de 5{self.ARABE}0000 FCFA vers 677123456 "
                     "NGONO Marie reussi.")
        # Mieux vaut aucun montant qu'un montant que personne ne lit.
        self.assertTrue(p is None or p.montant is None)

    def test_un_solde_en_chiffres_etrangers_ne_s_annonce_pas(self):
        self.assertIsNone(
            solde_annonce(f"Le solde de votre compte est de {self.ARABE}FCFA."))

    def test_les_vrais_montants_se_lisent_toujours(self):
        # Le garde-fou ne doit rien coûter aux messages ordinaires.
        from totem.analyse_sms import _nombre
        self.assertEqual(_nombre("20 000"), 20000)
        self.assertEqual(_nombre("2784137.6"), 2784137.6)
        self.assertEqual(_nombre("1.250.000"), 1250000)
        p = analyser("Vous avez recu 20 000 FCFA de NGONO Marie (677123456). "
                     "Nouveau solde: 412 500 FCFA.")
        self.assertEqual(p.montant, 20000)
        self.assertEqual(p.solde_apres, 412500)
