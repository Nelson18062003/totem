# -*- coding: utf-8 -*-
"""Le signe de vie du boîtier : à l'heure, quoi qu'il arrive à côté.

CE QUE LE PROPRIÉTAIRE VOYAIT. « Terminal muet » s'allumait, rarement, sur
un boîtier qui marchait — quelques secondes, une minute — puis s'éteignait.
Le signe de vie partait en tête du tour de transmission, et ce tour pouvait
le retarder : un SMS qui réveillait la transmission relançait soixante
secondes d'attente pleine, une requête ratée en coûtait quinze, un modem
occupé par une session USSD faisait attendre la lecture du signal. Entre
deux signes de vie, jusqu'à deux minutes ; le seuil de la plateforme est de
trois. Un hoquet d'Internet suffisait.

Et à chaque signe de vie, le robot publiait « 3 messages en cours de
transmission » JUSTE AVANT de les transmettre : la plateforme l'affichait
une minute entière au-dessus d'une liste qui les contenait déjà.

CHAQUE EXIGENCE EST ÉPROUVÉE SUR LE PONT D'AVANT. `NuageDAvant` est l'ancien
fil, réécrit en vingt lignes : si les mêmes exigences PASSAIENT sur lui, la
mesure ne verrait rien, et l'essai s'arrête en le disant.
"""

import itertools
import json
import threading
import time
import types
import unittest
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import totem.nuage as module_nuage
from totem.nuage import Nuage
from totem.storage import Journal


class Banc:
    """Un faux Supabase qui note QUAND chaque signe de vie arrive.

    Il sait tomber en panne (503 sur tout, ou sur les signes de vie
    seulement), et traîner sur les SMS — comme une base lente au bout d'une
    liaison Starlink. Plusieurs requêtes à la fois : un serveur qui les
    servirait une par une ferait attendre le signe de vie derrière la
    poussée, et l'essai mesurerait le banc au lieu du robot."""

    def __init__(self):
        self.signes = []            # (instant, sante) des signes de vie reçus
        self.tentatives = []        # (instant, timeout) de toutes les tentatives
        self.paiements = []
        self.paiements_le = []      # l'instant où chaque lot de SMS est entré
        self.panne = False
        self.signes_refuses = 0     # combien de signes de vie refuser encore
        self.lenteur_paiements = 0.0
        # Les SMS qui traînent PUIS échouent : ils restent en attente, et
        # chaque tour de transmission les retente — et traîne encore.
        self.paiements_en_panne = False
        # Les cartes : (instant d'arrivée, [(iccid, derniere_vue)…]).
        self.cartes = []
        self.cartes_refusees = 0    # combien d'envois de cartes refuser encore
        self.cartes_tentees = []    # (instant, refusé ?) de chaque envoi de cartes
        self.pendant_cartes = None  # appelé PENDANT qu'un envoi de cartes arrive
        self.verrou = threading.Lock()
        banc = self

        class Gestion(BaseHTTPRequestHandler):
            def do_POST(soi):
                taille = int(soi.headers.get("Content-Length", 0))
                corps = json.loads(soi.rfile.read(taille) or b"[]")
                table = soi.path.split("/rest/v1/")[1].split("?")[0]
                if table == "terminaux":
                    with banc.verrou:
                        banc.tentatives.append(time.monotonic())
                        refuse = banc.panne or banc.signes_refuses > 0
                        if banc.signes_refuses > 0:
                            banc.signes_refuses -= 1
                    if refuse:
                        soi.send_error(503)
                        return
                    with banc.verrou:
                        banc.signes.append((time.monotonic(), corps[0]["sante"]))
                elif banc.panne:
                    soi.send_error(503)
                    return
                if table == "paiements":
                    time.sleep(banc.lenteur_paiements)
                    if banc.paiements_en_panne:
                        soi.send_error(503)
                        return
                    with banc.verrou:
                        banc.paiements.extend(corps)
                        banc.paiements_le.append(time.monotonic())
                if table == "cartes":
                    if banc.pendant_cartes:
                        banc.pendant_cartes()
                    with banc.verrou:
                        refuse = banc.cartes_refusees > 0
                        if refuse:
                            banc.cartes_refusees -= 1
                        banc.cartes_tentees.append((time.monotonic(), refuse))
                        if not refuse:
                            banc.cartes.append((time.monotonic(), [
                                (c["iccid"], c["derniere_vue"]) for c in corps]))
                    if refuse:
                        soi.send_error(503)
                        return
                soi.send_response(201)
                soi.end_headers()

            def do_DELETE(soi):
                soi.send_response(204)
                soi.end_headers()

            def log_message(soi, *args):
                pass

        self.serveur = ThreadingHTTPServer(("127.0.0.1", 0), Gestion)
        self.serveur.daemon_threads = True
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.serveur.server_port}"

    def fermer(self):
        self.serveur.shutdown()
        self.serveur.server_close()

    def ecarts(self):
        """Les intervalles entre deux signes de vie ARRIVÉS."""
        with self.verrou:
            instants = [i for i, _ in self.signes]
        return [b - a for a, b in zip(instants, instants[1:])]


class NuageDAvant(Nuage):
    """LE TÉMOIN : le pont tel qu'il était. Un seul fil ; le signe de vie en
    tête de tour, avec le délai de quinze secondes ; le retard compté AVANT
    la poussée ; et une pause pleine après chaque réveil."""

    def demarrer(self, comptes=None, sante=None):
        fil = threading.Thread(target=self._boucle_d_avant,
                               args=(comptes or [], sante), daemon=True)
        fil.start()
        return fil

    def _boucle_d_avant(self, comptes, sante):
        prochain_etat = 0.0
        while self._marche:
            try:
                if time.monotonic() >= prochain_etat:
                    prochain_etat = time.monotonic() + self.pause
                    info = {"en_attente": self.journal.sms_en_attente()}
                    self.enregistrer_terminal(info, delai=module_nuage.DELAI)
                    self.publier_comptes(comptes)
                    self.publier_raccourcis()
                self._pousser_tout()
            except Exception as e:
                self.derniere_erreur = str(e)
            if self._reveil.wait(timeout=self.pause):
                self._reveil.clear()
                time.sleep(module_nuage.DEBOUNCE)


class SigneDeVie(unittest.TestCase):

    def setUp(self):
        self.vrais = (module_nuage.DEBOUNCE, module_nuage.SIGNE_DE_VIE_REPRISE)
        module_nuage.DEBOUNCE = 0.0
        self.bancs, self.ponts = [], []

    def tearDown(self):
        for pont in self.ponts:
            pont.arreter()
        for banc in self.bancs:
            banc.fermer()
        module_nuage.DEBOUNCE, module_nuage.SIGNE_DE_VIE_REPRISE = self.vrais

    def monter(self, classe, pause):
        banc = Banc()
        journal = Journal(":memory:")
        pont = classe(banc.url, "cle", "douala", journal, pause=pause)
        self.bancs.append(banc)
        self.ponts.append(pont)
        return banc, journal, pont

    def deux_fois(self, scenario):
        """Joue le scénario sur le pont d'aujourd'hui, puis sur le témoin.
        Le premier doit tenir toutes ses exigences ; le second doit en
        manquer au moins une, sans quoi l'essai ne prouve rien."""
        manques = scenario(Nuage)
        self.assertEqual(manques, [], "le pont d'aujourd'hui")
        temoin = scenario(NuageDAvant)
        self.assertNotEqual(
            temoin, [],
            "LE TÉMOIN PASSE : le pont d'avant tient les mêmes exigences, "
            "l'essai ne mesure donc rien")

    # --- la cadence -------------------------------------------------------

    def test_un_sms_qui_reveille_la_transmission_ne_repousse_pas_le_signe_de_vie(self):
        """Des SMS arrivent toutes les 0,55 s, la pause est de 0,6 s : chaque
        réveil relançait une pause PLEINE, et le signe de vie, qui attendait
        la tête de tour, ne partait qu'un tour sur deux."""
        pause = 0.6

        def scenario(classe):
            banc, journal, pont = self.monter(classe, pause)
            pont.demarrer()
            fin = time.monotonic() + 3.5
            n = 0
            while time.monotonic() < fin:
                time.sleep(0.55)
                n += 1
                journal.sms("MobileMoney", f"Vous avez recu {n}00 FCFA de 677000111", "MTN")
                pont.reveiller()
            pont.arreter()
            ecarts = banc.ecarts()
            manques = []
            if len(ecarts) < 4:
                manques.append(f"trop peu de signes de vie : {len(ecarts) + 1}")
            if ecarts and max(ecarts) > pause * 1.4:
                manques.append(f"un signe de vie a attendu {max(ecarts):.2f} s "
                               f"(pause {pause} s)")
            return manques

        self.deux_fois(scenario)

    def test_une_poussee_lente_ne_retarde_pas_le_signe_de_vie(self):
        """La base met deux secondes à accepter des SMS : le signe de vie,
        lui, part à l'heure — il ne passe plus par le fil des SMS."""
        pause = 0.4

        def scenario(classe):
            banc, journal, pont = self.monter(classe, pause)
            banc.lenteur_paiements = 2.0
            journal.sms("MobileMoney", "Vous avez recu 5 000 FCFA de 677000111", "MTN")
            pont.demarrer()
            time.sleep(3.0)
            pont.arreter()
            ecarts = banc.ecarts()
            manques = []
            if not ecarts or max(ecarts) > pause * 1.5:
                manques.append(f"écart maximal {max(ecarts or [0]):.2f} s "
                               f"pendant une poussée lente (pause {pause} s)")
            return manques

        self.deux_fois(scenario)

    # --- l'échec --------------------------------------------------------------

    def test_un_signe_de_vie_rate_se_retente_vite(self):
        """Un hoquet d'Internet fait rater UN signe de vie : le suivant part
        dix secondes plus tard, pas une pause entière (ici : 0,2 s contre
        2 s)."""
        module_nuage.SIGNE_DE_VIE_REPRISE = 0.2
        pause = 2.0

        def scenario(classe):
            banc, journal, pont = self.monter(classe, pause)
            banc.signes_refuses = 1
            pont.demarrer()
            time.sleep(1.0)
            pont.arreter()
            manques = []
            with banc.verrou:
                tentatives = list(banc.tentatives)
                arrives = len(banc.signes)
            if len(tentatives) < 2 or tentatives[1] - tentatives[0] > 0.6:
                manques.append("après un échec, le signe de vie suivant n'est "
                               "pas reparti dans la seconde")
            if not arrives:
                manques.append("aucun signe de vie arrivé après le hoquet")
            return manques

        self.deux_fois(scenario)

    def test_le_signe_de_vie_n_attend_pas_quinze_secondes(self):
        """Un signe de vie qui met quinze secondes à arriver n'en est plus
        un : on regarde le délai que la requête se donne VRAIMENT."""

        def scenario(classe):
            delais = []
            vrai = module_nuage.urllib.request.urlopen

            def espion(requete, timeout=None):
                if "/terminaux" in requete.full_url:
                    delais.append(timeout)
                return vrai(requete, timeout=timeout)

            module_nuage.urllib.request.urlopen = espion
            try:
                banc, journal, pont = self.monter(classe, 30)
                pont.demarrer()
                fin = time.monotonic() + 2
                while not delais and time.monotonic() < fin:
                    time.sleep(0.02)
                pont.arreter()
            finally:
                module_nuage.urllib.request.urlopen = vrai
            if not delais:
                return ["aucun signe de vie"]
            if delais[0] > 5:
                return [f"le signe de vie se donne {delais[0]} s"]
            return []

        self.deux_fois(scenario)

    # --- le retard annoncé ------------------------------------------------

    def test_le_retard_annonce_est_celui_qui_reste_apres_la_poussee(self):
        """Trois SMS attendent au démarrage. Ils partent dans la seconde ;
        la plateforme doit lire ZÉRO, pas « 3 en cours de transmission »
        pendant toute une pause."""

        def scenario(classe):
            banc, journal, pont = self.monter(classe, 3600)
            for i in range(3):
                journal.sms("MobileMoney", f"Vous avez recu {i + 1}000 FCFA de 677000111", "MTN")
            pont.demarrer()
            fin = time.monotonic() + 3
            while time.monotonic() < fin:
                with banc.verrou:
                    if len(banc.paiements) >= 3:
                        break
                time.sleep(0.02)
            time.sleep(0.5)
            pont.arreter()
            with banc.verrou:
                derniers = [s for _, s in banc.signes]
                partis = len(banc.paiements)
            manques = []
            if partis != 3:
                manques.append(f"{partis} SMS transmis sur 3")
            if not derniers or derniers[-1].get("en_attente") != 0:
                manques.append(
                    "la plateforme lit encore "
                    f"{derniers[-1].get('en_attente') if derniers else '—'} "
                    "SMS en cours de transmission, alors qu'ils sont arrivés")
            return manques

        self.deux_fois(scenario)

    def test_au_retour_du_reseau_les_sms_n_attendent_pas_l_echeance(self):
        """Le signe de vie retente toutes les dix secondes, la transmission
        seulement à son échéance, une minute. Au retour d'Internet, le
        premier signe de vie publiait « 3 messages en cours de
        transmission »… et la plateforme les gardait ainsi jusqu'à une
        minute de plus, au-dessus d'une liste qui ne les avait pas.

        Ici : échéance 1,5 s, reprise 0,1 s. La coupure couvre un signe de
        vie, et Internet revient juste après que la transmission a échoué
        — elle ne réessaierait seule qu'1,25 s plus tard. Les SMS doivent
        être dans la base, et le retard publié retombé à zéro, en moins
        d'une demi-seconde."""
        module_nuage.SIGNE_DE_VIE_REPRISE = 0.1
        pause = 1.5

        def scenario(classe):
            banc, journal, pont = self.monter(classe, pause)
            depart = time.monotonic()

            def jusqu_a(t):
                time.sleep(max(0.0, depart + t - time.monotonic()))

            pont.demarrer()
            jusqu_a(0.3)
            banc.panne = True
            jusqu_a(0.6)
            for i in range(3):
                journal.sms("MobileMoney", f"Vous avez recu {i + 1}000 FCFA de 677000111", "MTN")
            pont.reveiller()
            jusqu_a(1.75)               # l'échéance de 1,5 s est passée en panne
            retour = time.monotonic()
            banc.panne = False
            time.sleep(0.5)
            with banc.verrou:
                arrives = [i for i in banc.paiements_le if i >= retour]
                n = len(banc.paiements)
                dernier = banc.signes[-1][1] if banc.signes else {}
            pont.arreter()
            manques = []
            if n != 3:
                manques.append(f"{n} SMS sur 3 dans la base une demi-seconde "
                               "après le retour du réseau")
            if dernier.get("en_attente") != 0:
                manques.append(
                    f"la plateforme lit encore {dernier.get('en_attente')} SMS "
                    "en cours de transmission une demi-seconde après le retour")
            return manques

        self.deux_fois(scenario)

    def test_actualiser_ne_vide_plus_l_etat_du_terminal(self):
        """« Actualiser » republie le terminal sans rien préciser : il
        publiait un état VIDE, et le retard disparaissait de la plateforme
        jusqu'au signe de vie suivant."""
        banc, journal, pont = self.monter(Nuage, 30)
        journal.sms("MobileMoney", "Vous avez recu 7 000 FCFA de 677000111", "MTN")
        self.assertTrue(pont.enregistrer_terminal())
        (_, sante), = banc.signes
        self.assertEqual(sante.get("en_attente"), 1)


ICCID = "89237010000000008901"


def carte_vue():
    """La puce que le poste d'une carte relit, comme `voir_carte` la reçoit."""
    return types.SimpleNamespace(iccid=ICCID, imsi="624010000000001",
                                 operateur="MTN", libelle="MTN ·8901",
                                 numero="")


def horloge_qui_avance(journal):
    """Le journal date à la SECONDE : deux relectures dans la même seconde
    portent la même date, et l'essai ne verrait pas la plus neuve. Chaque
    relecture reçoit ici une date à elle, une seconde après la précédente."""
    depart = datetime(2026, 10, 4, 14, 5, 0)
    n = itertools.count()
    journal._maintenant = lambda: (
        depart + timedelta(seconds=next(n))).isoformat(timespec="seconds")


class NuageSansCartesAuSigne(Nuage):
    """LE TÉMOIN : le pont d'hier. Le signe de vie a son fil ; les cartes
    restent dans le tour des transmissions, à leur rythme."""

    def _cartes_avec_le_signe(self):
        return True


class NuageSansReprise(Nuage):
    """LE TÉMOIN de la reprise : les cartes suivent le signe de vie, mais un
    envoi raté attend le signe de vie suivant — une pause entière."""

    def _cartes_avec_le_signe(self):
        super()._cartes_avec_le_signe()
        return True


class LesCartesSuiventLeSigneDeVie(unittest.TestCase):
    """La plateforme dit une carte RETIRÉE quand sa dernière vue a trop de
    retard sur le signe de vie. Les deux dates doivent donc voyager
    ensemble : un signe de vie qui arrive sans les cartes revues avant lui
    creuse l'écart — et un tour de transmission raté suffisait à le porter
    au-delà du seuil, sur une carte bien en place."""

    def setUp(self):
        self.vrais = (module_nuage.DEBOUNCE, module_nuage.SIGNE_DE_VIE_REPRISE,
                      module_nuage.CARTES_REPRISES)
        module_nuage.DEBOUNCE = 0.0
        self.bancs, self.ponts = [], []

    def tearDown(self):
        for pont in self.ponts:
            pont.arreter()
        for banc in self.bancs:
            banc.fermer()
        (module_nuage.DEBOUNCE, module_nuage.SIGNE_DE_VIE_REPRISE,
         module_nuage.CARTES_REPRISES) = self.vrais

    def monter(self, classe, pause):
        banc = Banc()
        journal = Journal(":memory:")
        horloge_qui_avance(journal)
        pont = classe(banc.url, "cle", "douala", journal, pause=pause)
        self.bancs.append(banc)
        self.ponts.append(pont)
        return banc, journal, pont

    def deux_fois(self, scenario, temoin):
        manques = scenario(Nuage)
        self.assertEqual(manques, [], "le pont d'aujourd'hui")
        self.assertNotEqual(
            scenario(temoin), [],
            "LE TÉMOIN PASSE : le pont d'avant tient les mêmes exigences, "
            "l'essai ne mesure donc rien")

    @staticmethod
    def battre_seul(pont):
        """Le fil du signe de vie, sans celui des transmissions : ce qui
        part, c'est lui qui l'envoie."""
        fil = threading.Thread(target=pont._battre, daemon=True)
        fil.start()
        return fil

    def test_une_transmission_qui_traine_ne_retarde_plus_les_cartes(self):
        """Des SMS en souffrance : chaque tour de transmission les retente et
        traîne 2,5 s avant d'échouer. Le signe de vie, lui, part toutes les
        0,5 s. Le poste de la carte la relit toutes les 0,25 s. Chaque date
        de relecture doit arriver au nuage dans la foulée du signe de vie
        suivant — pas au tour de transmission suivant."""
        pause = 0.5

        def scenario(classe):
            banc, journal, pont = self.monter(classe, pause)
            banc.lenteur_paiements = 2.5
            banc.paiements_en_panne = True
            journal.sms("MobileMoney", "Vous avez recu 5 000 FCFA de 677000111", "MTN")
            journal.voir_carte(carte_vue())
            pont.demarrer()
            relectures = []
            fin = time.monotonic() + 4.0
            while time.monotonic() < fin:
                time.sleep(0.25)
                journal.voir_carte(carte_vue())
                ((date,),) = journal.conn.execute(
                    "SELECT derniere_vue FROM cartes WHERE iccid = ?", (ICCID,))
                relectures.append((time.monotonic(), date))
            # De quoi laisser arriver le tour de transmission suivant : le
            # témoin doit sortir un retard MESURÉ, pas un « jamais ».
            time.sleep(3.0)
            pont.arreter()
            with banc.verrou:
                arrivees = [(t, max(d for _, d in lot)) for t, lot in banc.cartes]
            retards = []
            for vue_a, date in relectures[:-4]:
                recues = [t for t, d in arrivees
                          if module_nuage._horodatage(date) <= d and t >= vue_a]
                retards.append(min(recues) - vue_a if recues else float("inf"))
            pire = max(retards)
            if pire > pause + 0.4:
                return [f"une date de relecture a mis {pire:.2f} s à arriver "
                        f"(signe de vie toutes les {pause} s)"]
            return []

        self.deux_fois(scenario, NuageSansCartesAuSigne)

    def test_un_envoi_de_cartes_rate_se_retente_vite(self):
        """Le signe de vie passe, les cartes qui le suivent sont refusées
        (un hoquet). Elles repartent dix secondes plus tard — ici 0,1 s —
        et non au signe de vie suivant, une pause entière (ici 2 s)."""
        module_nuage.SIGNE_DE_VIE_REPRISE = 0.1
        pause = 2.0

        def scenario(classe):
            banc, journal, pont = self.monter(classe, pause)
            banc.cartes_refusees = 1
            journal.voir_carte(carte_vue())
            self.battre_seul(pont)
            time.sleep(1.0)
            pont.arreter()
            with banc.verrou:
                tentees = list(banc.cartes_tentees)
                arrivees = list(banc.cartes)
            if not tentees or not tentees[0][1]:
                return ["le premier envoi de cartes n'a pas été refusé"]
            if not arrivees:
                return ["après le hoquet, les cartes ne sont pas reparties dans la seconde"]
            ecart = arrivees[0][0] - tentees[0][0]
            if ecart > 0.6:
                return [f"les cartes sont reparties {ecart:.2f} s après le hoquet"]
            return []

        self.deux_fois(scenario, NuageSansReprise)

    def test_une_table_refusee_ne_fait_pas_parler_le_boitier_sans_fin(self):
        """La base refuse les cartes pour de bon. Le boîtier retente vite
        TROIS fois, puis revient au pas ordinaire : il ne parle pas toutes
        les dix secondes sur le forfait de la boutique."""
        module_nuage.SIGNE_DE_VIE_REPRISE = 0.05
        pause = 1.0

        def scenario(reprises):
            module_nuage.CARTES_REPRISES = reprises
            banc, journal, pont = self.monter(Nuage, pause)
            banc.cartes_refusees = 10 ** 6
            journal.voir_carte(carte_vue())
            self.battre_seul(pont)
            time.sleep(1.5)
            pont.arreter()
            with banc.verrou:
                return len(banc.signes)

        # Un signe de vie, trois reprises, puis un au bout d'une pause.
        self.assertLessEqual(scenario(3), 6)
        # LE TÉMOIN : sans borne, il en envoie vingt fois plus.
        self.assertGreater(scenario(10 ** 6), 12,
                           "le témoin devait parler sans fin : l'essai ne "
                           "mesure rien")


class LaCourseDuMarquage(unittest.TestCase):
    """L'envoi lit la carte, part sur le réseau, puis la marque « envoyée ».
    Une relecture tombée PENDANT l'envoi remettait `envoye` à 0 — et le
    marquage l'effaçait : la date neuve restait dans le Pi, la plateforme
    gardait l'ancienne jusqu'à la relecture suivante."""

    def pousser_pendant(self, geste, marquage_d_avant=False):
        banc = Banc()
        self.addCleanup(banc.fermer)
        journal = Journal(":memory:")
        horloge_qui_avance(journal)
        journal.voir_carte(carte_vue())
        if marquage_d_avant:
            vrai = journal.marquer_cartes_envoyees
            journal.marquer_cartes_envoyees = (
                lambda iccids, telles_que_parties=None: vrai(iccids))
        pont = Nuage(banc.url, "cle", "douala", journal)
        banc.pendant_cartes = lambda: (geste(journal), setattr(banc, "pendant_cartes", None))
        self.assertEqual(pont.pousser_cartes(), 1)
        return journal

    def test_une_relecture_pendant_l_envoi_repart(self):
        journal = self.pousser_pendant(lambda j: j.voir_carte(carte_vue()))
        attente = journal.cartes_non_envoyees()
        self.assertEqual(len(attente), 1, "la date neuve s'est perdue")
        self.assertEqual(attente[0][-1], "2026-10-04T14:05:01")

    def test_un_nom_change_pendant_l_envoi_repart(self):
        journal = self.pousser_pendant(
            lambda j: j.definir_identite(ICCID, nom="ETS NKENGAFAC"))
        self.assertEqual(len(journal.cartes_non_envoyees()), 1,
                         "le nom déclaré pendant l'envoi s'est perdu")

    def test_une_carte_qui_n_a_pas_bouge_est_marquee(self):
        journal = self.pousser_pendant(lambda j: None)
        self.assertEqual(journal.cartes_non_envoyees(), [])

    def test_temoin_le_marquage_d_avant_perdait_la_relecture(self):
        journal = self.pousser_pendant(lambda j: j.voir_carte(carte_vue()),
                                       marquage_d_avant=True)
        self.assertEqual(journal.cartes_non_envoyees(), [],
                         "le témoin devait perdre la date neuve : sans cela, "
                         "l'essai ne prouve rien")


class VerrouQuiNeRetientPersonne:
    """Le verrou du témoin : il dit oui à tout le monde, tout de suite."""

    def acquire(self, blocking=True, timeout=-1):
        return True

    def release(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class NuageSansVerrouDesCartes(Nuage):
    """LE TÉMOIN : le pont d'aujourd'hui, moins le verrou des cartes — deux
    envois partis de deux fils peuvent se croiser."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._verrou_cartes = VerrouQuiNeRetientPersonne()


class DeuxEnvoisDeCartesCroises(unittest.TestCase):
    """Deux fils envoient des cartes : celui du signe de vie
    (`_cartes_avec_le_signe`) et celui des transmissions (`pousser_cartes`).

    LA COURSE. Le premier lit la carte (date d1) et part. Le poste de la
    carte la relit (d2). Le second lit d2 et part. Sa requête arrive la
    PREMIÈRE ; celle de d1 arrive après, et la fusion de la base garde d1.
    Le marquage conditionnel ne rattrape rien ici : le premier ne marque pas
    (d1 n'est plus la date du Pi), le second marque (d2 l'est). Le nuage
    garde la vieille date, le Pi croit lui avoir donné la neuve — et
    l'écart avec le signe de vie grandit d'une relecture, de quoi
    rapprocher une carte bien en place du verdict « retirée ».

    Le banc RETIENT le premier envoi pendant la relecture et le départ du
    second ; il ne le lâche qu'une fois le second arrivé — ou au bout de
    0,6 s, si le second attend son tour comme il le doit.

    L'exigence : la dernière date que le nuage a reçue est la plus neuve du
    Pi — ou la carte reste à envoyer."""

    def croiser(self, classe, premier, second):
        banc = Banc()
        self.addCleanup(banc.fermer)
        journal = Journal(":memory:")
        horloge_qui_avance(journal)
        journal.voir_carte(carte_vue())                       # d1
        pont = classe(banc.url, "cle", "douala", journal)
        retenu, lache, second_arrive = (threading.Event() for _ in range(3))
        rang = itertools.count()

        def pendant():
            if next(rang) == 0:
                retenu.set()
                lache.wait(5)
            else:
                second_arrive.set()

        banc.pendant_cartes = pendant
        fil1 = threading.Thread(target=getattr(pont, premier), daemon=True)
        fil1.start()
        if not retenu.wait(5):
            return ["le premier envoi n'est jamais arrivé au banc"]
        journal.voir_carte(carte_vue())                       # d2, pendant l'envoi
        fil2 = threading.Thread(target=getattr(pont, second), daemon=True)
        fil2.start()
        second_arrive.wait(0.6)
        lache.set()
        fil1.join(10)
        fil2.join(10)
        ((neuve,),) = journal.conn.execute(
            "SELECT derniere_vue FROM cartes WHERE iccid = ?", (ICCID,))
        with banc.verrou:
            recues = [d for _, lot in banc.cartes for i, d in lot if i == ICCID]
        if len(recues) < 2:
            return [f"{len(recues)} envoi(s) arrivé(s) sur 2 : le scénario n'est pas monté"]
        if recues[-1] == module_nuage._horodatage(neuve) or journal.cartes_non_envoyees():
            return []
        return [f"le nuage garde {recues[-1]}, le Pi a {neuve} et la croit envoyée"]

    def deux_fois(self, premier, second):
        self.assertEqual(self.croiser(Nuage, premier, second), [],
                         "le pont d'aujourd'hui")
        self.assertNotEqual(
            self.croiser(NuageSansVerrouDesCartes, premier, second), [],
            "LE TÉMOIN PASSE : sans le verrou, les envois ne se croisent pas "
            "— l'essai ne mesure donc rien")

    def test_le_signe_de_vie_d_abord_les_transmissions_ensuite(self):
        self.deux_fois("_cartes_avec_le_signe", "pousser_cartes")

    def test_les_transmissions_d_abord_le_signe_de_vie_ensuite(self):
        self.deux_fois("pousser_cartes", "_cartes_avec_le_signe")


class SignalInconnu(unittest.TestCase):
    """Le modem répond 99 quand il ne sait pas. Publié tel quel, l'écran en
    tirait quatre barres PLEINES sur une carte sans réseau."""

    class Compte:
        def __init__(self, iccid, signal):
            self.libelle = f"MTN ·{iccid[-4:]}"
            self._signal = signal

            class Carte:
                identifiee = True
                operateur = "MTN"
                reseau = "MTN CM"
                itinerance = False
            self.carte = Carte()
            self.carte.iccid = iccid

        def signal(self):
            return self._signal

    def publies(self):
        lignes = []
        pont = Nuage("http://127.0.0.1:9", "cle", "douala", None)
        pont._inserer_ou_mettre_a_jour = (
            lambda table, l, cle, delai=None: lignes.extend(l) or True)
        valeurs = (22, 0, 31, 99, 32, -1, None, True, "22")
        pont.publier_comptes([self.Compte(f"8923701000000000{i:04d}", v)
                              for i, v in enumerate(valeurs)])
        return [l["signal"] for l in lignes]

    def test_un_signal_inconnu_est_publie_vide(self):
        self.assertEqual(self.publies(),
                         [22, 0, 31, None, None, None, None, None, None])

    def test_temoin_le_signal_brut_publiait_99(self):
        """Le contrôle voit la faute : rendu à l'ancienne (le signal tel
        quel), 99 repart vers la plateforme."""
        vrai = module_nuage._signal_publiable
        module_nuage._signal_publiable = lambda valeur: valeur
        try:
            self.assertIn(99, self.publies())
        finally:
            module_nuage._signal_publiable = vrai


if __name__ == "__main__":
    unittest.main()
