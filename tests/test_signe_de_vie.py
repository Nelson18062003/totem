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

import json
import threading
import time
import unittest
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
                    with banc.verrou:
                        banc.paiements.extend(corps)
                        banc.paiements_le.append(time.monotonic())
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
