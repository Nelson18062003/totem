# -*- coding: utf-8 -*-
"""Le fil de surveillance ne meurt jamais.

C'est lui qui fait tout arriver : la relève des SMS, l'annonce sur Telegram,
le reçu PDF, l'envoi vers la plateforme. S'il s'arrête, tout se tait d'un
coup — alors que le robot répond encore aux commandes et que le signe de vie
(envoyé par un autre fil) continue de rassurer l'écran. C'est la panne la
plus sournoise du système : rien ne semble cassé, et rien n'arrive.

Ces tests vérifient qu'aucune étape du tour (santé, reçus, rapport, cartes,
courrier…) ne peut plus l'arrêter, même quand le journal lui-même refuse
d'écrire, et que le filet ultime de la boucle rattrape l'imprévu.
"""

import unittest

from totem.app import Robot


class JournalTemoin:
    """Un journal qui note tout — ou qui refuse tout, selon l'humeur."""

    def __init__(self, en_panne=False):
        self.notes = []
        self.en_panne = en_panne

    def evenement(self, texte):
        if self.en_panne:
            raise OSError("disque plein")
        self.notes.append(texte)


class FacteurTemoin:
    def __init__(self):
        self.tournees = 0

    def distribuer(self):
        self.tournees += 1


def _casse(nom):
    """Une étape qui échoue toujours, comme un incident réel le ferait."""
    def action():
        raise RuntimeError(f"panne simulée ({nom})")
    return action


def _robot_nu(journal=None):
    """Un robot réduit au tour de surveillance, sans modem ni Telegram."""
    r = Robot.__new__(Robot)
    r.actif = True
    r.comptes = []
    r.journal = journal if journal is not None else JournalTemoin()
    r.facteur = FacteurTemoin()
    # Échéances immédiates : chaque étape périodique se joue dès ce tour.
    r._prochaine_sante = 0
    r._prochaine_memoire = 0
    r._prochaines_cartes = 0
    return r


class TestUneEtapeNArretePasLeTour(unittest.TestCase):
    def test_les_etapes_suivantes_ont_lieu_malgre_une_panne(self):
        """La santé tombe en panne : les reçus et le courrier passent
        quand même — avant le blindage, le fil mourait là."""
        robot = _robot_nu()
        robot._recenser_cartes = lambda: None
        robot._expirer_session = lambda: None
        robot._veiller_sante = _casse("santé")
        robot._verifier_memoire = lambda: None
        distribues = []
        robot._distribuer_recus = lambda: distribues.append(True)
        robot._signaler_conflit = lambda: None
        robot._rapport_et_sauvegarde = lambda: None

        robot._tour_de_surveillance()      # ne doit pas lever

        self.assertEqual(distribues, [True])
        self.assertEqual(robot.facteur.tournees, 1)
        self.assertTrue(any("santé" in n for n in robot.journal.notes))

    def test_toutes_les_etapes_en_panne_ne_levent_rien(self):
        """Même un tour où TOUT échoue se termine sans lever : chaque
        incident est noté, aucun ne se propage."""
        robot = _robot_nu()
        for nom in ("_recenser_cartes", "_expirer_session", "_veiller_sante",
                    "_verifier_memoire", "_distribuer_recus",
                    "_signaler_conflit", "_rapport_et_sauvegarde"):
            setattr(robot, nom, _casse(nom))
        robot.facteur.distribuer = _casse("courrier")

        robot._tour_de_surveillance()      # ne doit pas lever

        self.assertGreaterEqual(len(robot.journal.notes), 8)

    def test_un_journal_en_panne_ne_tue_pas_le_tour_non_plus(self):
        """Le pire des cas : l'étape échoue ET le journal refuse d'écrire
        l'incident (disque plein). Le tour se termine quand même."""
        robot = _robot_nu(JournalTemoin(en_panne=True))
        robot._recenser_cartes = _casse("cartes")
        robot._expirer_session = lambda: None
        robot._veiller_sante = lambda: None
        robot._verifier_memoire = lambda: None
        robot._distribuer_recus = lambda: None
        robot._signaler_conflit = lambda: None
        robot._rapport_et_sauvegarde = lambda: None

        robot._tour_de_surveillance()      # ne doit pas lever


class TestLeFiletUltimeDeLaBoucle(unittest.TestCase):
    def test_un_tour_qui_explose_ne_termine_pas_la_boucle(self):
        """Si malgré tout un tour entier levait, la boucle le note et
        enchaîne le tour suivant au lieu de mourir en silence."""
        robot = _robot_nu()
        robot.pause_sms = 0
        tours = []

        def tour():
            tours.append(True)
            if len(tours) == 1:
                raise RuntimeError("imprévu")
            robot.actif = False        # deuxième tour : on s'arrête proprement

        robot._tour_de_surveillance = tour
        robot._boucle_surveillance()   # rend la main : la boucle a survécu

        self.assertEqual(len(tours), 2)
        self.assertTrue(any("tour de surveillance" in n
                            for n in robot.journal.notes))


if __name__ == "__main__":
    unittest.main()
