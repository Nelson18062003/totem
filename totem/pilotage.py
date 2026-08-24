# -*- coding: utf-8 -*-
"""Le guichet à distance : l'application web demande, le robot compose.

L'application web dépose ses demandes dans la table « commandes » de la base.
Ce module les relève, les exécute sur la vraie SIM, et écrit le résultat au
même endroit — la page web n'a plus qu'à le lire. Rien ne circule d'autre :
le navigateur ne touche jamais un modem, le robot ne parle jamais au
navigateur.

Quatre demandes existent :

    solde          le terminal republie son état, tel qu'il le connaît
    ussd           ouvrir une session en composant un code (« #148*5# »)
    ussd_reponse   répondre au menu ouvert (un chiffre, un numéro, un montant…)
    ussd_fin       raccrocher
    recu           établir le reçu d'un SMS passé (il se refabrique à
                   l'identique depuis le message, qui fait foi)

Le code secret
--------------
Une réponse marquée « secret » (le code confidentiel Mobile Money) est
traitée à part : elle est **masquée dans la base avant même d'être composée**
sur la carte, n'apparaît jamais au journal, et le résultat n'en garde rien.
Elle ne vit dans la base que les quelques secondes entre l'appui du
propriétaire et la relève du robot — c'est le prix du guichet sur la
plateforme, réduit à son minimum.

Une seule main sur le combiné
-----------------------------
Un modem ne tient qu'une session USSD à la fois. Si une session est déjà
ouverte depuis Telegram, la demande web est refusée poliment — et
inversement, une session web abandonnée se referme seule après deux minutes.
"""

import re
import threading
import time

from .analyse_sms import solde_annonce
from .declencheur import NATURES, RefusRecu
from .nuage import _horodatage
from .textes import t

# Une session web sans nouvelles pendant ce délai est raccrochée : un menu
# USSD abandonné bloquerait le combiné pour Telegram comme pour le web.
SESSION_MUETTE = 120

# Le pas de relève. Court pendant une session (le réseau attend une réponse),
# plus posé au repos — la base n'a pas besoin d'être frappée à la porte.
PAS_REPOS = 3
PAS_SESSION = 1.5


class Pilotage:
    """Relève les demandes de l'application web et les exécute."""

    def __init__(self, nuage, comptes, journal, pause=PAS_REPOS,
                 programmeur=None):
        self.nuage = nuage
        self.comptes = comptes
        self.journal = journal
        self.pause = pause
        # Inscrit un reçu à fabriquer pour une ligne du journal (le robot le
        # fournit). None : ce terminal ne fabrique pas de reçus.
        self.programmeur = programmeur
        self._marche = False
        # La session ouverte PAR LE WEB : compte visé et dernier signe de vie.
        # None quand le web n'a pas la main — une session Telegram éventuelle
        # appartient à Telegram, on n'y touche jamais.
        self._session = None

    # ---- cycle de vie ------------------------------------------------------
    def demarrer(self):
        if self._marche or not (self.nuage and self.nuage.actif):
            return None
        self._marche = True
        fil = threading.Thread(target=self._boucle, daemon=True)
        fil.start()
        return fil

    def arreter(self):
        self._marche = False
        self._raccrocher()

    # ---- la boucle ---------------------------------------------------------
    def _boucle(self):
        while self._marche:
            try:
                for demande in self.nuage.commandes_en_attente():
                    self._traiter(demande)
                self._expirer_session()
            except Exception as e:   # jamais mourir sur une demande
                self.journal.evenement(t(
                    f"remote desk: error {e}",
                    f"guichet à distance : erreur {e}"))
            time.sleep(PAS_SESSION if self._session else self.pause)

    def _expirer_session(self):
        if self._session and time.time() - self._session["vie"] > SESSION_MUETTE:
            self.journal.evenement(t(
                "remote desk: session abandoned, hung up",
                "guichet à distance : session abandonnée, raccrochée"))
            self._raccrocher()

    def ceder(self, compte):
        """Telegram reprend la main sur ce compte : on lâche notre session.

        Sans ça, la nôtre resterait ouverte dans nos livres alors que
        l'opérateur, lui, en a ouvert une autre. La réponse suivante venue de
        la plateforme partirait dans un menu qui a bougé — et cette réponse
        peut être un code secret. Le refus poli vaut infiniment mieux.
        """
        if self._session and self._session["compte"] is compte:
            self.journal.evenement(t(
                "remote desk: session taken back from Telegram",
                "guichet à distance : session reprise depuis Telegram"))
            self._session = None      # sans annuler : Telegram tient la ligne
            return True
        return False

    def _raccrocher(self):
        if self._session:
            try:
                self._session["compte"].ussd_annuler()
            except Exception:
                pass
            self._session = None

    # ---- exécution ---------------------------------------------------------
    def _traiter(self, demande):
        identifiant = demande.get("id")
        genre = (demande.get("type") or "").strip()
        parametres = demande.get("parametres") or {}
        # La langue de la demande : la plateforme la joint à chaque commande.
        # La réponse repart dans cette langue-là ; à défaut, celle du robot.
        langue = parametres.get("langue") or None
        self.nuage.commande_maj(identifiant, {"etat": "en_cours"})

        try:
            if genre == "solde":
                resultat = self._republier(langue)
            elif genre == "ussd":
                resultat = self._ouvrir(parametres, langue)
            elif genre == "ussd_reponse":
                resultat = self._repondre(identifiant, parametres, langue)
            elif genre == "ussd_fin":
                self._raccrocher()
                resultat = t("Session closed.", "Session refermée.",
                             langue=langue)
            elif genre == "recu":
                resultat = self._etablir_recu(parametres, langue)
            elif genre == "identite":
                resultat = self._definir_identite(parametres, langue)
            else:
                raise ValueError(t(f"unknown request: {genre}",
                                   f"demande inconnue : {genre}",
                                   langue=langue))
            etat = "faite"
        except RefusPoli as r:
            etat, resultat = "echouee", str(r)
        except Exception as e:
            etat, resultat = "echouee", t(
                f"The terminal could not do it: {e}",
                f"Le terminal n'a pas pu faire : {e}", langue=langue)
            self.journal.evenement(t(f"remote desk: failure ({genre})",
                                     f"guichet à distance : échec ({genre})"))

        self.nuage.commande_maj(identifiant, {
            "etat": etat, "resultat": resultat, "traitee_le": _horodatage()})

    def _etablir_recu(self, parametres, langue=None):
        """Le reçu d'un message passé, refabriqué depuis le SMS d'origine.

        Rien n'est inventé : si le message ne donne pas droit à un reçu
        (publicité, code à usage unique, échec), le refus est explicite.
        """
        if not self.programmeur:
            raise RefusPoli(t("This terminal does not produce receipts.",
                              "Ce terminal ne fabrique pas de reçus.",
                              langue=langue))
        try:
            source_id = int(parametres.get("source_id"))
        except (TypeError, ValueError):
            raise RefusPoli(t("Message not found in the log.",
                              "Message introuvable au journal.", langue=langue))
        # La nature choisie sur la plateforme (dépôt/retrait/transfert/solde) :
        # c'est elle qui décide du document. Une valeur inconnue est ignorée —
        # le robot retombe alors sur sa propre lecture du SMS.
        nature = parametres.get("nature")
        if nature not in NATURES:
            nature = None
        try:
            # La langue voyage avec la demande : la fabrication est différée,
            # et le PDF doit sortir dans la langue de l'écran qui l'a demandé.
            numero = self.programmeur(source_id, nature=nature, langue=langue)
        except RefusRecu as refus:
            # Le robot dit ce qu'il a LU, pas seulement ce qui manque : une
            # opération annulée, un code, un message illisible et une nature
            # qui ne colle pas aux faits sont quatre situations différentes —
            # une seule phrase pour les quatre faisait chercher le
            # propriétaire au mauvais endroit pendant des heures.
            raise RefusPoli(self._expliquer_refus(refus.raison, langue))
        if not numero:
            raise RefusPoli(t(
                "This message does not carry what that receipt needs — a "
                "readable amount for a transfer, an announced balance for a "
                "balance receipt.",
                "Ce message ne porte pas de quoi remplir ce reçu — un montant "
                "lisible pour un transfert, un solde annoncé pour un reçu de "
                "solde.", langue=langue))
        self.journal.evenement(t(
            f"remote desk: receipt {numero} requested",
            f"guichet à distance : reçu {numero} demandé"))
        return t(f"Receipt {numero} is being made: it will be archived and "
                 "ready to download in a moment.",
                 f"Reçu {numero} en fabrication : il sera archivé et "
                 "téléchargeable dans un instant.", langue=langue)

    @staticmethod
    def _expliquer_refus(raison, langue=None):
        """La phrase qui explique un reçu refusé — ce que le robot a lu,
        dans la langue du demandeur."""
        phrases = {
            "echec": t(
                "The robot read this message as a failed or cancelled "
                "operation — no receipt for a movement that never happened.",
                "Le robot lit ce message comme une opération échouée ou "
                "annulée — pas de reçu pour un mouvement qui n'a pas eu "
                "lieu.", langue=langue),
            "code": t(
                "This message carries a one-time code — never a receipt.",
                "Ce message porte un code à usage unique — jamais de reçu.",
                langue=langue),
            "publicite": t(
                "The robot read this message as an advert from the operator "
                "— no receipt without a real movement.",
                "Le robot lit ce message comme une réclame de l'opérateur — "
                "pas de reçu sans mouvement réel.", langue=langue),
            "illisible": t(
                "This message speaks of money but the robot could not read "
                "it fully — no amount was invented. The original text "
                "remains available in full.",
                "Ce message parle d'argent mais le robot n'a pas réussi à le "
                "lire en entier — aucun montant n'a été inventé. Le texte "
                "d'origine reste consultable en entier.", langue=langue),
            "solde_pas_mouvement": t(
                "The robot reads this message as a balance announcement, not "
                "a movement — a transfer receipt needs a readable amount.",
                "Le robot lit ce message comme une annonce de solde, pas "
                "comme un mouvement — un reçu de transfert exige un montant "
                "lisible.", langue=langue),
            "mouvement_sans_solde": t(
                "This movement announces no balance — a balance receipt "
                "needs one.",
                "Ce mouvement n'annonce aucun solde — un reçu de solde en "
                "exige un.", langue=langue),
        }
        return phrases.get(raison, t(
            "This message does not carry what that receipt needs — a "
            "readable amount for a transfer, an announced balance for a "
            "balance receipt.",
            "Ce message ne porte pas de quoi remplir ce reçu — un montant "
            "lisible pour un transfert, un solde annoncé pour un reçu de "
            "solde.", langue=langue))

    def _definir_identite(self, parametres, langue=None):
        """Inscrit le numéro et/ou le nom d'une carte depuis la plateforme,
        exactement comme /reglages sur Telegram.

        C'est ce numéro qui dira, ensuite, de quel côté d'un dépôt ou d'un
        transfert se trouve le terminal : sans lui, un dépôt reste affiché
        sans savoir s'il sort ou entre. Les mêmes contrôles qu'au clavier
        Telegram, car cette valeur devient une source de vérité."""
        iccid = str(parametres.get("iccid") or "").strip()
        if not iccid:
            raise RefusPoli(t("No card selected.", "Aucune carte visée.",
                              langue=langue))
        champs = {}
        if parametres.get("numero") is not None:
            chiffres = re.sub(r"\D", "", str(parametres.get("numero")))
            if not 8 <= len(chiffres) <= 15:
                raise RefusPoli(t("That is not a phone number.",
                                  "Ce n'est pas un numéro de téléphone.",
                                  langue=langue))
            champs["numero"] = chiffres
        if parametres.get("nom") is not None:
            nom = re.sub(r"\s+", " ", str(parametres.get("nom"))).strip()[:40]
            if len(nom) < 2:
                raise RefusPoli(t("That name is too short.",
                                  "Ce nom est trop court.", langue=langue))
            champs["nom"] = nom
        if not champs:
            raise RefusPoli(t("Nothing to save.", "Rien à enregistrer.",
                              langue=langue))
        if not self.journal.definir_identite(iccid, **champs):
            raise RefusPoli(t(
                "This card is not in the terminal's register.",
                "Cette carte n'est pas au registre du terminal.",
                langue=langue))
        self.journal.evenement(t(
            "remote desk: card identity changed",
            "guichet à distance : identité de carte modifiée"))
        self.nuage.reveiller()      # l'application web le verra tout de suite
        dit = []
        if "numero" in champs:
            dit.append(t(f"number {champs['numero']}",
                         f"numéro {champs['numero']}", langue=langue))
        if "nom" in champs:
            dit.append(t(f"name “{champs['nom']}”",
                         f"nom « {champs['nom']} »", langue=langue))
        lien = t(" and ", " et ", langue=langue)
        return t("Saved: ", "Enregistré : ", langue=langue) + lien.join(dit) + "."

    def _republier(self, langue=None):
        """« Actualiser » : l'état des comptes, repoussé à l'instant."""
        self.nuage.publier_comptes(self.comptes)
        self.nuage.enregistrer_terminal()
        return t("Terminal state published again.",
                 "État du terminal republié.", langue=langue)

    def _compte_vise(self, parametres, langue=None):
        """La carte sur laquelle composer.

        Par ICCID d'abord (« carte ») : c'est lui qui identifie une puce sans
        ambiguïté — deux SIM du même opérateur portent le même début de
        libellé, jamais le même ICCID. Le libellé (« compte ») reste accepté :
        c'est le geste historique de Telegram (« mtn *126# »). Sans ciblage,
        la première carte — le terminal à une seule SIM n'a rien à préciser.
        """
        iccid = re.sub(r"\D", "", str(parametres.get("carte") or ""))
        if iccid:
            for c in self.comptes:
                if c.carte.identifiee and c.carte.iccid == iccid:
                    return c
            raise RefusPoli(t(
                "That card is not in the terminal — was it moved or removed?",
                "Cette carte n'est pas dans le terminal — déplacée, retirée ?",
                langue=langue))
        nom = (parametres.get("compte") or "").strip().lower()
        if nom:
            for c in self.comptes:
                if c.libelle.lower().startswith(nom):
                    return c
            raise RefusPoli(t(f"No account “{nom}” on this terminal.",
                              f"Aucun compte « {nom} » sur ce terminal.",
                              langue=langue))
        if not self.comptes:
            raise RefusPoli(t("No card in the terminal.",
                              "Aucune carte dans le terminal.", langue=langue))
        return self.comptes[0]

    def _ouvrir(self, parametres, langue=None):
        code = (parametres.get("code") or "").strip()
        if not code:
            raise RefusPoli(t("No code to dial.", "Aucun code à composer.",
                              langue=langue))
        compte = self._compte_vise(parametres, langue)
        # Une session Telegram a la priorité : c'est un humain au bout.
        if compte.session_ouverte and self._session is None:
            raise RefusPoli(t(
                "A session is already open on Telegram for this account. "
                "Finish it there, then try again here.",
                "Une session est déjà ouverte sur Telegram pour ce compte. "
                "Terminez-la, puis recommencez ici.", langue=langue))
        self._raccrocher()          # notre éventuelle session précédente
        self.journal.evenement(t(
            f"remote desk: {code} ({compte.libelle})",
            f"guichet à distance : {code} ({compte.libelle})"))
        reponse = compte.ussd_demarrer(code)
        self._noter_session(compte)
        self._relever_solde(compte, reponse)
        return reponse

    def _repondre(self, identifiant, parametres, langue=None):
        if not self._session:
            raise RefusPoli(t(
                "No session in progress: dial a code first.",
                "Aucune session en cours : composez d'abord un code.",
                langue=langue))
        compte = self._session["compte"]
        texte = str(parametres.get("texte") or "")
        if parametres.get("secret"):
            # Le code confidentiel : effacé de la base AVANT d'être composé.
            # S'il ne devait rester qu'une règle, ce serait celle-là.
            self.nuage.commande_maj(
                identifiant, {"parametres": {"secret": True}})
        if not texte:
            raise RefusPoli(t("Empty reply.", "Réponse vide.", langue=langue))
        reponse = compte.ussd_repondre(texte)
        self._noter_session(compte)
        self._relever_solde(compte, reponse)
        return reponse

    def _noter_session(self, compte):
        self._session = ({"compte": compte, "vie": time.time()}
                         if compte.session_ouverte else None)

    def _relever_solde(self, compte, reponse):
        """Si le réseau vient d'annoncer un solde, la base le reflète tout de
        suite : c'est exactement ce que « consulter le solde » venait chercher."""
        try:
            solde = solde_annonce(reponse or "")
            if solde is not None and compte.carte.identifiee:
                self.nuage.publier_solde(compte.carte.iccid, solde)
        except Exception:
            pass    # un solde non relevé n'est pas une panne de session


class RefusPoli(Exception):
    """Un refus expliqué au propriétaire — pas une panne du robot."""
