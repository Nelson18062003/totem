# -*- coding: utf-8 -*-
"""Transports de test : console interactive et scénario automatique (démo)."""


class TransportConsole:
    """Chat dans le terminal : vous tapez, le robot répond. Pour essais locaux."""

    def envoyer(self, texte):
        print(f"\n🤖 {texte}")

    def supprimer(self, message_id):
        print("   (message utilisateur effacé — protection PIN)")

    def recevoir(self):
        try:
            texte = input("\nVous > ").strip()
        except EOFError:
            raise KeyboardInterrupt
        return [(0, texte)] if texte else []


class TransportScenario:
    """Rejoue une liste de messages puis s'arrête : pour la démo automatisée."""

    def __init__(self, messages):
        self.messages = list(messages)
        self.compteur = 0

    def envoyer(self, texte):
        print(f"🤖 {texte}\n")

    def supprimer(self, message_id):
        print("   ✂️  (message utilisateur effacé — protection PIN)\n")

    def recevoir(self):
        if not self.messages:
            raise KeyboardInterrupt  # fin du scénario
        self.compteur += 1
        texte = self.messages.pop(0)
        print(f"👤 {texte}")
        return [(self.compteur, texte)]
