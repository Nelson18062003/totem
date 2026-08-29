"""Ce qu'une notification a le droit de dire — et ce qu'elle ne dira jamais.

Une notification s'affiche sur un écran VERROUILLÉ, dans un taxi, sur une
table de réunion. Ces tests gardent les trois règles de la maison à cet
endroit précis : pas de code, pas de montant inventé, pas le SMS entier.
"""

import unittest

from totem.analyse_sms import analyser
from totem.notification import composer, envoyer


class TexteDeLaNotification(unittest.TestCase):

    def test_encaissement_dit_le_montant_et_qui(self):
        sms = ("Vous avez recu 20 000 FCFA de NGONO Marie (677123456). "
               "Ref: PP240829. Nouveau solde: 412 500 FCFA.")
        titre, corps = composer(analyser(sms), "MTNMobileMoney", "MTN ·8901")
        self.assertEqual(titre, "MTN ·8901")
        self.assertIn("20 000 FCFA", corps)
        self.assertIn("NGONO Marie", corps)
        self.assertTrue(corps.startswith("+"), corps)

    def test_un_code_ne_sort_JAMAIS(self):
        # La règle la plus importante du fichier. Un code à usage unique
        # s'afficherait sur l'écran verrouillé, à la vue de quiconque passe.
        for sms in ("Votre code est 483921. Ne le communiquez a personne.",
                    "Your OTP: 45 67 89",
                    "Code de confirmation : 12-34-56"):
            titre, corps = composer(analyser(sms), "MTN", "MTN ·8901",
                                    categorie="code")
            # Ni le code, ni le texte du message, ni aucune suite de chiffres.
            self.assertNotIn("483921", corps)
            self.assertNotIn("45 67 89", corps)
            self.assertNotIn("12-34-56", corps)
            self.assertNotIn(sms, corps)
            self.assertRegex(corps, r"^Un code de ")

    def test_le_SMS_entier_ne_part_jamais(self):
        # La notification annonce ; elle ne remplace pas le journal.
        sms = ("Vous avez recu 20 000 FCFA de NGONO Marie (677123456). "
               "Ref: PP240829. Nouveau solde: 412 500 FCFA.")
        _, corps = composer(analyser(sms), "MTNMobileMoney", "MTN ·8901")
        self.assertNotIn(sms, corps)
        self.assertNotIn("Ref:", corps)
        self.assertLess(len(corps), 120, "une notification reste courte")

    def test_un_sens_inconnu_ne_se_devine_pas(self):
        # Orange nomme les deux parties sans dire laquelle est la nôtre :
        # « reçu » sur un envoi serait un mensonge, et l'inverse aussi.
        class Faux:
            montant = 20000
            sens = None
            tiers = "A → B"
        _, corps = composer(Faux(), "OrangeMoney", "Orange ·4432")
        self.assertNotIn("+", corps)
        self.assertNotIn("−", corps)
        self.assertIn("20 000 FCFA", corps)

    def test_un_montant_non_lu_ne_s_invente_pas(self):
        class Faux:
            montant = None
            sens = "entree"
            tiers = "quelqu'un"
        _, corps = composer(Faux(), "MTN", "MTN ·8901")
        self.assertNotRegex(corps, r"\d")
        self.assertIn("non lu", corps)

    def test_un_message_incompris_le_dit(self):
        _, corps = composer(None, "MTN", "MTN ·8901", categorie="illisible")
        self.assertIn("pas su lire", corps)

    def test_un_message_ordinaire_reste_sobre(self):
        _, corps = composer(None, "MTN", "MTN ·8901", categorie="publicite")
        self.assertEqual(corps, "Un message de MTN")

    def test_les_deux_langues(self):
        sms = "Vous avez recu 20 000 FCFA de NGONO Marie (677123456)"
        _, fr = composer(analyser(sms), "MTN", "MTN ·8901")
        _, en = composer(analyser(sms), "MTN", "MTN ·8901", anglais=True)
        self.assertIn("de NGONO Marie", fr)
        self.assertIn("from NGONO Marie", en)


class EnvoiDesNotifications(unittest.TestCase):

    def test_un_jeton_qui_n_est_pas_d_expo_est_ignore(self):
        # Rien ne part vers une adresse qu'on ne reconnaît pas.
        self.assertEqual(envoyer(["pas-un-jeton", "", None], "T", "C"), 0)

    def test_sans_appareil_rien_ne_part(self):
        self.assertEqual(envoyer([], "T", "C"), 0)

    def test_un_corps_vide_ne_part_pas(self):
        self.assertEqual(envoyer(["ExpoPushToken[abc]"], "T", ""), 0)


if __name__ == "__main__":
    unittest.main()
