# -*- coding: utf-8 -*-
"""Client Telegram (longue interrogation), sans dépendance externe.

Apports par rapport à un simple `sendMessage` :
  - claviers en ligne (boutons) et édition d'un message en place ;
  - mode HTML, découpage automatique des messages trop longs ;
  - envoi de fichiers (export CSV) ;
  - conversation privée **et** groupe d'équipe, avec sujets (forum) ;
  - rôles : seuls les administrateurs peuvent piloter la SIM ;
  - respect des limites de débit (429 / retry_after) ;
  - au démarrage, le retard accumulé est jeté : le robot ne rejoue jamais
    une vieille commande après un redémarrage.
"""

import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from .entrant import Entrant
from .mise_en_forme import brut


class ErreurConflit(Exception):
    """Un autre processus interroge Telegram avec le même jeton."""

LIMITE_MESSAGE = 3900     # Telegram coupe à 4096 : on garde une marge
ADMIN, OBSERVATEUR = "admin", "observateur"

# Telegram tolère environ 1 message par seconde et par conversation, et 30 par
# seconde tous chats confondus. Au-delà il répond 429 et bloque le robot
# pendant plusieurs dizaines de secondes — le temps qu'une rafale de SMS
# d'encaissement soit perdue. On s'auto-limite plutôt que d'aller au mur.
INTERVALLE_PAR_CHAT = 1.05
INTERVALLE_GLOBAL = 1 / 25


class TransportTelegram:
    def __init__(self, jeton, chat_id, groupe=None, admins=(), sujets=None):
        self.base = f"https://api.telegram.org/bot{jeton}"
        self.chat_id = int(chat_id)
        self.groupe = int(groupe) if groupe else None
        self.admins = {int(a) for a in admins} or {self.chat_id}
        self.sujets = sujets or {}
        self.chats_autorises = {self.chat_id}
        if self.groupe:
            self.chats_autorises.add(self.groupe)
        self.decalage = 0
        self.conflit = False           # un autre robot utilise le même jeton
        self._verrou_debit = threading.Lock()
        self._dernier_envoi = {}       # chat → horodatage du dernier message
        self._dernier_envoi_global = 0.0

    # ---- appels bas niveau -------------------------------------------------
    def _patienter(self, chat, par_chat=True):
        """Espace les envois pour rester sous les limites de Telegram.

        `par_chat=False` pour les modifications d'un message existant : elles
        sont moins sévèrement limitées, et imposer une seconde entre deux
        appuis rendrait le pavé du code secret pénible à utiliser."""
        with self._verrou_debit:
            maintenant = time.monotonic()
            attente = self._dernier_envoi_global + INTERVALLE_GLOBAL - maintenant
            if par_chat:
                attente = max(attente, self._dernier_envoi.get(chat, 0)
                              + INTERVALLE_PAR_CHAT - maintenant)
            if attente > 0:
                time.sleep(attente)
                maintenant = time.monotonic()
            if par_chat:
                self._dernier_envoi[chat] = maintenant
            self._dernier_envoi_global = maintenant

    def _appel(self, methode, delai=15, **params):
        for essai in range(3):
            try:
                donnees = urllib.parse.urlencode(
                    {k: v for k, v in params.items() if v is not None}).encode()
                req = urllib.request.Request(f"{self.base}/{methode}", data=donnees)
                with urllib.request.urlopen(req, timeout=delai) as rep:
                    # Le conflit porte sur l'INTERROGATION : seule une
                    # interrogation réussie peut le déclarer terminé. Le lever
                    # sur n'importe quel appel réussi était un piège — le
                    # message d'alerte lui-même effaçait le drapeau qui
                    # l'avait déclenché, et l'alerte repartait au tour
                    # suivant, indéfiniment.
                    if methode == "getUpdates":
                        self.conflit = False
                    return json.loads(rep.read().decode())
            except urllib.error.HTTPError as e:
                if e.code == 409:
                    # Deux robots interrogent le même jeton : chacun coupe
                    # l'autre et les commandes se perdent au hasard.
                    self.conflit = True
                    raise ErreurConflit(
                        "Telegram refuse l'interrogation : un autre programme "
                        "utilise le même jeton, ou un webhook est déclaré.")
                attente = self._retry_after(e)
                if attente is None or essai == 2:
                    raise
                time.sleep(attente)
        return {}

    @staticmethod
    def _retry_after(erreur):
        """Renvoie le délai imposé par Telegram (429), sinon None."""
        if erreur.code != 429:
            return None
        try:
            corps = json.loads(erreur.read().decode())
            return min(int(corps["parameters"]["retry_after"]) + 1, 60)
        except Exception:
            return 3

    @staticmethod
    def _clavier(boutons):
        """boutons = [[(libellé, donnée), …], …] → JSON attendu par Telegram."""
        if boutons is None:
            return None
        return json.dumps({"inline_keyboard": [
            [{"text": libelle, "callback_data": donnee} for libelle, donnee in ligne]
            for ligne in boutons
        ]})

    def _destination(self, canal):
        """canal : None/'prive', 'encaissements', 'alertes', ou un chat_id."""
        if isinstance(canal, int):
            return canal, None
        if canal in ("encaissements", "alertes", "console"):
            return (self.groupe or self.chat_id), self.sujets.get(canal)
        return self.chat_id, None

    # ---- envoi -------------------------------------------------------------
    def envoyer(self, texte, boutons=None, canal=None, silencieux=False):
        """Envoie (en découpant si besoin) et renvoie l'id du dernier message."""
        chat, sujet = self._destination(canal)
        morceaux = self._decouper(texte)
        dernier = None
        for i, morceau in enumerate(morceaux):
            final = i == len(morceaux) - 1
            rep = self._envoyer_un(
                chat, sujet, morceau, silencieux,
                self._clavier(boutons) if final else None)
            if rep is not None:
                dernier = (rep.get("result") or {}).get("message_id")
        return dernier

    def _envoyer_un(self, chat, sujet, texte, silencieux, clavier):
        """Un message, avec repli en texte brut si la mise en forme échoue.

        Un SMS d'opérateur peut contenir n'importe quoi ; si le balisage part
        de travers, Telegram refuse le message avec un 400. Mieux vaut un
        message sans gras qu'un encaissement jamais annoncé."""
        for texte_a_envoyer, mode in ((texte, "HTML"), (brut(texte), None)):
            try:
                self._patienter(chat)
                return self._appel(
                    "sendMessage", chat_id=chat, text=texte_a_envoyer,
                    parse_mode=mode, message_thread_id=sujet,
                    disable_notification="true" if silencieux else None,
                    reply_markup=clavier)
            except ErreurConflit:
                raise
            except urllib.error.HTTPError as e:
                if e.code != 400:
                    time.sleep(2)
                    return None
                # 400 : on retente une fois sans mise en forme.
            except Exception:
                time.sleep(2)
                return None
        return None

    def modifier(self, message_id, texte, boutons=None, canal=None):
        """Réécrit un message existant : la session USSD tient sur une seule
        carte qui se met à jour, au lieu d'empiler des dizaines de messages."""
        if not message_id:
            return False
        chat, _ = self._destination(canal)
        for texte_a_envoyer, mode in ((texte, "HTML"), (brut(texte), None)):
            try:
                self._patienter(chat, par_chat=False)
                self._appel("editMessageText", chat_id=chat, message_id=message_id,
                            text=texte_a_envoyer[:LIMITE_MESSAGE], parse_mode=mode,
                            reply_markup=self._clavier(boutons))
                return True
            except urllib.error.HTTPError as e:
                if e.code != 400:
                    return False
            except Exception:
                return False
        return False

    def retirer_boutons(self, message_id, canal=None):
        """Désarme un ancien clavier pour qu'il ne soit plus cliquable."""
        if not message_id:
            return
        chat, _ = self._destination(canal)
        try:
            self._appel("editMessageReplyMarkup", chat_id=chat, message_id=message_id)
        except Exception:
            pass

    def supprimer(self, message_id, canal=None):
        """Efface un message du chat (utilisé pour les PIN tapés à la main).
        En groupe, cela suppose que le robot y est administrateur."""
        chat, _ = self._destination(canal)
        try:
            self._appel("deleteMessage", chat_id=chat, message_id=message_id)
        except Exception:
            pass  # droit expiré après 48 h, ou pas administrateur : non bloquant

    def accuser(self, callback_id, texte=""):
        """Répond au clic : sans cela le bouton tourne pendant 30 s."""
        if not callback_id:
            return
        try:
            self._appel("answerCallbackQuery", callback_query_id=callback_id,
                        text=texte or None)
        except Exception:
            pass

    def envoyer_fichier(self, nom, contenu, legende="", canal=None,
                        type_mime="text/csv"):
        """Envoie un document (multipart, écrit à la main : zéro dépendance)."""
        chat, sujet = self._destination(canal)
        limite = "----totem" + str(len(contenu))
        champs = {"chat_id": str(chat), "caption": legende, "parse_mode": "HTML"}
        if sujet:
            champs["message_thread_id"] = str(sujet)
        corps = b""
        for cle, valeur in champs.items():
            corps += (f"--{limite}\r\nContent-Disposition: form-data; name=\"{cle}\""
                      f"\r\n\r\n{valeur}\r\n").encode()
        corps += (f"--{limite}\r\nContent-Disposition: form-data; name=\"document\";"
                  f" filename=\"{nom}\"\r\nContent-Type: {type_mime}\r\n\r\n").encode()
        corps += contenu + f"\r\n--{limite}--\r\n".encode()
        req = urllib.request.Request(
            f"{self.base}/sendDocument", data=corps,
            headers={"Content-Type": f"multipart/form-data; boundary={limite}"})
        try:
            with urllib.request.urlopen(req, timeout=60) as rep:
                return json.loads(rep.read().decode()).get("ok", False)
        except Exception:
            return False

    def publier_commandes(self, commandes):
        """Déclare le menu « / » : les commandes deviennent cliquables dans
        l'application Telegram, plus besoin de les retenir."""
        try:
            self._appel("setMyCommands", commands=json.dumps(
                [{"command": c, "description": d} for c, d in commandes]))
            self._appel("setChatMenuButton", chat_id=self.chat_id,
                        menu_button=json.dumps({"type": "commands"}))
        except Exception:
            pass

    # ---- réception ---------------------------------------------------------
    def vider_backlog(self):
        """Jette les messages arrivés pendant que le robot était éteint : sinon
        un redémarrage rejouerait d'anciennes commandes (et d'anciens USSD).

        Au passage, on supprime un éventuel webhook : tant qu'il en existe un,
        Telegram REFUSE toute interrogation (erreur 409) et le robot semble
        sourd sans qu'aucune autre instance ne tourne. C'est une cause de
        conflit bien plus courante qu'un second processus."""
        try:
            self._appel("deleteWebhook", delai=10, drop_pending_updates="true")
        except Exception:
            pass
        try:
            rep = self._appel("getUpdates", delai=20, offset=-1, timeout=0)
            majs = rep.get("result", [])
            if majs:
                self.decalage = majs[-1]["update_id"] + 1
        except Exception:
            pass

    def recevoir(self):
        """Renvoie les `Entrant` autorisés. Bloque jusqu'à 50 s."""
        try:
            rep = self._appel("getUpdates", delai=60, offset=self.decalage,
                              timeout=50,
                              allowed_updates='["message","callback_query"]')
        except ErreurConflit:
            # Inutile d'insister : tant que l'autre instance tourne, les deux
            # se coupent mutuellement. On laisse le robot signaler le problème.
            time.sleep(10)
            return []
        except Exception:
            time.sleep(5)
            return []
        entrants = []
        for maj in rep.get("result", []):
            self.decalage = maj["update_id"] + 1
            entrant = self._lire(maj)
            if entrant is not None:
                entrants.append(entrant)
        return entrants

    def _lire(self, maj):
        clic = maj.get("callback_query")
        msg = clic.get("message", {}) if clic else (maj.get("message") or {})
        chat = msg.get("chat", {}).get("id")
        if chat not in self.chats_autorises:
            return None  # conversation non autorisée : ignorée en silence
        auteur = (clic or msg).get("from", {})
        commun = dict(utilisateur=auteur.get("id", 0),
                      nom=auteur.get("first_name", ""), chat=chat,
                      sujet=msg.get("message_thread_id", 0) or 0)
        if clic:
            return Entrant(texte=clic.get("data", ""), bouton=True,
                           callback_id=clic.get("id", ""),
                           origine_id=msg.get("message_id", 0), **commun)
        if "text" not in msg:
            return None
        return Entrant(texte=msg["text"], message_id=msg.get("message_id", 0), **commun)

    # ---- rôles -------------------------------------------------------------
    def role(self, utilisateur):
        return ADMIN if utilisateur in self.admins else OBSERVATEUR

    @staticmethod
    def _decouper(texte):
        """Coupe sur les sauts de ligne pour rester sous la limite Telegram."""
        if len(texte) <= LIMITE_MESSAGE:
            return [texte]
        morceaux, courant = [], ""
        for ligne in texte.split("\n"):
            if len(courant) + len(ligne) + 1 > LIMITE_MESSAGE:
                morceaux.append(courant or ligne[:LIMITE_MESSAGE])
                courant = ligne[:LIMITE_MESSAGE]
            else:
                courant = f"{courant}\n{ligne}" if courant else ligne
        if courant:
            morceaux.append(courant)
        return morceaux
