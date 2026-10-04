# -*- coding: utf-8 -*-
"""Pont vers Supabase : une copie de ce que le terminal a vu.

Trois principes, dans cet ordre :

  1. **Hors-ligne d'abord.** À Douala l'internet tombe, mais les paiements
     continuent d'arriver. Le journal local reste la source de vérité ; le
     cloud n'est qu'un miroir qui rattrape son retard quand il peut. Une
     panne réseau ne doit jamais faire perdre un SMS ni bloquer le robot.

  2. **Rien en double.** Une ligne renvoyée après une coupure ne doit pas
     créer un second paiement. Chaque ligne porte l'identifiant qu'elle a
     dans le journal local ; couplé au nom du terminal, il rend l'envoi
     rejouable sans risque (contrainte d'unicité côté base).

  3. **Silencieux.** Un cloud injoignable est une situation normale, pas une
     alerte. On note l'incident dans le journal, on réessaiera plus tard, et
     l'utilisateur n'en sait rien.

Aucune dépendance : urllib suffit, et le Pi n'a rien de plus à installer.
"""

import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

from .analyse_sms import analyser, categoriser
from .textes import t
from .version import version

DELAI = 15          # secondes avant d'abandonner une requête
LOT = 100           # lignes envoyées par requête
# LE SIGNE DE VIE a son fil, sa cadence et son délai à lui.
#
# Il partait en tête du tour de transmission, une fois l'échéance passée — et
# ce tour pouvait l'attendre : un réveil par SMS relançait une attente de
# soixante secondes pleines, une requête ratée coûtait quinze secondes, la
# lecture du signal attendait la fin d'une session USSD. L'intervalle entre
# deux signes de vie montait ainsi jusqu'à deux minutes, et un simple hoquet
# d'Internet suffisait à faire paraître « muet » un boîtier bien vivant.
#
# Il part maintenant à heure fixe, dans un fil qui ne fait que ça, avec un
# délai court : un signe de vie qui met quinze secondes à arriver n'en est
# plus un. Et un échec se rattrape dix secondes plus tard, pas une minute.
SIGNE_DE_VIE_DELAI = 5
SIGNE_DE_VIE_REPRISE = 10
# LES CARTES SUIVENT LE SIGNE DE VIE (voir `_battre`) : un petit lot — un
# boîtier porte quelques puces, pas cent — et, s'il n'a pas suivi, trois
# reprises rapides au plus avant de revenir au pas ordinaire.
CARTES_DU_SIGNE = 20
CARTES_REPRISES = 3
# Après un réveil, on laisse une seconde aux arrivées voisines de rejoindre le
# même envoi. Trois SMS reçus coup sur coup partent alors ensemble.
DEBOUNCE = 1
# Combien de téléphones au plus reçoivent une notification. Un propriétaire,
# deux ou trois appareils : la borne n'existe que pour qu'une table qui aurait
# grossi par accident ne fasse pas partir un envoi démesuré.
PAR_ENVOI = 20
# Le compartiment de stockage où atterrissent les reçus PDF. Il est créé par
# sql/schema.sql, en même temps que les tables.
SEAU = "recus"

# Les colonnes sans lesquelles une ligne perd son sens : on ne les retire
# JAMAIS pour forcer un envoi. Tout le reste (categorie, expediteur, emis_le,
# montant…) n'est que de l'enrichissement : si la base ne l'a pas encore, mieux
# vaut enregistrer le SMS sans cette info que de ne rien enregistrer du tout.
# Le texte du SMS, lui, doit toujours passer.
SOCLE = {
    "paiements":  {"terminal", "source_id", "texte", "recu_le"},
    "evenements": {"terminal", "source_id", "texte", "survenu_le"},
    "cartes":     {"terminal", "iccid"},
    "comptes":    {"terminal", "iccid", "libelle"},
}

# PostgREST nomme la colonne absente ainsi : « Could not find the 'expediteur'
# column of 'paiements' in the schema cache ». On en extrait « expediteur ».
_RE_COLONNE_ABSENTE = re.compile(r"the '([^']+)' column")


class Nuage:
    """Envoie le journal local vers Supabase. Inerte si non configuré."""

    def __init__(self, url, cle, terminal, journal, pause=60):
        self.url = (url or "").rstrip("/")
        self.cle = cle or ""
        self.terminal = terminal or "totem"
        self.journal = journal
        self.pause = pause
        # HTTPS, OU RIEN. Cette adresse se tape à la main dans
        # `/boot/firmware/totem.conf`, souvent depuis un PC Windows, sur une
        # partition FAT. Un « http:// » — une faute de frappe, un copier-coller
        # d'un vieux mémo — enverrait la CLÉ DE SERVICE en clair sur le réseau
        # mobile camerounais, toutes les soixante secondes. Cette clé-là
        # contourne toutes les règles d'accès : la lire, c'est pouvoir lire,
        # modifier et effacer le registre entier, et y insérer des commandes
        # que le robot composera sur la carte SIM.
        #
        # L'application du téléphone REFUSE déjà une adresse non chiffrée, à
        # la compilation comme à l'exécution — et elle, elle ne transporte
        # qu'un mot de passe. L'adresse qui porte la clé maîtresse n'avait,
        # elle, aucun garde-fou. On la refuse plutôt que de s'y fier.
        if self.url and not self.url.startswith("https://"):
            # Le « localhost » des essais reste admis : les harnais montent un
            # faux nuage sur la machine même, où rien ne traverse le réseau.
            local = self.url.startswith(("http://127.0.0.1", "http://localhost",
                                         "http://[::1]"))
            if not local:
                if journal is not None:
                    journal.evenement(t(
                        "Cloud address refused: it is not https — the service "
                        "key would travel in the clear. Fix [cloud] url.",
                        "Adresse du cloud refusée : elle n'est pas en https — "
                        "la clé de service voyagerait en clair. Corrigez "
                        "[cloud] url."))
                self.url = ""
        self.actif = bool(self.url and self.cle)
        self.derniere_erreur = None
        # Les numéros de NOS puces, fournis par le robot : c'est ce qui permet
        # de dire de quel côté d'un transfert se trouve le terminal — et donc
        # à la plateforme d'écrire « reçu » plutôt que « sens à confirmer ».
        self.fournir_numeros = None
        # Appelé (source_id, erreur) quand la base REFUSE un paiement : de quoi
        # prévenir le propriétaire sur Telegram, au lieu de l'écarter en
        # silence. Posé par le robot s'il a un transport.
        self.sur_incident = None
        # Colonnes qu'on a déjà découvertes absentes de la base et signalées une
        # fois : on ne réécrit pas le même avis à chaque envoi.
        self._absentes_signalees = set()
        # Le carnet de raccourcis tel qu'il a été poussé la dernière fois :
        # tant qu'il n'a pas bougé, on ne le repousse pas.
        self._raccourcis_publies = None
        self._marche = True
        # Levé dès qu'une ligne entre au journal : le pont n'attend plus le
        # prochain battement pour transmettre ce qu'il sait déjà.
        self._reveil = threading.Event()
        # Levé à l'arrêt : le fil du signe de vie ne dort pas jusqu'au bout.
        self._arret = threading.Event()
        # L'état du Pi (température, disque…), fourni au démarrage.
        self._sante = None
        # Un signe de vie à la fois, et le retard qu'il a annoncé : c'est ce
        # qui permet de republier ce retard quand une poussée l'a changé,
        # sans qu'un signe de vie parti AVANT la poussée n'arrive après elle
        # et ne remette l'ancien chiffre en place.
        self._verrou_signe = threading.RLock()
        self._en_attente_publie = None
        # Un seul envoi de cartes à la fois, quel que soit le fil (voir
        # `pousser_cartes`).
        self._verrou_cartes = threading.Lock()
        # L'heure de la base, la dernière qu'elle a donnée (en-tête « Date »
        # de ses réponses), et l'instant MONOTONE où on l'a lue. Voir
        # `heure_de_la_base`.
        self._heure_base = None
        # Appelé (sans argument) à la fin de chaque tour de transmission, une
        # fois les SMS poussés : le robot y rejoue les sonneries que la
        # coupure a retenues — APRÈS que leurs SMS sont dans la base. Il ne
        # doit rien faire de long : il est appelé depuis le fil des
        # transmissions.
        self.apres_transmission = None

    # ---- requêtes ---------------------------------------------------------
    def _requete(self, methode, chemin, corps=None, entetes=None, delai=DELAI):
        url = f"{self.url}/rest/v1/{chemin}"
        donnees = json.dumps(corps).encode() if corps is not None else None
        req = urllib.request.Request(url, data=donnees, method=methode)
        req.add_header("apikey", self.cle)
        req.add_header("Authorization", f"Bearer {self.cle}")
        req.add_header("Content-Type", "application/json")
        req.add_header("Prefer", "return=minimal")
        for nom, valeur in (entetes or {}).items():
            req.add_header(nom, valeur)
        with urllib.request.urlopen(req, timeout=delai) as rep:
            self._noter_l_heure(rep)
            return rep.status

    def _requete_corps(self, methode, chemin, corps=None, entetes=None):
        """Comme `_requete`, mais on LIT la réponse — et l'heure de la base.

        `_requete` demande « return=minimal » : la base ne dit alors pas
        quelles lignes ont bougé. Pour une prise en charge conditionnelle,
        c'est précisément ce qu'il faut savoir — une liste vide veut dire
        « personne n'a bougé, un autre était là avant toi ».

        Rend `(lignes, heure)` : `heure` est l'en-tête « Date » de la réponse,
        l'horloge du SERVEUR au moment où il a répondu (None s'il n'en met
        pas). C'est elle qui mesure l'âge d'une demande, pas celle du Pi.
        """
        url = f"{self.url}/rest/v1/{chemin}"
        donnees = json.dumps(corps).encode() if corps is not None else None
        req = urllib.request.Request(url, data=donnees, method=methode)
        req.add_header("apikey", self.cle)
        req.add_header("Authorization", f"Bearer {self.cle}")
        req.add_header("Content-Type", "application/json")
        req.add_header("Prefer", "return=representation")
        for nom, valeur in (entetes or {}).items():
            req.add_header(nom, valeur)
        with urllib.request.urlopen(req, timeout=DELAI) as rep:
            heure = self._noter_l_heure(rep)
            return json.loads(rep.read().decode() or "[]"), heure

    def _noter_l_heure(self, reponse):
        """Retient l'heure que la base vient de donner, et la rend (None si
        elle n'en donne pas)."""
        try:
            heure = _heure_de_l_en_tete(reponse.headers.get("Date"))
        except Exception:
            return None
        if heure is not None:
            self._heure_base = (heure, time.monotonic())
        return heure

    def heure_de_la_base(self):
        """L'heure de la base MAINTENANT, ou None si elle ne l'a jamais dite.

        La dernière heure qu'elle a donnée, avancée du temps écoulé depuis sur
        l'horloge MONOTONE du Pi. Ni l'une ni l'autre ne dépend de l'heure
        murale du Pi : après une coupure de courant, celle-ci repart de sa
        dernière sauvegarde, avec des heures de retard, puis saute quand le
        réseau revient. Ce qui se mesure avec elle se mesure faux."""
        if self._heure_base is None:
            return None
        heure, lue_a = self._heure_base
        return heure + timedelta(seconds=time.monotonic() - lue_a)

    def _tenter_insert(self, table, lignes, cle_unicite,
                       resolution="ignore-duplicates", delai=DELAI):
        """Insertion rejouable qui DIT ce qui s'est passé :
          « ok »     — inséré (les doublons sont ignorés ou fusionnés).
          « reseau » — cloud injoignable ou panne passagère (5xx) : on garde
                       tout et on réessaiera le même envoi.
          « schema » — une colonne ESSENTIELLE (le texte du SMS, le terminal…)
                       manque vraiment : là, on garde tout et on alerte.
          « refuse » — la base rejette CETTE ligne pour une valeur qui lui est
                       propre (type invalide, contrainte). On l'écarte pour ne
                       pas bloquer les autres.

        Une colonne d'enrichissement absente (categorie, expediteur, emis_le…)
        ne fait PLUS tout échouer : on la retire de la charge et on réessaie,
        pour que le SMS lui-même arrive quand même. On ne renonce que si c'est
        une colonne du socle qui manque — un vrai défaut de structure. Ainsi,
        même sur une base pas encore migrée, le message s'affiche.

        `resolution` : « ignore-duplicates » pour des lignes immuables (SMS,
        événements), « merge-duplicates » pour un état à rafraîchir (cartes).
        """
        if not lignes:
            return "ok"
        # Copie : on peut retirer des clés sans toucher au journal d'appel.
        lignes = [dict(l) for l in lignes]
        socle = SOCLE.get(table, {"terminal"})
        retirees = []
        for _ in range(32):     # au pire, une passe par colonne d'enrichissement
            try:
                self._requete(
                    "POST", f"{table}?on_conflict={cle_unicite}", lignes,
                    {"Prefer": f"return=minimal,resolution={resolution}"},
                    delai=delai)
                self.derniere_erreur = None
                if retirees:
                    self._signaler_degrade(table, retirees)
                return "ok"
            except urllib.error.HTTPError as e:
                corps = self._lire_corps(e)
                self.derniere_erreur = f"{e.code} {corps}".strip()
                if not 400 <= e.code < 500:
                    return "reseau"
                # UNE CLÉ REFUSÉE N'EST PAS UNE LIGNE REFUSÉE.
                #
                # « refuse » veut dire « cette ligne-là ne passera jamais » :
                # on la met de côté et on la marque envoyée, donc on ne la
                # REPRÉSENTE PLUS JAMAIS. C'est juste pour une ligne malformée.
                # Mais 401 (clé changée ou expirée), 403 (une règle d'accès
                # refuse) et 429 (trop de demandes) ne disent rien de la ligne :
                # ils disent que la PORTE est fermée, pour tout le monde, et
                # que ça se répare. Les classer « refuse » jetait chaque
                # paiement de la journée, définitivement, cent par cycle —
                # pendant que le propriétaire lisait « rien n'est perdu ».
                #
                # Ces trois-là valent donc « reseau » : on s'arrête, on garde
                # tout, et on réessaiera quand la porte sera rouverte.
                if e.code in (401, 403, 429):
                    return "reseau"
                if not self._defaut_de_schema(corps):
                    return "refuse"
                # Défaut de schéma : peut-on sauver le SMS en laissant tomber la
                # colonne fautive ? Oui, sauf si elle est au socle.
                col = self._colonne_absente(corps)
                if col and col not in socle and any(col in l for l in lignes):
                    for l in lignes:
                        l.pop(col, None)
                    retirees.append(col)
                    continue
                return "schema"
            except Exception as e:
                self.derniere_erreur = str(e)
                return "reseau"
        return "schema"

    @staticmethod
    def _colonne_absente(corps):
        """Le nom de la colonne que PostgREST dit introuvable, s'il le donne."""
        m = _RE_COLONNE_ABSENTE.search(corps or "")
        return m.group(1) if m else None

    def _signaler_degrade(self, table, retirees):
        """Note UNE seule fois, au journal, qu'on a enregistré sans certaines
        colonnes absentes de la base. Le SMS est bien là ; il manque juste ces
        informations, que la migration Supabase rétablit. Pas d'alerte Telegram :
        le message est passé, ce n'est pas une panne."""
        nouvelles = set(retirees) - self._absentes_signalees
        if not nouvelles:
            return
        self._absentes_signalees |= nouvelles
        try:
            self.journal.evenement(t(
                f"{table}: the message is saved, but without "
                f"{', '.join(sorted(nouvelles))} — column(s) missing from the "
                f"database. Running the Supabase migration again restores them.",
                f"{table} : le message est enregistré, mais sans "
                f"{', '.join(sorted(nouvelles))} — colonne(s) absente(s) de la "
                f"base. Rejouer la migration Supabase les rétablit."))
        except Exception:
            pass

    def _pousser_lot(self, table, cle_unicite, ids, charge, marquer, sujet,
                     resolution="ignore-duplicates", delai=None):
        """Envoie un lot avec reprise ligne par ligne : les bonnes lignes
        passent, une ligne refusée pour de bon (4xx propre à elle) est écartée
        et signalée, une coupure garde TOUT pour réessayer. Une colonne
        d'enrichissement absente n'arrête plus rien (l'insertion la retire et
        réessaie) ; seul un défaut de structure sur une colonne essentielle
        renvoie « schema », et là on garde tout et on alerte.

        Une seule ligne empoisonnée ne peut donc plus geler toute une file —
        ni pour les paiements, ni pour les événements, ni pour les cartes.
        `marquer(liste_ids)` marque les lignes transmises ; `sujet` les nomme
        dans les messages. `delai` : celui de chaque requête, quand
        l'appelant ne peut pas attendre le délai ordinaire (le fil du signe
        de vie)."""
        en_plus = {} if delai is None else {"delai": delai}
        etat = self._tenter_insert(table, charge, cle_unicite, resolution,
                                   **en_plus)
        if etat == "ok":
            marquer(ids)
            return len(ids)
        if etat == "reseau":
            return 0
        if etat == "schema":
            self._alerter(None)
            return 0
        envoyes = 0
        for id_local, ligne in zip(ids, charge):
            e = self._tenter_insert(table, [ligne], cle_unicite, resolution,
                                    **en_plus)
            if e in ("reseau", "schema"):
                if e == "schema":
                    self._alerter(id_local)
                break
            if e == "refuse":
                self.journal.evenement(t(
                    f"{sujet} {id_local} refused by the cloud, set aside: "
                    f"{self.derniere_erreur}",
                    f"{sujet} {id_local} refusé par le cloud, mis de côté : "
                    f"{self.derniere_erreur}"))
                self._alerter(id_local)
            marquer([id_local])
            if e == "ok":
                envoyes += 1
        return envoyes

    @staticmethod
    def _lire_corps(erreur):
        try:
            return erreur.read().decode("utf-8", "replace")[:300]
        except Exception:
            return ""

    @staticmethod
    def _defaut_de_schema(corps):
        """Colonne ou table absente : PostgREST le signale par PGRST204/205 ou
        par « schema cache » / « could not find ». Réparable, et commun à tout."""
        c = corps.lower()
        return ("pgrst204" in c or "pgrst205" in c
                or "schema cache" in c or "could not find" in c)

    def _alerter(self, source_id):
        if self.sur_incident:
            try:
                self.sur_incident(source_id, self.derniere_erreur)
            except Exception:
                pass

    # ---- envois -----------------------------------------------------------
    def enregistrer_terminal(self, sante=None, delai=DELAI):
        """Annonce le terminal et son état. Sert aussi de signe de vie :
        sans nouvelles, l'application web saura le dire.

        Sans `sante`, on publie l'état COURANT — le retard de transmission
        compté à l'instant, et la santé du Pi. L'« Actualiser » de la
        plateforme appelait cette méthode sans rien, et effaçait ainsi le
        retard et la santé jusqu'au signe de vie suivant."""
        with self._verrou_signe:
            if sante is None:
                sante = self._etat_du_terminal()
            ligne = {
                "id": self.terminal,
                "nom": self.terminal,
                "vu_le": _horodatage(),
                "sante": sante or {},
                # Quelle version tourne réellement sur ce Pi. Sans elle, « le
                # correctif n'existe pas » et « le correctif existe mais n'est
                # pas déployé » se ressemblent exactement, vus de loin.
                "version": version(),
            }
            fait = self._inserer_ou_mettre_a_jour("terminaux", [ligne], "id",
                                                  delai=delai)
            if fait and isinstance(sante, dict) and "en_attente" in sante:
                self._en_attente_publie = sante["en_attente"]
            return fait

    def _etat_du_terminal(self):
        """Ce que le signe de vie porte : le retard, et la santé du Pi.

        Le retard, ce sont les SMS relevés mais pas encore transmis. La
        plateforme peut ainsi dire « je suis en retard » plutôt que de montrer
        une boîte de réception incomplète comme si elle était à jour. On ne
        compte que les SMS : les événements et les cartes, souvent en
        transit, feraient clignoter le bandeau pour rien."""
        info = {}
        try:
            info["en_attente"] = self.journal.sms_en_attente()
        except Exception:
            pass
        if self._sante is not None:
            try:
                resume = self._sante.resume()
            except Exception:
                resume = None
            if resume:
                info["resume"] = resume
        return info

    def _inserer_ou_mettre_a_jour(self, table, lignes, cle_unicite, delai=DELAI):
        if not lignes:
            return True
        try:
            self._requete(
                "POST", f"{table}?on_conflict={cle_unicite}", lignes,
                {"Prefer": "return=minimal,resolution=merge-duplicates"},
                delai=delai)
            self.derniere_erreur = None
            return True
        except Exception as e:
            self.derniere_erreur = str(e)
            return False

    def publier_comptes(self, comptes):
        """État courant des SIM en place : signal, réseau visité, itinérance.

        La clé est l'**ICCID**, pas le libellé : deux SIM MTN successives
        doivent occuper deux lignes distinctes, sans quoi la seconde écraserait
        l'état de la première et leurs historiques se confondraient.
        """
        lignes = []
        for c in comptes:
            if not c.carte.identifiee:
                continue    # sans ICCID, on ne sait pas quelle ligne viser
            try:
                lignes.append({
                    "terminal": self.terminal,
                    "iccid": c.carte.iccid,
                    # « libelle » est NOT NULL côté base : un libellé vide ferait
                    # rejeter TOUT le lot de comptes en silence. On garantit une
                    # valeur, à défaut les 4 derniers chiffres de l'ICCID.
                    "libelle": c.libelle or f"·{c.carte.iccid[-4:]}",
                    "operateur": c.carte.operateur,
                    "reseau": c.carte.reseau or None,
                    "itinerance": c.carte.itinerance,
                    "signal": _signal_publiable(c.signal()),
                    "maj": _horodatage(),
                })
            except Exception:
                continue    # un modem qui ne répond pas ne doit rien bloquer
        return self._inserer_ou_mettre_a_jour("comptes", lignes, "terminal,iccid")

    def publier_raccourcis(self):
        """Les boutons appris, poussés jusqu'à la plateforme.

        Les codes USSD appartiennent au réseau, pas à une carte : le carnet
        part entier, opérateur par opérateur. Ce qu'on apprend une fois sur
        Telegram (💾) devient ainsi un bouton partout — c'est le chemin prévu
        pour équiper un nouvel opérateur sans toucher au code.

        Un bouton supprimé sur Telegram disparaît aussi du cloud : après la
        poussée, tout ce qui n'a pas été rafraîchi à cette heure-ci est effacé
        — le robot est le seul écrivain de cette table. Et rien ne part deux
        fois : on ne repousse que si le carnet a changé depuis la dernière
        poussée réussie.
        """
        if not self.actif:
            return False
        try:
            lignes = tuple(self.journal.tous_raccourcis())
        except Exception:
            return False
        if self._raccourcis_publies == lignes:
            return True
        a_jour = _horodatage()
        charge = [{
            "terminal": self.terminal,
            "operateur": operateur,
            "nom": nom,
            "libelle": libelle or nom,
            "etapes": etapes,
            "maj": a_jour,
        } for operateur, nom, libelle, etapes in lignes]
        if charge and not self._inserer_ou_mettre_a_jour(
                "raccourcis", charge, "terminal,operateur,nom"):
            return False    # table absente ou cloud en panne : on réessaiera
        try:
            # Le grand ménage : ce que la poussée n'a pas rafraîchi n'existe
            # plus localement. L'heure porte son fuseau (« +01:00 ») — dans
            # une URL, le « + » doit voyager encodé.
            self._requete(
                "DELETE",
                f"raccourcis?terminal=eq.{urllib.parse.quote(self.terminal, safe='')}"
                f"&maj=lt.{urllib.parse.quote(a_jour, safe='')}")
        except Exception as e:
            self.derniere_erreur = str(e)
            return False
        self._raccourcis_publies = lignes
        return True

    def pousser_cartes(self, limite=LOT, delai=None):
        """Envoie le registre des cartes vues, y compris celles retirées.

        C'est ce qui permet à l'application web de montrer l'historique d'une
        puce absente du boîtier, et de dire depuis quand elle l'est.

        De l'IMSI, seuls les cinq premiers chiffres partent : ils donnent le
        pays et l'opérateur, ce qui suffit à expliquer le nom du compte. Le
        reste identifie l'abonné et n'a rien à faire dans le cloud.

        Deux fils l'appellent — celui du signe de vie et celui des
        transmissions — mais un seul envoi de cartes à la fois : deux envois
        croisés pouvaient faire arriver une date plus VIEILLE après une plus
        neuve, et la plateforme aurait gardé la vieille.
        """
        with self._verrou_cartes:
            return self._pousser_cartes(limite, delai)

    def _pousser_cartes(self, limite, delai):
        """`pousser_cartes`, verrou déjà pris."""
        lignes_locales = self.journal.cartes_non_envoyees(limite)
        if not lignes_locales:
            return 0
        ids = [l[0] for l in lignes_locales]
        # Ce que l'envoi porte, carte par carte : on ne marquera « envoyée »
        # que la carte qui n'a pas bougé depuis (voir
        # `marquer_cartes_envoyees`).
        parties = {}
        charge = []
        for (iccid, imsi, operateur, libelle, numero, imei,
             premiere, derniere) in lignes_locales:
            nom = self.journal.identite(iccid)[1]
            parties[iccid] = (derniere, numero or "", nom or "")
            charge.append({
                "terminal": self.terminal,
                "iccid": iccid,
                "imsi_prefixe": (imsi or "")[:5],
                "operateur": operateur,
                "libelle": libelle,
                # Le nom commercial du compte, déclaré depuis Telegram. C'est
                # lui que l'application web affiche, et qui paraît sur les
                # reçus.
                "nom": nom or None,
                "numero": numero or None,
                "imei": imei or None,
                "premiere_vue": _horodatage(premiere),
                "derniere_vue": _horodatage(derniere),
            })
        # « merge » : une carte déjà connue se met à jour (derniere_vue…).
        return self._pousser_lot(
            "cartes", "terminal,iccid", ids, charge,
            lambda faits: self.journal.marquer_cartes_envoyees(faits, parties),
            t("card", "carte"), resolution="merge-duplicates", delai=delai)

    def pousser_paiements(self):
        """Envoie les SMS pas encore transmis. Renvoie le nombre envoyé.

        Un SMS que la base refuse (donnée mal formée, colonne manquante) ne
        doit JAMAIS geler tous les suivants — sinon la plateforme cesse
        d'afficher les nouveaux paiements alors que Telegram, lui, continue de
        les recevoir. En cas de refus du lot entier, on reprend ligne par
        ligne : les bonnes passent, la fautive est mise de côté et signalée.
        """
        lignes_locales = self.journal.sms_non_envoyes(LOT)
        if not lignes_locales:
            return 0
        charge, ids = [], []
        for id_local, date, expediteur, texte, compte, iccid, emis_le in lignes_locales:
            charge.append(self._ligne_paiement(
                id_local, date, expediteur, texte, compte, iccid, emis_le))
            ids.append(id_local)
        # « merge » : un SMS retransmis MET À JOUR sa ligne — c'est ce qui
        # permet de relire les messages passés quand le lecteur s'améliore.
        # Ce que la plateforme a posé elle-même (nature, lu_le) n'est pas dans
        # la charge : le merge ne touche que les colonnes envoyées.
        return self._pousser_lot(
            "paiements", "terminal,source_id", ids, charge,
            self.journal.marquer_sms_envoyes, t("payment", "paiement"),
            resolution="merge-duplicates")

    def _ligne_paiement(self, id_local, date, expediteur, texte, compte, iccid,
                        emis_le=None):
        """La ligne cloud d'un SMS. L'analyse ne doit jamais faire échouer la
        transmission : un SMS incompréhensible part quand même, tel quel."""
        try:
            numeros = tuple(self.fournir_numeros()) if self.fournir_numeros else ()
        except Exception:
            numeros = ()
        try:
            p = analyser(texte, numeros=numeros)
            cat = categoriser(texte, numeros=numeros)
        except Exception:
            p, cat = None, "message"
        return {
            "terminal": self.terminal,
            "source_id": id_local,
            "compte": compte or expediteur,
            # Qui a envoyé le SMS — ce que le téléphone afficherait.
            "expediteur": expediteur or None,
            # La carte qui a reçu le paiement : c'est elle qui rattache
            # la somme au bon solde quand plusieurs SIM se succèdent.
            "carte": iccid or None,
            # La catégorie devinée : encaissement, pub, code, message…
            "categorie": cat,
            "sens": p.sens if p else None,
            "montant": p.montant if p else None,
            "tiers": p.tiers if p else None,
            "numero": (p.numero if p else None),
            "reference": (p.reference if p else None),
            "solde_apres": (p.solde_apres if p else None),
            "frais": (p.frais if p else None),
            "commission": (p.commission if p else None),
            "montant_brut": (p.montant_brut if p else None),
            "texte": texte,
            # L'heure réseau (TP-SCTS) quand on l'a, sinon rien : le web
            # retombe alors sur recu_le. Les deux portent leur fuseau.
            "emis_le": _horodatage(emis_le) if emis_le else None,
            "recu_le": _horodatage(date),
        }

    def pousser_evenements(self):
        lignes_locales = self.journal.evenements_non_envoyes(LOT)
        if not lignes_locales:
            return 0
        ids = [l[0] for l in lignes_locales]
        charge = [{
            "terminal": self.terminal,
            "source_id": id_local,
            "texte": texte,
            "survenu_le": _horodatage(date),
        } for id_local, date, texte in lignes_locales]
        return self._pousser_lot(
            "evenements", "terminal,source_id", ids, charge,
            self.journal.marquer_evenements_envoyes, t("event", "événement"))

    # ---- reçus PDF ---------------------------------------------------------
    # La carte SD du Pi n'est pas grande, et un reçu n'a rien à y faire : il
    # est fabriqué en mémoire, envoyé sur Telegram, puis déposé ici. Supabase
    # devient l'archive — consultable de n'importe où, sauvegardée, et sans
    # rien qui s'accumule à Douala.

    def archiver_recu(self, nom, contenu, ligne=None):
        """Dépose le PDF dans le stockage, puis inscrit sa fiche.

        Renvoie False au moindre accroc — l'appelant réessaiera. Un dépôt
        refait écrase le précédent à l'identique : le document est une pure
        conséquence du SMS, il ne peut pas différer d'une fois sur l'autre.
        """
        if not self.actif:
            return False
        chemin = f"{self.terminal}/{nom}"
        url = f"{self.url}/storage/v1/object/{SEAU}/{chemin}"
        requete = urllib.request.Request(url, data=contenu, method="POST")
        requete.add_header("apikey", self.cle)
        requete.add_header("Authorization", f"Bearer {self.cle}")
        requete.add_header("Content-Type", "application/pdf")
        # Sans cet en-tête, un second dépôt du même chemin répondrait 409 et
        # le reçu resterait éternellement « à archiver ».
        requete.add_header("x-upsert", "true")
        try:
            with urllib.request.urlopen(requete, timeout=DELAI):
                pass
        except Exception as e:
            self.derniere_erreur = str(e)
            return False
        if ligne is None:
            return True
        return self._inserer_ou_mettre_a_jour(
            "recus", [dict(ligne, terminal=self.terminal, chemin=chemin)],
            "terminal,numero")

    # ---- guichet à distance (table « commandes ») --------------------------
    # L'application web dépose une demande ; le robot la lit ici, l'exécute
    # sur la vraie SIM, puis écrit le résultat. Le canal descendant, enfin.

    def _lire(self, chemin):
        """GET sur l'API, réponse JSON décodée. Léve en cas d'accroc."""
        req = urllib.request.Request(f"{self.url}/rest/v1/{chemin}")
        req.add_header("apikey", self.cle)
        req.add_header("Authorization", f"Bearer {self.cle}")
        with urllib.request.urlopen(req, timeout=DELAI) as rep:
            return json.loads(rep.read().decode() or "[]")

    def commandes_en_attente(self):
        """Les demandes que l'application web a déposées pour CE terminal."""
        if not self.actif:
            return []
        try:
            lignes = self._lire(
                f"commandes?terminal=eq.{self.terminal}&etat=eq.en_attente"
                "&order=demandee_le.asc&limit=10")
            self.derniere_erreur = None
            return lignes
        except Exception as e:
            self.derniere_erreur = str(e)
            return []

    def commandes_abandonnees(self, avant):
        """Les demandes prises en charge et jamais terminées.

        POURQUOI IL EN EXISTE. Une demande se RÉCLAME avant d'être exécutée
        (voir `reclamer`), et son résultat s'écrit après. Entre les deux, le
        robot peut être coupé — courant, redémarrage, plantage. La ligne
        reste alors « en cours » pour toujours : l'écran attend une réponse
        qui ne viendra pas, et le propriétaire ne sait pas si son opération
        est passée.

        POURQUOI ON NE LES REMET PAS « EN ATTENTE ». Ce serait les faire
        rejouer — et on ne sait justement PAS si le code a été composé avant
        la coupure. Sur un transfert, c'est le doute qu'il faut lever, pas
        l'argent qu'il faut renvoyer. On les marque échouées, avec un mot qui
        dit ce qu'on ne sait pas.
        """
        if not self.actif:
            return []
        try:
            lignes = self._lire(
                f"commandes?terminal=eq.{self.terminal}&etat=eq.en_cours"
                f"&demandee_le=lt.{urllib.parse.quote(avant)}&limit=20")
            self.derniere_erreur = None
            return lignes
        except Exception as e:
            self.derniere_erreur = str(e)
            return []

    def appareils(self, iccid=None, lever=False):
        """Les téléphones à faire sonner pour un SMS arrivé sur la carte
        `iccid`.

        La plateforme inscrit un appareil quand l'application s'ouvre ; le
        robot vient lire la liste au moment d'annoncer un paiement. Aucun
        appareil, ou nuage injoignable : on rend une liste vide, et le
        propriétaire reçoit son message sur Telegram comme toujours.

        `lever` : une panne LÈVE au lieu de rendre une liste vide. « Personne
        à faire sonner » et « je n'ai pas pu demander qui » se ressemblaient
        exactement : un paiement reçu pendant une coupure d'Internet ne
        faisait jamais sonner, ni pendant ni après, sans un mot au journal.
        Le robot a besoin de la différence pour retenir la sonnerie.

        CHACUN ENTEND SES CARTES. Un téléphone sans compte (colonne vide)
        est celui du propriétaire : il sonne pour tout. Un téléphone inscrit
        au nom d'un compte sonne si ce compte est le propriétaire, ou si la
        carte du SMS lui est confiée — jamais pour une autre. Un compte
        fermé n'entend plus rien.

        Dans le doute, on ne sonne pas : une lecture des comptes ou des
        cartes confiées qui échoue laisse les téléphones des comptes muets
        pour ce SMS, et ceux du propriétaire sonnent comme toujours.

        On ne remonte que les jetons — rien d'autre n'est utile ici.
        """
        if not self.actif:
            return []
        try:
            try:
                lignes = self._lire(
                    "appareils?select=jeton,utilisateur&order=vu_le.desc"
                    f"&limit={PAR_ENVOI * 5}")
            except urllib.error.HTTPError as e:
                # Base pas encore migrée : pas de colonne « utilisateur ».
                # Tous les téléphones sont alors ceux du propriétaire — la
                # plateforme n'en inscrivait pas d'autres.
                #
                # UNE COLONNE ABSENTE DANS « select » NE SE DIT PAS COMME À
                # L'ÉCRITURE. PostgREST répond PGRST204 à une écriture, mais
                # c'est PostgreSQL qui répond à une lecture : « 42703 —
                # column appareils.utilisateur does not exist ». Ce
                # rattrapage ne connaissait que la première forme : sur une
                # base sans la migration du 2 octobre, l'erreur remontait, la
                # liste revenait vide, et AUCUN téléphone ne sonnait — Android
                # compris — sans un mot au journal. Éprouvé sur un vrai
                # PostgREST. Le test est ici seulement, à dessein : ailleurs,
                # le rattrapage retire une colonne d'une écriture, ce qui
                # n'a pas de sens pour une lecture.
                corps = self._lire_corps(e)
                manquante = (self._defaut_de_schema(corps) or "42703" in corps
                             or "does not exist" in corps.lower())
                if e.code != 400 or not manquante:
                    raise
                lignes = self._lire("appareils?select=jeton&order=vu_le.desc"
                                    f"&limit={PAR_ENVOI}")
            self.derniere_erreur = None
            lignes = [l for l in lignes
                      if isinstance(l.get("jeton"), str) and l["jeton"]]
            admis = self._comptes_qui_entendent(
                {l["utilisateur"] for l in lignes
                 if isinstance(l.get("utilisateur"), int)}, iccid)
            return [l["jeton"] for l in lignes
                    if l.get("utilisateur") is None
                    or l.get("utilisateur") in admis][:PAR_ENVOI]
        except Exception as e:
            self.derniere_erreur = str(e)
            if lever:
                raise
            return []

    def _comptes_qui_entendent(self, ids, iccid):
        """Parmi ces comptes, ceux qui doivent entendre un SMS de `iccid`."""
        if not ids:
            return set()
        try:
            liste = ",".join(str(i) for i in sorted(ids))
            comptes = self._lire(
                f"utilisateurs?select=id,role,approuve&id=in.({liste})")
            ouverts = {c["id"]: c.get("role") for c in comptes
                       if c.get("approuve") is True}
            admis = {i for i, role in ouverts.items() if role == "proprietaire"}
            carte = re.sub(r"[^A-Za-z0-9]", "", str(iccid or ""))
            if carte:
                confiees = self._lire(
                    f"attributions?select=utilisateur&iccid=eq.{carte}"
                    f"&utilisateur=in.({liste})")
                admis |= {a["utilisateur"] for a in confiees
                          if a.get("utilisateur") in ouverts}
            return admis
        except Exception:
            return set()

    def reclamer(self, identifiant):
        """PRENDRE une demande pour soi — ou constater qu'un autre l'a prise.

        POURQUOI CE N'EST PAS UN SIMPLE « mets-la en cours ». C'en était un,
        et il ne demandait rien : il ORDONNAIT. Deux robots sur le même
        terminal — un second Pi branché, un redémarrage qui chevauche
        l'ancien — lisaient donc la même ligne « en attente » et la
        composaient tous les deux. Sur un transfert, c'est deux fois
        l'argent, et la seconde fois personne ne l'a demandée.

        La condition « et elle est encore en attente » est ce qui manque, et
        c'est la base qui doit la trancher : elle seule voit les deux robots.
        PostgREST le fait en une requête — le filtre `etat=eq.en_attente`
        fait partie du PATCH, donc du même verrou de ligne. Celui qui arrive
        second ne modifie AUCUNE ligne, et le sait.

        C'est aussi ce qui répare le cas d'un seul robot : si l'écriture
        échouait, la ligne restait « en attente » et le tour suivant la
        reprenait — après l'avoir déjà exécutée. Ici, on ne commence pas
        tant qu'on n'a pas gagné la ligne.

        Rend une `Prise` (vraie) seulement si la ligne était bien à prendre ET
        qu'on l'a prise. Dans le doute — réseau coupé, réponse illisible —
        c'est False : ne rien faire est toujours rattrapable, composer deux
        fois ne l'est pas.

        LA PRISE DIT AUSSI L'ÂGE DE LA DEMANDE. Une demande déposée pendant
        que le boîtier se taisait restait « en attente » sans limite : à son
        retour, des heures plus tard, il composait le transfert — numéro et
        montant compris — alors que l'écran avait abandonné depuis longtemps
        et que le propriétaire croyait l'opération partie aux oubliettes.
        La base rend la ligne prise, avec son heure de dépôt, et l'en-tête
        de sa réponse donne SON heure : l'écart entre les deux est l'âge vrai
        de la demande, mesuré sur une seule horloge — celle du Pi peut avoir
        des heures de retard après une coupure de courant.
        """
        try:
            lignes, heure_base = self._requete_corps(
                "PATCH",
                f"commandes?id=eq.{int(identifiant)}&etat=eq.en_attente",
                {"etat": "en_cours"})
            self.derniere_erreur = None
        except Exception as e:
            self.derniere_erreur = str(e)
            return False
        if not lignes:
            return False
        ligne = lignes[0] if isinstance(lignes, list) else None
        depose = ligne.get("demandee_le") if isinstance(ligne, dict) else None
        return Prise(_age_de_la_demande(depose, heure_base))

    def commande_maj(self, identifiant, champs):
        """Fait avancer une demande : résultat, échec, effacement du secret.

        Rend False si l'écriture n'a pas abouti — et cette réponse SE REGARDE.
        Elle était ignorée partout, y compris là où elle efface un code
        confidentiel (voir `pilotage._repondre`).
        """
        try:
            self._requete(
                "PATCH", f"commandes?id=eq.{int(identifiant)}", champs)
            self.derniere_erreur = None
            return True
        except Exception as e:
            self.derniere_erreur = str(e)
            return False

    def publier_solde(self, iccid, solde, moment=None):
        """Un solde annoncé par l'opérateur : la base le reflète.

        C'est la seule écriture de solde côté nuage — il vient toujours de
        l'opérateur (réponse USSD, ou SMS de relevé en itinérance), jamais
        d'un calcul à nous.

        `moment` : l'heure RÉSEAU de l'annonce, quand un SMS la porte. Un
        relevé ancien rejoué dans le désordre (backlog après une coupure) ne
        doit pas écraser un solde déjà plus récent : avec un moment, on ne
        remplace que si ce qu'on écrit lui est postérieur. Sans moment — une
        réponse USSD, toujours actuelle — on écrit sans condition.
        """
        if not (self.actif and iccid):
            return False
        quand = _horodatage(moment) if moment else _horodatage()
        # terminal et iccid ancrent la ligne visée : encodés, un nom de
        # terminal ou un ICCID malformé ne peut pas déborder le filtre.
        chemin = (f"comptes?terminal=eq.{urllib.parse.quote(self.terminal, safe='')}"
                  f"&iccid=eq.{urllib.parse.quote(str(iccid), safe='')}")
        # LA BONNE HORLOGE. On comparait à « maj », qui dit « cette ligne a été
        # touchée » — et le signe de vie la remet à l'heure toutes les soixante
        # secondes. Comme l'heure d'un SMS est forcément dans le passé, la
        # condition « maj < heure du SMS » échouait presque toujours : le
        # PATCH ne trouvait aucune ligne, n'écrivait rien, et rendait quand
        # même « c'est fait ». Le solde frais était jeté en silence — c'est
        # exactement ce que cette fonction existe pour éviter.
        #
        # « solde_maj » ne parle que du SOLDE. Nulle au départ (aucun solde
        # encore annoncé) : on accepte donc aussi ce cas.
        filtre = ""
        if moment:
            echappe = urllib.parse.quote(quand, safe='')
            filtre = f"&or=(solde_maj.is.null,solde_maj.lt.{echappe})"
        try:
            self._requete("PATCH", chemin + filtre,
                          {"solde": solde, "maj": quand, "solde_maj": quand})
            self.derniere_erreur = None
            return True
        except Exception as e:
            self.derniere_erreur = str(e)
            # Base pas encore migrée : la colonne « solde_maj » n'existe pas.
            # On écrit alors le solde sans elle, plutôt que de le perdre — on
            # renonce seulement à la protection contre un relevé rejoué dans
            # le désordre, ce qui reste très au-dessus de l'ancien comportement
            # (où le solde n'arrivait jamais).
            try:
                self._requete("PATCH", chemin, {"solde": solde, "maj": quand})
                self.derniere_erreur = None
                return True
            except Exception as e2:
                self.derniere_erreur = str(e2)
                return False

    # ---- boucle -----------------------------------------------------------
    def demarrer(self, comptes=None, sante=None):
        """Lance la synchronisation en tâche de fond. Sans configuration,
        ne fait rien du tout — le robot fonctionne exactement pareil.

        Deux fils : celui du signe de vie, à heure fixe, suivi de près par
        les cartes revues depuis ; et celui des transmissions (SMS,
        événements, le reste des cartes, état des SIM). Rend le second."""
        if not self.actif:
            return None
        self._sante = sante
        self._fil_signe = threading.Thread(target=self._battre, daemon=True)
        self._fil_signe.start()
        fil = threading.Thread(
            target=self._boucle, args=(comptes or [], sante), daemon=True)
        fil.start()
        return fil

    def arreter(self):
        self._marche = False
        self._reveil.set()      # ne pas attendre la fin du sommeil pour sortir
        self._arret.set()

    def _battre(self):
        """Le fil du signe de vie : à heure fixe — et les cartes avec lui.

        Rien ne le retarde — ni une poussée de mille lignes, ni un SMS qui
        réveille la transmission, ni un modem occupé par une session USSD :
        rien de tout cela ne passe par ce fil. Un signe de vie raté se
        retente dix secondes plus tard ; un signe de vie réussi fixe le
        suivant à une pause de son DÉPART, pas de son arrivée.

        LES CARTES PARTENT DANS LA FOULÉE. La plateforme compare la date du
        signe de vie à la dernière vue de chaque carte pour dire si la puce
        est encore là. Quand le signe de vie a pris son fil à lui, les
        cartes sont restées dans le tour des transmissions : la première
        date montait à l'heure, la seconde à son rythme à elle — l'écart
        grimpait jusqu'à deux minutes sans incident, et un seul tour de
        transmission raté (Internet capricieux, un lot de SMS qui traîne)
        suffisait à faire dire « retirée » d'une carte bien en place. Elles
        repartent donc ensemble : un petit lot de cartes après chaque signe
        de vie réussi. Une coupure les fait vieillir ensemble, comme avant.
        Si les cartes n'ont pas suivi, on retente vite — quelques fois
        seulement : une table que la base refuse ne doit pas faire parler
        le boîtier toutes les dix secondes sur le forfait de la boutique.

        LE RÉSEAU REVENU NE S'ANNONCE PAS QU'À LA PLATEFORME. Le signe de vie
        retente toutes les dix secondes, la transmission seulement à son
        échéance : au retour d'Internet, le boîtier publiait « 3 messages en
        cours de transmission », puis les gardait jusqu'à une minute de
        plus. Le premier signe de vie qui passe après un échec — ou qui
        annonce des SMS en retard — réveille donc la transmission. C'est un
        événement, pas un pouls : il n'arrive que si quelque chose attend.
        """
        prochain = time.monotonic()
        echecs = 0
        reprises_cartes = 0
        while self._marche:
            reste = prochain - time.monotonic()
            if reste > 0 and self._arret.wait(reste):
                break
            if not self._marche:
                break
            depart = time.monotonic()
            try:
                vivant = self.enregistrer_terminal(delai=SIGNE_DE_VIE_DELAI)
            except Exception as e:
                self.derniere_erreur = str(e)
                vivant = False
            if vivant:
                prochain = depart + self.pause
                if echecs or self._en_attente_publie:
                    self._reveil.set()
                echecs = 0
                if self._cartes_avec_le_signe():
                    reprises_cartes = 0
                elif reprises_cartes < CARTES_REPRISES:
                    reprises_cartes += 1
                    prochain = min(prochain, time.monotonic()
                                   + min(SIGNE_DE_VIE_REPRISE, self.pause))
            else:
                echecs += 1
                prochain = time.monotonic() + min(SIGNE_DE_VIE_REPRISE,
                                                  self.pause)

    def _cartes_avec_le_signe(self):
        """Le petit lot de cartes qui suit un signe de vie réussi (voir
        `_battre`). Rend False si des cartes attendaient et ne sont pas
        toutes passées.

        Si le fil des transmissions est déjà en train d'envoyer des cartes,
        on ne l'attend pas longtemps : elles sont en route."""
        if not self._verrou_cartes.acquire(timeout=SIGNE_DE_VIE_DELAI):
            return True
        try:
            attendues = len(self.journal.cartes_non_envoyees(CARTES_DU_SIGNE))
            if not attendues:
                return True
            return self._pousser_cartes(
                CARTES_DU_SIGNE, SIGNE_DE_VIE_DELAI) >= attendues
        except Exception as e:
            self.derniere_erreur = str(e)
            return False
        finally:
            self._verrou_cartes.release()

    def _apres_la_transmission(self):
        """Fin d'un tour de transmission : ce qui attendait que les SMS soient
        dans la base peut partir (les sonneries retenues, côté robot)."""
        if self.apres_transmission is None:
            return
        try:
            self.apres_transmission()
        except Exception:
            pass    # la transmission, elle, est faite : rien d'autre ne compte ici

    def _republier_le_retard(self):
        """Après une poussée, le retard que la plateforme affiche doit être
        celui qui RESTE.

        Il était compté et publié AVANT la poussée qui, dans la foulée,
        transmettait justement ces SMS : la plateforme affichait « 3 messages
        en cours de transmission » pendant toute une minute au-dessus d'une
        liste qui les contenait déjà. On republie donc dès qu'une poussée l'a
        fait bouger. Sous le verrou du signe de vie : un signe de vie parti
        avant la poussée ne peut pas arriver après elle avec l'ancien chiffre.
        """
        with self._verrou_signe:
            try:
                reste = self.journal.sms_en_attente()
            except Exception:
                return False
            if reste == self._en_attente_publie:
                return True
            return self.enregistrer_terminal(delai=SIGNE_DE_VIE_DELAI)

    def reveiller(self):
        """« J'ai quelque chose à transmettre, maintenant. »

        Appelé dès qu'une ligne entre au journal. Sans cela, le pont dormait
        jusqu'à une minute alors qu'il savait déjà qu'un paiement venait
        d'arriver — un délai qu'on s'infligeait sans raison.

        Plusieurs appels rapprochés ne réveillent qu'une fois : c'est le
        propre d'un drapeau. Trois SMS reçus coup sur coup partent donc en un
        seul envoi, pas en trois.
        """
        self._reveil.set()

    def _boucle(self, comptes, sante):
        """Le fil des transmissions. Le signe de vie n'y passe plus (voir
        `_battre`) : ce fil peut traîner sans que le boîtier paraisse muet."""
        premier = True
        prochain_etat = 0.0
        while self._marche:
            try:
                # L'état des SIM change lentement : on le republie au rythme
                # de fond, pas à chaque paiement.
                if time.monotonic() >= prochain_etat:
                    prochain_etat = time.monotonic() + self.pause
                    self.publier_comptes(comptes)
                    self.publier_raccourcis()
                envoyes = self._pousser_tout()
                if envoyes:
                    # Ce qui reste VRAIMENT à transmettre, maintenant que
                    # la poussée est passée.
                    self._republier_le_retard()
                if premier and envoyes:
                    self.journal.evenement(t(
                        f"cloud: {envoyes} line(s) sent at startup",
                        f"cloud : {envoyes} ligne(s) transmise(s) au démarrage"))
                    premier = False
            except Exception as e:
                # Un cloud injoignable est normal : on note, on continue.
                self.derniere_erreur = str(e)
            # APRÈS la poussée : une sonnerie rattrapée fait ouvrir
            # l'application, qui doit y trouver le paiement qu'elle annonce.
            self._apres_la_transmission()
            # Réveil immédiat sur nouvelle ligne, sinon battement de fond —
            # qui reste indispensable : il rejoue ce qu'une coupure a retenu.
            # On attend jusqu'à l'ÉCHÉANCE, pas une pause pleine : un réveil
            # par SMS relançait soixante secondes d'attente à chaque fois, et
            # l'état des SIM glissait jusqu'à deux minutes.
            attente = min(self.pause, max(0.0, prochain_etat - time.monotonic()))
            if self._reveil.wait(timeout=attente):
                self._reveil.clear()
                # Laisser une seconde aux arrivées quasi simultanées de se
                # joindre au même envoi, plutôt que d'ouvrir trois connexions.
                time.sleep(DEBOUNCE)

    def _pousser_tout(self):
        """Vide les files vers le cloud, lot après lot, et dit combien.

        Un seul lot par battement suffirait au quotidien, mais pas après une
        relecture des SMS passés : des milliers de lignes attendraient des
        heures, bandeau « en retard » affiché sur la plateforme. Tant qu'un
        lot est parti plein, on enchaîne — la file décroît strictement, une
        coupure réseau rend zéro et sort.
        """
        total = 0
        while self._marche if hasattr(self, "_marche") else True:
            envoyes = (self.pousser_cartes() + self.pousser_paiements()
                       + self.pousser_evenements())
            total += envoyes
            if envoyes < LOT:
                break
            time.sleep(0.2)     # respirer entre deux lots pleins
        return total

    def resume(self):
        """Ligne d'état pour /statut."""
        if not self.actif:
            return t("cloud disabled", "cloud désactivé")
        reste = self.journal.reste_a_envoyer()
        if self.derniere_erreur:
            return t(f"cloud unreachable · {reste} line(s) waiting",
                     f"cloud injoignable · {reste} ligne(s) en attente")
        if not reste:
            return t("cloud up to date", "cloud à jour")
        return t(f"cloud · {reste} waiting", f"cloud · {reste} en attente")


class Prise:
    """Une demande gagnée par CE robot — et ce qu'on sait de son âge.

    Vraie, comme l'était le « True » d'avant : `if not nuage.reclamer(…)` se
    lit toujours de la même façon. `age` : les secondes écoulées entre le
    dépôt de la demande et sa prise, sur l'horloge de la base ; None quand
    on ne peut pas le savoir (heure de dépôt absente ou illisible)."""

    __slots__ = ("age",)

    def __init__(self, age=None):
        self.age = age

    def __bool__(self):
        return True

    def __repr__(self):
        return f"Prise(age={self.age!r})"


def _signal_publiable(valeur):
    """La force du signal telle que la plateforme doit la lire : 0 à 31, ou
    RIEN.

    Le modem répond 99 quand il ne sait pas — pas de réseau, antenne
    débranchée, ou modem qui ne répond plus (la lecture rend aussi 99 au
    bout de deux secondes de silence). Publié tel quel, 99 dessinait quatre
    barres pleines sur une carte SANS réseau : 99/31, c'est plus que le
    maximum. Inconnu se dit `None`, jamais un nombre."""
    if isinstance(valeur, bool) or not isinstance(valeur, int):
        return None
    return valeur if 0 <= valeur <= 31 else None


def _heure_de_l_en_tete(valeur):
    """L'en-tête HTTP « Date » (« Sun, 04 Oct 2026 09:12:33 GMT »), en heure
    consciente de son fuseau, ou None."""
    if not valeur:
        return None
    try:
        heure = parsedate_to_datetime(valeur)
    except (TypeError, ValueError, IndexError):
        return None
    if heure is None or heure.tzinfo is None:
        return None
    return heure


_RE_FRACTION = re.compile(r"^(.*T\d\d:\d\d:\d\d)\.(\d+)(.*)$")


def lire_instant(texte):
    """Une heure de la base (« 2026-10-04T09:12:33.1234+00:00 »), ou None.

    PostgreSQL tronque les zéros des fractions (« .1234 »), écrit parfois
    « +00 » sans les minutes, et d'autres écrivent « Z » : ce que
    `fromisoformat` d'avant Python 3.11 refuse. Une heure sans fuseau ne
    dit pas de quel instant elle parle : None."""
    if not isinstance(texte, str) or not texte.strip():
        return None
    s = texte.strip()
    if len(s) > 10 and s[10] == " ":
        s = s[:10] + "T" + s[11:]
    s = re.sub(r"[zZ]$", "+00:00", s)
    s = re.sub(r"([+-]\d\d)$", r"\1:00", s)
    m = _RE_FRACTION.match(s)
    if m:
        s = f"{m.group(1)}.{(m.group(2) + '000000')[:6]}{m.group(3)}"
    try:
        instant = datetime.fromisoformat(s)
    except ValueError:
        return None
    return instant if instant.tzinfo is not None else None


def _age_de_la_demande(depose, heure_base):
    """Secondes entre le dépôt d'une demande et maintenant, ou None.

    `heure_base` est l'heure de la base au moment de la prise (en-tête de sa
    réponse) : la même horloge que celle qui a écrit `depose`. Sans elle, on
    retombe sur l'horloge du Pi — mieux que rien, mais elle peut avoir des
    heures de retard après une coupure de courant : un écart NÉGATIF
    au-delà de l'arrondi ne se croit pas, il dit que les horloges ne
    s'accordent pas, donc qu'on ne sait pas."""
    instant = lire_instant(depose)
    if instant is None:
        return None
    maintenant = heure_base or datetime.now(timezone.utc)
    age = (maintenant - instant).total_seconds()
    # L'en-tête « Date » n'a pas de fraction de seconde : la base, elle, en a.
    # Une demande prise dans la seconde de son dépôt paraît donc avoir un âge
    # légèrement négatif. C'est un arrondi, pas un désaccord.
    if age < -5:
        return None
    return max(0.0, age)


def _horodatage(iso=None):
    """Une heure destinée au cloud, TOUJOURS avec son fuseau.

    Les dates du journal local sont naïves (heure du Pi, Douala). Envoyées
    telles quelles dans une colonne `timestamptz`, Supabase les interprète en
    UTC — et le web, qui reformate en heure de Douala, ajoute une heure de
    trop. On attache donc l'offset local du Pi : « 13:45 » devient
    « 13:45+01:00 », que tout le monde comprend pareil."""
    from datetime import datetime
    dt = datetime.fromisoformat(iso) if iso else datetime.now()
    if dt.tzinfo is None:
        # datetime naïf → considéré comme l'heure LOCALE du Pi, rendu conscient
        # de son fuseau (astimezone() sur un naïf suppose l'heure locale).
        dt = dt.astimezone()
    return dt.isoformat(timespec="seconds")
