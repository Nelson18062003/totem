# -*- coding: utf-8 -*-
"""Tests du pont vers le cloud, contre un faux Supabase local.

On ne teste pas Supabase — on teste notre comportement face à lui : que la
file d'attente se vide quand le réseau revient, qu'une coupure ne perde rien,
et qu'un envoi rejoué ne crée pas de doublon.
"""

import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from totem.nuage import Nuage
from totem.storage import Journal


class FauxSupabase(BaseHTTPRequestHandler):
    """Imite l'API REST de Supabase : accepte les insertions, les mémorise,
    et sait aussi tomber en panne sur commande."""

    recu = []           # toutes les lignes reçues, par table
    supprimes = []      # les chemins des DELETE reçus (ménage des raccourcis)
    en_panne = False
    refuser_texte = None  # sous-chaîne : tout lot la contenant est rejeté (400)
    code_refus = None   # la base refuse TOUT avec ce code (401, 403, 429…)
    colonnes_absentes = set()  # colonnes que la base n'a pas (défaut PGRST204)

    def do_POST(self):
        if FauxSupabase.en_panne:
            self.send_error(503)
            return
        if FauxSupabase.code_refus is not None:
            # Une clé changée, une règle d'accès qui refuse, un débit trop
            # rapide : la base dit non à TOUT, quelle que soit la ligne.
            self.send_error(FauxSupabase.code_refus, "acces refuse")
            return
        taille = int(self.headers.get("Content-Length", 0))
        corps = json.loads(self.rfile.read(taille) or b"[]")
        # Une base à qui il manque une colonne refuse tant qu'on la lui envoie,
        # avec le code PGRST204 — et accepte dès qu'on ne l'envoie plus. C'est
        # exactement ce que fait une base pas encore migrée.
        for col in FauxSupabase.colonnes_absentes:
            if any(col in l for l in corps):
                msg = (f'{{"code":"PGRST204","message":"Could not find the '
                       f"'{col}' column of 'paiements' in the schema cache\"}}"
                       ).encode()
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
                return
        # Une donnée que la base rejette pour de bon (type invalide…) : 4xx.
        if FauxSupabase.refuser_texte is not None and any(
                FauxSupabase.refuser_texte in (l.get("texte") or "") for l in corps):
            self.send_error(400, "donnee refusee")
            return
        table = self.path.lstrip("/").split("?")[0].replace("rest/v1/", "")
        FauxSupabase.recu.append((table, corps))
        self.send_response(201)
        self.end_headers()

    patches = []            # les chemins des PATCH reçus, dans l'ordre
    deja_prises = set()     # les demandes qu'un autre robot a déjà prises

    def do_PATCH(self):
        if FauxSupabase.en_panne:
            self.send_error(503)
            return
        taille = int(self.headers.get("Content-Length", 0))
        corps = json.loads(self.rfile.read(taille) or b"{}")
        FauxSupabase.patches.append((self.path, corps))

        # LA SÉMANTIQUE QUI COMPTE. Un PATCH conditionnel — « …&etat=eq.
        # en_attente » — ne modifie AUCUNE ligne si la condition ne tient
        # plus, et PostgREST rend alors un tableau VIDE. C'est ainsi qu'un
        # robot apprend qu'un autre est passé avant lui.
        conditionnel = "etat=eq.en_attente" in self.path
        identifiant = None
        for morceau in self.path.split("?")[-1].split("&"):
            if morceau.startswith("id=eq."):
                identifiant = morceau[len("id=eq."):]
        touchees = ([] if conditionnel and identifiant in FauxSupabase.deja_prises
                    else [{"id": identifiant, **corps}])

        charge = json.dumps(touchees).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(charge)))
        self.end_headers()
        self.wfile.write(charge)

    def do_DELETE(self):
        if FauxSupabase.en_panne:
            self.send_error(503)
            return
        FauxSupabase.supprimes.append(self.path)
        self.send_response(204)
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
        FauxSupabase.patches = []
        FauxSupabase.deja_prises = set()
        FauxSupabase.en_panne = False
        FauxSupabase.refuser_texte = None
        FauxSupabase.code_refus = None
        FauxSupabase.colonnes_absentes = set()
        self.journal = Journal(":memory:")
        self.nuage = Nuage(f"http://127.0.0.1:{self.port}", "fausse-cle",
                           "douala", self.journal)

    def _lignes(self, table):
        return [l for t, corps in FauxSupabase.recu if t == table for l in corps]

    # --- la prise en charge d'une demande ---
    #
    # C'est le seul canal par lequel le monde extérieur fait composer un code
    # sur une vraie carte SIM. Se tromper ici, c'est de l'argent.

    def test_reclamer_pose_la_condition_dans_la_requete(self):
        """La condition doit voyager AVEC le PATCH, pas avant lui.

        La lire d'abord puis écrire ensuite laisserait la place, entre les
        deux, à l'autre robot. C'est la base qui doit trancher, en une seule
        requête — elle seule voit les deux."""
        self.assertTrue(self.nuage.reclamer(42))
        chemin, corps = FauxSupabase.patches[-1]
        self.assertIn("commandes?id=eq.42", chemin)
        self.assertIn("etat=eq.en_attente", chemin)
        self.assertEqual(corps, {"etat": "en_cours"})

    def test_une_demande_deja_prise_se_reconnait(self):
        """Aucune ligne modifiée : un autre robot l'a eue."""
        FauxSupabase.deja_prises = {"42"}
        self.assertFalse(self.nuage.reclamer(42))

    def test_le_nuage_muet_ne_donne_pas_la_demande(self):
        """Dans le doute, on ne compose pas.

        Ne rien faire se rattrape au tour suivant ; composer deux fois un
        transfert, jamais."""
        FauxSupabase.en_panne = True
        self.assertFalse(self.nuage.reclamer(42))

    def test_une_ecriture_ratee_se_dit(self):
        """`commande_maj` rend False quand elle n'a pas abouti — c'est cette
        réponse qui protège le code confidentiel (voir pilotage)."""
        FauxSupabase.en_panne = True
        self.assertFalse(self.nuage.commande_maj(7, {"etat": "faite"}))
        FauxSupabase.en_panne = False
        self.assertTrue(self.nuage.commande_maj(7, {"etat": "faite"}))

    # --- configuration ---
    def test_inerte_sans_configuration(self):
        """Sans URL ni clé, le pont ne fait rien — le robot est inchangé."""
        muet = Nuage("", "", "douala", self.journal)
        self.assertFalse(muet.actif)
        self.assertIsNone(muet.demarrer())
        self.assertEqual(muet.resume(), "cloud disabled")

    def test_le_resume_parle_aussi_francais(self):
        from totem import textes
        muet = Nuage("", "", "douala", self.journal)
        textes.definir_langue("fr")
        try:
            self.assertEqual(muet.resume(), "cloud désactivé")
            self.assertEqual(self.nuage.resume(), "cloud à jour")
        finally:
            textes.definir_langue("en")

    # --- identité du terminal ---
    def test_le_terminal_annonce_sa_version(self):
        """Savoir, depuis n'importe où, quel code tourne sur le Pi.

        C'est ce qui distingue « le correctif n'existe pas » de « le
        correctif existe mais n'est pas déployé » — deux situations qui se
        ressemblent exactement vues de loin."""
        from totem.version import version

        self.assertTrue(self.nuage.enregistrer_terminal({"disque": "42 %"}))
        ligne = self._lignes("terminaux")[-1]
        self.assertEqual(ligne["version"], version())
        self.assertTrue(ligne["version"])
        self.assertEqual(ligne["id"], "douala")

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

    def test_heure_reseau_et_categorie_partent_au_cloud(self):
        # G2 + catégorie : l'heure réseau (TP-SCTS) et la catégorie devinée
        # accompagnent chaque SMS jusqu'au cloud.
        self.journal.sms(
            "OrangeMoney",
            "Vous avez recu 25000 FCFA de NGONO Marie (677123456)",
            "Orange", emis_le="2026-08-02T13:45:00+01:00")
        self.assertEqual(self.nuage.pousser_paiements(), 1)
        (ligne,) = self._lignes("paiements")
        self.assertEqual(ligne["categorie"], "encaissement")
        self.assertIn("13:45", ligne["emis_le"])

    def test_sms_sans_heure_reseau_retombe_sur_la_releve(self):
        # Mode texte / vieux SMS : pas d'heure réseau → emis_le nul, le web
        # retombera sur recu_le. Rien ne casse.
        self.journal.sms("Papa", "Rappelle-moi", "MTN")   # emis_le par défaut None
        self.assertEqual(self.nuage.pousser_paiements(), 1)
        (ligne,) = self._lignes("paiements")
        self.assertIsNone(ligne["emis_le"])
        self.assertEqual(ligne["categorie"], "message")

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
        self.assertIn("waiting", self.nuage.resume())

        FauxSupabase.en_panne = False                          # le réseau revient
        self.assertEqual(self.nuage.pousser_paiements(), 1)
        self.assertEqual(self.journal.reste_a_envoyer(), 0)
        self.assertEqual(self.nuage.resume(), "cloud up to date")

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

    # --- une ligne refusée ne bloque pas les autres ---
    def test_un_paiement_refuse_ne_bloque_pas_les_suivants(self):
        """Le vrai incident : la base rejette UN SMS (donnée mal formée) et,
        avant, tout le lot restait coincé — la plateforme cessait d'afficher
        les nouveaux paiements alors que Telegram continuait de les recevoir.
        Désormais les bons passent, le fautif est mis de côté."""
        self.journal.sms("MoMo", "Vous avez recu 1000 FCFA de 677000111", "MTN")
        self.journal.sms("MoMo", "SMS EMPOISONNE que la base refuse", "MTN")
        self.journal.sms("MoMo", "Vous avez recu 3000 FCFA de 677000222", "MTN")
        FauxSupabase.refuser_texte = "EMPOISONNE"

        self.assertEqual(self.nuage.pousser_paiements(), 2)   # les deux bons
        # Plus aucun SMS en attente : la file est débloquée (le fautif est mis
        # de côté, pas laissé en travers).
        self.assertEqual(self.journal.sms_non_envoyes(100), [])
        textes = " ".join(l["texte"] for l in self._lignes("paiements"))
        self.assertIn("1000 FCFA", textes)
        self.assertIn("3000 FCFA", textes)
        self.assertNotIn("EMPOISONNE", textes)               # le fautif n'est pas passé

    def test_une_cle_refusee_ne_JETTE_PAS_les_paiements(self):
        """La panne qui effaçait la recette du jour, en silence.

        « refusé » voulait dire « cette ligne ne passera jamais » : on la
        marquait envoyée, donc on ne la représentait plus JAMAIS. Or une clé
        changée (401) ou une règle d'accès qui refuse (403) ne dit rien de la
        ligne — elle dit que la porte est fermée, pour tout le monde, et que
        ça se répare. Chaque paiement de la journée partait à la poubelle,
        cent par cycle, pendant que le propriétaire lisait « rien n'est
        perdu ».
        """
        for code in (401, 403, 429):
            with self.subTest(code=code):
                self.journal.sms("MoMo", f"Vous avez recu {code}0 FCFA de 677000111",
                                 "MTN")
                FauxSupabase.code_refus = code
                self.assertEqual(self.nuage.pousser_paiements(), 0)
                # RIEN n'est jeté : tout attend encore son tour.
                self.assertNotEqual(self.journal.sms_non_envoyes(100), [])

                # La porte rouvre : le paiement passe, entier.
                FauxSupabase.code_refus = None
                self.assertEqual(self.nuage.pousser_paiements(), 1)
                self.assertEqual(self.journal.sms_non_envoyes(100), [])
                textes = " ".join(l["texte"] for l in self._lignes("paiements"))
                self.assertIn(f"{code}0 FCFA", textes)

    def test_le_paiement_refuse_est_signale_avec_l_erreur(self):
        self.journal.sms("MoMo", "SMS EMPOISONNE", "MTN")
        FauxSupabase.refuser_texte = "EMPOISONNE"
        self.nuage.pousser_paiements()
        evenements = " ".join(e[2] for e in self.journal.evenements_non_envoyes(10))
        self.assertIn("refused by the cloud", evenements)
        self.assertIn("400", evenements)                     # l'erreur exacte de la base

    def test_un_refus_previent_le_proprietaire(self):
        # Le propriétaire doit l'apprendre (sur Telegram, via ce rappel), avec
        # l'erreur exacte — pas chercher en vain pourquoi un SMS n'apparaît pas.
        incidents = []
        self.nuage.sur_incident = lambda sid, err: incidents.append((sid, err))
        self.journal.sms("MoMo", "SMS EMPOISONNE", "MTN")
        FauxSupabase.refuser_texte = "EMPOISONNE"
        self.nuage.pousser_paiements()
        self.assertEqual(len(incidents), 1)
        self.assertIn("400", incidents[0][1])

    def test_colonne_manquante_laisse_passer_le_sms_quand_meme(self):
        """L'incident réel : la colonne 'expediteur' manquait à la base, et plus
        AUCUN SMS ne s'affichait. Désormais le robot retire la colonne absente
        et enregistre le SMS sans elle : le message arrive, quitte à perdre une
        info d'enrichissement. Le texte, lui, passe toujours."""
        incidents = []
        self.nuage.sur_incident = lambda sid, err: incidents.append(err)
        self.journal.sms("MoMo", "Vous avez recu 1000 FCFA de 677000111", "MTN")
        FauxSupabase.colonnes_absentes = {"expediteur"}

        self.assertEqual(self.nuage.pousser_paiements(), 1)       # le SMS EST passé
        self.assertEqual(self.journal.sms_non_envoyes(100), [])   # rien en attente
        self.assertEqual(incidents, [])                           # pas d'alerte : ce n'est pas une panne
        ligne = self._lignes("paiements")[0]
        self.assertNotIn("expediteur", ligne)                    # la colonne absente a été retirée
        self.assertIn("1000 FCFA", ligne["texte"])               # le texte, lui, est bien là

    def test_plusieurs_colonnes_absentes_le_sms_arrive_et_c_est_noté(self):
        """Une base en retard de plusieurs versions (ni expediteur, ni categorie,
        ni emis_le) : le robot les retire une à une et enregistre quand même le
        SMS. L'événement le note une fois, pour inviter à migrer, sans alarmer."""
        self.journal.sms("MoMo", "Depot de 10000 FCFA reussi", "MTN")
        FauxSupabase.colonnes_absentes = {"expediteur", "categorie", "emis_le"}

        self.assertEqual(self.nuage.pousser_paiements(), 1)
        ligne = self._lignes("paiements")[0]
        for absente in ("expediteur", "categorie", "emis_le"):
            self.assertNotIn(absente, ligne)
        self.assertIn("10000 FCFA", ligne["texte"])
        # Le journal en garde une trace lisible (une fois), mentionnant la migration.
        traces = " ".join(t for _id, _date, t in
                          self.journal.evenements_non_envoyes(100))
        self.assertIn("migration", traces.lower())

    def test_colonne_essentielle_absente_garde_tout_et_alerte(self):
        """Si c'est le TEXTE du SMS qui manque à la base — un vrai défaut de
        structure, pas un simple retard — on ne bricole pas : on garde tout et
        on alerte, comme avant."""
        incidents = []
        self.nuage.sur_incident = lambda sid, err: incidents.append(err)
        self.journal.sms("MoMo", "Vous avez recu 1000 FCFA de 677000111", "MTN")
        FauxSupabase.colonnes_absentes = {"texte"}

        self.assertEqual(self.nuage.pousser_paiements(), 0)
        self.assertNotEqual(self.journal.sms_non_envoyes(100), [])  # gardé
        self.assertEqual(len(incidents), 1)                          # et alerté
        self.assertIn("PGRST204", incidents[0])

    def test_une_coupure_ne_met_rien_en_quarantaine(self):
        """Si TOUT échoue par coupure réseau (5xx), rien n'est mis de côté :
        on garde tout et on réessaiera. Une panne de nuit ne perd pas un SMS."""
        self.journal.sms("MoMo", "Vous avez recu 1000 FCFA de 677000111", "MTN")
        FauxSupabase.en_panne = True
        self.assertEqual(self.nuage.pousser_paiements(), 0)
        self.assertEqual(self.journal.reste_a_envoyer(), 1)  # gardé, pas quarantiné

    def test_un_evenement_refuse_ne_bloque_pas_les_suivants(self):
        # M1 : la reprise ligne par ligne vaut AUSSI pour les événements, pas
        # seulement les paiements. Un événement empoisonné ne gèle plus la file.
        self.journal.evenement("evenement A")
        self.journal.evenement("POISON evenement")
        self.journal.evenement("evenement C")
        FauxSupabase.refuser_texte = "POISON"
        self.assertEqual(self.nuage.pousser_evenements(), 2)
        textes = " ".join(l["texte"] for l in self._lignes("evenements"))
        self.assertIn("evenement A", textes)
        self.assertIn("evenement C", textes)
        self.assertNotIn("POISON", textes)

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

    def test_l_heure_envoyee_porte_son_fuseau(self):
        # G1 : une heure naïve stockée en timestamptz serait lue en UTC, puis
        # ré-affichée en heure de Douala → une heure de trop. On envoie donc
        # toujours l'offset. « now » comme une date du journal.
        from totem.nuage import _horodatage
        self.assertRegex(_horodatage(), r"[+-]\d\d:\d\d$")
        self.assertRegex(_horodatage("2026-08-02T13:45:00"),
                         r"^2026-08-02T13:45:00[+-]\d\d:\d\d$")


if __name__ == "__main__":
    unittest.main()


class TestReveilImmediat(unittest.TestCase):
    """Un paiement connu ne doit pas attendre le prochain battement.

    Le pont dormait une minute fixe entre deux tournées. Le Pi savait donc
    qu'un encaissement venait d'arriver et le gardait pour lui — un délai
    qu'on s'infligeait sans raison. Le battement subsiste, mais comme filet :
    il rejoue ce qu'une coupure a retenu et sert de signe de vie.
    """

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
        FauxSupabase.patches = []
        FauxSupabase.deja_prises = set()
        FauxSupabase.en_panne = False
        self.journal = Journal(":memory:")
        # Battement volontairement très long : si la ligne part quand même,
        # c'est que le réveil a fonctionné et non le sommeil qui s'achève.
        self.nuage = Nuage(f"http://127.0.0.1:{self.port}", "fausse-cle",
                           "douala", self.journal, pause=3600)

    def tearDown(self):
        self.nuage.arreter()

    def _attendre_paiements(self, combien, delai=15):
        fin = time.monotonic() + delai
        while time.monotonic() < fin:
            lignes = [l for t, corps in FauxSupabase.recu
                      if t == "paiements" for l in corps]
            if len(lignes) >= combien:
                return lignes
            time.sleep(0.05)
        return [l for t, corps in FauxSupabase.recu
                if t == "paiements" for l in corps]

    def test_un_sms_arrive_apres_le_demarrage_part_sans_attendre(self):
        self.nuage.demarrer()
        self._attendre_paiements(0, delai=2)      # laisser la 1re tournée finir
        self.journal.sms("MobileMoney",
                         "Vous avez recu 25 000 FCFA de NGONO Marie.", "MTN")
        self.nuage.reveiller()
        lignes = self._attendre_paiements(1)
        self.assertEqual(len(lignes), 1)
        self.assertEqual(lignes[0]["montant"], 25000)

    def test_trois_arrivees_rapprochees_partent_ensemble(self):
        """Le drapeau se pose une fois : trois SMS coup sur coup ne doivent
        pas ouvrir trois connexions."""
        self.nuage.demarrer()
        self._attendre_paiements(0, delai=2)
        avant = len(FauxSupabase.recu)
        for i in range(3):
            self.journal.sms("MobileMoney",
                             f"Vous avez recu {i + 1} 000 FCFA de Client.", "MTN")
            self.nuage.reveiller()
        self.assertEqual(len(self._attendre_paiements(3)), 3)
        requetes = len(FauxSupabase.recu) - avant
        self.assertLessEqual(requetes, 2, "un lot, pas une requête par SMS")

    def test_arreter_ne_bloque_pas_sur_le_battement(self):
        """Sans réveil à l'arrêt, le fil resterait endormi une heure."""
        fil = self.nuage.demarrer()
        self._attendre_paiements(0, delai=2)
        self.nuage.arreter()
        fil.join(timeout=10)
        self.assertFalse(fil.is_alive())


class TestRaccourcisVersLeCloud(unittest.TestCase):
    """Le carnet des boutons appris, poussé jusqu'à la plateforme.

    Ce qui s'apprend une fois sur Telegram (💾) doit devenir un bouton
    partout : c'est le chemin prévu pour équiper un nouvel opérateur —
    MTN aujourd'hui, un autre demain — sans toucher au code source.
    """

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
        FauxSupabase.supprimes = []
        FauxSupabase.en_panne = False
        FauxSupabase.refuser_texte = None
        FauxSupabase.code_refus = None
        FauxSupabase.colonnes_absentes = set()
        self.journal = Journal(":memory:")
        self.nuage = Nuage(f"http://127.0.0.1:{self.port}", "fausse-cle",
                           "douala", self.journal)

    def lots(self, table):
        return [l for t, corps in FauxSupabase.recu if t == table for l in corps]

    def test_le_carnet_part_entier_puis_le_menage(self):
        self.journal.ajouter_raccourci("MTN", "solde", "Solde", ["*126#", "5", "1"])
        self.journal.ajouter_raccourci("Orange", "depot", "Dépôt", ["#148*2#"])
        self.assertTrue(self.nuage.publier_raccourcis())
        lignes = self.lots("raccourcis")
        self.assertEqual(len(lignes), 2)
        par_nom = {l["nom"]: l for l in lignes}
        self.assertEqual(par_nom["solde"]["operateur"], "MTN")
        self.assertEqual(par_nom["solde"]["etapes"], "*126#,5,1")
        self.assertEqual(par_nom["depot"]["terminal"], "douala")
        # Le ménage suit la poussée : ce qui n'a pas été rafraîchi disparaît.
        self.assertEqual(len(FauxSupabase.supprimes), 1)
        self.assertIn("terminal=eq.douala", FauxSupabase.supprimes[0])
        self.assertIn("maj=lt.", FauxSupabase.supprimes[0])

    def test_rien_ne_repart_tant_que_le_carnet_ne_change_pas(self):
        self.journal.ajouter_raccourci("MTN", "solde", "Solde", ["*126#", "5"])
        self.assertTrue(self.nuage.publier_raccourcis())
        avant = len(FauxSupabase.recu)
        self.assertTrue(self.nuage.publier_raccourcis())
        self.assertEqual(len(FauxSupabase.recu), avant,
                         "un carnet inchangé n'a rien à repousser")

    def test_une_suppression_locale_repousse_le_carnet(self):
        self.journal.ajouter_raccourci("MTN", "solde", "Solde", ["*126#", "5"])
        self.journal.ajouter_raccourci("MTN", "depot", "Dépôt", ["*126#", "1"])
        self.assertTrue(self.nuage.publier_raccourcis())
        self.journal.supprimer_raccourci("MTN", "depot")
        self.assertTrue(self.nuage.publier_raccourcis())
        # La seconde poussée ne porte plus que « solde » ; le DELETE qui la
        # suit efface « depot » du cloud (sa date n'a pas été rafraîchie).
        derniers = FauxSupabase.recu[-1][1]
        self.assertEqual([l["nom"] for l in derniers], ["solde"])
        self.assertEqual(len(FauxSupabase.supprimes), 2)

    def test_une_panne_ne_fige_pas_le_carnet(self):
        self.journal.ajouter_raccourci("MTN", "solde", "Solde", ["*126#", "5"])
        FauxSupabase.en_panne = True
        self.assertFalse(self.nuage.publier_raccourcis())
        FauxSupabase.en_panne = False
        self.assertTrue(self.nuage.publier_raccourcis(),
                        "le retour du réseau doit relancer la poussée")
        self.assertEqual(len(self.lots("raccourcis")), 1)
