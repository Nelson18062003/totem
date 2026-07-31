# -*- coding: utf-8 -*-
"""Tests du pont vers le cloud, contre un faux Supabase local.

On ne teste pas Supabase — on teste notre comportement face à lui : que la
file d'attente se vide quand le réseau revient, qu'une coupure ne perde rien,
et qu'un envoi rejoué ne crée pas de doublon.
"""

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from totem.nuage import Nuage
from totem.storage import Journal


class FauxSupabase(BaseHTTPRequestHandler):
    """Imite l'API REST de Supabase : accepte les insertions, les mémorise,
    et sait aussi tomber en panne sur commande."""

    recu = []           # toutes les lignes reçues, par table
    en_panne = False

    def do_POST(self):
        if FauxSupabase.en_panne:
            self.send_error(503)
            return
        taille = int(self.headers.get("Content-Length", 0))
        corps = json.loads(self.rfile.read(taille) or b"[]")
        table = self.path.lstrip("/").split("?")[0].replace("rest/v1/", "")
        FauxSupabase.recu.append((table, corps))
        self.send_response(201)
        self.end_headers()

    def log_message(self, *args):
        pass            # silence pendant les tests


class TestNuage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.serveur = HTTPServer(("127.0.0.1", 0), FauxSupabase)
        cls.port = cls.serveur.server_address[1]
        threading.Thread(target=cls.serveur.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.serveur.shutdown()

    def setUp(self):
        FauxSupabase.recu = []
        FauxSupabase.en_panne = False
        self.journal = Journal(":memory:")
        self.nuage = Nuage(f"http://127.0.0.1:{self.port}", "fausse-cle",
                           "douala", self.journal)

    def _lignes(self, table):
        return [l for t, corps in FauxSupabase.recu if t == table for l in corps]

    # --- configuration ---
    def test_inerte_sans_configuration(self):
        """Sans URL ni clé, le pont ne fait rien — le robot est inchangé."""
        muet = Nuage("", "", "douala", self.journal)
        self.assertFalse(muet.actif)
        self.assertIsNone(muet.demarrer())
        self.assertEqual(muet.resume(), "cloud désactivé")

    # --- envoi ---
    def test_envoie_les_paiements_compris(self):
        self.journal.sms(
            "MobileMoney",
            "Vous avez recu 25 000 FCFA de NGONO Marie (677123456). "
            "Ref: PP0947. Nouveau solde: 872 500 FCFA.", "MTN")
        self.assertEqual(self.nuage.pousser_paiements(), 1)

        (ligne,) = self._lignes("paiements")
        self.assertEqual(ligne["terminal"], "douala")
        self.assertEqual(ligne["sens"], "entree")
        self.assertEqual(ligne["montant"], 25000)
        self.assertEqual(ligne["tiers"], "NGONO Marie")
        self.assertEqual(ligne["reference"], "PP0947")
        self.assertEqual(ligne["compte"], "MTN")
        # Le message d'origine part toujours : c'est lui qui fait foi.
        self.assertIn("25 000 FCFA", ligne["texte"])

    def test_sms_incompris_transmis_quand_meme(self):
        """Un SMS non reconnu n'est pas perdu : il part sans analyse."""
        self.journal.sms("Papa", "Rappelle-moi ce soir", "MTN")
        self.assertEqual(self.nuage.pousser_paiements(), 1)
        (ligne,) = self._lignes("paiements")
        self.assertIsNone(ligne["montant"])
        self.assertEqual(ligne["texte"], "Rappelle-moi ce soir")

    def test_rien_a_envoyer(self):
        self.assertEqual(self.nuage.pousser_paiements(), 0)
        self.assertEqual(FauxSupabase.recu, [])

    # --- hors ligne ---
    def test_coupure_reseau_ne_perd_rien(self):
        self.journal.sms("MobileMoney", "Vous avez recu 5 000 FCFA de 677000111", "MTN")
        FauxSupabase.en_panne = True

        self.assertEqual(self.nuage.pousser_paiements(), 0)   # échec silencieux
        self.assertEqual(self.journal.reste_a_envoyer(), 1)   # rien n'est perdu
        self.assertIsNotNone(self.nuage.derniere_erreur)
        self.assertIn("en attente", self.nuage.resume())

        FauxSupabase.en_panne = False                          # le réseau revient
        self.assertEqual(self.nuage.pousser_paiements(), 1)
        self.assertEqual(self.journal.reste_a_envoyer(), 0)
        self.assertEqual(self.nuage.resume(), "cloud à jour")

    def test_file_se_vide_dans_l_ordre(self):
        for i in range(3):
            self.journal.sms("MobileMoney", f"Vous avez recu {i+1}000 FCFA de 677000111", "MTN")
        self.nuage.pousser_paiements()
        montants = [l["montant"] for l in self._lignes("paiements")]
        self.assertEqual(montants, [1000, 2000, 3000])

    # --- doublons ---
    def test_pas_de_reenvoi_apres_succes(self):
        self.journal.sms("MobileMoney", "Vous avez recu 5 000 FCFA de 677000111", "MTN")
        self.assertEqual(self.nuage.pousser_paiements(), 1)
        self.assertEqual(self.nuage.pousser_paiements(), 0)   # déjà parti
        self.assertEqual(len(self._lignes("paiements")), 1)

    def test_identifiant_stable_pour_dedoublonnage(self):
        """Chaque ligne porte son identifiant local : la base peut ainsi
        ignorer un renvoi provoqué par une reprise après coupure."""
        self.journal.sms("MobileMoney", "Vous avez recu 5 000 FCFA de 677000111", "MTN")
        self.nuage.pousser_paiements()
        (ligne,) = self._lignes("paiements")
        self.assertEqual(ligne["source_id"], 1)
        self.assertEqual(ligne["terminal"], "douala")

    # --- événements ---
    def test_envoie_les_evenements(self):
        self.journal.evenement("démarrage (2 comptes)")
        self.assertEqual(self.nuage.pousser_evenements(), 1)
        (ligne,) = self._lignes("evenements")
        self.assertEqual(ligne["texte"], "démarrage (2 comptes)")

    # --- terminal ---
    def test_signe_de_vie(self):
        self.assertTrue(self.nuage.enregistrer_terminal({"resume": "52 °C"}))
        (ligne,) = self._lignes("terminaux")
        self.assertEqual(ligne["id"], "douala")
        self.assertIn("vu_le", ligne)


if __name__ == "__main__":
    unittest.main()
