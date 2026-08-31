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

from .analyse_sms import analyser, categoriser
from .textes import t
from .version import version

DELAI = 15          # secondes avant d'abandonner une requête
LOT = 100           # lignes envoyées par requête
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

    # ---- requêtes ---------------------------------------------------------
    def _requete(self, methode, chemin, corps=None, entetes=None):
        url = f"{self.url}/rest/v1/{chemin}"
        donnees = json.dumps(corps).encode() if corps is not None else None
        req = urllib.request.Request(url, data=donnees, method=methode)
        req.add_header("apikey", self.cle)
        req.add_header("Authorization", f"Bearer {self.cle}")
        req.add_header("Content-Type", "application/json")
        req.add_header("Prefer", "return=minimal")
        for nom, valeur in (entetes or {}).items():
            req.add_header(nom, valeur)
        with urllib.request.urlopen(req, timeout=DELAI) as rep:
            return rep.status

    def _tenter_insert(self, table, lignes, cle_unicite,
                       resolution="ignore-duplicates"):
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
                    {"Prefer": f"return=minimal,resolution={resolution}"})
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
                     resolution="ignore-duplicates"):
        """Envoie un lot avec reprise ligne par ligne : les bonnes lignes
        passent, une ligne refusée pour de bon (4xx propre à elle) est écartée
        et signalée, une coupure garde TOUT pour réessayer. Une colonne
        d'enrichissement absente n'arrête plus rien (l'insertion la retire et
        réessaie) ; seul un défaut de structure sur une colonne essentielle
        renvoie « schema », et là on garde tout et on alerte.

        Une seule ligne empoisonnée ne peut donc plus geler toute une file —
        ni pour les paiements, ni pour les événements, ni pour les cartes.
        `marquer(liste_ids)` marque les lignes transmises ; `sujet` les nomme
        dans les messages."""
        etat = self._tenter_insert(table, charge, cle_unicite, resolution)
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
            e = self._tenter_insert(table, [ligne], cle_unicite, resolution)
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
    def enregistrer_terminal(self, sante=None):
        """Annonce le terminal et son état. Sert aussi de signe de vie :
        sans nouvelles, l'application web saura le dire."""
        ligne = {
            "id": self.terminal,
            "nom": self.terminal,
            "vu_le": _horodatage(),
            "sante": sante or {},
            # Quelle version tourne réellement sur ce Pi. Sans elle, « le
            # correctif n'existe pas » et « le correctif existe mais n'est pas
            # déployé » se ressemblent exactement, vus de loin.
            "version": version(),
        }
        return self._inserer_ou_mettre_a_jour("terminaux", [ligne], "id")

    def _inserer_ou_mettre_a_jour(self, table, lignes, cle_unicite):
        if not lignes:
            return True
        try:
            self._requete(
                "POST", f"{table}?on_conflict={cle_unicite}", lignes,
                {"Prefer": "return=minimal,resolution=merge-duplicates"})
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
                    "signal": c.signal(),
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

    def pousser_cartes(self):
        """Envoie le registre des cartes vues, y compris celles retirées.

        C'est ce qui permet à l'application web de montrer l'historique d'une
        puce absente du boîtier, et de dire depuis quand elle l'est.

        De l'IMSI, seuls les cinq premiers chiffres partent : ils donnent le
        pays et l'opérateur, ce qui suffit à expliquer le nom du compte. Le
        reste identifie l'abonné et n'a rien à faire dans le cloud.
        """
        lignes_locales = self.journal.cartes_non_envoyees(LOT)
        if not lignes_locales:
            return 0
        ids = [l[0] for l in lignes_locales]
        charge = [{
            "terminal": self.terminal,
            "iccid": iccid,
            "imsi_prefixe": (imsi or "")[:5],
            "operateur": operateur,
            "libelle": libelle,
            # Le nom commercial du compte, déclaré depuis Telegram. C'est lui
            # que l'application web affiche, et qui paraît sur les reçus.
            "nom": self.journal.identite(iccid)[1] or None,
            "numero": numero or None,
            "imei": imei or None,
            "premiere_vue": _horodatage(premiere),
            "derniere_vue": _horodatage(derniere),
        } for (iccid, imsi, operateur, libelle, numero, imei,
               premiere, derniere) in lignes_locales]
        # « merge » : une carte déjà connue se met à jour (derniere_vue…).
        return self._pousser_lot(
            "cartes", "terminal,iccid", ids, charge,
            self.journal.marquer_cartes_envoyees, t("card", "carte"),
            resolution="merge-duplicates")

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

    def appareils(self):
        """Les téléphones qui ont demandé à être prévenus.

        La plateforme inscrit un appareil quand l'application s'ouvre ; le
        robot vient lire la liste au moment d'annoncer un paiement. Aucun
        appareil, ou nuage injoignable : on rend une liste vide, et le
        propriétaire reçoit son message sur Telegram comme toujours.

        On ne remonte que les jetons — rien d'autre n'est utile ici.
        """
        if not self.actif:
            return []
        try:
            lignes = self._lire("appareils?select=jeton&order=vu_le.desc"
                                f"&limit={PAR_ENVOI}")
            self.derniere_erreur = None
            return [l["jeton"] for l in lignes
                    if isinstance(l.get("jeton"), str) and l["jeton"]]
        except Exception as e:
            self.derniere_erreur = str(e)
            return []

    def commande_maj(self, identifiant, champs):
        """Fait avancer une demande : prise en charge, résultat, échec."""
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
        if moment:
            chemin += f"&maj=lt.{urllib.parse.quote(quand, safe='')}"
        try:
            self._requete("PATCH", chemin, {"solde": solde, "maj": quand})
            self.derniere_erreur = None
            return True
        except Exception as e:
            self.derniere_erreur = str(e)
            return False

    # ---- boucle -----------------------------------------------------------
    def demarrer(self, comptes=None, sante=None):
        """Lance la synchronisation en tâche de fond. Sans configuration,
        ne fait rien du tout — le robot fonctionne exactement pareil."""
        if not self.actif:
            return None
        fil = threading.Thread(
            target=self._boucle, args=(comptes or [], sante), daemon=True)
        fil.start()
        return fil

    def arreter(self):
        self._marche = False
        self._reveil.set()      # ne pas attendre la fin du sommeil pour sortir

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
        premier = True
        prochain_etat = 0.0
        while self._marche:
            try:
                # L'état du terminal et des SIM change lentement : on le
                # republie au rythme de fond, pas à chaque paiement.
                if time.monotonic() >= prochain_etat:
                    prochain_etat = time.monotonic() + self.pause
                    etat = sante.resume() if sante else None
                    # On publie AUSSI le retard de synchro : les SMS relevés
                    # mais pas encore transmis. La plateforme peut ainsi dire
                    # « je suis en retard » plutôt que de montrer une boîte de
                    # réception incomplète comme si elle était à jour. On ne
                    # compte que les SMS : les événements et les cartes, souvent
                    # en transit, feraient clignoter le bandeau pour rien.
                    info = {"en_attente": self.journal.sms_en_attente()}
                    if etat:
                        info["resume"] = etat
                    self.enregistrer_terminal(info)
                    self.publier_comptes(comptes)
                    self.publier_raccourcis()
                envoyes = self._pousser_tout()
                if premier and envoyes:
                    self.journal.evenement(t(
                        f"cloud: {envoyes} line(s) sent at startup",
                        f"cloud : {envoyes} ligne(s) transmise(s) au démarrage"))
                    premier = False
            except Exception as e:
                # Un cloud injoignable est normal : on note, on continue.
                self.derniere_erreur = str(e)
            # Réveil immédiat sur nouvelle ligne, sinon battement de fond —
            # qui reste indispensable : il rejoue ce qu'une coupure a retenu
            # et sert de signe de vie au terminal.
            if self._reveil.wait(timeout=self.pause):
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
