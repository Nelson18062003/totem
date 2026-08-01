# -*- coding: utf-8 -*-
"""Ce qui se passe quand le modem décroche du bus USB.

Constaté sur le Pi de Douala : le modem disparaît, et tout ce qu'on écrit sur
le port répond « (5, 'Input/output error') ». Le robot annonçait alors un
redémarrage raté toutes les minutes, indéfiniment, sans jamais rouvrir le
port — donc sans aucune chance de s'en sortir.

Deux choses sont vérifiées ici : que le port est bien rouvert, et qu'une
panne qui dure ne noie pas la conversation sous des alertes identiques.

Lancer :  python3 -m unittest discover -s tests
"""

import unittest

from totem.app import Robot
from totem.compte import Compte
from totem.simulator import ModemSimule
from totem.storage import Journal


class ModemCapricieux(ModemSimule):
    """Un modem qui a décroché du bus. Il refuse tout, jusqu'à ce qu'on le
    rouvre — et il compte combien de fois on a essayé."""

    def __init__(self):
        super().__init__("Orange")
        self.tombe = True
        self.tentatives = 0

    def _verifier(self):
        if self.tombe:
            raise OSError(5, "Input/output error")

    def lire_sms(self):
        self._verifier()
        return super().lire_sms()

    def redemarrer(self):
        self.tentatives += 1
        self._verifier()      # tant qu'il est tombé, le redémarrage échoue aussi


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


def _robot():
    modem = ModemCapricieux()
    compte = Compte(modem, "Orange")
    journal = Journal(":memory:")
    return Robot([compte], TransportEspion(), journal), compte, modem


def _trois_echecs(robot, compte):
    """Le chien de garde se déclenche à la troisième lecture ratée."""
    for _ in range(3):
        robot._relever_sms(compte)


class TestAlerteQuiSeRepete(unittest.TestCase):
    def test_la_panne_ne_sannonce_quune_fois(self):
        robot, compte, modem = _robot()
        _trois_echecs(robot, compte)
        premier = len(robot.transport.messages)
        self.assertGreater(premier, 0)
        self.assertTrue(compte.panne_signalee)

        # La panne dure : dix tours de surveillance de plus.
        for _ in range(10):
            _trois_echecs(robot, compte)
        self.assertEqual(len(robot.transport.messages), premier,
                         "une panne qui dure ne doit pas répéter son alerte")

    def test_lalerte_dit_quoi_faire(self):
        robot, compte, modem = _robot()
        _trois_echecs(robot, compte)
        alerte = "\n".join(robot.transport.messages)
        self.assertIn("Input/output error", alerte)
        self.assertIn("3 A", alerte)          # l'alimentation, cause n°1
        self.assertIn("USB", alerte)

    def test_les_essais_sespacent(self):
        """Marteler un modem tombé n'y change rien et bloque la surveillance."""
        robot, compte, modem = _robot()
        _trois_echecs(robot, compte)
        self.assertEqual(modem.tentatives, 1)
        self.assertGreaterEqual(compte.attente_modem, 60)

        for _ in range(10):
            _trois_echecs(robot, compte)
        self.assertEqual(modem.tentatives, 1,
                         "le prochain essai n'est pas encore dû")

    def test_le_retour_est_annonce(self):
        robot, compte, modem = _robot()
        _trois_echecs(robot, compte)
        pendant_la_panne = len(robot.transport.messages)

        # Le modem se remet à répondre tout seul : câble remis en place,
        # alimentation stabilisée. Aucun redémarrage n'a lieu — et c'est
        # justement le cas où le retour doit quand même être annoncé.
        modem.tombe = False
        robot._relever_sms(compte)

        self.assertGreater(len(robot.transport.messages), pendant_la_panne)
        self.assertIn("répond de nouveau", robot.transport.messages[-1])
        self.assertFalse(compte.panne_signalee)
        self.assertEqual(compte.attente_modem, 0)

    def test_le_retour_ne_sannonce_quune_fois(self):
        robot, compte, modem = _robot()
        _trois_echecs(robot, compte)
        modem.tombe = False
        robot._relever_sms(compte)
        apres_retour = len(robot.transport.messages)
        for _ in range(5):
            robot._relever_sms(compte)
        self.assertEqual(len(robot.transport.messages), apres_retour)

    def test_un_modem_sain_ne_dit_rien(self):
        """Le cas courant : rien ne doit apparaître dans la conversation."""
        modem = ModemCapricieux()
        modem.tombe = False
        compte = Compte(modem, "Orange")
        robot = Robot([compte], TransportEspion(), Journal(":memory:"))
        for _ in range(5):
            robot._relever_sms(compte)
        self.assertEqual(robot.transport.messages, [])

    def test_un_redemarrage_demande_a_la_main_parle_toujours(self):
        """Le propriétaire qui appuie sur le bouton attend une réponse, même
        si la panne a déjà été annoncée."""
        robot, compte, modem = _robot()
        _trois_echecs(robot, compte)
        avant = len(robot.transport.messages)
        robot._redemarrer_modem(compte, canal="alertes", automatique=False)
        self.assertGreater(len(robot.transport.messages), avant)


class TestReouvertureDuPort(unittest.TestCase):
    """Un modem qui redémarre disparaît du bus et y revient, parfois sous un
    autre nom. Sans réouverture, le port reste mort pour toujours."""

    def test_le_port_est_rouvert(self):
        from totem.modem import ModemSerie

        ouvertures = []

        class FauxPort:
            def __init__(self, chemin, baud, timeout=1):
                ouvertures.append(chemin)
                self.chemin = chemin

            def close(self):
                pass

        modem = ModemSerie.__new__(ModemSerie)      # sans matériel
        modem.port = "/dev/ttyUSB2"
        modem.baud = 115200
        modem.ser = FauxPort("/dev/ttyUSB2", 115200)
        ouvertures.clear()

        import sys
        import types
        faux = types.ModuleType("serial")
        faux.Serial = FauxPort
        vrai = sys.modules.get("serial")
        sys.modules["serial"] = faux
        try:
            modem._rouvrir(patience=5)
        finally:
            if vrai is None:
                del sys.modules["serial"]
            else:
                sys.modules["serial"] = vrai

        self.assertEqual(ouvertures, ["/dev/ttyUSB2"])

    def test_le_port_peut_changer_de_nom(self):
        """Le noyau ne rend pas forcément le même numéro au retour."""
        from totem.modem import ModemSerie

        class PortDeplace:
            def __init__(self, chemin, baud, timeout=1):
                if chemin == "/dev/ttyUSB2":
                    raise OSError(2, "No such file or directory")
                self.chemin = chemin

            def close(self):
                pass

        modem = ModemSerie.__new__(ModemSerie)
        modem.port = "/dev/ttyUSB2"
        modem.baud = 115200
        modem.ser = PortDeplace("/dev/ttyUSB6", 115200)
        modem._chemins_possibles = lambda: ["/dev/ttyUSB2", "/dev/ttyUSB6"]

        import sys
        import types
        faux = types.ModuleType("serial")
        faux.Serial = PortDeplace
        vrai = sys.modules.get("serial")
        sys.modules["serial"] = faux
        try:
            modem._rouvrir(patience=5)
        finally:
            if vrai is None:
                del sys.modules["serial"]
            else:
                sys.modules["serial"] = vrai

        self.assertEqual(modem.port, "/dev/ttyUSB6")

    def test_un_port_qui_ne_revient_pas_le_dit(self):
        from totem.modem import ErreurModem, ModemSerie

        class PortMort:
            def __init__(self, chemin, baud, timeout=1):
                raise OSError(5, "Input/output error")

            def close(self):
                pass

        modem = ModemSerie.__new__(ModemSerie)
        modem.port = "/dev/ttyUSB2"
        modem.baud = 115200
        modem.ser = type("X", (), {"close": lambda self: None})()
        modem._chemins_possibles = lambda: ["/dev/ttyUSB2"]

        import sys
        import types
        faux = types.ModuleType("serial")
        faux.Serial = PortMort
        vrai = sys.modules.get("serial")
        sys.modules["serial"] = faux
        try:
            with self.assertRaises(ErreurModem) as souci:
                modem._rouvrir(patience=3)
        finally:
            if vrai is None:
                del sys.modules["serial"]
            else:
                sys.modules["serial"] = vrai

        self.assertIn("3 A", str(souci.exception))


if __name__ == "__main__":
    unittest.main()
