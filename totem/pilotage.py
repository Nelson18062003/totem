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

Une seule main sur CHAQUE combiné
---------------------------------
Un modem ne tient qu'une session USSD à la fois. Si une session est déjà
ouverte depuis Telegram, la demande web est refusée poliment — et
inversement, une session web abandonnée se referme seule après deux minutes.

Mais chaque carte a SON modem, son port, son verrou. Le guichet ne tenait
pourtant qu'UNE session pour tout le terminal, et relevait les demandes UNE
par une : quand quelqu'un consultait son solde MTN, celui qui touchait son
Orange au même instant lisait « une autre opération est en cours sur une
autre carte ». Deux personnes, deux cartes, deux modems libres — et une seule
passait. Le guichet tient maintenant une session PAR CARTE, et chaque carte a
sa propre file : ce qui se compose sur l'une n'attend jamais l'autre.

Et la session n'est plus rangée ici. C'est la CARTE qui sait qui tient son
menu, et qui le vérifie sous le verrou de son modem au moment d'écrire (voir
`compte.py`). Le guichet n'a plus de registre à tenir à jour, donc plus de
registre qui puisse mentir.

Qui tient la session ? Pas « le web » : une PERSONNE. La plateforme joint à
chaque demande le sujet de la session qui l'a déposée (« c:12 ») — elle le
pose elle-même, jamais repris de ce que l'écran envoie. Deux personnes sur la
même carte ne se volent donc plus le menu : la seconde attend que la première
ait fini, et la réponse de la première ne peut pas tomber chez la seconde.
"""

import queue
import re
import threading
import time

from datetime import datetime, timedelta

from .analyse_sms import _normaliser, solde_annonce
from .compte import (WEB, TELEGRAM, MenuReferme, ReponseNonRecue,
                     ReponseRefusee, SessionTenue)
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

# Une demande prise en charge et sans nouvelles depuis ce délai a été
# interrompue — coupure de courant, redémarrage, plantage. Cinq minutes
# laissent largement le temps à la plus lente (un reçu à refabriquer) de
# finir. Voir `_abandonner_les_orphelines`.
ORPHELINE_S = 300

# Une file de carte restée sans demande pendant ce délai s'arrête ; la
# prochaine demande pour cette carte en rouvre une.
FILE_AU_REPOS = 60

# La file des demandes qui ne visent aucune carte : actualiser, reçu,
# identité, raccourci — et les gestes d'une application d'avant le ciblage.
FILE_COMMUNE = "terminal"

# UNE DEMANDE QUI COMPOSE NE SE COMPOSE PAS EN RETARD.
#
# Rien ne périmait une demande « en attente ». Le boîtier tombait, l'écran
# pas encore rechargé montrait toujours les gestes, le propriétaire lançait
# un dépôt ; au bout de trente secondes l'écran abandonnait — « le terminal
# n'a pas répondu » — et il croyait l'opération perdue. Au retour du
# boîtier, des heures plus tard parfois, le robot composait le code, numéro
# et montant compris, sur la carte.
#
# Au-delà de ce délai entre le dépôt et la prise, on ne compose plus : la
# demande passe en échec, avec une raison claire, et rien ne part. Le délai
# laisse de la marge à l'écran, qui abandonne au bout de trente secondes.
# L'âge se mesure sur l'horloge de la BASE (voir `nuage.reclamer`).
DEMANDE_PERIMEE_S = 60
# Les demandes qui écrivent sur le réseau de l'opérateur. Les autres
# (actualiser, reçu, identité, bouton, raccrocher) ne déplacent rien :
# raccrocher en retard ne fait courir aucun risque.
QUI_COMPOSENT = ("ussd", "ussd_reponse")


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
        # Le dernier signe de vie de chaque session web, par carte — pour
        # raccrocher celle qu'on a abandonnée. Ce n'est PAS le registre de qui
        # tient quoi : celui-là vit dans la carte (`compte.titulaire`). Une
        # entrée ici dont la carte n'est plus tenue par le web ne compte pas.
        self._vie = {}
        # Les files de travail se touchent depuis plusieurs fils (une file par
        # carte, la boucle de relève) : un seul verrou garde les signes de vie
        # et le registre des files.
        self._garde = threading.RLock()
        self._files = {}            # clé de file → queue.Queue
        self._en_vol = set()        # demandes confiées à une file, pas finies

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
        self._raccrocher_tout()

    # ---- la boucle ---------------------------------------------------------
    def _boucle(self):
        while self._marche:
            try:
                for demande in self.nuage.commandes_en_attente():
                    self._distribuer(demande)
                self._expirer_session()
                self._abandonner_les_orphelines()
            except Exception as e:   # jamais mourir sur une demande
                self.journal.evenement(t(
                    f"remote desk: error {e}",
                    f"guichet à distance : erreur {e}"))
            time.sleep(PAS_SESSION if (self._tenues() or self._en_vol)
                       else self.pause)

    # ---- une file par carte ----------------------------------------------
    #
    # La relève était un seul fil qui exécutait les demandes l'une après
    # l'autre. Or composer un code, c'est attendre le réseau — plusieurs
    # secondes. Même sans refus, la consultation MTN de l'un faisait donc
    # patienter l'Orange de l'autre, sur un modem pourtant libre. Chaque
    # carte a maintenant sa file et son fil : l'ordre est tenu DANS une
    # carte (on ne répond pas à un menu avant de l'avoir ouvert), et rien
    # n'est tenu ENTRE deux cartes, parce que rien ne les lie.

    def _cle_de_file(self, demande):
        iccid = self._iccid_demande(demande.get("parametres") or {})
        return iccid or FILE_COMMUNE

    def _distribuer(self, demande):
        """Confie la demande à la file de sa carte, une fois seulement.

        La demande reste « en attente » dans la base jusqu'à ce que sa file
        la réclame : la relève suivante la revoit donc. `_en_vol` empêche de
        la confier deux fois — et si cela arrivait quand même, la
        réclamation, elle, ne réussit qu'une fois (voir `_traiter`)."""
        identifiant = demande.get("id")
        cle = self._cle_de_file(demande)
        with self._garde:
            if identifiant in self._en_vol:
                return
            self._en_vol.add(identifiant)
            file = self._files.get(cle)
            if file is None:
                file = self._files[cle] = queue.Queue()
                threading.Thread(target=self._servir, args=(cle, file),
                                 daemon=True).start()
            file.put(demande)

    def _servir(self, cle, file):
        """Le fil d'une carte : ses demandes, dans l'ordre, et rien d'autre."""
        while self._marche:
            try:
                demande = file.get(timeout=FILE_AU_REPOS)
            except queue.Empty:
                with self._garde:
                    # Rien n'est arrivé pendant qu'on prenait le verrou ?
                    # Alors la file s'arrête ; la suivante sera neuve.
                    if file.empty():
                        self._files.pop(cle, None)
                        return
                continue
            try:
                self._traiter(demande)
            except Exception as e:   # un fil de carte ne meurt pas non plus
                self.journal.evenement(t(
                    f"remote desk: error {e}",
                    f"guichet à distance : erreur {e}"))
            finally:
                with self._garde:
                    self._en_vol.discard(demande.get("id"))
        with self._garde:
            if self._files.get(cle) is file:
                self._files.pop(cle, None)

    def _abandonner_les_orphelines(self):
        """Les demandes coupées en plein vol ne restent pas en suspens.

        Le robot peut être arrêté entre le moment où il prend une demande et
        celui où il écrit son résultat. La ligne reste alors « en cours »
        pour toujours, et l'écran tourne dans le vide.

        On les marque ÉCHOUÉES, jamais « en attente » : les remettre en file
        les ferait rejouer, alors qu'on ne sait pas si le code a été composé
        avant la coupure. Sur un transfert, c'est le doute qu'il faut lever,
        pas l'argent qu'il faut renvoyer. Le message le dit franchement — le
        propriétaire ira voir son solde, qui fait foi.
        """
        # `_horodatage` attend une date ISO, pas un nombre de secondes : on la
        # lui donne déjà écrite, dans le fuseau du Pi.
        limite = _horodatage(
            (datetime.now() - timedelta(seconds=ORPHELINE_S)).isoformat())
        for demande in self.nuage.commandes_abandonnees(limite):
            self.nuage.commande_maj(demande.get("id"), {
                "etat": "echouee",
                "resultat": t(
                    "The terminal was interrupted while handling this request. "
                    "It may or may not have gone through: check the balance "
                    "before trying again.",
                    "Le terminal a été interrompu pendant cette demande. Elle "
                    "est peut-être passée, peut-être pas : vérifiez le solde "
                    "avant de recommencer."),
                "traitee_le": _horodatage(),
            })
            self.journal.evenement(t(
                "remote desk: request abandoned after an interruption",
                "guichet à distance : demande abandonnée après une coupure"))

    def _expirer_session(self):
        maintenant = time.time()
        for compte in self._tenues():
            titulaire = compte.titulaire
            with self._garde:
                vie = self._vie.get(compte, 0)
            if maintenant - vie <= SESSION_MUETTE:
                continue
            # Raccroché seulement s'il est ENCORE à ce titulaire : entre la
            # lecture et l'écriture, Telegram a pu reprendre la carte.
            if compte.ussd_annuler(qui=titulaire):
                self.journal.evenement(t(
                    f"remote desk: session abandoned, hung up "
                    f"({compte.libelle})",
                    f"guichet à distance : session abandonnée, raccrochée "
                    f"({compte.libelle})"))
            with self._garde:
                self._vie.pop(compte, None)

    # ---- qui tient quoi ----------------------------------------------------
    @staticmethod
    def _qui(parametres):
        """Le titulaire d'une demande : la personne qui l'a déposée.

        `par` est posé par la plateforme (le sujet de la session : « c:12 »,
        « secours »). Une plateforme d'avant n'en met pas : toutes ses
        demandes ont alors le même titulaire, comme autrefois."""
        par = re.sub(r"[^A-Za-z0-9:_-]", "", str(parametres.get("par") or ""))
        return (WEB, par[:40] or None)

    def _tenues(self, qui=None):
        """Les cartes dont un menu est ouvert par le web — par `qui`
        seulement, quand il est donné. Un instantané : la carte, elle,
        revérifie au moment d'écrire."""
        tenues = []
        for c in self.comptes:
            titulaire = getattr(c, "titulaire", None)
            if not (titulaire and c.session_ouverte):
                continue
            if (titulaire == qui) if qui is not None else titulaire[0] == WEB:
                tenues.append(c)
        return tenues

    def _raccrocher_tout(self):
        for compte in self._tenues():
            compte.ussd_annuler(qui=compte.titulaire)
        with self._garde:
            self._vie.clear()

    def _raccrocher(self, iccid, qui, langue=None):
        """Raccroche la session de `qui` sur la carte nommée — et seulement
        elle. Celui qui tient une carte ne raccroche pas l'opération qu'un
        autre mène sur la sienne, ni celle d'un autre sur la même.

        Sans carte nommée (une application d'avant le ciblage), on raccroche
        la session de `qui` s'il n'en tient qu'une. S'il en tient plusieurs,
        on ne devine pas laquelle."""
        if iccid:
            cibles = [c for c in self.comptes if _sur_la_carte(c, iccid)]
        else:
            cibles = self._tenues(qui)
            if len(cibles) > 1:
                raise RefusPoli(t(
                    "Several operations are open on the terminal — say which "
                    "card to hang up.",
                    "Plusieurs opérations sont ouvertes sur le terminal — "
                    "précisez la carte à raccrocher.", langue=langue))
        for compte in cibles:
            compte.ussd_annuler(qui=qui)
            with self._garde:
                self._vie.pop(compte, None)

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
        prise = self.nuage.reclamer(identifiant)
        if not prise:
            return

        reseau = None       # ce que le réseau a dit de la session USSD
        try:
            if genre == "solde":
                resultat = self._republier(langue)
            elif genre == "ussd":
                self._refuser_si_perimee(prise, genre, langue)
                resultat, reseau = self._ouvrir(parametres, langue)
            elif genre == "ussd_reponse":
                resultat, reseau = self._repondre(identifiant, parametres,
                                                  langue, prise=prise)
            elif genre == "ussd_fin":
                self._raccrocher(self._iccid_demande(parametres),
                                 self._qui(parametres), langue)
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

        # Un 0x00 fait refuser TOUTE l'écriture par la base (text comme
        # jsonb) : la demande restait « en cours » pour toujours.
        if isinstance(resultat, str) and "\x00" in resultat:
            resultat = resultat.replace("\x00", "\ufffd")
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
            final["parametres"] = self._parametres_masques(parametres)
        # CE QUE LE RÉSEAU A DIT voyage dans les paramètres, pas dans une
        # colonne : une colonne absente d'une base pas encore migrée ferait
        # échouer TOUTE l'écriture — la réponse avec. Une clé de plus dans
        # un objet ne casse rien ; un écran d'avant l'ignore.
        if reseau and etat == "faite":
            base = final.get("parametres", parametres)
            final["parametres"] = {**base, "reseau": reseau}
        self.nuage.commande_maj(identifiant, final)

    def _refuser_si_perimee(self, prise, genre, langue=None):
        """Refuse une demande qui compose quand elle a trop attendu, ou quand
        on ne sait pas depuis quand elle attend.

        Dans le doute on ne compose pas : une demande refusée se refait d'un
        geste, un transfert parti des heures trop tard ne se reprend pas."""
        age = getattr(prise, "age", None)
        if age is not None and age <= DEMANDE_PERIMEE_S:
            return
        if age is None:
            self.journal.evenement(t(
                f"remote desk: request of unknown age, not dialled ({genre})",
                f"guichet à distance : demande d'âge inconnu, non composée "
                f"({genre})"))
            raise RefusPoli(t(
                "The terminal cannot tell when this request was made, so it "
                "did not dial it. Nothing was sent — start again.",
                "Le terminal ne sait pas quand cette demande a été faite : il "
                "ne l'a pas composée. Rien n'est parti — recommencez.",
                langue=langue))
        duree = _duree_lisible(age)
        self.journal.evenement(t(
            f"remote desk: request too old, not dialled ({genre}, {duree})",
            f"guichet à distance : demande trop ancienne, non composée "
            f"({genre}, {duree})"))
        raise RefusPoli(t(
            f"This request waited {duree} before reaching the terminal — too "
            "late to dial it safely. Nothing was sent: start again if you "
            "still want it.",
            f"Cette demande a attendu {duree} avant d'arriver au terminal — "
            "trop tard pour la composer sans risque. Rien n'est parti : "
            "recommencez si vous le voulez toujours.", langue=langue))

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
        # Le robot a déposé le document AVANT de répondre (voir
        # `Robot._recu_apres_coup`) : la réponse dit ce qui est vrai
        # maintenant. TROIS phrases, et l'écran choisit sa réaction sur la
        # phrase (voir `etatDeLaReponseRecu` dans le noyau) — jamais en
        # comparant des numéros : un document refait garde le sien. Le
        # numéro figure dans les trois : l'écran l'y lit.
        etat = getattr(numero, "etat", None)
        if etat is None:
            en_place = getattr(self.journal, "recu_en_place", None)
            etat = "depose" if en_place and en_place(source_id) else None
        if etat == "inchange":
            return t(f"Receipt {numero} already up to date: nothing has "
                     "changed, it can be shared now.",
                     f"Reçu {numero} déjà à jour : rien n'a changé, il se "
                     "partage dès maintenant.", langue=langue)
        if etat == "depose":
            return t(f"Receipt {numero} is ready: it can be shared now.",
                     f"Reçu {numero} prêt : il se partage dès maintenant.",
                     langue=langue)
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

    @staticmethod
    def _iccid_demande(parametres):
        return re.sub(r"\D", "", str(parametres.get("carte") or ""))

    @classmethod
    def _parametres_masques(cls, parametres):
        """Ce qui reste d'une réponse secrète une fois le code effacé : le
        drapeau, et LA CARTE.

        On écrivait `{"secret": True}` tout court, ce qui effaçait la carte
        avec le code. Or c'est la carte qui dit, sur la plateforme, À QUI la
        demande appartient : celui à qui elle est confiée tapait son code
        secret, l'opération passait… et il ne pouvait plus lire la réponse
        du réseau — « demande introuvable » sur sa propre carte. Un ICCID
        n'a rien de secret : il est imprimé sur la puce."""
        masques = {"secret": True}
        iccid = cls._iccid_demande(parametres)
        if iccid:
            masques["carte"] = iccid
        return masques

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
        qui = self._qui(parametres)
        # UNE CARTE, UN MENU — MAIS UN PAR CARTE, PAS UN PAR TERMINAL.
        #
        # Le guichet ne tenait qu'une session pour tout le terminal. Ouvrir
        # raccrochait d'abord la précédente, quelle qu'elle soit — couper un
        # autre en plein transfert ; puis on a refusé à la place : « une
        # autre opération est en cours, sur une autre carte ». Les deux
        # partaient de la même idée fausse, un seul combiné pour le terminal.
        # Il y en a un par carte : ce qui se passe sur une autre carte ne
        # change rien ici.
        #
        # Sur CETTE carte, on remplace son propre menu précédent, et on
        # refuse celui d'un autre — Telegram (un humain est au bout du fil)
        # ou une autre personne de la plateforme. C'est la carte qui tranche,
        # sous le verrou de son modem (`si_libre`) : entre un contrôle fait
        # ici et la composition, quelqu'un aurait pu prendre la ligne.
        if compte.tenue_par(qui):
            compte.ussd_annuler(qui=qui)
        try:
            reponse = compte.ussd_demarrer(code, qui=qui, si_libre=True)
        except SessionTenue as tenue:
            raise RefusPoli(self._expliquer_tenue(tenue.titulaire, langue))
        except ReponseRefusee as refus:
            raise RefusPoli(_caracteres_refuses(refus, langue))
        except ReponseNonRecue:
            self._journaliser_composition(code, compte)
            return self._peut_avoir_abouti(compte, langue)
        self._journaliser_composition(code, compte)
        self._noter_session(compte, qui)
        self._relever_solde(compte, reponse)
        return reponse, self._etat_du_reseau(compte, qui)

    def _journaliser_composition(self, code, compte):
        """Le journal « Ce qui s'est passé » se garde longtemps et se lit à
        plusieurs : il reçoit le service composé, jamais le numéro du
        bénéficiaire ni le montant que le raccourci y a placés."""
        lisible = code_pour_le_journal(code)
        self.journal.evenement(t(
            f"remote desk: {lisible} ({compte.libelle})",
            f"guichet à distance : {lisible} ({compte.libelle})"))

    @staticmethod
    def _etat_du_reseau(compte, qui):
        """Ce que le RÉSEAU a dit de la session (+CUSD: 1 — il attend une
        réponse ; 0 ou 2 — il a fermé), tel que la carte l'a noté.

        L'écran le devinait sur le texte, et devinait mal : « Confirm: Float
        Transfer … 00. Next » ne pose aucune question, et il l'affichait
        « Terminé » sur une session que le réseau tenait encore ouverte —
        la suite (« Confirmer », puis le code secret) ne venait qu'en tapant
        « 00 » à l'aveugle. Le boîtier, lui, SAIT : il le dit."""
        return "attend" if compte.tenue_par(qui) else "fini"

    @staticmethod
    def _expliquer_tenue(titulaire, langue=None):
        if titulaire and titulaire[0] == TELEGRAM:
            return t(
                "A session is already open on Telegram for this card. "
                "Finish it there, then try again here.",
                "Une session est déjà ouverte sur Telegram pour cette carte. "
                "Terminez-la, puis recommencez ici.", langue=langue)
        return t(
            "Someone else is using this card right now (a card holds one "
            "USSD menu at a time). Try again in a moment.",
            "Quelqu'un d'autre utilise cette carte en ce moment (une carte "
            "ne tient qu'un menu USSD à la fois). Réessayez dans un instant.",
            langue=langue)

    def _repondre(self, identifiant, parametres, langue=None, prise=None):
        texte = str(parametres.get("texte") or "")
        # L'EFFACEMENT D'ABORD, LE REFUS ENSUITE.
        #
        # Cet effacement venait APRÈS le contrôle de session. Or c'est
        # précisément quand la session a disparu que la commande est refusée :
        # coupure de courant à Douala et robot redémarré (les sessions repartent
        # TOUJOURS vides), session expirée, main rendue à Telegram. Le code
        # secret était alors refusé ET conservé — en clair, dans la base, pour
        # toujours, sans même avoir été composé. Le pire des deux mondes, et
        # sur la panne la plus banale de toutes.
        #
        # On efface donc avant de juger quoi que ce soit d'autre : un refus
        # n'est jamais une raison de garder un code secret.
        if parametres.get("secret"):
            # Le code confidentiel : effacé de la base AVANT d'être composé.
            # S'il ne devait rester qu'une règle, ce serait celle-là — alors
            # on VÉRIFIE que l'effacement a pris. « commande_maj » rend faux
            # si le nuage n'a pas répondu (une coupure à Douala, justement) ;
            # l'ignorer laissait le code EN CLAIR dans le nuage, pour
            # toujours, pendant qu'on le composait quand même. On réessaie ;
            # et si l'effacement ne prend pas, on REFUSE de composer. Mieux
            # vaut une opération échouée, à reprendre, qu'un code secret qui
            # traîne dans la base.
            efface = False
            for _ in range(3):
                if self.nuage.commande_maj(
                        identifiant,
                        {"parametres": self._parametres_masques(parametres)}):
                    efface = True
                    break
                time.sleep(0.5)
            if not efface:
                raise RefusPoli(t(
                    "The secret code could not be secured — it was not "
                    "dialled. Check the connection and try again.",
                    "Le code secret n'a pas pu être sécurisé — il n'a pas "
                    "été composé. Vérifiez la connexion, puis réessayez.",
                    langue=langue))
        # Trop vieille pour partir : jugé APRÈS l'effacement, comme tout refus.
        self._refuser_si_perimee(prise, "ussd_reponse", langue)
        # À QUI EST LA RÉPONSE. Quand la demande nomme sa carte, c'est elle ;
        # la carte refusera d'écrire si son menu n'est pas à `qui` — sinon ce
        # chiffre, peut-être un code secret, tomberait dans le menu qu'une
        # autre personne parcourt.
        qui = self._qui(parametres)
        iccid = self._iccid_demande(parametres)
        if iccid:
            compte = next((c for c in self.comptes if _sur_la_carte(c, iccid)),
                          None)
            if compte is None or not compte.tenue_par(qui):
                raise RefusPoli(t(
                    "The open session is not on this card — dial the code "
                    "again.",
                    "La session ouverte n'est pas sur cette carte — "
                    "recomposez le code.", langue=langue))
        else:
            # Une application d'avant le ciblage : la session de `qui`, s'il
            # n'en tient qu'une. Plusieurs : on ne devine pas — deviner,
            # c'est envoyer un code secret chez quelqu'un d'autre.
            tenues = self._tenues(qui)
            if not tenues:
                raise RefusPoli(t(
                    "No session in progress: dial a code first.",
                    "Aucune session en cours : composez d'abord un code.",
                    langue=langue))
            if len(tenues) > 1:
                raise RefusPoli(t(
                    "Several operations are open on the terminal — this "
                    "reply does not say which card it is for. Dial the code "
                    "again.",
                    "Plusieurs opérations sont ouvertes sur le terminal — "
                    "cette réponse ne dit pas pour quelle carte. Recomposez "
                    "le code.", langue=langue))
            compte = tenues[0]
        if not texte:
            raise RefusPoli(t("Empty reply.", "Réponse vide.", langue=langue))
        try:
            # LA vérification qui compte : sous le verrou du modem, au moment
            # d'écrire. Celle d'au-dessus ne sert qu'à bien dire le refus.
            reponse = compte.ussd_repondre(texte, qui=qui)
        except SessionTenue:
            raise RefusPoli(t(
                "This menu is no longer yours (it closed, or was taken back) "
                "— nothing was sent. Dial the code again.",
                "Ce menu n'est plus le vôtre (il s'est refermé, ou a été "
                "repris) — rien n'a été envoyé. Recomposez le code.",
                langue=langue))
        except MenuReferme:
            # Le réseau avait refermé le menu pendant qu'on lisait : la
            # réponse — peut-être le code secret — n'est PAS partie.
            with self._garde:
                self._vie.pop(compte, None)
            raise RefusPoli(t(
                "The operator closed this menu before your reply — nothing "
                "was sent. Dial the code again.",
                "L'opérateur a refermé ce menu avant votre réponse — rien "
                "n'est parti. Recomposez le code.", langue=langue))
        except ReponseRefusee as refus:
            # Rien n'est écrit au réseau. L'écran va conclure : on raccroche
            # pour que la carte ne reste pas sur un menu que personne ne voit.
            compte.ussd_annuler(qui=qui)
            with self._garde:
                self._vie.pop(compte, None)
            raise RefusPoli(_caracteres_refuses(refus, langue))
        except ReponseNonRecue:
            return self._peut_avoir_abouti(compte, langue)
        self._noter_session(compte, qui)
        self._relever_solde(compte, reponse)
        return reponse, self._etat_du_reseau(compte, qui)

    def _peut_avoir_abouti(self, compte, langue=None):
        """La demande est PARTIE, et le réseau ne l'a pas confirmée à temps.

        « Le terminal n'a pas pu faire » était faux : le code secret était
        déjà chez l'opérateur, et MTN répond parfois en trente-cinq secondes
        sur la 3G de Douala. Le propriétaire recommençait le dépôt — qui
        partait deux fois. Ce n'est ni un échec ni une réussite : on dit ce
        qu'on sait, et où regarder. La carte a raccroché (voir
        `Compte._echanger`), le réseau dit donc « fini »."""
        with self._garde:
            self._vie.pop(compte, None)
        self.journal.evenement(t(
            f"remote desk: sent, no reply from the network in time "
            f"({compte.libelle})",
            f"guichet à distance : parti, sans réponse du réseau à temps "
            f"({compte.libelle})"))
        return t(
            "Your request went out, but the network did not answer in time: "
            "it may have gone through. Check your SMS before trying again.",
            "Votre demande est partie, mais le réseau n'a pas répondu à "
            "temps : elle a pu aboutir. Regardez vos SMS avant de "
            "recommencer.", langue=langue), "fini"

    def _noter_session(self, compte, qui):
        with self._garde:
            if compte.tenue_par(qui):
                self._vie[compte] = time.time()
            else:
                self._vie.pop(compte, None)

    def _relever_solde(self, compte, reponse):
        """Si le réseau vient d'annoncer un solde, la base le reflète tout de
        suite : c'est exactement ce que « consulter le solde » venait chercher."""
        try:
            if solde_douteux(reponse or ""):
                return
            solde = solde_annonce(reponse or "")
            if solde is not None and compte.carte.identifiee:
                self.nuage.publier_solde(compte.carte.iccid, solde)
        except Exception:
            pass    # un solde non relevé n'est pas une panne de session


# UN SOLDE QUI N'EST PAS CELUI DU PORTE-MONNAIE. Chaque écran USSD passait
# par `_relever_solde` : « Solde commission: 2500 FCFA » devenait le solde de
# la carte à l'accueil, daté d'aujourd'hui — et l'on remet de l'argent sur la
# foi de ce chiffre. Dans le doute, on ne publie rien : le vrai relevé de
# solde reviendra.
RE_SOLDE_QUALIFIE = re.compile(
    r"\b(?:solde|balance)\s+(?:de\s+|du\s+|des\s+|d\s*)?"
    r"(?:commission|bonus|epargne|pret|credit|internet|data|airtime|sms"
    r"|appel|a\s+rembourser|savings|loan)")
RE_AUTRE_COMPTE = re.compile(
    r"\b(?:pret|loan|epargne|savings|internet|forfait|data|valid\s+until"
    r"|valable\s+jusqu|expire)")


def solde_douteux(texte):
    """Ce texte parle-t-il d'un autre solde que celui du porte-monnaie ?"""
    norme = _normaliser(texte or "")
    return bool(RE_SOLDE_QUALIFIE.search(norme) or RE_AUTRE_COMPTE.search(norme))


RE_SEGMENT_CODE = re.compile(r"[^*#]+")


def code_pour_le_journal(code):
    """Le code composé, tel que le journal peut le garder.

    Le service reste lisible (« *126*9* »), mais toute suite de quatre
    chiffres ou plus — un numéro, un montant, parfois un code secret collé
    en fin de raccourci — devient « … ». Le premier segment, le numéro du
    service, n'est jamais masqué : « *8001# » se lit."""
    premier = [True]

    def masquer(m):
        if premier[0]:
            premier[0] = False
            return m.group(0)
        return "…" if sum(c.isdigit() for c in m.group(0)) >= 4 else m.group(0)

    return RE_SEGMENT_CODE.sub(masquer, code or "")


def _caracteres_refuses(refus, langue=None):
    vus = " ".join(f"« {c} »" for c in refus.caracteres)
    return t(
        f"This reply contains characters the operator's network cannot "
        f"receive ({vus}) — nothing was sent. Type it again with ordinary "
        f"letters and digits.",
        f"Cette réponse contient des caractères que le réseau de "
        f"l'opérateur ne reçoit pas ({vus}) — rien n'est parti. Retapez-la "
        f"avec des lettres et des chiffres ordinaires.", langue=langue)


def _sur_la_carte(compte, iccid):
    return bool(compte.carte.identifiee and compte.carte.iccid == iccid)


def _duree_lisible(secondes):
    """« 45 s », « 3 min », « 5 h » — la même écriture dans les deux langues."""
    s = int(round(secondes))
    if s < 120:
        return f"{s} s"
    if s < 2 * 3600:
        return f"{s // 60} min"
    return f"{s // 3600} h"


class RefusPoli(Exception):
    """Un refus expliqué au propriétaire — pas une panne du robot."""
