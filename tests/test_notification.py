"""Ce qu'une notification montre : le message reçu, en aperçu.

Une notification, c'est comme WhatsApp ou l'application SMS : on lit le
message depuis le volet, sans ouvrir l'application. On a un temps résumé le
SMS et masqué ses codes « pour l'écran verrouillé » ; personne ne l'avait
demandé, c'était une faute, retirée. Ces tests gardent le contraire de
jadis : le corps porte le texte REÇU, code compris. Deux garde-fous
demeurent, et aucun ne cache le message — on n'invente rien, et un SMS très
long est coupé (c'est un aperçu ; le journal garde l'entier).
"""

import json
import re
import urllib.parse
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import totem.app
from totem.app import Robot
from totem.notification import APERCU_MAX, composer, envoyer, lire_les_accuses
from totem.nuage import PAR_ENVOI, Nuage


class TexteDeLaNotification(unittest.TestCase):

    def test_le_corps_est_le_message_recu(self):
        sms = ("Vous avez recu 20 000 FCFA de NGONO Marie (677123456). "
               "Ref: PP240829. Nouveau solde: 412 500 FCFA.")
        titre, corps = composer("MTNMobileMoney", "MTN ·8901", sms)
        self.assertEqual(titre, "MTN ·8901")   # la carte concernée
        self.assertEqual(corps, sms)           # le message, tel quel

    def test_un_code_se_LIT_dans_la_notification(self):
        # Jadis on le masquait ici ; c'était la faute. Le propriétaire doit
        # pouvoir lire son code depuis le volet, comme avec WhatsApp.
        for sms, code in (
                ("Votre code est 483921. Ne le communiquez a personne.", "483921"),
                ("Your OTP: 45 67 89", "45 67 89"),
                ("Code de confirmation : 12-34-56", "12-34-56")):
            _, corps = composer("MTN", "MTN ·8901", sms)
            self.assertEqual(corps, sms)        # rien n'est retiré
            self.assertIn(code, corps)          # le code se lit
            self.assertNotIn("•", corps)        # aucun point de masque

    def test_un_SMS_tres_long_est_coupe_en_apercu(self):
        # Un aperçu, pas le journal : au-delà de la borne, on coupe, et on le
        # signale par une ellipse. C'est le SEUL raccourci qui subsiste.
        sms = "Detail. " * 60                    # bien au-delà de APERCU_MAX
        _, corps = composer("MTN", "MTN ·8901", sms)
        self.assertLessEqual(len(corps), APERCU_MAX)
        self.assertTrue(corps.endswith("…"), corps)
        self.assertTrue(sms.startswith(corps[:-1].rstrip()), corps)

    def test_les_sauts_de_ligne_sont_aplatis(self):
        # Le volet tient sur peu de lignes : on met le message à plat sans
        # rien retirer de ses mots.
        _, corps = composer("MTN", "MTN ·8901", "Ligne un.\n\nLigne deux.")
        self.assertEqual(corps, "Ligne un. Ligne deux.")

    def test_sans_texte_on_annonce_au_moins_l_arrivee(self):
        # Cas défensif : un SMS vide. On n'invente pas son contenu, mais on
        # dit qu'un message est arrivé.
        _, fr = composer("MTN", "MTN ·8901", "")
        _, en = composer("MTN", "MTN ·8901", None, anglais=True)
        self.assertEqual(fr, "Un message de MTN")
        self.assertEqual(en, "A message from MTN")


def faux_guichet(billets=None, statut=200, brut=None):
    """Un guichet d'Expo en carton, qui rend un VRAI corps.

    Le corps compte : c'est là qu'Expo range son verdict par appareil, et
    c'est précisément ce que l'ancien code ne lisait pas.
    """
    charge = brut if brut is not None else json.dumps(
        {"data": billets or []}).encode("utf-8")

    class Guichet:
        status = statut

        def read(soi):
            return charge

        def __enter__(soi):
            return soi

        def __exit__(soi, *args):
            return False

    return Guichet()


def avec_faux_guichet(faux_urlopen, faire):
    """Joue `faire` en remplaçant le guichet d'Expo, et le remet toujours."""
    import totem.notification as module
    vrai = module.urllib.request.urlopen
    module.urllib.request.urlopen = faux_urlopen
    try:
        return faire()
    finally:
        module.urllib.request.urlopen = vrai


class EnvoiDesNotifications(unittest.TestCase):

    def test_un_jeton_qui_n_est_pas_d_expo_est_ignore(self):
        # Rien ne part vers une adresse qu'on ne reconnaît pas.
        self.assertEqual(envoyer(["pas-un-jeton", "", None], "T", "C"), (0, []))

    def test_sans_appareil_rien_ne_part(self):
        self.assertEqual(envoyer([], "T", "C"), (0, []))

    def test_un_corps_vide_ne_part_pas(self):
        self.assertEqual(envoyer(["ExponentPushToken[abc]"], "T", ""), (0, []))

    def test_la_notification_part_en_haute_priorite(self):
        # LE RETARD DE TROIS À CINQ MINUTES venait d'ici : sans priorité,
        # l'envoi voyage en « normale », et Android ne réveille pas un
        # téléphone qui dort pour une priorité normale — il attend sa
        # prochaine fenêtre d'entretien. L'argent arrivait, le téléphone se
        # taisait, puis sonnait « en retard » sans que rien ne semble cassé.
        #
        # On capture donc CE QUI PART VRAIMENT, et on exige la haute
        # priorité et le canal. Un contrôle qui n'ouvrirait pas l'enveloppe
        # laisserait la faute revenir sans bruit.
        envois = []

        def faux_urlopen(requete, timeout=None):
            envois.append(json.loads(requete.data.decode("utf-8")))
            return faux_guichet([{"status": "ok", "id": "b1"}])

        servis, soucis = avec_faux_guichet(
            faux_urlopen, lambda: envoyer(["ExponentPushToken[abc]"], "Titre", "Corps"))

        self.assertEqual((servis, soucis), (1, []))
        (message,) = envois[0]
        self.assertEqual(message["priority"], "high")
        self.assertEqual(message["channelId"], "paiements")

    def test_un_billet_en_erreur_ne_compte_pas_pour_un_telephone_servi(self):
        """LA FAUTE QUE CE TEST GARDE, et elle a duré.

        Le compte faisait « servis += len(lot) » dès que la requête rendait
        200 — c'est-à-dire dès que le guichet avait accepté L'ENVELOPPE. Or
        Expo répond 200 puis range dans le corps un billet par appareil :
        « ce projet n'a pas de clé ». Un iPhone dont le projet Expo n'a pas
        de clé Apple comptait donc pour un appareil servi, à chaque
        paiement, pendant que rien ne sonnait.

        Le test qui existait ici validait la faute contre elle-même : son
        faux guichet rendait 200 SANS CORPS, et le code ne lisait pas le
        corps. Un contrôle qui n'ouvre pas l'enveloppe ne mesure rien.
        """
        def faux_urlopen(requete, timeout=None):
            return faux_guichet([
                {"status": "ok", "id": "b1"},
                {"status": "error", "message": "…",
                 "details": {"error": "InvalidCredentials"}},
            ])

        servis, soucis = avec_faux_guichet(faux_urlopen, lambda: envoyer(
            ["ExponentPushToken[un]", "ExponentPushToken[deux]"], "T", "C"))

        self.assertEqual(servis, 1)
        self.assertEqual(
            soucis, ["la clé du service de notification manque au projet"])

    def test_l_identifiant_du_billet_est_garde_pour_l_accuse(self):
        def faux_urlopen(requete, timeout=None):
            return faux_guichet([{"status": "ok", "id": "billet-1"}])

        billets = []
        avec_faux_guichet(faux_urlopen, lambda: envoyer(
            ["ExponentPushToken[un]"], "T", "C", acceptes=billets))
        self.assertEqual(billets, ["billet-1"])

    def test_une_reponse_illisible_ne_compte_personne(self):
        # Un guichet qui répond 200 avec du charabia n'a servi personne.
        def faux_urlopen(requete, timeout=None):
            return faux_guichet(brut=b"<html>maintenance</html>")

        servis, soucis = avec_faux_guichet(faux_urlopen, lambda: envoyer(
            ["ExponentPushToken[un]"], "T", "C"))
        self.assertEqual(servis, 0)
        self.assertEqual(len(soucis), 1)


class AccusesDeReception(unittest.TestCase):
    """LE REFUS D'APPLE N'EST ÉCRIT QUE DANS L'ACCUSÉ.

    Le guichet d'Expo accepte le billet ; c'est après qu'Apple refuse, quand
    le projet n'a pas de clé de notification. Le robot ne lisait jamais
    l'accusé : un iPhone muet comptait pour servi à chaque paiement.
    """

    def test_un_refus_d_apple_est_lu_et_dit_en_francais(self):
        demandes = []

        def faux_urlopen(requete, timeout=None):
            demandes.append(json.loads(requete.data.decode("utf-8")))
            corps = json.dumps({"data": {
                "b1": {"status": "ok"},
                "b2": {"status": "error", "details": {"error": "InvalidCredentials"}},
            }}).encode("utf-8")
            return faux_guichet(brut=corps)

        causes = avec_faux_guichet(faux_urlopen, lambda: lire_les_accuses(["b1", "b2", "b3"]))
        self.assertEqual(demandes[0], {"ids": ["b1", "b2", "b3"]})
        self.assertEqual(causes, ["la clé du service de notification manque au projet"])

    def test_un_guichet_muet_ne_dit_rien_de_plus(self):
        def faux_urlopen(requete, timeout=None):
            raise OSError("réseau coupé")

        self.assertEqual(avec_faux_guichet(faux_urlopen, lambda: lire_les_accuses(["b1"])), [])

    def test_sans_billet_on_ne_demande_rien(self):
        self.assertEqual(lire_les_accuses([]), [])

    def test_un_iphone_refuse_par_apple_n_est_plus_compte_servi(self):
        # Le chemin entier, dans le robot : le billet est accepté, l'accusé
        # le refuse — le journal doit dire « muets », pas « d'accord ».
        dit = threading.Event()
        vu = []
        vrais = (totem.app.envoyer, totem.app.lire_les_accuses, totem.app.ATTENTE_DES_ACCUSES)

        def faux_envoyer(jetons, titre, corps, ouvrir=None, acceptes=None,
                         injoignables=None):
            acceptes.append("b1")
            return 1, []

        totem.app.envoyer = faux_envoyer
        totem.app.lire_les_accuses = lambda b: ["la clé du service de notification manque au projet"]
        totem.app.ATTENTE_DES_ACCUSES = 0

        class FauxNuage:
            @staticmethod
            def appareils(iccid=None, lever=False):
                return ["ExponentPushToken[iphone]"]

        class FauxRobot:
            nuage = FauxNuage()

            def _dire_si_les_telephones_se_taisent(soi, attendus, servis, soucis):
                vu.append((attendus, servis, soucis))
                dit.set()

        try:
            Robot._faire_sonner(FauxRobot(), "MTN", "MTN ·8901", "Vous avez recu 1 000 FCFA")
            self.assertTrue(dit.wait(3))
        finally:
            totem.app.envoyer, totem.app.lire_les_accuses, totem.app.ATTENTE_DES_ACCUSES = vrais
        self.assertEqual(vu, [(1, 0, ["la clé du service de notification manque au projet"])])


class ListeDesAppareils(unittest.TestCase):
    """Le robot va lire, dans la base, les téléphones à faire sonner."""

    def setUp(self):
        self.repondre = [{"jeton": "ExponentPushToken[un]"},
                         {"jeton": "ExponentPushToken[deux]"}]
        essai = self

        class Base(BaseHTTPRequestHandler):
            def do_GET(soi):
                essai.demande = soi.path
                corps = json.dumps(essai.repondre).encode()
                soi.send_response(200)
                soi.send_header("Content-Type", "application/json")
                soi.send_header("Content-Length", str(len(corps)))
                soi.end_headers()
                soi.wfile.write(corps)

            def log_message(soi, *args):
                pass

        self.demande = None
        self.serveur = HTTPServer(("127.0.0.1", 0), Base)
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{self.serveur.server_port}"
        self.nuage = Nuage(url, "cle", "totem-test", journal=None)

    def tearDown(self):
        self.serveur.shutdown()

    def test_on_ne_remonte_que_les_jetons(self):
        self.assertEqual(self.nuage.appareils(),
                         ["ExponentPushToken[un]", "ExponentPushToken[deux]"])
        self.assertIn("appareils?select=jeton", self.demande)

    def test_une_ligne_sans_jeton_est_ecartee(self):
        self.repondre = [{"jeton": None}, {}, {"jeton": ""},
                         {"jeton": "ExponentPushToken[bon]"}]
        self.assertEqual(self.nuage.appareils(), ["ExponentPushToken[bon]"])

    def test_un_nuage_non_configure_ne_demande_rien(self):
        self.assertEqual(Nuage("", "", "totem", journal=None).appareils(), [])


class BaseSansLaMigrationDuDeuxOctobre(unittest.TestCase):
    """La base n'a pas encore la colonne « utilisateur » : les téléphones
    doivent sonner quand même. Ce qui suit est la réponse EXACTE d'un vrai
    PostgREST à `select=jeton,utilisateur` sur une telle base — relevée, pas
    imaginée. Elle ne ressemble pas à celle d'une écriture (PGRST204) : le
    robot ne la reconnaissait pas, et plus aucun téléphone ne sonnait."""

    REPONSE = {"code": "42703", "details": None, "hint": None,
               "message": "column appareils.utilisateur does not exist"}

    def setUp(self):
        essai = self
        self.demandes = []

        class Base(BaseHTTPRequestHandler):
            def do_GET(soi):
                essai.demandes.append(soi.path)
                if "utilisateur" in soi.path:
                    statut, lignes = 400, essai.REPONSE
                else:
                    statut, lignes = 200, [{"jeton": "ExponentPushToken[samsung]"},
                                           {"jeton": "ExponentPushToken[iphone]"}]
                corps = json.dumps(lignes).encode()
                soi.send_response(statut)
                soi.send_header("Content-Type", "application/json")
                soi.send_header("Content-Length", str(len(corps)))
                soi.end_headers()
                soi.wfile.write(corps)

            def log_message(soi, *args):
                pass

        self.serveur = HTTPServer(("127.0.0.1", 0), Base)
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()
        self.nuage = Nuage(f"http://127.0.0.1:{self.serveur.server_port}",
                           "cle", "totem-test", journal=None)

    def tearDown(self):
        self.serveur.shutdown()

    def test_les_telephones_sonnent_quand_meme(self):
        self.assertEqual(self.nuage.appareils("89237010000000008901"),
                         ["ExponentPushToken[samsung]", "ExponentPushToken[iphone]"])
        lectures = [d for d in self.demandes if "/appareils?" in d]
        self.assertEqual(len(lectures), 2, "la relecture sans la colonne n'a pas eu lieu")

    def test_une_autre_panne_ne_passe_pas_pour_une_base_en_retard(self):
        """Seule la colonne manquante déclenche la relecture : un vrai refus
        (clé fausse, table absente d'une autre façon) reste une panne."""
        self.REPONSE = {"code": "42501", "message": "permission denied for table appareils"}
        self.assertEqual(self.nuage.appareils("89237010000000008901"), [])
        self.assertEqual(len([d for d in self.demandes if "/appareils?" in d]), 1)


class ChacunEntendSesCartes(unittest.TestCase):
    """Un téléphone inscrit au nom d'un compte ne sonne que pour les SMS des
    cartes confiées à ce compte. Celui du propriétaire sonne pour tout."""

    MTN = "89237010000000008901"
    ORANGE = "89237020000000004432"

    def setUp(self):
        essai = self
        self.tables = {
            "appareils": [
                {"jeton": "ExponentPushToken[proprio-ancien]", "utilisateur": None,
                 "vu_le": "2026-10-01T10:00:00Z"},
                {"jeton": "ExponentPushToken[proprio]", "utilisateur": 1,
                 "vu_le": "2026-10-01T09:00:00Z"},
                {"jeton": "ExponentPushToken[vendeur]", "utilisateur": 2,
                 "vu_le": "2026-10-01T08:00:00Z"},
                {"jeton": "ExponentPushToken[ferme]", "utilisateur": 3,
                 "vu_le": "2026-10-01T07:00:00Z"},
            ],
            "utilisateurs": [
                {"id": 1, "role": "proprietaire", "approuve": True},
                {"id": 2, "role": "invite", "approuve": True},
                {"id": 3, "role": "invite", "approuve": False},
            ],
            "attributions": [
                {"utilisateur": 2, "iccid": self.MTN},
                {"utilisateur": 3, "iccid": self.MTN},
            ],
        }
        self.panne = set()
        self.demandes = []

        class Base(BaseHTTPRequestHandler):
            # Un PostgREST en miniature : il respecte les filtres, l'ordre et
            # la LIMITE, comme le vrai. Sans la limite, la fenêtre des cent
            # téléphones n'existerait pas ici, et le défaut non plus.
            def do_GET(soi):
                essai.demandes.append(soi.path)
                chemin, _, requete = soi.path.split("/rest/v1/")[1].partition("?")
                if chemin in essai.panne:
                    soi.send_response(500)
                    soi.end_headers()
                    return
                params = urllib.parse.parse_qs(requete)
                lignes = list(essai.tables.get(chemin, []))

                def regle(ligne, col, expr):
                    op, _, val = expr.partition(".")
                    v = ligne.get(col)
                    if op == "eq":
                        return str(v) == val
                    if op == "is":
                        return (v is None) if val == "null" else (v is (val == "true"))
                    if op == "in":
                        return str(v) in val.strip("()").split(",")
                    return True

                for col, (expr,) in params.items():
                    if col in ("select", "order", "limit"):
                        continue
                    if col == "or":
                        corps = expr[1:-1]
                        clauses = re.findall(r"(\w+)\.((?:in\.\([^)]*\))|[^,]+)", corps)
                        lignes = [l for l in lignes
                                  if any(regle(l, c, e) for c, e in clauses)]
                    else:
                        lignes = [l for l in lignes if regle(l, col, expr)]
                if "order" in params and params["order"][0].startswith("vu_le.desc"):
                    lignes.sort(key=lambda l: l.get("vu_le") or "", reverse=True)
                if "limit" in params:
                    lignes = lignes[:int(params["limit"][0])]
                corps = json.dumps(lignes).encode()
                soi.send_response(200)
                soi.send_header("Content-Type", "application/json")
                soi.send_header("Content-Length", str(len(corps)))
                soi.end_headers()
                soi.wfile.write(corps)

            def log_message(soi, *args):
                pass

        self.serveur = HTTPServer(("127.0.0.1", 0), Base)
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()
        self.nuage = Nuage(f"http://127.0.0.1:{self.serveur.server_port}",
                           "cle", "totem-test", journal=None)

    def _cent_vingt_inscrits_plus_recents(self):
        """Une plateforme grand public : cent vingt inscrits sans carte, qui
        ont tous ouvert l'application APRÈS le titulaire et le propriétaire."""
        for i in range(120):
            uid = 100 + i
            self.tables["utilisateurs"].append(
                {"id": uid, "role": "invite", "approuve": True})
            self.tables["appareils"].append(
                {"jeton": f"ExponentPushToken[inscrit-{i}]", "utilisateur": uid,
                 "vu_le": f"2026-10-02T{i // 60:02d}:{i % 60:02d}:00Z"})

    def tearDown(self):
        self.serveur.shutdown()

    def test_le_titulaire_entend_sa_carte(self):
        self.assertEqual(self.nuage.appareils(self.MTN), [
            "ExponentPushToken[proprio-ancien]", "ExponentPushToken[proprio]",
            "ExponentPushToken[vendeur]"])

    def test_le_titulaire_n_entend_pas_la_carte_d_un_autre(self):
        self.assertEqual(self.nuage.appareils(self.ORANGE), [
            "ExponentPushToken[proprio-ancien]", "ExponentPushToken[proprio]"])

    def test_une_carte_inconnue_ne_sonne_que_chez_le_proprietaire(self):
        self.assertEqual(self.nuage.appareils(None), [
            "ExponentPushToken[proprio-ancien]", "ExponentPushToken[proprio]"])

    def test_dans_le_doute_seul_le_proprietaire_d_avant_sonne(self):
        self.panne = {"utilisateurs"}
        self.assertEqual(self.nuage.appareils(self.MTN),
                         ["ExponentPushToken[proprio-ancien]"])

    def test_cent_inscrits_ne_font_pas_taire_le_titulaire(self):
        """Grand public : chaque inscrit inscrit son téléphone, même sans
        carte. Le titulaire et le propriétaire doivent sonner quand même, et
        aucun des cent vingt autres."""
        self._cent_vingt_inscrits_plus_recents()
        sonnent = self.nuage.appareils(self.MTN)
        self.assertEqual(sonnent, [
            "ExponentPushToken[proprio-ancien]", "ExponentPushToken[proprio]",
            "ExponentPushToken[vendeur]"])
        self.assertFalse(any("inscrit-" in j for j in sonnent))

    def test_temoin_l_ancienne_lecture_perd_le_titulaire(self):
        """LE TÉMOIN : la lecture d'avant, réécrite en quelques lignes —
        cent téléphones de TOUTE la plateforme, PUIS le tri par compte. Sur la
        même base, elle doit perdre le titulaire ; sinon le test du dessus ne
        prouve rien."""
        self._cent_vingt_inscrits_plus_recents()
        lignes = self.nuage._lire(
            "appareils?select=jeton,utilisateur&order=vu_le.desc"
            f"&limit={PAR_ENVOI * 5}")
        admis = self.nuage._comptes_qui_entendent(self.MTN)
        anciens = [l["jeton"] for l in lignes
                   if l.get("utilisateur") is None
                   or l.get("utilisateur") in admis][:PAR_ENVOI]
        self.assertNotIn("ExponentPushToken[vendeur]", anciens)
        self.assertNotIn("ExponentPushToken[proprio]", anciens)


class FaireSonnerLeTelephone(unittest.TestCase):
    """Le branchement : ce que le robot fait sonner en recevant un SMS.

    On appelle la méthode telle qu'elle vit dans le robot, sur un objet
    minimal — c'est le CHEMIN qu'on vérifie, pas l'analyse du SMS (elle a
    ses propres tests) ni le guichet d'Expo (il est sur Internet).
    """

    def setUp(self):
        self.envois = []
        self.parti = threading.Event()
        self._vrai_envoyer = totem.app.envoyer

        def faux_envoyer(jetons, titre, corps, ouvrir=None, acceptes=None,
                         injoignables=None):
            self.envois.append((list(jetons), titre, corps))
            self.parti.set()
            return len(jetons), []

        totem.app.envoyer = faux_envoyer

        class FauxNuage:
            @staticmethod
            def appareils(iccid=None, lever=False):
                return ["ExponentPushToken[abc]"]

        class FauxRobot:
            nuage = FauxNuage()

        self.robot = FauxRobot()

    def tearDown(self):
        totem.app.envoyer = self._vrai_envoyer

    def _sonner(self, texte):
        Robot._faire_sonner(self.robot, "MTN", "MTN ·8901", texte)
        self.parti.wait(3)

    def test_un_encaissement_fait_sonner(self):
        self._sonner("Vous avez recu 20 000 FCFA de NGONO Marie (677123456)")
        self.assertEqual(len(self.envois), 1)
        jetons, titre, corps = self.envois[0]
        self.assertEqual(jetons, ["ExponentPushToken[abc]"])
        self.assertEqual(titre, "MTN ·8901")
        self.assertIn("20 000 FCFA", corps)

    def test_un_code_recu_se_LIT_dans_la_notification(self):
        # Le chemin complet : le SMS arrive, le code se lit sur le volet.
        self._sonner("Votre code est 483921. Ne le communiquez a personne.")
        self.assertEqual(len(self.envois), 1)
        _, _, corps = self.envois[0]
        self.assertIn("483921", corps)
        self.assertNotIn("•", corps)

    def test_sans_nuage_rien_ne_part(self):
        self.robot.nuage = None
        Robot._faire_sonner(self.robot, "MTN", "MTN ·8901", "coucou")
        self.assertFalse(self.parti.wait(0.2))
        self.assertEqual(self.envois, [])


if __name__ == "__main__":
    unittest.main()
