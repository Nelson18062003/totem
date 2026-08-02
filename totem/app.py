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
import time
from datetime import datetime

from .analyse_sms import analyser, formater_montant, masquer_secrets
from .declencheur import TRANSFERT, motif_du_menu, motif_du_sms
from .recu import (numero_de_recu, numero_lisible, recu_solde,
                   recu_transfert)
from .codes import catalogue, cle as cle_code
from .compte import ErreurModem, libelles_uniques
from .courrier import Facteur
from .mise_en_forme import bloc, echap, gras, italique, mono
from .pilotage import Pilotage
from .sante import Sante, sauvegarder_journal
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
    r"\bpin\b|\bmdp\b|\bcodes?\b|secret|confidentiel|mot\s+de\s+passe|password",
    re.I)
# Une option de menu : « 1. Texte », « 2) Texte », « 3- Texte », « 04 : Texte ».
# Le séparateur est obligatoire, sinon « 1 000 FCFA » passerait pour une option.
RE_OPTION = re.compile(r"^\s*(\d{1,2})\s*[.):\-]\s*(\S.*)$")
# Invites qui précèdent une saisie de montant ou de bénéficiaire : elles
# permettent de rappeler à l'écran ce qu'on s'apprête réellement à valider.
RE_DEMANDE_MONTANT = re.compile(r"montant|somme|amount", re.I)
RE_DEMANDE_DESTINATAIRE = re.compile(
    r"num[ée]ro|b[ée]n[ée]ficiaire|destinataire|recipient", re.I)

ADMIN = "admin"
PAVE_PIN = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]]
VERIF_MEMOIRE_SECONDES = 300
# Un échange de SIM demande d'ouvrir le boîtier : inutile de guetter à la
# seconde. Une minute suffit pour que l'annonce paraisse immédiate.
VERIF_CARTES_SECONDES = 60
SEUIL_MEMOIRE = 0.8        # on alerte bien avant la saturation
# Le délai entre l'annonce du SMS et le reçu qui la suit. Assez pour que les
# deux messages ne se bousculent pas dans la conversation ni dans les limites
# de Telegram, assez peu pour qu'on n'ait pas le temps de s'impatienter.
DELAI_RECU = 10
# Le nom commercial du service, tel qu'il apparaît en pied de reçu.
SERVICES = {"Orange": "Orange Money", "MTN": "MTN MoMo"}

COMMANDES_BOT = [
    ("menu", "Écran d'accueil avec les boutons"),
    ("statut", "État des modems, des SIM et du signal"),
    ("comptes", "Choisir le compte piloté"),
    ("sims", "Les cartes SIM connues et celle en place"),
    ("raccourcis", "Vos boutons : en créer, en supprimer"),
    ("sms", "Les derniers SMS reçus"),
    ("rapport", "Bilan des dernières 24 h"),
    ("export", "Journal des 7 derniers jours en CSV"),
    ("reglages", "Le numéro et le nom de chaque puce"),
    ("diagnostic", "État détaillé (version, mémoire SMS, cartes)"),
    ("brut", "Voir le dernier menu tel que l'opérateur l'a envoyé"),
    ("sauvegarde", "Envoyer une copie du journal dans la conversation"),
    ("annuler", "Fermer la session USSD en cours"),
    ("redemarrer_modem", "Relancer le modem du compte courant"),
    ("aide", "Aide"),
]


class Robot:
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
        if self.nuage is not None:
            # Quand la base refuse un paiement, le propriétaire doit l'apprendre
            # sur Telegram — sinon un SMS cesse d'apparaître sur la plateforme
            # sans que rien ne le dise.
            self.nuage.sur_incident = self._incident_cloud
        self.pilotage = None    # le guichet à distance, démarré avec le nuage
        # Les numéros des puces, déclarés dans la configuration. Une SIM
        # prépayée ne dit presque jamais le sien : sans cette liste, TOTEM ne
        # sait pas de quel côté d'un transfert il se trouve.
        self.numeros = dict(numeros or {})
        self.recus = recus      # joindre un reçu PDF aux opérations comprises
        self.actif = True
        self.verrou = threading.RLock()
        self.courant = self.comptes[0] if self.comptes else None
        self.sante = Sante()
        self.memoire_signalee = False
        self.conflit_signale = False
        self._dernier_avert_courrier = 0.0   # anti-répétition de l'alerte facteur
        self._dernier_avert_cloud = 0.0      # anti-répétition de l'alerte cloud
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
            "Le plus simple : /menu, puis tout se fait au doigt.", "",
            gras("Vos propres boutons"),
            "Faites une opération une fois — consulter le solde, par exemple. "
            "À la fin, appuyez sur " + gras("💾 En faire un bouton") + " : le "
            "parcours devient un raccourci, et vous n'aurez plus jamais à "
            "retaper les chiffres du menu. Les boutons suivent l'opérateur de "
            "la carte : ceux d'Orange n'apparaissent pas avec une puce MTN.",
            "",
            gras("Codes USSD"),
            f"Envoyez {mono('*126#')} (ou tout autre code) : le menu s'ouvre "
            "sous forme de boutons. Les questions libres (numéro, montant) se "
            "répondent par un message normal. Le code PIN se tape sur le pavé "
            "sécurisé : il n'apparaît jamais dans la conversation.",
        ]
        if self.multi:
            lignes += [
                "", gras("Plusieurs comptes"),
                f"{mono('mtn *126#')} — viser un compte sans changer de compte courant",
                "/comptes — liste des comptes et bascule",
                "Chaque carte SIM garde son propre journal : en changer ne "
                "mélange pas les caisses.",
            ]
        lignes += [
            "", gras("Commandes"),
            "/menu — écran d'accueil",
            "/statut — signal, opérateur, SIM",
            "/sims — les cartes SIM connues, et celle en place",
            "/raccourcis — vos boutons, et comment en créer",
            "/sms — les derniers SMS reçus",
            "/rapport — bilan des dernières 24 h",
            "/export — journal CSV des 7 derniers jours",
            "/annuler — ferme la session USSD",
            "/redemarrer_modem — relance le modem du compte courant",
            "/aide — ce message",
        ]
        return "\n".join(lignes)

    # ---- démarrage et arrêt ------------------------------------------------
    def demarrer(self, bloquant=True):
        if not self.comptes:
            self.transport.envoyer(
                "⚠️ Aucun modem détecté. Vérifiez les branchements USB.")
            return
        # Lu AVANT de journaliser ce démarrage : si le dernier événement connu
        # n'est pas un arrêt propre, la fois d'avant s'est mal terminée
        # (coupure de courant ou plantage). C'est une information précieuse.
        precedent = self.journal.dernier_evenement()
        brutal = precedent is not None and ARRET_PROPRE not in precedent

        self._installer_arret_propre()
        self.transport.vider_backlog()      # ne jamais rejouer d'ancienne commande
        self.transport.publier_commandes(COMMANDES_BOT)
        self._recenser_cartes(silencieux=True)
        detail = "\n".join(f"· {echap(c.resume())}" for c in self.comptes)
        pluriel = "comptes" if self.multi else "compte"
        avertissement = (
            "\n⚡ <i>Redémarrage après coupure de courant ou plantage : "
            "l'arrêt précédent n'était pas propre.</i>" if brutal else "")
        self.transport.envoyer(
            f"✅ {gras(self.nom)} en ligne — {len(self.comptes)} {pluriel}\n"
            f"{detail}\nVersion : {mono(version())}{avertissement}",
            boutons=self._boutons_accueil(ADMIN))
        self.journal.evenement(f"démarrage ({len(self.comptes)} compte(s))")
        threading.Thread(target=self._boucle_surveillance, daemon=True).start()
        if self.nuage:
            # Synchronisation en tâche de fond : elle rattrape son retard
            # quand le réseau le permet, et n'interrompt jamais le robot.
            self.nuage.demarrer(comptes=self.comptes, sante=self.sante)
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

    def _compte_par_nom(self, nom):
        """Retrouve un compte par libellé (« mtn ») ou par rang (« 2 »)."""
        n = nom.strip().lower().lstrip("/")
        if n.isdigit():
            i = int(n) - 1
            return self.comptes[i] if 0 <= i < len(self.comptes) else None
        for c in self.comptes:
            if c.libelle.lower().startswith(n):
                return c
        return None

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
                self._derniers_sms(canal)
            elif commande == "rapport":
                self._rapport(canal=canal, manuel=True)
            elif commande == "diagnostic":
                self._diagnostic(canal)
            elif commande == "brut":
                self._brut(canal)
            elif commande == "export":
                self._export(canal)
            elif commande and self._compte_par_nom(commande):
                # /mtn, /orange, /1, /2 — bascule de compte courant
                if not self._verifier_admin(role, entrant, canal):
                    return
                self.courant = self._compte_par_nom(commande)
                self.transport.envoyer(
                    f"Compte courant : {gras(self.courant.libelle)}.", canal=canal,
                    boutons=[[("🏠 Menu", "c:menu")]])
            elif commande in ("annuler", "redemarrer_modem", "sauvegarde") \
                    or RE_CODE_USSD.match(texte) \
                    or RE_CIBLE_USSD.match(texte) or self.session_ussd:
                if not self._verifier_admin(role, entrant, canal):
                    return
                self._action_admin(commande, texte, entrant, canal)
            else:
                self.transport.envoyer(
                    "Je n'ai pas compris. Ouvrez /menu ou envoyez un code USSD "
                    f"tel que {mono('*126#')}.", canal=canal)

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
            compte = self._compte_par_nom(cible.group(1))
            if compte:
                return self._ouvrir_session(compte, cible.group(2), canal)

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
        # bout du fil. Encore faut-il le lui dire : sa session resterait
        # ouverte dans ses livres, et sa réponse suivante — qui peut être un
        # code secret — partirait dans le menu qu'on vient d'ouvrir ici.
        if self.pilotage is not None:
            self.pilotage.ceder(compte)
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

        if genre == "c" and valeur in ("menu", "statut", "sms", "rapport",
                                       "export", "aide", "comptes",
                                       "diagnostic", "sims", "reglages"):
            {"menu": lambda: self._accueil(canal, role),
             "aide": lambda: self.transport.envoyer(self._aide(), canal=canal),
             "statut": lambda: self._statut(canal),
             "comptes": lambda: self._lister_comptes(canal, role),
             "sims": lambda: self._lister_cartes(canal),
             "reglages": lambda: self._reglages(canal),
             "sms": lambda: self._derniers_sms(canal),
             "rapport": lambda: self._rapport(canal=canal, manuel=True),
             "diagnostic": lambda: self._diagnostic(canal),
             "export": lambda: self._export(canal)}[valeur]()
            return

        if not self._verifier_admin(role, entrant, canal):
            return

        if genre == "c" and valeur == "ussd":
            cible = f" sur {gras(self.courant.libelle)}" if self.multi else ""
            self.transport.envoyer(
                f"⌨️ Envoyez le code à composer{cible}, par exemple {mono('*126#')}.",
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
            "🔒 Vous suivez l'activité des SIM, mais leur pilotage est réservé "
            "aux administrateurs.", canal=canal)
        return False

    @staticmethod
    def _commande(texte):
        """« /Statut@totem_bot » → « statut ». Sinon chaîne vide."""
        if not texte.startswith("/"):
            return ""
        return texte[1:].split()[0].split("@")[0].lower()

    # ---- écran d'accueil ---------------------------------------------------
    def _boutons_accueil(self, role):
        lignes = []
        if self.multi:
            lignes.append([
                (("● " if c is self.courant else "") + c.libelle, f"a:{i + 1}")
                for i, c in enumerate(self.comptes[:4])
            ])
        raccourcis = self._raccourcis_actifs() if role == ADMIN else {}
        if raccourcis:
            noms = list(raccourcis)
            for i in range(0, len(noms), 2):
                lignes.append([(raccourcis[n]["libelle"], f"m:{n}")
                               for n in noms[i:i + 2]])
        lignes.append([("📥 SMS reçus", "c:sms"), ("📊 Rapport 24 h", "c:rapport")])
        lignes.append([("📡 Statut", "c:statut"), ("📄 Export CSV", "c:export")])
        if role == ADMIN:
            lignes.append([("⌨️ Code USSD", "c:ussd"),
                           ("⚙️ Réglages", "c:reglages")])
        lignes.append([("❓ Aide", "c:aide")])
        return lignes

    def _accueil(self, canal, role):
        nb, total, _ = self.journal.rapport_du_jour(self._cartes_en_place())
        etats = " · ".join(f"{echap(c.libelle)} {c.signal()}/31" for c in self.comptes)
        courant = (f"\nCompte piloté : {gras(self.courant.libelle)}"
                   if self.multi else "")
        self.transport.envoyer(
            f"🗿 {gras(self.nom)}\n{etats}{courant}\n"
            f"Dernières 24 h : {gras(f'{nb} encaissement(s)')} — "
            f"{gras(self._fcfa(total))}\n\nQue faire ?",
            boutons=self._boutons_accueil(role), canal=canal)

    # ---- session USSD ------------------------------------------------------
    def _ussd(self, compte, texte, nouveau=False):
        try:
            if nouveau:
                self.journal.ussd("envoyé", texte, compte.libelle,
                              compte.carte.iccid)
                reponse = compte.ussd_demarrer(texte)
            else:
                reponse = compte.ussd_repondre(texte)
        except ErreurModem as e:
            self._cloturer_session(f"⚠️ [{echap(compte.libelle)}] {echap(e)}")
            return
        except Exception as e:
            self.journal.evenement(f"erreur USSD {compte.libelle} : {e}")
            self._cloturer_session(
                f"⚠️ [{echap(compte.libelle)}] Le modem n'a pas répondu.")
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
        mauvais moment."""
        _, options = cls._analyser_menu(menu)
        return not options and bool(RE_DEMANDE_CODE.search(menu))

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
            texte = f"🗿 {gras('Session USSD')}{etiquette}\n{bloc(self.dernier_menu)}"
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
            boutons = boutons + [[("❌ Annuler", "c:annuler")]]
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
        titres = {"montant": "💰 Montant", "destinataire": "📱 Numéro"}
        titre = titres.get(self.attente_saisie, "✍️ Saisie")
        boutons = [[(c, f"s:{c}") for c in ligne] for ligne in PAVE_PIN]
        boutons.append([("*", "s:*"), ("0", "s:0"), ("#", "s:#")])
        boutons.append([("⌫", "s:eff"), ("✅ Valider", "s:ok")])
        boutons.append([("🔐 Masquer", "c:masquer"), ("❌ Annuler", "c:annuler")])
        return (
            f"{titre}{etiquette}\n{bloc(self.dernier_menu)}\n"
            f"Saisi : {mono(self.saisie_tampon or '—')}\n"
            + italique("Composez sur les boutons : rien n'apparaît dans la "
                       "conversation. Vous pouvez aussi répondre par un "
                       "message — il sera effacé aussitôt."), boutons)

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
            self._peindre(f"{gras('Saisie')}{etiquette}\n⏳ Envoi de "
                          f"{mono(valeur)}…", [])
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
        boutons.append([("⌫", "p:eff"), ("0", "p:0"), ("✅ Valider", "p:ok")])
        boutons.append([("❌ Annuler", "c:annuler")])
        return (
            f"🔐 {gras('Code PIN')}{etiquette}\n{bloc(self.dernier_menu)}\n"
            f"Saisi : {mono('•' * len(self.pin_tampon) or '—')}\n"
            + italique("Le code se compose sur les boutons : il n'apparaît "
                       "jamais dans la conversation."), boutons)

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
        destinataire = (f"\nBénéficiaire : {mono(self.destinataire_session)}"
                        if self.destinataire_session else "")
        return (
            f"⚠️ {gras('Confirmation demandée')}\n"
            f"Montant : {gras(self._fcfa(self.montant_session))}{destinataire}\n"
            f"Compte : {gras(compte.libelle)}\n\n"
            + italique("Au-delà du seuil que vous avez fixé, le code secret ne "
                       "s'affiche qu'après cette confirmation."),
            [[("✅ Confirmer", "c:confirmer")], [("❌ Annuler", "c:annuler")]])

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
                f"🔐 {gras('Code PIN')}{etiquette}\n⏳ Validation en cours…", [])
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
                "Il n'y a plus rien à enregistrer : refaites l'opération, "
                "puis appuyez sur 💾 à la fin.", canal=canal)
        self.attente_nom = True
        parcours = " → ".join(self.trace_a_enregistrer)
        self.transport.envoyer(
            f"💾 {gras('Nom du bouton ?')}\n"
            f"Parcours retenu : {mono(parcours)}\n\n"
            "Répondez par un nom court — par exemple " + mono("Solde") + ", "
            + mono("Dépôt") + " ou " + mono("Retrait") + ".\n"
            + italique("Le code secret n'est jamais enregistré : le bouton "
                       "s'arrête juste avant, et vous le taperez comme "
                       "d'habitude."),
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
                "Enregistrement impossible : la carte n'est pas identifiée.",
                canal=canal)
        propre = re.sub(r"[^\w\s-]", "", nom).strip()[:24]
        identifiant = cle_code(propre)
        if not propre or identifiant == "raccourci":
            return self.transport.envoyer(
                "Ce nom ne contient aucune lettre. Réessayez.", canal=canal)
        self.journal.ajouter_raccourci(operateur, identifiant, propre, etapes)
        self.journal.evenement(
            f"raccourci « {propre} » appris pour {operateur} : {','.join(etapes)}")
        self.transport.envoyer(
            f"✅ {gras(echap(propre))} est maintenant un bouton, sur toutes vos "
            f"cartes {gras(echap(operateur))}.\n"
            f"Parcours : {mono(' → '.join(etapes))}",
            canal=canal, boutons=[[("🏠 Menu", "c:menu")]])

    def _lister_raccourcis(self, canal=None):
        operateur = self._operateur_courant()
        appris = self.journal.raccourcis(operateur) if operateur else {}
        lignes = [gras("Vos boutons")]
        if self.raccourcis:
            lignes.append("")
            lignes.append(italique("Depuis le fichier de configuration :"))
            for nom, r in self.raccourcis.items():
                lignes.append(f"· {echap(r['libelle'])} — "
                              f"{mono(' → '.join(r['etapes']))}")
        if appris:
            lignes.append("")
            lignes.append(italique(f"Appris sur le réseau {echap(operateur)} :"))
            for nom, r in appris.items():
                lignes.append(f"· {echap(r['libelle'])} — "
                              f"{mono(' → '.join(r['etapes']))}")
        if not self.raccourcis and not appris:
            lignes.append("")
            lignes.append(
                "Aucun pour l'instant. Faites une opération une fois — le "
                "solde, par exemple — puis appuyez sur 💾 à la fin : elle "
                "deviendra un bouton.")
        propose = [c for c in catalogue(operateur)
                   if cle_code(c[0]) not in appris]
        if propose:
            lignes.append("")
            lignes.append(italique(
                f"Codes connus pour {echap(operateur)}, pas encore installés :"))
            for libelle, code, suite in propose:
                lignes.append(f"· {echap(libelle)} — {mono(code)}, "
                              f"puis {echap(suite)}")
            lignes.append("")
            lignes.append(
                "Chacun ouvre le guichet et s'arrête à la question suivante : "
                "aucun ne déplace d'argent tout seul. Vérifiez-les une fois.")

        boutons = []
        if propose:
            boutons.append([(f"➕ Installer les {len(propose)} boutons "
                             f"{operateur}", "r:cat")])
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
                "Aucun code connu pour cet opérateur. Faites l'opération une "
                "fois, puis appuyez sur 💾 : elle deviendra un bouton.",
                canal=canal, boutons=[[("🏠 Menu", "c:menu")]])
        poses = 0
        for libelle, code, _suite in propose:
            if self.journal.ajouter_raccourci(operateur, cle_code(libelle),
                                              libelle, [code]):
                poses += 1
        self.journal.evenement(
            f"catalogue {operateur} installé : {poses} raccourci(s)")
        self.transport.envoyer(
            f"✅ {gras(poses)} bouton(s) installé(s) pour "
            f"{gras(echap(operateur))}.\n"
            + italique("Essayez-en un : s'il répond « service indisponible », "
                       "le code a changé — refaites l'opération par le menu "
                       "et appuyez sur 💾 pour le corriger."),
            canal=canal, boutons=[[("🏠 Menu", "c:menu")]])

    def _supprimer_raccourci(self, nom, canal):
        operateur = self._operateur_courant()
        if operateur and self.journal.supprimer_raccourci(operateur, nom):
            self.transport.envoyer("🗑 Bouton supprimé.", canal=canal)
        else:
            self.transport.envoyer("Ce bouton n'existe plus.", canal=canal)
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
            boutons.append([("💾 En faire un bouton", "r:enr")])
        boutons.append([("🏠 Menu", "c:menu")])
        self._peindre(corps, boutons)
        canal = self.canal_session
        self._reinitialiser_session()
        self.canal_session = canal
        self.trace_a_enregistrer = trace

    def _annuler(self, canal):
        compte = self.session_compte or self.courant
        compte.ussd_annuler()
        if self.msg_session:
            self.transport.retirer_boutons(self.msg_session, canal=self.canal_session)
        self._reinitialiser_session()
        self.transport.envoyer("Session USSD fermée.",
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
            self.transport.envoyer("Raccourci inconnu.", canal=canal)
            return
        etapes = list(raccourci["etapes"])
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
                f"Un seul compte : {gras(self.courant.libelle)}.", canal=canal,
                boutons=[[("🏠 Menu", "c:menu")]])
        lignes = [gras("Comptes disponibles")]
        for i, c in enumerate(self.comptes, 1):
            marque = "  ← piloté" if c is self.courant else ""
            lignes.append(f"{i}. {echap(c.resume())}{marque}")
        boutons = [[(("● " if c is self.courant else "") + c.libelle, f"a:{i + 1}")
                    for i, c in enumerate(self.comptes[:4])],
                   [("🏠 Menu", "c:menu")]]
        self.transport.envoyer("\n".join(lignes), canal=canal, boutons=boutons)

    def _derniers_sms(self, canal=None):
        lignes = self.journal.derniers_sms(5, self._cartes_en_place())
        if not lignes:
            self.transport.envoyer("Aucun SMS en mémoire pour l'instant.", canal=canal)
            return
        blocs = []
        for date, expediteur, texte, compte in lignes:
            etiquette = f"[{echap(compte)}] " if self.multi and compte else ""
            blocs.append(f"📥 {etiquette}{echap(date.replace('T', ' '))} — "
                         f"{gras(expediteur)}\n{echap(texte)}")
        self.transport.envoyer("\n\n".join(blocs), canal=canal,
                               boutons=[[("🏠 Menu", "c:menu")]])

    def _rapport(self, canal=None, manuel=False):
        nb, total, nb_sms = self.journal.rapport_du_jour(self._cartes_en_place())
        etats = " · ".join(f"{echap(c.libelle)} {c.signal()}/31" for c in self.comptes)
        self.transport.envoyer(
            f"{'📊' if manuel else '🌙'} {gras('Dernières 24 h')}\n"
            f"Encaissements : {gras(nb)}\nTotal : {gras(self._fcfa(total))}\n"
            f"SMS reçus : {nb_sms}\n{etats}",
            canal=canal if manuel else "encaissements",
            boutons=[[("📄 Export CSV", "c:export")]] if manuel else None)

    def _export(self, canal=None):
        contenu = self.journal.export_csv(7, self._cartes_en_place())
        nom = f"totem-{datetime.now():%Y-%m-%d}.csv"
        if not self.transport.envoyer_fichier(
                nom, contenu, legende="📄 Journal des 7 derniers jours.", canal=canal):
            self.transport.envoyer("⚠️ L'export n'a pas pu être envoyé.", canal=canal)

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
                self.transport.envoyer(f"⚠️ Sauvegarde impossible : {echap(e)}",
                                       canal=canal)
            return
        finally:
            shutil.rmtree(dossier, ignore_errors=True)

        legende = (f"💾 {gras('Sauvegarde du journal')} — {len(contenu) // 1024} Ko\n"
                   + italique("Conservez ce fichier : c'est la seule copie hors "
                              "du Pi. Pour restaurer, remplacez journal.db par "
                              "celui-ci, robot arrêté."))
        if not self.transport.envoyer_fichier(
                os.path.basename(chemin), contenu, legende=legende, canal=canal,
                type_mime="application/x-sqlite3"):
            self.journal.evenement("sauvegarde non transmise")
            if not automatique:
                self.transport.envoyer("⚠️ La sauvegarde n'a pas pu être envoyée.",
                                       canal=canal)

    def _diagnostic(self, canal=None):
        """Tout ce qu'on voudrait savoir avant d'appeler quelqu'un à Douala."""
        lignes = [f"🩺 {gras('Diagnostic')}",
                  f"Version : {mono(version())}",
                  f"Robot en marche depuis {self._duree(time.time() - self.demarre_a)}"]
        for compte in self.comptes:
            occupes, capacite = compte.memoire_sms()
            lignes.append(
                f"\n{gras(compte.libelle)}\n"
                f"Carte : {mono(self._sim_lisible(compte.iccid()))}\n"
                f"Mémoire SMS : {occupes}/{capacite if capacite else '?'}\n"
                f"Signal : {compte.signal()}/31")
        en_attente = self.facteur.en_attente()
        lignes.append(f"\nCourrier en attente : {en_attente}"
                      if en_attente else "\nCourrier : tout est parti")
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
                "Aucun menu reçu depuis le démarrage. Composez un code USSD, "
                "puis relancez /brut.", canal=canal)
            return
        entete, options = self._analyser_menu(self.dernier_brut)
        pave = "OUI ⚠️" if self._demande_un_code(self.dernier_brut) else "non"
        self.transport.envoyer(
            f"🔬 {gras('Dernier menu reçu, tel quel')}\n"
            f"{bloc(repr(self.dernier_brut))}\n"
            f"Lignes d'en-tête : {len(entete)}\n"
            f"Options reconnues : {gras(len(options))}\n"
            f"Pavé du code déclenché : {gras(pave)}\n"
            f"Version : {mono(version())}",
            canal=canal, boutons=[[("🏠 Menu", "c:menu")]])

    @staticmethod
    def _sim_lisible(iccid):
        return ("…" + iccid[-6:]) if iccid else "identifiant indisponible"

    @staticmethod
    def _duree(secondes):
        secondes = int(secondes)
        jours, reste = divmod(secondes, 86400)
        heures, reste = divmod(reste, 3600)
        minutes = reste // 60
        if jours:
            return f"{jours} j {heures} h"
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
        prochaine_sante = 0
        prochaine_memoire = 0
        prochaines_cartes = 0
        while self.actif:
            # Avant de relever les SMS : si la puce a été échangée, les
            # messages qui suivent appartiennent à la nouvelle carte.
            if time.time() >= prochaines_cartes:
                prochaines_cartes = time.time() + VERIF_CARTES_SECONDES
                self._recenser_cartes()
            for compte in self.comptes:
                # Filet ultime : rien de ce qui touche une carte ne doit
                # pouvoir arrêter la relève des autres, ni le fil lui-même.
                try:
                    self._relever_sms(compte)
                except Exception as e:
                    self._noter(f"relève SMS {compte.libelle} : {e}")
            self._expirer_session()
            # La santé du Pi change lentement : inutile de la lire à chaque tour.
            if time.time() >= prochaine_sante:
                prochaine_sante = time.time() + 120
                self._veiller_sante()
            if time.time() >= prochaine_memoire:
                prochaine_memoire = time.time() + VERIF_MEMOIRE_SECONDES
                self._verifier_memoire()
            self._distribuer_recus()
            self._signaler_conflit()
            if self._rapport_quotidien():
                sauvegarder_journal(self.chemin_base)
            try:
                self.facteur.distribuer()   # rattrape ce qu'une coupure a retenu
            except Exception as e:
                self.journal.evenement(f"erreur distribution courrier : {e}")
            time.sleep(self.pause_sms)

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
            try:
                ancienne = compte.relire_carte()
            except Exception as e:
                self.journal.evenement(f"lecture carte {compte.libelle} : {e}")
                continue
            if not compte.carte.identifiee:
                continue
            etat = self.journal.voir_carte(compte.carte, compte.imei)
            if silencieux:
                continue
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
        titre = "💳 Carte SIM déjà connue remise en place" if connue \
            else "💳 Nouvelle carte SIM détectée"
        self.journal.evenement(
            f"changement de carte : {ancienne.libelle} → {compte.carte.libelle}")
        if self.nuage:
            self.nuage.reveiller()
        lignes = [
            gras(titre),
            f"Retirée : {echap(ancienne.libelle)}",
            f"En place : {gras(echap(compte.carte.description))}",
        ]
        if compte.carte.numero:
            lignes.append(f"Numéro : {echap(compte.carte.numero)}")
        lignes.append("")
        lignes.append(
            "Son historique et son solde lui sont propres : les encaissements "
            "de la carte précédente ne s'y ajoutent pas." if not connue else
            "Son journal ressort intact — rien n'a été perdu pendant son absence.")
        self.transport.envoyer("\n".join(lignes), canal="alertes",
                               boutons=[[("💳 Cartes", "c:sims"),
                                         ("🏠 Menu", "c:menu")]])

    # ---- réglages : l'identité des puces -----------------------------------
    # Une SIM prépayée ne déclare presque jamais son numéro, et personne ne
    # connaît le nom commercial du compte à part son propriétaire. Plutôt que
    # de le faire éditer un fichier sur le Pi, on le lui demande ici.

    def _reglages(self, canal=None):
        """Ce que TOTEM sait de chaque puce, et ce qu'il attend de vous."""
        lignes = [f"⚙️ {gras('Réglages')}", "",
                  "Le numéro et le nom de chaque puce. Ils ne se lisent pas "
                  "sur la carte : c'est vous qui les connaissez.", ""]
        boutons = []
        for compte in self.comptes:
            iccid = compte.carte.iccid
            if not iccid:
                lignes.append(f"▫️ {gras(echap(compte.libelle))}\n"
                              "    carte illisible — rien à régler ici")
                continue
            numero, nom = self.journal.identite(iccid)
            lignes.append(
                f"▶️ {gras(echap(compte.libelle))}\n"
                f"    📱 {echap(numero_lisible(numero)) if numero else italique('numéro à renseigner')}\n"
                f"    🏷 {echap(nom) if nom else italique('nom à renseigner')}")
            court = compte.libelle[:10]
            boutons.append([(f"📱 Numéro · {court}", f"i:num:{iccid}"),
                            (f"🏷 Nom · {court}", f"i:nom:{iccid}")])

        lignes += ["", italique(
            "Le numéro sert à dire de quel côté d'un transfert vous êtes : "
            "sans lui, le reçu écrit « Montant net » au lieu de « Montant "
            "reçu » ou « Montant envoyé ». Le nom paraît sur le reçu de solde.")]
        boutons.append([("🏠 Menu", "c:menu")])
        self.transport.envoyer("\n".join(lignes), canal=canal, boutons=boutons)

    def _demander_identite(self, champ, iccid, canal=None):
        """Ouvre la saisie. La réponse suivante sera lue comme la valeur."""
        compte = self._compte_par_iccid(iccid)
        if compte is None or compte.carte.iccid != iccid:
            return self.transport.envoyer(
                "Cette carte n'est plus en place.", canal=canal,
                boutons=[[("⚙️ Réglages", "c:reglages")]])
        self.attente_identite = (champ, iccid)
        self.canal_identite = canal
        if champ == "num":
            question = (f"📱 Envoyez le numéro de la puce "
                        f"{gras(echap(compte.libelle))}.\n"
                        + italique("Neuf chiffres, par exemple 696103864."))
        else:
            question = (f"🏷 Envoyez le nom du compte "
                        f"{gras(echap(compte.libelle))}.\n"
                        + italique("Celui qui paraîtra sur les reçus, par "
                                   "exemple WONDER PHONE."))
        self.transport.envoyer(question, canal=canal,
                               boutons=[[("❌ Annuler", "c:reglages")]])

    def _enregistrer_identite(self, texte, canal=None):
        """Lit la réponse attendue, la contrôle, puis l'inscrit."""
        champ, iccid = self.attente_identite
        self.attente_identite = None

        if champ == "num":
            chiffres = re.sub(r"\D", "", texte)
            if not 8 <= len(chiffres) <= 15:
                return self.transport.envoyer(
                    "Ce n'est pas un numéro de téléphone. Rien n'a été "
                    "enregistré.", canal=canal,
                    boutons=[[("⚙️ Réglages", "c:reglages")]])
            valeur, quoi = chiffres, f"Numéro : {gras(numero_lisible(chiffres))}"
            enregistre = self.journal.definir_identite(iccid, numero=valeur)
        else:
            valeur = re.sub(r"\s+", " ", texte).strip()[:40]
            if len(valeur) < 2:
                return self.transport.envoyer(
                    "Ce nom est trop court. Rien n'a été enregistré.",
                    canal=canal, boutons=[[("⚙️ Réglages", "c:reglages")]])
            quoi = f"Nom : {gras(echap(valeur))}"
            enregistre = self.journal.definir_identite(iccid, nom=valeur)

        if not enregistre:
            return self.transport.envoyer(
                "Cette carte n'est pas au registre du terminal.", canal=canal,
                boutons=[[("⚙️ Réglages", "c:reglages")]])
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
                "Aucune carte identifiée pour l'instant. Le modem n'a pas encore "
                "réussi à lire l'ICCID de la puce insérée.", canal=canal,
                boutons=[[("🏠 Menu", "c:menu")]])
        en_place = {c.carte.iccid for c in self.comptes if c.carte.identifiee}
        lignes = [gras("Cartes SIM connues")]
        for iccid, libelle, _operateur, numero, premiere, derniere, nb, total in cartes:
            marque = "▶️ " if iccid in en_place else "▫️ "
            detail = f" · {numero}" if numero else ""
            lignes.append(
                f"{marque}{gras(echap(libelle))}{echap(detail)}\n"
                f"    {nb} SMS · {self._fcfa(total)} encaissés\n"
                f"    vue du {echap(premiere[:10])} au {echap(derniere[:10])}")
        lignes.append("")
        lignes.append("▶️ en place · ▫️ retirée. Chaque carte garde son propre "
                      "journal : la remettre le fait ressortir intact.")
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
                # Un code à usage unique ne doit survivre nulle part : ni au
                # journal, ni dans la sauvegarde hors du Pi, ni sur Telegram.
                # On le masque ici, une fois, et tout ce qui suit ne voit plus
                # que la version sûre.
                texte = masquer_secrets(texte)
                if not self.journal.sms_existe(expediteur, texte, compte.libelle):
                    # emis_le : l'heure RÉSEAU du SMS (TP-SCTS). C'est l'heure
                    # vraie de l'opération, distincte de l'heure de relève —
                    # elles divergent après une coupure, et c'est la réseau qui
                    # fait foi pour l'ordre et les reçus.
                    sms_id = self.journal.sms(
                        expediteur, texte, compte.libelle, compte.carte.iccid,
                        emis_le=emis_le.isoformat() if emis_le else None)
                    self._notifier_sms(compte, expediteur, texte)
                    # Le reçu ne part pas maintenant : l'alerte doit arriver la
                    # première, et un PDF ne doit jamais retarder l'annonce
                    # d'un encaissement. Il est seulement inscrit ; la boucle
                    # de surveillance le fabriquera dans la foulée.
                    self._programmer_recu(sms_id, texte)
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
    # l'annonce d'un encaissement. Le SMS est donc seulement inscrit, et la
    # boucle de surveillance s'en occupe une dizaine de secondes plus tard.

    def _programmer_recu(self, source_id, texte, source="sms"):
        """Inscrit ce message pour un reçu, s'il en mérite un.

        `source` : « sms » pour un encaissement, « ussd » pour un solde lu au
        menu. Les deux n'ont pas les mêmes garde-fous — une réponse USSD peut
        être un menu ou une question, un SMS non.
        """
        if not self.recus or not source_id:
            return None
        try:
            motif = (motif_du_menu(texte) if source == "ussd"
                     else motif_du_sms(texte, numeros=self._nos_numeros()))
            if motif is None:
                return None
            numero = numero_de_recu(datetime.now(), source_id, source)
            self.journal.programmer_recu(source_id, motif.genre, numero,
                                         motif.reference, source=source)
            return numero
        except Exception as e:
            # Un reçu manqué est un désagrément ; une relève de SMS
            # interrompue est une perte d'argent. On note, et on continue.
            self.journal.evenement(f"reçu non programmé : {e}")
            return None

    def _recu_apres_coup(self, source_id):
        """Établit (ou ré-établit) le reçu d'un SMS passé, à la demande de
        la plateforme. Le numéro ne dépend que de la ligne du journal : un
        reçu redemandé reprend exactement le même."""
        texte = self.journal.texte_sms(source_id)
        if not texte:
            return None
        return self._programmer_recu(source_id, texte)

    def _distribuer_recus(self):
        """Fabrique, envoie, puis archive les reçus mûrs."""
        if not self.recus:
            return
        for ligne in self.journal.recus_a_envoyer(DELAI_RECU):
            identifiant = ligne[0]
            try:
                nom, pdf, legende = self._fabriquer_recu(ligne)
            except Exception as e:
                self.journal.evenement(f"reçu {ligne[2]} illisible : {e}")
                self.journal.recu_echoue(identifiant)
                continue
            if pdf is None:
                self.journal.recu_echoue(identifiant, essais_max=1)
                continue
            if self.transport.envoyer_fichier(nom, pdf, legende,
                                              canal="encaissements",
                                              type_mime="application/pdf"):
                self.journal.recu_envoye(identifiant)
            else:
                # Réseau absent : on repassera. Le document n'est pas perdu,
                # il n'a simplement pas encore été fabriqué pour de bon.
                self.journal.recu_echoue(identifiant)
                break

        if not (self.nuage and self.nuage.actif):
            return
        for ligne in self.journal.recus_a_archiver():
            try:
                nom, pdf, _ = self._fabriquer_recu(ligne)
            except Exception:
                self.journal.recu_archive(ligne[0])   # inutile d'insister
                continue
            if pdf is None or self.nuage.archiver_recu(
                    nom, pdf, self._fiche_recu(ligne)):
                self.journal.recu_archive(ligne[0])
            else:
                break

    def _fabriquer_recu(self, ligne):
        """(nom de fichier, PDF, légende) — ou (nom, None, «») si le SMS n'est
        plus compris. Le document se refait à l'identique depuis le message :
        rien n'est conservé sur la carte SD."""
        _, genre, numero, date, texte, compte, iccid = ligne
        quand = datetime.fromisoformat(date)
        motif = self._motif(texte)
        nom = f"{numero}.pdf"
        if motif is None or motif.genre != genre:
            return nom, None, ""

        operateur = self._operateur_de(compte, iccid)
        if genre == TRANSFERT:
            pdf = recu_transfert(motif.paiement, numero, quand, operateur)
            legende = (f"🧾 {gras('Reçu de transfert')} — "
                       f"{gras(self._fcfa(motif.paiement.montant))}\n"
                       f"{italique('N° ' + numero)}")
        else:
            propre = self._compte_par_iccid(iccid)
            # `nom` porte déjà le nom du FICHIER : celui du compte a son
            # propre nom de variable, sans quoi le reçu partirait sans titre.
            _, nom_compte = self.journal.identite(iccid)
            pdf = recu_solde(motif.solde, nom_compte or compte or operateur,
                             self._numero_du_compte(propre) if propre else "",
                             numero, quand, operateur)
            legende = (f"🧾 {gras('Reçu de solde')} — "
                       f"{gras(self._fcfa(motif.solde))}\n"
                       f"{italique('N° ' + numero)}")
        return nom, pdf, legende

    def _fiche_recu(self, ligne):
        """Ce qu'on inscrit dans le cloud à côté du fichier."""
        _, genre, numero, date, texte, _, _ = ligne
        motif = self._motif(texte)
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
            f"⚠️ {gras('Mémoire SMS presque pleine')}\n"
            + echap("\n".join(satures)) + "\n"
            + italique("Au-delà, le réseau ne peut plus déposer de nouveaux SMS : "
                       "des encaissements passeraient inaperçus."), canal="alertes")

    def _signaler_conflit(self):
        """Deux robots sur le même jeton se coupent mutuellement : les
        commandes se perdent au hasard, sans le moindre message d'erreur."""
        conflit = getattr(self.transport, "conflit", False)
        if conflit == self.conflit_signale:
            return
        self.conflit_signale = conflit
        if conflit:
            self.journal.evenement("conflit : jeton Telegram utilisé ailleurs")
            self.facteur.poster(
                f"⚠️ {gras('Telegram refuse de me répondre')}\n"
                "Un second programme utilise la même clé de bot, "
                "et nos commandes se perdent entre les deux.\n\n"
                "Sur le Pi, pour vérifier :\n"
                f"{mono('ps aux | grep totem')}\n"
                f"{mono('sudo systemctl restart totem')}\n\n"
                + italique("Si un seul robot tourne, l'alerte disparaîtra "
                           "d'elle-même au prochain tour."), canal="alertes")

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

    def _notifier_sms(self, compte, expediteur, texte):
        """Tous les SMS arrivent de la même façon : aucun n'est mis en
        sourdine. Un message d'opérateur peut annoncer une suspension de
        compte ou une opération non voulue — rien ne doit passer inaperçu.
        Seul l'AFFICHAGE distingue les cas, pour se lire d'un coup d'œil.

        L'envoi passe par le facteur : un encaissement survenu pendant une
        coupure Internet doit repartir tout seul au retour du réseau."""
        etiquette = f" [{echap(compte.libelle)}]" if self.multi else ""
        paiement = analyser(texte, numeros=self._nos_numeros())

        if paiement and paiement.sens == "entree":
            entete = (f"💰 {gras('Encaissement')}{etiquette} — "
                      f"{gras(self._fcfa(paiement.montant))}\n"
                      f"de {gras(paiement.tiers)}")
        elif paiement and paiement.sens == "sortie":
            entete = (f"↗️ {gras('Envoi')}{etiquette} — "
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
            entete = (f"🔁 {gras('Transfert')}{etiquette} — "
                      f"{gras(self._fcfa(paiement.montant))}\n{corps}")
        else:
            entete = f"📥 {gras('SMS')}{etiquette} de {gras(expediteur)}"

        self.facteur.poster(f"{entete}\n{echap(texte)}", canal="encaissements")

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
        ou = {"encaissements": "les encaissements",
              "alertes": "les alertes"}.get(canal, "les notifications")
        self.journal.evenement(f"courrier abandonné (canal {canal or 'privé'})")
        try:
            self.transport.envoyer(
                f"⚠️ {gras('Une notification n’a pas pu être publiée')}\n"
                f"Je n’arrive plus à écrire dans le fil réservé à {ou}. "
                "Il a peut-être été fermé ou supprimé, ou je n’en suis plus "
                "membre.\n\n"
                + italique(
                    "Vérifie ce fil dans le groupe Telegram. Le message a été "
                    "mis de côté pour ne pas bloquer les suivants — l’USSD et "
                    "les autres envois ne sont pas touchés."))
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
                f"⚠️ {gras('Des SMS n’arrivent pas sur la plateforme')}\n"
                "La base de données les refuse. Ils restent ici sur Telegram "
                "et sur le terminal — rien n’est perdu — mais ils n’apparaissent "
                "pas sur le site tant que ce n’est pas corrigé.\n\n"
                f"Raison technique : {mono(echap(str(erreur))[:300])}\n\n"
                + italique("Transmets-moi cette raison : elle dit exactement "
                           "quoi corriger côté base."))
        except Exception:
            pass

    def _expirer_session(self):
        with self.verrou:
            compte = self.session_compte
            if compte is None:
                return
            if time.time() - self.dernier_echange < self.delai_session:
                return
            compte.ussd_annuler()
            self.journal.evenement(f"session USSD expirée ({compte.libelle})")
            self._cloturer_session(
                "⌛ Session USSD expirée (sans réponse trop longtemps). "
                "L'opérateur l'aurait fermée de son côté.")

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
                f"⚠️ {etiquette}Le modem ne répond plus, je le redémarre…"
                if automatique
                else f"{etiquette}Redémarrage du modem (≈30 s)…", canal=canal)

        try:
            compte.redemarrer()
        except Exception as e:
            self.journal.evenement(f"redémarrage {compte.libelle} : {e}")
            if not compte.panne_signalee:
                compte.panne_signalee = True
                self.transport.envoyer(
                    f"❌ {etiquette}{gras('Le modem ne répond plus')}\n"
                    f"{echap(e)}\n\n"
                    + italique(
                        "Je continue d'essayer, de plus en plus espacé, et je "
                        "préviens dès qu'il revient. Sur place : vérifier le "
                        "câble USB entre le HAT et le Pi, puis l'alimentation "
                        "— le modem réclame 3 A en pointe, et décroche du bus "
                        "quand le bloc est trop juste."), canal=canal)
            return

        if not self._annoncer_retour(compte, canal):
            self.transport.envoyer(
                f"✅ {etiquette}Modem revenu en ligne. "
                f"Signal : {compte.signal()}/31", canal=canal)

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
            f"✅ {etiquette}{gras('Le modem répond de nouveau')}\n"
            f"Signal : {compte.signal()}/31", canal=canal)
        return True
