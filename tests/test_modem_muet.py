# -*- coding: utf-8 -*-
"""UN MODEM MUET EST UNE PANNE — pas « aucun SMS ».

Le 23 octobre, la carte Orange ·4177 a passé la matinée sur un port qui
acceptait tout et ne répondait rien : « signal unknown · registration
unreadable · USSD setting unreadable · ttyUSB20 », et chaque code « sans
réponse du réseau ». Le chien de garde ne voyait rien : un port DÉBRANCHÉ
lève « Input/output error », un port muet rend une chaîne vide, et la relève
des SMS en faisait « aucun SMS » sans lever. La veille du réseau lisait
« inconnu », qui ne compte ni pour ni contre. Rien ne relançait ce modem ;
le propriétaire relançait tout le robot à la main.

Ici : la relève d'un modem qui ne rend PAS UN OCTET lève `ModemMuet`, avec
le port ; trois relèves de suite font relancer le modem, comme trois
« Input/output error » ; une réponse entamée mais sans « OK » (une mémoire
pleine, longue à lister) ne lève pas. Le témoin est l'ancienne relève,
recopiée : sur le même port muet, elle rend « aucun SMS ».

Lancer :  python3 -m unittest tests.test_modem_muet
"""

import threading
import unittest
from unittest import mock

import totem.modem
from totem.app import Robot
from totem.compte import Compte
from totem.modem import RE_CMGL, DELAI_RELEVE, ModemMuet, ModemSerie, decode_auto
from totem.storage import Journal
from totem.textes import definir_langue, langue_active


class Horloge:
    """Le temps passe quand on dort, et seulement là : dix secondes de
    silence ne coûtent rien au test."""
    t = 0.0

    def time(self):
        return self.t

    def monotonic(self):
        return self.t

    def sleep(self, s):
        self.t += s


class Port:
    """Un port série ouvert, qui accepte ce qu'on lui écrit."""

    def __init__(self):
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
        return "\r\nOK\r\n"


class PortMuet(Port):
    """Celui du 23 octobre : pas un octet, jamais."""

    def _reponse(self, commande):
        return ""


class PortLentSansFin(Port):
    """Une mémoire pleine qui se liste : la réponse est entamée, le « OK »
    n'est pas encore venu quand le délai tombe. Ce n'est PAS un silence."""

    def _reponse(self, commande):
        if commande.startswith("AT+CMGL"):
            return '\r\n+CMGL: 1,"REC READ","+237677123456",,"26/10/23,10:00:00+04"\r\nBonjour\r\n'
        return "\r\nOK\r\n"


class PortDebranche(Port):
    """Le modem a quitté le bus : le port lève, comme sur le Pi."""

    def write(self, octets):
        raise OSError(5, "Input/output error")


def modem_sur(port, mode_pdu=True):
    m = ModemSerie.__new__(ModemSerie)        # sans matériel
    m.ser = port
    m.port = "/dev/ttyUSB20"
    m.verrou = threading.Lock()
    m.ucs2 = False
    m.mode_pdu = mode_pdu
    m._memo = {}
    m._traine_urc = b""
    m._ferme_par_le_reseau = False
    return m


# --- LE TÉMOIN : la relève d'avant, recopiée telle quelle ------------------
def _ancienne_releve(m):
    with m.verrou:
        commande = "AT+CMGL=4" if m.mode_pdu else 'AT+CMGL="ALL"'
        brut = m._envoyer(commande, delai=10)
    return [([int(x.group(1))], decode_auto(x.group(2), mode_texte=True),
             decode_auto(x.group(3).strip(), mode_texte=True), None)
            for x in RE_CMGL.finditer(brut)]


def horloge_arretee():
    return mock.patch.object(totem.modem, "time", Horloge())


class EnFrancais(unittest.TestCase):
    def setUp(self):
        self._langue = langue_active()
        definir_langue("fr")

    def tearDown(self):
        definir_langue(self._langue)


class TestUnSilenceCompletEstUnePanne(EnFrancais):
    def test_pas_un_octet_leve_avec_le_port(self):
        m = modem_sur(PortMuet())
        with horloge_arretee(), self.assertRaises(ModemMuet) as cm:
            m.lire_sms()
        phrase = str(cm.exception)
        self.assertIn("ttyUSB20", phrase)
        self.assertIn("muet", phrase)
        self.assertIn("AT+CMGL=4", phrase)
        self.assertIn(f"{DELAI_RELEVE:g} s", phrase)
        self.assertNotIn("débranché", phrase.replace("pas débranché", ""))

    def test_le_temoin_disait_aucun_sms(self):
        """L'ancienne relève, sur le même port muet : « aucun SMS », sans
        lever. C'est ce qui laissait le chien de garde à zéro."""
        m = modem_sur(PortMuet())
        with horloge_arretee():
            self.assertEqual(_ancienne_releve(m), [])

    def test_une_reponse_entamee_nest_pas_un_silence(self):
        """Le « OK » manque, mais le modem parle : ce qui est lu se traite,
        rien ne lève — sinon une mémoire pleine ferait relancer le modem."""
        m = modem_sur(PortLentSansFin(), mode_pdu=False)
        with horloge_arretee():
            messages = m.lire_sms()
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0][1], "+237677123456")

    def test_un_port_debranche_leve_toujours_sa_propre_erreur(self):
        m = modem_sur(PortDebranche())
        with horloge_arretee(), self.assertRaises(OSError):
            m.lire_sms()

    def test_un_modem_qui_repond_ne_leve_pas(self):
        m = modem_sur(Port())
        with horloge_arretee():
            self.assertEqual(m.lire_sms(), [])


class TransportEspion:
    def __init__(self):
        self.messages = []

    def envoyer(self, texte, boutons=None, canal=None, silencieux=False):
        self.messages.append(texte)
        return len(self.messages)

    def envoyer_fichier(self, *a, **k):
        return True

    def recevoir(self):
        return []

    def publier_commandes(self, commandes):
        pass

    def vider_backlog(self):
        pass

    def role(self, utilisateur):
        return "admin"


class TestTroisSilencesRelancentLeModem(EnFrancais):
    """La chaîne entière : le VRAI `ModemSerie` sur un port muet, le vrai
    `Compte`, la vraie relève du robot — et le chien de garde qui relance."""

    def _robot(self, port):
        compte = Compte(modem_sur(port), "Orange ·4177")
        journal = Journal(":memory:")
        robot = Robot([compte], TransportEspion(), journal)
        relances = []
        robot._redemarrer_modem = lambda c, **k: relances.append((c, k))
        return robot, compte, journal, relances

    def _textes(self, journal):
        return [texte for _, _, texte in journal.evenements_non_envoyes(100)]

    def test_le_modem_muet_est_relance_a_la_troisieme_releve(self):
        robot, compte, journal, relances = self._robot(PortMuet())
        with horloge_arretee():
            for _ in range(3):
                robot._relever_sms(compte)
        self.assertEqual(len(relances), 1)
        self.assertIs(relances[0][0], compte)
        self.assertTrue(relances[0][1].get("automatique"))
        lignes = [l for l in self._textes(journal) if l.startswith("lecture SMS Orange ·4177")]
        self.assertEqual(len(lignes), 3, self._textes(journal))
        self.assertIn("ttyUSB20", lignes[0])
        self.assertIn("muet", lignes[0])

    def test_deux_silences_ne_suffisent_pas(self):
        robot, compte, journal, relances = self._robot(PortMuet())
        with horloge_arretee():
            for _ in range(2):
                robot._relever_sms(compte)
        self.assertEqual(relances, [])

    def test_le_temoin_ne_relancait_jamais(self):
        """Avec la relève d'avant, trente relèves muettes : zéro échec compté,
        zéro relance, et rien au journal. Le propriétaire relançait à la main."""
        robot, compte, journal, relances = self._robot(PortMuet())
        with horloge_arretee(), mock.patch.object(
                ModemSerie, "lire_sms", _ancienne_releve):
            for _ in range(30):
                robot._relever_sms(compte)
        self.assertEqual(relances, [])
        self.assertEqual(compte.echecs, 0)
        self.assertEqual([l for l in self._textes(journal)
                          if l.startswith("lecture SMS")], [])


if __name__ == "__main__":
    unittest.main()
