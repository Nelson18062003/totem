# -*- coding: utf-8 -*-
"""Le service d'une carte — a-t-elle son réseau ? — lu, retenu, dit.

« Check balance » répondait « no network service » : la carte n'était
inscrite sur aucun réseau, l'écran montrait des barres, et rien ne l'avait
dit. Des barres ne disent pas qu'on a du réseau (voir totem/service.py).

Chaque classe porte son TÉMOIN : l'ancienne façon de faire, réécrite en
quelques lignes, doit échouer sur la même entrée — sans quoi l'essai ne
prouverait rien.
"""

import re
import threading
import time
import unittest

from totem import service as S
from totem.app import Robot
from totem.compte import Compte
from totem.modem import (ErreurModem, MenuReferme, ModemSerie, PasDeReseau)
from totem.service import EtatDuService, etat_du_service
from tests.test_pilotage import FausseCarte
from tests.test_ussd_au_modem import PortHorloge, modem_sur


# =============================================================================
# 1. Lire : deux registres, un état.
# =============================================================================
def ancienne_lecture(stat):
    """Tout ce que le robot tirait de « +CREG » : itinérance ou non."""
    return stat == "5"


class TestLaLectureDuService(unittest.TestCase):
    def test_chaque_code_a_son_etat(self):
        attendus = {
            (1, None): S.INSCRITE, (9, None): S.INSCRITE,
            (5, None): S.ITINERANCE, (10, None): S.ITINERANCE,
            (6, None): S.SMS_SEULEMENT, (7, None): S.SMS_SEULEMENT,
            (0, 1): S.LIMITEE, (2, 5): S.LIMITEE,
            (2, None): S.RECHERCHE, (2, 0): S.RECHERCHE,
            (3, 0): S.REFUSEE, (0, 0): S.AUCUN, (4, None): S.AUCUN,
            (8, 0): S.AUCUN, (None, None): S.INCONNU,
        }
        for (creg, cereg), etat in attendus.items():
            self.assertEqual(etat_du_service(creg, cereg), etat, (creg, cereg))

    def test_une_sim_absente_ne_dit_pas_aucun_service(self):
        """Sans SIM, le modem répond « +CREG: 0,0 » comme une carte sans
        réseau : on ne conclut rien."""
        self.assertEqual(etat_du_service(0, 0, sim_prete=False), S.INCONNU)

    def test_sms_seulement_n_est_pas_sans_service(self):
        """Inscrite pour les SMS seulement, la carte REÇOIT ses
        encaissements : dire le contraire au propriétaire serait faux."""
        self.assertNotIn(S.SMS_SEULEMENT, S.SANS_SERVICE)

    def test_temoin_l_ancienne_lecture_ne_distingue_rien(self):
        """Inscrite, sans réseau, refusée : la même réponse (« pas en
        itinérance ») — et l'itinérance 10 lui échappait."""
        self.assertEqual({ancienne_lecture(x) for x in ("1", "0", "3", "2")}, {False})
        self.assertFalse(ancienne_lecture("10"))
        self.assertEqual(etat_du_service(10), S.ITINERANCE)


class TestLeModemLitLInscription(unittest.TestCase):
    """Ce que le modem répond, octet par octet, et ce qu'on en tire."""

    def _modem(self, reponses):
        port = PortScripte(reponses)
        m = modem_sur(port)
        return m, port

    def test_inscrite(self):
        m, port = self._modem({"AT+CPIN?": "+CPIN: READY\r\n\r\nOK\r\n",
                               "AT+CREG?": "+CREG: 0,1\r\n\r\nOK\r\n"})
        self.assertEqual(m.inscription(), (True, 1, None))
        # Inscrite : pas besoin de demander la 4G.
        self.assertFalse(any(b"CEREG" in e for e in port.ecrit))

    def test_sans_reseau_lit_aussi_la_4g(self):
        m, _ = self._modem({"AT+CPIN?": "+CPIN: READY\r\n\r\nOK\r\n",
                            "AT+CREG?": "+CREG: 2,0\r\n\r\nOK\r\n",
                            "AT+CEREG?": "+CEREG: 0,1\r\n\r\nOK\r\n"})
        sim, creg, cereg = m.inscription()
        self.assertEqual(etat_du_service(creg, cereg, sim), S.LIMITEE)

    def test_une_reponse_illisible_n_est_pas_sans_reseau(self):
        m, _ = self._modem({"AT+CPIN?": "+CPIN: READY\r\n\r\nOK\r\n",
                            "AT+CREG?": "ERROR\r\n"})
        sim, creg, cereg = m.inscription()
        self.assertEqual(etat_du_service(creg, cereg, sim), S.INCONNU)

    def test_sim_absente(self):
        m, port = self._modem({"AT+CPIN?": "+CME ERROR: SIM not inserted\r\n"})
        self.assertEqual(m.inscription(), (False, None, None))
        self.assertFalse(any(b"CREG" in e for e in port.ecrit))


class PortScripte:
    """Un port qui répond à chaque commande AT ce que le script en dit."""

    def __init__(self, reponses, lever_sur=None):
        self.reponses = reponses
        self.lever_sur = lever_sur or {}
        self.ecrit = []
        self._sortie = b""
        self.en_attente = b""

    @property
    def in_waiting(self):
        return len(self.en_attente)

    def read(self, n):
        x, self.en_attente = self.en_attente[:n], self.en_attente[n:]
        return x

    def reset_input_buffer(self):
        self.en_attente = b""

    def write(self, octets):
        self.ecrit.append(octets)
        commande = octets.decode().strip()
        if commande in self.lever_sur:
            raise self.lever_sur.pop(commande)
        self._sortie += self.reponses.get(commande, "OK\r\n").encode()

    def read_all(self):
        x, self._sortie = self._sortie, b""
        return x


# =============================================================================
# 2. Retenir : un hoquet ne se dit pas, une carte qui « se déconnecte tout le
#    temps » se voit.
# =============================================================================
def jouer(service, lectures, depart=0.0, pas=15.0):
    """Joue des lectures toutes les `pas` secondes ; rend (instant, événements)."""
    t = depart
    vus = []
    for etat in lectures:
        vus.append((t, service.noter(etat, t)))
        t += pas
    return t, vus


class TestLaMemoireDUneCarte(unittest.TestCase):
    def test_un_hoquet_ne_se_dit_pas(self):
        e = EtatDuService()
        jouer(e, [S.INSCRITE, S.AUCUN, S.INSCRITE])
        self.assertEqual(e.etat, S.INSCRITE)
        self.assertIsNone(e.episode)

    def test_deux_lectures_mauvaises_se_disent_et_datent_de_la_premiere(self):
        e = EtatDuService()
        _, vus = jouer(e, [S.INSCRITE, S.AUCUN, S.AUCUN])
        self.assertEqual(e.etat, S.AUCUN)
        self.assertEqual(vus[2][1], ["episode", "coupure"])
        self.assertEqual(e.mauvais_depuis, 15.0)      # la PREMIÈRE mauvaise

    def test_inconnu_ne_compte_ni_pour_ni_contre(self):
        e = EtatDuService()
        jouer(e, [S.AUCUN, S.INCONNU, S.INCONNU, S.AUCUN])
        self.assertEqual(e.etat, S.AUCUN)     # deux mauvaises, l'inconnu entre les deux
        e2 = EtatDuService()
        jouer(e2, [S.INSCRITE, S.AUCUN, S.AUCUN, S.INCONNU, S.INCONNU])
        self.assertEqual(e2.etat, S.AUCUN)    # l'inconnu ne fait pas revenir

    def test_une_carte_qui_se_coupe_souvent_est_un_episode_et_une_alerte(self):
        """Dix minutes sans réseau, deux avec, et ainsi de suite : sans
        réseau 80 % du temps. Le cumul prévient à la deuxième coupure."""
        e = EtatDuService()
        t = 0.0
        alertes = []
        episodes = 0
        for _ in range(4):
            for _ in range(40):           # 10 min sans réseau
                ev = e.noter(S.AUCUN, t)
                episodes += ev.count("episode")
                genre = e.a_prevenir(t)
                if genre:
                    alertes.append((t, genre))
                    e.prevenu(t, genre)
                t += 15
            for _ in range(8):            # 2 min avec
                e.noter(S.INSCRITE, t)
                t += 15
        self.assertEqual(episodes, 1)
        self.assertEqual(len(alertes), 1)
        self.assertEqual(alertes[0][1], "longue")
        self.assertLess(alertes[0][0], 25 * 60)

    def test_temoin_quinze_minutes_d_affilee_ne_voit_jamais_cette_carte(self):
        def ancienne_alerte(lectures, pas=15):
            continu = 0
            for etat in lectures:
                continu = continu + pas if etat in S.SANS_SERVICE else 0
                if continu >= 900:
                    return True
            return False
        lectures = ([S.AUCUN] * 40 + [S.INSCRITE] * 8) * 4
        self.assertFalse(ancienne_alerte(lectures))

    def test_frequente_quatre_coupures_en_une_heure(self):
        e = EtatDuService()
        t = 0.0
        genre = None
        for _ in range(4):
            for etat in [S.AUCUN] * 4 + [S.INSCRITE] * 8:
                e.noter(etat, t)
                genre = genre or e.a_prevenir(t)
                t += 15
        self.assertEqual(genre, "frequente")

    def test_dix_minutes_de_bon_closent_l_episode(self):
        e = EtatDuService()
        t, _ = jouer(e, [S.AUCUN] * 4)
        t, vus = jouer(e, [S.INSCRITE] * 45, depart=t)
        fins = [x for x, ev in vus if "fin_episode" in ev]
        self.assertEqual(len(fins), 1)
        self.assertIsNone(e.episode)
        self.assertEqual(len(e.episode_clos()["coupures"]), 1)

    def test_le_contrat_avec_la_plateforme(self):
        """`web/noyau/tests/service-publie.json` est lu des deux côtés : une
        clé renommée ici ferait dessiner des barres sur une carte sans
        réseau, sans un mot."""
        import json
        import os
        chemin = os.path.join(os.path.dirname(__file__), "..", "web", "noyau",
                              "tests", "service-publie.json")
        contrat = json.load(open(chemin, encoding="utf-8"))
        e = EtatDuService()
        jouer(e, [S.AUCUN, S.AUCUN])
        self.assertEqual(sorted(e.a_publier(100)), sorted(contrat["cles"]))
        self.assertEqual(sorted(S.SANS_SERVICE), sorted(contrat["sans_service"]))
        self.assertEqual(sorted({S.INSCRITE, S.ITINERANCE, S.SMS_SEULEMENT, S.LIMITEE,
                                 S.RECHERCHE, S.REFUSEE, S.AUCUN}), sorted(contrat["etats"]))

    def test_ce_qui_se_publie(self):
        e = EtatDuService()
        self.assertIsNone(e.a_publier(0))             # rien lu : l'écran garde ses barres
        jouer(e, [S.AUCUN, S.AUCUN])
        p = e.a_publier(15 + 60)
        self.assertEqual(p["etat"], S.AUCUN)
        self.assertEqual(p["depuis_s"], 75)           # depuis la PREMIÈRE mauvaise
        self.assertEqual(p["coupures_24h"], 1)
        self.assertEqual(p["sans_service_24h_s"], 75)


class TestLaRelanceSeDecide(unittest.TestCase):
    def _coupee_depuis(self, minutes):
        e = EtatDuService()
        jouer(e, [S.AUCUN] * (minutes * 4 + 1))
        return e, minutes * 60.0

    def test_pas_avant_quatre_minutes(self):
        e, t = self._coupee_depuis(3)
        self.assertFalse(e.a_relancer(t, depuis_demarrage=9999))
        e, t = self._coupee_depuis(4)
        self.assertTrue(e.a_relancer(t, depuis_demarrage=9999))

    def test_pas_au_demarrage_ni_en_groupe(self):
        e, t = self._coupee_depuis(5)
        self.assertFalse(e.a_relancer(t, depuis_demarrage=60))
        self.assertFalse(e.a_relancer(t, depuis_demarrage=9999, groupe=True))

    def test_jamais_sur_une_carte_qui_a_son_reseau(self):
        """Au milieu d'un épisode, une carte revenue ne se relance pas."""
        e, t = self._coupee_depuis(5)
        jouer(e, [S.INSCRITE], depart=t)
        self.assertFalse(e.a_relancer(t + 15, depuis_demarrage=9999))

    def test_deux_par_episode_au_plus(self):
        e, t = self._coupee_depuis(5)
        relances = 0
        while t < 4 * 3600:
            if e.a_relancer(t, depuis_demarrage=9999):
                e.radio_relancee(t)
                relances += 1
            e.noter(S.AUCUN, t)
            t += 15
        self.assertEqual(relances, 2)


class TestLeModemApresLaRadio(unittest.TestCase):
    """La radio relancée n'a rien changé : cinq minutes plus tard, le modem
    entier. C'est ce que le propriétaire faisait en relançant tout le robot
    (« ce n'était pas le robot qui ramenait la carte, c'était le temps » —
    sauf quand la radio seule ne suffisait pas)."""

    def _apres_la_radio(self):
        e = EtatDuService()
        jouer(e, [S.AUCUN] * 17)                  # 4 min sans service
        t = 4 * 60.0
        self.assertTrue(e.a_relancer(t, depuis_demarrage=9999))
        e.radio_relancee(t)
        return e, t

    def test_pas_sans_radio_d_abord(self):
        e = EtatDuService()
        jouer(e, [S.AUCUN] * 60)                  # 15 min, aucune radio
        self.assertFalse(e.a_relancer_le_modem(15 * 60.0, depuis_demarrage=9999))

    def test_cinq_minutes_apres_la_radio_une_fois(self):
        e, t = self._apres_la_radio()
        jouer(e, [S.AUCUN] * 19, depart=t + 15)
        self.assertFalse(e.a_relancer_le_modem(t + 299, depuis_demarrage=9999))
        self.assertTrue(e.a_relancer_le_modem(t + 300, depuis_demarrage=9999))
        e.modem_relance(t + 300)
        self.assertFalse(e.a_relancer_le_modem(t + 3600, depuis_demarrage=9999))

    def test_revenue_puis_repartie_ce_n_est_plus_la_meme_coupure(self):
        e, t = self._apres_la_radio()
        jouer(e, [S.INSCRITE, S.INSCRITE, S.AUCUN, S.AUCUN], depart=t + 15)
        self.assertFalse(e.a_relancer_le_modem(t + 600, depuis_demarrage=9999))

    def test_pas_au_demarrage_ni_en_groupe(self):
        e, t = self._apres_la_radio()
        jouer(e, [S.AUCUN] * 21, depart=t + 15)
        self.assertFalse(e.a_relancer_le_modem(t + 320, depuis_demarrage=60))
        self.assertFalse(e.a_relancer_le_modem(t + 320, depuis_demarrage=9999,
                                               groupe=True))


# =============================================================================
# 3. La lecture ne dérange rien ; un menu refermé ne se perd plus.
# =============================================================================
class ModemInscription:
    """Un modem qui ne sait que dire son inscription (et le compter)."""

    def __init__(self, reponse=(True, 1, None), attente=0.0):
        self.reponse = reponse
        self.attente = attente
        self.lectures = 0
        self.relances = 0
        self.redemarrages = 0
        self.port = "/dev/ttyUSB2"

    def inscription(self):
        self.lectures += 1
        if self.attente:
            time.sleep(self.attente)
        return self.reponse

    def relancer_radio(self):
        self.relances += 1
        return True

    def redemarrer(self):
        self.redemarrages += 1


class TestLaLectureNeDerangeRien(unittest.TestCase):
    def test_pas_pendant_un_menu(self):
        modem = ModemInscription()
        c = Compte(modem, libelle="MTN ·6414", carte=FausseCarte())
        c.session_ouverte = True
        self.assertIsNone(c.lire_service())
        self.assertEqual(modem.lectures, 0)

    def test_pas_quand_la_carte_est_prise_et_sans_attendre(self):
        modem = ModemInscription()
        c = Compte(modem, libelle="MTN ·6414", carte=FausseCarte())
        c.verrou.acquire()
        try:
            debut = time.monotonic()
            self.assertIsNone(c.lire_service())
            self.assertLess(time.monotonic() - debut, 0.2)
        finally:
            c.verrou.release()
        self.assertEqual(modem.lectures, 0)

    def test_un_modem_qui_bafouille_donne_inconnu(self):
        class Bafouille:
            def inscription(self):
                raise OSError("Input/output error")
        c = Compte(Bafouille(), libelle="MTN ·6414", carte=FausseCarte())
        self.assertEqual(c.lire_service(), S.INCONNU)


def ancien_envoyer(self, commande, delai=5):
    """`_envoyer` d'avant : le port vidé SANS être lu."""
    self.ser.reset_input_buffer()
    self.ser.write((commande + "\r").encode())
    fin = time.time() + delai
    tampon = b""
    while time.time() < fin:
        tampon += self.ser.read_all() or b""
        if re.search(rb"(?:^|[\r\n])\s*(?:OK|ERROR)\s*(?:[\r\n]|$)", tampon):
            break
        time.sleep(0.01)
    return tampon.decode(errors="replace")


class TestUnMenuRefermeNeSePerdPas(unittest.TestCase):
    """L'opérateur referme le menu pendant que la personne tape son code ;
    entre-temps, le fil de la carte relève ses SMS (il le fait toutes les
    dix secondes, menu ouvert ou non). Le code ne doit pas partir."""

    def _scene(self, modem_classe=ModemSerie):
        port = PortHorloge([(0, b'+CUSD: 1,"Entrez votre code secret",15\r\n')])
        m = modem_sur(port)
        m.__class__ = modem_classe
        m.mode_pdu = True
        c = Compte(m, libelle="MTN ·6414", carte=FausseCarte())
        c.ussd_demarrer("*126#")
        self.assertTrue(c.session_ouverte)
        port.en_attente = b"\r\n+CUSD: 2\r\n"          # le réseau a refermé
        port.morceaux = [(0, b"\r\nOK\r\n")]           # la réponse à AT+CMGL
        c.lire_sms()
        port.morceaux = [(0, b"+CUSD: 4\r\n")]
        return c, port

    def test_le_code_ne_part_pas(self):
        c, port = self._scene()
        with self.assertRaises(MenuReferme):
            c.ussd_repondre("1234")
        self.assertFalse(any(b"1234" in e for e in port.ecrit))

    def test_temoin_le_port_vide_sans_etre_lu_envoie_le_code(self):
        class ModemDAvant(ModemSerie):
            _envoyer = ancien_envoyer
        c, port = self._scene(ModemDAvant)
        try:
            c.ussd_repondre("1234")
        except Exception:
            pass
        self.assertTrue(any(b"1234" in e for e in port.ecrit),
                        "le témoin devait laisser partir le code")

    def test_une_annonce_de_sms_n_est_pas_perdue_non_plus(self):
        port = PortScripte({})
        m = modem_sur(port)
        port.en_attente = b'\r\n+CMTI: "ME",4\r\n'
        m._envoyer("AT")
        self.assertTrue(m.sms_annonce())


# =============================================================================
# 4. Le refus se dit, en français ; la relance ne laisse jamais la radio coupée.
# =============================================================================
class TestLeRefusSeDit(unittest.TestCase):
    def test_no_network_service(self):
        for erreur in (b"+CME ERROR: no network service\r\n", b"+CME ERROR: 30\r\n",
                       b"+CME ERROR: 32\r\n"):
            m = modem_sur(PortHorloge([(0, erreur)]))
            with self.assertRaises(PasDeReseau) as x:
                m._attendre_cusd(2)
            message = str(x.exception).lower()
            self.assertTrue("rien n'est parti" in message or "nothing was sent" in message, message)
            self.assertNotIn("no network service", message)

    def test_un_delai_du_reseau_n_est_pas_pas_de_reseau(self):
        """CME 31 (network timeout) : quelque chose est peut-être parti."""
        m = modem_sur(PortHorloge([(0, b"+CME ERROR: 31\r\n")]))
        with self.assertRaises(ErreurModem) as x:
            m._attendre_cusd(2)
        self.assertNotIsInstance(x.exception, PasDeReseau)

    def test_la_carte_se_relit_tout_de_suite_apres_un_refus(self):
        class Refuse:
            def ussd_demarrer(self, code):
                raise PasDeReseau("+CME ERROR: no network service")
            def ussd_annuler(self):
                pass
        c = Compte(Refuse(), libelle="MTN ·6414", carte=FausseCarte())
        c.service.prochaine_lecture = 1e12
        with self.assertRaises(PasDeReseau):
            c.ussd_demarrer("*126#")
        self.assertTrue(c.service.a_lire(0))

    def test_temoin_l_ancien_message_etait_en_anglais(self):
        cause = "+CME ERROR: no network service"
        ancien = f"Le modem a refusé la demande ({cause}). Rien n'est parti."
        self.assertIn("no network service", ancien)


INTERDITES = re.compile(rb"AT\+(?:COPS=[124?]|CFUN=[567]|CPOF|CNMP|CNBP|CREG=[12]|CEREG=[12])")


class TestDeuxRelancesQuiSeChevauchent(unittest.TestCase):
    """La veille relance la radio pendant que le chien de garde relance le
    modem : la première relance finie ne lève pas la garde de la seconde."""

    def test_la_garde_tient_jusqu_a_la_derniere(self):
        c = Compte(ModemInscription(), libelle="MTN ·6414", carte=FausseCarte())
        with c._reglage():
            with c._reglage():
                self.assertTrue(c.en_reglage)
            self.assertTrue(c.en_reglage)         # la seconde court encore
            with self.assertRaises(PasDeReseau):
                c.ussd_demarrer("*126#")
        self.assertFalse(c.en_reglage)

    def test_temoin_un_drapeau_s_efface_au_premier_retour(self):
        drapeau = True                            # la première relance pose
        drapeau = True                            # la seconde pose
        drapeau = False                           # la première finit…
        self.assertFalse(drapeau)                 # …et la seconde n'est plus gardée

    def test_un_refus_pendant_une_relance_n_accuse_pas_le_modem(self):
        from totem.pilotage import Pilotage
        from tests.test_pilotage import FauxCompte, FauxJournal, FauxNuage
        compte = FauxCompte([])
        journal = FauxJournal()
        p = Pilotage(FauxNuage(), [compte], journal)
        with compte._reglage():
            p._traiter({"id": 1, "type": "ussd",
                        "parametres": {"code": "*126#", "carte": FausseCarte.iccid}})
        self.assertFalse(any("a refusé le code" in e or "refused the code" in e
                             for e in journal.evenements), journal.evenements)
        self.assertTrue(any("se reconnecte" in e or "reconnecting" in e
                            for e in journal.evenements), journal.evenements)
        self.assertEqual(PasDeReseau(reconnexion=True).cause, "")


class TestLaRelanceDeLaRadio(unittest.TestCase):
    """Les trois secondes de mode avion ne s'attendent pas pour de vrai."""

    def setUp(self):
        import totem.modem as modem
        self._sommeil = modem.time.sleep
        modem.time.sleep = lambda s: self._sommeil(min(s, 0.01))

    def tearDown(self):
        import totem.modem as modem
        modem.time.sleep = self._sommeil

    def _modem(self, reponses, lever_sur=None):
        port = PortScripte(reponses, lever_sur)
        m = modem_sur(port)
        m._memo = {}
        return m, port

    def test_mode_avion_puis_retour_verifie(self):
        m, port = self._modem({"AT+CFUN?": "+CFUN: 1\r\n\r\nOK\r\n"})
        self.assertTrue(m.relancer_radio())
        self.assertEqual([e.strip() for e in port.ecrit],
                         [b"AT+CFUN=4", b"AT+CFUN=1", b"AT+CFUN?"])
        self.assertFalse(any(INTERDITES.search(e) for e in port.ecrit))

    def test_la_radio_se_rallume_meme_si_la_coupure_casse(self):
        m, port = self._modem({"AT+CFUN?": "+CFUN: 1\r\n\r\nOK\r\n"},
                              lever_sur={"AT+CFUN=4": OSError("Input/output error")})
        with self.assertRaises(OSError):
            m.relancer_radio()
        self.assertIn(b"AT+CFUN=1\r", port.ecrit)

    def test_une_radio_qui_ne_revient_pas_se_dit(self):
        m, port = self._modem({"AT+CFUN?": "+CFUN: 4\r\n\r\nOK\r\n"})
        debut = time.monotonic()
        self.assertFalse(m.relancer_radio())
        self.assertEqual(sum(1 for e in port.ecrit if e.strip() == b"AT+CFUN=1"), 3)
        self.assertLess(time.monotonic() - debut, 5)

    def test_pendant_la_relance_une_demande_est_refusee_tout_de_suite(self):
        relance_en_cours = threading.Event()
        fin = threading.Event()

        class Lent(ModemInscription):
            def relancer_radio(self):
                relance_en_cours.set()
                fin.wait(5)
                return True

            def ussd_demarrer(self, code):
                raise AssertionError("rien ne doit partir")

        c = Compte(Lent(), libelle="MTN ·6414", carte=FausseCarte())
        fil = threading.Thread(target=c.relancer_radio)
        fil.start()
        relance_en_cours.wait(2)
        debut = time.monotonic()
        with self.assertRaises(PasDeReseau) as x:
            c.ussd_demarrer("*126*5*1#")
        self.assertLess(time.monotonic() - debut, 0.5)
        self.assertTrue("se reconnecte" in str(x.exception)
                        or "reconnecting" in str(x.exception), str(x.exception))
        fin.set()
        fil.join(5)
        self.assertFalse(c.en_reglage)


# =============================================================================
# 5. Le robot veille : il le dit, il relance, il prévient — une fois.
# =============================================================================
class Journal:
    def __init__(self):
        self.notes = []

    def evenement(self, texte):
        self.notes.append(texte)


class Facteur:
    def __init__(self):
        self.lettres = []

    def poster(self, texte, canal=None):
        self.lettres.append((canal, texte))


class Nuage:
    def __init__(self):
        self.reveils = 0

    def signe_de_vie_tot(self):
        self.reveils += 1


class CarteDe:
    def __init__(self, operateur, iccid):
        self.operateur = operateur
        self.iccid = iccid
        self.identifiee = True
        self.itinerance = False


def robot_avec(*cartes):
    r = Robot.__new__(Robot)
    r.comptes = []
    for operateur, iccid, reponse in cartes:
        modem = ModemInscription(reponse)
        c = Compte(modem, libelle=f"{operateur} ·{iccid[-4:]}", carte=CarteDe(operateur, iccid))
        r.comptes.append(c)
    r.journal = Journal()
    r.facteur = Facteur()
    r.nuage = Nuage()
    r._demarre_mono = -1e6
    r._une_relance = threading.Lock()
    r._derniere_relance = -1e6
    r._verrou_service = threading.Lock()
    r._groupes_dits = set()
    return r


def veiller(robot, minutes, pas=15):
    t = 0.0
    while t <= minutes * 60:
        for c in robot.comptes:
            robot._veiller_service(c, maintenant=t)
        t += pas
    return t


class TestLeRobotVeille(unittest.TestCase):
    """Le robot parle français au propriétaire : on l'écoute en français."""

    def setUp(self):
        from totem import textes
        self._langue = textes.langue_active()
        textes.definir_langue("fr")

    def tearDown(self):
        from totem import textes
        textes.definir_langue(self._langue)

    def test_une_carte_coupee_se_dit_se_relance_et_previent(self):
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)),
                       ("Orange", "89237020000000004177", (True, 1, None)))
        veiller(r, 20)
        coupee = r.comptes[0]
        self.assertTrue(any("réseau MTN ·6414 : aucun service" in n for n in r.journal.notes))
        self.assertEqual(coupee.modem.relances, 1)          # à 4 min ; la 2e à 34 min
        self.assertEqual(r.comptes[1].modem.relances, 0)
        alertes = [x for _, x in r.facteur.lettres if "Carte sans réseau" in x]
        self.assertEqual(len(alertes), 1)
        self.assertIn("MTN ·6414", alertes[0])
        self.assertGreaterEqual(r.nuage.reveils, 1)
        # Le journal ne porte ni ICCID ni rien de personnel.
        self.assertFalse(any(re.search(r"\d{6,}", n) for n in r.journal.notes))

    def test_toujours_coupee_apres_la_radio_le_modem_se_relance(self):
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)),
                       ("Orange", "89237020000000004177", (True, 1, None)))
        veiller(r, 30)
        coupee = r.comptes[0]
        self.assertEqual(coupee.modem.relances, 1)          # la radio, à 4 min
        self.assertEqual(coupee.modem.redemarrages, 1)      # le modem, à 9 min
        self.assertEqual(r.comptes[1].modem.redemarrages, 0)
        self.assertTrue(any("après la relance de la radio — le modem est relancé" in n
                            for n in r.journal.notes), r.journal.notes)
        self.assertTrue(any(n.startswith("modem relancé (MTN ·6414)")
                            for n in r.journal.notes), r.journal.notes)
        # Ce modem répond très bien : rien ne dit le contraire.
        self.assertFalse(any("ne répond plus" in x for _, x in r.facteur.lettres))

    def test_revenue_apres_la_radio_le_modem_reste(self):
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)))
        t = veiller(r, 5)                                   # la radio, à 4 min
        r.comptes[0].modem.reponse = (True, 5, None)        # revenue, en itinérance
        while t <= 30 * 60:
            r._veiller_service(r.comptes[0], maintenant=t)
            t += 15
        self.assertEqual(r.comptes[0].modem.relances, 1)
        self.assertEqual(r.comptes[0].modem.redemarrages, 0)

    def test_pas_pendant_un_menu(self):
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)))
        t = veiller(r, 5)
        r.comptes[0].session_ouverte = True                 # quelqu'un compose
        while t <= 12 * 60:
            r._veiller_service(r.comptes[0], maintenant=t)
            t += 15
        self.assertEqual(r.comptes[0].modem.redemarrages, 0)

    def test_temoin_la_radio_seule_laisse_la_carte_coupee(self):
        """La veille d'avant la fusion ne relançait que la radio : la carte
        restait sans service jusqu'à la seconde radio, trente minutes plus
        tard, sans que le modem soit jamais relancé."""
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)))
        r.comptes[0].service.a_relancer_le_modem = lambda *a, **k: False
        veiller(r, 30)
        self.assertEqual(r.comptes[0].modem.redemarrages, 0)

    def test_une_relance_pour_les_codes_suffit_pour_l_episode(self):
        """Le modem relancé pour trois codes sans réponse : la veille ne le
        relance pas une seconde fois cinq minutes plus tard, et les codes
        repartent de zéro (une relance par la veille aussi)."""
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)))
        c = r.comptes[0]
        t = veiller(r, 5)                         # la radio, à 4 min
        c.codes_sans_reseau = 2
        c.redemarrer()                            # trois codes, le chien de garde…
        self.assertEqual(c.codes_sans_reseau, 0)
        while t <= 20 * 60:
            r._veiller_service(c, maintenant=t)
            t += 15
        self.assertEqual(c.modem.redemarrages, 1)  # pas deux

    def test_temoin_une_relance_ignoree_de_la_veille(self):
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)))
        c = r.comptes[0]
        t = veiller(r, 5)
        c.modem.redemarrer()                      # la relance d'avant : le modem seul
        while t <= 20 * 60:
            r._veiller_service(c, maintenant=t)
            t += 15
        self.assertEqual(c.modem.redemarrages, 2)

    def test_tout_le_boitier_coupe_une_alerte_et_aucune_relance(self):
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)),
                       ("MTN", "89237010000000006299", (True, 0, 0)),
                       ("Orange", "89237020000000004177", (True, 0, 0)))
        veiller(r, 30)
        self.assertEqual(sum(c.modem.relances for c in r.comptes), 0)
        self.assertEqual(sum(c.modem.redemarrages for c in r.comptes), 0)
        alertes = [x for _, x in r.facteur.lettres if "sans réseau" in x]
        self.assertEqual(len(alertes), 1)
        self.assertIn("Aucune carte du boîtier", alertes[0])

    def test_tout_un_operateur_coupe(self):
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)),
                       ("MTN", "89237010000000006299", (True, 2, None)),
                       ("Orange", "89237020000000004177", (True, 1, None)))
        veiller(r, 30)
        self.assertEqual(sum(c.modem.relances for c in r.comptes), 0)
        alertes = [x for _, x in r.facteur.lettres if "sans réseau" in x]
        self.assertEqual(len(alertes), 1)
        self.assertIn("Aucune carte MTN", alertes[0])

    def test_temoin_sans_groupe_trois_relances_ensemble(self):
        """Le regroupement retiré, les trois modems se relancent pour une
        coupure du quartier — trois réinscriptions qui n'y changent rien."""
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)),
                       ("MTN", "89237010000000006299", (True, 0, 0)),
                       ("Orange", "89237020000000004177", (True, 0, 0)))
        r._groupe_sans_service = lambda compte: None
        r._derniere_relance = -1e6
        import totem.app as app
        espacement, app.ESPACEMENT_RADIO = app.ESPACEMENT_RADIO, -1
        try:
            veiller(r, 6)
        finally:
            app.ESPACEMENT_RADIO = espacement
        self.assertEqual(sum(c.modem.relances for c in r.comptes), 3)

    def test_le_retour_s_annonce_apres_dix_minutes_de_bon(self):
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)),
                       ("Orange", "89237020000000004177", (True, 1, None)))
        t = veiller(r, 20)
        r.comptes[0].modem.reponse = (True, 1, None)
        while t <= 20 * 60 + 11 * 60:
            for c in r.comptes:
                r._veiller_service(c, maintenant=t)
            t += 15
        retours = [x for _, x in r.facteur.lettres if "retrouvé son réseau" in x]
        self.assertEqual(len(retours), 1)
        self.assertTrue(any("revenu" in n and "coupure" in n for n in r.journal.notes))

    def test_le_signe_de_vie_porte_le_service(self):
        from totem.nuage import Nuage as VraiNuage
        r = robot_avec(("MTN", "89237010000000006414", (True, 0, 0)))
        veiller(r, 2)
        n = VraiNuage.__new__(VraiNuage)
        n.journal = type("J", (), {"sms_en_attente": lambda self: 0})()
        n._sante = None
        n._comptes = r.comptes
        cartes = n._etat_du_terminal()["cartes"]
        self.assertEqual(cartes["89237010000000006414"]["etat"], S.AUCUN)
        self.assertIn("depuis_s", cartes["89237010000000006414"])


if __name__ == "__main__":
    unittest.main()
