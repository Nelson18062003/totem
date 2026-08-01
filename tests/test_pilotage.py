# -*- coding: utf-8 -*-
"""Le guichet à distance : les demandes de l'application web, exécutées.

On ne teste ni Supabase ni un vrai modem — on teste notre discipline face
aux demandes : le résultat écrit, le refus poli quand Telegram a la main,
et surtout le code secret masqué dans la base AVANT d'être composé.
"""

import unittest

from totem.pilotage import Pilotage, RefusPoli


class FauxNuage:
    """Mémorise ce que le pilotage écrit, sans réseau."""

    def __init__(self):
        self.actif = True
        self.terminal = "essai"
        self.maj = []               # (identifiant, champs) dans l'ordre
        self.soldes = []            # (iccid, solde)
        self.republies = 0

    def commandes_en_attente(self):
        return []

    def commande_maj(self, identifiant, champs):
        self.maj.append((identifiant, dict(champs)))
        return True

    def publier_solde(self, iccid, solde):
        self.soldes.append((iccid, solde))
        return True

    def publier_comptes(self, comptes):
        self.republies += 1
        return True

    def enregistrer_terminal(self, sante=None):
        return True


class FausseCarte:
    identifiee = True
    iccid = "89237020000000004432"
    operateur = "Orange"


class FauxCompte:
    """Un compte scripté : chaque envoi USSD rend la réponse suivante."""

    def __init__(self, reponses, libelle="Orange ·4432"):
        self.reponses = list(reponses)
        self.libelle = libelle
        self.carte = FausseCarte()
        self.session_ouverte = False
        self.recu = []              # ce que le « réseau » a réellement reçu

    def _suivant(self, envoi):
        self.recu.append(envoi)
        etat, texte = self.reponses.pop(0)
        self.session_ouverte = etat == "ouverte"
        return texte

    def ussd_demarrer(self, code):
        return self._suivant(code)

    def ussd_repondre(self, texte):
        return self._suivant(texte)

    def ussd_annuler(self):
        self.session_ouverte = False


class FauxJournal:
    def __init__(self):
        self.evenements = []

    def evenement(self, texte):
        self.evenements.append(texte)


def pilote(compte, nuage=None):
    n = nuage or FauxNuage()
    return Pilotage(n, [compte], FauxJournal()), n


class TestGuichet(unittest.TestCase):

    def test_composer_un_code_ecrit_le_menu_en_resultat(self):
        compte = FauxCompte([("ouverte", "Orange Money\n1) Transfert")])
        p, nuage = pilote(compte)
        p._traiter({"id": 7, "type": "ussd", "parametres": {"code": "#148#"}})
        etats = [c.get("etat") for _, c in nuage.maj if "etat" in c]
        self.assertEqual(etats, ["en_cours", "faite"])
        self.assertIn("Transfert", nuage.maj[-1][1]["resultat"])
        self.assertEqual(compte.recu, ["#148#"])

    def test_telegram_garde_la_main(self):
        compte = FauxCompte([])
        compte.session_ouverte = True       # ouverte ailleurs : par Telegram
        p, nuage = pilote(compte)
        p._traiter({"id": 8, "type": "ussd", "parametres": {"code": "#148#"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertIn("Telegram", nuage.maj[-1][1]["resultat"])
        self.assertEqual(compte.recu, [])   # le combiné n'a pas été touché

    def test_le_code_secret_est_masque_avant_d_etre_compose(self):
        compte = FauxCompte([
            ("ouverte", "Entrez votre code secret"),
            ("fermee", "Le solde de votre compte est de 2784137.6FCFA."),
        ])
        p, nuage = pilote(compte)
        p._traiter({"id": 1, "type": "ussd", "parametres": {"code": "#148*5#"}})
        p._traiter({"id": 2, "type": "ussd_reponse",
                    "parametres": {"texte": "1234", "secret": True}})
        # Dans l'ordre des écritures pour la demande 2 : prise en charge,
        # puis MASQUAGE, puis seulement le résultat.
        ecritures_2 = [c for i, c in nuage.maj if i == 2]
        self.assertEqual(ecritures_2[1], {"parametres": {"secret": True}})
        self.assertNotIn("1234", str(ecritures_2))
        # Le réseau, lui, a bien reçu le code — c'est tout l'intérêt.
        self.assertEqual(compte.recu[-1], "1234")

    def test_un_solde_annonce_est_publie(self):
        compte = FauxCompte([
            ("fermee", "Le solde de votre compte est de 2784137.6FCFA."),
        ])
        p, nuage = pilote(compte)
        p._traiter({"id": 3, "type": "ussd", "parametres": {"code": "#148*5#"}})
        self.assertEqual(nuage.soldes, [(FausseCarte.iccid, 2784137.6)])

    def test_repondre_sans_session_est_refuse(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        p._traiter({"id": 4, "type": "ussd_reponse", "parametres": {"texte": "1"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")

    def test_actualiser_republie_l_etat(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        p._traiter({"id": 5, "type": "solde", "parametres": {}})
        self.assertEqual(nuage.republies, 1)
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")

    def test_raccrocher(self):
        compte = FauxCompte([("ouverte", "Orange Money\n1) Transfert")])
        p, nuage = pilote(compte)
        p._traiter({"id": 6, "type": "ussd", "parametres": {"code": "#148#"}})
        self.assertIsNotNone(p._session)
        p._traiter({"id": 7, "type": "ussd_fin", "parametres": {}})
        self.assertIsNone(p._session)
        self.assertFalse(compte.session_ouverte)


if __name__ == "__main__":
    unittest.main()


class TestLaMainRepriseDepuisTelegram(unittest.TestCase):
    """Le guichet à distance s'efface devant Telegram — un humain est au bout
    du fil. Mais il faut le lui DIRE : sans ça sa session reste ouverte dans
    ses livres, et sa réponse suivante — qui peut être un code secret — part
    dans le menu qu'on vient d'ouvrir depuis Telegram."""

    def test_le_guichet_lache_sa_session(self):
        from totem.pilotage import Pilotage
        from totem.compte import Compte
        from totem.simulator import ModemSimule
        from totem.storage import Journal

        journal = Journal(":memory:")
        compte = Compte(ModemSimule("Orange"), "Orange")
        guichet = Pilotage(None, [compte], journal)
        guichet._session = {"compte": compte, "vie": 0}

        self.assertTrue(guichet.ceder(compte))
        self.assertIsNone(guichet._session)

    def test_un_autre_compte_ne_le_derange_pas(self):
        from totem.pilotage import Pilotage
        from totem.compte import Compte
        from totem.simulator import ModemSimule
        from totem.storage import Journal

        journal = Journal(":memory:")
        orange = Compte(ModemSimule("Orange"), "Orange")
        mtn = Compte(ModemSimule("MTN"), "MTN")
        guichet = Pilotage(None, [orange, mtn], journal)
        guichet._session = {"compte": orange, "vie": 0}

        self.assertFalse(guichet.ceder(mtn))
        self.assertIsNotNone(guichet._session)

    def test_ouvrir_depuis_telegram_previent_le_guichet(self):
        """Le bout à bout : le robot doit appeler ceder() de lui-même."""
        import sys
        sys.path.insert(0, "tests")
        from test_reglages import TransportEspion
        from totem.app import Robot
        from totem.compte import Compte
        from totem.pilotage import Pilotage
        from totem.simulator import ModemSimule
        from totem.storage import Journal

        journal = Journal(":memory:")
        compte = Compte(ModemSimule("Orange"), "Orange")
        robot = Robot([compte], TransportEspion(), journal)
        robot.pilotage = Pilotage(None, [compte], journal)
        robot.pilotage._session = {"compte": compte, "vie": 0}

        robot._ouvrir_session(compte, "#150#", None)
        self.assertIsNone(robot.pilotage._session,
                          "le guichet garde une session devenue fausse")
