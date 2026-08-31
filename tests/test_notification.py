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
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import totem.app
from totem.app import Robot
from totem.notification import APERCU_MAX, composer, envoyer
from totem.nuage import Nuage


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


class EnvoiDesNotifications(unittest.TestCase):

    def test_un_jeton_qui_n_est_pas_d_expo_est_ignore(self):
        # Rien ne part vers une adresse qu'on ne reconnaît pas.
        self.assertEqual(envoyer(["pas-un-jeton", "", None], "T", "C"), 0)

    def test_sans_appareil_rien_ne_part(self):
        self.assertEqual(envoyer([], "T", "C"), 0)

    def test_un_corps_vide_ne_part_pas(self):
        self.assertEqual(envoyer(["ExponentPushToken[abc]"], "T", ""), 0)

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

        class FauxGuichet:
            status = 200

            def __enter__(soi):
                return soi

            def __exit__(soi, *args):
                return False

        def faux_urlopen(requete, timeout=None):
            envois.append(json.loads(requete.data.decode("utf-8")))
            return FauxGuichet()

        import totem.notification as module
        vrai = module.urllib.request.urlopen
        module.urllib.request.urlopen = faux_urlopen
        try:
            servis = envoyer(["ExponentPushToken[abc]"], "Titre", "Corps")
        finally:
            module.urllib.request.urlopen = vrai

        self.assertEqual(servis, 1)
        (message,) = envois[0]
        self.assertEqual(message["priority"], "high")
        self.assertEqual(message["channelId"], "paiements")


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

        def faux_envoyer(jetons, titre, corps, ouvrir=None):
            self.envois.append((list(jetons), titre, corps))
            self.parti.set()
            return len(jetons)

        totem.app.envoyer = faux_envoyer

        class FauxNuage:
            @staticmethod
            def appareils():
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
