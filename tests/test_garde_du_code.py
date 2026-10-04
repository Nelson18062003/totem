# -*- coding: utf-8 -*-
"""La garde du code secret, côté robot — la jumelle du noyau.

Une relecture adverse a trouvé que la garde se désarmait toute seule sur
l'écran le plus ordinaire de MTN et d'Orange : la demande du code suivie de
la navigation, « 0. Retour / 00. Accueil ». Deux lignes numérotées faisaient
« un menu », un menu n'était « jamais une demande de code » : pas de pavé,
le code tapé à la main entrait dans un raccourci rejouable, restait dans la
conversation et s'écrivait EN CLAIR au journal — qui part dans la sauvegarde
postée sur Telegram.

La même règle vit dans le noyau (web/noyau/ussd.ts, `codeDemande`), éprouvée
par web/noyau/tests/ecran-pieges.test.ts. Les deux doivent tomber d'accord :
sinon le même écran ouvrirait le pavé sur Telegram et un champ en clair sur
le téléphone, ou l'inverse.

LE TÉMOIN : l'ancienne règle, réécrite en trois lignes, doit échouer sur les
mêmes exigences — sans quoi ces tests ne prouveraient rien.
"""

import json
import os
import re
import unittest

from totem.app import MENU_MINIMUM, Robot

from tests.test_experience_telegram import robot, tape


def ancienne_regle(menu):
    """La garde d'avant : moins de deux options ET un mot du code."""
    options = [l for l in (menu or "").splitlines()
               if re.match(r"^\s*(\d{1,2})\s*[.):\-]\s*(?!\d{2}(?:\D|$))(\S.*)$", l)]
    return len(options) < MENU_MINIMUM and bool(re.search(
        r"\bn\.?i\.?p\.?\b|\bpin\b|\bmdp\b|\bcodes?\b|secret|confidentiel"
        r"|mot\s+de\s+passe|password|passcode|passphrase", menu, re.I))


DEMANDES_AVEC_NAVIGATION = [
    "Entrez votre code secret\n0. Retour\n00. Accueil",
    "Enter your PIN:\n99. Back\n00. Home",
    "Transfert de 5000 FCFA a JEAN.\nEntrez votre code secret pour valider\n"
    "#. Retour\n0. Annuler\n00. Menu",
    "Confirm: Float Transfer 5000 to X\nEnter PIN:\n0. Back\n00. Next",
    "Entrez votre PIN pour confirmer\n0. Retour\n00. Accueil",
    "Entrez votre code PIN pour confirmer\n0: Retour\n00: Accueil",
    "Enter MoMo PIN:\n1. Forgot PIN\n2. Cancel",
    "Entrez votre code secret\n1. Valider\n0. Retour",
]
MOTS_NOUVEAUX = [
    "Enter your mPIN", "Enter your MPIN:", "Entrez votre clé secrète",
    "Saisissez votre mot-de-passe", "Enter your PINCODE", "Enter P.I.N.",
    "Enter PIN2", "Entrez votre PIN_MoMo",
]
NOMME_SANS_DEMANDER = [
    "Retrait de 10000 FCFA. Code de retrait: 4821. Valable 24h. 00. Next",
    "Vous allez envoyer 5000 FCFA a JOHN 677123456. Ne partagez jamais "
    "votre code PIN.\n1. Confirmer",
    "Transfert effectue. Nouveau solde: 12 000 FCFA. Ne communiquez jamais "
    "votre code secret.",
    "Code promo\n1. 10 Go 30j\n2. 20 Go 30j",
]


class TestLaGardeDuCode(unittest.TestCase):

    def exigences(self, regle):
        """Ce que la garde doit faire — rejouable sur n'importe quelle règle."""
        for ecran in DEMANDES_AVEC_NAVIGATION + MOTS_NOUVEAUX:
            self.assertTrue(regle(ecran), f"pas de pavé : {ecran!r}")
        for ecran in NOMME_SANS_DEMANDER:
            self.assertFalse(regle(ecran), f"pavé à tort : {ecran!r}")

    def test_la_garde_du_jour(self):
        self.exigences(Robot._demande_un_code)

    def test_le_temoin_echoue(self):
        with self.assertRaises(AssertionError):
            self.exigences(ancienne_regle)

    def test_ce_qui_tenait_tient_toujours(self):
        for ecran in ("Entrez votre code secret", "Confirmez avec votre code secret :",
                      "Veuillez saisir votre NIP:", "10:44\nEntrez votre code secret",
                      "1. Entrez votre code PIN pour confirmer",
                      "Code PIN incorrect. Il vous reste 2 essais."):
            self.assertTrue(Robot._demande_un_code(ecran), ecran)
        for ecran in ("Gerer mon code secret\n1) Changer\n2) Retour",
                      "1:Modifier code secret\n2:Mot de passe oublie",
                      "Choisissez une option pour votre code secret :\n1. Changer\n2. Voir",
                      "Entrez le numero du beneficiaire", "Votre opinion compte"):
            self.assertFalse(Robot._demande_un_code(ecran), ecran)


class TestLeMemeJugementQueLeNoyau(unittest.TestCase):
    """Les écrans de web/noyau/tests/garde-du-code.json sont aussi jugés par
    le noyau (ecran-pieges.test.ts) : les deux côtés doivent dire la même
    chose, ou l'un des deux tests échoue."""

    def test_ecrans_partages(self):
        chemin = os.path.join(os.path.dirname(__file__), "..", "web", "noyau",
                              "tests", "garde-du-code.json")
        with open(chemin, encoding="utf-8") as f:
            partages = json.load(f)
        for ecran in partages["pave"]:
            self.assertTrue(Robot._demande_un_code(ecran), ecran)
        for ecran in partages["pas_de_pave"]:
            self.assertFalse(Robot._demande_un_code(ecran), ecran)


class TestUnLibelleChiffre(unittest.TestCase):
    """« 1. 50 Mo » est un choix ; « 10:44 » et « 12-05-2026 » n'en sont pas."""

    def test_forfaits_et_montants(self):
        options = Robot._analyser_menu(
            "Forfaits:\n1. 50 Mo\n2. 25 SMS\n3. 100 Mo\n0. Retour")[1]
        self.assertEqual([n for n, _ in options], ["1", "2", "3", "0"])
        options = Robot._analyser_menu("Choisissez:\n1. 50 000 FCFA\n2. 10 000 FCFA")[1]
        self.assertEqual([n for n, _ in options], ["1", "2"])

    def test_heure_et_date(self):
        self.assertEqual(Robot._analyser_menu("10:44\nSolde 100 FCFA")[1], [])
        self.assertEqual(Robot._analyser_menu("12-05-2026 10:44\nSolde")[1], [])
        self.assertEqual(Robot._analyser_menu("12.05.2026\nSolde")[1], [])


class TestLeCodeTapeALaMain(unittest.TestCase):
    """Sur Telegram, de bout en bout : le code tapé sous « 0. Retour /
    00. Accueil » est effacé de la conversation, journalisé « **** », et
    n'entre pas dans un raccourci rejouable."""

    def test_code_sous_la_navigation(self):
        r, t, modem = robot()
        modem.menu_principal = "Entrez votre code secret\n0. Retour\n00. Accueil"
        tape(r, "*126#")
        self.assertTrue(r.pin_actif)
        tape(r, "1234", message_id=42)
        self.assertIn(42, t.supprimes)
        journalises = [x[0] for x in r.journal.conn.execute("SELECT texte FROM ussd")]
        self.assertNotIn("1234", journalises)
        self.assertIn("****", journalises)
        self.assertNotIn("1234", r.trace)


if __name__ == "__main__":
    unittest.main()
