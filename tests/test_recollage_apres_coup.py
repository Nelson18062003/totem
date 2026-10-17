# -*- coding: utf-8 -*-
"""Un morceau en retard COMPLÈTE le message déjà montré — comme un téléphone.

LE 17 OCTOBRE, 08 h 10. Un transfert Orange de 150 000 F s'affiche avec sa
seule fin (« 150000 FCFA, Charges… New balance… ») et la mention « morceau 1
sur 2 jamais reçu » : le début, celui qui NOMME qui a payé, manquait. Le
propriétaire : « c'est impossible, ils envoient toujours le message entier ».

Ce qui est vrai (norme 3GPP TS 23.040) : l'opérateur découpe un long message
en SMS séparés, numérotés, qui voyagent chacun de leur côté et peuvent
arriver dans le désordre ou en retard — en itinérance surtout. Ce qui est
vrai aussi : un téléphone Android attend la suite SEPT JOURS
(`DEFAULT_PARTIAL_SEGMENT_EXPIRE_AGE`, `SmsBroadcastUndelivered`) ; c'est
pourquoi on n'y voit jamais « 1 sur 2 ». Le robot, lui, abandonnait au bout
d'un quart d'heure — et un morceau arrivé ensuite devenait un SECOND message
coupé.

Maintenant : la moitié reçue se montre au bout de deux minutes, dite
incomplète, et la suite la COMPLÈTE quand elle arrive, jusqu'à sept jours
plus tard — même ligne au journal, même ligne sur la plateforme, une seule
annonce entière avec le nom.

Le TÉMOIN est la relève sans recollage : elle doit laisser deux moitiés.
Noms, numéros et soldes inventés ; forme et longueur d'un vrai avis Orange.
"""

import unittest
from datetime import datetime, timedelta, timezone

from totem.analyse_sms import analyser
from totem.compte import Compte
from totem.storage import Journal

try:
    from test_morceaux_bruts import _modem, _robot      # discover -s tests
    from test_pdu import fabriquer_pdu
except ImportError:                                     # python3 -m unittest tests.…
    from tests.test_morceaux_bruts import _modem, _robot
    from tests.test_pdu import fabriquer_pdu

TRANSFERT = (
    "Successful transfer from 690000021 ETS ESSAI LONG NOM COMMERCIAL DU "
    "LITTORAL to 690000002 BOUTIQUE ESSAI. Details: Transaction ID: "
    "PP261017.0810.A00042, Transaction amount: 150000 FCFA, Charges: 0 FCFA, "
    "Commission: 0 FCFA, Net amount :150000 FCFA, New balance: 3154870.6 FCFA.")
DEBUT, FIN = TRANSFERT[:153], TRANSFERT[153:]
CLE = ("OrangeMoney", 42, 2)


class Boitier:
    """Un journal, un robot, une carte Orange — et ce que le robot annonce."""

    def __init__(self, recoller=True):
        self.journal = Journal(":memory:")
        self.robot = _robot(self.journal)
        self.annonces = []
        self.robot._notifier_sms = (
            lambda compte, expediteur, texte, sms_id=None:
            self.annonces.append((sms_id, texte)))
        if not recoller:                      # le témoin : la relève d'avant
            self.robot._recoller_apres_coup = lambda *a: None

    def relever(self, *pdus, attente=timedelta(minutes=3)):
        """Une relève ; le groupe incomplet attend depuis `attente`."""
        modem = _modem(*pdus)
        modem._morceaux_vus[CLE] = datetime.now(timezone.utc) - attente
        self.robot._relever_sms(Compte(modem, "Orange ·4177"))
        return modem

    def sms(self):
        return self.journal.conn.execute(
            "SELECT id, texte, COALESCE(envoye, 0) FROM sms ORDER BY id").fetchall()

    def monter(self):
        """La plateforme a reçu ce qui attendait."""
        self.journal.conn.execute("UPDATE sms SET envoye = 1")


def pdu(texte, position, ecrit):
    return fabriquer_pdu(texte, "OrangeMoney", 42, 2, position, quand=ecrit)


class LaSuiteArriveTroisHeuresApres(unittest.TestCase):
    """La fin arrive seule ; le début, trois heures plus tard."""

    def setUp(self):
        self.ecrit = datetime.now(timezone.utc) - timedelta(hours=3, minutes=5)

    def _la_matinee(self, boitier):
        boitier.relever((4, pdu(FIN, 2, self.ecrit)))
        boitier.monter()
        modem = boitier.relever((7, pdu(DEBUT, 1, self.ecrit)))
        return modem

    def test_le_temoin_laisse_deux_moities(self):
        boitier = Boitier(recoller=False)
        self._la_matinee(boitier)
        lignes = boitier.sms()
        self.assertEqual(len(lignes), 2, "le banc ne refait pas la matinée")
        self.assertTrue(all("message incomplet" in texte for _, texte, _ in lignes))

    def test_la_moitie_se_montre_d_abord_et_le_dit(self):
        boitier = Boitier()
        boitier.relever((4, pdu(FIN, 2, self.ecrit)))
        ((_, texte, _),) = boitier.sms()
        self.assertTrue(texte.startswith(FIN))
        self.assertIn("pas encore arrivé", texte)
        self.assertNotIn("jamais", texte)     # ce n'est pas vrai : il peut venir

    def test_la_suite_complete_le_meme_message(self):
        boitier = Boitier()
        modem = self._la_matinee(boitier)

        ((sms_id, texte, envoye),) = boitier.sms()
        self.assertEqual(texte, TRANSFERT)
        # Il repart à la plateforme, qui remplace la moitié qu'elle montrait.
        self.assertEqual(envoye, 0)
        # Le morceau arrivé est libéré dans le modem, comme tout autre.
        self.assertEqual(modem.effaces, [7])
        # La lecture de l'argent retrouve le nom et le montant.
        p = analyser(texte)
        self.assertEqual(p.montant, 150000)
        self.assertIn("ESSAI LONG NOM COMMERCIAL", str(p.emetteur) + str(p.tiers))

    def test_l_annonce_entiere_part_une_fois(self):
        boitier = Boitier()
        self._la_matinee(boitier)
        (sms_id, _, _), = boitier.sms()
        self.assertEqual([a[0] for a in boitier.annonces], [sms_id, sms_id])
        self.assertEqual(boitier.annonces[-1][1], TRANSFERT)

    def test_le_journal_des_morceaux_le_sait(self):
        boitier = Boitier()
        self._la_matinee(boitier)
        morceaux = boitier.journal.morceaux()
        self.assertEqual(len(morceaux), 2)
        self.assertEqual({m["complet"] for m in morceaux}, {1})
        self.assertEqual(len({m["sms_id"] for m in morceaux}), 1)
        evenements = [e for (e,) in boitier.journal.conn.execute(
            "SELECT texte FROM evenements")]
        complete = [e for e in evenements if "complété après coup" in e]
        self.assertEqual(len(complete), 1, evenements)
        for interdit in ("690000021", "ESSAI", "150000", "3154870"):
            self.assertNotIn(interdit, complete[0])

    def test_dans_l_autre_sens_aussi(self):
        """Le début seul d'abord, la fin ensuite."""
        boitier = Boitier()
        boitier.relever((4, pdu(DEBUT, 1, self.ecrit)))
        boitier.relever((5, pdu(FIN, 2, self.ecrit)))
        ((_, texte, _),) = boitier.sms()
        self.assertEqual(texte, TRANSFERT)


class OnNeColleJamaisDeuxOperations(unittest.TestCase):
    """Le numéro de découpe n'a que 256 valeurs par expéditeur : il revient.
    Coller la fin d'une opération au début d'une autre fabriquerait une
    opération qui n'a jamais eu lieu."""

    def test_meme_numero_ecrit_deux_jours_plus_tard(self):
        boitier = Boitier()
        maintenant = datetime.now(timezone.utc)
        boitier.relever((4, pdu(FIN, 2, maintenant - timedelta(days=2))))
        boitier.relever((5, pdu(DEBUT, 1, maintenant - timedelta(minutes=5))))
        self.assertEqual(len(boitier.sms()), 2)

    def test_meme_place_autre_texte(self):
        boitier = Boitier()
        ecrit = datetime.now(timezone.utc) - timedelta(minutes=30)
        boitier.relever((4, pdu(FIN, 2, ecrit)))
        autre_fin = FIN.replace("150000", "275000")
        boitier.relever((5, pdu(DEBUT, 1, ecrit)), (6, pdu(autre_fin, 2, ecrit)))
        lignes = boitier.sms()
        self.assertEqual(len(lignes), 2)
        self.assertNotIn("275000", lignes[0][1])

    def test_au_dela_de_sept_jours_on_ne_cherche_plus(self):
        boitier = Boitier()
        ecrit = datetime.now(timezone.utc) - timedelta(days=8)
        boitier.relever((4, pdu(FIN, 2, ecrit)))
        il_y_a_huit_jours = (datetime.now(timezone.utc) - timedelta(days=8)
                             ).isoformat(timespec="seconds")
        boitier.journal.conn.execute("UPDATE morceaux SET vu_le = ?",
                                     (il_y_a_huit_jours,))
        boitier.relever((5, pdu(DEBUT, 1, ecrit)))
        self.assertEqual(len(boitier.sms()), 2)


class SansHeureEcriteOnNeRecolleQueDansLHeure(unittest.TestCase):
    def setUp(self):
        self.journal = Journal(":memory:")
        self.maintenant = datetime.now(timezone.utc)

    def _vu(self, il_y_a):
        return (self.maintenant - il_y_a).isoformat(timespec="seconds")

    def test_dans_l_heure(self):
        self.assertTrue(self.journal._du_meme_message(
            None, [(None, self._vu(timedelta(minutes=30)))], self.maintenant))

    def test_passee_l_heure(self):
        self.assertFalse(self.journal._du_meme_message(
            None, [(None, self._vu(timedelta(hours=2)))], self.maintenant))

    def test_une_heure_illisible_ne_prouve_rien(self):
        self.assertFalse(self.journal._du_meme_message(
            "pas une heure", [("2026-10-17T08:10:00+01:00", self._vu(timedelta(0)))],
            self.maintenant))


class UnJournalAncienNeRetientRien(unittest.TestCase):
    def test_un_journal_en_panne_laisse_partir_le_morceau(self):
        """Le recollage ne doit jamais coûter un SMS : s'il échoue, le
        morceau part comme avant, seul et dit incomplet."""
        boitier = Boitier()
        ecrit = datetime.now(timezone.utc) - timedelta(minutes=30)

        def panne(*_a, **_k):
            raise OSError("disque plein")
        boitier.journal.message_coupe = panne
        boitier.relever((4, pdu(FIN, 2, ecrit)))
        boitier.relever((5, pdu(DEBUT, 1, ecrit)))
        self.assertEqual(len(boitier.sms()), 2)   # deux moitiés, rien de perdu


if __name__ == "__main__":
    unittest.main()
