# -*- coding: utf-8 -*-
"""Le guichet à distance : les demandes de l'application web, exécutées.

On ne teste ni Supabase ni un vrai modem — on teste notre discipline face
aux demandes : le résultat écrit, le refus poli quand Telegram a la main,
et surtout le code secret masqué dans la base AVANT d'être composé.
"""

import unittest

from totem.compte import TELEGRAM, WEB, Compte
from totem.modem import USSD_FERMEE, USSD_OUVERTE
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
        self.orphelines = []              # prises en charge, jamais finies
        self.limites_demandees = []

    def commandes_en_attente(self):
        return []

    def commandes_abandonnees(self, avant):
        self.limites_demandees.append(avant)
        return list(self.orphelines)

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


class ModemScripte:
    """Un modem dont chaque envoi USSD rend la réponse suivante du script."""

    def __init__(self, compte):
        self.compte = compte

    def _suivant(self, envoi):
        self.compte.recu.append(envoi)
        etat, texte = self.compte.reponses.pop(0)
        return (USSD_OUVERTE if etat == "ouverte" else USSD_FERMEE), texte

    def ussd_demarrer(self, code):
        return self._suivant(code)

    def ussd_repondre(self, texte):
        return self._suivant(texte)

    def ussd_annuler(self):
        self.compte.raccroches += 1


class FauxCompte(Compte):
    """Un VRAI compte, sur un modem scripté.

    C'était une imitation qui réécrivait l'USSD à sa façon — et qui n'aurait
    donc rien su de la règle que la carte tient désormais elle-même (qui a
    la main sur son menu). Le guichet est éprouvé contre la vraie carte."""

    def __init__(self, reponses, libelle="Orange ·4432"):
        self.reponses = list(reponses)
        self.recu = []              # ce que le « réseau » a réellement reçu
        self.raccroches = 0
        super().__init__(ModemScripte(self), libelle=libelle,
                         carte=FausseCarte())


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
        # Ouverte ailleurs : par Telegram. La carte sait qui la tient.
        compte.session_ouverte = True
        compte.titulaire = (TELEGRAM, None)
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

    def test_une_demande_coupee_en_plein_vol_ne_reste_pas_en_suspens(self):
        """Le robot peut être arrêté entre la prise en charge et le résultat.

        La ligne restait alors « en cours » pour toujours : l'écran attendait
        une réponse qui ne viendrait jamais, et le propriétaire ne savait pas
        si son opération était passée.

        On la marque ÉCHOUÉE — jamais « en attente ». La remettre en file la
        ferait rejouer, alors qu'on ne sait justement pas si le code a été
        composé avant la coupure. Sur un transfert, c'est le doute qu'il faut
        lever, pas l'argent qu'il faut renvoyer.
        """
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        nuage.orphelines = [{"id": 77, "type": "ussd", "etat": "en_cours"}]

        p._abandonner_les_orphelines()

        self.assertEqual(len(nuage.maj), 1)
        identifiant, champs = nuage.maj[0]
        self.assertEqual(identifiant, 77)
        self.assertEqual(champs["etat"], "echouee")
        # Le message renvoie au SOLDE, qui fait foi — dans la langue du robot,
        # quelle qu'elle soit. On n'ancre pas un essai sur une langue : le
        # robot parle anglais par défaut et français sur demande.
        dit = champs["resultat"].lower()
        self.assertTrue("balance" in dit or "solde" in dit, dit)
        # Rien n'a été composé : on ne rejoue pas ce qu'on ne comprend pas.
        self.assertEqual(compte.recu, [])
        # Et la limite demandée est bien une date, pas un nombre de secondes.
        self.assertEqual(len(nuage.limites_demandees), 1)
        from datetime import datetime
        datetime.fromisoformat(nuage.limites_demandees[0])
    def test_le_code_secret_est_efface_MEME_quand_la_session_a_disparu(self):
        """La panne la plus banale de Douala : le courant saute.

        Au redémarrage, `_sessions` repart vide. La réponse au code secret,
        elle, attend toujours dans la base. On la refusait — à raison, il n'y
        a plus de session — mais SANS effacer le code : il restait en clair
        dans le nuage, pour toujours, sans même avoir été composé. Le pire des
        deux mondes. L'effacement passe donc avant tout refus.
        """
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        # Le robot vient de redémarrer : aucune carte n'a de menu ouvert.
        self.assertFalse(compte.session_ouverte)
        p._traiter({"id": 3, "type": "ussd_reponse",
                    "parametres": {"texte": "1234", "secret": True}})

        ecritures = [c for i, c in nuage.maj if i == 3]
        # La commande est bien refusée…
        self.assertEqual(ecritures[-1]["etat"], "echouee")
        # … et le code a QUAND MÊME été effacé de la base.
        self.assertIn({"parametres": {"secret": True}}, ecritures)
        self.assertNotIn("1234", str(ecritures))
        # Rien n'a été composé sur le réseau : il n'y avait plus de session.
        self.assertEqual(compte.recu, [])

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
        self.assertTrue(compte.tenue_par((WEB, None)))
        p._traiter({"id": 7, "type": "ussd_fin", "parametres": {}})
        self.assertFalse(compte.session_ouverte)
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
    du fil. Il fallait le PRÉVENIR (`ceder`), et entre l'avertissement et
    l'écriture, la réponse de la plateforme pouvait encore partir dans le
    menu que Telegram venait d'ouvrir. Il n'y a plus d'avertissement : la
    carte sait qui tient son menu, et refuse au moment d'écrire."""

    def test_la_reponse_web_ne_part_pas_dans_le_menu_de_telegram(self):
        compte = FauxCompte([("ouverte", "Orange Money\n1) Transfert"),
                             ("ouverte", "Menu Telegram\n1) Solde")])
        p, nuage = pilote(compte)
        p._traiter({"id": 1, "type": "ussd", "parametres": {
            "code": "#150#", "carte": compte.carte.iccid, "par": "c:2"}})
        # Telegram reprend la carte : un administrateur compose.
        compte.ussd_demarrer("#144#", qui=(TELEGRAM, None))
        p._traiter({"id": 2, "type": "ussd_reponse", "parametres": {
            "texte": "1234", "secret": True, "carte": compte.carte.iccid,
            "par": "c:2"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertEqual(compte.recu, ["#150#", "#144#"],
                         "le code est parti dans le menu de Telegram")

    def test_un_autre_compte_ne_le_derange_pas(self):
        orange = FauxCompte([("ouverte", "Orange Money\n1) Transfert"),
                             ("ouverte", "Entrez le montant")])
        mtn = FauxCompte([("ouverte", "MTN MoMo")], libelle="MTN ·0011")
        mtn.carte = FausseCarte()
        mtn.carte.iccid = "89237010000000000011"
        p = Pilotage(FauxNuage(), [orange, mtn], FauxJournal())
        p._traiter({"id": 3, "type": "ussd", "parametres": {
            "code": "#150#", "carte": orange.carte.iccid}})
        mtn.ussd_demarrer("*126#", qui=(TELEGRAM, None))
        self.assertTrue(orange.tenue_par((WEB, None)))

    def test_ouvrir_depuis_telegram_reprend_la_carte(self):
        """Le bout à bout, avec le vrai robot et le modem simulé."""
        import sys
        sys.path.insert(0, "tests")
        from test_reglages import TransportEspion
        from totem.app import Robot
        from totem.simulator import ModemSimule
        from totem.storage import Journal

        journal = Journal(":memory:")
        compte = Compte(ModemSimule("Orange"), "Orange")
        robot = Robot([compte], TransportEspion(), journal)
        compte.ussd_demarrer("#150#", qui=(WEB, "c:2"))
        self.assertTrue(compte.tenue_par((WEB, "c:2")))

        robot._ouvrir_session(compte, "#150#", None)
        self.assertFalse(compte.tenue_par((WEB, "c:2")),
                         "la carte croit encore son menu à la plateforme")

    def test_telegram_ne_raccroche_pas_le_menu_de_la_plateforme(self):
        """« Annuler » sur Telegram visait la carte courante, quelle que soit
        la personne qui la tenait — et coupait un transfert mené depuis la
        plateforme, au moment du code secret."""
        import sys
        sys.path.insert(0, "tests")
        from test_reglages import TransportEspion
        from totem.app import Robot
        from totem.simulator import ModemSimule
        from totem.storage import Journal

        journal = Journal(":memory:")
        compte = Compte(ModemSimule("Orange"), "Orange")
        robot = Robot([compte], TransportEspion(), journal)
        compte.ussd_demarrer("#150#", qui=(WEB, "c:2"))
        robot._annuler(None)
        self.assertTrue(compte.tenue_par((WEB, "c:2")),
                        "Telegram a coupé l'opération de la plateforme")


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


class TestChacunSaCarte(unittest.TestCase):
    """Deux personnes, deux cartes : chacune tient la sienne. Une réponse ne
    tombe jamais dans la session de l'autre, un raccrochage ne coupe que la
    sienne, et une ouverture n'interrompt pas l'opération de l'autre."""

    deux_comptes = TestDeuxCartesUneOperation.deux_comptes

    def session_sur_mtn(self):
        orange, mtn = self.deux_comptes()
        mtn.reponses = [("ouverte", "MTN MoMo\n1. Transfert"),
                        ("ouverte", "Entrez le numero")]
        nuage = FauxNuage()
        p = Pilotage(nuage, [orange, mtn], FauxJournal())
        p._traiter({"id": 60, "type": "ussd",
                    "parametres": {"code": "*126#", "carte": mtn.carte.iccid}})
        return orange, mtn, nuage, p

    def test_une_reponse_ne_tombe_pas_dans_la_session_d_une_autre_carte(self):
        orange, mtn, nuage, p = self.session_sur_mtn()
        p._traiter({"id": 61, "type": "ussd_reponse",
                    "parametres": {"texte": "1234", "secret": True,
                                   "carte": orange.carte.iccid}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertEqual(mtn.recu, ["*126#"], "le chiffre est parti chez l'autre")

    def test_la_reponse_de_sa_carte_passe(self):
        orange, mtn, nuage, p = self.session_sur_mtn()
        p._traiter({"id": 62, "type": "ussd_reponse",
                    "parametres": {"texte": "1", "carte": mtn.carte.iccid}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")
        self.assertEqual(mtn.recu, ["*126#", "1"])

    def test_raccrocher_sa_carte_ne_coupe_pas_l_autre(self):
        orange, mtn, nuage, p = self.session_sur_mtn()
        p._traiter({"id": 63, "type": "ussd_fin",
                    "parametres": {"carte": orange.carte.iccid}})
        self.assertTrue(mtn.session_ouverte, "la session de l'autre a été coupée")
        self.assertTrue(mtn.tenue_par((WEB, None)))

    def test_ouvrir_n_interrompt_pas_l_operation_de_l_autre(self):
        orange, mtn, nuage, p = self.session_sur_mtn()
        p._traiter({"id": 64, "type": "ussd",
                    "parametres": {"code": "#150#", "carte": orange.carte.iccid}})
        self.assertTrue(mtn.session_ouverte)
        self.assertEqual(mtn.recu, ["*126#"], "l'opération de l'autre a bougé")

    def test_deux_cartes_travaillent_en_meme_temps(self):
        """LE DÉFAUT VU À DOUALA : deux personnes, deux cartes, deux modems
        libres — et la seconde lisait « une autre opération est en cours sur
        le terminal, sur une autre carte ». Chaque carte a son modem : les
        deux opérations avancent, chacune dans son menu."""
        orange, mtn, nuage, p = self.session_sur_mtn()
        orange.reponses = [("ouverte", "Orange Money\n1) Transfert"),
                           ("fermee", "Solde : 3673510 FCFA")]
        p._traiter({"id": 66, "type": "ussd",
                    "parametres": {"code": "#150#", "carte": orange.carte.iccid}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite",
                         nuage.maj[-1][1].get("resultat"))
        self.assertTrue(orange.tenue_par((WEB, None)))
        self.assertTrue(mtn.tenue_par((WEB, None)))
        # Les réponses s'entrelacent : chacune tombe dans SON menu.
        p._traiter({"id": 67, "type": "ussd_reponse",
                    "parametres": {"texte": "1", "carte": mtn.carte.iccid}})
        p._traiter({"id": 68, "type": "ussd_reponse",
                    "parametres": {"texte": "4", "carte": orange.carte.iccid}})
        self.assertEqual(mtn.recu, ["*126#", "1"])
        self.assertEqual(orange.recu, ["#150#", "4"])
        self.assertTrue(all(c["etat"] == "faite" for i, c in nuage.maj
                            if i in (66, 67, 68) and "resultat" in c))
        # La session finie d'Orange se libère ; celle de MTN reste.
        self.assertFalse(orange.session_ouverte)
        self.assertTrue(mtn.tenue_par((WEB, None)))

    def test_sans_carte_et_deux_sessions_on_ne_devine_pas(self):
        """Une réponse qui ne nomme pas sa carte, quand DEUX sessions sont
        ouvertes : la donner à l'une au hasard, c'est peut-être envoyer un
        code secret chez quelqu'un d'autre. Refusée — et effacée quand même."""
        orange, mtn, nuage, p = self.session_sur_mtn()
        orange.reponses = [("ouverte", "Orange Money\n1) Transfert")]
        p._traiter({"id": 69, "type": "ussd",
                    "parametres": {"code": "#150#", "carte": orange.carte.iccid}})
        p._traiter({"id": 70, "type": "ussd_reponse",
                    "parametres": {"texte": "1234", "secret": True}})
        ecritures = [c for i, c in nuage.maj if i == 70]
        self.assertEqual(ecritures[-1]["etat"], "echouee")
        self.assertNotIn("1234", str(ecritures))
        self.assertEqual(mtn.recu, ["*126#"])
        self.assertEqual(orange.recu, ["#150#"])
        # Raccrocher sans carte non plus : on ne coupe personne au hasard.
        p._traiter({"id": 71, "type": "ussd_fin", "parametres": {}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")
        self.assertTrue(mtn.session_ouverte and orange.session_ouverte)

    def test_sans_carte_le_geste_d_avant_marche(self):
        """Une application pas encore mise à jour n'envoie pas la carte avec
        ses réponses : celle du propriétaire continue de fonctionner."""
        orange, mtn, nuage, p = self.session_sur_mtn()
        p._traiter({"id": 65, "type": "ussd_reponse", "parametres": {"texte": "1"}})
        self.assertEqual(nuage.maj[-1][1]["etat"], "faite")

    def test_le_code_s_efface_mais_la_carte_reste(self):
        """Le code secret s'efface ; la CARTE, elle, reste écrite.

        L'effacement écrivait `{"secret": True}` tout court, et la carte
        partait avec le code. Or c'est elle qui dit, sur la plateforme, à qui
        la demande appartient : le titulaire de la MTN tapait son code,
        l'argent partait, et il ne pouvait plus lire la réponse du réseau —
        « demande introuvable », sur sa propre carte."""
        orange, mtn, nuage, p = self.session_sur_mtn()
        mtn.reponses.append(("fermee", "Transfert reussi. Nouveau solde 4 500 F."))
        p._traiter({"id": 66, "type": "ussd_reponse",
                    "parametres": {"texte": "1234", "secret": True,
                                   "carte": mtn.carte.iccid}})
        ecritures = [c for i, c in nuage.maj if i == 66]
        masque = {"secret": True, "carte": mtn.carte.iccid}
        # Les DEUX écritures qui effacent : avant de composer, et la finale.
        self.assertEqual(ecritures[1], {"parametres": masque})
        self.assertEqual(ecritures[-1]["parametres"], masque)
        self.assertEqual(ecritures[-1]["etat"], "faite")
        self.assertNotIn("1234", str(ecritures))
        self.assertEqual(mtn.recu[-1], "1234")


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


class TestUneFileParCarte(unittest.TestCase):
    """Ne plus refuser ne suffit pas : la relève exécutait les demandes UNE
    par une, et composer un code, c'est attendre le réseau plusieurs
    secondes. L'Orange de l'un attendait donc la MTN de l'autre, sur un modem
    pourtant libre. Chaque carte a maintenant sa file."""

    def test_une_carte_lente_ne_retient_pas_l_autre(self):
        import threading
        orange, mtn = TestDeuxCartesUneOperation.deux_comptes(self)
        lache = threading.Event()
        repondu = threading.Event()

        lent = mtn.ussd_demarrer
        def ussd_lent(code, **k):   # le réseau MTN tarde à répondre
            lache.wait(5)
            return lent(code, **k)
        mtn.ussd_demarrer = ussd_lent

        rapide = orange.ussd_demarrer
        def ussd_rapide(code, **k):
            r = rapide(code, **k)
            repondu.set()
            return r
        orange.ussd_demarrer = ussd_rapide

        nuage = FauxNuage()
        p = Pilotage(nuage, [orange, mtn], FauxJournal())
        p._marche = True
        try:
            p._distribuer({"id": 80, "type": "ussd", "parametres": {
                "code": "*126#", "carte": mtn.carte.iccid}})
            p._distribuer({"id": 81, "type": "ussd", "parametres": {
                "code": "#150#", "carte": orange.carte.iccid}})
            self.assertTrue(repondu.wait(2),
                            "l'Orange a attendu que la MTN ait fini")
        finally:
            lache.set()
            p._marche = False

    def test_une_demande_n_est_confiee_qu_une_fois(self):
        """La demande reste « en attente » dans la base tant que sa file ne
        l'a pas réclamée : la relève suivante la revoit. Elle ne doit pas
        partir deux fois dans la file."""
        import threading
        compte = FauxCompte([("fermee", "Solde : 1000 FCFA")])
        bloque = threading.Event()
        vrai = compte.ussd_demarrer
        def ussd(code, **k):
            bloque.wait(5)
            return vrai(code, **k)
        compte.ussd_demarrer = ussd
        p, nuage = pilote(compte)
        p._marche = True
        try:
            demande = {"id": 90, "type": "ussd", "parametres": {
                "code": "#150#", "carte": compte.carte.iccid}}
            p._distribuer(demande)
            p._distribuer(demande)
            p._distribuer(demande)
            bloque.set()
            for _ in range(100):
                if not p._en_vol:
                    break
                import time
                time.sleep(0.02)
            self.assertEqual(nuage.reclamations, [90])
            self.assertEqual(compte.recu, ["#150#"])
        finally:
            bloque.set()
            p._marche = False
