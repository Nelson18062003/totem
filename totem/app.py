# -*- coding: utf-8 -*-
"""Orchestrateur TOTEM — pilote un ou plusieurs comptes Mobile Money.

Deux fils d'exécution :
  - boucle principale : les messages du propriétaire (commandes, session USSD)
  - surveillance : SMS entrants de TOUS les comptes, santé des modems, rapport

Chaque compte a son propre modem et sa propre session USSD, donc les deux
réseaux sont écoutés en permanence : aucun paiement ne peut passer inaperçu.
"""

import re
import threading
import time
from datetime import datetime

from .compte import ErreurModem, libelles_uniques

RE_CODE_USSD = re.compile(r"^[\*#][\d\*#]+#$")
# « mtn *126# » : viser un compte sans changer le compte courant
RE_CIBLE_USSD = re.compile(r"^(\w[\w\s]{0,14}?)\s+([\*#][\d\*#]+#)$")
RE_DEMANDE_PIN = re.compile(r"\bPIN\b|code secret|code confidentiel", re.I)


class Robot:
    def __init__(self, comptes, transport, journal, nom="TOTEM",
                 heure_rapport="21:00", pause_sms=10):
        self.comptes = libelles_uniques(list(comptes))
        self.transport = transport
        self.journal = journal
        self.nom = nom
        self.heure_rapport = heure_rapport
        self.pause_sms = pause_sms
        self.actif = True
        self.courant = self.comptes[0] if self.comptes else None

    @property
    def multi(self):
        return len(self.comptes) > 1

    def _aide(self):
        lignes = [
            f"{self.nom} — commandes",
            "",
            "*126#  (ou tout code USSD) — ouvre le menu, puis répondez normalement",
        ]
        if self.multi:
            lignes += [
                "mtn *126#  — viser un compte sans changer de compte courant",
                "/comptes — liste des comptes et bascule",
            ]
        lignes += [
            "/annuler — ferme la session en cours",
            "/statut — état des modems et des SIM",
            "/sms — les 5 derniers messages reçus",
            "/rapport — bilan des dernières 24 h",
            "/redemarrer — relance le modem du compte courant",
        ]
        return "\n".join(lignes)

    # ---- démarrage --------------------------------------------------------
    def demarrer(self, bloquant=True):
        if not self.comptes:
            self.transport.envoyer("Aucun modem détecté. Vérifiez les branchements.")
            return
        detail = "\n".join(f"· {c.resume()}" for c in self.comptes)
        pluriel = "comptes" if self.multi else "compte"
        self.transport.envoyer(
            f"{self.nom} en ligne — {len(self.comptes)} {pluriel}\n{detail}\n\n"
            f"Tapez /aide pour les commandes."
        )
        self.journal.evenement(f"démarrage ({len(self.comptes)} compte(s))")
        threading.Thread(target=self._boucle_surveillance, daemon=True).start()
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

    def _traiter(self, message_id, texte):
        t = texte.strip()
        bas = t.lower()

        if bas in ("/aide", "/start", "/help"):
            return self.transport.envoyer(self._aide())
        if bas == "/statut":
            return self._statut()
        if bas in ("/comptes", "/compte"):
            return self._lister_comptes()
        if bas == "/sms":
            return self._derniers_sms()
        if bas == "/rapport":
            return self._rapport(manuel=True)
        if bas == "/annuler":
            self.courant.ussd_annuler()
            return self.transport.envoyer(f"Session {self.courant.libelle} annulée.")
        if bas in ("/redemarrer", "/redemarrer_modem"):
            return self._redemarrer()

        # Bascule de compte : /mtn, /orange, /2…
        if bas.startswith("/"):
            cible = self._compte_par_nom(bas)
            if cible:
                self.courant = cible
                return self.transport.envoyer(f"Compte courant : {cible.libelle}.")

        # « mtn *126# » : exécution ciblée, sans changer le compte courant
        cible_directe = RE_CIBLE_USSD.match(t)
        if cible_directe:
            compte = self._compte_par_nom(cible_directe.group(1))
            if compte:
                return self._ussd(compte, cible_directe.group(2), nouveau=True)

        if RE_CODE_USSD.match(t):
            return self._ussd(self.courant, t, nouveau=True)

        # Réponse à un menu ouvert : on cherche le compte qui attend
        en_attente = [c for c in self.comptes if c.session_ouverte]
        if en_attente:
            compte = self.courant if self.courant.session_ouverte else en_attente[0]
            # Si le menu demandait le PIN : effacer du chat, ne rien journaliser.
            if RE_DEMANDE_PIN.search(compte.dernier_menu):
                self.transport.supprimer(message_id)
                self.journal.ussd("envoyé", "****", compte.libelle)
            else:
                self.journal.ussd("envoyé", t, compte.libelle)
            return self._ussd(compte, t, nouveau=False)

        self.transport.envoyer("Commande inconnue. Tapez un code USSD (ex. *126#) ou /aide.")

    def _ussd(self, compte, texte, nouveau):
        try:
            if nouveau:
                self.journal.ussd("envoyé", texte, compte.libelle)
                reponse = compte.ussd_demarrer(texte)
            else:
                reponse = compte.ussd_repondre(texte)
        except ErreurModem as e:
            compte.session_ouverte = False
            return self.transport.envoyer(f"[{compte.libelle}] {e}")
        except Exception as e:
            compte.session_ouverte = False
            self.journal.evenement(f"erreur USSD {compte.libelle} : {e}")
            return self.transport.envoyer(f"[{compte.libelle}] Le modem n'a pas répondu.")

        self.journal.ussd("reçu", reponse, compte.libelle)
        entete = f"[{compte.libelle}]\n" if self.multi else ""
        suffixe = "\n\nRépondez directement, ou /annuler." if compte.session_ouverte else ""
        self.transport.envoyer(entete + reponse + suffixe)

    # ---- informations -----------------------------------------------------
    def _statut(self):
        lignes = [f"{self.nom}"]
        for c in self.comptes:
            marque = " ←" if self.multi and c is self.courant else ""
            lignes.append(f"· {c.resume()}{marque}")
        self.transport.envoyer("\n".join(lignes))

    def _lister_comptes(self):
        if not self.multi:
            return self.transport.envoyer(f"Un seul compte : {self.courant.libelle}.")
        lignes = ["Comptes disponibles :"]
        for i, c in enumerate(self.comptes, 1):
            marque = "  (courant)" if c is self.courant else ""
            lignes.append(f"{i}. {c.libelle}{marque}")
        lignes.append("")
        lignes.append("Pour basculer : /1, /2 ou /mtn, /orange")
        self.transport.envoyer("\n".join(lignes))

    def _redemarrer(self):
        c = self.courant
        self.transport.envoyer(f"Redémarrage du modem {c.libelle} (environ 30 s)…")
        try:
            c.redemarrer()
            self.transport.envoyer(f"{c.libelle} : modem redémarré, signal {c.signal()}/31.")
        except Exception as e:
            self.transport.envoyer(f"{c.libelle} : échec du redémarrage ({e}).")

    def _derniers_sms(self):
        lignes = self.journal.derniers_sms(5)
        if not lignes:
            return self.transport.envoyer("Aucun message reçu pour l'instant.")
        blocs = []
        for date, expediteur, texte, compte in lignes:
            etiquette = f"[{compte}] " if self.multi and compte else ""
            blocs.append(f"{etiquette}{date} — {expediteur}\n{texte}")
        self.transport.envoyer("\n\n".join(blocs))

    def _rapport(self, manuel=False):
        nb, total, nb_sms = self.journal.rapport_du_jour()
        total_txt = f"{total:,}".replace(",", " ")
        etats = " · ".join(f"{c.libelle} {c.signal()}/31" for c in self.comptes)
        titre = "Rapport" if manuel else "Rapport quotidien"
        self.transport.envoyer(
            f"{titre} — dernières 24 h\n"
            f"{nb} encaissement(s), total {total_txt} FCFA ({nb_sms} messages reçus)\n"
            f"{etats}"
        )

    # ---- surveillance (SMS de tous les comptes, santé, rapport) ------------
    def _boucle_surveillance(self):
        dernier_rapport = None
        while self.actif:
            for compte in self.comptes:
                self._relever_sms(compte)
            maintenant = datetime.now()
            if (maintenant.strftime("%H:%M") == self.heure_rapport
                    and dernier_rapport != maintenant.date()):
                dernier_rapport = maintenant.date()
                self._rapport()
            time.sleep(self.pause_sms)

    def _relever_sms(self, compte):
        try:
            messages = compte.lire_nouveaux_sms()
            compte.echecs = 0
        except Exception as e:
            compte.echecs += 1
            self.journal.evenement(f"lecture SMS {compte.libelle} : {e}")
            if compte.echecs == 3:  # chien de garde : 3 échecs → on relance CE modem
                self.transport.envoyer(f"{compte.libelle} : le modem ne répond plus, redémarrage…")
                try:
                    compte.redemarrer()
                    self.transport.envoyer(f"{compte.libelle} : modem revenu en ligne.")
                except Exception:
                    self.transport.envoyer(f"{compte.libelle} : échec du redémarrage, nouvelle tentative bientôt.")
                    compte.echecs = 0  # on laisse une nouvelle chance au cycle suivant
            return

        for expediteur, texte in messages:
            self.journal.sms(expediteur, texte, compte.libelle)
            etiquette = f"[{compte.libelle}] " if self.multi else ""
            self.transport.envoyer(f"{etiquette}Message de {expediteur}\n{texte}")
