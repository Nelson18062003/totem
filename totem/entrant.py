# -*- coding: utf-8 -*-
"""Message entrant, quel que soit le transport (Telegram, console, scénario).

Un `Entrant` représente indifféremment :
  - un message tapé par l'utilisateur (`bouton = False`) ;
  - un appui sur un bouton en ligne (`bouton = True`, `texte` = la donnée
    du bouton, `origine_id` = le message qui porte le clavier).
"""

from dataclasses import dataclass


@dataclass
class Entrant:
    texte: str
    message_id: int = 0        # message de l'utilisateur (pour l'effacer)
    utilisateur: int = 0       # identifiant Telegram de l'expéditeur
    nom: str = ""              # prénom affiché, pour les journaux d'audit
    chat: int = 0              # conversation d'origine (privée ou groupe)
    sujet: int = 0             # message_thread_id si groupe à sujets (forum)
    bouton: bool = False       # provient d'un clic plutôt que d'une frappe
    callback_id: str = ""      # à accuser sous 10 s sinon le bouton tourne
    origine_id: int = 0        # message porteur du clavier cliqué
