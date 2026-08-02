# -*- coding: utf-8 -*-
"""Tests de la chaîne des reçus PDF.

Du SMS au document joint dans Telegram, en passant par la règle qui décide
qu'il y a lieu d'en établir un. Le dessin lui-même n'est pas testé ici — il
se regarde, il ne s'assert pas ; ce qui est vérifié, c'est qu'un PDF sort,
qu'il sort une seule fois, et qu'il ne sort jamais pour un secret.

Lancer :  python3 -m unittest discover -s tests
"""

import datetime
import unittest

from totem.app import Robot
from totem.compte import Compte
from totem.declencheur import SOLDE, TRANSFERT, motif_du_menu, motif_du_sms
from totem.recu import numero_de_recu, recu_solde, recu_transfert
from totem.simulator import ModemSimule
from totem.storage import Journal

TRANSFERT_ORANGE = (
    "Transfert de 656483918 PRIX MONO SARL vers 696103864 WONDER PHONE reussi. "
    "Details: ID transaction: PP260731.1319.B45805, "
    "Montant Transaction: 184137FCFA, Frais: 0 FCFA, Commission: 0 FCFA, "
    "Montant Net: 184137 FCFA, Nouveau Solde: 2784137.6 FCFA")
SOLDE_ORANGE = "Le solde de votre compte est de 2784137.6FCFA."
CODE_ORANGE = "Le code de 696103864 est: 515318.Orange Money vous remercie."


class TransportEspion:
    """Un Telegram de laboratoire : il retient au lieu d'envoyer."""

    def __init__(self, accepte_fichiers=True):
        self.messages = []
        self.fichiers = []
        self.accepte_fichiers = accepte_fichiers

    def envoyer(self, texte, boutons=None, canal=None, silencieux=False):
        self.messages.append(texte)
        return len(self.messages)

    def envoyer_fichier(self, nom, contenu, legende="", canal=None,
                        type_mime="text/csv"):
        if not self.accepte_fichiers:
            return False
        self.fichiers.append((nom, contenu, legende, type_mime))
        return True

    # Les échanges d'un menu USSD : ils modifient un message en place plutôt
    # que d'en empiler un nouveau. Rien à retenir ici, seulement à ne pas
    # faire échouer le parcours.
    def modifier(self, message_id, texte, boutons=None, canal=None):
        self.messages.append(texte)
        return True

    def supprimer(self, message_id, canal=None):
        pass

    def retirer_boutons(self, message_id, canal=None):
        pass

    def accuser(self, callback_id, texte=""):
        pass

    def recevoir(self):
        return []

    def publier_commandes(self, commandes):
        pass

    def vider_backlog(self):
        pass

    def role(self, utilisateur):
        return "admin"


def _robot(transport=None, numeros=None, recus=True):
    modem = ModemSimule("Orange")
    compte = Compte(modem, "Orange")
    journal = Journal(":memory:")
    if numeros is None:
        numeros = {"orange": "696103864"}
    robot = Robot([compte], transport or TransportEspion(), journal,
                  numeros=numeros, recus=recus)
    return robot, compte, modem, journal


def _distribuer(robot, journal):
    """Force la maturité : le reçu attend dix secondes en service, on ne va
    pas les faire passer pour de vrai dans un test."""
    vraie = journal.recus_a_envoyer
    journal.recus_a_envoyer = lambda apres=0, limite=5: vraie(-60, limite)
    try:
        robot._distribuer_recus()
    finally:
        journal.recus_a_envoyer = vraie


class TestQuiMeriteUnRecu(unittest.TestCase):
    """La règle est explicite, donc elle se teste ligne à ligne."""

    def test_transfert_reussi(self):
        motif = motif_du_sms(TRANSFERT_ORANGE)
        self.assertIsNotNone(motif)
        self.assertEqual(motif.genre, TRANSFERT)
        self.assertEqual(motif.reference, "PP260731.1319.B45805")

    def test_encaissement_classique(self):
        motif = motif_du_sms(
            "Vous avez recu 25 000 FCFA de NGONO Marie (677123456).")
        self.assertEqual(motif.genre, TRANSFERT)

    def test_solde(self):
        motif = motif_du_sms(SOLDE_ORANGE)
        self.assertEqual(motif.genre, SOLDE)
        self.assertEqual(motif.solde, 2784137.6)

    def test_transfert_echoue(self):
        self.assertIsNone(motif_du_sms(
            "Transfert de 656483918 vers 696103864 echoue. Solde insuffisant."))

    def test_operation_annulee(self):
        self.assertIsNone(motif_du_sms(
            "Vous avez envoye 80 000 FCFA a Fournisseur SARL (690334455). "
            "Operation annulee."))

    def test_code_a_usage_unique_jamais(self):
        self.assertIsNone(motif_du_sms(CODE_ORANGE))

    def test_publicite(self):
        self.assertIsNone(motif_du_sms(
            "PROMO! Rechargez 5000 FCFA et gagnez 1000 FCFA de bonus !"))

    def test_message_non_compris(self):
        self.assertIsNone(motif_du_sms("Bonjour, es-tu disponible demain ?"))
        self.assertIsNone(motif_du_sms(""))


class TestLeDocument(unittest.TestCase):
    QUAND = datetime.datetime(2026, 7, 31, 13, 19)

    def test_le_transfert_produit_un_pdf(self):
        motif = motif_du_sms(TRANSFERT_ORANGE, numeros=["696103864"])
        pdf = recu_transfert(motif.paiement, "TM-2026-0731-0042", self.QUAND)
        self.assertTrue(pdf.startswith(b"%PDF-1.7"))
        self.assertTrue(pdf.rstrip().endswith(b"%%EOF"))
        self.assertGreater(len(pdf), 10_000)      # la police est embarquée

    def test_le_titre_suit_la_nature(self):
        # Un dépôt / un retrait donnent un reçu qui le DIT, pas un « transfert »
        # générique. Le document reste par ailleurs identique.
        motif = motif_du_sms(TRANSFERT_ORANGE, numeros=["696103864"])
        for titre in ("Reçu de dépôt", "Reçu de retrait", "Reçu de transfert"):
            pdf = recu_transfert(motif.paiement, "TM-2026-0731-0042", self.QUAND,
                                 titre=titre)
            self.assertTrue(pdf.startswith(b"%PDF-1.7"))
            self.assertGreater(len(pdf), 10_000)

    def test_le_solde_produit_un_pdf(self):
        pdf = recu_solde(2784137.6, "WONDER PHONE", "696103864",
                         "TM-2026-0731-0043", self.QUAND)
        self.assertTrue(pdf.startswith(b"%PDF-1.7"))

    def test_le_sens_inconnu_ne_ment_pas(self):
        """Sans notre numéro, le document ne peut pas annoncer « Montant
        reçu » : il dirait peut-être l'inverse de la vérité."""
        from totem.recu import ETIQUETTES_SOMME
        motif = motif_du_sms(TRANSFERT_ORANGE)     # aucun numéro fourni
        self.assertIsNone(motif.paiement.sens)
        self.assertNotIn(None, ETIQUETTES_SOMME)
        self.assertEqual(ETIQUETTES_SOMME.get(motif.paiement.sens,
                                              "Montant net"), "Montant net")

    def test_numero_stable(self):
        """Refabriquer un reçu doit lui redonner le même numéro."""
        self.assertEqual(numero_de_recu(self.QUAND, 42), "TM-2026-0731-0042")
        self.assertEqual(numero_de_recu(self.QUAND, 42),
                         numero_de_recu(self.QUAND, 42))


class TestLaChaine(unittest.TestCase):
    def test_le_sms_arrive_avant_le_recu(self):
        """L'alerte ne doit jamais attendre le document."""
        robot, compte, modem, journal = _robot()
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        robot._relever_sms(compte)
        self.assertEqual(len(robot.transport.messages), 1)
        self.assertEqual(robot.transport.fichiers, [])   # pas encore mûr
        self.assertEqual(journal.recus_en_attente(), 1)

        _distribuer(robot, journal)
        self.assertEqual(len(robot.transport.fichiers), 1)
        nom, contenu, legende, type_mime = robot.transport.fichiers[0]
        self.assertTrue(nom.endswith(".pdf"))
        self.assertEqual(type_mime, "application/pdf")
        self.assertTrue(contenu.startswith(b"%PDF"))
        self.assertIn("Reçu de transfert", legende)

    def test_un_seul_recu_par_sms(self):
        """Le modem relit parfois un message après un redémarrage. La
        référence de transaction, elle, ne change pas."""
        robot, compte, modem, journal = _robot()
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        robot._relever_sms(compte)
        modem.sms_en_attente.append((2, "OrangeMoney", TRANSFERT_ORANGE))
        robot._relever_sms(compte)

        _distribuer(robot, journal)
        self.assertEqual(len(robot.transport.fichiers), 1)

    def test_le_code_ne_produit_rien_et_ne_sarchive_pas_en_clair(self):
        robot, compte, modem, journal = _robot()
        modem.sms_en_attente.append((1, "OrangeMoney", CODE_ORANGE))
        robot._relever_sms(compte)
        _distribuer(robot, journal)

        self.assertEqual(robot.transport.fichiers, [])
        self.assertEqual(journal.recus_en_attente(), 0)
        _, _, garde, _ = journal.derniers_sms(1)[0]
        self.assertNotIn("515318", garde)
        self.assertNotIn("515318", robot.transport.messages[0])

    def test_un_sms_incompris_ne_produit_rien(self):
        robot, compte, modem, journal = _robot()
        modem.sms_en_attente.append((1, "Maman", "Tu rentres quand ?"))
        robot._relever_sms(compte)
        _distribuer(robot, journal)
        self.assertEqual(robot.transport.fichiers, [])

    def test_reseau_absent_le_recu_attend(self):
        """Une coupure ne perd pas le document : il repart au tour suivant."""
        muet = TransportEspion(accepte_fichiers=False)
        robot, compte, modem, journal = _robot(transport=muet)
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        robot._relever_sms(compte)
        _distribuer(robot, journal)
        self.assertEqual(journal.recus_en_attente(), 1)

        muet.accepte_fichiers = True
        _distribuer(robot, journal)
        self.assertEqual(len(muet.fichiers), 1)
        self.assertEqual(journal.recus_en_attente(), 0)

    def test_on_peut_couper_les_recus(self):
        robot, compte, modem, journal = _robot(recus=False)
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        robot._relever_sms(compte)
        _distribuer(robot, journal)
        self.assertEqual(robot.transport.fichiers, [])
        self.assertEqual(len(robot.transport.messages), 1)   # l'alerte, elle, part

    def test_le_sens_vient_de_la_configuration(self):
        """Une SIM prépayée ne déclare pas son numéro ; la configuration si."""
        robot, compte, modem, journal = _robot(numeros={"orange": "696103864"})
        self.assertIn("696103864", robot._nos_numeros())
        motif = motif_du_sms(TRANSFERT_ORANGE, numeros=robot._nos_numeros())
        self.assertEqual(motif.paiement.sens, "entree")

    def test_sans_configuration_le_sens_reste_inconnu(self):
        robot, compte, modem, journal = _robot(numeros={})
        motif = motif_du_sms(TRANSFERT_ORANGE, numeros=robot._nos_numeros())
        self.assertIsNone(motif.paiement.sens)


class TestLaFabriquePdf(unittest.TestCase):
    """Le moteur PDF lui-même : ce qu'on lui demande de garantir."""

    def test_le_texte_est_extractible(self):
        """Un reçu dont on ne peut pas copier l'identifiant de transaction
        n'est qu'une image."""
        from totem.pdf import Police
        import os
        from totem.recu import POLICES
        police = Police(os.path.join(POLICES, "dmsans-700.ttf"), "T")
        self.assertGreater(police.largeur("PP260731", 17), 0)
        # « ç » et « é » doivent exister : « Reçu », « relevé ».
        self.assertNotIn(0, police.glyphes("Reçu de solde · relevé"))

    def test_le_symbole_vient_de_la_charte(self):
        """Le logo n'est pas redessiné : il est lu dans brand/generer.py."""
        from totem.logo import brins
        traces = brins()
        self.assertEqual(len(traces), 2)
        for trace, coupes in traces:
            self.assertTrue(trace.startswith("M16.000 4.400C"))
            self.assertEqual(len(coupes), 1)     # un croisement à masquer


class TestSoldeLuAuMenu(unittest.TestCase):
    """Le solde ne passe presque jamais par un SMS : l'opérateur l'affiche à
    l'écran, et nulle part ailleurs. Appuyer sur « Solde » et ne rien recevoir,
    c'est le trou qu'on ferme ici."""

    def test_une_reponse_de_solde_donne_un_recu(self):
        motif = motif_du_menu("Votre solde est de 2 784 137,6 FCFA.")
        self.assertIsNotNone(motif)
        self.assertEqual(motif.genre, SOLDE)
        self.assertEqual(motif.solde, 2784137.6)

    def test_un_menu_nen_donne_pas(self):
        """Des options numérotées veulent dire qu'il reste à choisir : il ne
        s'est encore rien passé."""
        self.assertIsNone(motif_du_menu(
            "Mon compte\n1. Consulter le solde\n2. Dernieres transactions\n3. Retour"))
        self.assertIsNone(motif_du_menu(
            "Orange Money\n1) Transfert d'argent\n2) Retrait\n5) Mon compte"))

    def test_une_question_nen_donne_pas(self):
        self.assertIsNone(motif_du_menu("Entrez le montant (FCFA) :"))
        self.assertIsNone(motif_du_menu("Confirmez avec votre code PIN :"))
        self.assertIsNone(motif_du_menu("Transfert\nEntrez le numero du beneficiaire :"))

    def test_un_echec_nen_donne_pas(self):
        self.assertIsNone(motif_du_menu("Solde insuffisant. Operation annulee."))

    def test_le_parcours_complet_du_bouton_solde(self):
        """#150#, puis « Mon compte », puis « Consulter le solde » : un seul
        reçu, à la fin, et rien sur les écrans intermédiaires."""
        robot, compte, modem, journal = _robot()
        for etape, nouveau in (("#150#", True), ("5", False), ("1", False)):
            robot._ussd(compte, etape, nouveau=nouveau)
            if etape != "1":
                self.assertEqual(journal.recus_en_attente(), 0,
                                 "un menu ne doit pas produire de reçu")
        self.assertEqual(journal.recus_en_attente(), 1)

        _distribuer(robot, journal)
        self.assertEqual(len(robot.transport.fichiers), 1)
        nom, contenu, legende, _ = robot.transport.fichiers[0]
        self.assertTrue(nom.startswith("TS-"))     # « S » comme session USSD
        self.assertTrue(contenu.startswith(b"%PDF"))
        self.assertIn("Reçu de solde", legende)

    def test_le_meme_solde_consulte_deux_fois_donne_deux_recus(self):
        """Ce n'est pas un doublon : ce sont deux relevés à deux instants."""
        robot, compte, modem, journal = _robot()
        for _ in range(2):
            for etape, nouveau in (("#150#", True), ("5", False), ("1", False)):
                robot._ussd(compte, etape, nouveau=nouveau)
        self.assertEqual(journal.recus_en_attente(), 2)

    def test_un_numero_de_sms_et_un_numero_de_solde_ne_se_confondent_pas(self):
        """Les deux journaux ont leurs propres numéros de ligne : sans lettre
        distinctive, le SMS n° 4 et la réponse USSD n° 4 porteraient le même
        numéro de reçu — et le cloud, qui les range par numéro, en perdrait un."""
        import datetime
        quand = datetime.datetime(2026, 8, 1, 9, 47)
        self.assertNotEqual(numero_de_recu(quand, 4, "sms"),
                            numero_de_recu(quand, 4, "ussd"))

    def test_un_transfert_reste_sur_le_chemin_du_sms(self):
        """La réponse USSD d'un transfert ne doit pas doubler le reçu que le
        SMS de confirmation produira."""
        self.assertIsNone(motif_du_menu(TRANSFERT_ORANGE))


class TestRienNeDeborde(unittest.TestCase):
    """La maquette a été dessinée sur « PRIX MONO SARL » et « WONDER PHONE ».

    Le premier vrai reçu portait « NKENGAFAC MARICOLE NGWA » — et le nom
    sortait de la page. Un document dont le texte mord sur le bord n'est pas
    présentable à un client : ces cas-là sont donc verrouillés ici, une fois
    pour toutes.
    """

    QUAND = datetime.datetime(2026, 8, 1, 11, 21)

    def _paiement(self, emetteur, beneficiaire, montant=100,
                  reference="PP260801.1121.A89624"):
        from totem.analyse_sms import Paiement, Partie
        return Paiement(sens="sortie", montant=montant, texte="",
                        reference=reference, frais=0, commission=0,
                        montant_brut=montant,
                        emetteur=Partie("696103864", emetteur),
                        beneficiaire=Partie("697457589", beneficiaire))

    def _debordements(self, fabrique):
        """Refait le document en gardant le gabarit sous la main."""
        import totem.recu as R
        gabarits, vrai = [], R.Gabarit

        class Mouchard(vrai):
            def __init__(self, *a, **k):
                super().__init__(*a, **k)
                gabarits.append(self)

        R.Gabarit = Mouchard
        try:
            fabrique()
        finally:
            R.Gabarit = vrai
        return gabarits[0].debordements()

    def _verifier(self, titre, fabrique):
        debords = self._debordements(fabrique)
        self.assertEqual(
            debords, [],
            f"{titre} : {[c for c, _, _ in debords]} sort des marges")

    def test_les_noms_de_la_maquette(self):
        self._verifier("noms courts", lambda: recu_transfert(
            self._paiement("PRIX MONO SARL", "WONDER PHONE"), "TM-1", self.QUAND))

    def test_le_nom_qui_debordait(self):
        self._verifier("NKENGAFAC MARICOLE NGWA", lambda: recu_transfert(
            self._paiement("WONDER PHONE", "NKENGAFAC MARICOLE NGWA"),
            "TM-2026-0801-0018", self.QUAND))

    def test_des_raisons_sociales_a_rallonge(self):
        self._verifier("six mots des deux côtés", lambda: recu_transfert(
            self._paiement("ETABLISSEMENT DE COMMERCE GENERAL DU LITTORAL",
                           "NKENGAFAC MARICOLE NGWA EPOUSE TCHOUMI"),
            "TM-1", self.QUAND))

    def test_un_seul_mot_plus_large_que_sa_colonne(self):
        """Rien à couper au mot : il ne reste qu'à rétrécir."""
        self._verifier("un seul mot", lambda: recu_transfert(
            self._paiement("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                           "MMMMMMMMMMMMMMMMMMMMMMMM"), "TM-1", self.QUAND))

    def test_un_montant_enorme(self):
        self._verifier("987 654 321,75", lambda: recu_transfert(
            self._paiement("A", "B", montant=987654321.75), "TM-1", self.QUAND))

    def test_une_reference_interminable(self):
        self._verifier("référence longue", lambda: recu_transfert(
            self._paiement("A", "B",
                           reference="PP260801.1121.A89624.SUITE.ENCORE.PLUS.LONG"),
            "TM-1", self.QUAND))

    def test_un_numero_de_recu_tres_long(self):
        self._verifier("numéro long", lambda: recu_transfert(
            self._paiement("A", "B"), "TM-2026-0801-0018-BIS-TER-QUATER",
            self.QUAND))

    def test_un_solde_enorme_et_un_compte_a_rallonge(self):
        self._verifier("solde de onze chiffres", lambda: recu_solde(
            98765432198.75, "ETABLISSEMENT DE COMMERCE GENERAL DU LITTORAL",
            "697457589", "TS-1", self.QUAND))

    def test_sans_aucun_nom(self):
        self._verifier("parties anonymes", lambda: recu_transfert(
            self._paiement(None, None), "TM-1", self.QUAND))

    def test_les_deux_colonnes_gardent_la_meme_taille(self):
        """« DE » et « À » se lisent ensemble : un nom rétréci d'un côté doit
        rétrécir l'autre, sinon le reçu paraît bancal."""
        import totem.recu as R
        gabarits, vrai = [], R.Gabarit

        class Mouchard(vrai):
            def __init__(self, *a, **k):
                super().__init__(*a, **k)
                gabarits.append(self)

        R.Gabarit = Mouchard
        try:
            recu_transfert(self._paiement(
                "A", "NKENGAFAC MARICOLE NGWA EPOUSE TCHOUMI DE DOUALA"),
                "TM-1", self.QUAND)
        finally:
            R.Gabarit = vrai
        gabarit = gabarits[0]
        _, corps_court = gabarit._bloc_nom("A", 100)
        self.assertEqual(corps_court, 27)      # un nom court garde son corps


if __name__ == "__main__":
    unittest.main()
