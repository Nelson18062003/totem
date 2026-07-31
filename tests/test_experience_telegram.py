# -*- coding: utf-8 -*-
"""Tests de l'expérience Telegram : affichage des menus, code secret,
réactivité, fiabilité des annonces.

Ce qui est vérifié ici n'est pas décoratif — chaque cas correspond à un
défaut constaté à l'usage sur le terrain :
  - des menus opérateur illisibles sur téléphone ;
  - le pavé du code secret qui s'ouvrait sur un menu qui n'en demandait pas ;
  - des SMS d'encaissement perdus lors d'une coupure ;
  - plusieurs secondes d'attente que le programme s'infligeait à lui-même.
"""

import io
import os
import tempfile
import time
import unittest
import urllib.error
import urllib.request

from totem.app import Robot
from totem.compte import Compte
from totem.console import _TransportTexte
from totem.courrier import Facteur
from totem.entrant import Entrant
from totem.gsm import ALPHABET_GSM, decode_auto, decode_ucs2, encode_ucs2, plausibilite
from totem.simulator import ModemSimule
from totem.storage import Journal
from totem.telegram import TransportTelegram


class TransportEspion(_TransportTexte):
    """Enregistre tout ce que le robot envoie, sans rien afficher."""

    def __init__(self, admins=(1,)):
        super().__init__()
        self.admins = set(admins)
        self.envois = []        # (texte, boutons, canal, silencieux)
        self.editions = []      # (message_id, texte, boutons)
        self.supprimes = []
        self.fichiers = []
        self.reseau = True      # False = coupure Internet simulée

    def envoyer(self, texte, boutons=None, canal=None, silencieux=False):
        if not self.reseau:
            return None
        self.envois.append((texte, boutons, canal, silencieux))
        self.dernier_id += 1
        return self.dernier_id

    def modifier(self, message_id, texte, boutons=None, canal=None):
        self.editions.append((message_id, texte, boutons))
        return True

    def supprimer(self, message_id, canal=None):
        self.supprimes.append(message_id)

    def envoyer_fichier(self, nom, contenu, legende="", canal=None,
                        type_mime="text/csv"):
        self.fichiers.append((nom, contenu))
        return True

    def role(self, utilisateur):
        return "admin" if utilisateur in self.admins else "observateur"

    def recevoir(self):
        raise KeyboardInterrupt

    # raccourcis de lecture
    def dernier_texte(self):
        return self.editions[-1][1] if self.editions else self.envois[-1][0]

    def derniers_boutons(self):
        return self.editions[-1][2] if self.editions else self.envois[-1][1]


def robot(operateur="MTN", admins=(1,), **kw):
    modem = ModemSimule(operateur=operateur)
    transport = TransportEspion(admins)
    r = Robot([Compte(modem, operateur)], transport, Journal(":memory:"),
              nom="T", pause_sms=1, **kw)
    return r, transport, modem


def tape(r, texte, utilisateur=1, message_id=7):
    r._traiter(Entrant(texte=texte, utilisateur=utilisateur, chat=utilisateur,
                       message_id=message_id))


def clic(r, donnee, utilisateur=1):
    r._traiter(Entrant(texte=donnee, bouton=True, callback_id="cb",
                       utilisateur=utilisateur, chat=utilisateur))


def libelles(boutons):
    return [b[0] for ligne in boutons or [] for b in ligne]


def donnees(boutons):
    return [b[1] for ligne in boutons or [] for b in ligne]


class AffichageDesMenus(unittest.TestCase):
    """Le menu s'affichait deux fois : en bloc gris à chasse fixe, puis en
    boutons. Sur téléphone, les lignes longues débordaient du cadre."""

    def test_aucun_bloc_de_code(self):
        r, t, _ = robot()
        tape(r, "*126#")
        self.assertNotIn("<pre>", t.dernier_texte())

    def test_options_uniquement_dans_les_boutons(self):
        r, t, _ = robot()
        tape(r, "*126#")
        self.assertNotIn("Transfert d'argent", t.dernier_texte())
        self.assertIn("1. Transfert d'argent", libelles(t.derniers_boutons()))

    def test_entete_conserve(self):
        r, t, _ = robot("Orange")
        tape(r, "#150#")
        self.assertIn("Bienvenue. Choisissez", t.dernier_texte())

    def test_numerotation_de_chaque_operateur(self):
        """MTN écrit « 1. », Orange « 1) », d'autres « 1- » ou « 01 : »."""
        options = lambda m: Robot._analyser_menu(m)[1]
        self.assertEqual(options("A\n1) Envoyer\n2) Retirer"),
                         [("1", "Envoyer"), ("2", "Retirer")])
        self.assertEqual(options("1-Solde\n2.Retrait"),
                         [("1", "Solde"), ("2", "Retrait")])
        self.assertEqual(options("01 : Solde\n12 : Retrait"),
                         [("01", "Solde"), ("12", "Retrait")])

    def test_un_montant_n_est_pas_une_option(self):
        self.assertEqual(Robot._analyser_menu("Votre solde est de 1 000 FCFA")[1], [])

    def test_aucune_ligne_perdue(self):
        entete, options = Robot._analyser_menu(
            "Orange Money\r\nBienvenue :\r\n1) Transfert\r\n2) Retrait\r\n")
        self.assertEqual(entete, ["Orange Money", "Bienvenue :"])
        self.assertEqual(len(options), 2)

    def test_libelles_longs_un_par_ligne(self):
        r, _, _ = robot()
        courts = r._boutons_options([("1", "Solde"), ("2", "Retrait")])
        longs = r._boutons_options([("1", "Transfert d'argent vers un autre reseau")])
        self.assertEqual(len(courts[0]), 2)
        self.assertEqual(len(longs[0]), 1)

    def test_question_libre_signalee(self):
        r, t, _ = robot()
        tape(r, "*126#")
        clic(r, "u:1")
        self.assertIn("Répondez par un message", t.dernier_texte())
        self.assertEqual(donnees(t.derniers_boutons()), ["c:annuler"])


class PaveDuCodeSecret(unittest.TestCase):
    """Un menu qui PARLE du code secret n'en demande pas un."""

    def test_menu_parlant_du_code_n_ouvre_pas_le_pave(self):
        r, t, _ = robot("Orange")
        tape(r, "#150#")
        clic(r, "u:6")                     # « 6) Gerer mon code secret »
        self.assertFalse(r.pin_actif)
        self.assertNotIn("p:1", donnees(t.derniers_boutons()))
        self.assertIn("1. Changer mon code secret", libelles(t.derniers_boutons()))

    def test_vraie_invite_ouvre_le_pave(self):
        self.assertTrue(Robot._demande_un_code("Confirmez avec votre code secret :"))
        self.assertTrue(Robot._demande_un_code("Entrez votre PIN :"))
        self.assertTrue(Robot._demande_un_code("Saisissez votre mot de passe"))

    def test_menu_numerote_n_est_jamais_une_saisie(self):
        self.assertFalse(Robot._demande_un_code(
            "Gerer mon code secret\n1) Changer\n2) Retour"))

    def test_question_libre_sans_code(self):
        self.assertFalse(Robot._demande_un_code("Entrez le montant (FCFA) :"))

    def test_le_code_ne_devient_jamais_un_message(self):
        r, t, _ = robot()
        tape(r, "*126#"); clic(r, "u:1"); tape(r, "677000111"); tape(r, "50000")
        self.assertTrue(r.pin_actif)
        for chiffre in "1234":
            clic(r, f"p:{chiffre}")
        self.assertIn("••••", t.dernier_texte())
        clic(r, "p:ok")
        journalises = [x[0] for x in r.journal.conn.execute("SELECT texte FROM ussd")]
        self.assertNotIn("1234", journalises)
        self.assertIn("****", journalises)

    def test_code_tape_a_la_main_efface_du_chat(self):
        r, t, _ = robot()
        tape(r, "*126#"); clic(r, "u:1"); tape(r, "677000111"); tape(r, "50000")
        tape(r, "1234", message_id=42)
        self.assertIn(42, t.supprimes)


class Reactivite(unittest.TestCase):
    """Le réseau met des secondes à répondre ; l'écran ne doit pas rester figé."""

    def test_accuse_de_reception_immediat(self):
        r, t, _ = robot()
        tape(r, "*126#")
        self.assertIn("⏳", t.envois[-1][0])
        self.assertIn("*126#", t.envois[-1][0])
        self.assertEqual(t.envois[-1][1], [])

    def test_l_attente_devient_le_menu_dans_la_meme_carte(self):
        r, t, _ = robot()
        tape(r, "*126#")
        self.assertNotIn("⏳", t.editions[-1][1])
        self.assertTrue(t.editions)     # modification, pas nouveau message


class ConfirmationDesSorties(unittest.TestCase):
    """Au-delà d'un seuil, le code secret ne s'affiche qu'après confirmation."""

    def _transfert(self, seuil, montant="50000"):
        r, t, _ = robot(seuil_confirmation=seuil)
        tape(r, "*126#"); clic(r, "u:1"); tape(r, "677000111"); tape(r, montant)
        return r, t

    def test_montant_et_beneficiaire_rappeles(self):
        r, t = self._transfert(25000)
        self.assertTrue(r._confirmation_requise())
        self.assertIn("Confirmation demandée", t.dernier_texte())
        self.assertIn("50 000 FCFA", t.dernier_texte())
        self.assertIn("677000111", t.dernier_texte())

    def test_pave_inerte_avant_confirmation(self):
        r, t = self._transfert(25000)
        self.assertNotIn("p:1", donnees(t.derniers_boutons()))
        clic(r, "p:1")
        self.assertEqual(r.pin_tampon, "")

    def test_saisie_manuelle_ne_contourne_pas(self):
        r, t = self._transfert(25000)
        tape(r, "1234", message_id=99)
        self.assertTrue(r._confirmation_requise())
        self.assertIn(99, t.supprimes)          # le code est quand même effacé
        journalises = [x[0] for x in r.journal.conn.execute("SELECT texte FROM ussd")]
        self.assertNotIn("****", journalises)   # rien n'est parti à l'opérateur

    def test_apres_confirmation_le_transfert_aboutit(self):
        r, t = self._transfert(25000)
        clic(r, "c:confirmer")
        self.assertIn("p:1", donnees(t.derniers_boutons()))
        for chiffre in "1234":
            clic(r, f"p:{chiffre}")
        clic(r, "p:ok")
        self.assertIn("reussi", t.dernier_texte())

    def test_sous_le_seuil_aucune_confirmation(self):
        r, t = self._transfert(100000)
        self.assertFalse(r._confirmation_requise())
        self.assertIn("p:1", donnees(t.derniers_boutons()))

    def test_desactive_par_defaut(self):
        r, _ = self._transfert(0)
        self.assertFalse(r._confirmation_requise())

    def test_consultation_de_solde_non_concernee(self):
        r, t, _ = robot(seuil_confirmation=1000)
        tape(r, "*126#"); clic(r, "u:5"); clic(r, "u:1")
        self.assertIsNone(r.montant_session)
        self.assertNotIn("Confirmation", t.dernier_texte())


class RelevesDesSms(unittest.TestCase):
    """On journalise AVANT d'effacer : une coupure au milieu ne perd rien."""

    def test_sms_journalise_puis_efface(self):
        r, t, modem = robot()
        modem.injecter_paiement("NGONO Marie", 25000)
        r._relever_sms(r.comptes[0])
        self.assertEqual(r.journal.rapport_du_jour()[0], 1)
        self.assertEqual(modem.lire_sms(), [])

    def test_effacement_impossible_pas_de_doublon(self):
        r, t, modem = robot()
        modem.effacer_sms = lambda index: False      # le modem refuse d'effacer
        modem.injecter_paiement("NGONO Marie", 25000)
        r._relever_sms(r.comptes[0])
        r._relever_sms(r.comptes[0])                 # même message relu
        self.assertEqual(r.journal.rapport_du_jour()[0], 1)
        annonces = [e for e in t.envois if "Encaissement" in e[0]]
        self.assertEqual(len(annonces), 1)

    def test_sms_conserve_tant_qu_il_n_est_pas_efface(self):
        r, _, modem = robot()
        modem.effacer_sms = lambda index: False
        modem.injecter_paiement("A", 1000)
        r._relever_sms(r.comptes[0])
        self.assertEqual(len(modem.lire_sms()), 1)   # toujours dans le modem

    def test_tous_les_sms_notifient_pareil(self):
        """Un SMS d'opérateur peut annoncer une suspension de compte : aucun
        message ne doit être mis en sourdine."""
        r, t, _ = robot()
        compte = r.comptes[0]
        r._notifier_sms(compte, "MoMo", "Vous avez recu 25 000 FCFA de A.")
        r._notifier_sms(compte, "MTN", "Votre forfait expire demain.")
        self.assertTrue(all(e[3] is False for e in t.envois))


class MemoireEtConflits(unittest.TestCase):
    def test_alerte_avant_saturation(self):
        r, t, modem = robot()
        modem.memoire_sms = lambda: (45, 50)
        r._verifier_memoire()
        self.assertIn("Mémoire SMS presque pleine", t.envois[-1][0])
        self.assertEqual(t.envois[-1][2], "alertes")

    def test_alerte_non_repetee(self):
        r, t, modem = robot()
        modem.memoire_sms = lambda: (45, 50)
        r._verifier_memoire()
        avant = len(t.envois)
        r._verifier_memoire()
        self.assertEqual(len(t.envois), avant)

    def test_memoire_confortable_aucune_alerte(self):
        r, t, modem = robot()
        modem.memoire_sms = lambda: (5, 50)
        r._verifier_memoire()
        self.assertFalse(any("Mémoire" in e[0] for e in t.envois))

    def test_deux_robots_sur_le_meme_jeton(self):
        r, t, _ = robot()
        t.conflit = True
        r._signaler_conflit()
        self.assertIn("même jeton", t.envois[-1][0])
        avant = len(t.envois)
        r._signaler_conflit()
        self.assertEqual(len(t.envois), avant)


class BilanQuotidien(unittest.TestCase):
    def test_envoye_meme_si_la_minute_est_manquee(self):
        r, t, _ = robot(heure_rapport="00:00", sauvegarde_quotidienne=False)
        r.dernier_rapport = None
        self.assertTrue(r._rapport_quotidien())
        self.assertTrue(any("Dernières 24 h" in e[0] for e in t.envois))

    def test_non_rejoue_le_meme_jour(self):
        r, t, _ = robot(heure_rapport="00:00", sauvegarde_quotidienne=False)
        r.dernier_rapport = None
        r._rapport_quotidien()
        self.assertFalse(r._rapport_quotidien())

    def test_redemarrage_tardif_sans_bilan_intempestif(self):
        from datetime import datetime
        r, _, _ = robot(heure_rapport="00:00")
        self.assertEqual(r.dernier_rapport, datetime.now().date())


class CourrierHorsLigne(unittest.TestCase):
    """Une coupure Internet ne doit pas faire disparaître un encaissement."""

    def setUp(self):
        self.transport = TransportEspion()
        self.journal = Journal(":memory:")
        self.facteur = Facteur(self.journal, self.transport)

    def test_envoi_immediat_quand_le_reseau_est_la(self):
        self.assertTrue(self.facteur.poster("A", "encaissements"))
        self.assertEqual(self.facteur.en_attente(), 0)

    def test_mise_de_cote_pendant_la_coupure(self):
        self.transport.reseau = False
        self.assertFalse(self.facteur.poster("A"))
        self.facteur.poster("B")
        self.assertEqual(self.facteur.en_attente(), 2)
        self.assertEqual(self.facteur.distribuer(), 0)

    def test_tout_repart_dans_l_ordre(self):
        self.facteur.poster("A")
        self.transport.reseau = False
        self.facteur.poster("B")
        self.facteur.poster("C")
        self.transport.reseau = True
        self.assertEqual(self.facteur.distribuer(), 2)
        self.assertEqual([e[0] for e in self.transport.envois], ["A", "B", "C"])

    def test_un_nouveau_message_ne_double_pas_la_file(self):
        self.transport.reseau = False
        self.facteur.poster("D")
        self.transport.reseau = True
        self.facteur.poster("E")            # le réseau est revenu, mais D attend
        self.facteur.distribuer()
        self.assertEqual([e[0] for e in self.transport.envois], ["D", "E"])

    def test_message_increvable_abandonne(self):
        self.transport.reseau = False
        self.facteur.poster("Z")
        for _ in range(70):
            self.facteur.distribuer()
        self.assertEqual(self.facteur.en_attente(), 0)

    def test_canal_conserve(self):
        self.transport.reseau = False
        self.facteur.poster("A", "alertes")
        self.transport.reseau = True
        self.facteur.distribuer()
        self.assertEqual(self.transport.envois[-1][2], "alertes")

    def test_encaissement_retenu_puis_annonce(self):
        r, t, _ = robot()
        t.reseau = False
        r._notifier_sms(r.comptes[0], "MoMo", "Vous avez recu 40 000 FCFA de A.")
        self.assertEqual(r.facteur.en_attente(), 1)
        t.reseau = True
        r.facteur.distribuer()
        self.assertIn("40 000 FCFA", t.envois[-1][0])


class SauvegardeDuJournal(unittest.TestCase):
    """La carte SD peut mourir : il faut une copie hors du Pi."""

    def test_fichier_sqlite_restaurable(self):
        r, t, _ = robot()
        r.journal.sms("MoMo", "Vous avez recu 12 000 FCFA de A.", "MTN")
        r._sauvegarde()
        nom, contenu = t.fichiers[-1]
        self.assertTrue(nom.startswith("journal-") and nom.endswith(".db"))
        self.assertTrue(contenu.startswith(b"SQLite format 3"))

        chemin = tempfile.mktemp(suffix=".db")
        with open(chemin, "wb") as f:
            f.write(contenu)
        restaure = Journal(chemin)
        self.assertEqual(restaure.rapport_du_jour()[1], 12000)
        restaure.conn.close()
        os.remove(chemin)

    def test_echec_signale_mais_silencieux_en_automatique(self):
        r, t, _ = robot()
        t.envoyer_fichier = lambda *a, **k: False
        r._sauvegarde()
        self.assertIn("n'a pas pu être envoyée", t.envois[-1][0])
        avant = len(t.envois)
        r._sauvegarde(automatique=True)
        self.assertEqual(len(t.envois), avant)


class DecodageDesMenus(unittest.TestCase):
    """Le réseau code sa réponse en GSM 7 bits ou en UCS2, et l'annonce dans
    un champ (le DCS) auquel on ne peut pas toujours se fier."""

    MENU = "Orange Money\n1) Transfert\n2) Retrait"

    @staticmethod
    def _encoder_gsm7(texte):
        septets = [ALPHABET_GSM.index(c) for c in texte]
        octets, tampon, bits = bytearray(), 0, 0
        for s in septets:
            tampon |= s << bits
            bits += 7
            while bits >= 8:
                octets.append(tampon & 0xFF)
                tampon >>= 8
                bits -= 8
        if bits:
            octets.append(tampon & 0xFF)
        return octets.hex().upper()

    def test_alphabet_complet(self):
        self.assertEqual(len(ALPHABET_GSM), 128)

    def test_gsm7_packe(self):
        self.assertEqual(decode_auto(self._encoder_gsm7(self.MENU)), self.MENU)
        self.assertEqual(decode_auto(self._encoder_gsm7(self.MENU), 15), self.MENU)

    def test_ucs2(self):
        self.assertEqual(decode_auto(encode_ucs2(self.MENU), 72), self.MENU)
        self.assertEqual(decode_auto(encode_ucs2(self.MENU)), self.MENU)

    def test_dcs_menteur_rattrape(self):
        """Certains firmwares annoncent un codage et en renvoient un autre."""
        self.assertEqual(decode_auto(self._encoder_gsm7(self.MENU), 72), self.MENU)
        self.assertEqual(decode_auto(encode_ucs2(self.MENU), 0), self.MENU)

    def test_mauvaise_lecture_jugee_implausible(self):
        self.assertLess(plausibilite(decode_ucs2(self._encoder_gsm7(self.MENU))), 0.5)

    def test_texte_lisible_intact(self):
        self.assertEqual(decode_auto(self.MENU), self.MENU)


class LimitesDeTelegram(unittest.TestCase):
    def test_un_message_par_seconde_et_par_conversation(self):
        tg = TransportTelegram("J", 111)
        depart = time.monotonic()
        for _ in range(3):
            tg._patienter(111)
        self.assertGreaterEqual(time.monotonic() - depart, 2.0)

    def test_modifications_non_bridees(self):
        tg = TransportTelegram("J", 111)
        depart = time.monotonic()
        for _ in range(3):
            tg._patienter(111, par_chat=False)
        self.assertLess(time.monotonic() - depart, 0.5)

    def test_repli_en_texte_brut_si_la_mise_en_forme_echoue(self):
        appels = []

        class FausseReponse:
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self): return b'{"ok":true,"result":{"message_id":1}}'

        def faux_urlopen(req, timeout=None):
            corps = req.data.decode()
            appels.append(corps)
            if "parse_mode=HTML" in corps:
                raise urllib.error.HTTPError(req.full_url, 400, "can't parse entities",
                                             {}, io.BytesIO(b"{}"))
            return FausseReponse()

        vrai = urllib.request.urlopen
        urllib.request.urlopen = faux_urlopen
        try:
            TransportTelegram("J", 111).envoyer("<b>Encaissement</b> mal balisé <i>")
        finally:
            urllib.request.urlopen = vrai
        self.assertEqual(len(appels), 2)
        self.assertNotIn("parse_mode", appels[1])

    def test_conflit_409_signale_sans_planter(self):
        def urlopen_409(req, timeout=None):
            raise urllib.error.HTTPError(req.full_url, 409, "Conflict", {},
                                         io.BytesIO(b"{}"))

        vrai = urllib.request.urlopen
        urllib.request.urlopen = urlopen_409
        try:
            tg = TransportTelegram("J", 111)
            self.assertEqual(tg.recevoir(), [])
            self.assertTrue(tg.conflit)
        finally:
            urllib.request.urlopen = vrai

    def test_decoupage_des_messages_longs(self):
        morceaux = TransportTelegram._decouper("ligne\n" * 2000)
        self.assertGreater(len(morceaux), 1)
        self.assertTrue(all(len(m) <= 3900 for m in morceaux))
        self.assertEqual(sum(m.count("ligne") for m in morceaux), 2000)


class RolesEtAcces(unittest.TestCase):
    def test_observateur_ne_pilote_pas(self):
        r, t, _ = robot(admins=(1,))
        tape(r, "*126#", utilisateur=2)
        self.assertIn("🔒", t.envois[-1][0])
        self.assertFalse(r.session_ussd)

    def test_observateur_peut_consulter(self):
        r, t, _ = robot(admins=(1,))
        tape(r, "/rapport", utilisateur=2)
        self.assertIn("Dernières 24 h", t.envois[-1][0])

    def test_refus_journalise(self):
        r, _, _ = robot(admins=(1,))
        tape(r, "*126#", utilisateur=2)
        evenements = [x[0] for x in r.journal.conn.execute("SELECT texte FROM evenements")]
        self.assertTrue(any("refus" in e for e in evenements))


if __name__ == "__main__":
    unittest.main(verbosity=2)
