# -*- coding: utf-8 -*-
"""Quatre modems qui reviennent ensemble : chaque compte retrouve LE SIEN.

LA NUIT DU 16 AU 17 OCTOBRE. Les quatre modems du boîtier se sont dits muets
à la même minute. Le robot les a relancés ; au retour, trois des quatre
comptes ont annoncé « carte retirée : MTN ·6299 — insérée : MTN ·3501 »
(puis ·6414, puis Orange ·4177). Personne n'avait touché aux puces : les trois
comptes avaient rouvert un port du MÊME modem, celui de la MTN ·3501, et les
trois autres modems sont restés sans personne pour relever leurs SMS.

Deux fautes, l'une dans l'autre :

  - pour retrouver son modem, un compte reprenait le premier port qui
    s'ouvrait. Or un port qui s'ouvre ne dit rien de QUI est derrière : au
    retour sur le bus, le noyau redistribue les numéros dans l'ordre où les
    modems reviennent, et le premier revenu prend les petits ;
  - pour chercher, il interrogeait TOUTES les prises — y compris celles où
    les autres comptes attendaient une réponse. Sous Linux, deux ouvertures
    du même port réussissent sans un mot, et vider son tampon vide celui du
    voisin : le voisin perdait sa réponse, se croyait muet, se relançait à
    son tour. Une relance en appelait trois.

Ce banc imite un HAT de quatre SIM7600 : cinq prises par modem (diagnostic,
GPS, AT, AT/PPP, audio), dont seules la troisième et la quatrième répondent ;
une file d'entrée PARTAGÉE par toutes les ouvertures d'une même prise, comme
un vrai terminal ; une renumérotation au retour, dans l'ordre d'arrivée ; et
une horloge factice — on simule une minute sans l'attendre.

Le TÉMOIN est la reprise d'avant, recopiée telle quelle (un témoin qui suit
le code du jour ne témoigne de rien). Il doit refaire la nuit : trois comptes
sur le même modem, et la réponse d'un voisin volée. S'il ne la refait pas,
le banc ne prouve rien et le test le dit.
"""

import re
import sys
import types
import unittest
from unittest import mock

import totem.detect
import totem.modem
from totem.modem import ErreurModem, ModemSerie

# Quatre modems, quatre IMEI inventés — l'ordre est celui du branchement.
A, B, C, D = ("861234050000011", "861234050000029",
              "861234050000037", "861234050000045")


class Horloge:
    """Le temps du banc : `sleep` avance l'horloge au lieu d'attendre."""

    def __init__(self):
        self.t = 1_000_000.0

    def time(self):
        return self.t

    def monotonic(self):
        return self.t

    def sleep(self, secondes):
        self.t += secondes


def brancher(ordre):
    """Les prises du bus quand les modems sont revenus dans cet ordre-là :
    chemin → (imei, répond aux commandes AT)."""
    plan = {}
    for rang, imei in enumerate(ordre):
        for j in range(5):
            plan[f"/dev/ttyUSB{5 * rang + j}"] = (imei, j in (2, 3))
    return plan


class Bus:
    def __init__(self, horloge, calendrier):
        self.horloge = horloge
        self.calendrier = calendrier     # [(à partir de l'instant, plan)]
        self.files = {}                  # chemin → octets en attente
        self.verrous = {}                # chemin → (génération, ouverture)
        self.ecrits = []                 # (chemin, qui, commande)
        self.qui = "?"

    def generation(self):
        g = 0
        for i, (instant, _) in enumerate(self.calendrier):
            if self.horloge.t >= instant:
                g = i
        return g

    def plan(self):
        return self.calendrier[self.generation()][1]

    def serial(self):
        bus = self
        module = types.ModuleType("serial")

        class Serial:
            def __init__(self, chemin, baud=115200, timeout=1, exclusive=None):
                if chemin not in bus.plan():
                    raise OSError(2, f"could not open port {chemin}: "
                                     "No such file or directory")
                gen = bus.generation()
                tenu = bus.verrous.get(chemin)
                # Un verrou pris avant la renumérotation tenait l'ANCIEN
                # appareil : il ne gêne pas le nouveau, même s'il en a le nom.
                if exclusive and tenu and tenu[0] == gen:
                    raise OSError(11, "Could not exclusively lock port")
                if exclusive:
                    bus.verrous[chemin] = (gen, self)
                self.chemin = chemin

            def write(self, octets):
                bus.ecrits.append((self.chemin, bus.qui, octets))
                imei, parle = bus.plan().get(self.chemin, (None, False))
                if not parle:
                    return len(octets)
                commande = octets.decode().strip()
                reponse = (f"\r\n{imei}\r\n\r\nOK\r\n" if commande == "AT+CGSN"
                           else "\r\nOK\r\n")
                bus.files[self.chemin] = (bus.files.get(self.chemin, b"")
                                          + reponse.encode())
                return len(octets)

            def read_all(self):
                octets = bus.files.get(self.chemin, b"")
                bus.files[self.chemin] = b""
                return octets

            def reset_input_buffer(self):
                bus.files[self.chemin] = b""     # la file est celle de tous

            def close(self):
                tenu = bus.verrous.get(self.chemin)
                if tenu and tenu[1] is self:
                    del bus.verrous[self.chemin]

        module.Serial = Serial
        return module

    def glob(self):
        module = types.SimpleNamespace()
        module.glob = lambda motif: sorted(self.plan())
        return module


# --- LE TÉMOIN : la reprise d'avant, recopiée telle quelle ---------------
def _ancien_dialogue(horloge, ser, commande, delai=1.2):
    try:
        ser.reset_input_buffer()
        ser.write((commande + "\r").encode())
    except Exception:
        return ""
    fin = horloge.time() + delai
    tampon = b""
    while horloge.time() < fin:
        try:
            tampon += ser.read_all()
        except Exception:
            break
        texte = tampon.decode(errors="replace")
        if "OK" in texte or "ERROR" in texte:
            return texte
        horloge.sleep(0.05)
    return tampon.decode(errors="replace")


def _ancienne_detection(serial, horloge, chemins):
    """`detecter_modems` d'avant : chaque port, ouvert sans exclusivité,
    interrogé de bout en bout ; le premier port AT de chaque IMEI."""
    par_imei = {}
    for port in chemins:
        try:
            ser = serial.Serial(port, 115200, timeout=0.5)
        except Exception:
            continue
        try:
            if "OK" not in _ancien_dialogue(horloge, ser, "AT", delai=1.0):
                continue
            _ancien_dialogue(horloge, ser, "ATE0", delai=0.5)
            imei = re.search(r"\b(\d{15})\b",
                             _ancien_dialogue(horloge, ser, "AT+CGSN"))
            if not imei:
                continue
            for commande in ("AT+CPIN?", "AT+CIMI", "AT+CNUM", "AT+COPS?",
                             "AT+CREG?", "AT+CICCID"):
                _ancien_dialogue(horloge, ser, commande, delai=2.0)
            par_imei.setdefault(imei.group(1), port)
        finally:
            ser.close()
    return list(par_imei.values())


def _ancienne_reprise(modem, bus, horloge, patience=45):
    """`_rouvrir` et `_chemins_possibles` d'avant."""
    serial = bus.serial()
    try:
        modem.ser.close()
    except Exception:
        pass
    fin = horloge.time() + patience
    while horloge.time() < fin:
        horloge.sleep(2)
        chemins = [modem.port] + _ancienne_detection(
            serial, horloge, sorted(bus.plan(), key=totem.detect._numero_port))
        vus = set()
        for chemin in [c for c in chemins if c and not (c in vus or vus.add(c))]:
            try:
                modem.ser = serial.Serial(chemin, modem.baud, timeout=1)
                modem.port = chemin
                return
            except Exception:
                pass
    raise ErreurModem("pas revenu")


# --- le banc ----------------------------------------------------------------
class Banc:
    def __init__(self, calendrier):
        self.horloge = Horloge()
        self.bus = Bus(self.horloge, [(self.horloge.t + d, p)
                                      for d, p in calendrier])
        self.serial = self.bus.serial()

    def __enter__(self):
        self.pieges = [
            mock.patch.dict(sys.modules, {"serial": self.serial}),
            mock.patch.object(totem.detect, "time", self.horloge),
            mock.patch.object(totem.modem, "time", self.horloge),
            mock.patch.object(totem.modem, "glob", self.bus.glob()),
        ]
        for p in self.pieges:
            p.start()
        return self

    def __exit__(self, *exc):
        for p in reversed(self.pieges):
            p.stop()

    def compte(self, port, imei, exclusif=True):
        """Un compte en service : son modem ouvert sur son port AT."""
        modem = ModemSerie.__new__(ModemSerie)       # sans matériel
        modem.port = port
        modem.baud = 115200
        modem.imei = imei
        modem.ser = self.serial.Serial(port, 115200, timeout=1,
                                       exclusive=exclusif or None)
        return modem

    def a_qui(self, port):
        return self.bus.plan().get(port, (None, False))[0]


# Avant la nuit : A, B, C, D branchés dans l'ordre, ports AT 2, 7, 12, 17.
AVANT = brancher([A, B, C, D])
# La nuit : tout décroche ; A revient seul (il prend les petits numéros),
# les trois autres une demi-minute après, dans le désordre.
LA_NUIT = [(0, AVANT), (1, {}), (4, brancher([A])), (30, brancher([A, D, B, C]))]


class LaNuitDu16Octobre(unittest.TestCase):

    def _quatre_comptes(self, banc, exclusif=True):
        return {imei: banc.compte(port, imei, exclusif=exclusif)
                for imei, port in ((A, "/dev/ttyUSB2"), (B, "/dev/ttyUSB7"),
                                   (C, "/dev/ttyUSB12"), (D, "/dev/ttyUSB17"))}

    def test_le_temoin_refait_la_nuit(self):
        """La reprise d'avant met trois comptes sur le modem revenu le
        premier — exactement ce que Telegram a annoncé."""
        with Banc(LA_NUIT) as banc:
            comptes = self._quatre_comptes(banc, exclusif=False)
            banc.horloge.sleep(1)                      # le bus décroche
            for imei in (B, C, D, A):
                banc.bus.qui = imei
                _ancienne_reprise(comptes[imei], banc.bus, banc.horloge)
            sur_a = [imei for imei, m in comptes.items()
                     if banc.a_qui(m.port) == A]
        self.assertEqual(len(sur_a), 4,
                         "le banc ne refait pas la nuit : il ne prouve rien")

    def test_chaque_compte_retrouve_son_modem(self):
        with Banc(LA_NUIT) as banc:
            comptes = self._quatre_comptes(banc)
            banc.horloge.sleep(1)
            for imei in (B, C, D, A):
                banc.bus.qui = imei
                comptes[imei]._rouvrir()
            for imei, modem in comptes.items():
                with self.subTest(modem=imei[-2:]):
                    self.assertEqual(banc.a_qui(modem.port), imei)
            # Et chacun sur le PREMIER port AT de son modem, comme à la
            # détection : c'est là qu'arrivent les annonces de SMS.
            plan = banc.bus.plan()
            for imei, modem in comptes.items():
                premier = min((p for p, (i, parle) in plan.items()
                               if i == imei and parle),
                              key=totem.detect._numero_port)
                self.assertEqual(modem.port, premier)

    def test_un_modem_revenu_sous_le_meme_nom_est_repris_aussitot(self):
        """Le cas courant ne coûte rien : l'ancien port d'abord, et l'IMEI
        y est le bon."""
        with Banc([(0, AVANT)]) as banc:
            modem = banc.compte("/dev/ttyUSB7", B)
            debut = banc.horloge.t
            modem._rouvrir()
            self.assertEqual(modem.port, "/dev/ttyUSB7")
            self.assertLess(banc.horloge.t - debut, 5)

    def test_un_modem_qui_ne_revient_pas_ne_prend_pas_celui_d_un_autre(self):
        """Plutôt l'aveu « pas revenu » qu'un compte branché sur la puce
        d'un autre : l'un se voit et se répare, l'autre ment en silence."""
        with Banc([(0, AVANT), (1, brancher([A, C, D]))]) as banc:
            modem = banc.compte("/dev/ttyUSB7", B)
            banc.horloge.sleep(1)
            with self.assertRaises(ErreurModem):
                modem._rouvrir()


class UneRelanceNeDerangePersonne(unittest.TestCase):
    """Le compte A se relance ; B attend la réponse à sa question."""

    REPONSE_DE_B = b"\r\n+CSQ: 21,99\r\n\r\nOK\r\n"

    def _avec_b_qui_attend(self, banc, exclusif):
        b = banc.compte("/dev/ttyUSB7", B, exclusif=exclusif)
        a = banc.compte("/dev/ttyUSB2", A, exclusif=exclusif)
        banc.bus.files["/dev/ttyUSB7"] = self.REPONSE_DE_B
        banc.bus.qui = A
        return a, b

    def _ecrits_par_a_chez_les_autres(self, banc):
        return [c for c, qui, _ in banc.bus.ecrits
                if qui == A and banc.a_qui(c) not in (A, None)]

    def test_le_temoin_vole_la_reponse_du_voisin(self):
        with Banc([(0, AVANT)]) as banc:
            a, _ = self._avec_b_qui_attend(banc, exclusif=False)
            _ancienne_reprise(a, banc.bus, banc.horloge)
            self.assertTrue(self._ecrits_par_a_chez_les_autres(banc),
                            "le banc ne refait pas la cascade")
            self.assertNotEqual(banc.bus.files.get("/dev/ttyUSB7"),
                                self.REPONSE_DE_B)

    def test_la_reponse_du_voisin_reste_a_lui(self):
        with Banc([(0, AVANT)]) as banc:
            a, _ = self._avec_b_qui_attend(banc, exclusif=True)
            a._rouvrir()
            self.assertEqual(self._ecrits_par_a_chez_les_autres(banc), [])
            self.assertEqual(banc.bus.files.get("/dev/ttyUSB7"),
                             self.REPONSE_DE_B)

    def test_meme_en_cherchant_loin_il_ne_touche_pas_aux_prises_tenues(self):
        """A revient sous un autre nom : il parcourt tout le bus, et passe
        devant les prises de B, C et D sans y écrire un octet."""
        decale = brancher([B, C, D, A])
        with Banc([(0, AVANT), (1, decale)]) as banc:
            a = banc.compte("/dev/ttyUSB2", A)
            banc.horloge.sleep(1)
            # B, C et D sont déjà revenus et tiennent leurs nouveaux ports.
            for imei, port in ((B, "/dev/ttyUSB2"), (C, "/dev/ttyUSB7"),
                               (D, "/dev/ttyUSB12")):
                banc.compte(port, imei)
            banc.bus.files["/dev/ttyUSB2"] = self.REPONSE_DE_B
            banc.bus.qui = A
            a._rouvrir()
            self.assertEqual(banc.a_qui(a.port), A)
            tenus = {"/dev/ttyUSB2", "/dev/ttyUSB7", "/dev/ttyUSB12"}
            self.assertEqual([c for c, qui, _ in banc.bus.ecrits
                              if qui == A and c in tenus], [])
            self.assertEqual(banc.bus.files["/dev/ttyUSB2"], self.REPONSE_DE_B)


class LaDetectionNeDerangePasLeRobot(unittest.TestCase):
    def test_un_port_tenu_n_est_pas_interroge(self):
        """`--modems` lancé pendant que le robot tourne : les ports tenus se
        refusent, au lieu de recevoir neuf questions en plein travail."""
        with Banc([(0, AVANT)]) as banc:
            banc.compte("/dev/ttyUSB7", B)
            banc.bus.qui = "detection"
            with mock.patch.object(totem.detect, "glob", banc.bus.glob()):
                trouves = totem.detect.detecter_modems()
            # B se voit par son SECOND port AT, libre ; celui que le robot
            # tient n'est ni proposé, ni interrogé.
            self.assertNotIn("/dev/ttyUSB7", {m.port for m in trouves})
            self.assertEqual([c for c, qui, _ in banc.bus.ecrits
                              if qui == "detection" and c == "/dev/ttyUSB7"],
                             [])


if __name__ == "__main__":
    unittest.main()
