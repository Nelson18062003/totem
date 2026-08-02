# -*- coding: utf-8 -*-
"""Détection instantanée d'un SMS entrant.

Le modem est réglé (AT+CNMI) pour annoncer tout SMS entrant par une ligne
« +CMTI ». On la guette pour relever le message aussitôt, au lieu d'attendre le
prochain tour de surveillance. Ces tests vérifient les trois maillons : le
modem entend l'annonce, le compte la relaie, et la boucle se réveille dès
qu'elle arrive.
"""

import threading
import time
import unittest

from totem.compte import Compte
from totem.modem import ModemSerie


class FauxPort:
    """Un port série minimal : on y dépose des octets, il les rend à la lecture."""

    def __init__(self, contenu=b""):
        self.tampon = contenu

    @property
    def in_waiting(self):
        return len(self.tampon)

    def read(self, n):
        morceau, self.tampon = self.tampon[:n], self.tampon[n:]
        return morceau


def _modem_sans_materiel(port):
    m = ModemSerie.__new__(ModemSerie)      # sans ouvrir de vrai port
    m.ser = port
    m.verrou = threading.Lock()
    m._traine_urc = b""
    return m


class TestModemEntendLAnnonce(unittest.TestCase):
    def test_un_cmti_est_repere(self):
        modem = _modem_sans_materiel(FauxPort(b'\r\n+CMTI: "SM",3\r\n'))
        self.assertTrue(modem.sms_annonce())

    def test_rien_sur_le_port_rien_a_annoncer(self):
        modem = _modem_sans_materiel(FauxPort(b""))
        self.assertFalse(modem.sms_annonce())

    def test_du_bruit_sans_cmti_n_annonce_rien(self):
        modem = _modem_sans_materiel(FauxPort(b"\r\nOK\r\n"))
        self.assertFalse(modem.sms_annonce())

    def test_un_cmti_coupe_en_deux_lectures_est_rattrape(self):
        """Une annonce peut arriver en deux morceaux : la traîne conservée
        évite de la manquer."""
        port = FauxPort(b"\r\n+CM")
        modem = _modem_sans_materiel(port)
        self.assertFalse(modem.sms_annonce())     # « +CM » seul : pas encore
        port.tampon = b'TI: "SM",4\r\n'           # la suite arrive
        self.assertTrue(modem.sms_annonce())      # recollée : annonce reconnue

    def test_l_annonce_ne_se_declenche_qu_une_fois(self):
        """Elle est à front : consommée, elle ne se répète pas au tour suivant."""
        modem = _modem_sans_materiel(FauxPort(b'\r\n+CMTI: "SM",5\r\n'))
        self.assertTrue(modem.sms_annonce())
        self.assertFalse(modem.sms_annonce())     # plus rien sur le port


class TestCompteRelaie(unittest.TestCase):
    def test_le_compte_relaie_l_annonce_du_modem(self):
        modem = _modem_sans_materiel(FauxPort(b'\r\n+CMTI: "SM",1\r\n'))
        compte = Compte(modem, "Orange")
        self.assertTrue(compte.sms_annonce())

    def test_un_modem_simule_sans_annonce_repond_non(self):
        """La démo et les tests utilisent un modem sans ce mécanisme : le compte
        répond simplement « non », et la relève périodique fait le travail."""
        class ModemSansAnnonce:
            pass
        compte = Compte(ModemSansAnnonce(), "Démo")
        self.assertFalse(compte.sms_annonce())


class TestReveilImmediat(unittest.TestCase):
    """La boucle de surveillance se réveille dès l'annonce, sans attendre
    l'échéance."""

    class CompteQuiAnnonce:
        session_ouverte = False

        def __init__(self, annonce):
            self._annonce = annonce

        def sms_annonce(self):
            return self._annonce

    def _robot(self, comptes):
        from totem.app import Robot
        r = Robot.__new__(Robot)     # sans démarrer tout le robot
        r.actif = True
        r.comptes = comptes
        return r

    def test_une_annonce_reveille_tout_de_suite(self):
        robot = self._robot([self.CompteQuiAnnonce(True)])
        debut = time.monotonic()
        robot._attendre_sms(delai=5)
        self.assertLess(time.monotonic() - debut, 1)   # bien avant les 5 s

    def test_sans_annonce_on_attend_l_echeance(self):
        robot = self._robot([self.CompteQuiAnnonce(False)])
        debut = time.monotonic()
        robot._attendre_sms(delai=0.6)
        self.assertGreaterEqual(time.monotonic() - debut, 0.5)

    def test_un_menu_ussd_ouvert_n_est_pas_lu(self):
        """On ne lit pas le port d'un compte en pleine session USSD : sa réponse
        attendue n'est pas à nous. Ce compte est ignoré par le guet."""
        occupe = self.CompteQuiAnnonce(True)
        occupe.session_ouverte = True
        robot = self._robot([occupe])
        debut = time.monotonic()
        robot._attendre_sms(delai=0.6)
        # Malgré son « annonce », il est ignoré : on va jusqu'à l'échéance.
        self.assertGreaterEqual(time.monotonic() - debut, 0.5)


if __name__ == "__main__":
    unittest.main()
