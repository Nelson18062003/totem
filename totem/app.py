# -*- coding: utf-8 -*-
"""Orchestrateur TOTEM — pilote un ou plusieurs comptes Mobile Money.

Fils d'exécution :
  - boucle principale : messages et clics du propriétaire (commandes + USSD)
  - surveillance : SMS entrants de TOUS les comptes, santé des modems,
    rapport quotidien, expiration de la session USSD

Chaque compte a son propre modem : les réseaux sont écoutés en permanence,
donc aucun paiement ne peut passer inaperçu, quel que soit l'opérateur.

L'expérience Telegram repose sur trois idées :
  1. **Boutons** — les menus MoMo deviennent des boutons cliquables ; plus
     besoin de deviner « 5 » puis « 1 ». Les clics passent même quand le mode
     confidentialité du robot est actif dans un groupe.
  2. **Une seule carte vivante** — la session USSD se met à jour en place,
     comme l'écran d'un téléphone, au lieu d'empiler les messages.
  3. **Le PIN ne touche jamais la conversation** — il se compose sur un pavé
     numérique en boutons ; seul le nombre d'étoiles est affiché.
"""

import os
import re
import shutil
import signal
import tempfile
import threading
import hashlib
import time
from datetime import datetime, timedelta, timezone

from .analyse_sms import (analyser, categoriser, formater_montant,
                          masquer_le_code, solde_annonce)
from .declencheur import (RefusRecu, SOLDE, TRANSFERT, motif_du_menu,
                          motif_du_sms, motif_selon_nature, raison_du_refus)
from .recu import (heure_en_lettres, numero_de_recu, numero_lisible,
                   recu_solde, recu_transfert)
from .codes import catalogue, cle as cle_code
from .compte import TELEGRAM, ErreurModem, SessionTenue, libelles_uniques
from .courrier import Facteur
from .mise_en_forme import bloc, echap, gras, italique, mono
from .notification import (PEUT_ETRE_PARTIE, composer, composer_rattrapage,
                           envoyer, lire_les_accuses)
from .nuage import lire_instant
from .storage import demarrage_courant

# Combien de secondes laisser à Apple et Google avant de lire leurs accusés.
# Ils reviennent d'ordinaire en quelques secondes ; on attend dans un fil à
# part, rien ne patiente derrière.
ATTENTE_DES_ACCUSES = 20
# Une sonnerie retenue par une coupure ne repart que si elle a moins de ce
# délai : au-delà, elle n'annonce plus rien — le propriétaire a eu le temps
# d'ouvrir l'application. Son âge se mesure sans l'heure murale du Pi (voir
# `age_de_la_sonnerie`).
SONNERIE_PERIMEE_S = 30 * 60
from .pilotage import Pilotage, RE_VARIABLE
from .sante import Sante, sauvegarder_journal
from .textes import langue_active, t
from .version import version

ARRET_PROPRE = "arrêt propre"

RE_CODE_USSD = re.compile(r"^[\*#][\d\*#]+#$")
# « mtn *126# » : viser un compte sans changer le compte courant
RE_CIBLE_USSD = re.compile(r"^(\w[\w\s]{0,14}?)\s+([\*#][\d\*#]+#)$")
# Vocabulaire d'une demande de code, volontairement LARGE.
#
# Se tromper n'a pas le même coût dans les deux sens :
#   - masquer une saisie qui n'était pas secrète : sans conséquence ;
#   - laisser passer un code en clair : il s'écrit dans la conversation.
# On masque donc au moindre doute. « Entrez votre code », « Enter your Orange
# Money code », « Veuillez entrer votre MDP » doivent tous déclencher le pavé.
RE_DEMANDE_CODE = re.compile(
    # « NIP » — Numéro d'Identification Personnel — est le mot COURANT pour le
    # code secret Mobile Money en Afrique francophone, plus courant que « PIN »
    # ou « code secret ». Il manquait : « Veuillez saisir votre NIP » n'ouvrait
    # donc pas le pavé sécurisé, le code se tapait dans la conversation, en
    # clair, et s'inscrivait tel quel dans la table `ussd` — laquelle part dans
    # le fichier de sauvegarde posté sur Telegram. La quatrième fuite du code
    # secret, et par le mot le plus banal de tous.
    #
    # « \bpin\b » ne voyait ni « mPIN », ni « PINCODE », ni « PIN2 », ni
    # « PIN_MoMo » ; « secret » pas « clé secrète » ; « mot de passe » pas
    # « mot-de-passe ». Le même vocabulaire vit dans le noyau
    # (web/noyau/ussd.ts, RE_SECRET).
    r"\bn\.?i\.?p\.?\b|(?:\b|m|e-?)pin(?:\d|_|code|\b)|\bp\.i\.n\b|\bmdp\b"
    r"|\bcodes?\b|secr[eè]t|confidentiel|confidential|mot[\s-]*de[\s-]*passe"
    r"|password|passcode|passphrase",
    re.I)
# Une option de menu : « 1. Texte », « 2) Texte », « 3- Texte », « 04 : Texte ».
# Le séparateur est obligatoire, sinon « 1 000 FCFA » passerait pour une option.
# Le « : » est admis — des opérateurs l'emploient — mais il sépare AUSSI les
# heures : « 10:44 » n'est pas un choix de menu. On écarte donc ce qui a la
# forme d'un horodatage, faute de quoi l'heure en tête d'un message d'opérateur
# se change en bouton, et surtout désarme la garde du code secret ci-dessous.
#
# On n'écarte QUE l'heure (« 10:44 ») et la date (« 12-05-2026 ») : la première
# version refusait tout libellé commençant par deux chiffres, et « 1. 50 Mo »,
# « 2. 25 000 F » cessaient d'être des choix. Même règle dans le noyau
# (web/noyau/ussd.ts, SEPARATEUR).
RE_OPTION = re.compile(
    r"^\s*(\d{1,2})\s*"
    r"(?:[.)\-]\s*(?!\d{1,2}[.\-/](?:\d{4}\b|\d{1,2}(?![\d.,])))"
    r"|:\s*(?!\d{2}(?:\D|$)))"
    r"(\S.*)$")
# UN MENU A AU MOINS DEUX CHOIX. Une seule ligne numérotée ne fait pas un menu.
MENU_MINIMUM = 2
# LA GARDE DU CODE regarde ce qui est DEMANDÉ, pas seulement s'il y a des
# options : MTN et Orange posent « 0. Retour / 00. Accueil » au pied de leur
# écran du code secret, et ces deux lignes suffisaient à faire « un menu » —
# pas de pavé, le code se tapait dans la conversation, entrait dans un
# raccourci rejouable et s'écrivait en clair au journal. La même règle vit
# dans le noyau (web/noyau/ussd.ts, `codeDemande`).
RE_NAVIGATION = re.compile(
    r"^(?:next|suivant|suite|la\s+suite|page\s+suivante|nxt|more|plus|back|retour"
    r"|pr[ée]c[ée]dent|previous|prev|accueil|home|main\s+menu|menu|confirm(?:er)?"
    r"|valider|annuler|cancel|quitter|exit|oui|non|yes|no)\b", re.I)
_VERBES_SAISIE = (r"entre[zr]|saisi(?:r|ssez)|tape[zr]|indique[zr]|r[ée]pond|veuillez"
                  r"|compose[zr]|renseigne[zr]|\benter\b|\btype\b|reply|please|input"
                  r"|provide|\bdial\b")
RE_SAISIE = re.compile(_VERBES_SAISIE + r"|[?:]\s*$", re.I)
RE_VERBE_CHOIX = re.compile(r"choisi(?:r|ssez)|choose|select", re.I)
# Une phrase qui NOMME le code sans le demander : une mise en garde, ou un
# code qu'on vous DONNE (« Code de retrait : 4821 »).
RE_MISE_EN_GARDE = re.compile(
    r"jamais|never|ne\s+(?:le\s+|la\s+|les\s+)?(?:partag|communiqu|divulgu|donn"
    r"|transm|r[ée]v[ée]l)|do\s+not\s+(?:share|disclose|give)"
    r"|don'?t\s+(?:share|disclose|give)", re.I)
RE_CODE_DONNE = re.compile(
    r"(?:\bcodes?\b|\bpin\b|\bn\.?i\.?p\b)(?:\s+(?:de|du|d'|of|for)\s*[A-Za-zÀ-ÿ']+){0,2}"
    r"\s*(?::|=|est|is)?\s*\d{4,}", re.I)


def _phrases(texte):
    """Les phrases d'un texte — une par ligne, et coupées après . ! ? ;"""
    return [p.strip() for p in re.sub(r"([.!?;])[ \t]+", r"\1\n", texte).split("\n")
            if p.strip()]


# Invites qui précèdent une saisie de montant ou de bénéficiaire : elles
# permettent de rappeler à l'écran ce qu'on s'apprête réellement à valider.
RE_DEMANDE_MONTANT = re.compile(r"montant|somme|amount|how\s+much|\bsum\b", re.I)
RE_DEMANDE_DESTINATAIRE = re.compile(
    r"num[ée]ro|b[ée]n[ée]ficiaire|destinataire|recipient|number|beneficiary"
    r"|receiver|payee|phone", re.I)

ADMIN = "admin"
PAVE_PIN = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]]
VERIF_MEMOIRE_SECONDES = 300
# Délai minimal entre deux alertes de conflit de jeton. Le problème se
# règle à la main sur le Pi ; le répéter plus souvent ne ferait
# qu'ensevelir les vraies notifications sous les avertissements.
INTERVALLE_CONFLIT = 3600
# Un échange de SIM demande d'ouvrir le boîtier : inutile de guetter à la
# seconde. Une minute suffit pour que l'annonce paraisse immédiate.
VERIF_CARTES_SECONDES = 60
SEUIL_MEMOIRE = 0.8        # on alerte bien avant la saturation
# Le délai entre l'annonce du SMS et le reçu qui la suit. Assez pour que les
# deux messages ne se bousculent pas dans la conversation ni dans les limites
# de Telegram, assez peu pour qu'on n'ait pas le temps de s'impatienter.
#
# CE DÉLAI NE VAUT QUE POUR TELEGRAM. Il retardait aussi le dépôt sur la
# plateforme, qui n'avait lieu qu'APRÈS l'envoi Telegram : le téléphone
# attendait dix secondes de délai, un tour de surveillance, puis Telegram —
# et rien du tout si Telegram était en panne. La plateforme reçoit
# maintenant le document dès qu'il est inscrit (voir `_fil_du_depot`).
DELAI_RECU = 10
# Le fil du dépôt dort au plus ce temps quand rien ne l'appelle : c'est le
# filet qui rattrape un réveil perdu. Après un accroc réseau, il réessaie
# vite, puis de moins en moins souvent, jusqu'à ce plafond.
PAUSE_DEPOT = 30
PREMIERE_REPRISE_DEPOT = 2
# Une demande de l'application attend au plus ce temps que le fil du dépôt
# ait fini son lot. Au-delà, elle répond « en route » : le fil s'en charge.
ATTENTE_DU_FIL = 5
# Le nom du fil : un test vérifie que le démarrage du robot le lance.
FIL_DU_DEPOT = "dépôt des reçus"
# Le nom commercial du service, tel qu'il apparaît en pied de reçu.
SERVICES = {"Orange": "Orange Money", "MTN": "MTN MoMo"}

# Les descriptions portent leurs deux langues côte à côte ; elles ne sont
# résolues qu'au moment de publier, la langue étant fixée après l'import.
COMMANDES_BOT = [
    ("menu", ("Home screen with the buttons",
              "Écran d'accueil avec les boutons")),
    ("statut", ("Modems, SIM cards and signal",
                "État des modems, des SIM et du signal")),
    ("comptes", ("Choose which account to drive",
                 "Choisir le compte piloté")),
    ("sims", ("The SIM cards we know, and the one inserted",
              "Les cartes SIM connues et celle en place")),
    ("raccourcis", ("Your buttons: create or remove one",
                    "Vos boutons : en créer, en supprimer")),
    ("sms", ("The latest text messages",
             "Les derniers SMS reçus")),
    ("rapport", ("The last 24 hours at a glance",
                 "Bilan des dernières 24 h")),
    ("export", ("CSV log of the last 7 days",
                "Journal des 7 derniers jours en CSV")),
    ("reglages", ("Each SIM's number and name",
                  "Le numéro et le nom de chaque puce")),
    ("diagnostic", ("Detailed status (version, SMS storage, cards)",
                    "État détaillé (version, mémoire SMS, cartes)")),
    ("brut", ("The last menu exactly as the operator sent it",
              "Voir le dernier menu tel que l'opérateur l'a envoyé")),
    ("sauvegarde", ("Send a copy of the records to the conversation",
                    "Envoyer une copie du journal dans la conversation")),
    ("annuler", ("Close the current USSD session",
                 "Fermer la session USSD en cours")),
    ("redemarrer_modem", ("Restart the modem of the active account",
                          "Relancer le modem du compte courant")),
    ("aide", ("Help", "Aide")),
]


class NumeroDeRecu(str):
    """Le numéro d'un reçu rendu à une demande de l'application, avec ce qui
    lui est arrivé (`etat`) : « inchange », « depose » ou « en_route »."""
    etat = None


def empreinte_de(pdf):
    """L'empreinte d'un document : ce qui dit, sans le relire, si celui qu'on
    vient de refaire est celui que la plateforme a déjà. Un PDF de TOTEM est
    déterministe — mêmes entrées, mêmes octets."""
    return hashlib.sha256(bytes(pdf)).hexdigest()


def _accord(nb, singulier_en, pluriel_en, singulier_fr, pluriel_fr):
    """« 1 payment » / « 2 paiements » : le nombre et son mot, accordés
    dans la langue active."""
    return t(f"{nb} {singulier_en if nb == 1 else pluriel_en}",
             f"{nb} {singulier_fr if nb == 1 else pluriel_fr}")


# Le titulaire des menus ouverts depuis Telegram : les administrateurs du
# robot, sans distinction — le robot ne mène qu'une session Telegram à la fois.
TITULAIRE_TELEGRAM = (TELEGRAM, None)


class Robot:
    # Un fil par carte (« un poste ») relève ses SMS et relit sa puce. Tant
    # qu'ils ne sont pas lancés (essais, démo), le tour de surveillance le
    # fait lui-même, carte après carte, comme avant. Au niveau de la classe :
    # un robot construit sans son __init__ (les essais) le porte aussi.
    postes = False

    def __init__(self, comptes, transport, journal, nom="TOTEM",
                 heure_rapport="21:00", pause_sms=10, raccourcis=None,
                 delai_session=180, chemin_base=None, nuage=None,
                 seuil_confirmation=0, sauvegarde_quotidienne=True,
                 numeros=None, recus=True):
        self.comptes = libelles_uniques(list(comptes))
        self.transport = transport
        self.journal = journal
        self.facteur = Facteur(journal, transport,
                               sur_abandon=self._courrier_abandonne)
        self.seuil_confirmation = seuil_confirmation
        self.sauvegarde_quotidienne = sauvegarde_quotidienne
        self.nom = nom
        self.heure_rapport = heure_rapport
        self.pause_sms = pause_sms
        self.raccourcis = raccourcis or {}
        self.delai_session = delai_session
        self.chemin_base = chemin_base
        self.nuage = nuage      # None ou non configuré : le robot ignore le cloud
        # Ce que le guichet des notifications a répondu la dernière fois. On
        # ne journalise que les CHANGEMENTS : une clé manquante refuserait
        # sinon chaque paiement, et noierait le journal sous la même phrase.
        self._souci_sonnerie = None
        if self.nuage is not None:
            # Quand la base refuse un paiement, le propriétaire doit l'apprendre
            # sur Telegram — sinon un SMS cesse d'apparaître sur la plateforme
            # sans que rien ne le dise.
            self.nuage.sur_incident = self._incident_cloud
            # Et le nuage reçoit nos numéros : le sens d'un transfert
            # (reçu/envoyé) part ainsi jusqu'à la plateforme, au lieu d'un
            # éternel « à confirmer ».
            self.nuage.fournir_numeros = self._nos_numeros
            # Les sonneries qu'une coupure a retenues repartent au retour du
            # réseau, à la fin du tour de transmission qui a monté leurs SMS
            # — le premier signe de vie qui passe le réveille sans attendre.
            # Avant, elles partaient du signe de vie lui-même : le téléphone
            # sonnait, on ouvrait l'application, et les paiements annoncés
            # n'y étaient pas encore.
            self.nuage.apres_transmission = self._rejouer_les_sonneries
        # Un seul rattrapage de sonneries à la fois.
        self._rattrapage = threading.Lock()
        self.pilotage = None    # le guichet à distance, démarré avec le nuage
        # Les numéros des puces, déclarés dans la configuration. Une SIM
        # prépayée ne dit presque jamais le sien : sans cette liste, TOTEM ne
        # sait pas de quel côté d'un transfert il se trouve.
        self.numeros = dict(numeros or {})
        self.recus = recus      # joindre un reçu PDF aux opérations comprises
        # Le dépôt des reçus sur la plateforme a son propre fil, réveillé dès
        # qu'un reçu est inscrit. Un seul passage à la fois ; Telegram, de
        # son côté, a son verrou — l'un ne fait jamais attendre l'autre.
        self._reveil_depot = threading.Event()
        self._verrou_depot = threading.Lock()
        self._verrou_envoi = threading.Lock()
        self.actif = True
        self.verrou = threading.RLock()
        self.courant = self.comptes[0] if self.comptes else None
        self.sante = Sante()
        self.memoire_signalee = False
        self.conflit_signale = False
        # Assez ancien pour que la toute première alerte passe.
        self.dernier_conflit = -INTERVALLE_CONFLIT
        self._dernier_avert_courrier = 0.0   # anti-répétition de l'alerte facteur
        self._dernier_avert_cloud = 0.0      # anti-répétition de l'alerte cloud
        # Échéanciers du tour de surveillance (cartes, santé, mémoire).
        self._prochaine_sante = 0
        self._prochaine_memoire = 0
        self._prochaines_cartes = 0
        self.demarre_a = time.time()
        self.dernier_brut = ""   # dernière réponse USSD, pour /brut
        # Le parcours de la dernière session, gardé le temps d'en faire un
        # bouton — il doit donc survivre à la réinitialisation de session.
        self.trace_a_enregistrer = []
        self.attente_nom = False
        # Une saisie de réglage en cours : (« num » ou « nom », ICCID visé).
        # Le robot ne demande jamais deux choses à la fois.
        self.attente_identite = None
        self.canal_identite = None
        # Un redémarrage après l'heure du bilan ne doit pas en déclencher un.
        self.dernier_rapport = (datetime.now().date()
                                if self._heure_passee() else None)
        self._reinitialiser_session()
        self._relire_sms_si_lecteur_change()

    def _relire_sms_si_lecteur_change(self):
        """Quand le lecteur de SMS s'améliore, les messages passés sont relus.

        La plateforme affiche ce que le robot a compris au moment de l'envoi.
        Si une mise à jour apprend au lecteur une forme nouvelle (le transfert
        anglais d'Orange, par exemple), les lignes déjà transmises resteraient
        à moitié lues pour toujours. Alors : l'empreinte du lecteur est
        mémorisée, et dès qu'elle change, tous les SMS repartent dans la file
        du cloud — chacun est relu à l'envoi, et la ligne se met à jour
        (« merge »). Le texte d'origine, lui, ne bouge jamais ; la nature
        choisie et les lectures faites sur la plateforme non plus.
        """
        try:
            import hashlib

            from . import analyse_sms, declencheur
            h = hashlib.sha1()
            # Les deux fichiers qui LISENT : l'analyseur des SMS et la règle
            # des reçus. L'un ou l'autre change → tout se relit.
            for module in (analyse_sms, declencheur):
                with open(module.__file__, "rb") as source:
                    h.update(source.read())
            # Nos numéros font aussi partie de la lecture : déclarer celui
            # d'une carte tranche le sens des transferts à deux parties —
            # sans lui dans l'empreinte, l'historique gardait pour toujours
            # ses « sens à confirmer » alors que les nouveaux SMS savaient.
            h.update("|".join(sorted(self._nos_numeros())).encode("utf-8"))
            empreinte = h.hexdigest()
            if self.journal.lire_memo("empreinte_lecteur") == empreinte:
                return
            relus = self.journal.remettre_sms_a_transmettre()
            repris = self._reprendre_vieux_recus()
            self.journal.ecrire_memo("empreinte_lecteur", empreinte)
            if relus or repris:
                self.journal.evenement(t(
                    f"the SMS reader changed: {relus} past message(s) "
                    f"re-read and re-sent, {repris} receipt(s) redone under "
                    "their true type",
                    f"le lecteur de SMS a changé : {relus} message(s) "
                    f"relu(s) et retransmis, {repris} reçu(s) refait(s) "
                    "sous leur vrai type"))
        except Exception:
            # Ne jamais empêcher le robot de démarrer pour une relecture :
            # elle retentera au prochain démarrage.
            pass

    def _reprendre_vieux_recus(self):
        """Refait les reçus archivés dont la lecture a changé.

        Le cas vécu : un transfert anglais, incompris à l'époque, avait
        laissé un reçu de SOLDE archivé — et l'icône de la plateforme sert
        ce document-là pour toujours. Quand le lecteur change, chaque reçu
        né d'un SMS (et sans nature posée à la main, qui ne se discute pas)
        est relu : si le genre a changé, la ligne est corrigée et le
        document se ré-archive sous le même numéro. Telegram, lui, garde ce
        qu'il a reçu : pas de renvoi.
        """
        repris = 0
        for (identifiant, source_id, genre, numero,
             nature) in self.journal.recus_a_relire():
            texte = self.journal.texte_sms(source_id)
            if not texte:
                continue
            motif = motif_du_sms(texte, numeros=self._nos_numeros())
            if nature:
                # Le choix du propriétaire ne se discute pas : même genre,
                # mais le CONTENU (montant, référence, parties) peut avoir
                # changé avec la lecture — le document se refait à neuf.
                if motif_selon_nature(motif, nature) is None:
                    continue
                self.journal.rearchiver_recu(identifiant)
            elif motif is None:
                continue
            elif motif.genre != genre:
                self.journal.corriger_genre_recu(identifiant, motif.genre,
                                                 motif.reference)
            else:
                # Même genre, mais un montant ou une référence a pu bouger
                # avec la nouvelle lecture : on ne compare pas, on refait.
                self.journal.rearchiver_recu(identifiant)
            repris += 1
        return repris

    def _heure_passee(self):
        try:
            heure, minute = (int(x) for x in self.heure_rapport.split(":"))
        except ValueError:
            return True
        maintenant = datetime.now()
        return (maintenant.hour, maintenant.minute) >= (heure, minute)

    @property
    def multi(self):
        return len(self.comptes) > 1

    @property
    def session_ussd(self):
        return self.session_compte is not None

    def _reinitialiser_session(self):
        self.session_compte = None   # le compte qui porte la session en cours
        self.dernier_menu = ""
        self.msg_session = None
        self.canal_session = None
        self.pin_actif = False
        self.pin_tampon = ""
        self.saisie_tampon = ""          # ce qui se compose sur le pavé libre
        self.file_macro = []
        self.dernier_echange = time.time()
        self.montant_session = None      # montant saisi pendant la session
        self.destinataire_session = ""   # bénéficiaire saisi pendant la session
        self.attente_saisie = ""         # ce que l'opérateur vient de demander
        self.confirme = False            # grosse sortie déjà confirmée ?
        # Trace de la session : les étapes rejouables telles quelles, pour
        # pouvoir en faire un bouton. Elle se ferme dès qu'une donnée
        # personnelle est demandée — voir _fermer_trace.
        self.trace = []
        self.trace_ouverte = True
        self.trace_rejouee = False       # session lancée par un raccourci ?

    def _aide(self):
        lignes = [
            f"🗿 {gras(self.nom)}", "",
            t("The easiest way: /menu, then everything works by tapping.",
              "Le plus simple : /menu, puis tout se fait au doigt."), "",
            gras(t("Your own buttons", "Vos propres boutons")),
            t("Do an operation once — check the balance, for example. At the "
              "end, tap " + gras("💾 Save as a button") + ": the whole journey "
              "becomes a shortcut, and you will never have to retype the menu "
              "numbers again. Buttons follow the card's network: Orange ones "
              "do not show up with an MTN SIM.",
              "Faites une opération une fois — consulter le solde, par exemple. "
              "À la fin, appuyez sur " + gras("💾 En faire un bouton") + " : le "
              "parcours devient un raccourci, et vous n'aurez plus jamais à "
              "retaper les chiffres du menu. Les boutons suivent l'opérateur de "
              "la carte : ceux d'Orange n'apparaissent pas avec une puce MTN."),
            "",
            gras(t("USSD codes", "Codes USSD")),
            t(f"Send {mono('*126#')} (or any other code): the menu opens as "
              "buttons. Free questions (a number, an amount) are answered "
              "with a normal message. The PIN is typed on the secure pad: it "
              "never appears in the conversation.",
              f"Envoyez {mono('*126#')} (ou tout autre code) : le menu s'ouvre "
              "sous forme de boutons. Les questions libres (numéro, montant) se "
              "répondent par un message normal. Le code PIN se tape sur le pavé "
              "sécurisé : il n'apparaît jamais dans la conversation."),
        ]
        if self.multi:
            lignes += [
                "", gras(t("Several accounts", "Plusieurs comptes")),
                t(f"{mono('mtn *126#')} — target an account without switching "
                  "the active one",
                  f"{mono('mtn *126#')} — viser un compte sans changer de compte courant"),
                t("/comptes — list the accounts and switch",
                  "/comptes — liste des comptes et bascule"),
                t("Each SIM card keeps its own records: switching never mixes "
                  "the money.",
                  "Chaque carte SIM garde son propre journal : en changer ne "
                  "mélange pas les caisses."),
            ]
        lignes += [
            "", gras(t("Commands", "Commandes")),
            t("/menu — home screen", "/menu — écran d'accueil"),
            t("/statut — signal, network, SIM", "/statut — signal, opérateur, SIM"),
            t("/sims — the SIM cards we know, and the one inserted",
              "/sims — les cartes SIM connues, et celle en place"),
            t("/raccourcis — your buttons, and how to create one",
              "/raccourcis — vos boutons, et comment en créer"),
            t("/sms — the latest text messages",
              "/sms — les derniers SMS reçus"),
            t("/rapport — the last 24 hours at a glance",
              "/rapport — bilan des dernières 24 h"),
            t("/export — CSV log of the last 7 days",
              "/export — journal CSV des 7 derniers jours"),
            t("/annuler — close the USSD session",
              "/annuler — ferme la session USSD"),
            t("/redemarrer_modem — restart the active account's modem",
              "/redemarrer_modem — relance le modem du compte courant"),
            t("/aide — this message", "/aide — ce message"),
        ]
        return "\n".join(lignes)

    # ---- démarrage et arrêt ------------------------------------------------
    def demarrer(self, bloquant=True):
        if not self.comptes:
            self.transport.envoyer(
                t("⚠️ No modem detected. Check the USB connections.",
                  "⚠️ Aucun modem détecté. Vérifiez les branchements USB."))
            return
        # Lu AVANT de journaliser ce démarrage : si le dernier événement connu
        # n'est pas un arrêt propre, la fois d'avant s'est mal terminée
        # (coupure de courant ou plantage). C'est une information précieuse.
        precedent = self.journal.dernier_evenement()
        brutal = precedent is not None and ARRET_PROPRE not in precedent

        self._installer_arret_propre()
        self.transport.vider_backlog()      # ne jamais rejouer d'ancienne commande
        self.transport.publier_commandes(
            [(nom, t(en, fr)) for nom, (en, fr) in COMMANDES_BOT])
        self._recenser_cartes(silencieux=True)
        detail = "\n".join(f"· {echap(c.resume())}" for c in self.comptes)
        compte_accorde = _accord(len(self.comptes), "account", "accounts",
                                 "compte", "comptes")
        avertissement = (
            t("\n⚡ <i>Restarted after a power cut or a crash: the previous "
              "shutdown was not clean.</i>",
              "\n⚡ <i>Redémarrage après coupure de courant ou plantage : "
              "l'arrêt précédent n'était pas propre.</i>") if brutal else "")
        self.transport.envoyer(
            t(f"✅ {gras(self.nom)} online — {compte_accorde}\n"
              f"{detail}\nVersion: {mono(version())}{avertissement}",
              f"✅ {gras(self.nom)} en ligne — {compte_accorde}\n"
              f"{detail}\nVersion : {mono(version())}{avertissement}"),
            boutons=self._boutons_accueil(ADMIN))
        self.journal.evenement(f"démarrage ({len(self.comptes)} compte(s))")
        self._lancer_postes()
        threading.Thread(target=self._boucle_surveillance, daemon=True).start()
        if self.nuage:
            # Synchronisation en tâche de fond : elle rattrape son retard
            # quand le réseau le permet, et n'interrompt jamais le robot.
            self.nuage.demarrer(comptes=self.comptes, sante=self.sante)
            self.lancer_le_depot()
            # Le guichet à distance : l'application web dépose ses demandes
            # dans la base, ce fil les exécute sur les vraies SIM.
            self.pilotage = Pilotage(self.nuage, self.comptes, self.journal,
                                     programmeur=self._recu_apres_coup)
            self.pilotage.demarrer()
        if bloquant:
            self._boucle_messages()

    def _installer_arret_propre(self):
        """systemd envoie SIGTERM avant d'arrêter ou de redémarrer la machine :
        on en profite pour marquer le journal, afin que le prochain démarrage
        sache distinguer un arrêt voulu d'une coupure de courant."""
        def _arreter(signum, frame):
            self.arreter()
        for sig in (signal.SIGTERM, signal.SIGINT):
            try:
                signal.signal(sig, _arreter)
            except ValueError:
                pass    # pas dans le fil principal (démo, tests) : sans gravité

    def arreter(self):
        if not self.actif:
            return
        self.actif = False
        if self.pilotage:
            self.pilotage.arreter()
        self._reveil_depot.set()        # que le fil du dépôt voie l'arrêt
        self.journal.evenement(ARRET_PROPRE)

    # ---- messages et clics ------------------------------------------------
    def _boucle_messages(self):
        while self.actif:
            try:
                for entrant in self.transport.recevoir():
                    self._traiter(entrant)
            except KeyboardInterrupt:
                self.actif = False
            except Exception as e:  # ne jamais mourir sur un message
                self.journal.evenement(f"erreur boucle messages : {e}")
                time.sleep(2)

    def _comptes_par_nom(self, nom):
        """TOUS les comptes dont le libellé commence par ce nom (« mtn »),
        ou le compte au rang donné (« 2 »).

        L'appelant décide quoi faire s'il y en a plusieurs : avec deux
        cartes MTN, « /mtn » visait la première en silence — on demande,
        on ne devine pas."""
        n = nom.strip().lower().lstrip("/")
        if not n:
            return []
        if n.isdigit():
            i = int(n) - 1
            return [self.comptes[i]] if 0 <= i < len(self.comptes) else []
        return [c for c in self.comptes if c.libelle.lower().startswith(n)]

    def _compte_par_nom(self, nom):
        """Le compte visé quand l'ambiguïté est impossible (rang, clic de
        bouton) — la première carte trouvée sinon."""
        trouves = self._comptes_par_nom(nom)
        return trouves[0] if trouves else None

    def _demander_quelle_carte(self, trouves, nom, canal):
        """Plusieurs cartes répondent au même nom : la question, en boutons."""
        boutons = [[(c.libelle, f"a:{self.comptes.index(c) + 1}")]
                   for c in trouves]
        boutons.append([("🏠 Menu", "c:menu")])
        self.transport.envoyer(
            t(f"Several cards answer to “{echap(nom)}” — which one?",
              f"Plusieurs cartes répondent à « {echap(nom)} » — laquelle ?"),
            canal=canal, boutons=boutons)

    def _traiter(self, entrant):
        with self.verrou:
            if entrant.bouton:
                self.transport.accuser(entrant.callback_id)
            role = self.transport.role(entrant.utilisateur)
            canal = entrant.chat or None
            texte = entrant.texte.strip()

            if entrant.bouton:
                self._clic(texte, entrant, role, canal)
                return

            # Un réglage demandé attend sa réponse : « 696103864 » ne doit
            # pas être lu comme un code USSD, ni « WONDER PHONE » comme une
            # commande inconnue.
            if self.attente_identite and not texte.startswith("/"):
                if not self._verifier_admin(role, entrant, canal):
                    return
                self._enregistrer_identite(texte, canal)
                return

            # Une saisie attendue passe avant tout : sinon « Solde » serait
            # lu comme une commande inconnue et le nom serait perdu.
            if self.attente_nom and not texte.startswith("/"):
                if not self._verifier_admin(role, entrant, canal):
                    return
                self._enregistrer_raccourci(texte, canal)
                return

            commande = self._commande(texte)
            if commande in ("start", "menu"):
                self._accueil(canal, role)
            elif commande in ("aide", "help"):
                self.transport.envoyer(self._aide(), canal=canal,
                                       boutons=[[("🏠 Menu", "c:menu")]])
            elif commande == "statut":
                self._statut(canal)
            elif commande in ("comptes", "compte"):
                self._lister_comptes(canal, role)
            elif commande in ("reglages", "parametres", "numero"):
                if not self._verifier_admin(role, entrant, canal):
                    return
                self._reglages(canal)
            elif commande in ("sims", "cartes", "carte"):
                self._lister_cartes(canal)
            elif commande in ("raccourcis", "boutons"):
                self._lister_raccourcis(canal)
            elif commande == "sms":
                self._derniers_sms(canal, prive=entrant.prive)
            elif commande == "rapport":
                self._rapport(canal=canal, manuel=True)
            elif commande == "diagnostic":
                self._diagnostic(canal)
            elif commande == "brut":
                self._brut(canal)
            elif commande == "export":
                self._export(canal)
            elif commande and self._comptes_par_nom(commande):
                # /mtn, /orange, /1, /2 — bascule de compte courant
                if not self._verifier_admin(role, entrant, canal):
                    return
                trouves = self._comptes_par_nom(commande)
                if len(trouves) > 1:
                    # Deux cartes MTN : on demande laquelle, jamais la
                    # première en silence — c'est une caisse qu'on vise.
                    self._demander_quelle_carte(trouves, commande, canal)
                    return
                self.courant = trouves[0]
                self.transport.envoyer(
                    t(f"Active account: {gras(self.courant.libelle)}.",
                      f"Compte courant : {gras(self.courant.libelle)}."),
                    canal=canal, boutons=[[("🏠 Menu", "c:menu")]])
            elif commande in ("annuler", "redemarrer_modem", "sauvegarde") \
                    or RE_CODE_USSD.match(texte) \
                    or RE_CIBLE_USSD.match(texte) or self.session_ussd:
                if not self._verifier_admin(role, entrant, canal):
                    return
                self._action_admin(commande, texte, entrant, canal)
            else:
                self.transport.envoyer(
                    t("I did not understand. Open /menu or send a USSD code "
                      f"such as {mono('*126#')}.",
                      "Je n'ai pas compris. Ouvrez /menu ou envoyez un code USSD "
                      f"tel que {mono('*126#')}."), canal=canal)

    def _action_admin(self, commande, texte, entrant, canal):
        if commande == "sauvegarde":
            self._sauvegarde(canal)
        elif commande == "annuler":
            self._annuler(canal)
            return
        if commande == "redemarrer_modem":
            self._redemarrer_modem(self.courant, canal=canal)
            return

        # « mtn *126# » : exécution ciblée, sans changer le compte courant
        cible = RE_CIBLE_USSD.match(texte)
        if cible:
            trouves = self._comptes_par_nom(cible.group(1))
            if len(trouves) > 1:
                # Deux cartes du même réseau : le rang lève l'ambiguïté.
                return self.transport.envoyer(
                    t(f"Several cards answer to “{echap(cible.group(1))}”. "
                      f"Aim by rank — for example "
                      f"{mono(f'2 {cible.group(2)}')}.",
                      f"Plusieurs cartes répondent à « {echap(cible.group(1))} ». "
                      f"Visez par rang — par exemple "
                      f"{mono(f'2 {cible.group(2)}')}."),
                    canal=canal, boutons=[[("🏠 Menu", "c:menu")]])
            if trouves:
                return self._ouvrir_session(trouves[0], cible.group(2), canal)

        if RE_CODE_USSD.match(texte):
            return self._ouvrir_session(self.courant, texte, canal)

        # Réponse libre dans le menu en cours (numéro, montant… ou PIN tapé
        # à la main par habitude : dans ce cas on efface le message).
        compte = self.session_compte
        if compte is None:
            return
        if self.pin_actif:
            self.transport.supprimer(entrant.message_id, canal=canal)
            if self._confirmation_requise():
                # Même en tapant le code à la main, on ne saute pas la
                # confirmation d'une sortie importante.
                self._afficher_session(compte)
                return
            self.journal.ussd("envoyé", "****", compte.libelle,
                              compte.carte.iccid)
            self._fermer_trace()
        else:
            self._retenir_saisie(texte)
            # Un chiffre seul en réponse à un menu numéroté est une
            # navigation, donc rejouable. Tout le reste — un montant, un
            # numéro de bénéficiaire — appartient à cette opération-là.
            _, options = self._analyser_menu(self.dernier_menu)
            if options and texte.strip().isdigit():
                self._noter_trace(texte.strip())
            else:
                self._fermer_trace()
                # Réponse à une saisie libre : un montant, un numéro de
                # bénéficiaire. Ce n'est pas secret, mais ça n'a rien à faire
                # dans l'historique d'une conversation. Le pavé de boutons
                # évite le problème ; quand l'utilisateur tape quand même, on
                # efface derrière lui.
                self.transport.supprimer(entrant.message_id, canal=canal)
            self.journal.ussd("envoyé", texte, compte.libelle,
                              compte.carte.iccid)
        self._ussd(compte, texte, nouveau=False)
        self._avancer_macro()

    def _ouvrir_session(self, compte, code, canal):
        # Le guichet à distance s'efface devant Telegram — un humain est au
        # bout du fil. Il n'y a plus personne à prévenir : en composant ici,
        # la carte change de titulaire (voir `compte.py`), et la réponse
        # suivante de la plateforme — qui peut être un code secret — est
        # refusée par la carte elle-même, au moment d'écrire.
        # Un nouveau code composé, c'est une nouvelle opération : la trace
        # repart à zéro, sans quoi elle accumulerait deux parcours distincts.
        self.trace = []
        self.trace_ouverte = True
        self.trace_rejouee = False
        self._noter_trace(code)
        self.canal_session = canal
        self.msg_session = None
        self._ussd(compte, code, nouveau=True)

    def _clic(self, donnee, entrant, role, canal):
        genre, _, valeur = donnee.partition(":")
        if genre == "i":                      # réglage d'identité de carte
            if not self._verifier_admin(role, entrant, canal):
                return
            champ, _, iccid = valeur.partition(":")
            self._demander_identite(champ, iccid, canal)
            return

        # « c:reglages » ouvre l'écran qui montre le numéro et le nom déclarés
        # de chaque carte. Sa version TEXTE (« /reglages ») est réservée à
        # l'administrateur ; le bouton, lui, ne l'était pas. Dans un groupe
        # d'équipe, un simple observateur qui voit le menu de l'administrateur
        # pouvait donc cliquer et lire ces coordonnées. On aligne le bouton sur
        # la commande : même écran, même porte.
        if genre == "c" and valeur == "reglages":
            if not self._verifier_admin(role, entrant, canal):
                return
            self._reglages(canal)
            return

        if genre == "c" and valeur in ("menu", "statut", "sms", "rapport",
                                       "export", "aide", "comptes",
                                       "diagnostic", "sims"):
            {"menu": lambda: self._accueil(canal, role),
             "aide": lambda: self.transport.envoyer(self._aide(), canal=canal),
             "statut": lambda: self._statut(canal),
             "comptes": lambda: self._lister_comptes(canal, role),
             "sims": lambda: self._lister_cartes(canal),
             "sms": lambda: self._derniers_sms(canal),
             "rapport": lambda: self._rapport(canal=canal, manuel=True),
             "diagnostic": lambda: self._diagnostic(canal),
             "export": lambda: self._export(canal)}[valeur]()
            return

        if not self._verifier_admin(role, entrant, canal):
            return

        if genre == "c" and valeur == "ussd":
            cible = (t(f" on {gras(self.courant.libelle)}",
                       f" sur {gras(self.courant.libelle)}") if self.multi else "")
            self.transport.envoyer(
                t(f"⌨️ Send the code to dial{cible}, for example {mono('*126#')}.",
                  f"⌨️ Envoyez le code à composer{cible}, par exemple {mono('*126#')}."),
                canal=canal)
        elif genre == "c" and valeur == "annuler":
            self._annuler(canal)
        elif genre == "c" and valeur == "masquer":
            # L'utilisateur nous dit lui-même que la saisie est sensible.
            compte = self.session_compte
            if compte is not None and not self.pin_actif:
                self.pin_actif = True
                self.pin_tampon = ""
                self._afficher_session(compte)
        elif genre == "c" and valeur == "confirmer":
            if self._confirmation_requise() and self.session_compte:
                self.confirme = True
                self.journal.ussd("envoyé",
                                  f"[confirmation de {self.montant_session} FCFA]",
                                  self.session_compte.libelle)
                self._afficher_session(self.session_compte)
        elif genre == "c" and valeur == "sauvegarde":
            self._sauvegarde(canal)
        elif genre == "a":                      # bascule de compte
            compte = self._compte_par_nom(valeur)
            if compte:
                self.courant = compte
                self._accueil(canal, role)
        elif genre == "m":
            self._lancer_raccourci(valeur, canal)
        elif genre == "r":                      # raccourcis : créer, supprimer
            action, _, cible = valeur.partition(":")
            if action == "enr":
                self._demander_nom_raccourci(canal)
            elif action == "sup":
                self._supprimer_raccourci(cible, canal)
            elif action == "cat":
                self._installer_catalogue(canal)
            elif action == "liste":
                self._lister_raccourcis(canal)
        elif genre == "u":
            compte = self.session_compte
            if compte is None:
                return
            self.journal.ussd("envoyé", valeur, compte.libelle,
                              compte.carte.iccid)
            self._noter_trace(valeur)
            self._ussd(compte, valeur, nouveau=False)
            self._avancer_macro()
        elif genre == "p":
            self._pave(valeur)
        elif genre == "s":
            self._saisie(valeur)

    def _verifier_admin(self, role, entrant, canal):
        if role == ADMIN:
            return True
        self.journal.evenement(
            f"refus : {entrant.nom or entrant.utilisateur} a tenté « {entrant.texte} »")
        self.transport.envoyer(
            t("🔒 You can watch the SIM activity, but only administrators can "
              "drive them.",
              "🔒 Vous suivez l'activité des SIM, mais leur pilotage est réservé "
              "aux administrateurs."), canal=canal)
        return False

    @staticmethod
    def _commande(texte):
        """« /Statut@totem_bot » → « statut ». Sinon chaîne vide."""
        if not texte.startswith("/"):
            return ""
        return texte[1:].split()[0].split("@")[0].lower()

    # ---- écran d'accueil ---------------------------------------------------
    def _rangees_comptes(self):
        """Les boutons de compte, par rangées de quatre — le plafond de
        quatre cartes n'était qu'une rangée jamais repliée : huit cartes
        tiennent maintenant sur deux rangées."""
        boutons = [(("● " if c is self.courant else "") + c.libelle, f"a:{i + 1}")
                   for i, c in enumerate(self.comptes)]
        return [boutons[i:i + 4] for i in range(0, len(boutons), 4)]

    def _bilan_par_caisse(self):
        """Le bilan des 24 h, une ligne par caisse — jamais additionnées.

        Un total fusionné ne correspond à aucun solde réel dès qu'il y a
        deux cartes : chaque caisse a droit à sa ligne, y compris à zéro."""
        detail = self.journal.rapport_par_carte(
            self._cartes_en_place(), numeros=self._nos_numeros())
        par_iccid = {iccid: (nb, total) for iccid, _lib, nb, total in detail}
        lignes = []
        for c in self.comptes:
            iccid = c.carte.iccid if c.carte.identifiee else ""
            nb, total = par_iccid.pop(iccid, (0, 0))
            recettes = _accord(nb, "payment", "payments",
                               "encaissement", "encaissements")
            lignes.append(f"· {echap(c.libelle)} : {recettes} — "
                          f"{gras(self._fcfa(total))}")
        # Les SMS d'avant le cloisonnement, ou d'une carte depuis retirée :
        # ils comptent, mais pas dans la caisse d'une carte en place.
        restes_nb = sum(nb for nb, _ in par_iccid.values())
        restes_total = sum(total for _, total in par_iccid.values())
        if restes_nb:
            recettes = _accord(restes_nb, "payment", "payments",
                               "encaissement", "encaissements")
            lignes.append(t(f"· other cards: {recettes} — "
                            f"{gras(self._fcfa(restes_total))}",
                            f"· autres cartes : {recettes} — "
                            f"{gras(self._fcfa(restes_total))}"))
        return lignes

    def _boutons_accueil(self, role):
        lignes = []
        if self.multi:
            lignes.extend(self._rangees_comptes())
        raccourcis = self._raccourcis_actifs() if role == ADMIN else {}
        if raccourcis:
            noms = list(raccourcis)
            for i in range(0, len(noms), 2):
                lignes.append([(raccourcis[n]["libelle"], f"m:{n}")
                               for n in noms[i:i + 2]])
        lignes.append([(t("📥 SMS inbox", "📥 SMS reçus"), "c:sms"),
                       (t("📊 24 h report", "📊 Rapport 24 h"), "c:rapport")])
        lignes.append([(t("📡 Status", "📡 Statut"), "c:statut"),
                       (t("📄 CSV export", "📄 Export CSV"), "c:export")])
        if role == ADMIN:
            lignes.append([(t("⌨️ USSD code", "⌨️ Code USSD"), "c:ussd"),
                           (t("⚙️ Settings", "⚙️ Réglages"), "c:reglages")])
        lignes.append([(t("❓ Help", "❓ Aide"), "c:aide")])
        return lignes

    def _accueil(self, canal, role):
        etats = " · ".join(f"{echap(c.libelle)} {c.signal()}/31" for c in self.comptes)
        courant = (t(f"\nActive account: {gras(self.courant.libelle)}",
                     f"\nCompte piloté : {gras(self.courant.libelle)}")
                   if self.multi else "")
        if self.multi:
            # Une ligne par caisse : le total fusionné d'avant ne
            # correspondait à aucun solde réel dès la deuxième carte.
            bilan = (t("Last 24 hours:", "Dernières 24 h :")
                     + "\n" + "\n".join(self._bilan_par_caisse()))
        else:
            nb, total, _ = self.journal.rapport_du_jour(
                self._cartes_en_place(), numeros=self._nos_numeros())
            recettes = _accord(nb, "payment", "payments",
                               "encaissement", "encaissements")
            bilan = t(f"Last 24 hours: {gras(recettes)} — "
                      f"{gras(self._fcfa(total))}",
                      f"Dernières 24 h : {gras(recettes)} — "
                      f"{gras(self._fcfa(total))}")
        self.transport.envoyer(
            f"🗿 {gras(self.nom)}\n{etats}{courant}\n{bilan}\n\n"
            + t("What next?", "Que faire ?"),
            boutons=self._boutons_accueil(role), canal=canal)

    # ---- session USSD ------------------------------------------------------
    def _ussd(self, compte, texte, nouveau=False):
        try:
            if nouveau:
                self.journal.ussd("envoyé", texte, compte.libelle,
                              compte.carte.iccid)
                reponse = compte.ussd_demarrer(texte, qui=TITULAIRE_TELEGRAM)
            else:
                reponse = compte.ussd_repondre(texte, qui=TITULAIRE_TELEGRAM)
        except SessionTenue:
            # Le menu n'est plus à Telegram : il s'est refermé, ou une autre
            # main l'a ouvert sur la carte depuis. Rien n'est parti au réseau.
            self._cloturer_session(
                t(f"⚠️ [{echap(compte.libelle)}] This menu is no longer open "
                  "here — nothing was sent. Dial the code again.",
                  f"⚠️ [{echap(compte.libelle)}] Ce menu n'est plus ouvert "
                  "ici — rien n'a été envoyé. Recomposez le code."))
            return
        except ErreurModem as e:
            self._cloturer_session(f"⚠️ [{echap(compte.libelle)}] {echap(e)}")
            return
        except Exception as e:
            self.journal.evenement(f"erreur USSD {compte.libelle} : {e}")
            self._cloturer_session(
                t(f"⚠️ [{echap(compte.libelle)}] The modem did not answer.",
                  f"⚠️ [{echap(compte.libelle)}] Le modem n'a pas répondu."))
            return
        ussd_id = self.journal.ussd("reçu", reponse, compte.libelle,
                                    compte.carte.iccid)
        # Le solde ne passe presque jamais par un SMS : l'opérateur l'affiche
        # ici, et nulle part ailleurs. Sans cette ligne, appuyer sur « Solde »
        # ne produisait aucun reçu — c'est justement ce qu'on attendait d'elle.
        self._programmer_recu(ussd_id, reponse, source="ussd")
        self.dernier_menu = reponse
        # Conservée même après la fermeture de la session : c'est elle qu'on
        # relit quand un menu s'affiche mal.
        self.dernier_brut = reponse
        self.session_compte = compte if compte.session_ouverte else None
        self.pin_actif = bool(compte.session_ouverte and self._demande_un_code(reponse))
        self.pin_tampon = ""
        self.dernier_echange = time.time()
        self._noter_attente(reponse)
        if compte.session_ouverte:
            self._afficher_session(compte)
        else:
            entete = f"[{echap(compte.libelle)}]\n" if self.multi else ""
            self._cloturer_session(entete + bloc(reponse))

    @classmethod
    def _demande_un_code(cls, menu):
        """Vrai seulement si l'opérateur ATTEND une saisie de code secret.

        Un menu qui se contente de *parler* du code (« 5) Gerer mon code
        secret ») porte des options numérotées : c'est une navigation, pas une
        saisie. Chercher le seul mot « PIN » faisait apparaître le pavé au
        mauvais moment.

        MAIS UNE SEULE LIGNE NUMÉROTÉE NE FAIT PAS UN MENU, et c'est par là
        que le code fuyait. « 10:44 » en tête d'un message d'opérateur a la
        forme exacte d'une option ; « 1. Entrez votre code PIN » aussi. Le
        pavé ne s'ouvrait donc pas, le code se tapait dans la conversation,
        s'affichait en clair sur la carte de session, et s'inscrivait tel quel
        dans la table `ussd` — laquelle part ensuite dans le fichier de
        sauvegarde posté sur Telegram. Un menu, c'est au moins DEUX choix.

        ET DEUX LIGNES DE NAVIGATION NE FONT PAS UN MENU. « Entrez votre code
        secret / 0. Retour / 00. Accueil » : le code y est DEMANDÉ, le pavé
        s'ouvre. Une mise en garde (« Ne partagez jamais votre code ») ou un
        code qu'on vous donne (« Code de retrait : 4821 ») ne demande rien."""
        texte = (menu or "").replace("\r", "")
        entete, options = cls._analyser_menu(texte)
        if len(options) < MENU_MINIMUM:
            # Pas un menu : tout est sujet, rien n'est un choix.
            entete, options = [l.strip() for l in texte.split("\n") if l.strip()], []
        sujet = "\n".join(entete)
        if not RE_DEMANDE_CODE.search(sujet):
            return False
        # Mises en garde et codes donnés écartés — sauf s'ils demandent.
        utiles = [p for p in _phrases(sujet)
                  if RE_SAISIE.search(p)
                  or not (RE_MISE_EN_GARDE.search(p) or RE_CODE_DONNE.search(p))]
        nomme = [p for p in utiles if RE_DEMANDE_CODE.search(p)]
        if not nomme and not any(RE_SAISIE.search(p) for p in utiles):
            return False
        # UN CODE DEMANDÉ l'emporte sur les options ; un code seulement NOMMÉ
        # (« Gerer mon code secret ») laisse un vrai menu être un menu — la
        # navigation (« 0. Retour », « 00. Accueil ») n'en est pas un.
        vrais_choix = [o for o in options if not RE_NAVIGATION.match(o[1])]
        le_demande = any(RE_SAISIE.search(p) and not RE_VERBE_CHOIX.search(p)
                         for p in nomme)
        return not vrais_choix or le_demande

    @staticmethod
    def _analyser_menu(menu):
        """Sépare l'en-tête des options numérotées, sans rien perdre : toute
        ligne non reconnue comme option reste dans l'en-tête."""
        entete, options = [], []
        for ligne in re.split(r"\r\n|\r|\n", menu or ""):
            ligne = ligne.strip()
            if not ligne:
                continue
            m = RE_OPTION.match(ligne)
            if m:
                options.append((m.group(1), m.group(2).strip()))
            else:
                entete.append(ligne)
        return entete, options

    def _afficher_session(self, compte):
        """Réécrit la carte de session en place : une seule carte, vivante.

        Le menu est rendu tel que l'opérateur l'envoie, dans son cadre à
        chasse fixe, avec les boutons en dessous. C'est l'affichage retenu à
        l'usage : le texte complet reste lisible même quand le découpage en
        boutons ne reconnaît pas toutes les lignes."""
        etiquette = f" · {echap(compte.libelle)}" if self.multi else ""
        if self.pin_actif and self._confirmation_requise():
            texte, boutons = self._carte_confirmation(compte)
        elif self.pin_actif:
            texte, boutons = self._carte_pin(etiquette)
        else:
            options = self._analyser_menu(self.dernier_menu)[1]
            texte = (f"🗿 {gras(t('USSD session', 'Session USSD'))}{etiquette}\n"
                     f"{bloc(self.dernier_menu)}")
            if options:
                boutons = [[(f"{num}. {lib[:28]}", f"u:{num}")
                            for num, lib in options[i:i + 2]]
                           for i in range(0, len(options), 2)]
            else:
                # Saisie libre : montant, numéro, référence… Le robot ne peut
                # pas TOUJOURS savoir si ce qu'on lui demande est secret — les
                # opérateurs ne le disent nulle part dans le protocole. On
                # laisse donc toujours une porte de sortie sûre à portée de
                # doigt, plutôt que de parier sur le vocabulaire.
                return self._peindre(*self._carte_saisie(etiquette))
            boutons = boutons + [[(t("❌ Cancel", "❌ Annuler"), "c:annuler")]]
        self._peindre(texte, boutons)

    def _carte_saisie(self, etiquette=""):
        """Pavé de boutons pour une saisie libre : montant, numéro…

        Pourquoi des boutons plutôt que le clavier du téléphone : un message
        tapé dans Telegram **reste dans la conversation**. Le supprimer après
        coup ne suffit pas — il a existé, il a transité, et la suppression
        peut échouer. Un chiffre composé sur des boutons, lui, n'est jamais un
        message : il ne vit que dans la carte de session, qui se réécrit en
        place et disparaît avec elle.

        Contrairement au code secret, ce qui se compose ici s'affiche en
        clair : il faut pouvoir relire un montant avant de l'envoyer. Le
        bouton « 🔐 Masquer » reste à portée si la demande s'avère sensible.
        """
        titres = {"montant": t("💰 Amount", "💰 Montant"),
                  "destinataire": t("📱 Number", "📱 Numéro")}
        titre = titres.get(self.attente_saisie, t("✍️ Your answer", "✍️ Saisie"))
        boutons = [[(c, f"s:{c}") for c in ligne] for ligne in PAVE_PIN]
        boutons.append([("*", "s:*"), ("0", "s:0"), ("#", "s:#")])
        boutons.append([("⌫", "s:eff"), (t("✅ OK", "✅ Valider"), "s:ok")])
        boutons.append([(t("🔐 Hide", "🔐 Masquer"), "c:masquer"),
                        (t("❌ Cancel", "❌ Annuler"), "c:annuler")])
        return (
            t(f"{titre}{etiquette}\n{bloc(self.dernier_menu)}\n"
              f"Typed: {mono(self.saisie_tampon or '—')}\n"
              + italique("Use the buttons: nothing shows up in the "
                         "conversation. You can also reply with a message — "
                         "it will be deleted right away."),
              f"{titre}{etiquette}\n{bloc(self.dernier_menu)}\n"
              f"Saisi : {mono(self.saisie_tampon or '—')}\n"
              + italique("Composez sur les boutons : rien n'apparaît dans la "
                         "conversation. Vous pouvez aussi répondre par un "
                         "message — il sera effacé aussitôt.")), boutons)

    def _saisie(self, touche):
        """Une touche du pavé libre. Miroir de _pave, sans le masquage."""
        compte = self.session_compte
        if compte is None or self.pin_actif:
            return
        self.dernier_echange = time.time()
        etiquette = f" · {echap(compte.libelle)}" if self.multi else ""
        if touche == "eff":
            self.saisie_tampon = self.saisie_tampon[:-1]
        elif touche == "ok":
            if not self.saisie_tampon:
                return
            valeur, self.saisie_tampon = self.saisie_tampon, ""
            # Une saisie libre appartient à CETTE opération : le raccourci
            # s'arrête ici et mènera l'utilisateur jusqu'à la question.
            self._fermer_trace()
            self._retenir_saisie(valeur)
            self.journal.ussd("envoyé", valeur, compte.libelle,
                              compte.carte.iccid)
            self._peindre(t(f"{gras('Your answer')}{etiquette}\n⏳ Sending "
                            f"{mono(valeur)}…",
                            f"{gras('Saisie')}{etiquette}\n⏳ Envoi de "
                            f"{mono(valeur)}…"), [])
            self._ussd(compte, valeur, nouveau=False)
            self._avancer_macro()
            return
        elif len(self.saisie_tampon) < 32 and (touche.isdigit()
                                               or touche in ("*", "#")):
            self.saisie_tampon += touche
        else:
            return
        self._peindre(*self._carte_saisie(etiquette))

    def _carte_pin(self, etiquette=""):
        boutons = [[(c, f"p:{c}") for c in ligne] for ligne in PAVE_PIN]
        boutons.append([("⌫", "p:eff"), ("0", "p:0"),
                        (t("✅ OK", "✅ Valider"), "p:ok")])
        boutons.append([(t("❌ Cancel", "❌ Annuler"), "c:annuler")])
        return (
            t(f"🔐 {gras('PIN code')}{etiquette}\n{bloc(self.dernier_menu)}\n"
              f"Typed: {mono('•' * len(self.pin_tampon) or '—')}\n"
              + italique("The code is typed on the buttons: it never appears "
                         "in the conversation."),
              f"🔐 {gras('Code PIN')}{etiquette}\n{bloc(self.dernier_menu)}\n"
              f"Saisi : {mono('•' * len(self.pin_tampon) or '—')}\n"
              + italique("Le code se compose sur les boutons : il n'apparaît "
                         "jamais dans la conversation.")), boutons)

    # ---- confirmation d'une sortie importante ------------------------------
    def _noter_attente(self, menu):
        """Retient ce que l'opérateur demande, pour pouvoir rappeler le montant
        et le bénéficiaire au moment de valider."""
        _, options = self._analyser_menu(menu)
        if options:
            self.attente_saisie = ""
        elif RE_DEMANDE_MONTANT.search(menu):
            self.attente_saisie = "montant"
        elif RE_DEMANDE_DESTINATAIRE.search(menu):
            self.attente_saisie = "destinataire"
        else:
            self.attente_saisie = ""

    def _retenir_saisie(self, texte):
        """Mémorise la réponse libre selon ce qui était demandé."""
        if self.attente_saisie == "montant":
            chiffres = re.sub(r"\D", "", texte)
            if chiffres:
                self.montant_session = int(chiffres)
        elif self.attente_saisie == "destinataire":
            self.destinataire_session = texte.strip()[:24]
        self.attente_saisie = ""

    def _confirmation_requise(self):
        """Une sortie importante mérite un temps d'arrêt avant le code secret."""
        return (self.seuil_confirmation > 0
                and self.montant_session is not None
                and self.montant_session >= self.seuil_confirmation
                and not self.confirme)

    def _carte_confirmation(self, compte):
        destinataire = (t(f"\nRecipient: {mono(self.destinataire_session)}",
                          f"\nBénéficiaire : {mono(self.destinataire_session)}")
                        if self.destinataire_session else "")
        return (
            t(f"⚠️ {gras('Confirmation needed')}\n"
              f"Amount: {gras(self._fcfa(self.montant_session))}{destinataire}\n"
              f"Account: {gras(compte.libelle)}\n\n"
              + italique("Above the limit you set, the PIN pad only opens "
                         "after this confirmation."),
              f"⚠️ {gras('Confirmation demandée')}\n"
              f"Montant : {gras(self._fcfa(self.montant_session))}{destinataire}\n"
              f"Compte : {gras(compte.libelle)}\n\n"
              + italique("Au-delà du seuil que vous avez fixé, le code secret ne "
                         "s'affiche qu'après cette confirmation.")),
            [[(t("✅ Confirm", "✅ Confirmer"), "c:confirmer")],
             [(t("❌ Cancel", "❌ Annuler"), "c:annuler")]])

    def _pave(self, touche):
        compte = self.session_compte
        if not self.pin_actif or compte is None or self._confirmation_requise():
            return    # le pavé n'existe pas tant que la sortie n'est pas confirmée
        self.dernier_echange = time.time()
        etiquette = f" · {echap(compte.libelle)}" if self.multi else ""
        if touche == "eff":
            self.pin_tampon = self.pin_tampon[:-1]
        elif touche == "ok":
            if not self.pin_tampon:
                return
            code, self.pin_tampon = self.pin_tampon, ""
            self.pin_actif = False
            self._fermer_trace()
            self.journal.ussd("envoyé", "****", compte.libelle,
                              compte.carte.iccid)
            self._peindre(
                t(f"🔐 {gras('PIN code')}{etiquette}\n⏳ Checking…",
                  f"🔐 {gras('Code PIN')}{etiquette}\n⏳ Validation en cours…"),
                [])
            self._ussd(compte, code, nouveau=False)
            self._avancer_macro()
            return
        elif touche.isdigit() and len(self.pin_tampon) < 8:
            self.pin_tampon += touche
        else:
            return
        texte, boutons = self._carte_pin(etiquette)
        self._peindre(texte, boutons)

    def _peindre(self, texte, boutons):
        """Met à jour la carte de session, ou en crée une si besoin."""
        if self.msg_session and self.transport.modifier(
                self.msg_session, texte, boutons, canal=self.canal_session):
            return
        self.msg_session = self.transport.envoyer(
            texte, boutons=boutons, canal=self.canal_session)

    # ---- apprentissage des raccourcis --------------------------------------
    def _operateur_courant(self):
        """« MTN », « Orange »… — l'opérateur de la carte en place.

        Les raccourcis sont rangés par opérateur et non par carte : les codes
        USSD appartiennent au réseau. Changer une SIM MTN pour une autre SIM
        MTN ne doit pas faire disparaître les boutons.
        """
        if not self.courant or not self.courant.carte.identifiee:
            return ""
        operateur = self.courant.carte.operateur
        return "" if operateur == "SIM inconnue" else operateur

    def _raccourcis_actifs(self):
        """Les boutons à afficher : ceux du fichier de configuration, plus
        ceux appris pour l'opérateur en place. L'appris gagne en cas de
        même nom — c'est le plus récent, et il vient du terrain."""
        actifs = dict(self.raccourcis)
        operateur = self._operateur_courant()
        if operateur:
            try:
                actifs.update(self.journal.raccourcis(operateur))
            except Exception as e:
                self.journal.evenement(f"lecture des raccourcis : {e}")
        return actifs

    def _demander_nom_raccourci(self, canal):
        if not self.trace_a_enregistrer:
            return self.transport.envoyer(
                t("There is nothing left to save: do the operation again, "
                  "then tap 💾 at the end.",
                  "Il n'y a plus rien à enregistrer : refaites l'opération, "
                  "puis appuyez sur 💾 à la fin."), canal=canal)
        self.attente_nom = True
        parcours = " → ".join(self.trace_a_enregistrer)
        self.transport.envoyer(
            t(f"💾 {gras('A name for the button?')}\n"
              f"Recorded steps: {mono(parcours)}\n\n"
              "Reply with a short name — for example " + mono("Balance") + ", "
              + mono("Deposit") + " or " + mono("Withdrawal") + ".\n"
              + italique("The PIN is never saved: the button stops right "
                         "before it, and you will type it as usual."),
              f"💾 {gras('Nom du bouton ?')}\n"
              f"Parcours retenu : {mono(parcours)}\n\n"
              "Répondez par un nom court — par exemple " + mono("Solde") + ", "
              + mono("Dépôt") + " ou " + mono("Retrait") + ".\n"
              + italique("Le code secret n'est jamais enregistré : le bouton "
                         "s'arrête juste avant, et vous le taperez comme "
                         "d'habitude.")),
            canal=canal)

    def _enregistrer_raccourci(self, nom, canal):
        """Le nom saisi devient un bouton, pour l'opérateur de la carte."""
        self.attente_nom = False
        # Une saisie de réglage en cours : (« num » ou « nom », ICCID visé).
        # Le robot ne demande jamais deux choses à la fois.
        self.attente_identite = None
        self.canal_identite = None
        operateur = self._operateur_courant()
        etapes = self.trace_a_enregistrer
        self.trace_a_enregistrer = []
        if not operateur or not etapes:
            return self.transport.envoyer(
                t("Saving is not possible: the SIM card is not identified.",
                  "Enregistrement impossible : la carte n'est pas identifiée."),
                canal=canal)
        propre = re.sub(r"[^\w\s-]", "", nom).strip()[:24]
        identifiant = cle_code(propre)
        if not propre or identifiant == "raccourci":
            return self.transport.envoyer(
                t("That name has no letters in it. Try again.",
                  "Ce nom ne contient aucune lettre. Réessayez."), canal=canal)
        self.journal.ajouter_raccourci(operateur, identifiant, propre, etapes)
        self.journal.evenement(
            f"raccourci « {propre} » appris pour {operateur} : {','.join(etapes)}")
        self.transport.envoyer(
            t(f"✅ {gras(echap(propre))} is now a button, on all your "
              f"{gras(echap(operateur))} cards.\n"
              f"Steps: {mono(' → '.join(etapes))}",
              f"✅ {gras(echap(propre))} est maintenant un bouton, sur toutes vos "
              f"cartes {gras(echap(operateur))}.\n"
              f"Parcours : {mono(' → '.join(etapes))}"),
            canal=canal, boutons=[[("🏠 Menu", "c:menu")]])

    def _lister_raccourcis(self, canal=None):
        operateur = self._operateur_courant()
        appris = self.journal.raccourcis(operateur) if operateur else {}
        lignes = [gras(t("Your buttons", "Vos boutons"))]
        if self.raccourcis:
            lignes.append("")
            lignes.append(italique(t("From the configuration file:",
                                     "Depuis le fichier de configuration :")))
            for nom, r in self.raccourcis.items():
                lignes.append(f"· {echap(r['libelle'])} — "
                              f"{mono(' → '.join(r['etapes']))}")
        if appris:
            lignes.append("")
            lignes.append(italique(
                t(f"Learned on the {echap(operateur)} network:",
                  f"Appris sur le réseau {echap(operateur)} :")))
            for nom, r in appris.items():
                lignes.append(f"· {echap(r['libelle'])} — "
                              f"{mono(' → '.join(r['etapes']))}")
        if not self.raccourcis and not appris:
            lignes.append("")
            lignes.append(
                t("None yet. Do an operation once — the balance, for "
                  "example — then tap 💾 at the end: it will become a button.",
                  "Aucun pour l'instant. Faites une opération une fois — le "
                  "solde, par exemple — puis appuyez sur 💾 à la fin : elle "
                  "deviendra un bouton."))
        propose = [c for c in catalogue(operateur)
                   if cle_code(c[0]) not in appris]
        if propose:
            lignes.append("")
            lignes.append(italique(
                t(f"Known codes for {echap(operateur)}, not installed yet:",
                  f"Codes connus pour {echap(operateur)}, pas encore installés :")))
            for libelle, code, suite in propose:
                lignes.append(t(f"· {echap(libelle)} — {mono(code)}, "
                                f"then {echap(suite)}",
                                f"· {echap(libelle)} — {mono(code)}, "
                                f"puis {echap(suite)}"))
            lignes.append("")
            lignes.append(
                t("Each one opens the service and stops at the next question: "
                  "none of them moves money on its own. Try each one once.",
                  "Chacun ouvre le guichet et s'arrête à la question suivante : "
                  "aucun ne déplace d'argent tout seul. Vérifiez-les une fois."))

        boutons = []
        if propose:
            boutons.append([(t(f"➕ Install the {len(propose)} {operateur} "
                               "buttons",
                               f"➕ Installer les {len(propose)} boutons "
                               f"{operateur}"), "r:cat")])
        boutons += [[(f"🗑 {r['libelle']}", f"r:sup:{nom}")]
                    for nom, r in list(appris.items())[:6]]
        boutons.append([("🏠 Menu", "c:menu")])
        self.transport.envoyer("\n".join(lignes), canal=canal, boutons=boutons)

    def _installer_catalogue(self, canal=None):
        """Installe d'un coup les codes connus de l'opérateur en place."""
        operateur = self._operateur_courant()
        propose = catalogue(operateur)
        if not propose:
            return self.transport.envoyer(
                t("No known codes for this network. Do the operation once, "
                  "then tap 💾: it will become a button.",
                  "Aucun code connu pour cet opérateur. Faites l'opération une "
                  "fois, puis appuyez sur 💾 : elle deviendra un bouton."),
                canal=canal, boutons=[[("🏠 Menu", "c:menu")]])
        poses = 0
        for libelle, code, _suite in propose:
            if self.journal.ajouter_raccourci(operateur, cle_code(libelle),
                                              libelle, [code]):
                poses += 1
        self.journal.evenement(
            f"catalogue {operateur} installé : {poses} raccourci(s)")
        poses_accorde = gras(_accord(poses, "button installed",
                                     "buttons installed",
                                     "bouton installé", "boutons installés"))
        self.transport.envoyer(
            t(f"✅ {poses_accorde} for {gras(echap(operateur))}.\n"
              + italique("Try one: if it answers “service unavailable”, the "
                         "code has changed — do the operation through the "
                         "menu and tap 💾 to fix the button."),
              f"✅ {poses_accorde} pour {gras(echap(operateur))}.\n"
              + italique("Essayez-en un : s'il répond « service indisponible », "
                         "le code a changé — refaites l'opération par le menu "
                         "et appuyez sur 💾 pour le corriger.")),
            canal=canal, boutons=[[("🏠 Menu", "c:menu")]])

    def _supprimer_raccourci(self, nom, canal):
        operateur = self._operateur_courant()
        if operateur and self.journal.supprimer_raccourci(operateur, nom):
            self.transport.envoyer(t("🗑 Button removed.", "🗑 Bouton supprimé."),
                                   canal=canal)
        else:
            self.transport.envoyer(t("That button no longer exists.",
                                     "Ce bouton n'existe plus."), canal=canal)
        self._lister_raccourcis(canal)

    def _noter_trace(self, etape):
        """Retient une étape de navigation, si la trace est encore ouverte."""
        if self.trace_ouverte and not self.trace_rejouee:
            self.trace.append(etape)

    def _fermer_trace(self):
        """Arrête l'enregistrement : ce qui suit n'est pas rejouable.

        Un raccourci ne doit rejouer que la **navigation** — le chemin dans
        les menus, identique à chaque fois. Dès que l'opérateur réclame une
        donnée propre à l'opération (un montant, un bénéficiaire) ou le code
        secret, la suite n'a plus rien de reproductible : rejouer le montant
        d'hier serait au mieux faux, au pire coûteux.

        Le bouton mènera donc jusqu'à la question, et vous répondrez.
        """
        self.trace_ouverte = False

    def _cloturer_session(self, corps):
        # Ce qu'on vient de faire mérite-t-il un bouton ? On ne propose rien
        # après un raccourci rejoué (il existe déjà), ni sur une session vide.
        trace = [] if self.trace_rejouee else list(self.trace)
        boutons = []
        if trace and self._operateur_courant():
            boutons.append([(t("💾 Save as a button", "💾 En faire un bouton"),
                             "r:enr")])
        boutons.append([("🏠 Menu", "c:menu")])
        self._peindre(corps, boutons)
        canal = self.canal_session
        self._reinitialiser_session()
        self.canal_session = canal
        self.trace_a_enregistrer = trace

    def _annuler(self, canal):
        compte = self.session_compte or self.courant
        # Seulement le menu de Telegram : celui qu'une personne mène depuis
        # la plateforme sur la même carte ne se coupe pas d'ici.
        compte.ussd_annuler(qui=TITULAIRE_TELEGRAM)
        if self.msg_session:
            self.transport.retirer_boutons(self.msg_session, canal=self.canal_session)
        self._reinitialiser_session()
        self.transport.envoyer(t("USSD session closed.", "Session USSD fermée."),
                               boutons=[[("🏠 Menu", "c:menu")]], canal=canal)

    @staticmethod
    def _options(menu):
        """Extrait « 1. Transfert d'argent » → [("1", "Transfert d'argent"), …]."""
        options = []
        for ligne in menu.splitlines():
            m = RE_OPTION.match(ligne)
            if m:
                options.append((m.group(1), m.group(2)))
        return options

    # ---- raccourcis (macros USSD) -----------------------------------------
    def _lancer_raccourci(self, nom, canal):
        raccourci = self._raccourcis_actifs().get(nom)
        if not raccourci:
            self.transport.envoyer(t("Unknown button.", "Raccourci inconnu."),
                                   canal=canal)
            return
        etapes = list(raccourci["etapes"])
        # Un bouton à TROUS (« *126*1*{numero}*{montant}# ») attend des
        # valeurs que Telegram ne demande pas : la plateforme, elle, ouvre un
        # formulaire avant de composer. On le dit plutôt que de composer un
        # code amputé — qui échouerait sans qu'on sache pourquoi.
        trous = sorted({m.group(1) for e in etapes
                        for m in RE_VARIABLE.finditer(e)})
        if trous:
            return self.transport.envoyer(
                t(f"This button expects {', '.join(trous)}: run it from the "
                  "platform, which asks for the values before dialling.",
                  f"Ce bouton attend {', '.join(trous)} : lancez-le depuis la "
                  "plateforme, qui demande les valeurs avant de composer."),
                canal=canal, boutons=[[("🏠 Menu", "c:menu")]])
        self.canal_session = canal
        self.trace_rejouee = True
        self.msg_session = None
        self.file_macro = etapes[1:]
        self._ussd(self.courant, etapes[0], nouveau=True)
        self._avancer_macro()

    def _avancer_macro(self):
        """Déroule les étapes restantes d'un raccourci ; s'arrête d'elle-même
        dès qu'un PIN est demandé ou que la session se referme."""
        while self.file_macro and self.session_ussd and not self.pin_actif:
            etape = self.file_macro.pop(0)
            compte = self.session_compte
            time.sleep(0.4)          # laisse respirer le réseau USSD
            self.journal.ussd("envoyé", etape, compte.libelle,
                              compte.carte.iccid)
            self._ussd(compte, etape, nouveau=False)
        if not self.session_ussd:
            self.file_macro = []

    # ---- informations ------------------------------------------------------
    def _statut(self, canal=None):
        lignes = [f"📡 {gras(self.nom)}"]
        for c in self.comptes:
            marque = " ←" if self.multi and c is self.courant else ""
            lignes.append(f"· {echap(c.resume())}{marque}")
        try:
            lignes.append(f"\n🖥 {echap(self.sante.resume())}")
            if self.nuage and self.nuage.actif:
                lignes.append(f"☁️ {echap(self.nuage.resume())}")
        except Exception:
            pass
        self.transport.envoyer("\n".join(lignes), canal=canal,
                               boutons=[[("🏠 Menu", "c:menu")]])

    def _lister_comptes(self, canal=None, role=ADMIN):
        if not self.multi:
            return self.transport.envoyer(
                t(f"Only one account: {gras(self.courant.libelle)}.",
                  f"Un seul compte : {gras(self.courant.libelle)}."),
                canal=canal, boutons=[[("🏠 Menu", "c:menu")]])
        lignes = [gras(t("Available accounts", "Comptes disponibles"))]
        for i, c in enumerate(self.comptes, 1):
            marque = (t("  ← active", "  ← piloté")
                      if c is self.courant else "")
            lignes.append(f"{i}. {echap(c.resume())}{marque}")
        boutons = self._rangees_comptes() + [[("🏠 Menu", "c:menu")]]
        self.transport.envoyer("\n".join(lignes), canal=canal, boutons=boutons)

    def _derniers_sms(self, canal=None, prive=True):
        """Les cinq derniers SMS, tels qu'ils sont arrivés.

        DANS UN GROUPE, LES CODES SONT MASQUÉS. La commande n'est pas réservée
        aux administrateurs — un observateur doit pouvoir suivre la caisse —
        mais « suivre la caisse » n'a jamais voulu dire lire les codes de
        confirmation du propriétaire. Dans son chat privé, il les lit entiers :
        ils sont à lui.
        """
        lignes = self.journal.derniers_sms(5, self._cartes_en_place())
        if not lignes:
            self.transport.envoyer(t("No text messages on record yet.",
                                     "Aucun SMS en mémoire pour l'instant."),
                                   canal=canal)
            return
        blocs = []
        for date, expediteur, texte, compte in lignes:
            etiquette = f"[{echap(compte)}] " if self.multi and compte else ""
            lisible = texte if prive else masquer_le_code(texte)
            blocs.append(f"📥 {etiquette}{echap(date.replace('T', ' '))} — "
                         f"{gras(expediteur)}\n{echap(lisible)}")
        self.transport.envoyer("\n\n".join(blocs), canal=canal,
                               boutons=[[("🏠 Menu", "c:menu")]])

    def _rapport(self, canal=None, manuel=False):
        # Les mêmes numéros que la plateforme : le bilan Telegram et le site
        # doivent compter les MÊMES encaissements — surtout les transferts à
        # deux parties, dont le sens dépend de nos numéros.
        nb, total, nb_sms = self.journal.rapport_du_jour(
            self._cartes_en_place(), numeros=self._nos_numeros())
        etats = " · ".join(f"{echap(c.libelle)} {c.signal()}/31" for c in self.comptes)
        if self.multi:
            # Chaque caisse a sa ligne ; l'ensemble reste indiqué, mais
            # nommé pour ce qu'il est — il ne correspond à aucun solde.
            corps = "\n".join(self._bilan_par_caisse())
            texte_rapport = t(
                f"{'📊' if manuel else '🌙'} {gras('Last 24 hours')}\n"
                f"{corps}\n"
                f"All boxes together: {gras(self._fcfa(total))}\n"
                f"Text messages: {nb_sms}\n{etats}",
                f"{'📊' if manuel else '🌙'} {gras('Dernières 24 h')}\n"
                f"{corps}\n"
                f"Toutes caisses confondues : {gras(self._fcfa(total))}\n"
                f"SMS reçus : {nb_sms}\n{etats}")
        else:
            texte_rapport = t(
                f"{'📊' if manuel else '🌙'} {gras('Last 24 hours')}\n"
                f"Payments received: {gras(nb)}\nTotal: {gras(self._fcfa(total))}\n"
                f"Text messages: {nb_sms}\n{etats}",
                f"{'📊' if manuel else '🌙'} {gras('Dernières 24 h')}\n"
                f"Encaissements : {gras(nb)}\nTotal : {gras(self._fcfa(total))}\n"
                f"SMS reçus : {nb_sms}\n{etats}")
        self.transport.envoyer(
            texte_rapport,
            canal=canal if manuel else "encaissements",
            boutons=([[(t("📄 CSV export", "📄 Export CSV"), "c:export")]]
                     if manuel else None))

    def _export(self, canal=None):
        contenu = self.journal.export_csv(7, self._cartes_en_place(),
                                          numeros=self._nos_numeros())
        nom = f"totem-{datetime.now():%Y-%m-%d}.csv"
        if not self.transport.envoyer_fichier(
                nom, contenu,
                legende=t("📄 Records of the last 7 days.",
                          "📄 Journal des 7 derniers jours."), canal=canal):
            self.transport.envoyer(t("⚠️ The export could not be sent.",
                                     "⚠️ L'export n'a pas pu être envoyé."),
                                   canal=canal)

    def _sauvegarde(self, canal=None, automatique=False):
        """Envoie le journal complet dans Telegram.

        La copie locale (sauvegarder_journal) vit sur la même carte SD que
        l'original : elle ne protège de rien si la carte meurt. Celle-ci part
        hors du Pi, sans serveur à louer ni identifiant à gérer. Pour
        restaurer : télécharger le fichier et le remettre à la place de
        journal.db, robot arrêté."""
        dossier = tempfile.mkdtemp(prefix="totem-sauvegarde-")
        chemin = os.path.join(dossier, f"journal-{datetime.now():%Y-%m-%d}.db")
        try:
            self.journal.sauvegarder(chemin)
            with open(chemin, "rb") as fichier:
                contenu = fichier.read()
        except Exception as e:
            self.journal.evenement(f"échec de sauvegarde : {e}")
            if not automatique:
                self.transport.envoyer(
                    t(f"⚠️ The backup failed: {echap(e)}",
                      f"⚠️ Sauvegarde impossible : {echap(e)}"), canal=canal)
            return
        finally:
            shutil.rmtree(dossier, ignore_errors=True)

        legende = t(
            f"💾 {gras('Backup of the records')} — {len(contenu) // 1024} KB\n"
            + italique("Keep this file: it is the only copy outside the "
                       "terminal. To restore, replace journal.db with it "
                       "while the robot is stopped."),
            f"💾 {gras('Sauvegarde du journal')} — {len(contenu) // 1024} Ko\n"
            + italique("Conservez ce fichier : c'est la seule copie hors "
                       "du Pi. Pour restaurer, remplacez journal.db par "
                       "celui-ci, robot arrêté."))
        if not self.transport.envoyer_fichier(
                os.path.basename(chemin), contenu, legende=legende, canal=canal,
                type_mime="application/x-sqlite3"):
            self.journal.evenement("sauvegarde non transmise")
            if not automatique:
                self.transport.envoyer(
                    t("⚠️ The backup could not be sent.",
                      "⚠️ La sauvegarde n'a pas pu être envoyée."), canal=canal)

    def _diagnostic(self, canal=None):
        """Tout ce qu'on voudrait savoir avant d'appeler quelqu'un à Douala."""
        duree = self._duree(time.time() - self.demarre_a)
        lignes = [f"🩺 {gras(t('Diagnostics', 'Diagnostic'))}",
                  t(f"Version: {mono(version())}",
                    f"Version : {mono(version())}"),
                  t(f"Robot running for {duree}",
                    f"Robot en marche depuis {duree}")]
        for compte in self.comptes:
            occupes, capacite = compte.memoire_sms()
            lignes.append(
                t(f"\n{gras(compte.libelle)}\n"
                  f"SIM card: {mono(self._sim_lisible(compte.iccid()))}\n"
                  f"SMS storage: {occupes}/{capacite if capacite else '?'}\n"
                  f"Signal: {compte.signal()}/31",
                  f"\n{gras(compte.libelle)}\n"
                  f"Carte : {mono(self._sim_lisible(compte.iccid()))}\n"
                  f"Mémoire SMS : {occupes}/{capacite if capacite else '?'}\n"
                  f"Signal : {compte.signal()}/31"))
        en_attente = self.facteur.en_attente()
        lignes.append(t(f"\nMessages waiting to go out: {en_attente}",
                        f"\nCourrier en attente : {en_attente}")
                      if en_attente else
                      t("\nOutgoing messages: all delivered",
                        "\nCourrier : tout est parti"))
        lignes.append(self.sante.resume() if hasattr(self.sante, "resume") else "")
        self.transport.envoyer("\n".join(l for l in lignes if l), canal=canal,
                               boutons=[[("🏠 Menu", "c:menu")]])

    def _brut(self, canal=None):
        """Affiche la dernière réponse de l'opérateur telle qu'elle est
        arrivée, caractères invisibles compris.

        Quand un menu s'affiche mal, une capture d'écran ne suffit pas : elle
        ne montre ni les fins de ligne, ni les espaces, ni les caractères
        exotiques. C'est pourtant là que se cachent ces défauts."""
        if not self.dernier_brut:
            self.transport.envoyer(
                t("No menu received since startup. Dial a USSD code, then "
                  "run /brut again.",
                  "Aucun menu reçu depuis le démarrage. Composez un code USSD, "
                  "puis relancez /brut."), canal=canal)
            return
        entete, options = self._analyser_menu(self.dernier_brut)
        pave = (t("YES ⚠️", "OUI ⚠️") if self._demande_un_code(self.dernier_brut)
                else t("no", "non"))
        self.transport.envoyer(
            t(f"🔬 {gras('Last menu received, exactly as it came')}\n"
              f"{bloc(repr(self.dernier_brut))}\n"
              f"Header lines: {len(entete)}\n"
              f"Options recognized: {gras(len(options))}\n"
              f"PIN pad triggered: {gras(pave)}\n"
              f"Version: {mono(version())}",
              f"🔬 {gras('Dernier menu reçu, tel quel')}\n"
              f"{bloc(repr(self.dernier_brut))}\n"
              f"Lignes d'en-tête : {len(entete)}\n"
              f"Options reconnues : {gras(len(options))}\n"
              f"Pavé du code déclenché : {gras(pave)}\n"
              f"Version : {mono(version())}"),
            canal=canal, boutons=[[("🏠 Menu", "c:menu")]])

    @staticmethod
    def _sim_lisible(iccid):
        return ("…" + iccid[-6:]) if iccid else t("identifier unavailable",
                                                  "identifiant indisponible")

    @staticmethod
    def _duree(secondes):
        secondes = int(secondes)
        jours, reste = divmod(secondes, 86400)
        heures, reste = divmod(reste, 3600)
        minutes = reste // 60
        if jours:
            return t(f"{jours} d {heures} h", f"{jours} j {heures} h")
        return f"{heures} h {minutes} min" if heures else f"{minutes} min"

    @staticmethod
    def _fcfa(montant):
        return formater_montant(montant) + " FCFA"

    def _nos_numeros(self):
        """Tous les numéros qui sont les nôtres — ce qui permet de dire de quel
        côté d'un transfert on se trouve.

        Deux sources : ce que la puce déclare (rare : la plupart des SIM
        prépayées ne provisionnent pas leur MSISDN) et ce que la configuration
        annonce. Si les deux se taisent, le sens reste inconnu, et c'est plus
        honnête que de le deviner.
        """
        declares = [c.carte.numero for c in self.comptes if c.carte.numero]
        return (tuple(self.journal.numeros_declares()) + tuple(declares)
                + tuple(self.numeros.values()))

    def _numero_du_compte(self, compte):
        """Le numéro de CETTE carte. La configuration prime : elle a été
        écrite à la main en regardant la puce, le modem se contente de
        répéter ce que la SIM veut bien dire."""
        # Ce que vous avez inscrit dans Telegram passe avant tout : c'est le
        # plus récent, et le seul que quelqu'un ait vérifié de ses yeux.
        numero, _ = self.journal.identite(compte.carte.iccid)
        if numero:
            return numero
        for cle in (compte.carte.iccid, compte.libelle, compte.carte.operateur):
            if cle and cle.lower() in self.numeros:
                return self.numeros[cle.lower()]
        return compte.carte.numero or ""

    # ---- surveillance (SMS de tous les comptes, santé, rapport) ------------
    def _boucle_surveillance(self):
        """Le fil qui fait tout arriver : SMS, reçus, alertes, cloud.

        S'il s'arrête, TOUT se tait d'un coup — plus d'annonce sur Telegram,
        plus de reçu, plus rien vers la plateforme — alors que le robot
        répond encore aux commandes et que le signe de vie (envoyé par le fil
        du nuage, distinct) continue de rassurer l'écran. C'est la panne la
        plus sournoise du système : rien ne SEMBLE cassé, et rien n'arrive.

        Ce fil est donc bâti pour ne jamais mourir : chaque étape du tour est
        isolée (`_etape`), et ce filet-ci rattrape même ce qui échapperait à
        l'isolement. Un incident se lit au journal ; il ne coupe plus rien."""
        self._prochaine_sante = 0
        self._prochaine_memoire = 0
        self._prochaines_cartes = 0
        while self.actif:
            try:
                self._tour_de_surveillance()
            except Exception as e:
                # Ne devrait jamais se produire : chaque étape est déjà
                # isolée. Mais « ne devrait pas » a déjà tué ce fil une fois
                # — on note, et le tour suivant a lieu quoi qu'il arrive.
                self._noter(f"tour de surveillance interrompu : {e}")
            if self.postes:
                # Les postes guettent chacun leur modem. Guetter ici aussi
                # volerait leurs annonces de SMS (lire l'annonce la consomme).
                self._dormir(self.pause_sms)
            else:
                self._attendre_sms(self.pause_sms)

    def _dormir(self, delai):
        fin = time.time() + delai
        while self.actif and time.time() < fin:
            time.sleep(min(0.5, max(0.0, fin - time.time())))

    # ---- un poste par carte ------------------------------------------------
    #
    # UN SEUL FIL relevait les SMS de TOUTES les cartes, l'une après l'autre.
    # Or une carte en plein menu USSD garde son modem jusqu'à trente secondes
    # (le réseau répond quand il veut) : pendant ce temps, le fil restait
    # planté devant elle, et les encaissements des AUTRES cartes attendaient
    # — sur des modems libres. Un modem qui ne répond plus faisait pareil, à
    # chaque tour. Plus il y a de cartes, plus chacune attend les autres.
    #
    # Chaque carte a maintenant son fil, qui ne parle qu'à SON modem : ce qui
    # arrive à l'une — un menu, une panne, une puce changée — ne retarde
    # jamais l'autre. Le reste du tour (santé, reçus, courrier, bilan) ne
    # touche aucun modem et reste commun.

    def _lancer_postes(self):
        self.postes = True
        for compte in self.comptes:
            threading.Thread(target=self._poste, args=(compte,), daemon=True,
                             name=f"poste {compte.libelle}").start()

    def _poste(self, compte):
        """Le fil d'UNE carte : relire sa puce de temps en temps, relever ses
        SMS, guetter son modem. Bâti, comme la surveillance, pour ne jamais
        mourir : un poste muet, c'est une caisse dont plus rien n'arrive."""
        prochaine_carte = time.time() + VERIF_CARTES_SECONDES
        while self.actif:
            try:
                if time.time() >= prochaine_carte:
                    prochaine_carte = time.time() + VERIF_CARTES_SECONDES
                    # Avant la relève : si la puce a été échangée, les
                    # messages qui suivent appartiennent à la nouvelle carte.
                    self._etape(f"recensement {compte.libelle}",
                                lambda: self._recenser_carte(compte))
                self._relever_sms(compte)
            except Exception as e:
                self._noter(f"relève SMS {compte.libelle} : {e}")
            self._attendre_sms(self.pause_sms, comptes=[compte])

    def _tour_de_surveillance(self):
        """Un tour complet de surveillance, par étapes isolées : celle qui
        échoue (disque plein, base indisponible, refus Telegram…) est notée
        au journal et ne prive ni les étapes suivantes, ni le tour d'après."""
        # Avant de relever les SMS : si la puce a été échangée, les
        # messages qui suivent appartiennent à la nouvelle carte.
        if not self.postes:
            # Sans postes (essais, démo) : le tour relève lui-même, carte
            # après carte. En service, chaque carte a son fil (`_poste`).
            if time.time() >= self._prochaines_cartes:
                self._prochaines_cartes = time.time() + VERIF_CARTES_SECONDES
                self._etape("recensement des cartes", self._recenser_cartes)
            for compte in self.comptes:
                # Rien de ce qui touche une carte ne doit pouvoir arrêter la
                # relève des autres.
                try:
                    self._relever_sms(compte)
                except Exception as e:
                    self._noter(f"relève SMS {compte.libelle} : {e}")
        self._etape("expiration de session", self._expirer_session)
        # La santé du Pi change lentement : inutile de la lire à chaque tour.
        if time.time() >= self._prochaine_sante:
            self._prochaine_sante = time.time() + 120
            self._etape("santé du terminal", self._veiller_sante)
        if time.time() >= self._prochaine_memoire:
            self._prochaine_memoire = time.time() + VERIF_MEMOIRE_SECONDES
            self._etape("mémoire des modems", self._verifier_memoire)
        self._etape("distribution des reçus", self._distribuer_recus)
        self._etape("conflit de robots", self._signaler_conflit)
        self._etape("rapport quotidien", self._rapport_et_sauvegarde)
        # Rattrape ce qu'une coupure a retenu.
        self._etape("distribution du courrier", self.facteur.distribuer)

    def _etape(self, nom, action):
        """Une étape du tour, incapable de tuer le fil : l'incident est noté
        (par `_noter`, qui ne lève jamais non plus) et la suite a lieu."""
        try:
            action()
        except Exception as e:
            self._noter(f"{nom} : {e}")

    def _rapport_et_sauvegarde(self):
        if self._rapport_quotidien():
            sauvegarder_journal(self.chemin_base)

    def _attendre_sms(self, delai, comptes=None):
        """Dort au plus `delai` secondes entre deux tours — mais se réveille
        DÈS qu'un modem annonce un SMS (« +CMTI »). La détection devient ainsi
        quasi immédiate : le SMS est relevé, notifié sur Telegram et poussé au
        cloud dans la foulée. La boucle périodique n'est plus qu'un filet de
        sécurité, au cas où une annonce se perdrait."""
        fin = time.time() + delai
        while self.actif and time.time() < fin:
            for compte in (self.comptes if comptes is None else comptes):
                # Ne pas lire le port pendant un menu USSD ouvert : la réponse
                # attendue par la session n'est pas à nous.
                if getattr(compte, "session_ouverte", False):
                    continue
                if compte.sms_annonce():
                    return
            time.sleep(0.3)

    # ---- cartes SIM --------------------------------------------------------
    def _cartes_en_place(self):
        """ICCID de toutes les cartes actuellement insérées.

        C'est le périmètre de ce qu'on affiche : le bilan du jour doit couvrir
        les deux modems, pas seulement celui qu'on pilote — sinon les recettes
        d'un opérateur disparaîtraient de l'écran. Ce qui en est exclu, ce sont
        les cartes retirées : leur historique reste entier, consultable par
        /sims, mais il ne s'additionne pas à celui des cartes en place.

        Vide tant qu'aucun ICCID n'est lisible : les vues montrent alors tout,
        comme avant. Mieux vaut un historique mélangé qu'un écran vide.
        """
        return tuple(c.carte.iccid for c in self.comptes if c.carte.identifiee)

    def _recenser_cartes(self, silencieux=False):
        """Relit la puce de chaque modem et signale les changements.

        Appelé au démarrage (en silence : l'annonce de mise en ligne dit déjà
        quelles cartes sont en place) puis à chaque tour de surveillance. C'est
        ce qui rend le remplacement d'une SIM visible sans rien redémarrer.
        """
        for compte in self.comptes:
            self._recenser_carte(compte, silencieux)

    def _recenser_carte(self, compte, silencieux=False):
        """La puce de CE modem a-t-elle changé ? (Voir `_recenser_cartes`.)"""
        try:
            ancienne = compte.relire_carte()
        except Exception as e:
            self.journal.evenement(f"lecture carte {compte.libelle} : {e}")
            return
        if not compte.carte.identifiee:
            return
        etat = self.journal.voir_carte(compte.carte, compte.imei)
        if silencieux:
            return
        if ancienne:
            self._annoncer_changement_carte(compte, ancienne, etat)
        elif etat == "nouvelle":
            # Première lecture réussie sur un modem dont l'ICCID était
            # jusque-là illisible : ce n'est pas un remplacement.
            self.journal.evenement(f"carte identifiée : {compte.libelle}")

    def _annoncer_changement_carte(self, compte, ancienne, etat):
        """Une puce a été retirée et une autre insérée. C'est l'événement le
        plus lourd de conséquences du quotidien : l'argent qui arrivera
        désormais n'est plus sur le même compte."""
        connue = etat == "connue"
        titre = (t("💳 A known SIM card is back in place",
                   "💳 Carte SIM déjà connue remise en place") if connue
                 else t("💳 New SIM card detected",
                        "💳 Nouvelle carte SIM détectée"))
        self.journal.evenement(
            f"changement de carte : {ancienne.libelle} → {compte.carte.libelle}")
        if self.nuage:
            self.nuage.reveiller()
        lignes = [
            gras(titre),
            t(f"Removed: {echap(ancienne.libelle)}",
              f"Retirée : {echap(ancienne.libelle)}"),
            t(f"Inserted: {gras(echap(compte.carte.description))}",
              f"En place : {gras(echap(compte.carte.description))}"),
        ]
        if compte.carte.numero:
            lignes.append(t(f"Number: {echap(compte.carte.numero)}",
                            f"Numéro : {echap(compte.carte.numero)}"))
        lignes.append("")
        lignes.append(
            t("It keeps its own records and its own balance: payments "
              "received on the previous card are not added to it.",
              "Son historique et son solde lui sont propres : les encaissements "
              "de la carte précédente ne s'y ajoutent pas.") if not connue else
            t("Its records come back untouched — nothing was lost while it "
              "was away.",
              "Son journal ressort intact — rien n'a été perdu pendant son absence."))
        self.transport.envoyer("\n".join(lignes), canal="alertes",
                               boutons=[[(t("💳 SIM cards", "💳 Cartes"), "c:sims"),
                                         ("🏠 Menu", "c:menu")]])

    # ---- réglages : l'identité des puces -----------------------------------
    # Une SIM prépayée ne déclare presque jamais son numéro, et personne ne
    # connaît le nom commercial du compte à part son propriétaire. Plutôt que
    # de le faire éditer un fichier sur le Pi, on le lui demande ici.

    def _reglages(self, canal=None):
        """Ce que TOTEM sait de chaque puce, et ce qu'il attend de vous."""
        lignes = [f"⚙️ {gras(t('Settings', 'Réglages'))}", "",
                  t("Each SIM's number and name. They cannot be read from "
                    "the card: you are the one who knows them.",
                    "Le numéro et le nom de chaque puce. Ils ne se lisent pas "
                    "sur la carte : c'est vous qui les connaissez."), ""]
        boutons = []
        for compte in self.comptes:
            iccid = compte.carte.iccid
            if not iccid:
                lignes.append(t(f"▫️ {gras(echap(compte.libelle))}\n"
                                "    card unreadable — nothing to set here",
                                f"▫️ {gras(echap(compte.libelle))}\n"
                                "    carte illisible — rien à régler ici"))
                continue
            numero, nom = self.journal.identite(iccid)
            ligne_numero = (echap(numero_lisible(numero)) if numero
                            else italique(t("number to fill in",
                                            "numéro à renseigner")))
            ligne_nom = (echap(nom) if nom
                         else italique(t("name to fill in", "nom à renseigner")))
            lignes.append(
                f"▶️ {gras(echap(compte.libelle))}\n"
                f"    📱 {ligne_numero}\n"
                f"    🏷 {ligne_nom}")
            court = compte.libelle[:10]
            boutons.append([(t(f"📱 Number · {court}", f"📱 Numéro · {court}"),
                             f"i:num:{iccid}"),
                            (t(f"🏷 Name · {court}", f"🏷 Nom · {court}"),
                             f"i:nom:{iccid}")])

        lignes += ["", italique(
            t("The number tells which side of a transfer you are on: without "
              "it, the receipt says “Net amount” instead of “Amount received” "
              "or “Amount sent”. The name appears on the balance receipt.",
              "Le numéro sert à dire de quel côté d'un transfert vous êtes : "
              "sans lui, le reçu écrit « Montant net » au lieu de « Montant "
              "reçu » ou « Montant envoyé ». Le nom paraît sur le reçu de solde."))]
        boutons.append([("🏠 Menu", "c:menu")])
        self.transport.envoyer("\n".join(lignes), canal=canal, boutons=boutons)

    def _demander_identite(self, champ, iccid, canal=None):
        """Ouvre la saisie. La réponse suivante sera lue comme la valeur."""
        compte = self._compte_par_iccid(iccid)
        if compte is None or compte.carte.iccid != iccid:
            return self.transport.envoyer(
                t("That card is no longer inserted.",
                  "Cette carte n'est plus en place."), canal=canal,
                boutons=[[(t("⚙️ Settings", "⚙️ Réglages"), "c:reglages")]])
        self.attente_identite = (champ, iccid)
        self.canal_identite = canal
        if champ == "num":
            question = t(f"📱 Send the phone number of the "
                         f"{gras(echap(compte.libelle))} SIM.\n"
                         + italique("Nine digits, for example 696103864."),
                         f"📱 Envoyez le numéro de la puce "
                         f"{gras(echap(compte.libelle))}.\n"
                         + italique("Neuf chiffres, par exemple 696103864."))
        else:
            question = t(f"🏷 Send the account name for "
                         f"{gras(echap(compte.libelle))}.\n"
                         + italique("The one that will appear on receipts, "
                                    "for example WONDER PHONE."),
                         f"🏷 Envoyez le nom du compte "
                         f"{gras(echap(compte.libelle))}.\n"
                         + italique("Celui qui paraîtra sur les reçus, par "
                                    "exemple WONDER PHONE."))
        self.transport.envoyer(question, canal=canal,
                               boutons=[[(t("❌ Cancel", "❌ Annuler"),
                                          "c:reglages")]])

    def _enregistrer_identite(self, texte, canal=None):
        """Lit la réponse attendue, la contrôle, puis l'inscrit."""
        champ, iccid = self.attente_identite
        self.attente_identite = None

        if champ == "num":
            chiffres = re.sub(r"\D", "", texte)
            if not 8 <= len(chiffres) <= 15:
                return self.transport.envoyer(
                    t("That is not a phone number. Nothing was saved.",
                      "Ce n'est pas un numéro de téléphone. Rien n'a été "
                      "enregistré."), canal=canal,
                    boutons=[[(t("⚙️ Settings", "⚙️ Réglages"), "c:reglages")]])
            valeur = chiffres
            quoi = t(f"Number: {gras(numero_lisible(chiffres))}",
                     f"Numéro : {gras(numero_lisible(chiffres))}")
            enregistre = self.journal.definir_identite(iccid, numero=valeur)
        else:
            valeur = re.sub(r"\s+", " ", texte).strip()[:40]
            if len(valeur) < 2:
                return self.transport.envoyer(
                    t("That name is too short. Nothing was saved.",
                      "Ce nom est trop court. Rien n'a été enregistré."),
                    canal=canal,
                    boutons=[[(t("⚙️ Settings", "⚙️ Réglages"), "c:reglages")]])
            quoi = t(f"Name: {gras(echap(valeur))}",
                     f"Nom : {gras(echap(valeur))}")
            enregistre = self.journal.definir_identite(iccid, nom=valeur)

        if not enregistre:
            return self.transport.envoyer(
                t("That card is not on the terminal's register.",
                  "Cette carte n'est pas au registre du terminal."),
                canal=canal,
                boutons=[[(t("⚙️ Settings", "⚙️ Réglages"), "c:reglages")]])
        self.journal.evenement(f"identité de carte modifiée ({champ})")
        if self.nuage:
            self.nuage.reveiller()     # l'application web le verra tout de suite
        self.transport.envoyer(f"✅ {quoi}", canal=canal)
        self._reglages(canal)

    def _lister_cartes(self, canal=None):
        """Toutes les puces déjà passées dans ce terminal, celle en place en
        tête. Répond à la question « c'est bien la bonne SIM qui est dedans ? »."""
        cartes = self.journal.cartes()
        if not cartes:
            return self.transport.envoyer(
                t("No card identified yet. The modem has not managed to read "
                  "the inserted SIM's serial number.",
                  "Aucune carte identifiée pour l'instant. Le modem n'a pas encore "
                  "réussi à lire l'ICCID de la puce insérée."), canal=canal,
                boutons=[[("🏠 Menu", "c:menu")]])
        en_place = {c.carte.iccid for c in self.comptes if c.carte.identifiee}
        lignes = [gras(t("Known SIM cards", "Cartes SIM connues"))]
        for iccid, libelle, _operateur, numero, premiere, derniere, nb, total in cartes:
            marque = "▶️ " if iccid in en_place else "▫️ "
            detail = f" · {numero}" if numero else ""
            lignes.append(
                t(f"{marque}{gras(echap(libelle))}{echap(detail)}\n"
                  f"    {nb} SMS · {self._fcfa(total)} received\n"
                  f"    seen from {echap(premiere[:10])} to {echap(derniere[:10])}",
                  f"{marque}{gras(echap(libelle))}{echap(detail)}\n"
                  f"    {nb} SMS · {self._fcfa(total)} encaissés\n"
                  f"    vue du {echap(premiere[:10])} au {echap(derniere[:10])}"))
        lignes.append("")
        lignes.append(t("▶️ inserted · ▫️ removed. Each card keeps its own "
                        "records: put it back and they come back untouched.",
                        "▶️ en place · ▫️ retirée. Chaque carte garde son propre "
                        "journal : la remettre le fait ressortir intact."))
        self.transport.envoyer("\n".join(lignes), canal=canal,
                               boutons=[[("🏠 Menu", "c:menu")]])

    def _veiller_sante(self):
        """Alerte sur la tension, la chaleur, le disque — une fois par
        changement d'état, jamais en boucle."""
        try:
            messages = self.sante.alertes()
        except Exception as e:
            self.journal.evenement(f"lecture santé : {e}")
            return
        for genre, texte in messages:
            self.journal.evenement(f"santé — {texte}")
            prefixe = "⚠️ " if genre == "alerte" else "✅ "
            self.transport.envoyer(f"{prefixe}{echap(texte)}", canal="alertes",
                                   silencieux=genre != "alerte")

    def _noter(self, texte):
        """Journalise un incident sans JAMAIS lever : le journal lui-même peut
        échouer (disque plein), et cela ne doit pas tuer le fil appelant."""
        try:
            self.journal.evenement(texte)
        except Exception:
            pass

    def _relever_sms(self, compte):
        """L'ordre compte : on écrit au journal AVANT d'effacer dans le modem.

        Si le robot meurt entre les deux, le message est encore dans le modem
        au redémarrage plutôt que perdu — et le garde-fou anti-doublon évite
        de l'annoncer deux fois."""
        try:
            messages = compte.lire_sms()
            compte.echecs = 0
            # Un modem peut revenir sans qu'on l'ait redémarré : le câble se
            # remet en place, l'alimentation se stabilise. C'est ici qu'on
            # l'apprend, et il faut le dire — sinon la dernière chose annoncée
            # reste « le modem ne répond plus », alors que tout va bien.
            self._annoncer_retour(compte)
        except Exception as e:
            compte.echecs += 1
            self.journal.evenement(f"lecture SMS {compte.libelle} : {e}")
            if compte.echecs == 3:  # chien de garde : on relance CE modem
                self._redemarrer_modem(compte, canal="alertes", automatique=True)
                compte.echecs = 0
            return
        for indices, expediteur, texte, emis_le in messages:
            # Un SMS qui fait échouer son propre traitement (disque plein,
            # journal verrouillé, mise en forme d'une notification…) ne doit
            # PAS emporter avec lui la relève des suivants ni le fil de
            # surveillance. On isole chaque message, et on ne l'efface JAMAIS
            # tant qu'il n'a pas été journalisé : sinon un encaissement
            # disparaîtrait sans laisser de trace.
            try:
                # Le SMS est enregistré et transmis TEL QUEL — y compris les
                # codes qu'il porte. Ce sont les messages du propriétaire, sur
                # sa carte : il les reçoit entiers, pour lire un code de
                # connexion comme le reste. On ne modifie pas un SMS.
                # (Le code SECRET Mobile Money que le propriétaire TAPE
                # pendant une opération n'entre jamais par ici : il n'est
                # jamais reçu par SMS. Il reste protégé, ailleurs.)
                # emis_le : l'heure RÉSEAU du SMS (TP-SCTS). C'est l'heure
                # vraie de l'opération, distincte de l'heure de relève — elles
                # divergent après une coupure, et c'est la réseau qui fait foi
                # pour l'ordre et les reçus.
                # Garde-fou : quoi que le maillon d'avant ait mis dans
                # `emis_le`, le SMS passe. Une heure réseau perdue est un
                # détail ; un SMS bloqué en boucle est la panne totale —
                # c'est arrivé (un booléen à la place de l'heure, et plus
                # RIEN n'arrivait, ni Telegram ni plateforme).
                heure_reseau = (emis_le.isoformat()
                                if hasattr(emis_le, "isoformat") else None)
                # Elle sert AUSSI à reconnaître un doublon : c'est une
                # identité réseau, que la coupure de courant la plus longue
                # n'altère pas — là où une fenêtre de quinze minutes laissait
                # recompter un paiement au redémarrage.
                if not self.journal.sms_existe(expediteur, texte, compte.libelle,
                                               emis_le=heure_reseau):
                    sms_id = self.journal.sms(
                        expediteur, texte, compte.libelle, compte.carte.iccid,
                        emis_le=heure_reseau)
                    self._notifier_sms(compte, expediteur, texte, sms_id)
                    # Le reçu ne part pas maintenant : l'alerte doit arriver la
                    # première, et un PDF ne doit jamais retarder l'annonce
                    # d'un encaissement. Il est seulement inscrit ; la boucle
                    # de surveillance le fabriquera dans la foulée.
                    self._programmer_recu(sms_id, texte)
                    # Un SMS qui ANNONCE un solde met la carte à jour : c'est
                    # l'opérateur qui parle, comme sur une réponse USSD — et
                    # en itinérance, MTN répond justement par SMS quand
                    # l'USSD ne passe pas. Le « nouveau solde » d'un
                    # MOUVEMENT adressé à notre carte vaut pareil : c'est le
                    # solde de la caisse après l'opération, annoncé par
                    # l'opérateur. La carte reste ainsi à jour toute seule,
                    # encaissement après encaissement. Jamais un calcul à
                    # nous.
                    try:
                        solde = solde_annonce(texte)
                        if solde is None:
                            p = analyser(texte, numeros=self._nos_numeros())
                            if p is not None:
                                solde = p.solde_apres
                        if (solde is not None and self.nuage
                                and compte.carte.identifiee):
                            # L'heure réseau du SMS accompagne le solde : un
                            # relevé ancien rejoué dans le désordre ne doit
                            # pas écraser un solde déjà plus récent.
                            self.nuage.publier_solde(
                                compte.carte.iccid, solde, moment=heure_reseau)
                    except Exception:
                        pass    # un solde non relevé n'empêche rien
                    # Le cloud est prévenu tout de suite : inutile de lui faire
                    # attendre son battement pour un paiement déjà connu.
                    if self.nuage:
                        self.nuage.reveiller()
            except Exception as e:
                self._noter(f"traitement SMS {indices} ({compte.libelle}) : {e}")
                continue        # on n'efface pas : à réessayer au prochain tour
            # Un message long occupe plusieurs emplacements : on les efface
            # tous ensemble, sans quoi un morceau resterait orphelin.
            if not compte.effacer_sms(indices):
                self._noter(f"SMS {indices} non effacé sur {compte.libelle} "
                            "(il sera ignoré au prochain tour)")

    # ---- reçus PDF ---------------------------------------------------------
    # Un reçu ne se fabrique jamais dans le fil du SMS : l'alerte doit partir
    # tout de suite, et l'échec d'un document ne doit pas faire perdre
    # l'annonce d'un encaissement. Le SMS est donc seulement inscrit. Le fil
    # du dépôt le porte aussitôt sur la plateforme ; la boucle de
    # surveillance l'envoie sur Telegram une dizaine de secondes plus tard.

    def _programmer_recu(self, source_id, texte, source="sms", nature=None,
                         langue=None, expliquer=False, reveiller=True):
        """Inscrit ce message pour un reçu, s'il en mérite un.

        `source` : « sms » pour un encaissement, « ussd » pour un solde lu au
        menu. Les deux n'ont pas les mêmes garde-fous — une réponse USSD peut
        être un menu ou une question, un SMS non.

        `nature` : le choix du propriétaire quand la demande vient de la
        plateforme. C'est lui qui décide du document — et sans les faits pour
        le remplir honnêtement, on refuse plutôt que de replier sur un autre.

        `expliquer` : à True (demande de la plateforme), un refus lève
        `RefusRecu` avec sa raison, et une panne LÈVE au lieu d'être avalée.
        Avant, un disque plein répondait « ce message ne porte pas de quoi
        remplir ce reçu » — le propriétaire accusait le SMS quand il fallait
        regarder le terminal.
        """
        if not self.recus or not source_id:
            return None
        # La lecture ne lève jamais (c'est la promesse d'analyse_sms) : elle
        # peut vivre hors du parapluie, pour que le refus et la panne restent
        # deux histoires distinctes.
        motif = (motif_du_menu(texte) if source == "ussd"
                 else motif_du_sms(texte, numeros=self._nos_numeros()))
        motif = motif_selon_nature(motif, nature)
        if motif is None:
            if expliquer:
                raise RefusRecu(raison_du_refus(
                    texte, nature=nature, numeros=self._nos_numeros()))
            return None
        try:
            numero = numero_de_recu(datetime.now(), source_id, source)
            # Le numéro EN VIGUEUR peut être celui d'un document déjà inscrit
            # (même message redemandé un autre jour, même référence) : c'est
            # lui qu'on annonce, jamais un numéro qui n'existe pas.
            inscrit = self.journal.programmer_recu(
                source_id, motif.genre, numero, motif.reference,
                source=source, nature=nature, langue=langue,
                langue_robot=langue_active())
        except Exception as e:
            if expliquer:
                raise           # une panne se raconte comme une panne
            # Un reçu manqué est un désagrément ; une relève de SMS
            # interrompue est une perte d'argent. On note, et on continue.
            self.journal.evenement(f"reçu non programmé : {e}")
            return None
        if inscrit and reveiller:
            # Le fil du dépôt part TOUT DE SUITE : la plateforme n'attend ni
            # le délai de Telegram ni le tour de surveillance suivant.
            self._reveil_depot.set()
        return inscrit

    def _recu_apres_coup(self, source_id, nature=None, langue=None):
        """Établit (ou ré-établit) le reçu d'un SMS passé, à la demande de
        la plateforme. Le numéro ne dépend que de la ligne du journal : un
        reçu redemandé reprend exactement le même — mais une autre nature
        refabrique le document sous son nouveau titre.

        `langue` : celle de l'écran qui demande. Elle voyage jusqu'au PDF.

        Rend le numéro avec CE QUI LUI EST ARRIVÉ (`NumeroDeRecu.etat`) :
        « inchange » — le document en place est déjà le bon —, « depose »,
        ou « en_route » si le dépôt n'a pas pu se faire tout de suite. C'est
        sur ce mot que l'écran dit « déjà à jour », jamais sur l'égalité des
        numéros : un document refait garde son numéro."""
        texte = self.journal.texte_sms(source_id)
        if not texte:
            return None
        # Sans réveiller le fil : c'est ICI que le document se dépose. Le
        # réveiller aussi le faisait partir DEUX fois, deux envois de 57 Ko
        # par la 3G pour une seule demande.
        numero = self._programmer_recu(source_id, texte, nature=nature,
                                       langue=langue, expliquer=True,
                                       reveiller=False)
        if not numero:
            return numero
        etat = "en_route"
        try:
            etat = self._servir_la_demande(source_id)
        except Exception as e:
            self._noter(f"dépôt du reçu {numero} : {e}")
        if etat == "en_route":
            self._reveil_depot.set()        # le fil reprendra, à son rythme
        rendu = NumeroDeRecu(numero)
        rendu.etat = etat
        return rendu

    def _servir_la_demande(self, source_id):
        """UNE PERSONNE ATTEND CE DOCUMENT, l'écran ouvert. Il est déposé
        ici, dans le fil de sa demande, AVANT de lui répondre.

        Sous le verrou du dépôt, comme le fil : deux dépôts croisés du même
        reçu pouvaient finir sur l'ANCIEN document. L'attente du verrou est
        bornée — le fil peut être au milieu d'un lot par la 3G — et passé
        ce délai la demande rend « en_route » : le fil s'en chargera."""
        if not (self.recus and self.nuage and self.nuage.actif):
            return "en_route"
        if not self._verrou_depot.acquire(timeout=ATTENTE_DU_FIL):
            return "en_route"
        try:
            ligne = self.journal.recu_de(source_id)
            if ligne is None:
                return "en_route"
            if self.journal.recu_en_place(source_id):
                # Genre, nature et langue n'ont pas bougé, et un document est
                # déposé. Mais ce qui entre dans le PDF ne vit pas tout dans
                # la ligne : le nom et le numéro inscrits aux Réglages y
                # sont. On le refait EN MÉMOIRE (une quinzaine de
                # millisecondes) et l'on compare à l'empreinte déposée.
                _, pdf, _ = self._fabriquer_recu(ligne[:9])
                if pdf is not None and empreinte_de(pdf) == ligne[9]:
                    return "inchange"
                self.journal.rearchiver_recu(ligne[0])
            self._deposer_lot(self.journal.recus_a_archiver(
                source_id=source_id))
        finally:
            self._verrou_depot.release()
        return "depose" if self.journal.recu_en_place(source_id) else "en_route"

    # ---- le dépôt sur la plateforme, puis Telegram -------------------------

    def lancer_le_depot(self):
        """Démarre le fil qui dépose les reçus sur la plateforme."""
        if not (self.recus and self.nuage):
            return None
        fil = threading.Thread(target=self._fil_du_depot, daemon=True,
                               name=FIL_DU_DEPOT)
        fil.start()
        return fil

    def _fil_du_depot(self):
        """Dépose chaque reçu dès qu'il est inscrit — et ne meurt jamais.

        Réveillé par `_programmer_recu`, il ne dort jamais plus de
        PAUSE_DEPOT. Après un accroc (plateforme injoignable, document qui
        ne se fabrique pas), il réessaie après 2 s, puis 4, 8… jusqu'à
        PAUSE_DEPOT : une coupure d'Internet ne doit ni retarder le retour,
        ni marteler un réseau absent — et un accroc passager ne doit pas
        brûler en une seconde les soixante essais d'un document."""
        attente, reprise = 0, 1
        while self.actif:
            if attente:
                self._reveil_depot.wait(timeout=attente)
            self._reveil_depot.clear()
            if not self.actif:
                break
            try:
                reste = self._deposer_recus()
            except Exception as e:
                self._noter(f"dépôt des reçus : {e}")
                reste = True
            if reste == "plein":
                attente, reprise = 0, 1           # la suite, tout de suite
            elif reste is True:
                # Un accroc : 2 s, puis 4, 8… jusqu'au plafond.
                attente = min(PAUSE_DEPOT, max(PREMIERE_REPRISE_DEPOT,
                                               reprise * 2))
                reprise = attente
            else:
                attente = PAUSE_DEPOT             # tout est déposé
                reprise = 1

    def _distribuer_recus(self):
        """Dépose sur la plateforme, PUIS envoie sur Telegram — deux chemins
        indépendants : l'échec de l'un ne retient jamais l'autre.

        Le tour de surveillance passe ici à chaque tour : pour le dépôt, ce
        n'est qu'un filet (son fil s'en charge, voir `_fil_du_depot`) ; pour
        Telegram, c'est le chemin ordinaire, avec son délai."""
        if not self.recus:
            return
        # Le fil du dépôt est déjà dessus ? Inutile de l'attendre.
        if (self.nuage and self.nuage.actif
                and self._verrou_depot.acquire(blocking=False)):
            try:
                self._deposer_lot(self.journal.recus_a_archiver())
            except Exception as e:
                self._noter(f"dépôt des reçus : {e}")
            finally:
                self._verrou_depot.release()
        self._envoyer_recus()

    def _deposer_recus(self):
        """Dépose sur la plateforme les reçus qui n'y sont pas encore. Voir
        `_deposer_lot` pour ce qu'il rend."""
        if not (self.recus and self.nuage and self.nuage.actif):
            return None
        with self._verrou_depot:
            return self._deposer_lot(self.journal.recus_a_archiver())

    def _deposer_lot(self, lignes):
        """Rend None s'il n'y avait rien à faire, « plein » si le lot entier
        a AVANCÉ (il en reste peut-être), True si un accroc l'a interrompu
        ou laissé un document en file (à reprendre plus tard), False sinon.

        « Plein » ne se dit que d'un lot qui a avancé. Un lot de cinq
        documents qui échouent tous à la fabrication se disait « plein »
        aussi : le fil repartait aussitôt, et les soixante essais prévus
        pour s'étaler sur une longue panne brûlaient en dix millisecondes."""
        if not lignes:
            return None
        accroc = bouge = False
        for ligne in lignes:
            try:
                nom, pdf, _ = self._fabriquer_recu(ligne)
            except Exception as e:
                # Pas en silence : sans ce mot, l'icône n'apparaîtrait jamais
                # sur la plateforme et personne ne saurait pourquoi.
                self._noter(f"reçu {ligne[2]} non déposé : {e}")
                self.journal.recu_depot_echoue(ligne[0])
                accroc = True
                continue
            if pdf is None:
                self._noter(f"reçu {ligne[2]} non déposé : le message ne "
                            "se lit plus sous ce genre")
                self.journal.recu_abandonne_au_depot(ligne[0])
            elif self.nuage.archiver_recu(nom, pdf, self._fiche_recu(ligne)):
                # Marqué SEULEMENT si la ligne n'a pas bougé pendant l'envoi.
                # Sinon le document qui vient de partir est l'ancien : la
                # ligne reste en file, et le passage suivant dépose le bon.
                if not self.journal.recu_archive(
                        ligne[0], empreinte_de(pdf), ligne=ligne):
                    bouge = True
            else:
                # Réseau absent : la file reste telle quelle, on repassera.
                return True
        if accroc:
            return True
        return "plein" if (len(lignes) >= 5 or bouge) else False

    def _envoyer_recus(self):
        """Envoie sur Telegram les reçus mûrs — DELAI_RECU après leur
        inscription, pour que l'alerte texte du SMS arrive la première."""
        if not self._verrou_envoi.acquire(blocking=False):
            return
        try:
            self._envoyer_recus_sans_verrou()
        finally:
            self._verrou_envoi.release()

    def _envoyer_recus_sans_verrou(self):
        for ligne in self.journal.recus_a_envoyer(DELAI_RECU):
            identifiant = ligne[0]
            try:
                nom, pdf, legende = self._fabriquer_recu(ligne)
            except Exception as e:
                self.journal.evenement(f"reçu {ligne[2]} illisible : {e}")
                self.journal.recu_echoue(identifiant)
                continue
            if pdf is None:
                # Le message ne se lit plus sous le genre inscrit. Un abandon
                # SILENCIEUX laissait la plateforme promettre un document qui
                # n'arriverait jamais — l'événement, lui, remonte au cloud.
                self._noter(f"reçu {ligne[2]} abandonné : le message ne se "
                            "lit plus sous ce genre")
                self.journal.recu_echoue(identifiant, essais_max=1)
                continue
            if self.transport.envoyer_fichier(nom, pdf, legende,
                                              canal="encaissements",
                                              type_mime="application/pdf"):
                self.journal.recu_envoye(identifiant)
            else:
                # Réseau absent : on repassera. Le document n'est pas perdu,
                # il n'a simplement pas encore été fabriqué pour de bon.
                # La plateforme, elle, l'a déjà (ou l'aura sans attendre).
                self.journal.recu_echoue(identifiant)
                break

    def _fabriquer_recu(self, ligne):
        """(nom de fichier, PDF, légende) — ou (nom, None, «») si le SMS n'est
        plus compris. Le document se refait à l'identique depuis le message :
        rien n'est conservé sur la carte SD.

        `langue` : celle inscrite avec la demande (l'écran qui a demandé le
        reçu). Vide — reçu né d'un SMS entrant — le document suit la langue
        du robot, comme avant."""
        _, genre, numero, date, texte, compte, iccid, nature, langue = ligne
        quand = datetime.fromisoformat(date)
        # Le genre INSCRIT fait foi : un solde demandé sur un SMS de transfert
        # se remplit avec le « nouveau solde » que ce transfert annonce.
        motif = motif_selon_nature(
            self._motif(texte), "solde" if genre == SOLDE else "transfert")
        nom = f"{numero}.pdf"
        if motif is None or motif.genre != genre:
            return nom, None, ""

        operateur = self._operateur_de(compte, iccid)
        if genre == TRANSFERT:
            # Le titre suit la nature CHOISIE par le propriétaire quand elle
            # existe, la nature lue dans le SMS sinon : un dépôt donne un
            # « Reçu de dépôt », un retrait un « Reçu de retrait ». Le reste
            # (envois, encaissements, transferts entre comptes) reste « Reçu
            # de transfert » — le document, lui, est identique.
            titre = {"depot": t("Deposit receipt", "Reçu de dépôt",
                                langue=langue),
                     "retrait": t("Withdrawal receipt", "Reçu de retrait",
                                  langue=langue)}.get(
                         nature or categoriser(texte,
                                               numeros=self._nos_numeros()),
                         t("Transfer receipt", "Reçu de transfert",
                           langue=langue))
            # NOTRE côté de l'opération : le nom et le numéro inscrits aux
            # Réglages pour cette carte. Un SMS MTN ne nomme qu'un tiers —
            # « to PAYSELA … from your mobile money account » — et c'est ici
            # qu'on retrouve qui est en face de lui.
            num_nous, nom_nous = self.journal.identite(iccid)
            # L'heure du RÉSEAU quand le message la porte : MTN l'écrit, et
            # c'est elle qui figurera sur son relevé. Sans elle, l'heure de
            # réception reste la seule honnête.
            pdf = recu_transfert(motif.paiement, numero,
                                 motif.paiement.quand or quand, operateur,
                                 titre=titre, langue=langue,
                                 compte=(nom_nous, num_nous))
            legende = (f"🧾 {gras(titre)} — "
                       f"{gras(self._fcfa(motif.paiement.montant))}\n"
                       f"{italique(t('No. ', 'N° ', langue=langue) + numero)}")
        else:
            propre = self._compte_par_iccid(iccid)
            # `nom` porte déjà le nom du FICHIER : celui du compte a son
            # propre nom de variable, sans quoi le reçu partirait sans titre.
            _, nom_compte = self.journal.identite(iccid)
            pdf = recu_solde(motif.solde, nom_compte or compte or operateur,
                             self._numero_du_compte(propre) if propre else "",
                             numero, quand, operateur, langue=langue)
            # La légende suit la langue du document : moitié-moitié, elle
            # ferait douter de la pièce jointe elle-même.
            legende = (f"🧾 {gras(t('Balance receipt', 'Reçu de solde', langue=langue))} — "
                       f"{gras(self._fcfa(motif.solde))}\n"
                       f"{italique(t('No. ', 'N° ', langue=langue) + numero)}")
        return nom, pdf, legende

    def _fiche_recu(self, ligne):
        """Ce qu'on inscrit dans le cloud à côté du fichier."""
        _, genre, numero, date, texte, _, _, _, _ = ligne
        motif = motif_selon_nature(
            self._motif(texte), "solde" if genre == SOLDE else "transfert")
        montant = None
        if motif is not None:
            montant = (motif.paiement.montant if motif.paiement is not None
                       else motif.solde)
        return {"numero": numero, "genre": genre, "montant": montant,
                "reference": motif.reference if motif else None,
                "etabli_le": date}

    def _motif(self, texte):
        """Relit un message déjà inscrit, sans savoir d'où il vient.

        Les deux règles sont prudentes chacune de son côté, et le genre
        attendu est vérifié juste après : essayer les deux ne peut pas
        fabriquer un document qui n'avait pas lieu d'être.
        """
        return (motif_du_sms(texte, numeros=self._nos_numeros())
                or motif_du_menu(texte))

    def _compte_par_iccid(self, iccid):
        for compte in self.comptes:
            if iccid and compte.carte.iccid == iccid:
                return compte
        return self.comptes[0] if self.comptes else None

    def _operateur_de(self, libelle, iccid):
        """« Orange Money » ou « MTN MoMo », d'après la carte."""
        compte = self._compte_par_iccid(iccid)
        source = (compte.carte.operateur if compte else "") or libelle or ""
        return SERVICES.get(source.split()[0] if source.split() else "",
                            source or "Mobile Money")

    def _verifier_memoire(self):
        """Une mémoire SMS pleine fait perdre les messages suivants — donc des
        encaissements jamais vus. On prévient bien avant la saturation."""
        satures = []
        for compte in self.comptes:
            occupes, capacite = compte.memoire_sms()
            if capacite and occupes / capacite >= SEUIL_MEMOIRE:
                satures.append(f"{compte.libelle} : {occupes}/{capacite}")
        if not satures:
            self.memoire_signalee = False
            return
        if self.memoire_signalee:
            return
        self.memoire_signalee = True
        self.journal.evenement("mémoire SMS presque pleine — " + " ; ".join(satures))
        self.facteur.poster(
            t(f"⚠️ {gras('SMS storage almost full')}\n"
              + echap("\n".join(satures)) + "\n"
              + italique("Beyond that, the network cannot deliver new "
                         "messages: payments would go unnoticed."),
              f"⚠️ {gras('Mémoire SMS presque pleine')}\n"
              + echap("\n".join(satures)) + "\n"
              + italique("Au-delà, le réseau ne peut plus déposer de nouveaux SMS : "
                         "des encaissements passeraient inaperçus.")),
            canal="alertes")

    def _signaler_conflit(self):
        """Deux robots sur le même jeton se coupent mutuellement : les
        commandes se perdent au hasard, sans le moindre message d'erreur."""
        conflit = getattr(self.transport, "conflit", False)
        if conflit == self.conflit_signale:
            return
        self.conflit_signale = conflit
        if not conflit:
            return
        # Second garde-fou, indépendant du drapeau. Une alerte qui prévient
        # d'un problème ne doit jamais devenir le problème : quoi qu'il
        # arrive à l'état, on n'écrit qu'une fois par heure.
        maintenant = time.monotonic()
        if maintenant - self.dernier_conflit < INTERVALLE_CONFLIT:
            return
        self.dernier_conflit = maintenant
        self.journal.evenement("conflit : jeton Telegram utilisé ailleurs")
        self.facteur.poster(
            t(f"⚠️ {gras('Telegram has stopped answering me')}\n"
              "Another program is using the same bot key. Our commands get "
              "lost between the two, at random.\n\n"
              + gras("To see what is running:") + "\n"
              + mono('pgrep -af "python3 -m totem"') + "\n\n"
              + gras("To keep only one:") + "\n"
              + mono('sudo pkill -f "python3 -m totem"') + "\n"
              + mono("sudo systemctl restart totem") + "\n\n"
              + italique("The first line stops everything, the second brings "
                         "back the one robot that should run. This alert will "
                         "not repeat for an hour."),

              f"⚠️ {gras('Telegram refuse de me répondre')}\n"
              "Un second programme utilise la même clé de bot. Nos commandes "
              "se perdent entre les deux, au hasard.\n\n"
              + gras("Pour voir qui tourne :") + "\n"
              + mono('pgrep -af "python3 -m totem"') + "\n\n"
              + gras("Pour n'en garder qu'un :") + "\n"
              + mono('sudo pkill -f "python3 -m totem"') + "\n"
              + mono("sudo systemctl restart totem") + "\n\n"
              + italique("La première ligne arrête tout, la seconde relance "
                         "le seul robot qui doit tourner. Cette alerte ne se "
                         "répétera pas avant une heure.")), canal="alertes")

    def _rapport_quotidien(self):
        """Envoie le bilan une fois par jour, même si la boucle a sauté la
        minute exacte (redémarrage d'un modem, réseau lent, charge…)."""
        maintenant = datetime.now()
        if self.dernier_rapport == maintenant.date() or not self._heure_passee():
            return False
        self.dernier_rapport = maintenant.date()
        self._rapport()
        if self.sauvegarde_quotidienne:
            self._sauvegarde(canal="alertes", automatique=True)
        return True

    def _notifier_sms(self, compte, expediteur, texte, sms_id=None):
        """Tous les SMS arrivent de la même façon : aucun n'est mis en
        sourdine. Un message d'opérateur peut annoncer une suspension de
        compte ou une opération non voulue — rien ne doit passer inaperçu.
        Seul l'AFFICHAGE distingue les cas, pour se lire d'un coup d'œil.

        L'envoi passe par le facteur : un encaissement survenu pendant une
        coupure Internet doit repartir tout seul au retour du réseau."""
        etiquette = f" [{echap(compte.libelle)}]" if self.multi else ""
        paiement = analyser(texte, numeros=self._nos_numeros())

        if paiement and paiement.sens == "entree":
            entete = t(f"💰 {gras('Payment received')}{etiquette} — "
                       f"{gras(self._fcfa(paiement.montant))}\n"
                       f"from {gras(paiement.tiers)}",
                       f"💰 {gras('Encaissement')}{etiquette} — "
                       f"{gras(self._fcfa(paiement.montant))}\n"
                       f"de {gras(paiement.tiers)}")
        elif paiement and paiement.sens == "sortie":
            entete = t(f"↗️ {gras('Money sent')}{etiquette} — "
                       f"{gras(self._fcfa(paiement.montant))}\n"
                       f"to {gras(paiement.tiers)}",
                       f"↗️ {gras('Envoi')}{etiquette} — "
                       f"{gras(self._fcfa(paiement.montant))}\n"
                       f"vers {gras(paiement.tiers)}")
        elif paiement:
            # Orange nomme les deux parties sans dire laquelle est la nôtre, et
            # la SIM ne déclare pas toujours son numéro. Plutôt qu'un
            # « Encaissement » qui pourrait être un envoi, on montre le
            # mouvement tel qu'il est écrit.
            if paiement.emetteur and paiement.beneficiaire:
                corps = (f"{gras(echap(str(paiement.emetteur)))} → "
                         f"{gras(echap(str(paiement.beneficiaire)))}")
            else:
                # Un seul tiers nommé (dépôt/retrait qui ne cite que l'autre
                # partie) : on le montre, sans inventer de flèche.
                corps = gras(echap(paiement.tiers))
            entete = t(f"🔁 {gras('Transfer')}{etiquette} — "
                       f"{gras(self._fcfa(paiement.montant))}\n{corps}",
                       f"🔁 {gras('Transfert')}{etiquette} — "
                       f"{gras(self._fcfa(paiement.montant))}\n{corps}")
        else:
            entete = t(f"📥 {gras('SMS')}{etiquette} from {gras(expediteur)}",
                       f"📥 {gras('SMS')}{etiquette} de {gras(expediteur)}")
            # Le silence qui coûte cher : un SMS d'argent que le lecteur n'a
            # pas su lire s'affichait comme n'importe quel message, et
            # l'opération n'était comptée nulle part. Quand Orange ou MTN
            # changent une tournure, le propriétaire doit l'apprendre le jour
            # même — pas des semaines plus tard devant un bilan trop maigre.
            if categoriser(texte, numeros=self._nos_numeros()) == "illisible":
                entete += "\n" + t(
                    "⚠️ This message speaks of money but I could not read it "
                    "fully — it is counted nowhere. You can classify it on "
                    "the platform for its receipt.",
                    "⚠️ Ce message parle d'argent mais je n'ai pas réussi à "
                    "le lire en entier — il n'est compté nulle part. Tu peux "
                    "le classer sur la plateforme pour son reçu.")
                self._noter(f"SMS d'argent illisible ({expediteur}) : "
                            "lecture incomplète, opération comptée nulle part")

        # LE CODE NE PART PAS DANS LE GROUPE. Chaque SMS reçu est annoncé
        # tout seul, sans que personne ne le demande — et « encaissements »
        # est le GROUPE dès qu'il y en a un. Le propriétaire y invite qui
        # suit la caisse ; un SMS « Votre code de confirmation est 483921. Ne
        # le communiquez a personne. » y arrivait entier, à chaque fois. Le
        # robot communiquait donc le code à tout le monde, tout seul.
        #
        # Dans le chat privé du propriétaire, rien ne change : le message est
        # à lui, code compris, et le lui cacher le rendrait inutilisable.
        partage = getattr(self.transport, "partage", False)
        self.facteur.poster(
            f"{entete}\n{echap(masquer_le_code(texte) if partage else texte)}",
            canal="encaissements")
        # Les téléphones inscrits ne sont pas tous celui du propriétaire : un
        # invité approuvé en a un, et un aperçu s'affiche sur un écran
        # VERROUILLÉ, que n'importe qui peut lire par-dessus une épaule.
        self._faire_sonner(expediteur, compte.libelle, masquer_le_code(texte),
                           iccid=compte.carte.iccid if compte.carte.identifiee else None,
                           paiement=bool(paiement and paiement.sens == "entree"),
                           sms_id=sms_id)

    def _faire_sonner(self, expediteur, libelle, texte, iccid=None, paiement=False,
                      sms_id=None):
        """Fait sonner les téléphones qui se sont inscrits.

        Rien ici ne peut retarder ni empêcher l'annonce Telegram : elle est
        déjà partie. L'envoi s'en va dans un fil à part — le guichet d'Expo
        est sur Internet, et à Douala Internet met parfois dix secondes à
        répondre non. On ne veut pas de ces dix secondes dans la lecture des
        SMS, où le message suivant attend son tour.

        Ce qui s'affiche se décide dans `notification.composer` : le message
        reçu, en aperçu, tel qu'il est arrivé.

        UNE SONNERIE QUI N'A PAS PU PARTIR N'EST PLUS PERDUE. Pendant une
        coupure d'Internet du boîtier, la liste des téléphones ne se lisait
        pas, une liste vide en tenait lieu, et rien ne partait — ni pendant,
        ni après, sans un mot au journal. Le client avait payé, le téléphone
        se taisait, et le propriétaire concluait qu'il n'avait pas payé. La
        sonnerie est maintenant RETENUE (`_retenir_la_sonnerie`) et repart au
        retour du réseau (`_rejouer_les_sonneries`).
        """
        if not self.nuage:
            return
        message = composer(expediteur, libelle, texte,
                           anglais=langue_active() == "en")
        if not message:
            return
        titre, corps = message

        def porter():
            try:
                # Le propriétaire, et ceux à qui CETTE carte est confiée.
                try:
                    appareils = self.nuage.appareils(iccid, lever=True)
                except Exception:
                    # On n'a pas pu DEMANDER qui faire sonner : le boîtier
                    # n'a plus Internet, ou la base ne répond pas.
                    self._retenir_la_sonnerie(sms_id, iccid, libelle,
                                              expediteur, texte, paiement)
                    return
                billets, injoignables = [], []
                servis, soucis = envoyer(appareils, titre, corps, acceptes=billets,
                                         injoignables=injoignables)
                if injoignables and not servis:
                    # La liste s'est lue, mais le guichet des notifications
                    # n'a SÛREMENT rien reçu. (Une réponse perdue après
                    # l'envoi n'est pas de ce côté-là : la notification est
                    # peut-être partie, et la renvoyer ferait sonner deux
                    # fois le même paiement.)
                    self._retenir_la_sonnerie(sms_id, iccid, libelle,
                                              expediteur, texte, paiement)
                    return
                # L'ACCUSÉ, PAS SEULEMENT LE BILLET. Le refus d'Apple (clé de
                # notification absente du projet) n'arrive qu'après coup :
                # sans cette lecture, un iPhone muet comptait pour servi à
                # chaque paiement. On attend un peu — on est dans un fil à
                # part, rien d'autre n'attend — puis on retire du compte
                # les billets refusés plus loin.
                if billets:
                    time.sleep(ATTENTE_DES_ACCUSES)
                    refus = lire_les_accuses(billets)
                    servis -= len(refus)
                    soucis = soucis + refus
                self._dire_si_les_telephones_se_taisent(
                    len(appareils), servis, soucis)
            except Exception:
                pass    # une notification perdue n'est pas une panne

        threading.Thread(target=porter, daemon=True).start()

    def _retenir_la_sonnerie(self, sms_id, iccid, libelle, expediteur, texte,
                             paiement):
        """Met de côté une sonnerie qui n'a pas pu partir, jusqu'au retour du
        réseau. Elle est écrite dans le journal du Pi, comme le courrier
        Telegram en souffrance : un redémarrage pendant la coupure ne la
        perd pas. Le texte est celui de l'écran verrouillé — code masqué.

        La première de la coupure se dit au journal ; les suivantes se
        comptent, et le compte se dit au retour (`_rattraper_les_sonneries`)."""
        try:
            retenues = self.journal.retenir_sonnerie(
                sms_id, iccid, libelle, expediteur, texte, paiement)
        except Exception:
            return
        if retenues == 1:
            self._noter("sonnerie retenue : le boîtier n'a pas pu joindre les "
                        "téléphones (Internet coupé ?) — elle repartira au "
                        "retour du réseau")

    def _rejouer_les_sonneries(self):
        """Appelé à la fin de chaque tour de transmission vers le nuage. S'il
        y a des sonneries retenues, un fil à part les rattrape : le fil des
        transmissions, lui, ne doit rien attendre."""
        try:
            if not self.journal.sonneries_retenues():
                return
        except Exception:
            return
        if not self._rattrapage.acquire(blocking=False):
            return      # un rattrapage est déjà en route

        def rattraper():
            try:
                self._rattraper_les_sonneries()
            except Exception:
                pass    # elles restent retenues : le tour de transmission suivant y revient
            finally:
                self._rattrapage.release()

        threading.Thread(target=rattraper, daemon=True).start()

    def _rattraper_les_sonneries(self):
        """Fait sonner, en UNE notification, ce que la coupure a retenu.

        Cinq règles :
          — une sonnerie ne part qu'une fois SON SMS dans la base : le
            téléphone qui sonne fait ouvrir l'application, qui doit y trouver
            le paiement annoncé — pas « 3 messages en cours de transmission »
            au-dessus d'une liste qui ne les a pas ;
          — seules les sonneries de la dernière demi-heure repartent, et cette
            demi-heure ne se mesure pas sur l'heure murale du Pi (voir
            `age_de_la_sonnerie`). Les autres sont dites au journal, et
            oubliées ;
          — CHACUN ENTEND SES CARTES, au rattrapage comme à l'heure : chaque
            téléphone reçoit une notification qui ne parle que des cartes
            qu'il entend ;
          — CHACUN N'EST PRÉVENU QU'UNE FOIS. Ce qui est servi se retient par
            téléphone, pas par sonnerie : si le réseau retombe au milieu du
            rattrapage, le propriétaire déjà prévenu ne reçoit pas une
            seconde fois, comme un paiement neuf, ce que le vendeur attend
            encore ;
          — si le réseau retombe, rien n'est oublié : le tour suivant y
            reviendra.

        AUCUNE DONNÉE PERSONNELLE au journal : des nombres, et une cause.
        """
        retenues = self.journal.sonneries_retenues()
        if not retenues:
            return
        try:
            heure_base = self.nuage.heure_de_la_base()
        except Exception:
            heure_base = None
        fraiches, perimees, sans_heure = [], [], []
        for s in retenues:
            age = age_de_la_sonnerie(s, heure_base)
            if age is not None and age > SONNERIE_PERIMEE_S:
                perimees.append(s)
            elif not s.transmise:
                continue        # son SMS n'est pas encore dans la base : elle attend
            elif age is None:
                sans_heure.append(s)
            else:
                fraiches.append((s, age))
        self._oublier_les_sonneries_tardives(perimees, sans_heure)
        if not fraiches:
            return

        # Qui entend quoi : la liste des téléphones se lit carte par carte.
        cartes_de = {}
        for iccid in dict.fromkeys(s.iccid for s, _ in fraiches):
            try:
                jetons = self.nuage.appareils(iccid or None, lever=True)
            except Exception:
                return      # toujours coupé : tout reste retenu
            for jeton in jetons:
                cartes_de.setdefault(jeton, set()).add(iccid)
        servis = {s.id: set(s.servis) for s, _ in fraiches}
        # Ce que chaque téléphone n'a pas encore reçu ; ceux qui attendent
        # EXACTEMENT les mêmes sonneries reçoivent la même notification, en
        # un seul envoi.
        groupes = {}
        for jeton, cartes in cartes_de.items():
            marque = empreinte_du_telephone(jeton)
            cle = tuple(s.id for s, _ in fraiches
                        if s.iccid in cartes and marque not in servis[s.id])
            if cle:
                groupes.setdefault(cle, []).append(jeton)

        anglais = langue_active() == "en"
        attendus = reussis = 0
        soucis, billets = [], []
        for cle, jetons in groupes.items():
            liste = [(s, age) for s, age in fraiches if s.id in cle]
            titre, corps = composer_rattrapage(
                [(s.libelle, s.expediteur, s.texte, s.paiement,
                  heure_de_reception(s, age, heure_base)) for s, age in liste],
                anglais=anglais, nom=self.nom)
            injoignables = []
            ok, ennuis = envoyer(jetons, titre, corps, acceptes=billets,
                                 injoignables=injoignables)
            attendus += len(jetons)
            reussis += ok
            soucis += ennuis
            # Prévenus : tout ce qui n'est pas SÛREMENT resté en route. Un
            # refus définitif ou une réponse perdue ne se renvoient pas.
            marques = [empreinte_du_telephone(j) for j in jetons
                       if j not in injoignables]
            self.journal.noter_sonneries_servies(cle, marques)
            for i in cle:
                servis[i].update(marques)
        # Une sonnerie est faite quand tous les téléphones qui l'entendent
        # l'ont reçue — ou quand aucun ne l'entend.
        parties = [s for s, _ in fraiches
                   if all(empreinte_du_telephone(j) in servis[s.id]
                          for j, cartes in cartes_de.items() if s.iccid in cartes)]
        self.journal.oublier_sonneries([s.id for s in parties])
        if parties:
            n = len(parties)
            suite = (" : rejouée au retour du réseau" if n == 1 else
                     " : regroupées en une notification au retour du réseau")
            if not cartes_de:
                suite = " : aucun téléphone à prévenir au retour du réseau"
            self._noter(
                ("1 sonnerie n'a pas pu partir pendant la coupure d'Internet"
                 if n == 1 else
                 f"{n} sonneries n'ont pas pu partir pendant la coupure "
                 "d'Internet") + suite)
        if billets:
            time.sleep(ATTENTE_DES_ACCUSES)
            refus = lire_les_accuses(billets)
            reussis -= len(refus)
            soucis = soucis + refus
        if attendus:
            self._dire_si_les_telephones_se_taisent(attendus, reussis, soucis)

    def _oublier_les_sonneries_tardives(self, perimees, sans_heure):
        """Les sonneries qui ne sonneront plus : dites au journal, en nombre."""
        if perimees:
            self.journal.oublier_sonneries([s.id for s in perimees])
            n = len(perimees)
            self._noter(
                "1 sonnerie n'a pas pu partir pendant la coupure d'Internet — "
                "trop ancienne pour sonner encore (plus de 30 min)" if n == 1 else
                f"{n} sonneries n'ont pas pu partir pendant la coupure "
                "d'Internet — trop anciennes pour sonner encore (plus de 30 min)")
        if sans_heure:
            self.journal.oublier_sonneries([s.id for s in sans_heure])
            n = len(sans_heure)
            self._noter(
                ("1 sonnerie n'a pas pu partir pendant la coupure d'Internet"
                 if n == 1 else
                 f"{n} sonneries n'ont pas pu partir pendant la coupure "
                 "d'Internet")
                + " — le boîtier a redémarré depuis, et l'heure du message "
                "ne se laisse plus établir : on ne fait pas sonner un "
                "paiement dont on ne sait pas l'âge")

    def _dire_si_les_telephones_se_taisent(self, attendus, servis, soucis):
        """Écrit au journal quand les téléphones ne sonnent pas.

        POURQUOI CETTE MÉTHODE EXISTE. Le robot envoyait ses notifications
        dans un fil à part, avalait toute erreur, et ne comptait même pas ce
        que le guichet avait accepté. Quand plus rien ne sonnait — une clé
        Apple absente du projet suffit — TOUT avait l'air normal : Telegram
        annonçait, la plateforme affichait, le journal se taisait. Le
        propriétaire n'avait aucun endroit où lire que ses téléphones
        n'étaient plus joints.

        AUCUNE DONNÉE PERSONNELLE N'ENTRE ICI : un compte, et une cause. Le
        journal se garde longtemps et se lit à plusieurs.
        """
        if attendus and not servis and soucis and all(
                souci == PEUT_ETRE_PARTIE for souci in soucis):
            # Le guichet a reçu la notification, sa réponse s'est perdue :
            # « muets » serait affirmer ce qu'on ne sait pas.
            etat = "peut-être prévenus — le guichet n'a pas répondu à temps"
        elif attendus and not servis:
            etat = "muets : " + " · ".join(dict.fromkeys(soucis)) if soucis \
                else "muets, sans raison donnée par le guichet"
        elif servis < attendus:
            etat = (f"{servis} sur {attendus} accepté(s) : "
                    + " · ".join(dict.fromkeys(soucis)))
        else:
            etat = "d'accord"
        # Le premier retour à la normale se dit aussi : sans cela, on lirait
        # « muets » pour toujours et on ne saurait pas quand ça s'est réparé.
        if etat == self._souci_sonnerie:
            return
        premier = self._souci_sonnerie is None
        self._souci_sonnerie = etat
        if etat == "d'accord":
            if not premier:
                self.journal.evenement("les téléphones sonnent à nouveau")
            return
        self.journal.evenement(f"téléphones {etat}")

    def _courrier_abandonne(self, canal, texte):
        """Le facteur a dû jeter un message que Telegram refusait obstinément
        (fil de discussion fermé ou supprimé, robot sorti du groupe).

        On prévient le propriétaire — mais EN DIRECT, dans la conversation
        privée, jamais par le fil en cause qui est justement cassé — et pas
        plus d'une fois par quart d'heure, pour ne pas noyer la panne sous ses
        propres répétitions."""
        maintenant = time.time()
        if maintenant - self._dernier_avert_courrier < 900:
            return
        self._dernier_avert_courrier = maintenant
        ou = {"encaissements": t("payments", "les encaissements"),
              "alertes": t("alerts", "les alertes")}.get(
                  canal, t("notifications", "les notifications"))
        self.journal.evenement(f"courrier abandonné (canal {canal or 'privé'})")
        try:
            self.transport.envoyer(
                t(f"⚠️ {gras('A notification could not be posted')}\n"
                  f"I can no longer write in the thread used for {ou}. "
                  "It may have been closed or deleted, or I am no longer "
                  "a member.\n\n"
                  + italique(
                      "Check that thread in the Telegram group. The message "
                      "was set aside so the next ones are not blocked — USSD "
                      "and everything else still works."),
                  f"⚠️ {gras('Une notification n’a pas pu être publiée')}\n"
                  f"Je n’arrive plus à écrire dans le fil réservé à {ou}. "
                  "Il a peut-être été fermé ou supprimé, ou je n’en suis plus "
                  "membre.\n\n"
                  + italique(
                      "Vérifie ce fil dans le groupe Telegram. Le message a été "
                      "mis de côté pour ne pas bloquer les suivants — l’USSD et "
                      "les autres envois ne sont pas touchés.")))
        except Exception:
            pass

    def _incident_cloud(self, source_id, erreur):
        """La base a refusé un paiement. Pour que le propriétaire cesse de
        chercher pourquoi un SMS n'apparaît pas sur la plateforme, on le dit
        sur Telegram — avec l'erreur exacte, pour pouvoir corriger la cause —
        et pas plus d'une fois par quart d'heure."""
        maintenant = time.time()
        if maintenant - self._dernier_avert_cloud < 900:
            return
        self._dernier_avert_cloud = maintenant
        try:
            self.transport.envoyer(
                t(f"⚠️ {gras('Some SMS are not reaching the platform')}\n"
                  "The database is refusing them. They stay here on Telegram "
                  "and on the terminal — nothing is lost — but they will not "
                  "show on the website until this is fixed.\n\n"
                  f"Technical reason: {mono(echap(str(erreur))[:300])}\n\n"
                  + italique("Pass this reason along: it says exactly what "
                             "to fix on the database side."),
                  f"⚠️ {gras('Des SMS n’arrivent pas sur la plateforme')}\n"
                  "La base de données les refuse. Ils restent ici sur Telegram "
                  "et sur le terminal — rien n’est perdu — mais ils n’apparaissent "
                  "pas sur le site tant que ce n’est pas corrigé.\n\n"
                  f"Raison technique : {mono(echap(str(erreur))[:300])}\n\n"
                  + italique("Transmets-moi cette raison : elle dit exactement "
                             "quoi corriger côté base.")))
        except Exception:
            pass

    def _expirer_session(self):
        with self.verrou:
            compte = self.session_compte
            if compte is None:
                return
            if time.time() - self.dernier_echange < self.delai_session:
                return
            compte.ussd_annuler(qui=TITULAIRE_TELEGRAM)
            self.journal.evenement(f"session USSD expirée ({compte.libelle})")
            self._cloturer_session(
                t("⌛ USSD session expired (no answer for too long). The "
                  "operator would have closed it on their side anyway.",
                  "⌛ Session USSD expirée (sans réponse trop longtemps). "
                  "L'opérateur l'aurait fermée de son côté."))

    def _redemarrer_modem(self, compte, canal=None, automatique=False):
        """Relance le modem d'un compte.

        Une panne matérielle dure. Le robot doit continuer d'essayer — mais
        une alerte identique répétée toutes les minutes ne dit rien de plus
        que la première, et finit par enterrer les encaissements sous le
        bruit. On annonce donc la panne une fois, on réessaie de plus en plus
        espacé, et on ne reparle que pour dire que c'est revenu.
        """
        etiquette = f"[{echap(compte.libelle)}] " if self.multi else ""

        if automatique:
            if time.time() < compte.prochaine_tentative:
                return
            # Une minute, puis deux, puis quatre… jusqu'à une demi-heure.
            compte.attente_modem = min(max(compte.attente_modem * 2, 60), 1800)
            compte.prochaine_tentative = time.time() + compte.attente_modem

        if not automatique or not compte.panne_signalee:
            self.transport.envoyer(
                t(f"⚠️ {etiquette}The modem has stopped answering, "
                  "restarting it…",
                  f"⚠️ {etiquette}Le modem ne répond plus, je le redémarre…")
                if automatique
                else t(f"{etiquette}Restarting the modem (≈30 s)…",
                       f"{etiquette}Redémarrage du modem (≈30 s)…"), canal=canal)

        try:
            compte.redemarrer()
        except Exception as e:
            self.journal.evenement(f"redémarrage {compte.libelle} : {e}")
            if not compte.panne_signalee:
                compte.panne_signalee = True
                self.transport.envoyer(
                    t(f"❌ {etiquette}{gras('The modem has stopped answering')}\n"
                      f"{echap(e)}\n\n"
                      + italique(
                          "I will keep trying, at longer and longer "
                          "intervals, and I will say so as soon as it comes "
                          "back. On site: check the USB cable between the "
                          "HAT and the Pi, then the power supply — the modem "
                          "draws 3 A at peak, and drops off the bus when the "
                          "adapter is too weak."),
                      f"❌ {etiquette}{gras('Le modem ne répond plus')}\n"
                      f"{echap(e)}\n\n"
                      + italique(
                          "Je continue d'essayer, de plus en plus espacé, et je "
                          "préviens dès qu'il revient. Sur place : vérifier le "
                          "câble USB entre le HAT et le Pi, puis l'alimentation "
                          "— le modem réclame 3 A en pointe, et décroche du bus "
                          "quand le bloc est trop juste.")), canal=canal)
            return

        if not self._annoncer_retour(compte, canal):
            self.transport.envoyer(
                t(f"✅ {etiquette}Modem back online. "
                  f"Signal: {compte.signal()}/31",
                  f"✅ {etiquette}Modem revenu en ligne. "
                  f"Signal : {compte.signal()}/31"), canal=canal)

    def _annoncer_retour(self, compte, canal="alertes"):
        """Dit que le modem répond de nouveau, si on avait annoncé le contraire.

        Renvoie vrai quand quelque chose a été dit. Rien à annoncer dans le cas
        courant — un modem qui n'est jamais tombé n'a pas à se signaler.
        """
        revenu = compte.panne_signalee
        compte.panne_signalee = False
        compte.attente_modem = 0
        compte.prochaine_tentative = 0.0
        if not revenu:
            return False
        etiquette = f"[{echap(compte.libelle)}] " if self.multi else ""
        self.journal.evenement(f"modem revenu ({compte.libelle})")
        self.transport.envoyer(
            t(f"✅ {etiquette}{gras('The modem is answering again')}\n"
              f"Signal: {compte.signal()}/31",
              f"✅ {etiquette}{gras('Le modem répond de nouveau')}\n"
              f"Signal : {compte.signal()}/31"), canal=canal)
        return True


def empreinte_du_telephone(jeton):
    """Ce que le journal garde d'un téléphone déjà prévenu : une empreinte,
    jamais le jeton. Le jeton suffit, à lui seul, pour faire sonner ce
    téléphone ; le journal, lui, part en sauvegarde."""
    return hashlib.sha256(str(jeton).encode("utf-8")).hexdigest()[:16]


def age_de_la_sonnerie(sonnerie, heure_base):
    """Depuis combien de secondes une sonnerie attend, ou None si on ne peut
    pas le savoir.

    PAS AVEC L'HEURE MURALE DU PI. La coupure la plus courante à Douala est
    celle du COURANT : elle éteint le Pi, le routeur et Starlink ensemble. Le
    Pi n'a pas de pile ; il redémarre avec l'heure de sa dernière sauvegarde,
    des heures en retard, et ne la corrige qu'au retour d'Internet. Une
    sonnerie retenue entre les deux était datée de cette heure fausse, puis
    comparée à l'heure juste : retenue il y a une minute, elle paraissait
    vieille de deux heures, et on la jetait « trop ancienne ».

    Dans le même démarrage, l'âge se lit sur l'horloge MONOTONE, qu'aucun
    réglage de l'heure ne fait sauter. D'un démarrage à l'autre, elle repart
    de zéro : on compare alors l'heure RÉSEAU du SMS (donnée par l'opérateur)
    à l'heure de la base (`Nuage.heure_de_la_base`) — deux horloges qui ne
    sont pas celle du Pi. Sans l'une ou l'autre, on ne sait pas.
    """
    if sonnerie.demarrage == demarrage_courant() and sonnerie.monotone is not None:
        return max(0.0, time.monotonic() - sonnerie.monotone)
    instant = lire_instant(sonnerie.emis_le)
    if instant is None or heure_base is None:
        return None
    age = (heure_base - instant).total_seconds()
    # Un SMS « reçu dans le futur » de plus de cinq minutes ne dit pas un
    # âge : il dit que les horloges ne s'accordent pas.
    return max(0.0, age) if age > -300 else None


def heure_de_reception(sonnerie, age, heure_base):
    """L'heure à écrire dans la notification rattrapée (« 14 h 05 »).

    L'heure RÉSEAU du SMS quand on l'a, telle que l'opérateur l'a écrite ;
    sinon, maintenant moins l'âge — maintenant pris à la base, ou, faute de
    mieux, au Pi, dont l'heure est revenue avec le réseau."""
    instant = lire_instant(sonnerie.emis_le)
    if instant is None:
        if age is None:
            return None
        maintenant = heure_base or datetime.now(timezone.utc)
        instant = (maintenant - timedelta(seconds=age)).astimezone()
    return heure_en_lettres(instant)
