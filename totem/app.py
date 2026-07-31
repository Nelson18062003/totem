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

import re
import signal
import threading
import time
from datetime import datetime

from .compte import ErreurModem, libelles_uniques
from .mise_en_forme import bloc, echap, gras, mono
from .sante import Sante, sauvegarder_journal
from .analyse_sms import analyser

ARRET_PROPRE = "arrêt propre"

RE_CODE_USSD = re.compile(r"^[\*#][\d\*#]+#$")
# « mtn *126# » : viser un compte sans changer le compte courant
RE_CIBLE_USSD = re.compile(r"^(\w[\w\s]{0,14}?)\s+([\*#][\d\*#]+#)$")
RE_DEMANDE_PIN = re.compile(r"\bPIN\b|code secret|code confidentiel", re.I)
RE_OPTION = re.compile(r"^\s*(\d{1,2})\s*[.):\-]\s*(\S.*?)\s*$")

ADMIN = "admin"
PAVE_PIN = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]]

COMMANDES_BOT = [
    ("menu", "Écran d'accueil avec les boutons"),
    ("statut", "État des modems, des SIM et du signal"),
    ("comptes", "Choisir le compte piloté"),
    ("sms", "Les derniers SMS reçus"),
    ("rapport", "Bilan des dernières 24 h"),
    ("export", "Journal des 7 derniers jours en CSV"),
    ("annuler", "Fermer la session USSD en cours"),
    ("redemarrer_modem", "Relancer le modem du compte courant"),
    ("aide", "Aide"),
]


class Robot:
    def __init__(self, comptes, transport, journal, nom="TOTEM",
                 heure_rapport="21:00", pause_sms=10, raccourcis=None,
                 delai_session=180, chemin_base=None, nuage=None):
        self.comptes = libelles_uniques(list(comptes))
        self.transport = transport
        self.journal = journal
        self.nom = nom
        self.heure_rapport = heure_rapport
        self.pause_sms = pause_sms
        self.raccourcis = raccourcis or {}
        self.delai_session = delai_session
        self.chemin_base = chemin_base
        self.nuage = nuage      # None ou non configuré : le robot ignore le cloud
        self.actif = True
        self.verrou = threading.RLock()
        self.courant = self.comptes[0] if self.comptes else None
        self.sante = Sante()
        self._reinitialiser_session()

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
        self.file_macro = []
        self.dernier_echange = time.time()

    def _aide(self):
        lignes = [
            f"🗿 {gras(self.nom)}", "",
            "Le plus simple : /menu, puis tout se fait au doigt.", "",
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
            ]
        lignes += [
            "", gras("Commandes"),
            "/menu — écran d'accueil",
            "/statut — signal, opérateur, SIM",
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
        detail = "\n".join(f"· {echap(c.resume())}" for c in self.comptes)
        pluriel = "comptes" if self.multi else "compte"
        avertissement = (
            "\n⚡ <i>Redémarrage après coupure de courant ou plantage : "
            "l'arrêt précédent n'était pas propre.</i>" if brutal else "")
        self.transport.envoyer(
            f"✅ {gras(self.nom)} en ligne — {len(self.comptes)} {pluriel}\n"
            f"{detail}{avertissement}",
            boutons=self._boutons_accueil(ADMIN))
        self.journal.evenement(f"démarrage ({len(self.comptes)} compte(s))")
        threading.Thread(target=self._boucle_surveillance, daemon=True).start()
        if self.nuage:
            # Synchronisation en tâche de fond : elle rattrape son retard
            # quand le réseau le permet, et n'interrompt jamais le robot.
            self.nuage.demarrer(comptes=self.comptes, sante=self.sante)
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
            elif commande == "sms":
                self._derniers_sms(canal)
            elif commande == "rapport":
                self._rapport(canal=canal, manuel=True)
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
            elif commande in ("annuler", "redemarrer_modem") or RE_CODE_USSD.match(texte) \
                    or RE_CIBLE_USSD.match(texte) or self.session_ussd:
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
        if self.pin_actif or RE_DEMANDE_PIN.search(self.dernier_menu):
            self.transport.supprimer(entrant.message_id, canal=canal)
            self.journal.ussd("envoyé", "****", compte.libelle)
        else:
            self.journal.ussd("envoyé", texte, compte.libelle)
        self._ussd(compte, texte, nouveau=False)
        self._avancer_macro()

    def _ouvrir_session(self, compte, code, canal):
        self.canal_session = canal
        self.msg_session = None
        self._ussd(compte, code, nouveau=True)

    def _clic(self, donnee, entrant, role, canal):
        genre, _, valeur = donnee.partition(":")
        if genre == "c" and valeur in ("menu", "statut", "sms", "rapport",
                                       "export", "aide", "comptes"):
            {"menu": lambda: self._accueil(canal, role),
             "aide": lambda: self.transport.envoyer(self._aide(), canal=canal),
             "statut": lambda: self._statut(canal),
             "comptes": lambda: self._lister_comptes(canal, role),
             "sms": lambda: self._derniers_sms(canal),
             "rapport": lambda: self._rapport(canal=canal, manuel=True),
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
        elif genre == "a":                      # bascule de compte
            compte = self._compte_par_nom(valeur)
            if compte:
                self.courant = compte
                self._accueil(canal, role)
        elif genre == "m":
            self._lancer_raccourci(valeur, canal)
        elif genre == "u":
            compte = self.session_compte
            if compte is None:
                return
            self.journal.ussd("envoyé", valeur, compte.libelle)
            self._ussd(compte, valeur, nouveau=False)
            self._avancer_macro()
        elif genre == "p":
            self._pave(valeur)

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
                self.journal.ussd("envoyé", texte, compte.libelle)
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
        self.journal.ussd("reçu", reponse, compte.libelle)
        self.dernier_menu = reponse
        self.session_compte = compte if compte.session_ouverte else None
        self.pin_actif = bool(compte.session_ouverte and RE_DEMANDE_PIN.search(reponse))
        self.pin_tampon = ""
        self.dernier_echange = time.time()
        if compte.session_ouverte:
            self._afficher_session(compte)
        else:
            entete = f"[{echap(compte.libelle)}]\n" if self.multi else ""
            self._cloturer_session(entete + bloc(reponse))

    def _afficher_session(self, compte):
        """Réécrit la carte de session en place : une seule carte, vivante."""
        etiquette = f" · {echap(compte.libelle)}" if self.multi else ""
        if self.pin_actif:
            texte, boutons = self._carte_pin(etiquette)
        else:
            options = self._options(self.dernier_menu)
            texte = f"🗿 {gras('Session USSD')}{etiquette}\n{bloc(self.dernier_menu)}"
            if options:
                boutons = [[(f"{num}. {lib[:28]}", f"u:{num}")
                            for num, lib in options[i:i + 2]]
                           for i in range(0, len(options), 2)]
            else:
                texte += "\n✍️ Répondez par un message (numéro, montant…)."
                boutons = []
            boutons = boutons + [[("❌ Annuler", "c:annuler")]]
        self._peindre(texte, boutons)

    def _carte_pin(self, etiquette=""):
        boutons = [[(c, f"p:{c}") for c in ligne] for ligne in PAVE_PIN]
        boutons.append([("⌫", "p:eff"), ("0", "p:0"), ("✅ Valider", "p:ok")])
        boutons.append([("❌ Annuler", "c:annuler")])
        return (
            f"🔐 {gras('Code PIN')}{etiquette}\n{bloc(self.dernier_menu)}\n"
            f"Saisi : {mono('•' * len(self.pin_tampon) or '—')}\n"
            "<i>Le code se compose sur les boutons : il n'apparaît jamais "
            "dans la conversation.</i>", boutons)

    def _pave(self, touche):
        compte = self.session_compte
        if not self.pin_actif or compte is None:
            return
        self.dernier_echange = time.time()
        etiquette = f" · {echap(compte.libelle)}" if self.multi else ""
        if touche == "eff":
            self.pin_tampon = self.pin_tampon[:-1]
        elif touche == "ok":
            if not self.pin_tampon:
                return
            code, self.pin_tampon = self.pin_tampon, ""
            self.pin_actif = False
            self.journal.ussd("envoyé", "****", compte.libelle)
            self._peindre(f"🔐 {gras('Code PIN')}{etiquette}\n⏳ Validation en cours…", [])
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

    def _cloturer_session(self, corps):
        self._peindre(corps, [[("🏠 Menu", "c:menu")]])
        canal = self.canal_session
        self._reinitialiser_session()
        self.canal_session = canal

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
        raccourci = self.raccourcis.get(nom)
        if not raccourci:
            self.transport.envoyer("Raccourci inconnu.", canal=canal)
            return
        etapes = list(raccourci["etapes"])
        self.canal_session = canal
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
            self.journal.ussd("envoyé", etape, compte.libelle)
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
        lignes = self.journal.derniers_sms(5)
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
        nb, total, nb_sms = self.journal.rapport_du_jour()
        etats = " · ".join(f"{echap(c.libelle)} {c.signal()}/31" for c in self.comptes)
        self.transport.envoyer(
            f"{'📊' if manuel else '🌙'} {gras('Dernières 24 h')}\n"
            f"Encaissements : {gras(nb)}\nTotal : {gras(self._fcfa(total))}\n"
            f"SMS reçus : {nb_sms}\n{etats}",
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

    # ---- surveillance (SMS de tous les comptes, santé, rapport) ------------
    def _boucle_surveillance(self):
        dernier_rapport = None
        prochaine_sante = 0
        while self.actif:
            for compte in self.comptes:
                self._relever_sms(compte)
            self._expirer_session()
            # La santé du Pi change lentement : inutile de la lire à chaque tour.
            if time.time() >= prochaine_sante:
                prochaine_sante = time.time() + 120
                self._veiller_sante()
            maintenant = datetime.now()
            if maintenant.strftime("%H:%M") == self.heure_rapport \
                    and dernier_rapport != maintenant.date():
                dernier_rapport = maintenant.date()
                self._rapport()
                sauvegarder_journal(self.chemin_base)
            time.sleep(self.pause_sms)

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

    def _relever_sms(self, compte):
        try:
            messages = compte.lire_nouveaux_sms()
            compte.echecs = 0
        except Exception as e:
            compte.echecs += 1
            self.journal.evenement(f"lecture SMS {compte.libelle} : {e}")
            if compte.echecs == 3:  # chien de garde : on relance CE modem
                self._redemarrer_modem(compte, canal="alertes", automatique=True)
                compte.echecs = 0
            return
        for expediteur, texte in messages:
            self.journal.sms(expediteur, texte, compte.libelle)
            self._notifier_sms(compte, expediteur, texte)

    def _notifier_sms(self, compte, expediteur, texte):
        """Un encaissement sonne ; le reste arrive en notification discrète.

        Quand le message est compris, on met en avant ce qui compte — combien,
        de qui — plutôt que de laisser lire la phrase de l'opérateur."""
        etiquette = f" [{echap(compte.libelle)}]" if self.multi else ""
        paiement = analyser(texte)

        if paiement and paiement.sens == "entree":
            entete = (f"💰 {gras('Encaissement')}{etiquette} — "
                      f"{gras(self._fcfa(paiement.montant))}\n"
                      f"de {gras(paiement.tiers)}")
            sonne = True
        elif paiement:
            entete = (f"↗️ {gras('Envoi')}{etiquette} — "
                      f"{gras(self._fcfa(paiement.montant))}\n"
                      f"vers {gras(paiement.tiers)}")
            sonne = False
        else:
            entete = f"📥 {gras('SMS')}{etiquette} de {gras(expediteur)}"
            sonne = False

        self.transport.envoyer(f"{entete}\n{echap(texte)}", canal="encaissements",
                               silencieux=not sonne)

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
        etiquette = f"[{echap(compte.libelle)}] " if self.multi else ""
        self.transport.envoyer(
            f"⚠️ {etiquette}Le modem ne répond plus, je le redémarre…" if automatique
            else f"{etiquette}Redémarrage du modem (≈30 s)…", canal=canal)
        try:
            compte.redemarrer()
        except Exception as e:
            self.transport.envoyer(
                f"❌ {etiquette}Échec du redémarrage : {echap(e)}", canal=canal)
            return
        self.transport.envoyer(
            f"✅ {etiquette}Modem revenu en ligne. Signal : {compte.signal()}/31",
            canal=canal)
