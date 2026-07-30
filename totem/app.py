# -*- coding: utf-8 -*-
"""Orchestrateur du robot Mobile Money.

Fils d'exécution :
  - boucle principale : messages et clics du propriétaire (commandes + USSD)
  - surveillance : SMS entrants, santé du modem, changement de SIM, rapport
    quotidien, expiration de la session USSD

Trois principes de l'interface Telegram :
  1. **Boutons** — les options d'un menu USSD deviennent des boutons ; le
     texte du menu n'est jamais recopié en double sous les boutons.
  2. **Une seule carte vivante** — la session se met à jour en place, comme
     l'écran d'un téléphone, au lieu d'empiler les messages.
  3. **Le code secret ne touche jamais la conversation** — il se compose sur
     un pavé numérique ; seul le nombre d'étoiles est affiché.

Rien n'est écrit en dur pour un opérateur : MTN, Orange ou tout autre réseau
est décrit dans `totem.conf`, et le robot choisit le bon profil d'après ce
que le modem voit réellement dans la SIM présente.
"""

import re
import threading
import time
from datetime import datetime

from .mise_en_forme import echap, gras, italique, mono
from .modem import USSD_OUVERTE, ErreurModem
from .storage import montant_recu

RE_CODE_USSD = re.compile(r"^[\*#][\d\*#]+#$")
# Une option de menu : « 1. Texte », « 2) Texte », « 3- Texte », « 04 : Texte ».
# Le séparateur est obligatoire, sinon « 1 000 FCFA » passerait pour une option.
RE_OPTION = re.compile(r"^\s*(\d{1,2})\s*[.):\-]\s*(\S.*)$")
# Vocabulaire du code secret, selon les opérateurs.
RE_DEMANDE_CODE = re.compile(
    r"\bpin\b|code\s+(?:secret|confidentiel|pin)|mot\s+de\s+passe|password", re.I)

ADMIN = "admin"
PAVE_PIN = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]]
VERIF_SIM_SECONDES = 60
VERIF_MEMOIRE_SECONDES = 300
SEUIL_MEMOIRE = 0.8        # on alerte bien avant la saturation

COMMANDES_BOT = [
    ("menu", "Écran d'accueil avec les boutons"),
    ("statut", "État du robot (SIM, opérateur, signal)"),
    ("sms", "Les derniers SMS reçus"),
    ("rapport", "Bilan des dernières 24 h"),
    ("export", "Journal des 7 derniers jours en CSV"),
    ("sims", "Les cartes SIM déjà passées dans le robot"),
    ("diagnostic", "État détaillé (mémoire SMS, disque, température)"),
    ("annuler", "Fermer la session USSD en cours"),
    ("redemarrer_modem", "Relancer le modem"),
    ("aide", "Aide"),
]

AIDE = (
    "🗿 <b>TOTEM</b>\n\n"
    "Le plus simple : /menu, puis tout se fait au doigt.\n\n"
    "<b>Codes USSD</b>\n"
    "Le robot reconnaît la SIM présente et vous propose directement le menu "
    "de son opérateur. Vous pouvez aussi envoyer n'importe quel code "
    "vous-même : les options du menu arrivent en boutons, les questions "
    "libres (numéro, montant) se répondent par un message normal, et le code "
    "secret se tape sur un pavé sécurisé qui ne laisse aucune trace dans la "
    "conversation.\n\n"
    "<b>Plusieurs SIM</b>\n"
    "Chaque carte a son propre journal : les SMS et les rapports d'une SIM "
    "ne se mélangent jamais à ceux d'une autre, même de même opérateur. "
    "Changez la carte, le robot le voit seul et bascule.\n\n"
    "<b>Commandes</b>\n"
    "/menu — écran d'accueil\n"
    "/statut — SIM, opérateur, signal\n"
    "/sms — les derniers SMS de la SIM en place\n"
    "/rapport — bilan des dernières 24 h\n"
    "/export — journal CSV des 7 derniers jours\n"
    "/sims — les cartes déjà passées dans le robot\n"
    "/annuler — ferme la session USSD\n"
    "/redemarrer_modem — relance le modem\n"
    "/aide — ce message"
)


class Robot:
    def __init__(self, modem, transport, journal, nom="TOTEM",
                 heure_rapport="21:00", pause_sms=10, profils=None,
                 delai_session=180):
        self.modem = modem
        self.transport = transport
        self.journal = journal
        self.nom = nom
        self.heure_rapport = heure_rapport
        self.pause_sms = pause_sms
        self.profils = profils or {}
        self.delai_session = delai_session
        self.actif = True
        self.verrou = threading.RLock()
        self.sim = None            # ICCID de la carte en place
        self.profil = self._profil_generique("inconnu")
        self.memoire_signalee = False
        self.conflit_signale = False
        self.demarre_a = time.time()
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

    def _reinitialiser_session(self):
        self.session_ussd = False
        self.dernier_menu = ""
        self.msg_session = None
        self.canal_session = None
        self.pin_actif = False
        self.pin_tampon = ""
        self.file_macro = []
        self.dernier_echange = time.time()

    # ---- identité de la SIM et profil opérateur ---------------------------
    @staticmethod
    def _profil_generique(operateur):
        return {"nom": operateur, "detection": "", "menu": "", "raccourcis": {}}

    def _choisir_profil(self, operateur):
        """Associe le réseau vu par le modem au profil décrit dans la config."""
        for cle, profil in self.profils.items():
            detection = (profil.get("detection") or "").strip()
            if detection and detection.lower() in (operateur or "").lower():
                return {**profil, "nom": profil.get("nom") or operateur}
        repli = self.profils.get("*")
        if repli:
            return {**repli, "nom": operateur}
        return self._profil_generique(operateur)

    def _lire_sim(self):
        """(iccid, operateur) — tolère un modem qui ne sait pas répondre."""
        try:
            iccid = self.modem.iccid()
        except Exception:
            iccid = ""
        try:
            operateur = self.modem.operateur()
        except Exception:
            operateur = "inconnu"
        return iccid, operateur

    def _adopter_sim(self, iccid, operateur):
        self.sim = iccid
        self.journal.definir_sim(iccid)
        self.profil = self._choisir_profil(operateur)

    @staticmethod
    def _sim_lisible(iccid):
        if not iccid:
            return "identifiant indisponible"
        return "…" + iccid[-6:]

    # ---- démarrage --------------------------------------------------------
    def demarrer(self, bloquant=True):
        self.transport.vider_backlog()      # ne jamais rejouer d'ancienne commande
        self.transport.publier_commandes(COMMANDES_BOT)
        iccid, operateur = self._lire_sim()
        self._adopter_sim(iccid, operateur)
        etat_sim = "SIM détectée" if self.modem.sim_presente() else "⚠️ AUCUNE SIM détectée"
        self.transport.envoyer(
            f"✅ {gras(self.nom)} en ligne — {echap(etat_sim)}\n"
            f"Opérateur : {gras(operateur)}\n"
            f"Carte : {mono(self._sim_lisible(iccid))} · "
            f"Signal : {self.modem.signal()}/31",
            boutons=self._boutons_accueil(ADMIN))
        self.journal.evenement(f"démarrage · {operateur}")
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
            elif commande == "sims":
                self._liste_sims(canal)
            elif commande == "diagnostic":
                self._diagnostic(canal)
            elif commande in ("annuler", "redemarrer_modem") or RE_CODE_USSD.match(texte) \
                    or self.session_ussd:
                if not self._verifier_admin(role, entrant, canal):
                    return
                self._action_admin(commande, texte, entrant, canal)
            else:
                self.transport.envoyer(
                    "Je n'ai pas compris. Ouvrez /menu, ou envoyez un code USSD.",
                    canal=canal, boutons=[[("🏠 Menu", "c:menu")]])

    def _action_admin(self, commande, texte, entrant, canal):
        if commande == "annuler":
            self._annuler(canal)
        elif commande == "redemarrer_modem":
            self._redemarrer_modem(canal)
        elif RE_CODE_USSD.match(texte):
            self._ouvrir_session(texte, canal)
        else:
            # Réponse libre dans le menu en cours (numéro, montant… ou code
            # secret tapé à la main : dans ce cas on efface le message).
            if self.pin_actif:
                self.transport.supprimer(entrant.message_id, canal=canal)
                self.journal.ussd("envoyé", "****")
            else:
                self.journal.ussd("envoyé", texte)
            self._ussd(texte, nouveau=False)
            self._avancer_macro()

    def _clic(self, donnee, entrant, role, canal):
        genre, _, valeur = donnee.partition(":")
        lecture = {"menu": lambda: self._accueil(canal, role),
                   "aide": lambda: self.transport.envoyer(AIDE, canal=canal),
                   "statut": lambda: self._statut(canal),
                   "sms": lambda: self._derniers_sms(canal),
                   "rapport": lambda: self._rapport(canal=canal, manuel=True),
                   "sims": lambda: self._liste_sims(canal),
                   "diagnostic": lambda: self._diagnostic(canal),
                   "export": lambda: self._export(canal)}
        if genre == "c" and valeur in lecture:
            lecture[valeur]()
            return

        if not self._verifier_admin(role, entrant, canal):
            return

        if genre == "c" and valeur == "ouvrir":
            self._ouvrir_session(self.profil.get("menu", ""), canal)
        elif genre == "c" and valeur == "ussd":
            self.transport.envoyer(
                "⌨️ Envoyez le code à composer, par exemple "
                f"{mono(self.profil.get('menu') or '*126#')}.", canal=canal)
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
        if role == ADMIN:
            if self.profil.get("menu"):
                lignes.append([(f"📱 Menu {self.profil['nom']}"[:32], "c:ouvrir")])
            raccourcis = self.profil.get("raccourcis") or {}
            noms = list(raccourcis)
            for i in range(0, len(noms), 2):
                lignes.append([(raccourcis[n]["libelle"], f"m:{n}") for n in noms[i:i + 2]])
        lignes.append([("📥 SMS reçus", "c:sms"), ("📊 Rapport 24 h", "c:rapport")])
        lignes.append([("📡 Statut", "c:statut"), ("📄 Export CSV", "c:export")])
        lignes.append([("⌨️ Code USSD", "c:ussd"), ("❓ Aide", "c:aide")]
                      if role == ADMIN else [("❓ Aide", "c:aide")])
        return lignes

    def _accueil(self, canal, role):
        b = self.journal.rapport_du_jour()
        self.transport.envoyer(
            f"🗿 {gras(self.nom)}\n"
            f"{gras(self.profil['nom'])} · carte {mono(self._sim_lisible(self.sim))} · "
            f"signal {self.modem.signal()}/31\n"
            f"Dernières 24 h sur cette carte : "
            f"{gras(str(b['encaissements']) + ' entrée(s)')} — "
            f"{gras(self._fcfa(b['recu']))}\n\nQue faire ?",
            boutons=self._boutons_accueil(role), canal=canal)

    # ---- session USSD ------------------------------------------------------
    def _ouvrir_session(self, code, canal):
        if not code:
            self.transport.envoyer(
                "Aucun code de menu n'est configuré pour cet opérateur. "
                "Envoyez le code vous-même, ou ajoutez-le dans totem.conf.",
                canal=canal)
            return
        self.canal_session = canal
        self.msg_session = None
        self.file_macro = []
        self._ussd(code, nouveau=True)

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
        self.pin_actif = self.session_ussd and self._demande_un_code(reponse)
        self.pin_tampon = ""
        self.dernier_echange = time.time()
        if self.session_ussd:
            self._afficher_session()
        else:
            self._cloturer_session(self._texte_menu(reponse))

    @classmethod
    def _demande_un_code(cls, menu):
        """Vrai seulement si l'opérateur ATTEND une saisie de code secret.

        Un menu qui se contente de *parler* du code secret (« 5) Gerer mon
        code secret ») porte des options numérotées : c'est une navigation,
        pas une saisie. C'est exactement ce qui faisait apparaître le pavé
        au mauvais moment."""
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

    @staticmethod
    def _texte_menu(menu):
        """Rend un texte d'opérateur lisible dans Telegram : lignes nettoyées,
        aucun bloc de code (le cadre gris à chasse fixe cassait l'affichage
        sur téléphone et faisait déborder les lignes longues)."""
        lignes = [l.strip() for l in re.split(r"\r\n|\r|\n", menu or "") if l.strip()]
        return echap("\n".join(lignes))

    @staticmethod
    def _court(texte, limite=30):
        return texte if len(texte) <= limite else texte[:limite - 1].rstrip() + "…"

    def _boutons_options(self, options):
        """Deux boutons par ligne si les libellés sont courts, sinon un seul :
        c'est ce qui évite les libellés tronqués et l'effet « sens dessus
        dessous » sur les menus Orange, plus verbeux que ceux de MTN."""
        libelles = [(f"{num}. {self._court(lib)}", f"u:{num}") for num, lib in options]
        par_ligne = 2 if all(len(l) <= 20 for l, _ in libelles) else 1
        return [libelles[i:i + par_ligne] for i in range(0, len(libelles), par_ligne)]

    def _afficher_session(self):
        """Réécrit la carte de session en place : une seule carte, vivante."""
        if self.pin_actif:
            texte, boutons = self._carte_pin()
        else:
            entete, options = self._analyser_menu(self.dernier_menu)
            texte = f"🗿 {gras(self.profil['nom'])}"
            if entete:
                texte += "\n" + echap("\n".join(entete))
            if options:
                # Les options sont DANS les boutons : ne pas les répéter en
                # texte au-dessus, c'est ce qui rendait l'écran illisible.
                boutons = self._boutons_options(options)
            else:
                texte += "\n\n" + italique("✍️ Répondez par un message.")
                boutons = []
            boutons = boutons + [[("❌ Fermer", "c:annuler")]]
        self._peindre(texte, boutons)

    def _carte_pin(self):
        boutons = [[(c, f"p:{c}") for c in ligne] for ligne in PAVE_PIN]
        boutons.append([("⌫", "p:eff"), ("0", "p:0"), ("✅ Valider", "p:ok")])
        boutons.append([("❌ Annuler", "c:annuler")])
        entete, _ = self._analyser_menu(self.dernier_menu)
        return (
            f"🔐 {gras('Code secret')}\n{echap(chr(10).join(entete))}\n\n"
            f"Saisi : {mono('•' * len(self.pin_tampon) or '—')}\n"
            + italique("Le code se compose sur les boutons : il n'apparaît "
                       "jamais dans la conversation."), boutons)

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
            self._peindre(f"🔐 {gras('Code secret')}\n⏳ Validation en cours…", [])
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
        try:
            self.modem.ussd_annuler()
        except Exception:
            pass
        if self.msg_session:
            self.transport.retirer_boutons(self.msg_session, canal=self.canal_session)
        self._reinitialiser_session()
        self.transport.envoyer("Session USSD fermée.",
                               boutons=[[("🏠 Menu", "c:menu")]], canal=canal)

    # ---- raccourcis (macros USSD) -----------------------------------------
    def _lancer_raccourci(self, nom, canal):
        raccourci = (self.profil.get("raccourcis") or {}).get(nom)
        if not raccourci:
            self.transport.envoyer(
                "Ce raccourci n'existe pas pour la SIM en place.", canal=canal)
            return
        etapes = list(raccourci["etapes"])
        self.canal_session = canal
        self.msg_session = None
        self.file_macro = etapes[1:]
        self._ussd(etapes[0], nouveau=True)
        self._avancer_macro()

    def _avancer_macro(self):
        """Déroule les étapes restantes d'un raccourci ; s'arrête d'elle-même
        dès qu'un code secret est demandé ou que la session se referme."""
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
            f"📡 {gras(self.nom)}\n"
            f"SIM : {echap(sim)} · {mono(self._sim_lisible(self.sim))}\n"
            f"Opérateur : {gras(self.profil['nom'])}\n"
            f"Signal : {gras(f'{self.modem.signal()}/31')}\n"
            f"Session USSD : {'ouverte' if self.session_ussd else 'aucune'}",
            canal=canal)

    def _derniers_sms(self, canal=None):
        lignes = self.journal.derniers_sms(5)
        if not lignes:
            self.transport.envoyer(
                "Aucun SMS en mémoire pour la SIM en place.", canal=canal)
            return
        corps = "\n\n".join(
            f"📥 {echap(d.replace('T', ' '))} — {gras(e)}\n{echap(t)}"
            for d, e, t in lignes)
        self.transport.envoyer(corps, canal=canal, boutons=[[("🏠 Menu", "c:menu")]])

    def _liste_sims(self, canal=None):
        lignes = self.journal.sims_connues()
        if not lignes:
            self.transport.envoyer("Aucune carte enregistrée pour l'instant.", canal=canal)
            return
        corps = "\n".join(
            f"{'▶️' if (sim or '') == (self.sim or '') else '▫️'} "
            f"{mono(self._sim_lisible(sim))} — {nb} SMS, dernier le "
            f"{echap((date or '').replace('T', ' '))}"
            for sim, nb, date in lignes)
        self.transport.envoyer(
            f"💳 {gras('Cartes passées dans le robot')}\n{corps}", canal=canal,
            boutons=[[("🏠 Menu", "c:menu")]])

    def _rapport(self, canal=None, manuel=False):
        b = self.journal.rapport_du_jour()
        solde_net = b["recu"] - b["envoye"]
        self.transport.envoyer(
            f"{'📊' if manuel else '🌙'} {gras('Dernières 24 h')} — "
            f"{gras(self.profil['nom'])} {mono(self._sim_lisible(self.sim))}\n"
            f"⬇️ Entrées : {gras(b['encaissements'])} — {gras(self._fcfa(b['recu']))}\n"
            f"⬆️ Sorties : {gras(b['sorties'])} — {gras(self._fcfa(b['envoye']))}\n"
            f"Solde du jour : {gras(self._fcfa(solde_net))}\n"
            f"SMS reçus : {b['sms']} · Signal : {self.modem.signal()}/31",
            canal=canal if manuel else "encaissements",
            boutons=[[("📄 Export CSV", "c:export")]] if manuel else None)

    def _diagnostic(self, canal=None):
        """Tout ce qu'on voudrait savoir avant d'appeler quelqu'un à Douala."""
        lignes = [f"🩺 {gras('Diagnostic')}"]
        lignes.append(f"Robot en marche depuis {self._duree(time.time() - self.demarre_a)}")
        try:
            occupes, capacite = self.modem.memoire_sms()
            lignes.append(f"Mémoire SMS ({getattr(self.modem, 'stockage_sms', '?')}) : "
                          f"{occupes}/{capacite}")
        except Exception:
            lignes.append("Mémoire SMS : illisible")
        for libelle, valeur in (("ICCID", self.sim or "indisponible"),
                                ("IMSI", self._sans_erreur(self.modem.imsi)),
                                ("Numéro", self._sans_erreur(self.modem.numero) or "non inscrit")):
            lignes.append(f"{libelle} : {mono(valeur)}")
        lignes.append(f"Signal : {self.modem.signal()}/31 · "
                      f"Réseau : {echap(self._sans_erreur(self.modem.operateur))}")
        for libelle, valeur in self._sante_systeme():
            lignes.append(f"{libelle} : {echap(valeur)}")
        self.transport.envoyer("\n".join(lignes), canal=canal,
                               boutons=[[("🏠 Menu", "c:menu")]])

    @staticmethod
    def _sans_erreur(fonction, defaut=""):
        try:
            return fonction() or defaut
        except Exception:
            return defaut

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
    def _sante_systeme():
        """Espace disque et température du Pi : les deux pannes silencieuses
        classiques d'une carte SD qui tourne des mois sans surveillance."""
        infos = []
        try:
            import shutil
            total, _, libre = shutil.disk_usage("/")
            infos.append(("Disque libre", f"{libre // 2**20} Mo sur {total // 2**20} Mo"))
        except Exception:
            pass
        try:
            with open("/sys/class/thermal/thermal_zone0/temp") as f:
                infos.append(("Température", f"{int(f.read().strip()) / 1000:.0f} °C"))
        except Exception:
            pass
        return infos

    def _export(self, canal=None):
        contenu = self.journal.export_csv(7)
        nom = f"totem-{datetime.now():%Y-%m-%d}.csv"
        if not self.transport.envoyer_fichier(
                nom, contenu, legende="📄 Journal des 7 derniers jours "
                f"({echap(self.profil['nom'])}).", canal=canal):
            self.transport.envoyer("⚠️ L'export n'a pas pu être envoyé.", canal=canal)

    @staticmethod
    def _fcfa(montant):
        return f"{montant:,}".replace(",", " ") + " FCFA"

    # ---- surveillance (SMS entrants, santé, SIM, rapport quotidien) --------
    def _boucle_surveillance(self):
        echecs_modem = 0
        depuis_verif_sim = 0
        depuis_verif_memoire = 0
        while self.actif:
            try:
                self._relever_sms()
                echecs_modem = 0
            except Exception as e:
                echecs_modem += 1
                self.journal.evenement(f"erreur lecture SMS : {e}")
                if echecs_modem == 3:  # chien de garde : 3 échecs → reset modem
                    self._redemarrer_modem(canal="alertes", automatique=True)
                    echecs_modem = 0
            depuis_verif_sim += self.pause_sms
            if depuis_verif_sim >= VERIF_SIM_SECONDES:
                depuis_verif_sim = 0
                self._verifier_sim()
            depuis_verif_memoire += self.pause_sms
            if depuis_verif_memoire >= VERIF_MEMOIRE_SECONDES:
                depuis_verif_memoire = 0
                self._verifier_memoire()
            self._signaler_conflit()
            self._expirer_session()
            self._rapport_quotidien()
            time.sleep(self.pause_sms)

    def _relever_sms(self):
        """Relève les SMS du modem. L'ordre compte : on écrit au journal AVANT
        d'effacer dans le modem. Si le robot meurt entre les deux, le message
        sera relu au redémarrage plutôt que perdu — et le garde-fou anti-doublon
        évite de l'annoncer deux fois."""
        for index, expediteur, texte in self.modem.lire_sms():
            deja_vu = self.journal.sms_existe(expediteur, texte)
            if not deja_vu:
                self.journal.sms(expediteur, texte)
                self._notifier_sms(expediteur, texte)
            if not self.modem.effacer_sms(index):
                self.journal.evenement(
                    f"SMS {index} non effacé du modem (il sera ignoré au prochain tour)")

    def _verifier_memoire(self):
        """Une mémoire SMS pleine fait perdre les messages suivants — donc des
        encaissements jamais vus. On prévient bien avant la saturation."""
        try:
            occupes, capacite = self.modem.memoire_sms()
        except Exception:
            return
        if not capacite:
            return
        taux = occupes / capacite
        if taux < SEUIL_MEMOIRE:
            self.memoire_signalee = False
            return
        if self.memoire_signalee:
            return
        self.memoire_signalee = True
        self.journal.evenement(f"mémoire SMS à {occupes}/{capacite}")
        self.transport.envoyer(
            f"⚠️ {gras('Mémoire SMS presque pleine')} — {occupes}/{capacite}.\n"
            + italique("Au-delà, le réseau ne peut plus déposer de nouveaux SMS : "
                       "des encaissements passeraient inaperçus. Le robot efface "
                       "normalement au fil de l'eau ; si le compte ne redescend "
                       "pas, le modem refuse les effacements."), canal="alertes")

    def _signaler_conflit(self):
        """Deux robots sur le même jeton se coupent mutuellement : les
        commandes se perdent au hasard, sans le moindre message d'erreur."""
        conflit = getattr(self.transport, "conflit", False)
        if conflit == self.conflit_signale:
            return
        self.conflit_signale = conflit
        if conflit:
            self.journal.evenement("conflit : deux instances sur le même jeton")
            self.transport.envoyer(
                f"⚠️ {gras('Deux robots utilisent le même jeton Telegram')}\n"
                + italique("Vos commandes peuvent se perdre. Arrêtez l'instance "
                           "en trop : sudo systemctl stop totem"), canal="alertes")

    def _rapport_quotidien(self):
        """Envoie le bilan une fois par jour, même si la boucle a sauté la
        minute exacte (redémarrage du modem, réseau lent, charge…)."""
        maintenant = datetime.now()
        if self.dernier_rapport == maintenant.date() or not self._heure_passee():
            return
        self.dernier_rapport = maintenant.date()
        self._rapport()

    def _notifier_sms(self, expediteur, texte):
        """Tous les SMS arrivent de la même façon : aucun n'est mis en
        sourdine. Le montant est simplement mis en évidence quand il y en a un."""
        montant = montant_recu(texte)
        entete = (f"💰 {gras('Encaissement')} — {gras(self._fcfa(montant))}"
                  if montant is not None
                  else f"📥 {gras('SMS')} de {gras(expediteur)}")
        self.transport.envoyer(
            f"{entete}\n{echap(texte)}\n"
            + italique(f"{self.profil['nom']} · {self._sim_lisible(self.sim)}"),
            canal="encaissements")

    def _verifier_sim(self):
        """Détecte le remplacement physique de la carte dans le HAT."""
        with self.verrou:
            iccid, operateur = self._lire_sim()
            if not iccid or iccid == self.sim:
                if iccid and self.profil["nom"] != operateur:
                    self.profil = self._choisir_profil(operateur)
                return
            ancienne = self.sim
            if self.session_ussd:
                self._cloturer_session("⚠️ Carte SIM changée : session fermée.")
            self._adopter_sim(iccid, operateur)
            self.journal.evenement(f"changement de SIM : {ancienne} → {iccid}")
            if ancienne is None:
                return          # première lecture : rien à annoncer
            self.transport.envoyer(
                f"💳 {gras('Nouvelle carte SIM détectée')}\n"
                f"Opérateur : {gras(operateur)}\n"
                f"Carte : {mono(self._sim_lisible(iccid))}\n"
                + italique("Journal, rapports et raccourcis basculent sur cette carte."),
                canal="alertes", boutons=self._boutons_accueil(ADMIN))

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
