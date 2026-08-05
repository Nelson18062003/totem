# -*- coding: utf-8 -*-
"""Transports de test : console interactive et scénario automatique (démo).

Ils exposent la même interface que `TransportTelegram` : les boutons sont
affichés en texte (on tape le chiffre correspondant), le reste est identique.
"""

from .entrant import Entrant
from .mise_en_forme import brut
from .textes import t

ADMIN = "admin"


class _TransportTexte:
    """Partie commune : rendu terminal des messages et des claviers."""

    def __init__(self):
        self.dernier_id = 1000

    def _afficher(self, texte, boutons, prefixe="🤖"):
        print(f"\n{prefixe} {brut(texte)}")
        if boutons:
            for ligne in boutons:
                print("   " + "   ".join(f"[{libelle}]" for libelle, _ in ligne))
        self.dernier_id += 1
        return self.dernier_id

    def envoyer(self, texte, boutons=None, canal=None, silencieux=False):
        return self._afficher(texte, boutons)

    def modifier(self, message_id, texte, boutons=None, canal=None):
        self._afficher(texte, boutons, prefixe="🤖 ↻")
        return True

    def retirer_boutons(self, message_id, canal=None):
        pass

    def supprimer(self, message_id, canal=None):
        print(t("   ✂️  (user message deleted — PIN protection)",
                "   ✂️  (message utilisateur effacé — protection PIN)"))

    def accuser(self, callback_id, texte=""):
        pass

    def envoyer_fichier(self, nom, contenu, legende="", canal=None,
                        type_mime="text/csv"):
        print(t(f"\n📎 {nom} ({len(contenu)} bytes) — {brut(legende)}",
                f"\n📎 {nom} ({len(contenu)} octets) — {brut(legende)}"))
        return True

    def publier_commandes(self, commandes):
        pass

    def vider_backlog(self):
        pass

    def role(self, utilisateur):
        return ADMIN  # en local, l'unique utilisateur est le propriétaire


class TransportConsole(_TransportTexte):
    """Chat dans le terminal : vous tapez, le robot répond. Pour essais locaux."""

    def recevoir(self):
        try:
            texte = input(t("\nYou > ", "\nVous > ")).strip()
        except EOFError:
            raise KeyboardInterrupt
        return [Entrant(texte=texte)] if texte else []


class TransportScenario(_TransportTexte):
    """Rejoue une liste de messages puis s'arrête : pour la démo automatisée.

    Une entrée préfixée de « ! » simule un appui sur un bouton plutôt qu'un
    message tapé — sans quoi la démo ne pourrait pas franchir les étapes qui
    n'existent qu'en boutons (confirmation d'une sortie, pavé du code)."""

    def __init__(self, messages):
        super().__init__()
        self.messages = list(messages)
        self.compteur = 0

    def recevoir(self):
        if not self.messages:
            raise KeyboardInterrupt  # fin du scénario
        self.compteur += 1
        texte = self.messages.pop(0)
        if texte.startswith("!"):
            print(f"\n👆 [{texte[1:]}]")
            return [Entrant(texte=texte[1:], bouton=True, callback_id="demo",
                            origine_id=self.dernier_id)]
        print(f"\n👤 {texte}")
        return [Entrant(texte=texte, message_id=self.compteur)]
