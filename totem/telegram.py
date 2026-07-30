# -*- coding: utf-8 -*-
"""Client Telegram minimal (longue interrogation), sans dépendance externe.

Sécurité : seuls les messages du propriétaire (chat_id de la config) sont
traités ; tout autre expéditeur est ignoré silencieusement.
"""

import json
import time
import urllib.parse
import urllib.request


class TransportTelegram:
    def __init__(self, jeton, chat_id):
        self.base = f"https://api.telegram.org/bot{jeton}"
        self.chat_id = int(chat_id)
        self.decalage = 0

    def _appel(self, methode, delai=15, **params):
        donnees = urllib.parse.urlencode(params).encode()
        req = urllib.request.Request(f"{self.base}/{methode}", data=donnees)
        with urllib.request.urlopen(req, timeout=delai) as rep:
            return json.loads(rep.read().decode())

    def envoyer(self, texte):
        for _ in range(3):
            try:
                self._appel("sendMessage", chat_id=self.chat_id, text=texte)
                return
            except Exception:
                time.sleep(2)

    def supprimer(self, message_id):
        """Efface un message du chat (utilisé pour les PIN)."""
        try:
            self._appel("deleteMessage", chat_id=self.chat_id, message_id=message_id)
        except Exception:
            pass  # le droit de suppression peut expirer après 48 h : non bloquant

    def recevoir(self):
        """Retourne [(message_id, texte)] du propriétaire. Bloque jusqu'à 50 s."""
        try:
            rep = self._appel("getUpdates", delai=60, offset=self.decalage,
                              timeout=50, allowed_updates='["message"]')
        except Exception:
            time.sleep(5)
            return []
        messages = []
        for maj in rep.get("result", []):
            self.decalage = maj["update_id"] + 1
            msg = maj.get("message") or {}
            if msg.get("chat", {}).get("id") != self.chat_id:
                continue  # expéditeur non autorisé : ignoré
            if "text" in msg:
                messages.append((msg["message_id"], msg["text"]))
        return messages
