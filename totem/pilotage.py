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
from .nuage import _horodatage

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
                self.journal.evenement(f"guichet à distance : erreur {e}")
            time.sleep(PAS_SESSION if self._session else self.pause)

    def _expirer_session(self):
        if self._session and time.time() - self._session["vie"] > SESSION_MUETTE:
            self.journal.evenement(
                "guichet à distance : session abandonnée, raccrochée")
            self._raccrocher()

    def ceder(self, compte):
        """Telegram reprend la main sur ce compte : on lâche notre session.

        Sans ça, la nôtre resterait ouverte dans nos livres alors que
        l'opérateur, lui, en a ouvert une autre. La réponse suivante venue de
        la plateforme partirait dans un menu qui a bougé — et cette réponse
        peut être un code secret. Le refus poli vaut infiniment mieux.
        """
        if self._session and self._session["compte"] is compte:
            self.journal.evenement(
                "guichet à distance : session reprise depuis Telegram")
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
        self.nuage.commande_maj(identifiant, {"etat": "en_cours"})

        try:
            if genre == "solde":
                resultat = self._republier()
            elif genre == "ussd":
                resultat = self._ouvrir(parametres)
            elif genre == "ussd_reponse":
                resultat = self._repondre(identifiant, parametres)
            elif genre == "ussd_fin":
                self._raccrocher()
                resultat = "Session refermée."
            elif genre == "recu":
                resultat = self._etablir_recu(parametres)
            elif genre == "identite":
                resultat = self._definir_identite(parametres)
            else:
                raise ValueError(f"demande inconnue : {genre}")
            etat = "faite"
        except RefusPoli as r:
            etat, resultat = "echouee", str(r)
        except Exception as e:
            etat, resultat = "echouee", f"Le terminal n'a pas pu faire : {e}"
            self.journal.evenement(f"guichet à distance : échec ({genre})")

        self.nuage.commande_maj(identifiant, {
            "etat": etat, "resultat": resultat, "traitee_le": _horodatage()})

    def _etablir_recu(self, parametres):
        """Le reçu d'un message passé, refabriqué depuis le SMS d'origine.

        Rien n'est inventé : si le message ne donne pas droit à un reçu
        (publicité, code à usage unique, échec), le refus est explicite.
        """
        if not self.programmeur:
            raise RefusPoli("Ce terminal ne fabrique pas de reçus.")
        try:
            source_id = int(parametres.get("source_id"))
        except (TypeError, ValueError):
            raise RefusPoli("Message introuvable au journal.")
        numero = self.programmeur(source_id)
        if not numero:
            raise RefusPoli(
                "Ce message ne donne pas droit à un reçu — seuls un transfert "
                "réussi ou un solde annoncé en produisent un.")
        self.journal.evenement(f"guichet à distance : reçu {numero} demandé")
        return (f"Reçu {numero} en fabrication : il sera archivé et "
                "téléchargeable dans un instant.")

    def _definir_identite(self, parametres):
        """Inscrit le numéro et/ou le nom d'une carte depuis la plateforme,
        exactement comme /reglages sur Telegram.

        C'est ce numéro qui dira, ensuite, de quel côté d'un dépôt ou d'un
        transfert se trouve le terminal : sans lui, un dépôt reste affiché
        sans savoir s'il sort ou entre. Les mêmes contrôles qu'au clavier
        Telegram, car cette valeur devient une source de vérité."""
        iccid = str(parametres.get("iccid") or "").strip()
        if not iccid:
            raise RefusPoli("Aucune carte visée.")
        champs = {}
        if parametres.get("numero") is not None:
            chiffres = re.sub(r"\D", "", str(parametres.get("numero")))
            if not 8 <= len(chiffres) <= 15:
                raise RefusPoli("Ce n'est pas un numéro de téléphone.")
            champs["numero"] = chiffres
        if parametres.get("nom") is not None:
            nom = re.sub(r"\s+", " ", str(parametres.get("nom"))).strip()[:40]
            if len(nom) < 2:
                raise RefusPoli("Ce nom est trop court.")
            champs["nom"] = nom
        if not champs:
            raise RefusPoli("Rien à enregistrer.")
        if not self.journal.definir_identite(iccid, **champs):
            raise RefusPoli("Cette carte n'est pas au registre du terminal.")
        self.journal.evenement("guichet à distance : identité de carte modifiée")
        self.nuage.reveiller()      # l'application web le verra tout de suite
        dit = []
        if "numero" in champs:
            dit.append(f"numéro {champs['numero']}")
        if "nom" in champs:
            dit.append(f"nom « {champs['nom']} »")
        return "Enregistré : " + " et ".join(dit) + "."

    def _republier(self):
        """« Actualiser » : l'état des comptes, repoussé à l'instant."""
        self.nuage.publier_comptes(self.comptes)
        self.nuage.enregistrer_terminal()
        return "État du terminal republié."

    def _compte_vise(self, parametres):
        nom = (parametres.get("compte") or "").strip().lower()
        if nom:
            for c in self.comptes:
                if c.libelle.lower().startswith(nom):
                    return c
            raise RefusPoli(f"Aucun compte « {nom} » sur ce terminal.")
        if not self.comptes:
            raise RefusPoli("Aucune carte dans le terminal.")
        return self.comptes[0]

    def _ouvrir(self, parametres):
        code = (parametres.get("code") or "").strip()
        if not code:
            raise RefusPoli("Aucun code à composer.")
        compte = self._compte_vise(parametres)
        # Une session Telegram a la priorité : c'est un humain au bout.
        if compte.session_ouverte and self._session is None:
            raise RefusPoli(
                "Une session est déjà ouverte sur Telegram pour ce compte. "
                "Terminez-la, puis recommencez ici.")
        self._raccrocher()          # notre éventuelle session précédente
        self.journal.evenement(
            f"guichet à distance : {code} ({compte.libelle})")
        reponse = compte.ussd_demarrer(code)
        self._noter_session(compte)
        self._relever_solde(compte, reponse)
        return reponse

    def _repondre(self, identifiant, parametres):
        if not self._session:
            raise RefusPoli(
                "Aucune session en cours : composez d'abord un code.")
        compte = self._session["compte"]
        texte = str(parametres.get("texte") or "")
        if parametres.get("secret"):
            # Le code confidentiel : effacé de la base AVANT d'être composé.
            # S'il ne devait rester qu'une règle, ce serait celle-là.
            self.nuage.commande_maj(
                identifiant, {"parametres": {"secret": True}})
        if not texte:
            raise RefusPoli("Réponse vide.")
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
