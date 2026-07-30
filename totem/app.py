# -*- coding: utf-8 -*-
"""Orchestrateur du robot MoMo.

Fils d'exécution :
  - boucle principale : messages et clics du propriétaire (commandes + USSD)
  - surveillance : SMS entrants, santé du modem, rapport quotidien, expiration
    de la session USSD

L'expérience Telegram repose sur trois idées :
  1. **Boutons** — les menus MoMo deviennent des boutons cliquables ; plus
     besoin de deviner « 5 » puis « 1 ». Les clics passent même quand le mode
     confidentialité du robot est actif dans un groupe.
  2. **Une seule carte vivante** — la session USSD se met à jour en place,
     comme l'écran d'un téléphone, au lieu d'empiler les messages.
  3. **Le PIN ne touche jamais la conversation** — il se compose sur un pavé
     numérique en boutons ; seul le nombre d'étoiles est affiché.
"""

import re
import threading
import time
from datetime import datetime

from .mise_en_forme import bloc, echap, gras, mono
from .modem import USSD_OUVERTE, ErreurModem
from .storage import montant_recu

RE_CODE_USSD = re.compile(r"^[\*#][\d\*#]+#$")
RE_DEMANDE_PIN = re.compile(r"\bPIN\b|code secret", re.I)
RE_OPTION = re.compile(r"^\s*(\d{1,2})\s*[.):\-]\s*(\S.*?)\s*$")

ADMIN = "admin"
PAVE_PIN = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]]

COMMANDES_BOT = [
    ("menu", "Écran d'accueil avec les boutons"),
    ("statut", "État du robot (signal, opérateur, SIM)"),
    ("sms", "Les derniers SMS reçus"),
    ("rapport", "Bilan des dernières 24 h"),
    ("export", "Journal des 7 derniers jours en CSV"),
    ("annuler", "Fermer la session USSD en cours"),
    ("redemarrer_modem", "Relancer le modem"),
    ("aide", "Aide"),
]

AIDE = (
    "🗿 <b>TOTEM</b>\n\n"
    "Le plus simple : /menu, puis tout se fait au doigt.\n\n"
    "<b>Codes USSD</b>\n"
    "Envoyez <code>*126#</code> (ou tout autre code) : le menu MoMo s'ouvre "
    "sous forme de boutons. Les questions libres (numéro, montant) se "
    "répondent par un message normal. Le code PIN se tape sur le pavé "
    "sécurisé : il n'apparaît jamais dans la conversation.\n\n"
    "<b>Commandes</b>\n"
    "/menu — écran d'accueil\n"
    "/statut — signal, opérateur, SIM\n"
    "/sms — les derniers SMS reçus\n"
    "/rapport — bilan des dernières 24 h\n"
    "/export — journal CSV des 7 derniers jours\n"
    "/annuler — ferme la session USSD\n"
    "/redemarrer_modem — relance le modem\n"
    "/aide — ce message"
)


class Robot:
    def __init__(self, modem, transport, journal, nom="TOTEM",
                 heure_rapport="21:00", pause_sms=10, raccourcis=None,
                 delai_session=180):
        self.modem = modem
        self.transport = transport
        self.journal = journal
        self.nom = nom
        self.heure_rapport = heure_rapport
        self.pause_sms = pause_sms
        self.raccourcis = raccourcis or {}
        self.delai_session = delai_session
        self.actif = True
        self.verrou = threading.RLock()
        self._reinitialiser_session()

    def _reinitialiser_session(self):
        self.session_ussd = False
        self.dernier_menu = ""
        self.msg_session = None
        self.canal_session = None
        self.pin_actif = False
        self.pin_tampon = ""
        self.file_macro = []
        self.dernier_echange = time.time()

    # ---- démarrage --------------------------------------------------------
    def demarrer(self, bloquant=True):
        self.transport.vider_backlog()      # ne jamais rejouer d'ancienne commande
        self.transport.publier_commandes(COMMANDES_BOT)
        etat_sim = "SIM détectée" if self.modem.sim_presente() else "⚠️ AUCUNE SIM détectée"
        self.transport.envoyer(
            f"✅ {gras(self.nom)} en ligne — {echap(etat_sim)}\n"
            f"Opérateur : {echap(self.modem.operateur())} · "
            f"Signal : {self.modem.signal()}/31",
            boutons=self._boutons_accueil(ADMIN))
        self.journal.evenement("démarrage")
        threading.Thread(target=self._boucle_surveillance, daemon=True).start()
        if bloquant:
            self._boucle_messages()

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

            commande = self._commande(texte)
            if commande in ("start", "menu"):
                self._accueil(canal, role)
            elif commande in ("aide", "help"):
                self.transport.envoyer(AIDE, canal=canal,
                                       boutons=[[("🏠 Menu", "c:menu")]])
            elif commande == "statut":
                self._statut(canal)
            elif commande == "sms":
                self._derniers_sms(canal)
            elif commande == "rapport":
                self._rapport(canal=canal, manuel=True)
            elif commande == "export":
                self._export(canal)
            elif commande in ("annuler", "redemarrer_modem") or RE_CODE_USSD.match(texte) \
                    or self.session_ussd:
                if not self._verifier_admin(role, entrant, canal):
                    return
                self._action_admin(commande, texte, entrant, canal)
            else:
                self.transport.envoyer(
                    "Je n'ai pas compris. Ouvrez /menu ou envoyez un code USSD "
                    f"tel que {mono('*126#')}.", canal=canal)

    def _action_admin(self, commande, texte, entrant, canal):
        if commande == "annuler":
            self._annuler(canal)
        elif commande == "redemarrer_modem":
            self._redemarrer_modem(canal)
        elif RE_CODE_USSD.match(texte):
            self.canal_session = canal
            self.msg_session = None
            self._ussd(texte, nouveau=True)
        else:
            # Réponse libre dans le menu en cours (numéro, montant… ou PIN tapé
            # à la main par habitude : dans ce cas on efface le message).
            if self.pin_actif or RE_DEMANDE_PIN.search(self.dernier_menu):
                self.transport.supprimer(entrant.message_id, canal=canal)
                self.journal.ussd("envoyé", "****")
            else:
                self.journal.ussd("envoyé", texte)
            self._ussd(texte, nouveau=False)
            self._avancer_macro()

    def _clic(self, donnee, entrant, role, canal):
        genre, _, valeur = donnee.partition(":")
        if genre == "c" and valeur in ("menu", "statut", "sms", "rapport", "export", "aide"):
            {"menu": lambda: self._accueil(canal, role),
             "aide": lambda: self.transport.envoyer(AIDE, canal=canal),
             "statut": lambda: self._statut(canal),
             "sms": lambda: self._derniers_sms(canal),
             "rapport": lambda: self._rapport(canal=canal, manuel=True),
             "export": lambda: self._export(canal)}[valeur]()
            return

        if not self._verifier_admin(role, entrant, canal):
            return

        if genre == "c" and valeur == "ussd":
            self.transport.envoyer(
                f"⌨️ Envoyez le code à composer, par exemple {mono('*126#')}.",
                canal=canal)
        elif genre == "c" and valeur == "annuler":
            self._annuler(canal)
        elif genre == "m":
            self._lancer_raccourci(valeur, canal)
        elif genre == "u":
            self.journal.ussd("envoyé", valeur)
            self._ussd(valeur, nouveau=False)
            self._avancer_macro()
        elif genre == "p":
            self._pave(valeur)

    def _verifier_admin(self, role, entrant, canal):
        if role == ADMIN:
            return True
        self.journal.evenement(
            f"refus : {entrant.nom or entrant.utilisateur} a tenté « {entrant.texte} »")
        self.transport.envoyer(
            "🔒 Vous suivez l'activité de la SIM, mais son pilotage est réservé "
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
        if role == ADMIN and self.raccourcis:
            noms = list(self.raccourcis)
            for i in range(0, len(noms), 2):
                lignes.append([(self.raccourcis[n]["libelle"], f"m:{n}")
                               for n in noms[i:i + 2]])
        lignes.append([("📥 SMS reçus", "c:sms"), ("📊 Rapport 24 h", "c:rapport")])
        lignes.append([("📡 Statut", "c:statut"), ("📄 Export CSV", "c:export")])
        if role == ADMIN:
            lignes.append([("⌨️ Code USSD", "c:ussd"), ("❓ Aide", "c:aide")])
        else:
            lignes.append([("❓ Aide", "c:aide")])
        return lignes

    def _accueil(self, canal, role):
        nb, total, _ = self.journal.rapport_du_jour()
        self.transport.envoyer(
            f"🗿 {gras(self.nom)}\n"
            f"Signal {self.modem.signal()}/31 · {echap(self.modem.operateur())}\n"
            f"Dernières 24 h : {gras(f'{nb} encaissement(s)')} — "
            f"{gras(self._fcfa(total))}\n\nQue faire ?",
            boutons=self._boutons_accueil(role), canal=canal)

    # ---- session USSD ------------------------------------------------------
    def _ussd(self, texte, nouveau=False):
        try:
            if nouveau:
                self.journal.ussd("envoyé", texte)
                etat, reponse = self.modem.ussd_demarrer(texte)
            else:
                etat, reponse = self.modem.ussd_repondre(texte)
        except ErreurModem as e:
            self._cloturer_session(f"⚠️ {echap(e)}")
            return
        self.journal.ussd("reçu", reponse)
        self.dernier_menu = reponse
        self.session_ussd = etat == USSD_OUVERTE
        self.pin_actif = bool(self.session_ussd and RE_DEMANDE_PIN.search(reponse))
        self.pin_tampon = ""
        self.dernier_echange = time.time()
        if self.session_ussd:
            self._afficher_session()
        else:
            self._cloturer_session(bloc(reponse))

    def _afficher_session(self):
        """Réécrit la carte de session en place : une seule carte, vivante."""
        if self.pin_actif:
            texte, boutons = self._carte_pin()
        else:
            options = self._options(self.dernier_menu)
            texte = f"🗿 {gras('Session USSD')}\n{bloc(self.dernier_menu)}"
            if options:
                boutons = [[(f"{num}. {lib[:28]}", f"u:{num}")
                            for num, lib in options[i:i + 2]]
                           for i in range(0, len(options), 2)]
            else:
                texte += "\n✍️ Répondez par un message (numéro, montant…)."
                boutons = []
            boutons = boutons + [[("❌ Annuler", "c:annuler")]]
        self._peindre(texte, boutons)

    def _carte_pin(self):
        boutons = [[(c, f"p:{c}") for c in ligne] for ligne in PAVE_PIN]
        boutons.append([("⌫", "p:eff"), ("0", "p:0"), ("✅ Valider", "p:ok")])
        boutons.append([("❌ Annuler", "c:annuler")])
        return (
            f"🔐 {gras('Code PIN')}\n{bloc(self.dernier_menu)}\n"
            f"Saisi : {mono('•' * len(self.pin_tampon) or '—')}\n"
            "<i>Le code se compose sur les boutons : il n'apparaît jamais "
            "dans la conversation.</i>", boutons)

    def _pave(self, touche):
        if not self.pin_actif:
            return
        self.dernier_echange = time.time()
        if touche == "eff":
            self.pin_tampon = self.pin_tampon[:-1]
        elif touche == "ok":
            if not self.pin_tampon:
                return
            code, self.pin_tampon = self.pin_tampon, ""
            self.pin_actif = False
            self.journal.ussd("envoyé", "****")
            self._peindre(f"🔐 {gras('Code PIN')}\n⏳ Validation en cours…", [])
            self._ussd(code, nouveau=False)
            self._avancer_macro()
            return
        elif touche.isdigit() and len(self.pin_tampon) < 8:
            self.pin_tampon += touche
        else:
            return
        texte, boutons = self._carte_pin()
        self._peindre(texte, boutons)

    def _peindre(self, texte, boutons):
        """Met à jour la carte de session, ou en crée une si besoin."""
        if self.msg_session and self.transport.modifier(
                self.msg_session, texte, boutons, canal=self.canal_session):
            return
        self.msg_session = self.transport.envoyer(
            texte, boutons=boutons, canal=self.canal_session)

    def _cloturer_session(self, corps):
        self._peindre(corps, [[("🏠 Menu", "c:menu")]])
        canal = self.canal_session
        self._reinitialiser_session()
        self.canal_session = canal

    def _annuler(self, canal):
        self.modem.ussd_annuler()
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
        raccourci = self.raccourcis.get(nom)
        if not raccourci:
            self.transport.envoyer("Raccourci inconnu.", canal=canal)
            return
        etapes = list(raccourci["etapes"])
        self.canal_session = canal
        self.msg_session = None
        self.file_macro = etapes[1:]
        self._ussd(etapes[0], nouveau=True)
        self._avancer_macro()

    def _avancer_macro(self):
        """Déroule les étapes restantes d'un raccourci ; s'arrête d'elle-même
        dès qu'un PIN est demandé ou que la session se referme."""
        while self.file_macro and self.session_ussd and not self.pin_actif:
            etape = self.file_macro.pop(0)
            time.sleep(0.4)          # laisse respirer le réseau USSD
            self.journal.ussd("envoyé", etape)
            self._ussd(etape, nouveau=False)
        if not self.session_ussd:
            self.file_macro = []

    # ---- informations ------------------------------------------------------
    def _statut(self, canal=None):
        sim = "présente" if self.modem.sim_presente() else "⚠️ ABSENTE"
        self.transport.envoyer(
            f"📡 {gras(self.nom)}\nSIM : {echap(sim)}\n"
            f"Opérateur : {echap(self.modem.operateur())}\n"
            f"Signal : {gras(f'{self.modem.signal()}/31')}\n"
            f"Session USSD : {'ouverte' if self.session_ussd else 'aucune'}",
            canal=canal)

    def _derniers_sms(self, canal=None):
        lignes = self.journal.derniers_sms(5)
        if not lignes:
            self.transport.envoyer("Aucun SMS en mémoire pour l'instant.", canal=canal)
            return
        corps = "\n\n".join(
            f"📥 {echap(d.replace('T', ' '))} — {gras(e)}\n{echap(t)}"
            for d, e, t in lignes)
        self.transport.envoyer(corps, canal=canal,
                               boutons=[[("🏠 Menu", "c:menu")]])

    def _rapport(self, canal=None, manuel=False):
        nb, total, nb_sms = self.journal.rapport_du_jour()
        self.transport.envoyer(
            f"{'📊' if manuel else '🌙'} {gras('Dernières 24 h')}\n"
            f"Encaissements : {gras(nb)}\nTotal : {gras(self._fcfa(total))}\n"
            f"SMS reçus : {nb_sms}\nSignal : {self.modem.signal()}/31",
            canal=canal if manuel else "encaissements",
            boutons=[[("📄 Export CSV", "c:export")]] if manuel else None)

    def _export(self, canal=None):
        contenu = self.journal.export_csv(7)
        nom = f"totem-{datetime.now():%Y-%m-%d}.csv"
        if not self.transport.envoyer_fichier(
                nom, contenu, legende="📄 Journal des 7 derniers jours.", canal=canal):
            self.transport.envoyer("⚠️ L'export n'a pas pu être envoyé.", canal=canal)

    @staticmethod
    def _fcfa(montant):
        return f"{montant:,}".replace(",", " ") + " FCFA"

    # ---- surveillance (SMS entrants, santé, rapport quotidien) -------------
    def _boucle_surveillance(self):
        dernier_rapport = None
        echecs_modem = 0
        while self.actif:
            try:
                for expediteur, texte in self.modem.lire_nouveaux_sms():
                    self.journal.sms(expediteur, texte)
                    self._notifier_sms(expediteur, texte)
                echecs_modem = 0
            except Exception as e:
                echecs_modem += 1
                self.journal.evenement(f"erreur lecture SMS : {e}")
                if echecs_modem == 3:  # chien de garde : 3 échecs → reset modem
                    self._redemarrer_modem(canal="alertes", automatique=True)
                    echecs_modem = 0
            self._expirer_session()
            maintenant = datetime.now()
            if maintenant.strftime("%H:%M") == self.heure_rapport \
                    and dernier_rapport != maintenant.date():
                dernier_rapport = maintenant.date()
                self._rapport()
            time.sleep(self.pause_sms)

    def _notifier_sms(self, expediteur, texte):
        """Un encaissement sonne ; le reste arrive en notification discrète."""
        montant = montant_recu(texte)
        if montant is not None:
            entete = f"💰 {gras('Encaissement')} — {gras(self._fcfa(montant))}"
        else:
            entete = f"📥 {gras('SMS')} de {gras(expediteur)}"
        self.transport.envoyer(f"{entete}\n{echap(texte)}", canal="encaissements",
                               silencieux=montant is None)

    def _expirer_session(self):
        with self.verrou:
            if not self.session_ussd:
                return
            if time.time() - self.dernier_echange < self.delai_session:
                return
            try:
                self.modem.ussd_annuler()
            except Exception:
                pass
            self.journal.evenement("session USSD expirée")
            self._cloturer_session(
                "⌛ Session USSD expirée (sans réponse trop longtemps). "
                "L'opérateur l'aurait fermée de son côté.")

    def _redemarrer_modem(self, canal=None, automatique=False):
        self.transport.envoyer(
            "⚠️ Le modem ne répond plus, je le redémarre…" if automatique
            else "Redémarrage du modem (≈30 s)…", canal=canal)
        try:
            self.modem.redemarrer()
        except Exception as e:
            self.transport.envoyer(f"❌ Échec du redémarrage : {echap(e)}", canal=canal)
            return
        self.transport.envoyer(
            f"✅ Modem revenu en ligne. Signal : {self.modem.signal()}/31", canal=canal)
