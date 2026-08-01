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

Deux échecs, très différents, qu'on ne traite surtout pas pareil :

  - **Une coupure réseau** touche TOUT : on garde l'ordre, on ne compte pas
    d'échec, et on réessaie le même message plus tard. Une panne Internet de
    nuit ne doit jamais faire jeter un encaissement.

  - **Un refus de Telegram** (fil de discussion fermé ou supprimé, robot sorti
    du groupe) ne vise qu'UN message : s'acharner dessus soixante fois
    bloquerait toute la file derrière lui — plus aucune notification pendant
    des minutes. On l'écarte donc vite, on prévient le propriétaire, et on
    continue avec les suivants.

Les échanges interactifs (menus USSD, réponses aux commandes) ne passent pas
par ici : ils n'ont d'intérêt qu'immédiatement, et l'utilisateur voit tout de
suite qu'ils n'ont pas abouti.
"""

MAX_PAR_TOUR = 5             # on vide la file sans saturer les limites de Telegram
ESSAIS_AVANT_ABANDON = 3     # un message que Telegram refuse ne mérite pas 60 essais


class Facteur:
    def __init__(self, journal, transport, sur_abandon=None):
        self.journal = journal
        self.transport = transport
        # Appelé (canal, texte) quand un message est abandonné pour de bon,
        # pour que le propriétaire l'apprenne au lieu de le perdre en silence.
        self.sur_abandon = sur_abandon

    def poster(self, texte, canal=None):
        """Envoie maintenant si possible, met de côté sinon. Toujours vrai
        du point de vue de l'appelant : le message finira par partir."""
        if self.journal.courrier_en_attente():
            # Une file existe déjà : passer devant casserait la chronologie
            # des encaissements.
            self.journal.enfiler(canal, texte)
            return False
        if self._acheminer(texte, canal) == "livre":
            return True
        self.journal.enfiler(canal, texte)
        return False

    def distribuer(self):
        """Vide la file, du plus ancien au plus récent.

        S'arrête net à la première coupure réseau — inutile de marteler un
        réseau absent. Mais un message que Telegram REFUSE est écarté sans
        bloquer ceux qui le suivent : la file avance."""
        livres = 0
        for _ in range(MAX_PAR_TOUR):
            courrier = self.journal.prochain_courrier()
            if not courrier:
                break
            identifiant, canal, texte, _essais = courrier
            etat = self._acheminer(texte, canal)
            if etat == "livre":
                self.journal.courrier_livre(identifiant)
                livres += 1
                continue
            if etat == "reseau":
                # Coupure : rien ne partira ce tour-ci. On garde l'ordre et on
                # réessaiera à l'identique, sans compter d'échec.
                break
            # « refuse » : Telegram rejette CE message précis. On l'écarte
            # vite pour ne pas bloquer la file, et on prévient si on l'abandonne.
            abandonne = self.journal.courrier_echoue(
                identifiant, essais_max=ESSAIS_AVANT_ABANDON)
            if abandonne and self.sur_abandon:
                try:
                    self.sur_abandon(canal, texte)
                except Exception:
                    pass
            # on NE casse PAS : le message suivant a droit à sa chance
        return livres

    def en_attente(self):
        return self.journal.courrier_en_attente()

    def _acheminer(self, texte, canal):
        """Livre le message et DIT ce qui s'est passé :
          « livre »  — parti.
          « reseau » — coupure : on garde tout et on réessaiera à l'identique.
          « refuse » — Telegram rejette CE message (fil fermé, cible partie).

        Le vrai transport sait distinguer les deux échecs (le code HTTP le
        dit) et expose « acheminer ». Les transports de test, eux, n'ont que
        « envoyer » : un None y vaut une coupure — le cas sûr, celui qui
        n'abandonne jamais un encaissement par erreur."""
        acheminer = getattr(self.transport, "acheminer", None)
        if acheminer is not None:
            try:
                return acheminer(texte, canal=canal)
            except Exception:
                return "reseau"
        try:
            return ("livre"
                    if self.transport.envoyer(texte, canal=canal) is not None
                    else "reseau")
        except Exception:
            return "reseau"
