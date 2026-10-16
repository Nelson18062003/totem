# -*- coding: utf-8 -*-
"""Chaque PDU relevé est gardé au journal du boîtier, tel que le modem l'a rendu.

POURQUOI. Des SMS longs arrivaient « incomplets » — « morceau(x) 2 sur 2
jamais reçu(s) » — et l'on ne pouvait rien en dire : le décodage jetait
l'en-tête de découpe et l'heure de chaque morceau. Le morceau manquant
n'était-il jamais venu, ou venu trop tard ? Deviner ne sert à rien ; il faut
la pièce. Le journal garde donc, pour chaque PDU : ses octets, son en-tête
(référence, total, position), l'heure écrite par l'opérateur, la première
relève qui l'a vu, la livraison de son message (complet ou non) et
l'effacement de sa place dans le modem.

Et quand un message part incomplet, le boîtier le dit au journal des
événements — sans un mot du SMS ni un numéro : ce journal monte au nuage et
se lit à plusieurs.
"""

import threading
import unittest
from datetime import datetime, timedelta, timezone

from totem.app import Robot
from totem.compte import Compte
from totem.modem import ModemSerie
from totem.storage import Journal

try:
    from test_pdu import fabriquer_pdu               # discover -s tests
except ImportError:                                  # python3 -m unittest tests.…
    from tests.test_pdu import fabriquer_pdu

# Même forme et même longueur que le CashOut Orange vu coupé en production
# (153 caractères, puis le reste) ; noms et numéros inventés.
CASHOUT = ("CashOut success to 690000001 NGONOKA from 690000002 BOUTIK ESSAI. "
           "The details are as follows: transaction amount: 198500 FCFA, "
           "charges: 0 FCFA, commission: 0 FCFA, TXN id :CO261015.0253.A12345")
DEBUT, FIN = CASHOUT[:153], CASHOUT[153:]


def _modem(*pdus):
    """Un ModemSerie sans matériel : AT+CMGL rend ces PDU, le reste « OK »."""
    m = ModemSerie.__new__(ModemSerie)
    m.verrou = threading.Lock()
    m.mode_pdu = True
    m._morceaux_vus = {}
    m.effaces = []
    lignes = "".join(f"+CMGL: {i},1,,{len(p) // 2}\r\n{p}\r\n" for i, p in pdus)

    def envoyer(commande, delai=10):
        if commande.startswith("AT+CMGD="):
            m.effaces.append(int(commande.split("=")[1]))
            return "\r\nOK\r\n"
        return lignes + "\r\nOK\r\n"
    m._envoyer = envoyer
    return m


def _robot(journal):
    robot = Robot.__new__(Robot)
    robot.journal = journal
    robot.nuage = None
    robot.recus = False
    robot._notifier_sms = lambda *a: None
    robot._annoncer_retour = lambda *a: None
    robot._noter = journal.evenement
    return robot


class LeModemRendLesPduTelsQuels(unittest.TestCase):
    def test_chaque_pdu_garde_son_en_tete_et_son_heure(self):
        quand = datetime(2026, 10, 15, 1, 53, 7, tzinfo=timezone.utc)
        modem = _modem(
            (4, fabriquer_pdu(DEBUT, "OrangeMoney", 77, 2, 1, quand=quand)),
            (5, fabriquer_pdu(FIN, "OrangeMoney", 77, 2, 2, quand=quand)))

        modem.lire_sms()

        releve = modem.derniere_releve
        self.assertEqual([r["emplacement"] for r in releve], [4, 5])
        self.assertEqual([(r["reference"], r["total"], r["position"]) for r in releve],
                         [(77, 2, 1), (77, 2, 2)])
        self.assertEqual(releve[0]["expediteur"], "OrangeMoney")
        self.assertEqual(releve[0]["heure_reseau"], "2026-10-15T01:53:07+00:00")
        # Les octets eux-mêmes : c'est la pièce, on la redécode à volonté.
        self.assertTrue(releve[0]["pdu"].startswith("00"))

    def test_un_pdu_illisible_garde_au_moins_ses_octets(self):
        modem = _modem((9, "00" + "F" * 40))

        modem.lire_sms()

        (trace,) = modem.derniere_releve
        self.assertEqual(trace["emplacement"], 9)
        self.assertEqual(trace["pdu"], "00" + "F" * 40)
        self.assertIsNone(trace["reference"])


class LeJournalGardeLaPreuve(unittest.TestCase):
    def setUp(self):
        self.journal = Journal(":memory:")

    def test_vu_livre_efface(self):
        self.journal.morceaux_vus("8923", "Orange ·0002", [
            {"emplacement": 4, "pdu": "AA", "reference": 77, "total": 2, "position": 1,
             "heure_reseau": "2026-10-15T01:53:07+01:00", "expediteur": "OrangeMoney"}])
        (m,) = self.journal.morceaux()
        self.assertEqual((m["reference"], m["total"], m["position"]), (77, 2, 1))
        self.assertIsNotNone(m["vu_le"])
        self.assertIsNone(m["livre_le"])

        self.journal.morceaux_livres("8923", [4], sms_id=12, complet=False)
        self.journal.morceaux_effaces("8923", [4])

        (m,) = self.journal.morceaux()
        self.assertEqual((m["sms_id"], m["complet"]), (12, 0))
        self.assertIsNotNone(m["livre_le"])
        self.assertIsNotNone(m["efface_le"])

    def test_revu_au_tour_suivant_garde_sa_premiere_vue(self):
        """`vu_le` dit combien de temps un morceau a attendu ses frères : il
        ne doit pas avancer à chaque relève."""
        trace = {"emplacement": 4, "pdu": "AA", "reference": 77, "total": 2, "position": 1}
        self.journal.morceaux_vus("8923", "Orange", [trace])
        self.journal.conn.execute("UPDATE morceaux SET vu_le = '2026-10-15T00:00:00+00:00'")
        self.journal.morceaux_vus("8923", "Orange", [trace])

        lignes = self.journal.morceaux()
        self.assertEqual(len(lignes), 1)
        self.assertEqual(lignes[0]["vu_le"], "2026-10-15T00:00:00+00:00")

    def test_une_place_reutilisee_ne_confond_pas_deux_morceaux(self):
        self.journal.morceaux_vus("8923", "Orange", [{"emplacement": 4, "pdu": "AA"}])
        self.journal.morceaux_livres("8923", [4], 1, True)
        self.journal.morceaux_effaces("8923", [4])
        self.journal.morceaux_vus("8923", "Orange", [{"emplacement": 4, "pdu": "BB"}])
        self.journal.morceaux_livres("8923", [4], 2, True)

        ancien, neuf = self.journal.morceaux()
        self.assertEqual((ancien["pdu"], ancien["sms_id"]), ("AA", 1))
        self.assertEqual((neuf["pdu"], neuf["sms_id"]), ("BB", 2))
        self.assertIsNone(neuf["efface_le"])

    def test_soixante_jours_puis_on_oublie(self):
        self.journal.morceaux_vus("8923", "Orange", [{"emplacement": 1, "pdu": "AA"}])
        vieux = (datetime.now(timezone.utc) - timedelta(days=61)).isoformat(timespec="seconds")
        self.journal.conn.execute("UPDATE morceaux SET vu_le = ?", (vieux,))
        self.journal.morceaux_vus("8923", "Orange", [{"emplacement": 2, "pdu": "BB"}])

        self.assertEqual([m["pdu"] for m in self.journal.morceaux()], ["BB"])


class LaReleveEcritLaPreuve(unittest.TestCase):
    def test_un_message_entier_est_vu_livre_et_efface(self):
        journal = Journal(":memory:")
        maintenant = datetime.now(timezone.utc)
        modem = _modem(
            (4, fabriquer_pdu(DEBUT, "OrangeMoney", 77, 2, 1, quand=maintenant)),
            (5, fabriquer_pdu(FIN, "OrangeMoney", 77, 2, 2, quand=maintenant)))
        compte = Compte(modem, "Orange")

        _robot(journal)._relever_sms(compte)

        morceaux = journal.morceaux()
        self.assertEqual(len(morceaux), 2)
        self.assertTrue(all(m["complet"] == 1 for m in morceaux))
        self.assertTrue(all(m["sms_id"] for m in morceaux))
        self.assertTrue(all(m["efface_le"] for m in morceaux))
        self.assertEqual(sorted(modem.effaces), [4, 5])

    def test_un_message_incomplet_se_dit_sans_rien_du_sms(self):
        journal = Journal(":memory:")
        ecrit = datetime.now(timezone.utc) - timedelta(minutes=40)
        modem = _modem((4, fabriquer_pdu(DEBUT, "OrangeMoney", 77, 2, 1, quand=ecrit)))
        compte = Compte(modem, "Orange")

        _robot(journal)._relever_sms(compte)

        (m,) = journal.morceaux()
        self.assertEqual(m["complet"], 0)
        evenements = [e[2] for e in journal.conn.execute(
            "SELECT * FROM evenements").fetchall()]
        incomplet = [e for e in evenements if "incomplet" in e]
        self.assertEqual(len(incomplet), 1, evenements)
        self.assertIn("1 morceau(x) sur 2", incomplet[0])
        self.assertIn("il y a 40 min", incomplet[0])
        # Rien du SMS : ni numéro, ni nom, ni montant.
        for interdit in ("690000001", "NGONOKA", "198500", "BOUTIK"):
            self.assertNotIn(interdit, incomplet[0])

    def test_un_journal_qui_refuse_ne_retient_aucun_sms(self):
        """La preuve ne doit jamais coûter un encaissement : si le journal
        ne sait pas ranger les morceaux, le SMS passe quand même."""
        journal = Journal(":memory:")

        def panne(*_a, **_k):
            raise OSError("disque plein")
        journal.morceaux_vus = panne
        journal.morceaux_livres = panne
        journal.morceaux_effaces = panne
        modem = _modem((3, fabriquer_pdu("Vous avez recu 15000 FCFA de 690000003.")))
        compte = Compte(modem, "MTN")

        _robot(journal)._relever_sms(compte)

        textes = [l[0] for l in journal.conn.execute("SELECT texte FROM sms")]
        self.assertEqual(len(textes), 1)
        self.assertIn("15000", textes[0])
        self.assertEqual(modem.effaces, [3])


if __name__ == "__main__":
    unittest.main()
