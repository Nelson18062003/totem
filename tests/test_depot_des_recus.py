# -*- coding: utf-8 -*-
"""Le reçu va sur la plateforme D'ABORD — Telegram ensuite, de son côté.

LA PANNE VÉCUE. « Ça prend trop de temps pour générer les PDF ; je reçois le
PDF sur Telegram, et sur le téléphone je dois encore refaire le reçu. »
Fabriquer le PDF prend une quinzaine de millisecondes : ce n'était pas la
fabrication. C'était l'ORDRE. Un reçu inscrit attendait dix secondes (le
délai qui laisse l'alerte texte partir la première sur Telegram), puis le
tour de surveillance suivant, partait sur Telegram — et n'était déposé sur
la plateforme qu'APRÈS que Telegram l'avait pris. Telegram lent : le
téléphone attendait. Telegram en panne : le téléphone n'avait rien, jamais.
Et une demande faite depuis l'application subissait les mêmes dix secondes.

CE QUE CES TESTS GARDENT :

  1. la plateforme reçoit le document dès qu'il est inscrit, Telegram en
     panne ou pas ;
  2. Telegram garde son délai : l'alerte texte part toujours AVANT le PDF ;
  3. chaque chemin a ses reprises : renoncer à Telegram ne renonce pas à la
     plateforme, et l'inverse ;
  4. une demande de l'application est déposée AVANT qu'on lui réponde ;
  5. redemander le même reçu ne le refait pas — on rend celui qui existe ;
     mais un document dont le CONTENU a changé (l'identité inscrite aux
     Réglages) se refait, et l'écran l'apprend ;
  6. « déposé » se PROUVE (une empreinte), il ne se déduit pas d'un drapeau
     que l'ancien code posait aussi en renonçant ;
  7. un document qui échoue à la fabrication ne brûle pas ses essais d'un
     trait ; deux dépôts croisés ne laissent pas l'ancien document en place ;
     une demande ne part pas deux fois ;
  8. le démarrage du robot lance le fil du dépôt — pas le harnais à sa place.

LE TÉMOIN. `distribuer_a_l_ancienne` est l'ancien ordre, réécrit en quelques
lignes : Telegram d'abord, la plateforme seulement après. Les mêmes
exigences sont jouées contre lui, et il doit y ÉCHOUER — sans quoi ces
tests ne prouveraient rien.

Lancer :  python3 -m unittest tests.test_depot_des_recus
"""

import threading
import time
import unittest

from totem.app import DELAI_RECU
from totem.pilotage import Pilotage

from tests.test_recus import (MTN_SORTANT, TRANSFERT_ORANGE,
                              TRANSFERT_ORANGE_EN, TransportEspion,
                              _distribuer, _robot)


class FauxNuage:
    """La plateforme vue du robot : elle retient ce qu'on lui dépose."""

    actif = True

    def __init__(self, repond=True):
        self.repond = repond
        self.depots = []           # (nom, fiche, instant)

    def archiver_recu(self, nom, contenu, fiche=None):
        if not self.repond:
            return False
        assert bytes(contenu[:5]) == b"%PDF-"
        self.depots.append((nom, fiche, time.monotonic()))
        return True

    # Ce que le robot appelle ailleurs sans que cela compte ici.
    def reveiller(self):
        pass

    def publier_solde(self, *a, **k):
        pass


class TelegramEnPanne(TransportEspion):
    """Les messages passent, les fichiers non — le cas d'un envoi de
    document qui échoue (limite, réseau lent, refus)."""

    def __init__(self):
        super().__init__(accepte_fichiers=False)


def distribuer_a_l_ancienne(robot):
    """LE TÉMOIN : l'ordre d'avant, en quelques lignes. Telegram d'abord ;
    la plateforme ne voit que ce que Telegram a pris (« envoye = 1 »)."""
    j = robot.journal
    for ligne in j.recus_a_envoyer(-60):          # mûr, comme `_distribuer`
        nom, pdf, legende = robot._fabriquer_recu(ligne)
        if robot.transport.envoyer_fichier(nom, pdf, legende,
                                           type_mime="application/pdf"):
            j.recu_envoye(ligne[0])
        else:
            j.recu_echoue(ligne[0])
            break
    envoyes = {i for (i,) in j.conn.execute(
        "SELECT id FROM recus WHERE envoye = 1").fetchall()}
    lignes = [l for l in j.recus_a_archiver() if l[0] in envoyes]
    for ligne in lignes:
        nom, pdf, _ = robot._fabriquer_recu(ligne)
        if robot.nuage.archiver_recu(nom, pdf, robot._fiche_recu(ligne)):
            j.recu_archive(ligne[0])


def distribuer_a_l_ancienne_sans_forcer(robot):
    """Le témoin, au vrai délai : ce que l'ancien tour faisait juste après
    la relève."""
    vraie = robot.journal.recus_a_envoyer
    robot.journal.recus_a_envoyer = lambda apres=0, limite=5: vraie(DELAI_RECU, limite)
    try:
        distribuer_a_l_ancienne(robot)
    finally:
        robot.journal.recus_a_envoyer = vraie


def _avec_un_encaissement(transport=None, nuage=None, texte=TRANSFERT_ORANGE):
    robot, compte, modem, journal = _robot(transport=transport)
    robot.nuage = nuage or FauxNuage()
    modem.sms_en_attente.append((1, "OrangeMoney", texte))
    robot._relever_sms(compte)
    return robot, compte, modem, journal


class TestLaPlateformeDAbord(unittest.TestCase):

    def test_telegram_en_panne_le_recu_arrive_quand_meme(self):
        robot, _, _, _ = _avec_un_encaissement(transport=TelegramEnPanne())
        robot._distribuer_recus()
        self.assertEqual(len(robot.nuage.depots), 1,
                         "Telegram en panne a privé la plateforme du reçu")
        self.assertEqual(robot.transport.fichiers, [])

    def test_temoin_l_ancien_ordre_echoue(self):
        """La même exigence contre l'ordre d'avant : il ne dépose RIEN."""
        robot, _, _, _ = _avec_un_encaissement(transport=TelegramEnPanne())
        distribuer_a_l_ancienne(robot)
        self.assertEqual(robot.nuage.depots, [],
                         "le témoin passe : ce test ne prouverait rien")

    def test_le_depot_n_attend_pas_le_delai_de_telegram(self):
        """Tout de suite après la relève — sans faire mûrir le reçu — la
        plateforme l'a ; Telegram, lui, attend encore son délai."""
        robot, _, _, _ = _avec_un_encaissement()
        robot._distribuer_recus()                 # le vrai délai, pas forcé
        self.assertEqual(len(robot.nuage.depots), 1)
        self.assertEqual(robot.transport.fichiers, [],
                         "le PDF a doublé l'alerte sur Telegram")
        # L'alerte texte, elle, est partie à la relève.
        self.assertEqual(len(robot.transport.messages), 1)

    def test_temoin_l_ancien_ordre_attend_telegram(self):
        robot, _, _, journal = _avec_un_encaissement()
        # L'ancien ordre, au moment où le nouveau a déjà déposé : avant la
        # maturité de Telegram, la plateforme n'a rien.
        self.assertEqual(journal.recus_a_envoyer(DELAI_RECU), [])
        distribuer_a_l_ancienne_sans_forcer(robot)
        self.assertEqual(robot.nuage.depots, [])

    def test_l_alerte_part_avant_le_pdf(self):
        robot, _, _, journal = _avec_un_encaissement()
        self.assertEqual(len(robot.transport.messages), 1)
        self.assertEqual(robot.transport.fichiers, [])
        _distribuer(robot, journal)               # maturité forcée
        self.assertEqual(len(robot.transport.fichiers), 1)
        self.assertEqual(len(robot.nuage.depots), 1)   # pas de second dépôt


class TestChacunSesReprises(unittest.TestCase):

    def test_plateforme_en_panne_telegram_part_quand_meme(self):
        nuage = FauxNuage(repond=False)
        robot, _, _, journal = _avec_un_encaissement(nuage=nuage)
        _distribuer(robot, journal)
        self.assertEqual(len(robot.transport.fichiers), 1)
        self.assertEqual(nuage.depots, [])
        nuage.repond = True                       # la plateforme revient
        robot._distribuer_recus()
        self.assertEqual(len(nuage.depots), 1)
        self.assertEqual(len(robot.transport.fichiers), 1)   # pas de renvoi

    def test_renoncer_a_telegram_ne_renonce_pas_a_la_plateforme(self):
        nuage = FauxNuage(repond=False)
        robot, _, _, journal = _avec_un_encaissement(
            transport=TelegramEnPanne(), nuage=nuage)
        identifiant = journal.conn.execute("SELECT id FROM recus").fetchone()[0]
        for _ in range(60):                       # Telegram abandonne
            journal.recu_echoue(identifiant)
        envoye, archive = journal.conn.execute(
            "SELECT envoye, archive FROM recus").fetchone()
        self.assertEqual((envoye, archive), (1, 0))
        nuage.repond = True
        robot._distribuer_recus()
        self.assertEqual(len(nuage.depots), 1)

    def test_temoin_l_ancien_abandon_emportait_les_deux(self):
        """Témoin : l'ancien abandon posait « archive = 1 » avec « envoye »."""
        robot, _, _, journal = _avec_un_encaissement(transport=TelegramEnPanne())
        identifiant = journal.conn.execute("SELECT id FROM recus").fetchone()[0]
        journal.conn.execute("UPDATE recus SET envoye = 1, archive = 1 "
                             "WHERE id = ?", (identifiant,))
        robot._distribuer_recus()
        self.assertEqual(robot.nuage.depots, [],
                         "le témoin passe : ce test ne prouverait rien")

    def test_un_depot_rate_ne_compte_pas_pour_telegram(self):
        nuage = FauxNuage(repond=False)
        robot, _, _, journal = _avec_un_encaissement(nuage=nuage)
        for _ in range(5):
            robot._distribuer_recus()
        essais, essais_archive = journal.conn.execute(
            "SELECT essais, essais_archive FROM recus").fetchone()
        # Un accroc RÉSEAU ne se compte pas : la plateforme reviendra.
        self.assertEqual((essais, essais_archive), (0, 0))


class TestLaDemandeDeLApplication(unittest.TestCase):

    def test_la_demande_est_deposee_avant_la_reponse(self):
        robot, _, _, journal = _avec_un_encaissement(
            nuage=FauxNuage(repond=False))
        robot.nuage.repond = True
        pilotage = Pilotage(robot.nuage, robot.comptes, journal,
                            programmeur=robot._recu_apres_coup)
        debut = time.monotonic()
        reponse = pilotage._etablir_recu({"source_id": 1, "nature": "depot"})
        duree = time.monotonic() - debut
        self.assertEqual(len(robot.nuage.depots), 1,
                         "la réponse est partie avant le document")
        self.assertLess(duree, 2.0)
        self.assertIn("is ready", reponse)         # la langue des tests
        self.assertRegex(reponse, r"\bTM-\d{4}-\d{4}-\d+\b")

    def test_temoin_sans_depot_immediat_la_reponse_promet(self):
        """Témoin : l'ancienne demande ne faisait qu'inscrire. Rien n'est
        déposé quand la réponse part — et la réponse ne dit pas « prêt »."""
        robot, _, _, journal = _avec_un_encaissement(
            nuage=FauxNuage(repond=False))
        robot.nuage.repond = True

        def a_l_ancienne(source_id, nature=None, langue=None):
            return robot._programmer_recu(
                source_id, journal.texte_sms(source_id), nature=nature,
                langue=langue, expliquer=True)

        pilotage = Pilotage(robot.nuage, robot.comptes, journal,
                            programmeur=a_l_ancienne)
        reponse = pilotage._etablir_recu({"source_id": 1, "nature": "depot"})
        self.assertEqual(robot.nuage.depots, [])
        self.assertNotIn("is ready", reponse)

    def test_redemander_le_meme_recu_rend_l_existant(self):
        robot, _, _, journal = _avec_un_encaissement(texte=TRANSFERT_ORANGE_EN)
        _distribuer(robot, journal)
        self.assertEqual(len(robot.nuage.depots), 1)
        avant = journal.conn.execute("SELECT date FROM recus").fetchone()[0]
        numero = robot._recu_apres_coup(1)
        self.assertTrue(numero)
        self.assertEqual(len(robot.nuage.depots), 1, "le reçu a été refait")
        _distribuer(robot, journal)
        self.assertEqual(len(robot.nuage.depots), 1)
        self.assertEqual(len(robot.transport.fichiers), 1)
        self.assertEqual(journal.conn.execute(
            "SELECT date FROM recus").fetchone()[0], avant)
        self.assertTrue(journal.recu_en_place(1))

    def test_une_autre_nature_refait_le_document(self):
        robot, _, _, journal = _avec_un_encaissement(texte=TRANSFERT_ORANGE_EN)
        _distribuer(robot, journal)
        robot._recu_apres_coup(1, nature="depot")
        self.assertEqual(len(robot.nuage.depots), 2)
        self.assertEqual(robot.nuage.depots[-1][0], robot.nuage.depots[0][0])

    def test_un_depot_abandonne_se_relance_a_la_demande(self):
        robot, _, _, journal = _avec_un_encaissement()
        identifiant = journal.conn.execute("SELECT id FROM recus").fetchone()[0]
        journal.recu_abandonne_au_depot(identifiant)
        self.assertFalse(journal.recu_en_place(1))
        robot._recu_apres_coup(1)
        self.assertEqual(len(robot.nuage.depots), 1)
        self.assertTrue(journal.recu_en_place(1))

    def test_une_autre_langue_refait_l_archive_seule(self):
        robot, _, _, journal = _avec_un_encaissement()
        _distribuer(robot, journal)
        robot._recu_apres_coup(1, langue="fr")      # le robot parle anglais
        self.assertEqual(len(robot.nuage.depots), 2)
        robot._recu_apres_coup(1, langue="fr")      # la même chose, encore
        self.assertEqual(len(robot.nuage.depots), 2)
        _distribuer(robot, journal)
        self.assertEqual(len(robot.transport.fichiers), 1)


class TestLeFilDuDepot(unittest.TestCase):

    def test_le_fil_depose_dans_la_seconde(self):
        robot, compte, modem, journal = _robot()
        robot.nuage = FauxNuage()
        robot.lancer_le_depot()
        try:
            time.sleep(0.2)                     # le fil a fait son premier tour
            debut = time.monotonic()
            modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
            robot._relever_sms(compte)
            while not robot.nuage.depots and time.monotonic() - debut < 3:
                time.sleep(0.02)
            self.assertEqual(len(robot.nuage.depots), 1)
            self.assertLess(robot.nuage.depots[0][2] - debut, 1.0)
        finally:
            robot.actif = False
            robot._reveil_depot.set()

    def test_le_fil_reprend_apres_une_panne(self):
        import totem.app as A
        vraie = A.PREMIERE_REPRISE_DEPOT
        A.PREMIERE_REPRISE_DEPOT = 0.05
        robot, compte, modem, journal = _robot()
        robot.nuage = FauxNuage(repond=False)
        robot.lancer_le_depot()
        try:
            modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
            robot._relever_sms(compte)
            time.sleep(0.3)
            self.assertEqual(robot.nuage.depots, [])
            robot.nuage.repond = True
            fin = time.monotonic() + 3
            while not robot.nuage.depots and time.monotonic() < fin:
                time.sleep(0.02)
            self.assertEqual(len(robot.nuage.depots), 1)
        finally:
            A.PREMIERE_REPRISE_DEPOT = vraie
            robot.actif = False
            robot._reveil_depot.set()

    def test_le_tour_n_attend_pas_le_fil(self):
        """Le fil du dépôt occupé (une plateforme lente) ne retient pas
        Telegram dans le tour de surveillance."""
        robot, _, _, journal = _avec_un_encaissement()
        robot._verrou_depot.acquire()
        try:
            fini = threading.Event()

            def tour():
                _distribuer(robot, journal)
                fini.set()

            threading.Thread(target=tour, daemon=True).start()
            self.assertTrue(fini.wait(2), "le tour attend le fil du dépôt")
            self.assertEqual(len(robot.transport.fichiers), 1)
        finally:
            robot._verrou_depot.release()


class FauxNuageRetenu(FauxNuage):
    """Une plateforme qui retient chaque envoi jusqu'à ce qu'on la libère —
    le temps d'un envoi par la 3G, rendu visible."""

    def __init__(self):
        super().__init__()
        self.porte = threading.Event()
        self.en_cours = threading.Event()
        self.pdfs = []

    def archiver_recu(self, nom, contenu, fiche=None):
        self.en_cours.set()
        self.porte.wait(5)
        self.pdfs.append(bytes(contenu))
        return super().archiver_recu(nom, contenu, fiche)


def _arreter(robot):
    robot.actif = False
    robot._reveil_depot.set()


class TestLesHeritagesDeLAncienCode(unittest.TestCase):
    """« archive = 1 » ne veut pas dire « déposé » : l'ancien code le posait
    aussi en RENONÇANT, au bout de soixante échecs Telegram."""

    def _ligne_heritee(self, robot, journal, essais):
        identifiant = journal.conn.execute("SELECT id FROM recus").fetchone()[0]
        journal.conn.execute(
            "UPDATE recus SET envoye = 1, archive = 1, essais = ?, "
            "essais_archive = 0, empreinte = NULL WHERE id = ?",
            (essais, identifiant))
        journal.conn.commit()
        return identifiant

    def test_une_ligne_abandonnee_se_redepose_a_la_demande(self):
        robot, _, _, journal = _avec_un_encaissement(
            nuage=FauxNuage(repond=False))
        self._ligne_heritee(robot, journal, 60)
        robot.nuage.repond = True
        self.assertFalse(journal.recu_en_place(1),
                         "une ligne abandonnée passe pour déposée")
        numero = robot._recu_apres_coup(1)
        self.assertEqual(len(robot.nuage.depots), 1,
                         "la redemande n'a rien déposé")
        self.assertEqual(numero.etat, "depose")
        self.assertTrue(journal.recu_en_place(1))

    def test_temoin_l_ancien_critere_se_laisse_prendre(self):
        """Témoin : le critère d'avant (archive = 1 et aucun accroc de
        dépôt compté) dit « en place » sur cette ligne jamais déposée."""
        robot, _, _, journal = _avec_un_encaissement(
            nuage=FauxNuage(repond=False))
        self._ligne_heritee(robot, journal, 60)
        archive, essais_archive = journal.conn.execute(
            "SELECT archive, essais_archive FROM recus").fetchone()
        self.assertTrue(archive == 1 and not essais_archive,
                        "le témoin passe : ce test ne prouverait rien")

    def test_la_migration_remet_en_file_les_abandons_de_telegram(self):
        import os
        import tempfile
        from totem.storage import Journal
        dossier = tempfile.mkdtemp()
        chemin = os.path.join(dossier, "journal.db")
        robot, compte, modem, _ = _robot()
        journal = Journal(chemin)
        robot.journal = journal
        robot.nuage = FauxNuage(repond=False)
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        robot._relever_sms(compte)
        self._ligne_heritee(robot, journal, 60)
        # Un document déposé normalement par l'ancien code, à côté.
        journal.conn.execute("ALTER TABLE recus DROP COLUMN empreinte")
        journal.conn.commit()
        journal.conn.close()
        rouvert = Journal(chemin)               # la mise à jour arrive
        self.assertEqual(len(rouvert.recus_a_archiver()), 1,
                         "l'abandon de l'ancien code reste abandonné")


class TestLeContenuDecide(unittest.TestCase):
    """« Rien n'a changé » se décide sur ce qui entre dans le document —
    pas sur la nature et la langue seules."""

    def _robot_mtn(self):
        robot, compte, modem, journal = _robot(numeros={"mtn": "237652236856"})
        robot.nuage = FauxNuageRetenu()
        robot.nuage.porte.set()
        compte.carte.iccid = "89237010000000000001"
        journal.voir_carte(compte.carte)
        sid = journal.sms("MTN", MTN_SORTANT, "MTN", compte.carte.iccid)
        robot._programmer_recu(sid, MTN_SORTANT, reveiller=False)
        robot._deposer_recus()
        return robot, compte, journal, sid

    def test_l_identite_des_reglages_refait_le_document(self):
        robot, compte, journal, sid = self._robot_mtn()
        self.assertEqual(len(robot.nuage.depots), 1)
        journal.definir_identite(compte.carte.iccid, numero="237652236856",
                                 nom="ETS KAMDEM ET FILS")
        numero = robot._recu_apres_coup(sid)
        self.assertEqual(numero.etat, "depose",
                         "un document changé se dit « déjà à jour »")
        self.assertEqual(len(robot.nuage.depots), 2)
        self.assertNotEqual(robot.nuage.pdfs[0], robot.nuage.pdfs[1])
        # Et maintenant, plus rien n'a changé : rien ne repart.
        encore = robot._recu_apres_coup(sid)
        self.assertEqual(encore.etat, "inchange")
        self.assertEqual(len(robot.nuage.depots), 2)

    def test_temoin_nature_et_langue_ne_voient_pas_l_identite(self):
        """Témoin : la ligne du journal — genre, nature, langue, date — est
        IDENTIQUE avant et après l'identité ; le document, lui, a changé.
        Une décision prise sur la ligne seule dit « rien n'a changé »."""
        robot, compte, journal, sid = self._robot_mtn()
        avant = journal.recu_de(sid)[:9]
        _, pdf_avant, _ = robot._fabriquer_recu(avant)
        journal.definir_identite(compte.carte.iccid, nom="ETS KAMDEM ET FILS")
        apres = journal.recu_de(sid)[:9]
        _, pdf_apres, _ = robot._fabriquer_recu(apres)
        self.assertEqual(avant, apres)
        self.assertNotEqual(pdf_avant, pdf_apres,
                            "le témoin passe : ce test ne prouverait rien")

    def test_la_reponse_dit_deja_a_jour_d_apres_le_robot(self):
        robot, _, journal, sid = self._robot_mtn()
        pilotage = Pilotage(robot.nuage, robot.comptes, journal,
                            programmeur=robot._recu_apres_coup)
        reponse = pilotage._etablir_recu({"source_id": sid})
        self.assertIn("already up to date", reponse)


class TestLeFilNeBrulePasSesEssais(unittest.TestCase):

    def _cinq_recus_qui_echouent(self):
        import totem.app as A
        robot, compte, modem, journal = _robot()
        robot.nuage = FauxNuage()
        for i in range(5):
            sid = journal.sms("OrangeMoney", TRANSFERT_ORANGE.replace(
                "5000", str(5000 + i)), "Orange", "")
            robot._programmer_recu(sid, journal.texte_sms(sid),
                                   reveiller=False)
        compte_fabrications = [0]

        def en_panne(ligne):
            compte_fabrications[0] += 1
            raise OSError("police momentanément illisible")
        robot._fabriquer_recu = en_panne
        return A, robot, journal, compte_fabrications

    def test_un_accroc_de_fabrication_espace_les_essais(self):
        A, robot, journal, fabrications = self._cinq_recus_qui_echouent()
        self.assertEqual(len(journal.recus_a_archiver()), 5)
        robot.lancer_le_depot()
        try:
            time.sleep(0.5)
        finally:
            _arreter(robot)
        self.assertLessEqual(fabrications[0], 10,
                             "le fil tourne à vide sur des documents en échec")
        self.assertEqual(len(journal.recus_a_archiver()), 5,
                         "des reçus ont été abandonnés en une demi-seconde")

    def test_temoin_plein_des_cinq_lignes_tourne_a_vide(self):
        """Témoin : la règle d'avant — « plein » dès cinq lignes, même
        toutes en échec — brûle les soixante essais d'un trait."""
        A, robot, journal, fabrications = self._cinq_recus_qui_echouent()
        vrai = robot._deposer_lot

        def a_l_ancienne(lignes):
            vrai(lignes)
            return "plein" if len(lignes or []) >= 5 else False
        robot._deposer_lot = a_l_ancienne
        robot.lancer_le_depot()
        try:
            time.sleep(0.5)
        finally:
            _arreter(robot)
        self.assertGreater(fabrications[0], 10,
                           "le témoin passe : ce test ne prouverait rien")


class TestLesDepotsCroises(unittest.TestCase):

    def test_changer_la_nature_pendant_le_depot_laisse_le_bon(self):
        """Le fil dépose le reçu automatique (transfert) ; PENDANT l'envoi,
        le propriétaire choisit « solde ». Le dernier document déposé doit
        être le solde, et le journal doit le savoir."""
        robot, compte, modem, journal = _robot()
        robot.nuage = FauxNuageRetenu()
        robot.lancer_le_depot()
        try:
            modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
            robot._relever_sms(compte)
            self.assertTrue(robot.nuage.en_cours.wait(3))
            reponse = {}
            demande = threading.Thread(target=lambda: reponse.setdefault(
                "n", robot._recu_apres_coup(1, nature="solde")))
            demande.start()
            time.sleep(0.2)                     # la demande attend le fil
            robot.nuage.porte.set()             # l'envoi par la 3G finit
            demande.join(5)
        finally:
            _arreter(robot)
        genres = [f["genre"] for (_, f, _) in robot.nuage.depots]
        self.assertEqual(genres[-1], "solde",
                         f"la plateforme garde l'ancien document : {genres}")
        self.assertEqual(journal.recus_a_archiver(), [])
        self.assertTrue(journal.recu_en_place(1))

    def test_temoin_le_marquage_sans_condition_ment(self):
        """Témoin : le lot pris AVANT le changement, marqué sans regarder si
        la ligne a bougé — le journal croit le solde en place, la
        plateforme a le transfert."""
        robot, compte, modem, journal = _robot()
        robot.nuage = FauxNuage()
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        robot._relever_sms(compte)
        lot = journal.recus_a_archiver()
        journal.programmer_recu(1, "solde", lot[0][2], nature="solde")
        for ligne in lot:                     # l'ancien marquage
            nom, pdf, _ = robot._fabriquer_recu(ligne)
            robot.nuage.archiver_recu(nom, pdf, robot._fiche_recu(ligne))
            journal.recu_archive(ligne[0])
        self.assertEqual(journal.recus_a_archiver(), [],
                         "le témoin passe : ce test ne prouverait rien")
        self.assertEqual(robot.nuage.depots[-1][1]["genre"], "transfert")

    def test_le_marquage_conditionnel_garde_la_ligne_qui_a_bouge(self):
        robot, compte, modem, journal = _robot()
        robot.nuage = FauxNuage()
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        robot._relever_sms(compte)
        lot = journal.recus_a_archiver()
        journal.programmer_recu(1, "solde", lot[0][2], nature="solde")
        self.assertEqual(robot._deposer_lot(lot), "plein")
        self.assertEqual(len(journal.recus_a_archiver()), 1,
                         "la ligne changée pendant l'envoi est marquée")

    def test_une_demande_ne_part_qu_une_fois(self):
        robot, compte, modem, journal = _robot()
        robot.nuage = FauxNuage(repond=False)
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        robot._relever_sms(compte)
        robot.nuage.repond = True
        robot.lancer_le_depot()
        try:
            time.sleep(0.1)                    # le fil a fait son tour à vide
            robot.nuage.depots.clear()
            numero = robot._recu_apres_coup(1, nature="depot")
            time.sleep(0.5)                    # le fil a eu sa chance
        finally:
            _arreter(robot)
        self.assertEqual(numero.etat, "depose")
        self.assertEqual(len(robot.nuage.depots), 1,
                         "la même demande est partie deux fois")


class TestLeDemarrage(unittest.TestCase):
    """Le harnais lance le fil du dépôt lui-même : sans ce test, retirer
    son lancement du démarrage du robot laissait toute la batterie verte —
    et le dépôt retombait, en service, sur le tour de surveillance."""

    def test_demarrer_lance_le_fil_du_depot(self):
        from totem.app import FIL_DU_DEPOT

        class NuageDocile(FauxNuage):
            def __getattr__(self, nom):
                return lambda *a, **k: []

            def demarrer(self, *a, **k):
                return None

        robot, _, _, _ = _robot()
        robot.nuage = NuageDocile()
        robot.demarrer(bloquant=False)
        try:
            noms = {f.name for f in threading.enumerate()}
            self.assertIn(FIL_DU_DEPOT, noms,
                          "le démarrage ne lance pas le fil du dépôt")
        finally:
            robot.arreter()


if __name__ == "__main__":
    unittest.main()
