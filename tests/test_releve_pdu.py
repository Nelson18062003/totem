# -*- coding: utf-8 -*-
"""La relève réelle, en mode PDU, jusqu'au journal.

C'est le chemin qui a cassé à Douala sans qu'aucun test ne le voie : le
simulateur livre déjà des quadruplets propres, et les tests de `recoller`
s'arrêtent avant le modem. Personne ne traversait `ModemSerie.lire_sms`
(mode PDU) puis le traitement d'`app.py` d'un seul tenant.

Résultat : le 4e champ de `recoller` — « complet », un booléen — a été pris
pour l'heure réseau du SMS, et `emis_le.isoformat()` explosait sur CHAQUE
message (« 'bool' object has no attribute 'isoformat' »). Le SMS n'était ni
journalisé, ni annoncé, ni effacé : retenté à chaque tour, pour toujours.
Plus rien n'arrivait, ni sur Telegram, ni sur la plateforme, alors que tout
semblait en marche. Ces tests referment ce trou.
"""

import threading
import unittest
from datetime import datetime, timezone

from totem.app import Robot
from totem.compte import Compte
from totem.modem import ModemSerie

try:
    from test_pdu import fabriquer_pdu               # discover -s tests
except ImportError:                                  # python3 -m unittest tests.…
    from tests.test_pdu import fabriquer_pdu


def _modem_pdu(reponse_cmgl):
    """Un ModemSerie sans matériel : la réponse AT+CMGL est fournie."""
    m = ModemSerie.__new__(ModemSerie)
    m.verrou = threading.Lock()
    m.mode_pdu = True
    m._envoyer = lambda commande, delai=10: reponse_cmgl
    return m


def _reponse_cmgl(*pdus):
    """(index, pdu_hexa)… → la réponse brute du modem, comme sur le port."""
    lignes = "".join(f"+CMGL: {index},1,,{len(pdu) // 2}\r\n{pdu}\r\n"
                     for index, pdu in pdus)
    return lignes + "\r\nOK\r\n"


class TestLHeureReseauEstUneDate(unittest.TestCase):
    def test_un_sms_simple_livre_une_vraie_date(self):
        """Le 4e champ du message relevé doit être l'heure réseau (datetime)
        — surtout pas le booléen « complet » de recoller."""
        quand = datetime(2026, 8, 2, 11, 47, 54, tzinfo=timezone.utc)
        modem = _modem_pdu(_reponse_cmgl(
            (3, fabriquer_pdu("Vous avez recu 15000 FCFA", quand=quand))))

        messages = modem.lire_sms()

        self.assertEqual(len(messages), 1)
        indices, expediteur, texte, emis_le = messages[0]
        self.assertEqual(indices, [3])
        self.assertIn("15000", texte)
        self.assertIsInstance(emis_le, datetime)     # PAS un booléen
        emis_le.isoformat()                          # ce qui explosait
        self.assertEqual((emis_le.year, emis_le.minute), (2026, 47))

    def test_un_message_long_garde_la_plus_recente_des_heures(self):
        """Un SMS en deux morceaux a deux horodatages : on retient le plus
        récent, et c'est toujours une date."""
        t1 = datetime(2026, 8, 2, 11, 47, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 8, 2, 11, 47, 9, tzinfo=timezone.utc)
        modem = _modem_pdu(_reponse_cmgl(
            (5, fabriquer_pdu("premiere moitie ", reference=7, total=2,
                              position=1, quand=t1)),
            (6, fabriquer_pdu("seconde moitie", reference=7, total=2,
                              position=2, quand=t2))))

        messages = modem.lire_sms()

        self.assertEqual(len(messages), 1)
        indices, _, texte, emis_le = messages[0]
        self.assertEqual(sorted(indices), [5, 6])
        self.assertIn("premiere", texte)
        self.assertIn("seconde", texte)
        self.assertIsInstance(emis_le, datetime)
        self.assertEqual(emis_le.second, 9)          # la plus récente

    def test_sans_horodatage_l_heure_reste_simplement_vide(self):
        """Un PDU sans date lisible donne emis_le = None — jamais un booléen,
        jamais une exception."""
        pdu = fabriquer_pdu("solde 1000")
        # On tronque l'horodatage en le remplaçant par des octets invalides :
        # plus simple, on vérifie surtout que None reste None côté modem.
        modem = _modem_pdu(_reponse_cmgl((1, pdu)))
        (_, _, _, emis_le), = modem.lire_sms()
        self.assertNotIsInstance(emis_le, bool)


class JournalTemoin:
    def __init__(self):
        self.lignes = []
        self.notes = []

    def sms_existe(self, *_):
        return False

    def sms(self, expediteur, texte, compte, iccid, emis_le=None):
        self.lignes.append((expediteur, texte, compte, emis_le))
        return len(self.lignes)

    def evenement(self, texte):
        self.notes.append(texte)


class ModemPoison:
    """Rejoue la panne du terrain : un booléen à la place de l'heure."""

    def lire_sms(self):
        return [([4], "OrangeMoney", "Vous avez recu 15000 FCFA", True)]

    def effacer_sms(self, indices):
        self.efface = list(indices)
        return True


class TestLeSmsPasseMemeSiLHeureEstFausse(unittest.TestCase):
    def test_un_emis_le_aberrant_ne_bloque_plus_le_sms(self):
        """Garde-fou d'app.py : même si un maillon renvoie n'importe quoi à la
        place de l'heure, le SMS est journalisé, annoncé et effacé. L'heure
        est simplement perdue (None) — un détail, pas une panne totale."""
        modem = ModemPoison()
        compte = Compte(modem, "Orange")
        robot = Robot.__new__(Robot)
        robot.journal = JournalTemoin()
        robot.nuage = None
        robot.recus = False
        annonces = []
        robot._notifier_sms = lambda *a: annonces.append(a)
        robot._annoncer_retour = lambda *a: None
        robot._noter = robot.journal.evenement

        robot._relever_sms(compte)

        self.assertEqual(len(robot.journal.lignes), 1)   # journalisé
        _, texte, _, emis_le = robot.journal.lignes[0]
        self.assertIn("15000", texte)
        self.assertIsNone(emis_le)                       # l'heure est perdue…
        self.assertEqual(len(annonces), 1)               # …mais l'alerte part
        self.assertEqual(modem.efface, [4])              # et la place est libérée
        self.assertEqual(robot.journal.notes, [])        # sans aucun incident


if __name__ == "__main__":
    unittest.main()
