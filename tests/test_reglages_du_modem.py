# -*- coding: utf-8 -*-
"""Le modem reprend SES réglages à chaque retour ; le robot doit reposer les
siens — et vérifier qu'ils sont pris.

LE 22 OCTOBRE À DOUALA. À 06 h 22, les quatre modems ont décroché du bus USB
à la même minute (« Input/output error » sur chaque port) ; le robot les a
relancés, en silence. Dès lors, la carte Orange relevait ses SMS comme si de
rien n'était — et répondait « parti, sans réponse du réseau à temps » à
CHAQUE code, de 06 h 52 à 10 h 07, à travers deux relances du robot, jusqu'à
ce qu'on relance le service entier. Le propriétaire faisait « sudo bash
install.sh » trois fois par matinée.

Un modem qui redémarre repart avec ses réglages par défaut, et par défaut il
n'ANNONCE pas les réponses USSD (+CUSD) : il envoie le code, reçoit la réponse
du réseau, et la garde pour lui. Les SMS, eux, se relèvent toujours — AT+CMGL
est une question, pas une annonce. Le robot reposait ses réglages une fois,
sans regarder la réponse ; un modem qui vient de revenir sur le bus les
refuse volontiers pendant quelques secondes (« SIM busy », ou rien).

Trois choses sont gardées ici :

  1. les réglages sont REPOSÉS tant que le modem en refuse un, et ceux qu'il
     refuse encore sont retenus (`reglages_refuses`) ;
  2. un silence du réseau se SONDE : signal, carte sur le réseau, annonces
     USSD — et un réglage tombé est reposé sur-le-champ ;
  3. la cause d'un échec va au JOURNAL, sur les deux chemins (plateforme,
     Telegram) — « échec (ussd) » tout court, treize fois, ne disait rien.

Le TÉMOIN est la mise en route d'avant, recopiée : un seul passage, sans
regarder les réponses. Elle doit laisser les annonces éteintes sur le modem
qui refuse une fois ; sinon le banc ne prouve rien.

Lancer :  python3 -m unittest tests.test_reglages_du_modem -v
"""

import sys
import threading
import types
import unittest
from unittest import mock

import totem.modem
from totem.compte import Compte
from totem.modem import (ESSAIS_REGLAGES, ModemSerie, RefusDuModem,
                         ReponseNonRecue, phrase_du_silence)
from totem.pilotage import Pilotage
from totem.textes import definir_langue, langue_active
from tests.test_pilotage import FausseCarte, FauxCompte, FauxJournal, FauxNuage


class EnFrancais(unittest.TestCase):
    """Les phrases jugées ici sont celles du journal, dans la langue du
    robot : on la fixe, et on la rend."""

    def setUp(self):
        self._langue = langue_active()
        definir_langue("fr")

    def tearDown(self):
        definir_langue(self._langue)


class ModemQuiRevient:
    """Un port série derrière lequel le modem vient de redémarrer : il
    refuse `AT+CUSD=1` les `refus` premières fois (« SIM busy »), puis
    l'accepte. Il tient l'état du réglage, comme le vrai : `annonces`."""

    def __init__(self, refus=1, enregistre="1", signal=21, alphabet="GSM"):
        self.refus = refus
        self.annonces = 0           # le défaut du modem au démarrage
        self.enregistre = enregistre
        self.signal = signal
        self.alphabet = alphabet
        self.ecrit = []
        self.tampon = b""

    @property
    def in_waiting(self):
        return len(self.tampon)

    def read(self, n):
        d, self.tampon = self.tampon[:n], self.tampon[n:]
        return d

    def read_all(self):
        d, self.tampon = self.tampon, b""
        return d

    def reset_input_buffer(self):
        self.tampon = b""

    def write(self, octets):
        commande = octets.decode().strip()
        self.ecrit.append(commande)
        self.tampon += self._reponse(commande).encode()

    def _reponse(self, commande):
        if commande == "AT+CUSD=1":
            if self.refus > 0:
                self.refus -= 1
                return "\r\n+CME ERROR: SIM busy\r\n"
            self.annonces = 1
            return "\r\nOK\r\n"
        if commande == "AT+CUSD?":
            return f"\r\n+CUSD: {self.annonces}\r\n\r\nOK\r\n"
        if commande == "AT+CREG?":
            return f"\r\n+CREG: 0,{self.enregistre}\r\n\r\nOK\r\n"
        if commande == "AT+CSQ":
            return f"\r\n+CSQ: {self.signal},99\r\n\r\nOK\r\n"
        if commande == "AT+CSCS?":
            return f'\r\n+CSCS: "{self.alphabet}"\r\n\r\nOK\r\n'
        return "\r\nOK\r\n"


def modem_sur(port):
    m = ModemSerie.__new__(ModemSerie)        # sans matériel
    m.ser = port
    m.port = "/dev/ttyUSB12"
    m.verrou = threading.Lock()
    m.ucs2 = False
    m.mode_pdu = True
    m._memo = {}
    m._traine_urc = b""
    m._ferme_par_le_reseau = False
    return m


# --- LE TÉMOIN : la mise en route d'avant, recopiée telle quelle -----------
def _ancienne_initialisation(m):
    with m.verrou:
        for cmd in ("AT", "ATE0", "AT+CMEE=2", "AT+CUSD=1", "AT+CNMI=2,1,0,0,0"):
            m._envoyer(cmd)
        m.mode_pdu = "OK" in m._envoyer("AT+CMGF=0")
        if not m.mode_pdu:
            m._envoyer("AT+CMGF=1")
        m.stockage_sms = "SM"
        for emplacement in ("ME", "SM"):
            if "OK" in m._envoyer(f'AT+CPMS="{emplacement}","{emplacement}",'
                                  f'"{emplacement}"'):
                m.stockage_sms = emplacement
                break
        if "OK" not in m._envoyer('AT+CSCS="GSM"'):
            m._envoyer('AT+CSCS="UCS2"')
            m.ucs2 = True


def sans_pause():
    return mock.patch.object(totem.modem, "PAUSE_REGLAGES", 0)


# =============================================================================
class TestLesReglagesSePrennent(unittest.TestCase):

    def test_le_temoin_laisse_les_annonces_eteintes(self):
        """Sans ce témoin, le banc ne prouve rien : la mise en route d'avant
        doit laisser le modem muet sur les réponses USSD."""
        port = ModemQuiRevient(refus=1)
        _ancienne_initialisation(modem_sur(port))
        self.assertEqual(port.annonces, 0)
        self.assertEqual(port.ecrit.count("AT+CUSD=1"), 1)

    def test_un_refus_passager_est_repris(self):
        port = ModemQuiRevient(refus=1)
        m = modem_sur(port)
        with sans_pause():
            m._initialiser()
        self.assertEqual(port.annonces, 1)
        self.assertEqual(port.ecrit.count("AT+CUSD=1"), 2)
        self.assertEqual(m.reglages_refuses, [])

    def test_un_refus_qui_dure_est_retenu_et_borne(self):
        port = ModemQuiRevient(refus=99)
        m = modem_sur(port)
        with sans_pause():
            m._initialiser()
        self.assertEqual(port.ecrit.count("AT+CUSD=1"), ESSAIS_REGLAGES)
        self.assertEqual(m.reglages_refuses, ["AT+CUSD=1"])

    def test_un_modem_muet_ne_coute_qu_une_question_par_passage(self):
        """Pas de « OK » au premier « AT » : le passage s'arrête là, au lieu
        de poser huit questions à cinq secondes chacune."""
        class PortMuet(ModemQuiRevient):
            def _reponse(self, commande):
                return ""

        class Horloge:
            t = 0.0

            def time(self):
                return self.t

            def monotonic(self):
                return self.t

            def sleep(self, s):
                self.t += s

        port = PortMuet()
        m = modem_sur(port)
        with mock.patch.object(totem.modem, "time", Horloge()):
            m._initialiser()
        self.assertEqual(port.ecrit, ["AT"] * ESSAIS_REGLAGES)
        self.assertEqual(m.reglages_refuses, ["AT"])
        self.assertFalse(m.ucs2)        # muet n'est pas « en UCS2 »

    def test_tout_pris_du_premier_coup_un_seul_passage(self):
        port = ModemQuiRevient(refus=0)
        m = modem_sur(port)
        with sans_pause():
            m._initialiser()
        self.assertEqual(port.ecrit.count("AT+CUSD=1"), 1)
        self.assertEqual(m.reglages_refuses, [])
        self.assertTrue(m.mode_pdu)
        self.assertEqual(m.stockage_sms, "ME")
        self.assertFalse(m.ucs2)


# =============================================================================
class TestLeSilenceSeSonde(EnFrancais):

    def test_un_reglage_tombe_est_repose_et_dit(self):
        port = ModemQuiRevient(refus=0)
        port.annonces = 0                       # tombé : le modem a redémarré
        m = modem_sur(port)
        etat = m.etat_apres_silence()
        self.assertIs(etat["annonces"], False)
        self.assertTrue(etat["repare"])
        self.assertEqual(port.annonces, 1)      # reposé sur-le-champ
        phrase = phrase_du_silence(etat)
        self.assertIn("INACTIVES", phrase)
        self.assertIn("refaits", phrase)
        self.assertIn("ttyUSB12", phrase)

    def test_un_modem_en_ordre_ne_se_regle_pas(self):
        port = ModemQuiRevient(refus=0)
        port.annonces = 1
        m = modem_sur(port)
        etat = m.etat_apres_silence()
        self.assertNotIn("AT+CUSD=1", port.ecrit)
        self.assertFalse(etat["repare"])
        phrase = phrase_du_silence(etat)
        self.assertIn("21/31", phrase)
        self.assertIn("réseau enregistré", phrase)
        self.assertIn("annonces USSD actives", phrase)

    def test_une_carte_hors_reseau_se_nomme(self):
        port = ModemQuiRevient(refus=0, enregistre="2", signal=99)
        port.annonces = 1
        phrase = phrase_du_silence(modem_sur(port).etat_apres_silence())
        self.assertIn("HORS RÉSEAU", phrase)
        self.assertIn("signal inconnu", phrase)

    def test_un_alphabet_qui_a_derive_est_repose(self):
        """Le robot encode en GSM ; le modem, revenu, est en UCS2 : les
        codes partiraient dans le mauvais alphabet."""
        port = ModemQuiRevient(refus=0, alphabet="UCS2")
        port.annonces = 1
        m = modem_sur(port)
        etat = m.etat_apres_silence()
        self.assertIn('AT+CSCS="GSM"', port.ecrit)
        self.assertEqual(etat["refuses"], [])

    def test_la_carte_ne_leve_jamais(self):
        class ModemSansSonde:
            pass

        class ModemQuiCasse:
            def etat_apres_silence(self):
                raise OSError(5, "Input/output error")

        self.assertEqual(Compte(ModemSansSonde(), libelle="X",
                                carte=FausseCarte()).expliquer_le_silence(), "")
        phrase = Compte(ModemQuiCasse(), libelle="X",
                        carte=FausseCarte()).expliquer_le_silence()
        self.assertIn("Input/output error", phrase)


# =============================================================================
class ModemMuet:
    """Un modem scripté dont le réseau ne répond jamais — et qui sait se
    sonder, comme le vrai."""

    def __init__(self, compte):
        self.compte = compte

    def ussd_demarrer(self, code):
        self.compte.recu.append(code)
        raise ReponseNonRecue("Pas de réponse USSD du réseau (délai dépassé).")

    ussd_repondre = ussd_demarrer

    def ussd_annuler(self):
        self.compte.raccroches += 1

    def etat_apres_silence(self):
        return {"port": "/dev/ttyUSB12", "annonces": False, "enregistre": True,
                "signal": 18, "alphabet": "GSM", "repare": True, "refuses": []}


class ModemDecroche(ModemMuet):
    """Le port est mort : « Input/output error » à tout."""

    def ussd_demarrer(self, code):
        raise OSError(5, "Input/output error")

    ussd_repondre = ussd_demarrer


class TestLaCauseVaAuJournal(EnFrancais):

    def _pilotage(self, modem):
        compte = FauxCompte([])
        compte.modem = modem(compte)
        journal = FauxJournal()
        return Pilotage(FauxNuage(), [compte], journal), journal

    def test_le_silence_porte_ce_que_le_modem_en_dit(self):
        p, journal = self._pilotage(ModemMuet)
        p._traiter({"id": 1, "type": "ussd",
                    "parametres": {"code": "#148*5#", "carte": FausseCarte.iccid}})
        silences = [e for e in journal.evenements if "sans réponse du réseau" in e]
        self.assertEqual(len(silences), 1, journal.evenements)
        self.assertIn("annonces USSD INACTIVES — réglages refaits", silences[0])
        self.assertIn("18/31", silences[0])

    def test_un_port_mort_se_lit_au_journal(self):
        p, journal = self._pilotage(ModemDecroche)
        p._traiter({"id": 1, "type": "ussd",
                    "parametres": {"code": "#148*5#", "carte": FausseCarte.iccid}})
        echecs = [e for e in journal.evenements if "échec (ussd)" in e]
        self.assertEqual(len(echecs), 1, journal.evenements)
        self.assertIn("Input/output error", echecs[0])

    def test_une_autre_erreur_ne_livre_que_son_nom(self):
        """Le journal se garde longtemps et se lit à plusieurs : une erreur
        qui n'est pas du modem n'y entre que par son nom."""
        class ModemBavard(ModemMuet):
            def ussd_demarrer(self, code):
                raise ValueError("Jean Dupont 677123456")
            ussd_repondre = ussd_demarrer

        p, journal = self._pilotage(ModemBavard)
        p._traiter({"id": 1, "type": "ussd",
                    "parametres": {"code": "#148*5#", "carte": FausseCarte.iccid}})
        echecs = [e for e in journal.evenements if "échec (ussd)" in e]
        self.assertEqual(len(echecs), 1, journal.evenements)
        self.assertIn("ValueError", echecs[0])
        self.assertNotIn("677123456", echecs[0])


# =============================================================================
class ModemMuetSain(ModemMuet):
    """Le réseau ne répond jamais, et la sonde ne trouve RIEN à réparer :
    annonces actives, carte sur le réseau, bon alphabet."""

    def etat_apres_silence(self):
        return {"port": "/dev/ttyUSB12", "annonces": True, "enregistre": True,
                "signal": 18, "alphabet": "GSM", "repare": False, "refuses": []}


class TestTroisSilencesRelancentLeModem(EnFrancais):
    """Ce que le propriétaire faisait à la main — relancer — le robot le fait
    au troisième code parti sans réponse, si la sonde n'a rien trouvé."""

    def _pilotage(self, modem):
        compte = FauxCompte([])
        compte.modem = modem(compte)
        journal = FauxJournal()
        relances = []
        p = Pilotage(FauxNuage(), [compte], journal, relanceur=relances.append)
        return p, compte, journal, relances

    def _composer(self, p):
        p._traiter({"id": 1, "type": "ussd",
                    "parametres": {"code": "#148*5#", "carte": FausseCarte.iccid}})

    def test_au_troisieme_silence_sans_reparation(self):
        p, compte, journal, relances = self._pilotage(ModemMuetSain)
        for _ in range(2):
            self._composer(p)
        self.assertEqual(relances, [])
        self.assertEqual(compte.codes_sans_reseau, 2)
        self._composer(p)
        self.assertEqual(relances, [compte])
        self.assertEqual(compte.codes_sans_reseau, 0)       # on repart de zéro
        self.assertTrue(any("3 codes de suite n'ont pas atteint le réseau" in e
                            for e in journal.evenements), journal.evenements)

    def test_un_reglage_repare_ne_compte_pas_comme_silence(self):
        """La sonde a trouvé et reposé le réglage : la cause est connue, le
        modem n'a pas à être relancé pour cela."""
        p, compte, journal, relances = self._pilotage(ModemMuet)   # repare=True
        for _ in range(5):
            self._composer(p)
        self.assertEqual(relances, [])
        self.assertEqual(compte.codes_sans_reseau, 0)

    def test_une_reponse_recue_remet_le_compte_a_zero(self):
        p, compte, journal, relances = self._pilotage(ModemMuetSain)
        self._composer(p)
        self._composer(p)
        # Le réseau répond une fois : le modem scripté d'origine.
        from tests.test_pilotage import ModemScripte
        compte.reponses = [("fermee", "Votre solde est de 1000 FCFA")]
        compte.modem = ModemScripte(compte)
        self._composer(p)
        self.assertEqual(compte.codes_sans_reseau, 0)
        compte.modem = ModemMuetSain(compte)
        self._composer(p)
        self._composer(p)
        self.assertEqual(relances, [])            # deux, pas trois

    def test_sans_relanceur_on_le_dit_seulement(self):
        compte = FauxCompte([])
        compte.modem = ModemMuetSain(compte)
        journal = FauxJournal()
        p = Pilotage(FauxNuage(), [compte], journal)
        for _ in range(3):
            self._composer(p)
        self.assertTrue(any("le modem est relancé" in e for e in journal.evenements))


# =============================================================================
class ModemQuiRefuse(ModemMuetSain):
    """Le modem refuse le code avant de l'envoyer : « +CME ERROR: no network
    service », vu sur la plateforme le 22 octobre."""

    def ussd_demarrer(self, code):
        self.compte.recu.append(code)
        raise RefusDuModem("+CME ERROR: no network service")

    ussd_repondre = ussd_demarrer


class TestLeRefusDuModemSeDitEtSeCompte(EnFrancais):

    def test_le_proprietaire_lit_des_mots_et_le_journal_la_cause(self):
        compte = FauxCompte([])
        compte.modem = ModemQuiRefuse(compte)
        journal = FauxJournal()
        nuage = FauxNuage()
        p = Pilotage(nuage, [compte], journal)
        p._traiter({"id": 1, "type": "ussd",
                    "parametres": {"code": "#148*5#", "carte": FausseCarte.iccid,
                                   "langue": "fr"}})
        champs = dict(nuage.maj[-1][1])
        self.assertEqual(champs["etat"], "echouee")
        self.assertIn("la carte n'a pas de réseau en ce moment", champs["resultat"])
        self.assertIn("no network service", champs["resultat"])
        self.assertNotIn("The modem refused", champs["resultat"])
        refus = [e for e in journal.evenements if "le modem a refusé le code" in e]
        self.assertEqual(len(refus), 1, journal.evenements)
        self.assertIn("no network service", refus[0])
        self.assertIn("18/31", refus[0])              # la sonde est passée
        self.assertEqual(compte.codes_sans_reseau, 1)

    def test_trois_refus_relancent_le_modem(self):
        compte = FauxCompte([])
        compte.modem = ModemQuiRefuse(compte)
        relances = []
        p = Pilotage(FauxNuage(), [compte], FauxJournal(), relanceur=relances.append)
        for _ in range(3):
            p._traiter({"id": 1, "type": "ussd",
                        "parametres": {"code": "#148*5#", "carte": FausseCarte.iccid}})
        self.assertEqual(relances, [compte])

    def test_la_phrase_dans_la_langue_de_la_demande(self):
        refus = RefusDuModem("+CME ERROR: unknown network message")
        self.assertIn("ne comprend pas", refus.phrase("fr"))
        self.assertIn("does not understand", refus.phrase("en"))
        self.assertIn("occupé", RefusDuModem("+CME ERROR: retry operation").phrase("fr"))
        self.assertIn("a refusé le code", RefusDuModem("ERROR").phrase("fr"))


# =============================================================================
class TestUnRefusSeRetente(unittest.TestCase):
    """En itinérance, la carte change de réseau plusieurs fois par jour : un
    code tapé pendant ces secondes-là est refusé « no network service ». Il
    se retente, sans que rien ne soit parti."""

    def _carte(self, refus_avant_succes):
        compte = FauxCompte([("fermee", "Votre solde est de 1000 FCFA")])
        base = compte.modem

        class ModemHesitant:
            def __init__(self):
                self.refus_restants = refus_avant_succes
                self.essais = 0

            def ussd_demarrer(self, code):
                self.essais += 1
                if self.refus_restants > 0:
                    self.refus_restants -= 1
                    raise RefusDuModem("+CME ERROR: no network service")
                return base.ussd_demarrer(code)

            def ussd_annuler(self):
                base.ussd_annuler()

        compte.modem = ModemHesitant()
        return compte

    def test_deux_refus_puis_la_reponse(self):
        compte = self._carte(refus_avant_succes=2)
        with mock.patch.object(totem.compte.time, "sleep") as pause:
            reponse = compte.ussd_demarrer("#148*5#")
        self.assertIn("1000 FCFA", reponse)
        self.assertEqual(compte.modem.essais, 3)
        self.assertEqual(pause.call_count, 2)
        self.assertEqual(compte.codes_sans_reseau, 0)

    def test_trois_refus_et_le_dernier_remonte_une_fois(self):
        compte = self._carte(refus_avant_succes=99)
        with mock.patch.object(totem.compte.time, "sleep"):
            with self.assertRaises(RefusDuModem):
                compte.ussd_demarrer("#148*5#")
        self.assertEqual(compte.modem.essais, 3)
        self.assertEqual(compte.codes_sans_reseau, 1)   # un code, pas trois
        self.assertEqual(compte.raccroches, 1)


# =============================================================================
class TestLaCarteHorsReseau(EnFrancais):
    """« Signal inconnu » des heures durant, et le propriétaire qui relance
    tout : le robot passe la carte en mode avion et retour au bout de trois
    minutes, puis relance le modem, et annonce le retour."""

    def _robot(self):
        from totem.app import HORS_RESEAU_AVANT_RECHERCHE, Robot
        from totem.simulator import ModemSimule
        from totem.storage import Journal
        from tests.test_panne_modem import TransportEspion

        class ModemEnItinerance(ModemSimule):
            def __init__(self):
                super().__init__("Orange")
                self.sur_le_reseau = True
                self.recherches = 0
                self.relances = 0

            def enregistre(self):
                return self.sur_le_reseau

            def rechercher_le_reseau(self):
                self.recherches += 1

            def redemarrer(self):
                self.relances += 1

        modem = ModemEnItinerance()
        compte = Compte(modem, "Orange ·4177")
        robot = Robot([compte], TransportEspion(), Journal(":memory:"))
        return robot, compte, modem, HORS_RESEAU_AVANT_RECHERCHE

    def test_sur_le_reseau_rien_ne_se_passe(self):
        robot, compte, modem, _ = self._robot()
        robot._veiller_le_reseau(compte, maintenant=1000.0)
        self.assertEqual(modem.recherches, 0)
        self.assertEqual(robot.transport.messages, [])

    def test_trois_minutes_hors_reseau_mode_avion_puis_relance_puis_retour(self):
        robot, compte, modem, delai = self._robot()
        modem.sur_le_reseau = False
        t0 = 1000.0
        robot._veiller_le_reseau(compte, maintenant=t0)          # noté
        robot._veiller_le_reseau(compte, maintenant=t0 + 60)     # trop tôt
        self.assertEqual(modem.recherches, 0)
        robot._veiller_le_reseau(compte, maintenant=t0 + delai)  # recherche
        self.assertEqual(modem.recherches, 1)
        self.assertEqual(modem.relances, 0)
        self.assertTrue(any("recherche de réseau" in m
                            for m in robot.transport.messages))
        robot._veiller_le_reseau(compte, maintenant=t0 + delai + 60)  # trop tôt
        self.assertEqual(modem.relances, 0)
        robot._veiller_le_reseau(compte, maintenant=t0 + 2 * delai)   # relance
        self.assertEqual(modem.relances, 1)
        modem.sur_le_reseau = True
        avant = len(robot.transport.messages)
        robot._veiller_le_reseau(compte, maintenant=t0 + 2 * delai + 60)
        self.assertTrue(any("de retour sur le réseau" in m
                            for m in robot.transport.messages[avant:]))
        self.assertIsNone(compte.hors_reseau_depuis)
        self.assertEqual(compte.recherches, 0)

    def test_une_absence_courte_ne_dit_rien(self):
        robot, compte, modem, delai = self._robot()
        modem.sur_le_reseau = False
        robot._veiller_le_reseau(compte, maintenant=1000.0)
        modem.sur_le_reseau = True
        robot._veiller_le_reseau(compte, maintenant=1060.0)
        self.assertEqual(robot.transport.messages, [])
        self.assertEqual(modem.recherches, 0)

    def test_un_modem_qui_ne_sait_pas_dire_ne_compte_pas(self):
        robot, compte, modem, delai = self._robot()
        modem.enregistre = lambda: None
        robot._veiller_le_reseau(compte, maintenant=1000.0)
        robot._veiller_le_reseau(compte, maintenant=1000.0 + 2 * delai)
        self.assertEqual(modem.recherches, 0)
        self.assertIsNone(compte.hors_reseau_depuis)


# =============================================================================
class TestLeRetourSurLePortAT(unittest.TestCase):
    """Le noyau redonne à un modem revenu les plus petits numéros libres, pas
    un bloc qui se suit : le 22 octobre, le port AT du même modem valait 12,
    puis 13, puis 12, et son port de données 13, puis 14, puis 14. Reprendre
    « l'ancien port d'abord » se branchait sur le port de DONNÉES."""

    def _bus(self, plan):
        """`plan` : chemin → IMEI des ports qui répondent aux commandes AT."""
        import totem.modem

        class Port:
            def __init__(self, chemin, baud=115200, timeout=1, exclusive=None):
                if chemin not in plan:
                    raise OSError(2, "No such file or directory")
                self.chemin = chemin
                self.tampon = b""

            def reset_input_buffer(self):
                self.tampon = b""

            def write(self, octets):
                commande = octets.decode().strip()
                imei = plan[self.chemin]
                self.tampon += (f"\r\n{imei}\r\n\r\nOK\r\n" if commande == "AT+CGSN"
                                else "\r\nOK\r\n").encode()

            def read_all(self):
                d, self.tampon = self.tampon, b""
                return d

            def close(self):
                pass

        module = types.ModuleType("serial")
        module.Serial = Port
        return (mock.patch.dict(sys.modules, {"serial": module}),
                mock.patch.object(totem.modem.glob, "glob",
                                  lambda motif: sorted(plan)))

    def _rouvrir(self, modem, plan, interfaces=None):
        import totem.detect
        p1, p2 = self._bus(plan)
        p3 = mock.patch.object(totem.detect, "interface_usb",
                               lambda port: (interfaces or {}).get(port))
        with p1, p2, p3:
            modem._rouvrir(patience=5)

    def test_l_ancien_numero_devenu_port_de_donnees_n_est_pas_repris(self):
        IMEI = "861234050000011"
        modem = ModemSerie.__new__(ModemSerie)
        modem.port, modem.baud, modem.imei = "/dev/ttyUSB13", 115200, IMEI
        modem.ser = type("X", (), {"close": lambda self: None})()
        # Au retour : 12 = port AT, 13 = port de données, du MÊME modem —
        # et 13 est justement l'ancien nom du port AT.
        self._rouvrir(modem, {"/dev/ttyUSB12": IMEI, "/dev/ttyUSB13": IMEI},
                      interfaces={"/dev/ttyUSB12": 2, "/dev/ttyUSB13": 3})
        self.assertEqual(modem.port, "/dev/ttyUSB12")

    def test_l_ancien_nom_encore_port_at_est_repris_sans_detour(self):
        IMEI = "861234050000011"
        modem = ModemSerie.__new__(ModemSerie)
        modem.port, modem.baud, modem.imei = "/dev/ttyUSB13", 115200, IMEI
        modem.ser = type("X", (), {"close": lambda self: None})()
        self._rouvrir(modem, {"/dev/ttyUSB12": "861234050000029",
                              "/dev/ttyUSB13": IMEI},
                      interfaces={"/dev/ttyUSB12": 2, "/dev/ttyUSB13": 2})
        self.assertEqual(modem.port, "/dev/ttyUSB13")

    def test_le_temoin_reprenait_l_ancien_numero(self):
        """La règle d'avant — l'ancien port d'abord — se branche sur le port
        de données. Sans ce témoin, le banc ne prouve rien."""
        IMEI = "861234050000011"
        modem = ModemSerie.__new__(ModemSerie)
        modem.port, modem.baud, modem.imei = "/dev/ttyUSB13", 115200, IMEI
        modem.ser = type("X", (), {"close": lambda self: None})()
        ancienne = lambda: ["/dev/ttyUSB13", "/dev/ttyUSB12", "/dev/ttyUSB14"]
        modem._chemins_possibles = ancienne
        self._rouvrir(modem, {"/dev/ttyUSB12": IMEI, "/dev/ttyUSB13": IMEI,
                              "/dev/ttyUSB14": IMEI})
        self.assertEqual(modem.port, "/dev/ttyUSB13")

    def test_le_port_d_un_autre_modem_est_ecarte(self):
        IMEI, AUTRE = "861234050000011", "861234050000029"
        modem = ModemSerie.__new__(ModemSerie)
        modem.port, modem.baud, modem.imei = "/dev/ttyUSB12", 115200, IMEI
        modem.ser = type("X", (), {"close": lambda self: None})()
        self._rouvrir(modem, {"/dev/ttyUSB2": AUTRE, "/dev/ttyUSB12": AUTRE,
                              "/dev/ttyUSB17": IMEI})
        self.assertEqual(modem.port, "/dev/ttyUSB17")


if __name__ == "__main__":
    unittest.main()
