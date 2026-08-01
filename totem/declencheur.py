# -*- coding: utf-8 -*-
"""Ce qui déclenche un reçu — et surtout ce qui ne le déclenche pas.

Un reçu est un document qu'on présente à un client. Il n'a le droit d'exister
que sur un fait comptable établi. La règle est écrite ici en toutes lettres,
au même endroit, pour qu'on puisse la lire sans parcourir le robot :

    SMS                                       reçu ?
    ----------------------------------------  -------------------------
    transfert réussi, entrant ou sortant      oui — reçu de transfert
    solde, après une interrogation USSD       oui — reçu de solde
    transfert échoué, annulé, rejeté          non
    code à usage unique                       jamais
    promotion, forfait, bonus, publicité      non
    message non compris                       non

En cas de doute : **pas de reçu**. Le SMS reste consultable en clair sur
Telegram, comme aujourd'hui. Un reçu faux vaut moins que pas de reçu du tout.
"""

import re

from .analyse_sms import _normaliser, analyser, code_a_usage_unique, solde_annonce

TRANSFERT = "transfert"
SOLDE = "solde"

# Les mots qui disent qu'il ne s'est rien passé. L'analyseur écarte déjà la
# forme d'Orange, qui exige « reussi » ; ceci couvre les autres tournures, et
# rend le refus visible plutôt qu'implicite.
RE_ECHEC = re.compile(
    r"\b(?:echec|echoue|echouee|annul(?:e|ee|ation)|rejet(?:e|ee)|refus(?:e|ee)"
    r"|insuffisant|insuffisante|impossible|non\s+abouti[e]?|failed|declined)\b")


class Motif:
    """La raison d'un reçu, et de quoi le remplir.

    `genre` vaut « transfert » ou « solde ». Un motif de transfert porte le
    paiement analysé ; un motif de solde porte le montant annoncé.
    """

    __slots__ = ("genre", "paiement", "solde")

    def __init__(self, genre, paiement=None, solde=None):
        self.genre = genre
        self.paiement = paiement
        self.solde = solde

    @property
    def reference(self):
        """L'identifiant de transaction, quand l'opérateur en donne un.

        C'est le meilleur garde-fou contre les doublons : le modem peut relire
        le même SMS après un redémarrage, la référence, elle, ne change pas.
        Un solde n'en a aucune — Orange n'en écrit pas.
        """
        return self.paiement.reference if self.paiement else None

    def __repr__(self):
        return f"<Motif {self.genre}>"


# Une option numérotée : « 1. Consulter le solde », « 2) Retrait ». Leur
# présence dit qu'on est devant un menu, pas devant une réponse.
RE_OPTION = re.compile(r"^\s*\d{1,2}\s*[.):\-]\s*\S", re.M)

# Ce qui attend une saisie : on n'établit pas de document sur une question.
RE_ATTENTE = re.compile(
    r"\bentrez\b|\bsaisissez\b|\bveuillez\s+(?:entrer|saisir)\b|\bconfirmez\b"
    r"|\benter\b|\bchoisissez\b|\bmontant\b|\bbeneficiaire\b")


def motif_du_menu(reponse):
    """Un reçu de solde à partir d'une réponse USSD.

    Le solde ne voyage pas toujours par SMS : le plus souvent l'opérateur
    l'affiche à l'écran, et nulle part ailleurs. Appuyer sur « Solde » et ne
    rien recevoir, c'est ce trou-là.

    Trois refus, avant même de chercher un montant :

      - un **menu** — des options numérotées veulent dire qu'il reste à
        choisir, donc qu'il ne s'est rien passé ;
      - une **question** — « Entrez le montant » n'est pas un fait établi ;
      - tout ce que `solde_annonce()` écarte déjà : publicité, code, paiement.
    """
    if not reponse or not reponse.strip():
        return None
    if RE_OPTION.search(reponse):
        return None
    norme = _normaliser(reponse)
    if RE_ATTENTE.search(norme) or RE_ECHEC.search(norme):
        return None
    solde = solde_annonce(reponse)
    return Motif(SOLDE, solde=solde) if solde is not None else None


def motif_du_sms(texte, numeros=()):
    """Renvoie un `Motif`, ou None si ce SMS ne mérite aucun reçu.

    `numeros` : les numéros des cartes en place. Ils ne décident pas de
    l'existence du reçu, seulement du sens qu'il annonce.
    """
    if not texte or not texte.strip():
        return None

    # Un code à usage unique, jamais. Passe avant tout le reste : c'est la
    # seule règle qui n'a pas d'exception.
    if code_a_usage_unique(texte):
        return None

    norme = _normaliser(texte)
    if RE_ECHEC.search(norme):
        return None

    paiement = analyser(texte, numeros=numeros)
    if paiement is not None:
        return Motif(TRANSFERT, paiement=paiement)

    solde = solde_annonce(texte)
    if solde is not None:
        return Motif(SOLDE, solde=solde)
    return None


__all__ = ["Motif", "SOLDE", "TRANSFERT", "motif_du_menu",
           "motif_du_sms"]
