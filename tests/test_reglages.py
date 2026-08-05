# -*- coding: utf-8 -*-
"""Le numéro et le nom d'une puce, demandés dans Telegram.

Une SIM prépayée ne déclare presque jamais son numéro, et personne d'autre que
le propriétaire ne connaît le nom commercial du compte. Les faire éditer dans
un fichier sur le Pi revenait à ne jamais les avoir : ils se demandent
désormais dans la conversation.

Lancer :  python3 -m unittest discover -s tests
"""

import unittest

from totem.app import Robot
from totem.carte import Carte
from totem.compte import Compte
from totem.entrant import Entrant
from totem.simulator import ModemSimule
from totem.storage import Journal

ICCID = "89237020000000004177"


class TransportEspion:
    def __init__(self):
        self.messages = []

    def envoyer(self, texte, boutons=None, canal=None, silencieux=False):
        self.messages.append((texte, boutons))
        return len(self.messages)

    def envoyer_fichier(self, *a, **k):
        return True

    def modifier(self, *a, **k):
        return True

    def supprimer(self, *a, **k):
        pass

    def retirer_boutons(self, *a, **k):
        pass

    def accuser(self, *a, **k):
        pass

    def recevoir(self):
        return []

    def publier_commandes(self, commandes):
        pass

    def vider_backlog(self):
        pass

    def role(self, utilisateur):
        return "admin"

    @property
    def dernier(self):
        return self.messages[-1][0]

    def boutons(self):
        return [b for ligne in (self.messages[-1][1] or []) for b in ligne]


def _robot():
    carte = Carte(iccid=ICCID, imsi="62402000000004177", reseau="Orange CM")
    compte = Compte(ModemSimule("Orange"), carte=carte)
    journal = Journal(":memory:")
    journal.voir_carte(carte)
    return Robot([compte], TransportEspion(), journal), compte, journal


def _dire(robot, texte):
    robot._traiter(Entrant(texte=texte, utilisateur=1, message_id=1))


class TestLEcranReglages(unittest.TestCase):
    def test_il_dit_ce_qui_manque(self):
        robot, compte, journal = _robot()
        _dire(robot, "/reglages")
        self.assertIn("number to fill in", robot.transport.dernier)
        self.assertIn("name to fill in", robot.transport.dernier)

    def test_il_le_dit_aussi_en_francais(self):
        from totem import textes
        robot, compte, journal = _robot()
        textes.definir_langue("fr")
        try:
            _dire(robot, "/reglages")
        finally:
            textes.definir_langue("en")
        self.assertIn("numéro à renseigner", robot.transport.dernier)
        self.assertIn("nom à renseigner", robot.transport.dernier)

    def test_un_bouton_par_champ_et_par_carte(self):
        robot, compte, journal = _robot()
        _dire(robot, "/reglages")
        donnees = [d for _, d in robot.transport.boutons()]
        self.assertIn(f"i:num:{ICCID}", donnees)
        self.assertIn(f"i:nom:{ICCID}", donnees)

    def test_il_est_dans_le_menu_des_commandes(self):
        from totem.app import COMMANDES_BOT
        self.assertIn("reglages", [nom for nom, _ in COMMANDES_BOT])


class TestSaisieDuNumero(unittest.TestCase):
    def test_le_numero_sinscrit(self):
        robot, compte, journal = _robot()
        robot._demander_identite("num", ICCID)
        self.assertIn("Send the phone number", robot.transport.dernier)

        _dire(robot, "696103864")
        self.assertEqual(journal.identite(ICCID)[0], "696103864")
        self.assertIn("696 103 864", robot.transport.dernier)

    def test_le_numero_sert_a_trancher_le_sens(self):
        """C'est tout l'objet de la manœuvre : sans lui, un reçu de transfert
        écrit « Montant net » au lieu de « Montant envoyé »."""
        from totem.declencheur import motif_du_sms
        robot, compte, journal = _robot()
        robot._demander_identite("num", ICCID)
        _dire(robot, "696103864")

        self.assertIn("696103864", robot._nos_numeros())
        self.assertEqual(robot._numero_du_compte(compte), "696103864")
        motif = motif_du_sms(
            "Transfert de 696103864 WONDER PHONE vers 697457589 NKENGAFAC "
            "MARICOLE NGWA reussi. Montant Net: 100 FCFA",
            numeros=robot._nos_numeros())
        self.assertEqual(motif.paiement.sens, "sortie")

    def test_ce_qui_nest_pas_un_numero_est_refuse(self):
        robot, compte, journal = _robot()
        robot._demander_identite("num", ICCID)
        _dire(robot, "bonjour")
        self.assertEqual(journal.identite(ICCID)[0], "")
        self.assertIn("Nothing was saved", robot.transport.dernier)

    def test_les_espaces_et_le_prefixe_sont_acceptes(self):
        robot, compte, journal = _robot()
        robot._demander_identite("num", ICCID)
        _dire(robot, "+237 696 10 38 64")
        self.assertEqual(journal.identite(ICCID)[0], "237696103864")

    def test_la_saisie_passe_avant_toute_interpretation(self):
        """« 696103864 » ne doit pas être lu comme autre chose, et le robot
        ne doit demander qu'une seule chose à la fois."""
        robot, compte, journal = _robot()
        robot._demander_identite("num", ICCID)
        self.assertIsNotNone(robot.attente_identite)
        _dire(robot, "696103864")
        self.assertIsNone(robot.attente_identite)


class TestSaisieDuNom(unittest.TestCase):
    def test_le_nom_sinscrit(self):
        robot, compte, journal = _robot()
        robot._demander_identite("nom", ICCID)
        _dire(robot, "WONDER PHONE")
        self.assertEqual(journal.identite(ICCID)[1], "WONDER PHONE")

    def test_un_nom_trop_court_est_refuse(self):
        robot, compte, journal = _robot()
        robot._demander_identite("nom", ICCID)
        _dire(robot, "W")
        self.assertEqual(journal.identite(ICCID)[1], "")

    def test_le_nom_parait_sur_le_recu_de_solde(self):
        robot, compte, journal = _robot()
        robot._demander_identite("nom", ICCID)
        _dire(robot, "WONDER PHONE")

        ussd_id = journal.ussd("reçu", "Votre solde est de 415 000 FCFA.",
                               compte.libelle, ICCID)
        journal.programmer_recu(ussd_id, "solde", "TS-1", source="ussd")
        ligne = journal.recus_a_envoyer(-60)[0]
        _, pdf, _ = robot._fabriquer_recu(ligne)
        self.assertIsNotNone(pdf)
        self.assertTrue(pdf.startswith(b"%PDF"))

    def test_le_fichier_garde_son_nom(self):
        """Le nom du compte et le nom du fichier sont deux choses : l'un ne
        doit pas écraser l'autre."""
        robot, compte, journal = _robot()
        robot._demander_identite("nom", ICCID)
        _dire(robot, "WONDER PHONE")
        ussd_id = journal.ussd("reçu", "Votre solde est de 415 000 FCFA.",
                               compte.libelle, ICCID)
        journal.programmer_recu(ussd_id, "solde", "TS-2026-0801-0001",
                                source="ussd")
        nom, _, _ = robot._fabriquer_recu(journal.recus_a_envoyer(-60)[0])
        self.assertEqual(nom, "TS-2026-0801-0001.pdf")


class TestLeJournal(unittest.TestCase):
    def test_une_carte_inconnue_est_refusee(self):
        """On n'invente pas une puce jamais vue par ce terminal."""
        robot, compte, journal = _robot()
        self.assertFalse(journal.definir_identite("00000000000000000000",
                                                  numero="696103864"))

    def test_le_changement_repart_vers_le_cloud(self):
        """L'application web doit voir la modification sans attendre qu'il se
        passe autre chose sur le terminal."""
        robot, compte, journal = _robot()
        journal.marquer_cartes_envoyees([ICCID])
        self.assertEqual(journal.cartes_non_envoyees(), [])
        journal.definir_identite(ICCID, numero="696103864")
        self.assertEqual(len(journal.cartes_non_envoyees()), 1)

    def test_lidentite_survit_au_retrait_de_la_carte(self):
        """Elle est rangée par ICCID : remettre la puce la fait ressortir."""
        robot, compte, journal = _robot()
        journal.definir_identite(ICCID, numero="696103864", nom="WONDER PHONE")
        autre = Carte(iccid="89237010000000008901", imsi="62401000000008901")
        journal.voir_carte(autre)
        self.assertEqual(journal.identite(autre.iccid), ("", ""))
        self.assertEqual(journal.identite(ICCID), ("696103864", "WONDER PHONE"))


if __name__ == "__main__":
    unittest.main()
