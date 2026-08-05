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
    """Affichage retenu à l'usage : le menu de l'opérateur est rendu tel
    quel dans son cadre à chasse fixe, avec les boutons en dessous.

    Le texte complet reste ainsi lisible même quand le découpage en boutons
    ne reconnaît pas toutes les lignes — c'est ce filet qui compte davantage
    que l'économie de place."""

    def test_menu_rendu_dans_son_cadre(self):
        r, t, _ = robot()
        tape(r, "*126#")
        self.assertIn("<pre>", t.dernier_texte())

    def test_texte_et_boutons_ensemble(self):
        r, t, _ = robot()
        tape(r, "*126#")
        self.assertIn("Transfert d'argent", t.dernier_texte())
        self.assertIn("1. Transfert d'argent", libelles(t.derniers_boutons()))

    def test_deux_boutons_par_ligne(self):
        r, t, _ = robot()
        tape(r, "*126#")
        lignes_options = t.derniers_boutons()[:-1]   # hors « ❌ Annuler »
        self.assertTrue(all(len(l) == 2 for l in lignes_options), lignes_options)

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

    def test_question_libre_ouvre_un_pave_de_boutons(self):
        """Une saisie libre se compose sur des boutons, plus au clavier.

        Un message tapé dans Telegram reste dans la conversation ; l'effacer
        après coup ne suffit pas, il a existé et transité. Un chiffre composé
        sur des boutons n'est jamais un message.
        """
        r, t, _ = robot()
        tape(r, "*126#")
        clic(r, "u:1")
        touches = donnees(t.derniers_boutons())
        for chiffre in "0123456789":
            self.assertIn(f"s:{chiffre}", touches)
        self.assertIn("s:ok", touches)
        self.assertIn("s:eff", touches)
        # Le masquage et l'abandon restent accessibles à tout moment.
        self.assertIn("c:masquer", touches)
        self.assertIn("c:annuler", touches)


# Menu réellement renvoyé par Orange Cameroun sur #148#, relevé en production.
# Il cumule tout ce qui piégeait l'ancienne détection : séparateur « : » sans
# espace, et une PREMIÈRE option qui contient les mots « code secret ».
MENU_ORANGE_REEL = """Veuillez choisir :
1:Modifier code secret
2:Solde de compte
3:Dernieres transactions
4:Langue
5:Gestion des sous comptes

6:Obtenir code point de vente

7:Association"""


class MenuReelOrange(unittest.TestCase):
    """Cas relevé en production : le pavé PIN s'ouvrait sur ce menu.

    L'ancienne détection cherchait « code secret » n'importe où dans le
    texte ; elle tombait donc sur l'intitulé de l'option 1 et prenait un
    menu de navigation pour une demande de saisie."""

    def test_les_sept_options_sont_reconnues(self):
        entete, options = Robot._analyser_menu(MENU_ORANGE_REEL)
        self.assertEqual(entete, ["Veuillez choisir :"])
        self.assertEqual([n for n, _ in options], list("1234567"))
        self.assertEqual(options[0][1], "Modifier code secret")

    def test_les_lignes_vides_ne_cassent_pas_la_lecture(self):
        options = Robot._analyser_menu(MENU_ORANGE_REEL)[1]
        self.assertEqual(options[5], ("6", "Obtenir code point de vente"))
        self.assertEqual(options[6], ("7", "Association"))

    def test_aucun_pave_sur_ce_menu(self):
        self.assertFalse(Robot._demande_un_code(MENU_ORANGE_REEL))

    def test_rendu_en_boutons_et_non_en_pave(self):
        r, t, modem = robot("Orange")
        modem.menu_principal = MENU_ORANGE_REEL
        tape(r, "#150#")
        self.assertFalse(r.pin_actif)
        self.assertIn("1. Modifier code secret", libelles(t.derniers_boutons()))
        self.assertNotIn("p:1", donnees(t.derniers_boutons()))

    def test_la_suite_ouvre_bien_le_pave(self):
        """Une fois l'option 1 choisie, Orange demande vraiment le code : là,
        le pavé doit s'ouvrir."""
        self.assertTrue(Robot._demande_un_code("Entrez votre ancien code secret :"))


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


class QueDemandeLOperateur(unittest.TestCase):
    """Le protocole USSD ne dit JAMAIS ce qu'il attend.

    Un montant, un numéro, une référence et un code secret arrivent tous sous
    la même forme : du texte libre. Se tromper n'a pas le même coût dans les
    deux sens — masquer une saisie anodine ne coûte rien, laisser passer un
    code l'écrit dans la conversation. On masque donc au moindre doute, et on
    laisse toujours une porte de sortie sûre quand le doute subsiste."""

    DEMANDES_DE_CODE = [
        "Confirmez avec votre code secret :",
        "Entrez votre PIN :",
        "Confirmez par votre code Orange Money :",
        "Entrez votre code :",
        "Saisissez votre mot de passe",
        "Veuillez entrer votre MDP",
        "Enter your Orange Money code",
        "Entrez le code de confirmation recu par SMS",
    ]
    SAISIES_ORDINAIRES = [
        "Entrez le montant (FCFA) :",
        "Entrez le numero du beneficiaire :",
        "Entrez la reference du paiement",
    ]

    def test_toute_demande_de_code_est_masquee(self):
        for invite in self.DEMANDES_DE_CODE:
            with self.subTest(invite=invite):
                self.assertTrue(Robot._demande_un_code(invite),
                                f"code écrit en clair : {invite}")

    def test_les_saisies_ordinaires_restent_libres(self):
        for invite in self.SAISIES_ORDINAIRES:
            with self.subTest(invite=invite):
                self.assertFalse(Robot._demande_un_code(invite))

    def test_un_menu_ne_devient_jamais_une_saisie(self):
        """Même avec un vocabulaire élargi, la présence d'options tranche."""
        self.assertFalse(Robot._demande_un_code(MENU_ORANGE_REEL))
        self.assertFalse(Robot._demande_un_code(
            "1:Modifier code secret\n2:Mot de passe oublie"))

    def test_porte_de_sortie_sur_toute_saisie_libre(self):
        r, t, _ = robot()
        tape(r, "*126#")
        clic(r, "u:1")                       # « Entrez le numero du beneficiaire »
        self.assertFalse(r.pin_actif)
        self.assertIn("c:masquer", donnees(t.derniers_boutons()))

    def test_la_porte_de_sortie_ouvre_le_pave(self):
        r, t, _ = robot()
        tape(r, "*126#")
        clic(r, "u:1")
        clic(r, "c:masquer")
        self.assertTrue(r.pin_actif)
        self.assertIn("p:1", donnees(t.derniers_boutons()))

    def test_saisie_masquee_a_la_demande_reste_secrete(self):
        r, t, _ = robot()
        tape(r, "*126#")
        clic(r, "u:1")
        clic(r, "c:masquer")
        for chiffre in "9876":
            clic(r, f"p:{chiffre}")
        self.assertIn("••••", t.dernier_texte())
        clic(r, "p:ok")
        journalises = [x[0] for x in r.journal.conn.execute("SELECT texte FROM ussd")]
        self.assertNotIn("9876", journalises)
        self.assertIn("****", journalises)


class Reactivite(unittest.TestCase):
    """Aucun message intermédiaire : ouvrir un menu ne doit coûter qu'un seul
    aller-retour Telegram.

    Une carte d'attente « ⏳ » avait été essayée puis retirée : elle ajoutait
    un envoi supplémentaire — donc jusqu'à une seconde d'étranglement — avant
    même que le modem soit appelé."""

    def test_un_seul_message_pour_ouvrir_un_menu(self):
        r, t, _ = robot()
        avant = len(t.envois)
        tape(r, "*126#")
        self.assertEqual(len(t.envois) - avant, 1)

    def test_aucune_carte_d_attente(self):
        r, t, _ = robot()
        tape(r, "*126#")
        self.assertNotIn("⏳", t.dernier_texte())

    def test_navigation_sans_message_supplementaire(self):
        r, t, _ = robot()
        tape(r, "*126#")
        avant = len(t.envois)
        clic(r, "u:5")
        self.assertEqual(len(t.envois), avant)      # une modification, pas un envoi
        self.assertIn("Consulter le solde", t.dernier_texte())


class ConfirmationDesSorties(unittest.TestCase):
    """Au-delà d'un seuil, le code secret ne s'affiche qu'après confirmation."""

    def _transfert(self, seuil, montant="50000"):
        r, t, _ = robot(seuil_confirmation=seuil)
        tape(r, "*126#"); clic(r, "u:1"); tape(r, "677000111"); tape(r, montant)
        return r, t

    def test_montant_et_beneficiaire_rappeles(self):
        r, t = self._transfert(25000)
        self.assertTrue(r._confirmation_requise())
        self.assertIn("Confirmation needed", t.dernier_texte())
        self.assertIn("50,000 FCFA", t.dernier_texte())
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
        annonces = [e for e in t.envois if "Payment received" in e[0]]
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
        self.assertIn("SMS storage almost full", t.envois[-1][0])
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
        self.assertFalse(any("storage" in e[0] for e in t.envois))

    def test_jeton_utilise_ailleurs(self):
        r, t, _ = robot()
        t.conflit = True
        r._signaler_conflit()
        self.assertIn("stopped answering", t.envois[-1][0])
        self.assertIn("ps aux", t.envois[-1][0])   # la commande de diagnostic
        avant = len(t.envois)
        r._signaler_conflit()
        self.assertEqual(len(t.envois), avant)     # signalé une seule fois

    def test_alerte_disparait_quand_le_conflit_cesse(self):
        r, t, _ = robot()
        t.conflit = True
        r._signaler_conflit()
        t.conflit = False
        r._signaler_conflit()
        self.assertFalse(r.conflit_signale)


class BilanQuotidien(unittest.TestCase):
    def test_envoye_meme_si_la_minute_est_manquee(self):
        r, t, _ = robot(heure_rapport="00:00", sauvegarde_quotidienne=False)
        r.dernier_rapport = None
        self.assertTrue(r._rapport_quotidien())
        self.assertTrue(any("Last 24 hours" in e[0] for e in t.envois))

    def test_non_rejoue_le_meme_jour(self):
        r, t, _ = robot(heure_rapport="00:00", sauvegarde_quotidienne=False)
        r.dernier_rapport = None
        r._rapport_quotidien()
        self.assertFalse(r._rapport_quotidien())

    def test_redemarrage_tardif_sans_bilan_intempestif(self):
        from datetime import datetime
        r, _, _ = robot(heure_rapport="00:00")
        self.assertEqual(r.dernier_rapport, datetime.now().date())


class TransportPointilleux:
    """Transport de test qui DISTINGUE coupure et refus, comme le vrai (via
    `acheminer`). `refuse` : sous-chaîne d'un message que Telegram rejette
    pour de bon (fil fermé, robot exclu) ; `reseau=False` : coupure Internet."""

    def __init__(self, refuse=None, reseau=True):
        self.refuse = refuse
        self.reseau = reseau
        self.livres = []          # (texte, canal) des messages réellement partis

    def acheminer(self, texte, canal=None, silencieux=False):
        if not self.reseau:
            return "reseau"
        if self.refuse is not None and self.refuse in texte:
            return "refuse"
        self.livres.append((texte, canal))
        return "livre"


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

    def test_coupure_ne_jette_jamais_un_encaissement(self):
        # Une coupure touche TOUT : on garde le message et on le rejoue au
        # retour du réseau. Même après une nuit entière, rien n'est perdu.
        t = TransportPointilleux(reseau=False)
        f = Facteur(self.journal, t)
        f.poster("A", "encaissements")
        for _ in range(70):
            f.distribuer()
        self.assertEqual(f.en_attente(), 1)   # toujours là
        t.reseau = True
        f.distribuer()
        self.assertEqual([x[0] for x in t.livres], ["A"])

    def test_message_refuse_est_abandonne_vite(self):
        # Telegram REFUSE ce message précis (fil supprimé) : on l'écarte en
        # quelques essais, pas au bout de soixante.
        t = TransportPointilleux(refuse="Z")
        f = Facteur(self.journal, t)
        f.poster("Z", "encaissements")
        f.distribuer()
        self.assertEqual(f.en_attente(), 0)

    def test_un_refus_ne_bloque_pas_les_suivants(self):
        # Le vrai bug de production : un message refusé en tête ne doit PAS
        # empêcher les messages parfaitement livrables derrière lui de partir.
        t = TransportPointilleux(refuse="POISON")
        f = Facteur(self.journal, t)
        f.poster("POISON en tete", "encaissements")
        f.poster("bon message", "encaissements")
        f.distribuer()
        self.assertIn("bon message", [x[0] for x in t.livres])

    def test_abandon_previent_le_proprietaire(self):
        alertes = []
        t = TransportPointilleux(refuse="POISON")
        f = Facteur(self.journal, t,
                    sur_abandon=lambda canal, txt: alertes.append((canal, txt)))
        f.poster("POISON", "encaissements")
        f.distribuer()
        self.assertEqual(len(alertes), 1)
        self.assertEqual(alertes[0][0], "encaissements")

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
        self.assertIn("could not be sent", t.envois[-1][0])
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

    def test_acheminer_refuse_un_400_persistant(self):
        # Un 400 qui persiste même SANS mise en forme n'est pas un souci de
        # balisage : c'est le message ou sa cible (fil supprimé) que Telegram
        # refuse. Le facteur doit l'écarter, pas le rejouer indéfiniment.
        def urlopen_400(req, timeout=None):
            raise urllib.error.HTTPError(
                req.full_url, 400, "message thread not found", {},
                io.BytesIO(b"{}"))
        vrai = urllib.request.urlopen
        urllib.request.urlopen = urlopen_400
        try:
            self.assertEqual(TransportTelegram("J", 111).acheminer("x"), "refuse")
        finally:
            urllib.request.urlopen = vrai

    def test_acheminer_refuse_un_403(self):
        # Robot exclu du groupe : inutile de s'acharner sur ce message.
        def urlopen_403(req, timeout=None):
            raise urllib.error.HTTPError(
                req.full_url, 403, "bot was kicked", {}, io.BytesIO(b"{}"))
        vrai = urllib.request.urlopen
        urllib.request.urlopen = urlopen_403
        try:
            self.assertEqual(TransportTelegram("J", 111).acheminer("x"), "refuse")
        finally:
            urllib.request.urlopen = vrai

    def test_acheminer_reseau_sur_incident_passager(self):
        # Un 5xx est passager : on garde le message et on réessaiera.
        def urlopen_500(req, timeout=None):
            raise urllib.error.HTTPError(
                req.full_url, 500, "Internal Server Error", {}, io.BytesIO(b"{}"))
        vrai = urllib.request.urlopen
        urllib.request.urlopen = urlopen_500
        try:
            self.assertEqual(TransportTelegram("J", 111).acheminer("x"), "reseau")
        finally:
            urllib.request.urlopen = vrai

    def test_decoupage_des_messages_longs(self):
        morceaux = TransportTelegram._decouper("ligne\n" * 2000)
        self.assertGreater(len(morceaux), 1)
        self.assertTrue(all(len(m) <= 3900 for m in morceaux))
        self.assertEqual(sum(m.count("ligne") for m in morceaux), 2000)


class VersionVisible(unittest.TestCase):
    """Savoir quelle version tourne réellement.

    Sans cette information, « le correctif n'existe pas » et « le correctif
    existe mais le Pi ne l'a pas » se ressemblent exactement vus depuis
    Telegram. C'est ce qui rend un défaut déjà corrigé impossible à clore."""

    def test_version_toujours_lisible(self):
        from totem.version import version
        self.assertTrue(version())
        self.assertIsInstance(version(), str)

    def test_version_annoncee_dans_le_diagnostic(self):
        from totem.version import version
        r, t, _ = robot()
        r._diagnostic()
        self.assertIn(version(), t.envois[-1][0])


class MenuBrut(unittest.TestCase):
    """`/brut` montre la réponse de l'opérateur telle qu'elle est arrivée.

    Une capture d'écran ne montre ni les fins de ligne, ni les espaces, ni les
    caractères exotiques — or c'est là que se cachent les défauts d'affichage."""

    def test_sans_menu_recu(self):
        r, t, _ = robot()
        r._brut()
        self.assertIn("No menu received", t.envois[-1][0])

    def test_montre_le_texte_exact_et_le_verdict(self):
        r, t, modem = robot("Orange")
        modem.menu_principal = MENU_ORANGE_REEL
        tape(r, "#150#")
        r._brut()
        rapport = t.envois[-1][0]
        self.assertIn("Modifier code secret", rapport)
        self.assertIn(r"\n", rapport)              # les fins de ligne sont visibles
        self.assertIn("Options recognized", rapport)
        self.assertIn("<b>no</b>", rapport)        # pavé non déclenché

    def test_conserve_apres_fermeture_de_session(self):
        r, t, _ = robot()
        tape(r, "*126#")
        clic(r, "u:5")
        clic(r, "u:1")                              # la session se referme
        self.assertFalse(r.session_ussd)
        r._brut()
        self.assertIn("Votre solde", t.envois[-1][0])


class RolesEtAcces(unittest.TestCase):
    def test_observateur_ne_pilote_pas(self):
        r, t, _ = robot(admins=(1,))
        tape(r, "*126#", utilisateur=2)
        self.assertIn("🔒", t.envois[-1][0])
        self.assertFalse(r.session_ussd)

    def test_observateur_peut_consulter(self):
        r, t, _ = robot(admins=(1,))
        tape(r, "/rapport", utilisateur=2)
        self.assertIn("Last 24 hours", t.envois[-1][0])

    def test_refus_journalise(self):
        r, _, _ = robot(admins=(1,))
        tape(r, "*126#", utilisateur=2)
        evenements = [x[0] for x in r.journal.conn.execute("SELECT texte FROM evenements")]
        self.assertTrue(any("refus" in e for e in evenements))


class VarianteFrancaise(unittest.TestCase):
    """La même expérience en français, quand totem.conf le demande.

    L'anglais est la langue par défaut ; ces cas vérifient que la bascule
    change bien les textes ET la façon d'écrire les montants."""

    def setUp(self):
        from totem import textes
        textes.definir_langue("fr")
        self.addCleanup(textes.definir_langue, "en")

    def test_rapport_en_francais(self):
        r, t, _ = robot()
        tape(r, "/rapport")
        self.assertIn("Dernières 24 h", t.envois[-1][0])
        self.assertIn("Encaissements :", t.envois[-1][0])

    def test_montants_a_la_francaise(self):
        r, t, _ = robot(seuil_confirmation=25000)
        tape(r, "*126#"); clic(r, "u:1"); tape(r, "677000111"); tape(r, "50000")
        self.assertIn("Confirmation demandée", t.dernier_texte())
        self.assertIn("50 000 FCFA", t.dernier_texte())

    def test_alerte_memoire_en_francais(self):
        r, t, modem = robot()
        modem.memoire_sms = lambda: (45, 50)
        r._verifier_memoire()
        self.assertIn("Mémoire SMS presque pleine", t.envois[-1][0])

    def test_encaissement_annonce_en_francais(self):
        r, t, _ = robot()
        r._notifier_sms(r.comptes[0], "MoMo", "Vous avez recu 25 000 FCFA de A.")
        self.assertIn("Encaissement", t.envois[-1][0])

    def test_le_pin_reste_masque_dans_les_deux_langues(self):
        """« **** » n'est pas un texte à traduire : c'est la règle."""
        r, _, _ = robot()
        tape(r, "*126#"); clic(r, "u:1"); tape(r, "677000111"); tape(r, "50000")
        for chiffre in "1234":
            clic(r, f"p:{chiffre}")
        clic(r, "p:ok")
        journalises = [x[0] for x in r.journal.conn.execute("SELECT texte FROM ussd")]
        self.assertNotIn("1234", journalises)
        self.assertIn("****", journalises)


if __name__ == "__main__":
    unittest.main(verbosity=2)
