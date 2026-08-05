# -*- coding: utf-8 -*-
"""La relecture des SMS passés quand le lecteur s'améliore.

Le bug vécu : la ligne Orange passe en anglais, une mise à jour apprend au
lecteur la forme « Successful transfer from … to … » — mais les messages déjà
transmis restaient à moitié lus pour toujours, car le robot ne réécrit jamais
une ligne envoyée. Désormais : l'empreinte du lecteur est mémorisée, et dès
qu'elle change, tous les SMS repartent dans la file du cloud, où chacun est
relu au moment de l'envoi et sa ligne mise à jour (« merge »).

Lancer :  python3 -m unittest tests.test_relecture
"""

import unittest

from totem.app import Robot
from totem.compte import Compte
from totem.nuage import Nuage
from totem.simulator import ModemSimule
from totem.storage import Journal

TRANSFERT_EN = (
    "Successful transfer from 696413104 IBRAHIM DAHIROU to 696103864 "
    "WONDER PHONE. Details: Transaction ID: PP260805.1402.C55918, "
    "Transaction amount: 1300000 FCFA, Charges: 0 FCFA, Commission: 0 FCFA, "
    "Net amount :1300000 FCFA, New balance: 6335788.6 FCFA.")


class TransportMuet:
    def envoyer(self, *a, **k):
        return 1

    def envoyer_fichier(self, *a, **k):
        return True

    def publier_commandes(self, *a, **k):
        pass

    def vider_backlog(self):
        pass

    def recevoir(self):
        return []

    def role(self, utilisateur):
        return "admin"


def _robot(journal):
    return Robot([Compte(ModemSimule("Orange"), "Orange")], TransportMuet(),
                 journal)


class TestLaMemoire(unittest.TestCase):
    def test_memo_absent_puis_ecrit_puis_relu(self):
        journal = Journal(":memory:")
        self.assertIsNone(journal.lire_memo("empreinte_lecteur"))
        journal.ecrire_memo("empreinte_lecteur", "abc")
        self.assertEqual(journal.lire_memo("empreinte_lecteur"), "abc")
        journal.ecrire_memo("empreinte_lecteur", "def")
        self.assertEqual(journal.lire_memo("empreinte_lecteur"), "def")

    def test_remettre_a_transmettre_ne_compte_que_les_transmis(self):
        journal = Journal(":memory:")
        un = journal.sms("OrangeMoney", TRANSFERT_EN)
        journal.sms("OrangeMoney", "un autre, jamais parti")
        journal.marquer_sms_envoyes([un])
        self.assertEqual(journal.remettre_sms_a_transmettre(), 1)
        self.assertEqual(len(journal.sms_non_envoyes()), 2)


class TestLeDemarrage(unittest.TestCase):
    def test_un_lecteur_change_remet_les_sms_en_file(self):
        journal = Journal(":memory:")
        identifiant = journal.sms("OrangeMoney", TRANSFERT_EN)
        journal.marquer_sms_envoyes([identifiant])
        journal.ecrire_memo("empreinte_lecteur", "une-autre-version")
        _robot(journal)
        self.assertEqual(len(journal.sms_non_envoyes()), 1)
        evenements = [ligne[-1] for ligne in journal.evenements_non_envoyes(10)]
        self.assertTrue(any("relu" in t or "re-read" in t for t in evenements),
                        evenements)

    def test_un_lecteur_inchange_ne_retransmet_rien(self):
        journal = Journal(":memory:")
        identifiant = journal.sms("OrangeMoney", TRANSFERT_EN)
        journal.marquer_sms_envoyes([identifiant])
        _robot(journal)                       # première vue : empreinte posée
        journal.marquer_sms_envoyes([identifiant])
        _robot(journal)                       # même lecteur : rien ne bouge
        self.assertEqual(len(journal.sms_non_envoyes()), 0)

    def test_une_base_vierge_pose_l_empreinte_sans_bruit(self):
        journal = Journal(":memory:")
        _robot(journal)
        self.assertIsNotNone(journal.lire_memo("empreinte_lecteur"))
        evenements = [ligne[-1] for ligne in journal.evenements_non_envoyes(10)]
        self.assertFalse(any("relu" in t or "re-read" in t for t in evenements))


class TestLaRetransmission(unittest.TestCase):
    def test_les_paiements_partent_en_merge(self):
        """Sans « merge », une ligne retransmise serait ignorée par le cloud
        et la relecture ne servirait à rien."""
        journal = Journal(":memory:")
        journal.sms("OrangeMoney", TRANSFERT_EN)
        nuage = Nuage("https://exemple.supabase.co", "cle", "totem", journal)
        vus = []

        def espion(table, charge, cle_unicite, resolution):
            vus.append((table, resolution, charge))
            return "ok"

        nuage._tenter_insert = espion
        nuage.pousser_paiements()
        self.assertEqual(len(vus), 1)
        table, resolution, charge = vus[0]
        self.assertEqual(table, "paiements")
        self.assertEqual(resolution, "merge-duplicates")
        # La relecture au moment de l'envoi : le transfert anglais est compris
        self.assertEqual(charge[0]["montant"], 1300000)
        self.assertEqual(charge[0]["categorie"], "transfert")
        # Et rien de ce que la plateforme pose elle-même n'est écrasé
        self.assertNotIn("nature", charge[0])
        self.assertNotIn("lu_le", charge[0])


if __name__ == "__main__":
    unittest.main()
