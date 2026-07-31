# -*- coding: utf-8 -*-
"""Acheminement fiable des annonces (encaissements, alertes, bilans).

Sans réseau, un message envoyé est un message perdu : le robot n'a aucun
moyen de savoir plus tard qu'il aurait dû prévenir. Or c'est justement
pendant une coupure Internet à Douala que les paiements continuent d'arriver.

Le facteur essaie d'abord d'envoyer tout de suite — l'ordre et la vivacité
sont préservés dans le cas normal. Ce n'est qu'en cas d'échec que le message
est écrit dans le journal, d'où il repartira au retour du réseau. Tant que
la file n'est pas vide, les nouveaux messages y entrent aussi : rien ne
double personne dans la queue.

Les échanges interactifs (menus USSD, réponses aux commandes) ne passent pas
par ici : ils n'ont d'intérêt qu'immédiatement, et l'utilisateur voit tout de
suite qu'ils n'ont pas abouti.
"""

MAX_PAR_TOUR = 5      # on vide la file sans saturer les limites de Telegram


class Facteur:
    def __init__(self, journal, transport):
        self.journal = journal
        self.transport = transport

    def poster(self, texte, canal=None):
        """Envoie maintenant si possible, met de côté sinon. Toujours vrai
        du point de vue de l'appelant : le message finira par partir."""
        if self.journal.courrier_en_attente():
            # Une file existe déjà : passer devant casserait la chronologie
            # des encaissements.
            self.journal.enfiler(canal, texte)
            return False
        if self._tenter(texte, canal):
            return True
        self.journal.enfiler(canal, texte)
        return False

    def distribuer(self):
        """Vide la file, du plus ancien au plus récent. S'arrête au premier
        échec pour ne pas marteler un réseau encore absent."""
        livres = 0
        for _ in range(MAX_PAR_TOUR):
            courrier = self.journal.prochain_courrier()
            if not courrier:
                break
            identifiant, canal, texte, _ = courrier
            if not self._tenter(texte, canal):
                self.journal.courrier_echoue(identifiant)
                break
            self.journal.courrier_livre(identifiant)
            livres += 1
        return livres

    def en_attente(self):
        return self.journal.courrier_en_attente()

    def _tenter(self, texte, canal):
        try:
            return self.transport.envoyer(texte, canal=canal) is not None
        except Exception:
            return False
