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
        self.reveils = 0

    def commandes_en_attente(self):
        return []

    def reveiller(self):
        self.reveils += 1

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
    def __init__(self, registre=(FausseCarte.iccid,)):
        self.evenements = []
        self.registre = set(registre)   # les ICCID connus du terminal
        self.identites = []             # (iccid, champs) enregistrés

    def evenement(self, texte):
        self.evenements.append(texte)

    def definir_identite(self, iccid, numero=None, nom=None):
        if iccid not in self.registre:
            return False
        champs = {}
        if numero is not None:
            champs["numero"] = numero
        if nom is not None:
            champs["nom"] = nom
        self.identites.append((iccid, champs))
        return True


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
        self.assertEqual(nuage.maj[-1][1]["resultat"], "Session closed.")


class TestLaLangueDeLaDemande(unittest.TestCase):
    """Chaque commande de la plateforme porte sa langue : la réponse repart
    dans celle-là, quelle que soit la langue du robot."""

    def test_le_refus_suit_la_langue_de_la_commande(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        p._traiter({"id": 30, "type": "ussd_reponse",
                    "parametres": {"texte": "1", "langue": "fr"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertIn("Aucune session en cours", nuage.maj[-1][1]["resultat"])

    def test_le_resultat_suit_la_langue_de_la_commande(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        p._traiter({"id": 31, "type": "ussd_fin",
                    "parametres": {"langue": "fr"}})
        self.assertEqual(nuage.maj[-1][1]["resultat"], "Session refermée.")

    def test_sans_langue_le_robot_parle_sa_langue(self):
        from totem import textes
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        textes.definir_langue("fr")
        try:
            p._traiter({"id": 32, "type": "ussd_fin", "parametres": {}})
        finally:
            textes.definir_langue("en")
        self.assertEqual(nuage.maj[-1][1]["resultat"], "Session refermée.")


class TestIdentiteDepuisLaPlateforme(unittest.TestCase):
    """Le numéro et le nom d'une carte, réglés depuis l'application web —
    exactement comme /reglages sur Telegram. C'est ce numéro qui dit, ensuite,
    de quel côté d'un dépôt se trouve le terminal."""

    def test_numero_enregistre_et_cloud_reveille(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        p._traiter({"id": 20, "type": "identite",
                    "parametres": {"iccid": FausseCarte.iccid, "numero": "696103864"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")
        self.assertEqual(p.journal.identites, [(FausseCarte.iccid, {"numero": "696103864"})])
        self.assertEqual(nuage.reveils, 1)      # le web le voit tout de suite

    def test_numero_invalide_refuse_sans_rien_ecrire(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        p._traiter({"id": 21, "type": "identite",
                    "parametres": {"iccid": FausseCarte.iccid, "numero": "12"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertEqual(p.journal.identites, [])

    def test_carte_inconnue_du_registre_refusee(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        p._traiter({"id": 22, "type": "identite",
                    "parametres": {"iccid": "00000000000000000000", "numero": "696103864"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertEqual(p.journal.identites, [])

    def test_le_nom_seul_est_accepte(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        p._traiter({"id": 23, "type": "identite",
                    "parametres": {"iccid": FausseCarte.iccid, "nom": "WONDER PHONE"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")
        self.assertEqual(p.journal.identites, [(FausseCarte.iccid, {"nom": "WONDER PHONE"})])


class TestRecuApresCoup(unittest.TestCase):
    """Le reçu d'un message passé, établi à la demande de la plateforme."""

    def test_un_recu_est_programme(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        p.programmeur = lambda source_id, nature=None, langue=None: f"TM-2026-0801-{source_id:04d}"
        p._traiter({"id": 9, "type": "recu", "parametres": {"source_id": 42}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")
        self.assertIn("TM-2026-0801-0042", nuage.maj[-1][1]["resultat"])

    def test_la_nature_choisie_est_transmise(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        recues = []

        def programmeur(source_id, nature=None, langue=None):
            recues.append((source_id, nature))
            return "TM-2026-0805-0042"

        p.programmeur = programmeur
        p._traiter({"id": 30, "type": "recu",
                    "parametres": {"source_id": 42, "nature": "transfert"}})
        self.assertEqual(recues, [(42, "transfert")])
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")

    def test_une_nature_inconnue_est_ignoree(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        recues = []

        def programmeur(source_id, nature=None, langue=None):
            recues.append((source_id, nature))
            return "TM-2026-0805-0042"

        p.programmeur = programmeur
        p._traiter({"id": 31, "type": "recu",
                    "parametres": {"source_id": 42, "nature": "fantaisie"}})
        self.assertEqual(recues, [(42, None)])

    def test_un_message_sans_droit_est_refuse(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        p.programmeur = lambda source_id, nature=None, langue=None: None   # publicité, code, échec…
        p._traiter({"id": 10, "type": "recu", "parametres": {"source_id": 7}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertIn("does not carry what that receipt needs", nuage.maj[-1][1]["resultat"])

    def test_sans_fabrique_le_refus_est_poli(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)          # programmeur absent
        p._traiter({"id": 11, "type": "recu", "parametres": {"source_id": 1}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")


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


class TestDeuxCartesUneOperation(unittest.TestCase):
    """Deux SIM en place — Orange ET MTN. Chaque demande de la plateforme dit
    sur QUELLE carte composer, par ICCID : le seul nom sans ambiguïté d'une
    puce. Sans ce ciblage, une opération MTN partait sur la première carte
    venue — c'est-à-dire l'Orange."""

    def deux_comptes(self):
        orange = FauxCompte([("ouverte", "Orange Money\n1) Transfert")])
        mtn = FauxCompte([("ouverte", "MTN MoMo\n1. Transfert d'argent")],
                         libelle="MTN ·0011")
        mtn.carte = FausseCarte()
        mtn.carte.iccid = "89237010000000000011"
        mtn.carte.operateur = "MTN"
        return orange, mtn

    def test_l_iccid_choisit_la_carte(self):
        orange, mtn = self.deux_comptes()
        p = Pilotage(FauxNuage(), [orange, mtn], FauxJournal())
        p._traiter({"id": 40, "type": "ussd",
                    "parametres": {"code": "*126#", "carte": mtn.carte.iccid}})
        self.assertEqual(mtn.recu, ["*126#"])
        self.assertEqual(orange.recu, [], "l'Orange ne doit pas être touchée")

    def test_sans_ciblage_la_premiere_carte_repond(self):
        """Le terminal à une seule habitude : rien ne casse pour lui."""
        orange, mtn = self.deux_comptes()
        p = Pilotage(FauxNuage(), [orange, mtn], FauxJournal())
        p._traiter({"id": 41, "type": "ussd", "parametres": {"code": "#148#"}})
        self.assertEqual(orange.recu, ["#148#"])
        self.assertEqual(mtn.recu, [])

    def test_un_iccid_inconnu_est_refuse_sans_composer(self):
        orange, mtn = self.deux_comptes()
        nuage = FauxNuage()
        p = Pilotage(nuage, [orange, mtn], FauxJournal())
        p._traiter({"id": 42, "type": "ussd",
                    "parametres": {"code": "*126#",
                                   "carte": "00000000000000000000"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertEqual(orange.recu, [])
        self.assertEqual(mtn.recu, [])

    def test_le_libelle_reste_accepte(self):
        """Le geste historique de Telegram (« mtn *126# ») ne casse pas."""
        orange, mtn = self.deux_comptes()
        p = Pilotage(FauxNuage(), [orange, mtn], FauxJournal())
        p._traiter({"id": 43, "type": "ussd",
                    "parametres": {"code": "*126#", "compte": "mtn"}})
        self.assertEqual(mtn.recu, ["*126#"])


class TestLibelleAmbiguRefusePoliment(unittest.TestCase):
    """Deux cartes MTN et une demande « compte: mtn » : le préfixe visait la
    première en silence. On refuse — l'ICCID, lui, ne se trompe jamais."""

    def test_deux_cartes_du_meme_prefixe(self):
        mtn_a = FauxCompte([], libelle="MTN ·0011")
        mtn_b = FauxCompte([], libelle="MTN ·0099")
        nuage = FauxNuage()
        p = Pilotage(nuage, [mtn_a, mtn_b], FauxJournal())
        p._traiter({"id": 50, "type": "ussd",
                    "parametres": {"code": "*126#", "compte": "mtn"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertIn("Several cards", nuage.maj[-1][1]["resultat"])
        self.assertEqual(mtn_a.recu, [])
        self.assertEqual(mtn_b.recu, [])

    def test_le_prefixe_complet_reste_precis(self):
        mtn_a = FauxCompte([("ouverte", "MoMo")], libelle="MTN ·0011")
        mtn_b = FauxCompte([], libelle="MTN ·0099")
        p = Pilotage(FauxNuage(), [mtn_a, mtn_b], FauxJournal())
        p._traiter({"id": 51, "type": "ussd",
                    "parametres": {"code": "*126#", "compte": "mtn ·0011"}})
        self.assertEqual(mtn_a.recu, ["*126#"])
        self.assertEqual(mtn_b.recu, [])


class TestRaccourciDepuisLaPlateforme(unittest.TestCase):
    """Un bouton USSD créé, corrigé ou retiré depuis les Réglages du web.

    Même carnet que l'apprentissage 💾, mêmes garde-fous : la première
    étape est un code, les suivantes des choix de menu — jamais un montant,
    un numéro ou le code secret. C'est le robot qui revérifie, pas l'écran.
    """

    def pilote_reel(self):
        from totem.storage import Journal
        journal = Journal(":memory:")
        nuage = FauxNuage()
        p = Pilotage(nuage, [FauxCompte([])], journal)
        return p, journal, nuage

    def test_definir_un_bouton_entre_au_carnet(self):
        p, journal, nuage = self.pilote_reel()
        p._traiter({"id": 60, "type": "raccourci",
                    "parametres": {"operateur": "MTN", "cle": "depot",
                                   "libelle": "Dépôt",
                                   "etapes": ["*126#", "1", "1"]}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")
        appris = journal.raccourcis("MTN")
        self.assertEqual(appris["depot"]["etapes"], ["*126#", "1", "1"])
        self.assertGreaterEqual(nuage.reveils, 1,
                                "l'écran doit le voir au rafraîchissement")

    def test_la_premiere_etape_doit_etre_un_code(self):
        p, journal, nuage = self.pilote_reel()
        p._traiter({"id": 61, "type": "raccourci",
                    "parametres": {"operateur": "MTN", "cle": "depot",
                                   "etapes": ["1234"]}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertEqual(journal.raccourcis("MTN"), {})

    def test_un_code_secret_ne_peut_pas_devenir_une_etape(self):
        """Quatre chiffres après le code : la forme d'un PIN. Refusé —
        un bouton s'arrête à la question, l'utilisateur répond."""
        p, journal, nuage = self.pilote_reel()
        p._traiter({"id": 62, "type": "raccourci",
                    "parametres": {"operateur": "MTN", "cle": "solde",
                                   "etapes": ["*126#", "5", "1234"]}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertEqual(journal.raccourcis("MTN"), {})

    def test_supprimer_retire_le_bouton(self):
        p, journal, nuage = self.pilote_reel()
        journal.ajouter_raccourci("MTN", "solde", "Solde", ["*126#", "5"])
        p._traiter({"id": 63, "type": "raccourci",
                    "parametres": {"operateur": "MTN", "cle": "solde",
                                   "action": "supprimer"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")
        self.assertEqual(journal.raccourcis("MTN"), {})

    def test_une_demande_incomplete_est_refusee(self):
        p, journal, nuage = self.pilote_reel()
        p._traiter({"id": 64, "type": "raccourci",
                    "parametres": {"operateur": "", "cle": "depot",
                                   "etapes": ["*126#"]}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
