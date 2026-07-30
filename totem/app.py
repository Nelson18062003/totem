# -*- coding: utf-8 -*-
"""Orchestrateur du robot MoMo.

Fils d'exécution :
  - boucle principale : messages du propriétaire (commandes + session USSD)
  - surveillance : SMS entrants, santé du modem, rapport quotidien
"""

import re
import threading
import time
from datetime import datetime

from .modem import USSD_OUVERTE, ErreurModem

RE_CODE_USSD = re.compile(r"^[\*#][\d\*#]+#$")
RE_DEMANDE_PIN = re.compile(r"\bPIN\b|code secret", re.I)

AIDE = (
    "🗿 TOTEM — commandes :\n"
    "*126#  (ou tout code USSD) → ouvre le menu MoMo, répondez ensuite normalement\n"
    "/annuler → ferme la session USSD en cours\n"
    "/statut → état du robot (signal, opérateur, SIM)\n"
    "/sms → les 5 derniers SMS reçus\n"
    "/rapport → bilan des dernières 24 h\n"
    "/redemarrer_modem → relance le modem s'il ne répond plus\n"
    "/aide → ce message"
)


class Robot:
    def __init__(self, modem, transport, journal, nom="TOTEM",
                 heure_rapport="21:00", pause_sms=10):
        self.modem = modem
        self.transport = transport
        self.journal = journal
        self.nom = nom
        self.heure_rapport = heure_rapport
        self.pause_sms = pause_sms
        self.session_ussd = False
        self.dernier_menu = ""
        self.actif = True

    # ---- démarrage --------------------------------------------------------
    def demarrer(self, bloquant=True):
        etat_sim = "SIM détectée" if self.modem.sim_presente() else "⚠️ AUCUNE SIM détectée"
        self.transport.envoyer(
            f"✅ {self.nom} en ligne. {etat_sim}. "
            f"Opérateur : {self.modem.operateur()}. Signal : {self.modem.signal()}/31.\n"
            f"Tapez /aide pour les commandes."
        )
        self.journal.evenement("démarrage")
        surveillance = threading.Thread(target=self._boucle_surveillance, daemon=True)
        surveillance.start()
        if bloquant:
            self._boucle_messages()

    # ---- messages du propriétaire -----------------------------------------
    def _boucle_messages(self):
        while self.actif:
            try:
                for message_id, texte in self.transport.recevoir():
                    self._traiter(message_id, texte)
            except KeyboardInterrupt:
                self.actif = False
            except Exception as e:  # jamais mourir sur un message
                self.journal.evenement(f"erreur boucle messages : {e}")
                time.sleep(2)

    def _traiter(self, message_id, texte):
        t = texte.strip()
        if t.lower() in ("/aide", "/start", "/help"):
            self.transport.envoyer(AIDE)
        elif t.lower() == "/statut":
            self._statut()
        elif t.lower() == "/sms":
            self._derniers_sms()
        elif t.lower() == "/rapport":
            self._rapport(manuel=True)
        elif t.lower() == "/annuler":
            self.modem.ussd_annuler()
            self.session_ussd = False
            self.transport.envoyer("Session USSD annulée.")
        elif t.lower() == "/redemarrer_modem":
            self.transport.envoyer("Redémarrage du modem (≈30 s)…")
            self.modem.redemarrer()
            self.transport.envoyer(f"✅ Modem redémarré. Signal : {self.modem.signal()}/31.")
        elif RE_CODE_USSD.match(t):
            self._ussd(t, nouveau=True)
        elif self.session_ussd:
            # Réponse dans le menu en cours. Si le menu demandait le PIN,
            # on efface le message du chat et on ne journalise que des étoiles.
            if RE_DEMANDE_PIN.search(self.dernier_menu):
                self.transport.supprimer(message_id)
                self.journal.ussd("envoyé", "****")
            else:
                self.journal.ussd("envoyé", t)
            self._ussd(t, nouveau=False)
        else:
            self.transport.envoyer(
                "Commande inconnue. Tapez un code USSD (ex. *126#) ou /aide."
            )

    def _ussd(self, texte, nouveau):
        try:
            if nouveau:
                self.journal.ussd("envoyé", texte)
                etat, reponse = self.modem.ussd_demarrer(texte)
            else:
                etat, reponse = self.modem.ussd_repondre(texte)
        except ErreurModem as e:
            self.session_ussd = False
            self.transport.envoyer(f"⚠️ {e}")
            return
        self.journal.ussd("reçu", reponse)
        self.dernier_menu = reponse
        self.session_ussd = etat == USSD_OUVERTE
        suffixe = "\n\n↩️ Répondez directement, ou /annuler." if self.session_ussd else ""
        self.transport.envoyer(reponse + suffixe)

    def _statut(self):
        sim = "présente" if self.modem.sim_presente() else "⚠️ ABSENTE"
        self.transport.envoyer(
            f"📡 {self.nom}\nSIM : {sim}\nOpérateur : {self.modem.operateur()}\n"
            f"Signal : {self.modem.signal()}/31\n"
            f"Session USSD : {'ouverte' if self.session_ussd else 'aucune'}"
        )

    def _derniers_sms(self):
        lignes = self.journal.derniers_sms(5)
        if not lignes:
            self.transport.envoyer("Aucun SMS en mémoire pour l'instant.")
            return
        corps = "\n\n".join(f"📥 {d} — {e}\n{t}" for d, e, t in lignes)
        self.transport.envoyer(corps)

    def _rapport(self, manuel=False):
        nb, total, nb_sms = self.journal.rapport_du_jour()
        total_txt = f"{total:,}".replace(",", " ")
        self.transport.envoyer(
            f"{'📊' if manuel else '🌙'} Rapport des dernières 24 h — "
            f"{nb} encaissement(s), total {total_txt} FCFA ({nb_sms} SMS reçus). "
            f"Signal : {self.modem.signal()}/31. ✅"
        )

    # ---- surveillance (SMS entrants, santé, rapport quotidien) -------------
    def _boucle_surveillance(self):
        dernier_rapport = None
        echecs_modem = 0
        while self.actif:
            try:
                for expediteur, texte in self.modem.lire_nouveaux_sms():
                    self.journal.sms(expediteur, texte)
                    self.transport.envoyer(f"📥 SMS de {expediteur} :\n{texte}")
                echecs_modem = 0
            except Exception as e:
                echecs_modem += 1
                self.journal.evenement(f"erreur lecture SMS : {e}")
                if echecs_modem == 3:  # chien de garde : 3 échecs → reset modem
                    self.transport.envoyer("⚠️ Le modem ne répond plus, je le redémarre…")
                    try:
                        self.modem.redemarrer()
                        self.transport.envoyer("✅ Modem revenu en ligne.")
                        echecs_modem = 0
                    except Exception:
                        self.transport.envoyer("❌ Échec du redémarrage. Je réessaie bientôt.")
            # Rapport quotidien à l'heure configurée
            maintenant = datetime.now().strftime("%H:%M")
            if maintenant == self.heure_rapport and dernier_rapport != datetime.now().date():
                dernier_rapport = datetime.now().date()
                self._rapport()
            time.sleep(self.pause_sms)
