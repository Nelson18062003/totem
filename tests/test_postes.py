# -*- coding: utf-8 -*-
"""Un poste par carte : ce qui arrive à l'une ne retarde jamais l'autre.

Un seul fil relevait les SMS de toutes les cartes, l'une après l'autre. Une
carte en plein menu USSD garde son modem jusqu'à trente secondes : le fil
restait planté devant elle, et l'encaissement arrivé sur une AUTRE carte —
sur un modem libre — attendait. On l'éprouve avec le vrai robot, deux modems
simulés, et une carte tenue occupée comme par un menu qui traîne.
"""

import sys
import threading
import time
import unittest

sys.path.insert(0, "tests")

from test_reglages import TransportEspion  # noqa: E402
from totem.app import Robot  # noqa: E402
from totem.compte import Compte  # noqa: E402
from totem.simulator import ModemSimule  # noqa: E402
from totem.storage import Journal  # noqa: E402

# Ce qu'un menu USSD lent tient le modem, ici. Le vrai délai va jusqu'à 30 s.
OCCUPATION = 3.0
# Ce qu'on accorde à la carte libre pour relever son SMS.
PATIENCE = 1.5


def deux_cartes():
    orange = Compte(ModemSimule("Orange"), "Orange")
    mtn = Compte(ModemSimule("MTN"), "MTN")
    robot = Robot([orange, mtn], TransportEspion(), Journal(":memory:"),
                  pause_sms=0.2, recus=False)
    return robot, orange, mtn


def occuper(compte, duree):
    """Tient le modem comme un menu USSD qui attend le réseau."""
    pris = threading.Event()

    def tenir():
        with compte.verrou:
            pris.set()
            time.sleep(duree)

    threading.Thread(target=tenir, daemon=True).start()
    pris.wait(1)


def releve_dans(compte, delai):
    """Le SMS en attente sur ce modem a-t-il été relevé (journalisé, puis
    effacé du modem) dans le délai ?"""
    fin = time.monotonic() + delai
    while time.monotonic() < fin:
        if not compte.modem.sms_en_attente:
            return True
        time.sleep(0.05)
    return False


class TestUnPosteParCarte(unittest.TestCase):

    def test_une_carte_occupee_ne_retarde_pas_l_encaissement_d_une_autre(self):
        robot, orange, mtn = deux_cartes()
        try:
            occuper(orange, OCCUPATION)
            mtn.modem.injecter_paiement("CLIENT", 15000)
            robot._lancer_postes()
            self.assertTrue(releve_dans(mtn, PATIENCE),
                            "l'encaissement MTN a attendu la carte Orange")
        finally:
            robot.actif = False

    def test_chaque_poste_finit_par_relever_sa_carte(self):
        """La carte occupée n'est pas oubliée : son SMS est relevé dès que
        son modem se libère."""
        robot, orange, mtn = deux_cartes()
        try:
            occuper(orange, 0.8)
            orange.modem.injecter_paiement("CLIENT", 5000)
            robot._lancer_postes()
            self.assertTrue(releve_dans(orange, 3))
        finally:
            robot.actif = False

    def test_le_temoin_un_seul_fil_attend(self):
        """LE TÉMOIN — l'ancienne façon : un tour qui relève les cartes l'une
        après l'autre. Elle DOIT rester plantée devant la carte occupée ;
        sinon la carte n'est pas vraiment occupée, et le premier test ne
        prouve rien."""
        robot, orange, mtn = deux_cartes()
        try:
            occuper(orange, OCCUPATION)
            mtn.modem.injecter_paiement("CLIENT", 15000)
            robot.postes = False
            threading.Thread(target=robot._tour_de_surveillance,
                             daemon=True).start()
            self.assertFalse(releve_dans(mtn, PATIENCE),
                             "le témoin n'attend pas : l'occupation ne "
                             "bloque rien, l'essai ne prouve rien")
        finally:
            robot.actif = False


if __name__ == "__main__":
    unittest.main()
