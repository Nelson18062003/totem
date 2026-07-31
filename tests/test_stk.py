# -*- coding: utf-8 -*-
"""Tests de la sonde SIM Toolkit.

Cette sonde répond à une seule question, mais elle décide de l'avenir du
pilotage : l'opérateur peut-il déclarer lui-même ce qu'il attend (montant,
numéro, code secret), au lieu de nous laisser le deviner d'après le texte ?

Trois issues possibles, et la sonde doit les distinguer sans se tromper —
notamment ne JAMAIS annoncer une applet qui n'existe pas, ce qui ferait
engager un travail important pour rien.
"""

import unittest

from totem.stk import SONDES, rapport, sonder


class _Verrou:
    def __enter__(self): return self
    def __exit__(self, *a): return False


class FauxModem:
    """Répond selon un dictionnaire ; ERROR pour tout le reste."""

    def __init__(self, reponses=None):
        self.reponses = reponses or {}
        self.verrou = _Verrou()
        self.recues = []

    def _envoyer(self, commande, delai=5):
        self.recues.append(commande)
        for prefixe, reponse in self.reponses.items():
            if commande.startswith(prefixe):
                return reponse
        return "\r\nERROR\r\n"


CARTE_AVEC_APPLET = {
    "AT+STK=?": "\r\n+STK: (0-1)\r\n\r\nOK\r\n",
    "AT+STK?": "\r\n+STK: 1\r\n\r\nOK\r\n",
    "AT+STK=1": "\r\nOK\r\n",
    "AT+STGI=0": ('\r\n+STGI: 0,1,"Orange Money"\r\n'
                  '+STGI: 0,2,"Mon compte"\r\n\r\nOK\r\n'),
}
CARTE_SANS_APPLET = {
    "AT+STK=?": "\r\n+STK: (0-1)\r\n\r\nOK\r\n",
    "AT+STK=1": "\r\nOK\r\n",
}


class SondeSimToolkit(unittest.TestCase):
    def test_carte_portant_une_applet_de_paiement(self):
        resultat = sonder(FauxModem(CARTE_AVEC_APPLET))
        self.assertTrue(resultat.supporte)
        self.assertTrue(resultat.applet_probable)
        self.assertIn("Orange Money", resultat.items)
        self.assertIn("jouable", resultat.verdict())

    def test_carte_sans_menu(self):
        resultat = sonder(FauxModem(CARTE_SANS_APPLET))
        self.assertTrue(resultat.supporte)
        self.assertFalse(resultat.applet_probable)
        self.assertIn("USSD reste la voie", resultat.verdict())

    def test_firmware_qui_ignore_le_sim_toolkit(self):
        resultat = sonder(FauxModem())
        self.assertFalse(resultat.supporte)
        self.assertIn("seule voie", resultat.verdict())

    def test_menu_sans_rapport_avec_le_paiement(self):
        """Ne pas conclure trop vite : un menu d'opérateur n'est pas une
        applet de paiement."""
        resultat = sonder(FauxModem({
            "AT+STK=?": "\r\nOK\r\n",
            "AT+STGI=0": '\r\n+STGI: 0,1,"Actualites"\r\n+STGI: 0,2,"Meteo"\r\n\r\nOK\r\n',
        }))
        self.assertFalse(resultat.applet_probable)
        self.assertIn("Vérifiez sur l'autre SIM", resultat.verdict())

    def test_un_modem_muet_ne_fait_pas_planter(self):
        class Muet(FauxModem):
            def _envoyer(self, commande, delai=5):
                raise OSError("port fermé")
        resultat = sonder(Muet())
        self.assertFalse(resultat.supporte)
        self.assertIn("échec", rapport(resultat))

    def test_lecture_seule(self):
        """Aucune commande ne doit valider, saisir ou confirmer quoi que ce
        soit : on peut lancer la sonde sur une SIM qui contient de l'argent."""
        modem = FauxModem(CARTE_AVEC_APPLET)
        sonder(modem)
        for commande in modem.recues:
            self.assertNotIn("STGR", commande)    # STGR = répondre / valider
            self.assertNotIn("CMGS", commande)    # envoi de SMS
            self.assertNotIn("CUSD", commande)    # ouverture de session USSD

    def test_toutes_les_sondes_sont_essayees(self):
        """Les firmwares n'exposent pas les mêmes commandes : on les essaie
        toutes plutôt que de conclure sur la première qui échoue."""
        modem = FauxModem(CARTE_AVEC_APPLET)
        sonder(modem)
        self.assertEqual(len(modem.recues), len(SONDES))

    def test_rapport_lisible(self):
        texte = rapport(sonder(FauxModem(CARTE_AVEC_APPLET)))
        self.assertIn("Orange Money", texte)
        self.assertIn("lecture seule", texte)


if __name__ == "__main__":
    unittest.main(verbosity=2)
