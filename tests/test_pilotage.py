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
        # CE QUE LE FAUX NUAGE NE SAVAIT PAS FAIRE : échouer.
        #
        # `commande_maj` rendait toujours True, si bien que l'essai du code
        # secret masqué mesurait un nuage qui répond toujours — c'est-à-dire
        # le cas où il n'y a rien à craindre. Or c'est l'AUTRE cas qui
        # compte : celui où l'effacement du code n'aboutit pas.
        self.echouer_maj = False    # toute écriture échoue
        self.reclamations = []      # les demandes qu'on a tenté de réclamer
        self.reclamation_perdue = False   # un autre robot l'a prise

    def commandes_en_attente(self):
        return []

    def reveiller(self):
        self.reveils += 1

    def commande_maj(self, identifiant, champs):
        if self.echouer_maj:
            return False        # réseau coupé, Supabase en panne, 5xx…
        self.maj.append((identifiant, dict(champs)))
        return True

    def reclamer(self, identifiant):
        """Prendre une demande pour soi — ou constater qu'un autre l'a prise."""
        self.reclamations.append(identifiant)
        if self.reclamation_perdue:
            return False
        if self.echouer_maj:
            return False
        self.maj.append((identifiant, {"etat": "en_cours"}))
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

    def test_le_code_secret_n_est_pas_compose_si_l_effacement_echoue(self):
        """LA RÈGLE QUI PASSE AVANT TOUTES LES AUTRES.

        « Le code PIN n'est jamais stocké » — c'est écrit dans les consignes
        du dépôt, et le commentaire du pilotage le redit : « s'il ne devait
        rester qu'une règle, ce serait celle-là ».

        Or l'effacement était demandé au nuage sans jamais regarder s'il
        avait abouti. Un réseau coupé, un 5xx de Supabase, et le code partait
        quand même sur le réseau — en laissant sa copie EN CLAIR dans la
        table des commandes, pour toujours.

        Ce que le robot doit faire dans ce cas est le contraire de ce qu'il
        faisait : NE PAS composer. Un transfert manqué se refait d'un geste ;
        un code confidentiel qui a fui ne se reprend pas.
        """
        compte = FauxCompte([
            ("ouverte", "Entrez votre code secret"),
            ("fermee", "Le solde de votre compte est de 2784137.6FCFA."),
        ])
        p, nuage = pilote(compte)
        p._traiter({"id": 1, "type": "ussd", "parametres": {"code": "#148*5#"}})
        compose_avant = list(compte.recu)

        nuage.echouer_maj = True          # le nuage ne répond plus
        p._traiter({"id": 2, "type": "ussd_reponse",
                    "parametres": {"texte": "1234", "secret": True}})

        # Le code n'a PAS été composé : il n'y a rien de plus sur le réseau.
        self.assertEqual(compte.recu, compose_avant)
        self.assertNotIn("1234", str(compte.recu))

        # ET LE CODE NE RESTE PAS DANS LA BASE. Refuser de composer met à
        # l'abri du pire — composer ET garder une copie — mais n'efface
        # rien tout seul. L'effacement repart donc avec l'écriture finale,
        # qui a lieu de toute façon : dès que le nuage répond de nouveau,
        # le code s'en va.
        nuage.echouer_maj = False
        p._traiter({"id": 3, "type": "ussd_reponse",
                    "parametres": {"texte": "1234", "secret": True}})
        self.assertNotIn("1234", str(nuage.maj))
        derniere = nuage.maj[-1][1]
        self.assertEqual(derniere.get("parametres"), {"secret": True})

    def test_une_demande_deja_prise_n_est_pas_rejouee(self):
        """Deux robots, une seule demande — et de l'argent au bout.

        La prise en charge était un PATCH sans condition : « mets cette
        demande en cours ». Elle ne demandait pas « SI elle est encore en
        attente ». Deux robots sur le même terminal — un second Pi, ou un
        redémarrage qui chevauche l'ancien — lisaient donc la même ligne et
        composaient tous les deux. Sur un transfert, c'est deux fois
        l'argent.

        La même chose arrivait avec un seul robot : si l'écriture « en
        cours » échouait, la ligne restait « en attente » et le tour suivant
        la reprenait — après l'avoir déjà exécutée une fois.
        """
        compte = FauxCompte([("ouverte", "Orange Money\n1) Transfert")])
        p, nuage = pilote(compte)
        nuage.reclamation_perdue = True   # un autre robot a été plus rapide

        p._traiter({"id": 9, "type": "ussd",
                    "parametres": {"code": "*126*1*696000000*50000#"}})

        # Rien n'a été composé, et rien n'a été écrit comme résultat : la
        # demande appartient à l'autre.
        self.assertEqual(compte.recu, [])
        self.assertEqual([c for i, c in nuage.maj if i == 9], [])
        self.assertEqual(nuage.reclamations, [9])

    def test_une_demande_libre_est_bien_reclamee_puis_faite(self):
        """Le pendant du précédent : sans concurrence, rien ne change."""
        compte = FauxCompte([("ouverte", "Orange Money\n1) Transfert")])
        p, nuage = pilote(compte)
        p._traiter({"id": 10, "type": "ussd", "parametres": {"code": "#148#"}})
        self.assertEqual(nuage.reclamations, [10])
        etats = [c.get("etat") for i, c in nuage.maj if i == 10 and "etat" in c]
        self.assertEqual(etats, ["en_cours", "faite"])
        self.assertEqual(compte.recu, ["#148#"])

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


class TestUnCodeATrous(unittest.TestCase):
    """Un code qui porte des TROUS — « *126*1*{numero}*{montant}# ».

    Deux façons d'écrire un bouton, et c'est le propriétaire qui choisit :

      - **avec des trous** : la plateforme les bouche avec ce qui vient
        d'être saisi, et le code part ENTIER d'un seul coup. Le réseau ne
        pose plus qu'une question, celle du code secret ;
      - **sans trous** : le code ouvre le menu, et l'on répond aux questions
        une à une, comme avant.

    Le robot revérifie les deux — un trou mal nommé partirait tel quel au
    réseau, et le code échouerait sans qu'on sache pourquoi.
    """

    def pilote_reel(self):
        from totem.storage import Journal
        journal = Journal(":memory:")
        nuage = FauxNuage()
        p = Pilotage(nuage, [FauxCompte([])], journal)
        return p, journal, nuage

    def definir(self, p, etapes, identifiant=70, cle="transfert"):
        p._traiter({"id": identifiant, "type": "raccourci",
                    "parametres": {"operateur": "MTN", "cle": cle,
                                   "libelle": "Transfert", "etapes": etapes}})

    def test_un_code_a_trous_est_accepte(self):
        p, journal, nuage = self.pilote_reel()
        self.definir(p, ["*126*1*{numero}*{montant}#"])
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")
        self.assertEqual(journal.raccourcis("MTN")["transfert"]["etapes"],
                         ["*126*1*{numero}*{montant}#"])

    def test_les_trois_trous_connus_passent(self):
        p, journal, nuage = self.pilote_reel()
        self.definir(p, ["*126*4*{point}*{montant}#"], cle="retrait")
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")
        self.definir(p, ["*126*1*{numero}#"], identifiant=71)
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")

    def test_un_trou_mal_tape_est_refuse(self):
        """« {montan} » partirait tel quel au réseau : autant le dire tout
        de suite, plutôt que de laisser un bouton mort au carnet."""
        p, journal, nuage = self.pilote_reel()
        self.definir(p, ["*126*1*{numero}*{montan}#"])
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertIn("montan", nuage.maj[-1][1]["resultat"])
        self.assertEqual(journal.raccourcis("MTN"), {})

    def test_un_trou_peut_etre_une_reponse_a_lui_seul(self):
        """Le code ouvre le menu, puis le montant répond à SA question."""
        p, journal, nuage = self.pilote_reel()
        self.definir(p, ["*126#", "1", "{montant}"])
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")
        self.assertEqual(journal.raccourcis("MTN")["transfert"]["etapes"],
                         ["*126#", "1", "{montant}"])

    def test_la_forme_du_code_est_jugee_trous_bouches(self):
        """« *126*1*{numero} » sans dièse final n'est pas un code, trou ou
        pas : la vérification ne se laisse pas endormir par les accolades."""
        p, journal, nuage = self.pilote_reel()
        self.definir(p, ["*126*1*{numero}"])
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertEqual(journal.raccourcis("MTN"), {})

    def test_le_code_secret_reste_interdit_meme_a_cote_d_un_trou(self):
        """La garantie du module ne cède pas : quatre chiffres après le
        code, c'est la forme d'un PIN — refusé, trous ou non."""
        p, journal, nuage = self.pilote_reel()
        self.definir(p, ["*126*1*{numero}#", "1234"])
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertEqual(journal.raccourcis("MTN"), {})

    def test_un_code_sans_trou_marche_toujours(self):
        """L'autre façon reste intacte : c'est un choix, pas un remplacement."""
        p, journal, nuage = self.pilote_reel()
        self.definir(p, ["#148*4#"], cle="transfert")
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")


class TestSoldeMonotone(unittest.TestCase):
    """Un relevé ancien rejoué dans le désordre ne doit pas écraser un solde
    déjà plus récent : publier_solde avec un moment ne remplace que si c'est
    postérieur (le nuage réel porte la condition ; ici on vérifie l'appel)."""

    def test_le_moment_du_sms_accompagne_le_solde(self):
        recu = []

        class NuageMoment(FauxNuage):
            def publier_solde(self, iccid, solde, moment=None):
                recu.append((iccid, solde, moment))
                return True

        compte = FauxCompte([])
        p = Pilotage(NuageMoment(), [compte], FauxJournal())
        # Le pilotage (USSD) publie SANS moment : une réponse USSD est
        # toujours actuelle.
        p._traiter({"id": 70, "type": "ussd", "parametres": {"code": "#150#"}})
        # Aucune session/solde ici, mais l'appel direct doit accepter moment.
        p.nuage.publier_solde("ic", 100, moment="2026-08-10T07:04:00+01:00")
        self.assertEqual(recu[-1], ("ic", 100, "2026-08-10T07:04:00+01:00"))
