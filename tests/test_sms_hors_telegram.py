# -*- coding: utf-8 -*-
"""LES SMS NE S'ANNONCENT PLUS SUR TELEGRAM — le reste, si.

Le téléphone du propriétaire sonnait DEUX fois pour chaque SMS : la
notification de l'application TOTEM, puis celle de Telegram (« 💰
Encaissement… »), et une troisième dix secondes plus tard pour le reçu PDF.
Il l'a demandé : sur Telegram, les autres nouvelles — pas les SMS.

Ce que ces essais gardent, robot construit SANS rien préciser (la conduite
de chaque installation dont la configuration ne dit rien) :

  — un SMS d'argent ne poste RIEN sur Telegram, mais il est journalisé, et
    il fait sonner l'application ;
  — son reçu se dépose sur la plateforme comme avant, et ne part pas sur
    Telegram ; rien ne s'accumule pour Telegram en attendant ;
  — un SMS d'argent que le lecteur n'a pas su lire déclenche encore une
    ALERTE (c'est une panne du lecteur, pas un SMS de plus) ;
  — le reçu d'un solde lu au menu part encore : c'est la réponse à un geste ;
  — rallumer l'annonce n'envoie pas d'un coup les reçus d'avant.

Et le témoin : rallumée, l'annonce part — sans quoi ces essais pourraient
« passer » sur un robot qui n'annonce plus rien du tout.

Lancer :  python3 -m unittest discover -s tests
"""

import os
import tempfile
import unittest

from totem import config
from totem.app import Robot
from totem.compte import Compte
from totem.simulator import ModemSimule
from totem.storage import Journal

from tests.test_depot_des_recus import FauxNuage
from tests.test_recus import TRANSFERT_ORANGE, TransportEspion, _distribuer

# Une opération dont le montant ne se lit pas : le lecteur la classe
# « illisible » (voir `test_lecture_robuste`).
ILLISIBLE = ("Depot vers 690933686 NGANGOM NOUBEWE reussi from 80684177. "
             "Frais: 0 FCFA, Nouveau Solde: 2768937.6 FCFA")


class TransportDesCanaux(TransportEspion):
    """Retient aussi le CANAL de chaque message : « encaissements » ou
    « alertes »."""

    def __init__(self):
        super().__init__()
        self.canaux = []

    def envoyer(self, texte, boutons=None, canal=None, silencieux=False):
        self.canaux.append(canal)
        return super().envoyer(texte, boutons=boutons, canal=canal,
                               silencieux=silencieux)


def robot(**kw):
    modem = ModemSimule("Orange")
    compte = Compte(modem, "Orange")
    journal = Journal(":memory:")
    transport = TransportDesCanaux()
    r = Robot([compte], transport, journal,
              numeros={"orange": "696103864"}, **kw)
    r.nuage = FauxNuage()
    sonneries = []
    r._faire_sonner = lambda *a, **k: sonneries.append((a, k))
    return r, compte, modem, journal, transport, sonneries


class TestLesSmsNePartentPlusSurTelegram(unittest.TestCase):

    def test_un_encaissement_ne_poste_rien_mais_sonne(self):
        r, compte, modem, journal, transport, sonneries = robot()
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        r._relever_sms(compte)
        self.assertEqual(transport.messages, [],
                         "un SMS ne doit plus s'annoncer sur Telegram")
        self.assertEqual(len(sonneries), 1, "l'application, elle, sonne")
        self.assertEqual(journal.conn.execute(
            "SELECT COUNT(*) FROM sms").fetchone()[0], 1,
            "le SMS est au journal, donc à la plateforme")

    def test_le_recu_se_depose_sans_partir_sur_telegram(self):
        r, compte, modem, journal, transport, _ = robot()
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        r._relever_sms(compte)
        _distribuer(r, journal)
        self.assertEqual(len(r.nuage.depots), 1, "la plateforme a le reçu")
        self.assertEqual(transport.fichiers, [],
                         "le reçu ne part pas sur Telegram")
        self.assertEqual(journal.recus_en_attente(), 0,
                         "rien ne s'accumule pour Telegram")

    def test_le_lecteur_en_defaut_alerte_encore(self):
        r, compte, modem, journal, transport, sonneries = robot()
        modem.sms_en_attente.append((1, "OrangeMoney", ILLISIBLE))
        r._relever_sms(compte)
        self.assertEqual(transport.canaux, ["alertes"],
                         "un SMS d'argent illisible est une panne du lecteur")
        self.assertIn("NGANGOM", transport.messages[0])

    def test_un_message_ordinaire_ne_poste_rien(self):
        r, compte, modem, journal, transport, sonneries = robot()
        modem.sms_en_attente.append((1, "MTN", "Votre forfait expire demain."))
        r._relever_sms(compte)
        self.assertEqual(transport.messages, [])
        self.assertEqual(len(sonneries), 1)

    def test_le_recu_d_un_solde_lu_au_menu_part_encore(self):
        r, compte, modem, journal, transport, _ = robot()
        for etape, nouveau in (("#150#", True), ("5", False), ("1", False)):
            r._ussd(compte, etape, nouveau=nouveau)
        _distribuer(r, journal)
        self.assertEqual(len(transport.fichiers), 1,
                         "le reçu d'un solde demandé n'est pas une annonce")

    def test_rallumer_n_envoie_pas_les_recus_d_avant(self):
        r, compte, modem, journal, transport, _ = robot()
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        r._relever_sms(compte)
        _distribuer(r, journal)
        r.sms_sur_telegram = True
        _distribuer(r, journal)
        self.assertEqual(transport.fichiers, [],
                         "les reçus d'avant ne partent pas d'un coup")


class TestLeTemoin(unittest.TestCase):
    """Rallumée, l'annonce part : la sonde voit bien Telegram."""

    def test_rallumee_l_annonce_et_le_recu_partent(self):
        r, compte, modem, journal, transport, sonneries = robot(
            sms_sur_telegram=True)
        modem.sms_en_attente.append((1, "OrangeMoney", TRANSFERT_ORANGE))
        r._relever_sms(compte)
        _distribuer(r, journal)
        self.assertEqual(transport.canaux, ["encaissements"])
        self.assertEqual(len(transport.fichiers), 1)
        self.assertEqual(len(sonneries), 1)


class TestLaConfiguration(unittest.TestCase):

    def _charger(self, ligne):
        with tempfile.TemporaryDirectory() as dossier:
            chemin = os.path.join(dossier, "totem.conf")
            with open(chemin, "w", encoding="utf-8") as f:
                f.write("[telegram]\njeton = x\nchat_id = 1\n[totem]\n" + ligne)
            os.chmod(chemin, 0o600)
            avant = list(config.CHEMINS)
            config.CHEMINS[:] = [chemin]
            try:
                return config.charger()
            finally:
                config.CHEMINS[:] = avant

    def test_eteinte_par_defaut(self):
        self.assertFalse(self._charger("")["sms_sur_telegram"])

    def test_se_rallume_d_un_mot(self):
        self.assertTrue(self._charger("sms_sur_telegram = oui\n")["sms_sur_telegram"])

    def test_le_fichier_d_exemple_se_charge(self):
        """Il écrit « oui » et « non » : recopié tel quel, il ne doit pas
        empêcher le robot de démarrer."""
        avant = list(config.CHEMINS)
        racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        config.CHEMINS[:] = [os.path.join(racine, "config.example.conf")]
        try:
            c = config.charger()
        finally:
            config.CHEMINS[:] = avant
        self.assertTrue(c["recus"])
        self.assertFalse(c["sms_sur_telegram"])


if __name__ == "__main__":
    unittest.main()
