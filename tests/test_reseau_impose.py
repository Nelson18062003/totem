# -*- coding: utf-8 -*-
"""LE RÉSEAU IMPOSÉ À UNE CARTE — [reseaux] dans totem.conf.

Le 23 octobre, MTN ·6414 était la seule carte sur SFR : quinze pertes de
réseau en une matinée, des codes refusés par le réseau, pendant que ses deux
sœurs, sur Orange F, travaillaient. Un téléphone offre « Choisir le réseau
manuellement » ; le robot le fait maintenant pour une carte nommée dans la
configuration, et le REND si le réseau imposé manque : une carte muette pour
de bon serait pire que la carte qui se cherche.

Ici : la configuration accepte un nom ou un code et refuse l'inconnu ; le
modem reçoit les bonnes commandes ; le robot impose une fois, repose après
une relance du modem, rend le choix après cinq minutes sans service puis
réessaie une heure plus tard ; sans réglage, il ne touche à RIEN — sauf pour
rendre son choix à un modem qu'un réglage d'avant a laissé en manuel. Et
jamais pendant un menu.

Lancer :  python3 -m unittest tests.test_reseau_impose
"""

import configparser
import threading
import unittest

from totem import service as S
from totem.app import RESEAU_NOUVEL_ESSAI, RESEAU_RETOUR_AUTO, Robot
from totem.compte import Compte
from totem.config import ErreurConfig, _reseaux
from totem.modem import ModemSerie
from totem.reseaux import code_du_reseau, nom_du_reseau
from totem.textes import definir_langue, langue_active


class EnFrancais(unittest.TestCase):
    def setUp(self):
        self._langue = langue_active()
        definir_langue("fr")

    def tearDown(self):
        definir_langue(self._langue)


# =============================================================================
# 1. La configuration
# =============================================================================
def _cfg(texte):
    cfg = configparser.ConfigParser()
    cfg.read_string(texte)
    return cfg


class TestLaConfiguration(unittest.TestCase):
    def test_un_nom_ou_un_code(self):
        cfg = _cfg("[reseaux]\n6414 = Orange F\nmtn = 20810\n")
        self.assertEqual(_reseaux(cfg), {"6414": "20801", "mtn": "20810"})

    def test_sans_section_rien(self):
        self.assertEqual(_reseaux(_cfg("[totem]\nnom = x\n")), {})

    def test_une_valeur_vide_est_ignoree(self):
        self.assertEqual(_reseaux(_cfg("[reseaux]\n6414 =\n")), {})

    def test_un_reseau_inconnu_refuse_le_fichier(self):
        with self.assertRaises(ErreurConfig) as cm:
            _reseaux(_cfg("[reseaux]\n6414 = Orangé\n"))
        self.assertIn("Orange F", str(cm.exception))
        self.assertIn("20801", str(cm.exception))

    def test_le_fichier_d_exemple_se_charge_toujours(self):
        cfg = configparser.ConfigParser()
        cfg.read("config.example.conf", encoding="utf-8")
        self.assertTrue(cfg.has_section("reseaux"))
        self.assertEqual(_reseaux(cfg), {})     # la ligne d'exemple est en commentaire

    def test_les_noms(self):
        self.assertEqual(code_du_reseau(" orange  f "), "20801")
        self.assertEqual(code_du_reseau("SFR"), "20810")
        self.assertEqual(code_du_reseau("20820"), "20820")
        self.assertIsNone(code_du_reseau("Vodafone"))
        self.assertEqual(nom_du_reseau("20801"), "Orange F (20801)")
        self.assertEqual(nom_du_reseau("99999"), "99999")


# =============================================================================
# 2. Le modem
# =============================================================================
class Port:
    def __init__(self, mode=0, reseau="20810"):
        self.mode, self.reseau = mode, reseau
        self.format = 0
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
        c = octets.decode().strip()
        self.ecrit.append(c)
        self.tampon += self._reponse(c).encode()

    def _reponse(self, c):
        if c.startswith("AT+COPS=3,"):
            self.format = int(c.split(",")[1])
            return "\r\nOK\r\n"
        if c.startswith("AT+COPS=1,2,"):
            self.mode, self.reseau = 1, c.split('"')[1]
            return "\r\nOK\r\n"
        if c == "AT+COPS=0":
            self.mode = 0
            return "\r\nOK\r\n"
        if c == "AT+COPS?":
            nom = self.reseau if self.format == 2 else {"20810": "SFR", "20801": "Orange F"}.get(self.reseau, self.reseau)
            return f'\r\n+COPS: {self.mode},{self.format},"{nom}",7\r\n\r\nOK\r\n'
        return "\r\nOK\r\n"


def modem_sur(port):
    m = ModemSerie.__new__(ModemSerie)
    m.ser = port
    m.port = "/dev/ttyUSB17"
    m.verrou = threading.Lock()
    m.ucs2 = False
    m.mode_pdu = True
    m._memo = {}
    m._traine_urc = b""
    m._ferme_par_le_reseau = False
    return m


class TestLeModem(unittest.TestCase):
    def test_lire_le_choix_en_codes_puis_rendre_les_noms(self):
        port = Port(mode=1, reseau="20801")
        self.assertEqual(modem_sur(port).reseau_choisi(), (1, "20801"))
        self.assertEqual(port.ecrit, ["AT+COPS=3,2", "AT+COPS?", "AT+COPS=3,0"])
        self.assertEqual(port.format, 0)        # l'écran lira « Orange F »

    def test_imposer(self):
        port = Port()
        m = modem_sur(port)
        m._memo["operateur"] = ("SFR", 1e12)
        self.assertTrue(m.imposer_reseau("20801"))
        self.assertEqual(port.ecrit, ['AT+COPS=1,2,"20801"', "AT+COPS=3,0"])
        self.assertEqual((port.mode, port.reseau), (1, "20801"))
        self.assertNotIn("operateur", m._memo)   # à relire
        self.assertEqual(m.operateur(), "Orange F")

    def test_rendre(self):
        port = Port(mode=1, reseau="20801")
        self.assertTrue(modem_sur(port).reseau_automatique())
        self.assertEqual(port.ecrit, ["AT+COPS=0"])
        self.assertEqual(port.mode, 0)

    def test_un_refus_se_dit_faux(self):
        class Refuse(Port):
            def _reponse(self, c):
                return "\r\nERROR\r\n" if c.startswith("AT+COPS=1") else super()._reponse(c)
        self.assertFalse(modem_sur(Refuse()).imposer_reseau("20801"))


# =============================================================================
# 3. Le robot
# =============================================================================
class ModemDeRoaming:
    """Un modem qui sait dire son inscription et choisir son réseau — et qui
    compte ce qu'on lui demande."""

    def __init__(self, creg=1, mode=0):
        self.creg = creg
        self.mode = mode
        self.reseau = "20810"
        self.imposes, self.rendus, self.lectures = [], 0, 0
        self.port = "/dev/ttyUSB17"
        self.redemarrages = 0

    def inscription(self):
        return (True, self.creg, None)

    def reseau_choisi(self):
        self.lectures += 1
        return (self.mode, self.reseau)

    def imposer_reseau(self, code):
        self.imposes.append(code)
        self.mode, self.reseau = 1, code
        return True

    def reseau_automatique(self):
        self.rendus += 1
        self.mode = 0
        return True

    def operateur(self):
        return {"20801": "Orange F", "20810": "SFR"}[self.reseau]

    def redemarrer(self):
        self.redemarrages += 1


class CarteDe:
    def __init__(self, iccid, operateur="MTN"):
        self.iccid = iccid
        self.operateur = operateur
        self.identifiee = True
        self.itinerance = True
        self.reseau = "SFR"


class Journal:
    def __init__(self):
        self.notes = []

    def evenement(self, texte):
        self.notes.append(texte)


class Nuage:
    def signe_de_vie_tot(self):
        pass


class Facteur:
    def __init__(self):
        self.lettres = []

    def poster(self, texte, canal=None):
        self.lettres.append((canal, texte))


def robot(reseaux, modem, iccid="8923798206414"):
    r = Robot.__new__(Robot)
    c = Compte(modem, libelle=f"MTN ·{iccid[-4:]}", carte=CarteDe(iccid))
    r.comptes = [c]
    r.reseaux = dict(reseaux)
    r.journal = Journal()
    r.facteur = Facteur()
    r.nuage = Nuage()
    r._demarre_mono = -1e6
    r._une_relance = threading.Lock()
    r._derniere_relance = -1e6
    r._groupes_dits = set()
    return r, c


def passer(r, c, de, a, pas=15):
    """Les passages du poste entre deux instants : la veille, puis le réseau."""
    t = de
    while t <= a:
        r._veiller_service(c, maintenant=t)
        r._imposer_le_reseau(c, maintenant=t)
        t += pas
    return t


class TestLeRobotImpose(EnFrancais):
    def test_impose_une_fois_et_le_dit(self):
        r, c = robot({"6414": "20801"}, ModemDeRoaming())
        passer(r, c, 0, 120)
        self.assertEqual(c.modem.imposes, ["20801"])
        self.assertEqual([n for n in r.journal.notes if "imposé" in n],
                         ["réseau MTN ·6414 : Orange F (20801) imposé"])
        self.assertEqual(c.carte.reseau, "Orange F")     # l'écran suit

    def test_la_cle_peut_etre_l_operateur_ou_l_iccid(self):
        for cle in ("mtn", "8923798206414", "mtn ·6414"):
            r, c = robot({cle: "20801"}, ModemDeRoaming())
            passer(r, c, 0, 30)
            self.assertEqual(c.modem.imposes, ["20801"], cle)

    def test_une_autre_carte_n_est_pas_touchee(self):
        r, c = robot({"3501": "20801"}, ModemDeRoaming())
        passer(r, c, 0, 120)
        self.assertEqual(c.modem.imposes, [])
        self.assertEqual(c.modem.rendus, 0)

    def test_reposee_apres_une_relance_du_modem(self):
        r, c = robot({"6414": "20801"}, ModemDeRoaming())
        passer(r, c, 0, 60)
        c.redemarrer()
        passer(r, c, 60, 120)
        self.assertEqual(c.modem.imposes, ["20801", "20801"])

    def test_rendue_apres_cinq_minutes_sans_service_puis_reessayee(self):
        m = ModemDeRoaming(creg=2)          # elle cherche, et ne trouve pas
        r, c = robot({"6414": "20801"}, m)
        t = passer(r, c, 0, RESEAU_RETOUR_AUTO - 30)
        self.assertEqual(m.rendus, 0)
        t = passer(r, c, t, RESEAU_RETOUR_AUTO + 60)
        self.assertEqual(m.rendus, 1)
        retours = [n for n in r.journal.notes if "retour au choix automatique" in n]
        self.assertEqual(len(retours), 1)
        self.assertIn("Orange F (20801) introuvable depuis", retours[0])
        self.assertIn("nouvel essai dans une heure", retours[0])
        # Pas de nouvel essai avant une heure…
        t = passer(r, c, t, t + RESEAU_NOUVEL_ESSAI - 120, pas=60)
        self.assertEqual(m.imposes, ["20801"])
        # … et un seul ensuite.
        passer(r, c, t, t + 300, pas=60)
        self.assertEqual(m.imposes, ["20801", "20801"])

    def test_une_carte_qui_a_son_reseau_garde_le_reseau_impose(self):
        m = ModemDeRoaming(creg=5)          # inscrite, en itinérance
        r, c = robot({"6414": "20801"}, m)
        passer(r, c, 0, 2 * RESEAU_RETOUR_AUTO, pas=30)
        self.assertEqual(m.rendus, 0)
        self.assertEqual(m.imposes, ["20801"])

    def test_jamais_pendant_un_menu(self):
        r, c = robot({"6414": "20801"}, ModemDeRoaming())
        c.session_ouverte = True
        passer(r, c, 0, 120)
        self.assertEqual(c.modem.imposes, [])
        c.session_ouverte = False
        passer(r, c, 120, 150)
        self.assertEqual(c.modem.imposes, ["20801"])

    def test_un_refus_du_modem_se_dit_et_se_reessaie_plus_tard(self):
        class Refuse(ModemDeRoaming):
            def imposer_reseau(self, code):
                self.imposes.append(code)
                return False
        m = Refuse()
        r, c = robot({"6414": "20801"}, m)
        t = passer(r, c, 0, 600, pas=60)
        self.assertEqual(m.imposes, ["20801"])
        self.assertIn("réseau MTN ·6414 : Orange F (20801) refusé par le modem",
                      r.journal.notes)
        passer(r, c, t, t + RESEAU_NOUVEL_ESSAI + 60, pas=60)
        self.assertEqual(m.imposes, ["20801", "20801"])


class TestSansReglageLeRobotNeToucheARien(EnFrancais):
    """LE TÉMOIN des installations existantes : sans [reseaux], un modem en
    choix automatique ne reçoit aucun ordre, et rien ne s'écrit."""

    def test_un_modem_en_automatique_est_laisse_tranquille(self):
        m = ModemDeRoaming(mode=0)
        r, c = robot({}, m)
        passer(r, c, 0, 600)
        self.assertEqual(m.lectures, 1)       # regardé une fois, c'est tout
        self.assertEqual((m.imposes, m.rendus), ([], 0))
        self.assertEqual([n for n in r.journal.notes if "réseau MTN" in n], [])

    def test_un_reglage_d_avant_est_rendu(self):
        m = ModemDeRoaming(mode=1)
        r, c = robot({}, m)
        passer(r, c, 0, 60)
        self.assertEqual(m.rendus, 1)
        self.assertEqual(m.imposes, [])
        self.assertIn("réseau MTN ·6414 : plus de réseau imposé — retour au "
                      "choix automatique", r.journal.notes)

    def test_un_modem_qui_ne_sait_pas_choisir_ne_gene_rien(self):
        class Simple:
            port = "/dev/ttyUSB2"

            def inscription(self):
                return (True, 1, None)
        r, c = robot({"6414": "20801"}, Simple())
        passer(r, c, 0, 120)                   # ne lève pas, n'écrit rien
        self.assertEqual([n for n in r.journal.notes if "réseau MTN" in n], [])


if __name__ == "__main__":
    unittest.main()
