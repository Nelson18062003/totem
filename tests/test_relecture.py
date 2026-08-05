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


class TestLesVieuxRecus(unittest.TestCase):
    """L'icône de la plateforme sert le PDF archivé : un vieux reçu de solde
    y resterait pour toujours si le changement de lecteur ne le refaisait pas.
    """

    def _journal_avec_vieux_recu(self, nature=None):
        journal = Journal(":memory:")
        identifiant = journal.sms("OrangeMoney", TRANSFERT_EN)
        journal.marquer_sms_envoyes([identifiant])
        # L'état d'avant : le lecteur d'époque n'avait vu qu'un solde.
        journal.programmer_recu(identifiant, "solde", "TM-2026-0805-0075",
                                nature=nature)
        (ligne,) = journal.recus_a_envoyer(-60)
        journal.recu_envoye(ligne[0])
        journal.recu_archive(ligne[0])
        journal.ecrire_memo("empreinte_lecteur", "une-autre-version")
        return journal, ligne[0]

    def test_le_vieux_recu_de_solde_est_repris_en_transfert(self):
        journal, identifiant = self._journal_avec_vieux_recu()
        _robot(journal)
        genre, archive, envoye, numero = journal.conn.execute(
            "SELECT genre, archive, envoye, numero FROM recus WHERE id = ?",
            (identifiant,)).fetchone()
        self.assertEqual(genre, "transfert")
        self.assertEqual(archive, 0)      # l'archive du cloud sera refaite
        self.assertEqual(envoye, 1)       # Telegram, lui, n'est pas re-spammé
        self.assertEqual(numero, "TM-2026-0805-0075")   # même numéro
        evenements = [l[-1] for l in journal.evenements_non_envoyes(10)]
        self.assertTrue(any("reçu" in t or "receipt" in t for t in evenements),
                        evenements)

    def test_une_nature_choisie_a_la_main_ne_se_discute_pas(self):
        journal, identifiant = self._journal_avec_vieux_recu(nature="solde")
        _robot(journal)
        genre, archive = journal.conn.execute(
            "SELECT genre, archive FROM recus WHERE id = ?",
            (identifiant,)).fetchone()
        self.assertEqual(genre, "solde")
        self.assertEqual(archive, 1)

    def test_une_lecture_inchangee_ne_rearchive_rien(self):
        journal = Journal(":memory:")
        identifiant = journal.sms("OrangeMoney", TRANSFERT_EN)
        journal.programmer_recu(identifiant, "transfert", "TM-2026-0805-0001",
                                reference="PP260805.1402.C55918")
        (ligne,) = journal.recus_a_envoyer(-60)
        journal.recu_envoye(ligne[0])
        journal.recu_archive(ligne[0])
        journal.ecrire_memo("empreinte_lecteur", "une-autre-version")
        _robot(journal)
        archive = journal.conn.execute(
            "SELECT archive FROM recus WHERE id = ?",
            (ligne[0],)).fetchone()[0]
        self.assertEqual(archive, 1)

    def test_l_archive_refaite_est_un_transfert_sous_le_meme_numero(self):
        class FauxNuage:
            actif = True

            def __init__(self):
                self.archives = []

            def archiver_recu(self, nom, contenu, fiche=None):
                self.archives.append((nom, fiche))
                return True

        journal, identifiant = self._journal_avec_vieux_recu()
        robot = _robot(journal)
        robot.numeros = {"orange": "696103864"}
        robot.nuage = FauxNuage()
        robot._distribuer_recus()
        self.assertEqual(len(robot.nuage.archives), 1)
        nom, fiche = robot.nuage.archives[0]
        self.assertEqual(nom, "TM-2026-0805-0075.pdf")
        self.assertEqual(fiche["genre"], "transfert")
        self.assertEqual(fiche["montant"], 1300000)


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

    def test_le_sens_part_avec_les_numeros_du_robot(self):
        """Le robot prête ses numéros au nuage : la plateforme peut écrire
        « reçu » au lieu d'un éternel « sens à confirmer »."""
        journal = Journal(":memory:")
        journal.sms("OrangeMoney", TRANSFERT_EN)
        nuage = Nuage("https://exemple.supabase.co", "cle", "totem", journal)
        nuage.fournir_numeros = lambda: ("696103864",)
        vus = []
        nuage._tenter_insert = (
            lambda table, charge, cle, resolution: vus.append(charge) or "ok")
        nuage.pousser_paiements()
        self.assertEqual(vus[0][0]["sens"], "entree")
        self.assertEqual(vus[0][0]["tiers"], "IBRAHIM DAHIROU")

    def test_le_robot_prete_ses_numeros_au_nuage(self):
        journal = Journal(":memory:")
        nuage = Nuage("https://exemple.supabase.co", "cle", "totem", journal)
        robot = Robot([Compte(ModemSimule("Orange"), "Orange")],
                      TransportMuet(), journal, nuage=nuage,
                      numeros={"orange": "696103864"})
        self.assertIsNotNone(nuage.fournir_numeros)
        self.assertIn("696103864", nuage.fournir_numeros())

    def test_le_drainage_vide_la_file_en_un_battement(self):
        """Après une relecture, des centaines de SMS ne doivent pas partir au
        compte-gouttes d'un lot par minute."""
        journal = Journal(":memory:")
        for i in range(250):
            journal.sms("OrangeMoney", f"message numero {i}")
        nuage = Nuage("https://exemple.supabase.co", "cle", "totem", journal)
        appels = []

        def espion(table, charge, cle_unicite, resolution):
            appels.append((table, len(charge)))
            return "ok"

        nuage._tenter_insert = espion
        total = nuage._pousser_tout()
        self.assertEqual(total, 250)
        self.assertEqual(len(journal.sms_non_envoyes()), 0)
        lots = [n for (table, n) in appels if table == "paiements"]
        self.assertEqual(sorted(lots, reverse=True), [100, 100, 50])


if __name__ == "__main__":
    unittest.main()
