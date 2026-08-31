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

# Les TROUS qu'un raccourci peut porter : « *126*1*{numero}*{montant}# ».
# La plateforme les remplit avec ce que le propriétaire vient de saisir, puis
# compose le code entier d'un coup. Le robot connaît la même liste — c'est lui
# qui juge ce qui entre au carnet, jamais l'écran seul.
VARIABLES_RACCOURCI = ("numero", "montant", "point")
RE_VARIABLE = re.compile(r"\{([A-Za-z_]+)\}")

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

        # ON RÉCLAME LA DEMANDE AVANT DE Y TOUCHER, et on n'avance que si on
        # l'a obtenue. C'était un ordre — « mets-la en cours » — envoyé sans
        # jamais regarder s'il avait pris. Deux robots sur le même terminal
        # composaient donc la même demande tous les deux, et sur un transfert
        # c'est deux fois l'argent. Voir `nuage.reclamer`.
        #
        # Perdue ou incertaine : on s'en va, en silence. Un autre l'a prise
        # et la mènera à bien ; ou le nuage est muet, et le tour suivant
        # réessaiera. Ne rien faire se rattrape toujours ; composer deux fois,
        # jamais.
        if not self.nuage.reclamer(identifiant):
            return

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
            elif genre == "raccourci":
                resultat = self._definir_raccourci(parametres, langue)
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

        final = {"etat": etat, "resultat": resultat,
                 "traitee_le": _horodatage()}
        # L'EFFACEMENT DU CODE VOYAGE AVEC LA DERNIÈRE ÉCRITURE, toujours.
        #
        # `_repondre` l'efface déjà, et refuse de composer s'il n'y arrive
        # pas. Mais refuser de composer n'efface rien : après un hoquet du
        # réseau, la ligne restait là avec le code en clair dedans, et plus
        # personne ne repassait pour le retirer.
        #
        # On le remet donc dans l'écriture finale, qui a lieu de toute façon.
        # Deux occasions valent mieux qu'une, et si le nuage est revenu entre
        # les deux — c'est le cas ordinaire, un hoquet dure quelques
        # secondes — le code s'en va avec celle-ci. Réécrire un effacement
        # déjà fait ne coûte rien.
        if parametres.get("secret"):
            final["parametres"] = {"secret": True}
        self.nuage.commande_maj(identifiant, final)

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

    def _definir_raccourci(self, parametres, langue=None):
        """Créer, corriger ou retirer un bouton USSD depuis la plateforme.

        Même carnet que l'apprentissage 💾 : rangé par opérateur dans le
        journal du robot, poussé vers la base, affiché partout. Et les mêmes
        garde-fous que l'apprentissage :

          - la première étape est un CODE (« *126*1# »), les suivantes des
            choix de menu à un ou deux chiffres — jamais un montant, un
            numéro ou le code secret : un bouton mène jusqu'à la question,
            et c'est l'utilisateur qui répond ;
          - rien n'est deviné : c'est le propriétaire qui dicte.

        Un code peut porter des TROUS à remplir — « *126*1*{numero}*
        {montant}# ». La plateforme les remplace par ce que le propriétaire
        vient de saisir, et compose alors le code ENTIER d'un coup : le
        réseau ne pose plus qu'une question, celle du code secret. Sans
        trou, le code ouvre le menu et la plateforme répond aux questions
        une à une. Le code lui-même dit laquelle des deux façons s'applique.
        """
        operateur = str(parametres.get("operateur") or "").strip()[:24]
        cle = re.sub(r"[^a-z0-9_\-]", "",
                     str(parametres.get("cle") or "").lower())[:24]
        if not operateur or not cle:
            raise RefusPoli(t(
                "Which operator, which button? The request is incomplete.",
                "Quel opérateur, quel bouton ? La demande est incomplète.",
                langue=langue))
        if str(parametres.get("action") or "definir") == "supprimer":
            if self.journal.supprimer_raccourci(operateur, cle):
                self.journal.evenement(t(
                    f"remote desk: button “{cle}” removed for {operateur}",
                    f"guichet à distance : bouton « {cle} » retiré "
                    f"pour {operateur}"))
                self._republier_raccourcis()
                return t("Button removed.", "Bouton retiré.", langue=langue)
            raise RefusPoli(t("That button no longer exists.",
                              "Ce bouton n'existe plus.", langue=langue))
        etapes = [str(e).strip() for e in (parametres.get("etapes") or [])
                  if str(e).strip()]
        if not etapes:
            raise RefusPoli(t("No code to save.", "Aucun code à enregistrer.",
                              langue=langue))
        # Chaque trou doit porter un nom connu : un « {montan} » mal tapé
        # partirait tel quel au réseau, et le code échouerait sans qu'on
        # sache pourquoi.
        for etape in etapes:
            for trouve in RE_VARIABLE.finditer(etape):
                if trouve.group(1) not in VARIABLES_RACCOURCI:
                    raise RefusPoli(t(
                        f"Unknown variable “{trouve.group(1)}”: only "
                        "{numero}, {montant} and {point} exist.",
                        f"Variable inconnue « {trouve.group(1)} » : seuls "
                        "{numero}, {montant} et {point} existent.",
                        langue=langue))
        # Le code se juge une fois ses trous bouchés : « *126*1*{numero}# »
        # a la forme d'un code, et c'est cette forme-là qui compte.
        temoin = RE_VARIABLE.sub("0", etapes[0])
        if not re.fullmatch(r"[\*#][\d\*#]{0,60}#", temoin):
            raise RefusPoli(t(
                "The first step must be a USSD code — it starts with * or # "
                "and ends with #.",
                "La première étape doit être un code USSD — il commence par "
                "* ou # et finit par #.", langue=langue))
        for e in etapes[1:]:
            # Une étape est soit un choix de menu, soit UN trou à remplir
            # (« le montant, à cette question-là »). Jamais un nombre long :
            # un bouton s'arrête à la question, il ne rejoue pas un code
            # secret.
            if RE_VARIABLE.fullmatch(e):
                continue
            if not re.fullmatch(r"\d{1,2}", e):
                raise RefusPoli(t(
                    "After the code, only menu choices (one or two digits) "
                    "or one variable: a button stops at the question — never "
                    "an amount, a number or the secret code.",
                    "Après le code, seulement des choix de menu (un ou deux "
                    "chiffres) ou une variable : un bouton s'arrête à la "
                    "question — jamais un montant, un numéro ou le code "
                    "secret.", langue=langue))
        libelle = re.sub(r"\s+", " ",
                         str(parametres.get("libelle") or "")).strip()[:32] or cle
        if not self.journal.ajouter_raccourci(operateur, cle, libelle, etapes):
            raise RefusPoli(t("The button could not be saved.",
                              "Le bouton n'a pas pu être enregistré.",
                              langue=langue))
        self.journal.evenement(t(
            f"remote desk: button “{libelle}” saved for {operateur}",
            f"guichet à distance : bouton « {libelle} » enregistré "
            f"pour {operateur}"))
        self._republier_raccourcis()
        return t(f"Button “{libelle}” saved for {operateur}: "
                 f"{' → '.join(etapes)}",
                 f"Bouton « {libelle} » enregistré pour {operateur} : "
                 f"{' → '.join(etapes)}", langue=langue)

    def _republier_raccourcis(self):
        """Le carnet repart tout de suite vers la base : l'écran qui vient
        d'enregistrer un bouton doit le voir au rafraîchissement suivant."""
        try:
            if hasattr(self.nuage, "publier_raccourcis"):
                self.nuage.publier_raccourcis()
            self.nuage.reveiller()
        except Exception:
            pass    # la boucle de fond repassera

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
            trouves = [c for c in self.comptes
                       if c.libelle.lower().startswith(nom)]
            if len(trouves) > 1:
                # Deux cartes MTN : ce préfixe visait la première en
                # silence. On refuse — l'ICCID, lui, ne se trompe jamais.
                raise RefusPoli(t(
                    f"Several cards answer to “{nom}” — name the card "
                    "itself (its ICCID).",
                    f"Plusieurs cartes répondent à « {nom} » — désignez la "
                    "carte elle-même (son ICCID).", langue=langue))
            if trouves:
                return trouves[0]
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
        # On fige la session dans une variable locale : le fil Telegram peut
        # la remettre à None (ceder) entre le test et la lecture. Sans ce
        # cliché, « self._session["compte"] » lèverait par intermittence.
        session = self._session
        if not session:
            raise RefusPoli(t(
                "No session in progress: dial a code first.",
                "Aucune session en cours : composez d'abord un code.",
                langue=langue))
        compte = session["compte"]
        texte = str(parametres.get("texte") or "")
        if parametres.get("secret"):
            # LE CODE CONFIDENTIEL : effacé de la base AVANT d'être composé.
            # S'il ne devait rester qu'une règle, ce serait celle-là.
            #
            # Et jusqu'ici elle n'était qu'à moitié tenue : l'effacement
            # était DEMANDÉ, jamais VÉRIFIÉ. `commande_maj` rend False quand
            # elle n'a pas abouti — réseau coupé, Supabase en panne — et
            # cette réponse partait à la poubelle. Le code partait alors sur
            # le réseau en laissant sa copie EN CLAIR dans la table des
            # commandes, pour toujours.
            #
            # Ce qu'il faut faire dans ce cas est le contraire de ce qui se
            # faisait : NE PAS COMPOSER. Un transfert manqué se refait d'un
            # geste, et le propriétaire voit le refus tout de suite. Un code
            # confidentiel qui a fui ne se reprend pas — il faut aller le
            # changer chez l'opérateur, en supposant qu'on ait remarqué.
            #
            # (L'essai du dépôt validait ce chemin contre un faux nuage qui
            # répondait toujours oui : il mesurait le cas où il n'y a rien à
            # craindre. C'est l'autre qui compte.)
            if not self.nuage.commande_maj(
                    identifiant, {"parametres": {"secret": True}}):
                raise RefusPoli(t(
                    "The platform is unreachable: your code has NOT been "
                    "dialled, so that no copy of it stays in the database. "
                    "Try again in a moment.",
                    "La plateforme est injoignable : votre code n'a PAS été "
                    "composé, pour qu'aucune copie n'en reste dans la base. "
                    "Réessayez dans un instant.", langue=langue))
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
