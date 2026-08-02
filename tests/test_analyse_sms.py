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
                               formater_montant, masquer_secrets, solde_annonce)

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
        self.assertEqual(formater_montant(0), "0")
        self.assertEqual(formater_montant(184137), "184 137")
        self.assertEqual(formater_montant(2784137.6), "2 784 137,6")
        self.assertEqual(formater_montant(999.5), "999,5")


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

    def test_masque(self):
        masque = masquer_secrets(self.CODE)
        self.assertNotIn("515318", masque)
        self.assertIn("696103864", masque)     # le numéro n'est pas un secret
        self.assertIn("•", masque)

    def test_un_vrai_paiement_nest_jamais_masque(self):
        """Un encaissement qui contiendrait le mot « code » doit rester
        lisible en entier : le masquage ne s'applique qu'aux secrets."""
        sms = ("Vous avez recu 25 000 FCFA de NGONO Marie (677123456). "
               "Code marchand: 4455. Nouveau solde: 872 500 FCFA.")
        self.assertFalse(code_a_usage_unique(sms))
        self.assertEqual(masquer_secrets(sms), sms)
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
