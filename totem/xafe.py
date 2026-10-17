# -*- coding: utf-8 -*-
"""La porte XAFe Exchange : la seconde destination des encaissements.

Les trois principes de `nuage.py` (hors-ligne d'abord, rien en double,
silencieux) valent ici mot pour mot — on ne les réécrit pas. Ce qui diffère,
en une phrase : la porte XAFe parle à `/functions/v1`, se signe avec la clé
du boîtier, et rend ses verdicts ligne par ligne dans le corps d'un 200.

C'est pourquoi ce module est un FRÈRE de `nuage.py`, pas un drapeau dedans :
le transport n'a rien de commun (trois en-têtes HMAC, pas de PostgREST, pas de
« Prefer »), et `Nuage._requete` ne se transpose pas. Sans section `[xafe]`
dans totem.conf, `PorteXafe.actif` est faux et aucune méthode ne touche ni le
réseau ni le journal : le robot se comporte à l'octet près comme avant.

XAFe est un TIERS. Un SMS appartient au propriétaire : seuls les SMS d'argent
ENTRANT lui sont envoyés — jamais une publicité, un code, un solde, une
sortie, ni un SMS que le lecteur ne comprend pas. Le tri se fait ICI, avant
toute requête — et AVANT de demander à quelle carte appartient la ligne.

UNE LIGNE QUI ATTEND NE TIENT PAS LA FILE. Les encaissements d'une carte dont
le numéro n'est pas encore déclaré attendent ce numéro, et seulement eux : la
file se lit en écartant ces cartes, puis au-delà d'un lot qui n'a rien donné.
Sans cela, cent lignes d'une carte oubliée dans /reglages — ou d'une carte
d'un autre réseau — restaient en tête de la file, et plus rien ne partait
pour aucune carte, sans un mot d'autre que « N en attente ». Et la lecture
est BORNÉE : si l'écartement se perdait, cent encaissements qui attendent
rempliraient chaque lot, et la file se relirait à l'identique pour toujours ;
le tour s'arrête après dix lots, le journal le dit, et `arreter()` sort du
tour comme du fil.

LE GUICHET. XAFe confie aussi au boîtier des SMS À ENVOYER — le code qui
prouve qu'un numéro est à son propriétaire. La porte les relève, les réclame
et en rend compte avec les mêmes noms qu'un `Nuage`, pour que `Pilotage` —
une seule boucle, une file par carte — les serve à côté des demandes Bonzini
sans rien apprendre de neuf. Les transferts, de l'argent à composer, ne sont
pas relevés : voir le guichet, plus bas.
"""

import hashlib
import hmac
import json
import socket
import threading
import time
import urllib.error
import urllib.request
from datetime import timedelta

from .analyse_sms import analyser
from .nuage import (DEBOUNCE, DELAI, LOT, Prise, _age_de_la_demande,
                    _heure_de_l_en_tete, _horodatage)
from .textes import t

PAUSE = 60
# La RELÈVE des commandes XAFe (les SMS à envoyer) est cadencée ICI, pas par
# la boucle de `Pilotage` (trois secondes, une et demie en session) : chaque
# GET est signé et ouvre une connexion sur la 3G. Entre deux relèves, la
# porte rend « rien » sans réseau. Une demande XAFe attend donc jusqu'à dix
# secondes de plus qu'une demande Bonzini — aucun écran n'abandonne à trente
# secondes de ce côté-là, et chaque GET vaut signe de vie chez XAFe.
PAS_RELEVE = 10
# Le délai du GET de la relève. Il est le sien : la relève tourne dans son
# propre fil de `Pilotage`, donc un hébergeur qui accepte la connexion et ne
# répond jamais ne retient qu'elle — jamais la relève des demandes Bonzini
# (`tests/test_xafe.py`, la cadence sous un XAFe muet, le mesure).
DELAI_RELEVE = DELAI
# L'âge au-delà duquel le robot n'exécute plus une demande XAFe : la règle de
# la plateforme (soixante secondes) est faite pour un écran qui abandonne à
# trente ; XAFe garde la date du dépôt et rejoue ses commandes. Un code de
# vérification vaut dix minutes chez XAFe : quinze minutes le couvrent, et
# au-delà le client en a déjà redemandé un.
XAFE_DEMANDE_PERIMEE_S = 900
# Lectures de la file par tour, au plus. Chaque lecture doit clore des lignes
# ou écarter une carte de plus, donc avancer ; si elle n'avance pas, c'est
# un défaut — et il ne coûte qu'un tour, jamais un fil qui tourne à vide.
LECTURES_PAR_TOUR = 10

# Ce que `fournir_float(iccid)` rend au robot :
#   (operateur, numero)  — la carte a son float chez XAFe ;
#   None                 — la carte n'a pas ENCORE de numéro déclaré : ses
#                          encaissements attendent (Telegram /reglages) ;
#   Attente(motif)       — ils attendent AUSSI, pour une autre raison, que le
#                          journal dit à la place de « pas de numéro » : la
#                          carte n'est pas encore identifiée (le modem n'a pas
#                          lu son IMSI), le numéro déclaré est mal formé… ;
#   SANS_FLOAT           — elle n'en aura JAMAIS : son IMSI nomme un autre
#                          réseau que MTN ou Orange. Rien de ce qu'elle
#                          encaisse n'est destiné à XAFe, la ligne se clôt
#                          ici, sans réseau.
# « Jamais » ne se décide que sur une carte IDENTIFIÉE. Une carte dont le
# modem a bafouillé l'IMSI au démarrage se nomme « SIM inconnue » jusqu'au
# redémarrage ; la première porte la prenait pour un autre réseau et clôturait
# ses encaissements MTN « sans float XAFe », pour toujours. Un état qu'on ne
# connaît pas n'est pas un état qu'on connaît comme défavorable.
SANS_FLOAT = False


class Attente:
    """« Pas encore », avec sa raison : la ligne attend, et le journal dit
    pourquoi — sans quoi le propriétaire irait déclarer un numéro qui est
    déjà là, ou chercher une panne qu'un redémarrage suffit à lever."""

    __slots__ = ("motif",)

    def __init__(self, motif):
        self.motif = str(motif or "")

    def __repr__(self):
        return f"Attente({self.motif!r})"


def _attend(float_):
    """Vrai quand ce que le robot a rendu veut dire « la ligne attend »."""
    return float_ is None or isinstance(float_, Attente)


class PorteMuette(Exception):
    """Réseau coupé, délai, 5xx, JSON illisible : l'appelant garde tout et
    réessaie plus tard."""


class PorteXafe:
    """Dépose les encaissements chez XAFe Exchange. Inerte si non configurée."""

    def __init__(self, url, cle, terminal, journal, pause=PAUSE, anon="",
                 transferts=False, sorties=True):
        self.url = (url or "").rstrip("/")
        self.cle = cle or ""
        self.terminal = terminal or ""
        self.journal = journal
        self.pause = pause
        self.anon = anon or ""
        self.transferts = bool(transferts)
        # Les SORTIES du float (un paiement fait depuis la puce) partent
        # aussi : chez XAFe, elles prouvent un remboursement que l'équipe a
        # payé à la main, par son transaction ID. Elles ne créditent jamais
        # rien. `sorties = non` les garde ici.
        self.sorties = bool(sorties)
        # HTTPS, OU RIEN — la même garde que `Nuage` : cette adresse se tape
        # à la main sur une partition FAT, et un « http:// » enverrait la
        # clé du boîtier en clair sur le réseau mobile. Qui la lit peut
        # faire créditer des comptes. Le « localhost » des harnais reste
        # admis : rien n'y traverse le réseau.
        if self.url and not self.url.startswith("https://"):
            local = self.url.startswith(("http://127.0.0.1", "http://localhost",
                                         "http://[::1]"))
            if not local:
                if journal is not None:
                    journal.evenement(t(
                        "XAFe address refused: it is not https — the terminal "
                        "key would travel in the clear. Fix [xafe] url.",
                        "Adresse XAFe refusée : elle n'est pas en https — la "
                        "clé du boîtier voyagerait en clair. Corrigez "
                        "[xafe] url."))
                self.url = ""
        self.actif = bool(self.url and self.cle and self.terminal)
        self.nom = "xafe"
        self.derniere_erreur = None
        # Crochets posés par le robot.
        self.fournir_numeros = None     # () -> tuple des numéros du terminal
        self.fournir_float = None       # (iccid) -> (op, numero) | None | Attente | SANS_FLOAT
        self.sur_incident = None        # (source_id, erreur)
        # Le crochet du code secret (PR-3) et l'événement d'arrêt n'existent
        # pas ici : un état posé et jamais lu laisse croire qu'un fil
        # l'attend. Ils arriveront avec le code qui les attend.
        self._marche = True
        self._reveil = threading.Event()
        # Le dernier lot lu était PLEIN : la file n'est peut-être pas lue au
        # bout, même si moins de LOT lignes ont été closes (un lot mixte,
        # publicités closes ici et encaissements envoyés). `_pousser_tout`
        # le lit pour enchaîner.
        self._lot_etait_plein = False
        # L'heure de la BASE XAFe (en-tête « Date ») et l'instant monotone où
        # on l'a lue : c'est elle qui signe, pas l'horloge du Pi.
        self._heure_base = None
        self._verrou_heure = threading.Lock()
        # Les cartes dont les lignes ATTENDENT un numéro : la file se lit en
        # les écartant, et chaque tour redemande si elles l'ont reçu.
        self._attendent_un_numero = set()
        # Les avis déjà donnés, une fois par carte et par motif.
        self._sans_numero_signales = set()
        # Un drapeau par avis : une signature refusée le matin ne doit pas
        # faire taire le refus d'un lot l'après-midi.
        self._refus_signale = False
        self._lot_signale = False
        self._file_signalee = False
        # Les cartes dont le crochet `fournir_float` a LEVÉ, par nom d'erreur :
        # ce n'est pas « pas encore de numéro », c'est le robot qui n'a pas su
        # répondre — /statut le dit, au lieu d'envoyer déclarer un numéro qui
        # est déjà là.
        self._crochet_en_panne = {}
        # La prochaine relève des commandes XAFe (horloge monotone).
        self._prochain_releve = 0.0
        # Ce que le GUICHET (relève, réclamation, compte rendu) a posé en
        # dernier dans `derniere_erreur` : c'est cela, et cela seul, qu'un
        # 200 de la relève a le droit d'effacer (`_la_porte_repond`).
        self._posee_par_le_guichet = None

    # ---- l'heure de la base --------------------------------------------------
    def _noter_l_heure(self, reponse):
        try:
            heure = _heure_de_l_en_tete(reponse.headers.get("Date"))
        except Exception:
            return None
        if heure is not None:
            with self._verrou_heure:
                self._heure_base = (heure, time.monotonic())
        return heure

    def heure_de_la_base(self):
        """L'heure de XAFe maintenant, ou None si elle ne l'a jamais dite."""
        with self._verrou_heure:
            if self._heure_base is None:
                return None
            heure, lue_a = self._heure_base
        return heure + timedelta(seconds=time.monotonic() - lue_a)

    def _horodatage_signe(self):
        """Les secondes Unix qui vont dans la signature : celles de la base
        quand on les connaît, sinon celles du Pi (et un 401 nous les
        apprendra)."""
        h = self.heure_de_la_base()
        return int(h.timestamp()) if h is not None else int(time.time())

    @staticmethod
    def _ecart_horloge(heure_serveur):
        return abs(heure_serveur.timestamp() - time.time())

    # ---- la signature ---------------------------------------------------------
    def _signer(self, horodatage, methode, chemin, corps_octets):
        """hex( HMAC-SHA256( clé, horodatage + "." + MÉTHODE + " " + chemin
        + "." + corps ) ) — porte.ts. Le chemin est celui de la porte,
        requête comprise (« totem-commandes/7 », « totem-commandes?type=sms »).

        Signer le corps seul ne suffisait pas : « réclamer » signé pour la
        commande 7 valait cinq minutes pour TOUTES les commandes du boîtier,
        à qui l'aurait capturé."""
        message = (str(int(horodatage)).encode() + b"."
                   + f"{methode.upper()} {chemin}".encode("utf-8")
                   + b"." + corps_octets)
        return hmac.new(self.cle.encode("utf-8"), message,
                        hashlib.sha256).hexdigest()

    def _appel(self, methode, chemin, corps=None, delai=DELAI, _rejoue=False):
        """(statut, json ou None, heure de la base). Lève `PorteMuette` sur
        tout ce qui n'est pas une réponse de la porte.

        UNE sérialisation : les octets signés sont les octets envoyés. La
        porte relit `req.text()` tel quel ; resérialiser de l'autre côté du
        « = » suffirait à être refusé."""
        donnees = (json.dumps(corps, ensure_ascii=False,
                              separators=(",", ":")).encode("utf-8")
                   if corps is not None else b"")
        ts = self._horodatage_signe()
        req = urllib.request.Request(f"{self.url}/functions/v1/{chemin}",
                                     data=donnees or None, method=methode)
        req.add_header("x-totem-terminal", self.terminal)
        req.add_header("x-totem-horodatage", str(ts))
        req.add_header("x-totem-signature",
                       self._signer(ts, methode, chemin, donnees))
        req.add_header("Content-Type", "application/json")
        if self.anon:
            req.add_header("apikey", self.anon)
            req.add_header("Authorization", f"Bearer {self.anon}")
        try:
            with urllib.request.urlopen(req, timeout=delai) as rep:
                heure = self._noter_l_heure(rep)
                brut = rep.read()
                return rep.status, (json.loads(brut) if brut else None), heure
        except urllib.error.HTTPError as e:
            # L'en-tête « Date » est là même sur un 401 : c'est ainsi qu'un
            # Pi dont l'heure a des heures de retard apprend celle de XAFe.
            heure = self._noter_l_heure(e)
            try:
                brut = e.read()
                corps_json = json.loads(brut) if brut else None
            except Exception:
                corps_json = None
            if (e.code == 401 and not _rejoue and heure is not None
                    and self._ecart_horloge(heure) > 60):
                return self._appel(methode, chemin, corps, delai, _rejoue=True)
            if e.code >= 500:
                raise PorteMuette(f"{e.code}")
            return e.code, corps_json, heure
        except (urllib.error.URLError, socket.timeout, OSError, ValueError) as e:
            raise PorteMuette(str(e))

    # ---- pousser les encaissements -------------------------------------------
    def _float_de(self, iccid, compte=""):
        """Ce que le robot sait du float de la carte (voir `SANS_FLOAT`). Un
        crochet absent vaut « pas encore » : la ligne attend.

        Un crochet qui LÈVE n'est pas « pas encore de numéro » : la ligne
        attend tout de même (on ne sait rien), mais l'avis est un autre —
        « le robot n'a pas su dire le float » — et /statut le porte. Sinon
        le propriétaire irait déclarer un numéro qui est déjà là. Le nom de
        l'exception sert de CLÉ (l'avis ne se répète pas tant que la panne
        est la même) ; il n'entre pas dans la phrase — le propriétaire n'est
        pas informaticien, et « AttributeError » ne lui dit rien."""
        if not self.fournir_float:
            return None
        try:
            float_ = self.fournir_float(iccid)
        except Exception as e:
            nom = type(e).__name__
            if self._crochet_en_panne.get(iccid) != nom:
                self._crochet_en_panne[iccid] = nom
                self._journaliser(t(
                    f"XAFe: the robot could not tell the float of card "
                    f"{compte or '?'} — a defect on our side, not a number to "
                    "declare; its payments wait.",
                    f"XAFe : le robot n'a pas su dire le float de la carte "
                    f"{compte or '?'} — un défaut de notre côté, pas un numéro "
                    "à déclarer ; ses encaissements attendent."))
            return None
        self._crochet_en_panne.pop(iccid, None)
        return float_

    def _ligne(self, id_local, date, expediteur, texte, compte, iccid, emis_le,
               numeros):
        """La ligne à envoyer (dict) ; la PREUVE d'une ligne à clore ici, sans
        réseau (str : « sans objet », « sans float XAFe ») ; ou None — la
        ligne ATTEND : la carte n'a pas encore de numéro déclaré, ou n'est
        pas encore identifiée, ou la ligne n'a pas de carte du tout.

        L'ANALYSE VIENT D'ABORD. Une pub, un code, un solde, une sortie ne
        regardent pas XAFe, quelle que soit la carte : les premiers jours, la
        porte cherchait le float avant de lire le SMS, et cent publicités
        d'une carte non déclarée attendaient un numéro dont elles n'avaient
        aucun besoin — en tête de file, devant les encaissements des autres."""
        try:
            p = analyser(texte, numeros=numeros)
        except Exception:
            p = None
        if p is None or not p.montant or p.montant <= 0:
            return "sans objet"
        # Une ENTRÉE se crédite chez XAFe ; une SORTIE y prouve un
        # remboursement payé à la main (même ID, même montant, même numéro).
        # Un sens inconnu — un transfert qui nomme ses deux parties, sans nos
        # numéros pour trancher — ne part pas : deviner retournerait l'argent.
        if p.sens not in ("entree", "sortie") or (p.sens == "sortie" and not self.sorties):
            return "sans objet"
        # La COMMISSION d'un agent (« You received the commission of 1350 FCFA
        # for transaction Cash Out… ») est bien de l'argent qui entre sur la
        # puce — TOTEM la compte —, mais ce n'est le paiement d'aucun client :
        # chez XAFe, elle restait « retenue » pour toujours, sans ID ni payeur.
        # Le message entier ne parle que d'elle : son montant EST la commission.
        commission = getattr(p, "commission", None)
        if p.sens == "entree" and commission and commission == p.montant and not p.reference:
            return "sans objet"
        # Sans ICCID, la ligne n'a pas de carte : le modem n'avait pas encore
        # lu la puce quand ce SMS est entré. Aucun float ne peut s'y
        # rattacher — et ce n'est PAS « un autre réseau » : la ligne ATTEND,
        # écartée de la lecture (la file lit au-delà d'elle), avec un avis qui
        # dit quoi faire. Une première porte la clôturait « sans float XAFe »,
        # comme une Camtel : un encaissement réel, perdu pour XAFe sans
        # recours — `remettre_sms_xafe` la rouvrait, le tour suivant la
        # reclôturait à l'identique.
        if not iccid:
            self._attendent_un_numero.add("")
            self._signaler_une_fois_par_carte(("identite", ""), t(
                "XAFe: a payment without an identified card (the modem had not "
                "read the ICCID) waits: it can be tied to no float. Restart the "
                "terminal so the next ones carry their card; for this one, "
                "someone who knows sets the ICCID on the line.",
                "XAFe : un encaissement sans carte identifiée (le modem n'avait "
                "pas lu l'ICCID) attend : il ne peut être rattaché à aucun "
                "float. Redémarrez le boîtier pour que les suivants portent "
                "leur carte ; pour celui-ci, quelqu'un qui sait pose l'ICCID "
                "sur la ligne."))
            return None
        float_ = self._float_de(iccid, compte)
        if float_ is SANS_FLOAT:
            self._signaler_une_fois_par_carte(("float", iccid), t(
                f"XAFe: card {compte or '?'} is on a network without an XAFe "
                "float (neither MTN nor Orange) — what it receives stays here.",
                f"XAFe : la carte {compte or '?'} est d'un réseau sans float "
                "XAFe (ni MTN ni Orange) — ce qu'elle encaisse reste ici."))
            return "sans float XAFe"
        if isinstance(float_, Attente):
            # Elle attend, et le robot dit pourquoi : la phrase est la sienne,
            # jamais « pas de numéro déclaré » — le numéro est peut-être là.
            self._attendent_un_numero.add(iccid)
            self._signaler_une_fois_par_carte(("attente", iccid, float_.motif), t(
                f"XAFe: card {compte or '?'}: {float_.motif} — its payments wait.",
                f"XAFe : la carte {compte or '?'} : {float_.motif} — ses "
                "encaissements attendent."))
            return None
        if float_ is None:
            self._attendent_un_numero.add(iccid)
            if iccid not in self._crochet_en_panne:
                self._signaler_une_fois_par_carte(("numero", iccid), t(
                    f"XAFe: card {compte} has no declared number — its "
                    "payments wait (Telegram /reglages).",
                    f"XAFe : la carte {compte} n'a pas de numéro déclaré — "
                    "ses encaissements attendent (Telegram /reglages)."))
            return None
        return {
            "terminal": self.terminal,
            "source_id": id_local,
            "operateur": float_[0],
            "float_numero": float_[1],
            "sens": p.sens,
            "montant": p.montant,
            # le payeur d'une entrée, le bénéficiaire d'une sortie
            "numero": p.numero,
            # Jamais `p.tiers` : c'est une chaîne traduite (« Inconnu »).
            "tiers": p.nom or p.numero,
            "reference": p.reference,
            "texte": texte,
            "emis_le": _horodatage(emis_le) if emis_le else None,
            "recu_le": _horodatage(date),
        }

    def _cartes_en_attente(self):
        """Les cartes dont les lignes attendent un numéro — redemandé à
        chaque tour : celle qui vient de le recevoir sort de la liste, et
        ses lignes repartent au même tour."""
        for iccid in list(self._attendent_un_numero):
            # Une ligne sans carte ("") ne reçoit jamais de float : on ne
            # redemande rien, elle reste écartée.
            if iccid and not _attend(self._float_de(iccid)):
                self._attendent_un_numero.discard(iccid)
        return tuple(self._attendent_un_numero)

    def pousser_paiements(self):
        """Dépose chez XAFe UN lot d'encaissements qu'il n'a pas tranchés, et
        dit combien de lignes il a CLOSES (crédité, retenu, ignoré, refusé).
        Ce qui est clos ici sans réseau ne compte pas ; ce qui attend se lit
        dans `journal.xafe_en_attente()`.

        La file se lit en écartant les cartes qui attendent leur numéro, et
        au-delà d'un lot entier qui n'a rien donné à envoyer (des lignes
        closes ici, ou retenues) : un encaissement derrière cent publicités
        part à ce tour, pas au suivant. Chaque lecture clôt des lignes ou
        écarte une carte de plus, donc la suivante va plus loin — et si elle
        n'y va pas (un défaut), le tour s'arrête après `LECTURES_PAR_TOUR`
        lots, et avec la porte (`arreter()`) : jamais un fil qui tourne à
        vide sur une file qui ne bouge pas."""
        if not self.actif:
            return 0
        self._lot_etait_plein = False
        numeros = ()
        if self.fournir_numeros:
            try:
                numeros = tuple(self.fournir_numeros())
            except Exception:
                numeros = ()
        ecartees = set(self._cartes_en_attente())
        lectures = 0
        while self._marche:
            if lectures >= LECTURES_PAR_TOUR:
                # Dix lots sans rien à envoyer ni fin de file : la lecture
                # n'avance pas. Un défaut — qu'il ne coûte qu'un tour.
                self.derniere_erreur = "file illisible"
                if not self._file_signalee:
                    self._file_signalee = True
                    self._journaliser(t(
                        "XAFe: the queue gave nothing to send in ten batches "
                        "and did not end — a defect on our side; the round is "
                        "lost, nothing else.",
                        "XAFe : la file n'a rien donné à envoyer en dix lots "
                        "sans finir — un défaut de notre côté ; le tour est "
                        "perdu, rien d'autre."))
                return 0
            lectures += 1
            lignes = self.journal.sms_a_pousser_xafe(LOT, sauf_iccid=ecartees)
            if not lignes:
                # Plus rien à dire à XAFe : une panne d'avant n'est plus
                # d'actualité, /statut ne la répète pas sur une file vide.
                self.derniere_erreur = None
                return 0
            charge, closes = [], []
            for (id_local, date, expediteur, texte, compte, iccid, emis_le) in lignes:
                ligne = self._ligne(id_local, date, expediteur, texte, compte,
                                    iccid, emis_le, numeros)
                if ligne is None:
                    ecartees.add(iccid)
                elif isinstance(ligne, str):
                    closes.append((id_local, ligne))
                else:
                    charge.append(ligne)
            if closes:
                self.journal.marquer_sms_xafe(closes)
            if charge:
                self._lot_etait_plein = len(lignes) >= LOT
                break
            if len(lignes) < LOT:
                self.derniere_erreur = None
                return 0        # la file est lue jusqu'au bout : rien à envoyer
            # Un lot entier, rien à envoyer : chaque ligne est close ou sa
            # carte écartée — la lecture suivante va plus loin.
        else:
            return 0            # la porte s'arrête : le tour avec elle
        try:
            statut, reponse, _ = self._appel("POST", "totem-sms",
                                             {"lignes": charge})
        except PorteMuette as e:
            self.derniere_erreur = str(e)
            return 0
        if statut == 401:
            # La PORTE est fermée, pas la ligne : « reseau », jamais
            # « refuse » (nuage.py en a tiré la leçon).
            self.derniere_erreur = "signature refusée"
            if not self._refus_signale:
                self._refus_signale = True
                self._journaliser(t(
                    "XAFe refuses the terminal signature: wrong key, terminal "
                    "id unknown to XAFe ([xafe] terminal), or clock off by "
                    "more than five minutes. Nothing is lost.",
                    "XAFe refuse la signature du boîtier : clé fausse, "
                    "identifiant du boîtier inconnu de XAFe ([xafe] terminal), "
                    "ou horloge décalée de plus de cinq minutes. Rien n'est "
                    "perdu."))
            return 0
        if statut != 200:
            self.derniere_erreur = f"lot refusé {statut} {reponse!r}"[:300]
            if not self._lot_signale:
                self._lot_signale = True
                self._journaliser(t(
                    f"XAFe refuses the batch ({statut}): a defect on our side, "
                    "nothing is lost.",
                    f"XAFe refuse le lot ({statut}) : un défaut de notre côté, "
                    "rien n'est perdu."))
            return 0
        verdicts = reponse if isinstance(reponse, list) else [reponse]
        a_marquer, erreur_vue = [], None
        for ligne, v in zip(charge, verdicts):
            if not isinstance(v, dict):
                continue
            if v.get("source_id") != ligne["source_id"]:
                # La réponse n'est pas celle de cette ligne — ou ne nomme
                # aucune ligne (la porte ne le fait que pour une ligne vide
                # ou sans `source_id`, que nous n'envoyons jamais). Un verdict
                # qui ne se rattache pas ne clôt rien : la ligne reste.
                continue
            id_local = ligne["source_id"]
            r = v.get("resultat")
            motif = str(v.get("motif") or "")
            if r == "credite":
                ref = v.get("reference") or ""
                a_marquer.append((id_local, f"credite {ref}".strip()))
                self.journal.evenement(t(f"XAFe: SMS {id_local} credited ({ref})",
                                         f"XAFe : SMS {id_local} crédité ({ref})"))
            elif r == "retenue":
                # L'argent est retenu chez XAFe (client pas encore déclaré, ou
                # palier dépassé) : la preuve garde le motif quand il y en a un.
                a_marquer.append((id_local,
                                  f"retenue {v.get('id', '')} {motif}".strip()))
            elif r == "ignore":
                a_marquer.append((id_local, "ignore"))
            elif r == "constatee":
                # Une sortie du float, notée chez XAFe : rapprochée d'un
                # remboursement si son ID y est tapé — sinon montrée à
                # l'équipe comme « sortie sans explication ».
                a_marquer.append((id_local, f"constatee {v.get('sortie') or ''}".strip()))
            elif r == "refuse":
                a_marquer.append((id_local, f"refuse {motif}".strip()))
                self.journal.evenement(t(
                    f"payment {id_local} refused by XAFe, set aside: {motif}",
                    f"paiement {id_local} refusé par XAFe, mis de côté : {motif}"))
                self._alerter(id_local, motif)
            elif r == "erreur":
                erreur_vue = f"moteur : {motif or 'erreur'}"
                self._alerter(id_local, erreur_vue)
            # verdict absent ou inconnu : la ligne reste, on réessaiera.
        self.journal.marquer_sms_xafe(a_marquer)
        self.derniere_erreur = erreur_vue
        return len(a_marquer)

    def _journaliser(self, phrase):
        try:
            self.journal.evenement(phrase)
        except Exception:
            pass

    def _signaler_une_fois_par_carte(self, cle, phrase):
        if cle in self._sans_numero_signales:
            return
        self._sans_numero_signales.add(cle)
        self._journaliser(phrase)

    def _alerter(self, source_id, erreur):
        if self.sur_incident:
            try:
                self.sur_incident(source_id, erreur)
            except Exception:
                pass

    # ---- le guichet (la relève des commandes XAFe) ---------------------------
    # La porte offre à `Pilotage` les mêmes noms qu'un `Nuage` : relever,
    # réclamer, rendre compte. Ce qui est relevé aujourd'hui : les SMS À
    # ENVOYER (le code qui prouve qu'un numéro est à son propriétaire). Les
    # TRANSFERTS — de l'argent à composer — ne le sont pas, même avec
    # `[xafe] transferts = oui` : ils attendent la décision du propriétaire
    # sur le code secret (docs/XAFE.md). Les relever sans savoir les faire
    # les ferait échouer trois fois chez XAFe, qui rendrait leurs XAFe au
    # client.
    #
    # Les identifiants XAFe des SMS sont rendus « sms:<n> » (une chaîne) :
    # `messages_sortants.id` et `commandes.id` sont deux compteurs
    # indépendants chez XAFe, et `commandes.id` de Bonzini un troisième. Un
    # entier nu se confondrait.

    @staticmethod
    def _cible(identifiant):
        """(« sms » | « transferts », n) depuis un identifiant du robot."""
        texte = str(identifiant)
        if texte.startswith("sms:"):
            return "sms", int(texte[4:])
        return "transferts", int(texte)

    def commandes_en_attente(self):
        """Les SMS que XAFe veut faire partir de ce boîtier, au plus une fois
        toutes les `PAS_RELEVE` secondes ; [] sans réseau entre deux.

        Le texte d'un SMS à envoyer porte un code : il ne va JAMAIS au
        journal — ni ici, ni dans `Pilotage` (qui ne journalise que la carte
        et la référence du modem)."""
        if not self.actif:
            return []
        maintenant = time.monotonic()
        if maintenant < self._prochain_releve:
            return []
        self._prochain_releve = maintenant + PAS_RELEVE
        try:
            statut, lignes, _ = self._appel("GET", "totem-commandes?type=sms",
                                            delai=DELAI_RELEVE)
        except PorteMuette as e:
            self._erreur_du_guichet(str(e))
            return []
        if statut == 401:
            # Le même mot que `pousser_paiements` : /statut dit « refuse la
            # signature », pas « injoignable » — XAFe a répondu.
            self._erreur_du_guichet("signature refusée")
            return []
        if statut != 200 or not isinstance(lignes, list):
            self._erreur_du_guichet(f"relève refusée {statut}")
            return []
        self._la_porte_repond()
        demandes = []
        for m in lignes:
            if not isinstance(m, dict) or m.get("id") is None:
                continue
            parametres = {
                "operateur": m.get("operateur"),
                "numero": m.get("numero"),
                "texte": m.get("texte"),
                "par": "xafe",
                "langue": "fr",
            }
            # `messages_sortants` ne porte que l'opérateur aujourd'hui. Le
            # jour où XAFe nomme le float (c'est demandé au contrat), la
            # carte se choisit par lui : on le garde dès qu'il est là.
            if m.get("float_numero"):
                parametres["float_numero"] = m["float_numero"]
            demandes.append({
                "id": f"sms:{m['id']}",
                "type": "sms_xafe",
                "etat": "en_attente",
                "demandee_le": m.get("cree_le"),
                "cle": m.get("cle"),
                "parametres": parametres,
            })
        return demandes

    def _erreur_du_guichet(self, texte):
        """Le guichet pose une erreur — et se souvient que c'est la sienne."""
        self.derniere_erreur = texte
        self._posee_par_le_guichet = texte

    def _la_porte_repond(self):
        """Un 200 sur la relève lève ce que le GUICHET avait posé (« injoignable »,
        « signature refusée », « relève refusée ») — sinon /statut disait
        « injoignable » jusqu'au tour du dépôt, une minute après le retour.

        Et RIEN d'autre. Ce que le dépôt seul sait — une ligne en « erreur »
        chez XAFe (« moteur »), un lot refusé (« lot refusé 400 … »), une file
        qui n'avance plus (« file illisible »), le fil qui a levé
        (« robot ») — tient jusqu'au dépôt suivant : la relève n'en a rien
        vu, elle n'a pas à le démentir. La première version énumérait ce
        qu'elle devait épargner (« moteur », « robot ») et oubliait les deux
        autres : le dépôt posait « lot refusé » toutes les soixante secondes,
        la relève l'effaçait dans les dix, et /statut lisait « 3 en attente »
        sans cause cinquante secondes par minute. On n'efface donc que ce
        qu'on a soi-même posé, tel quel — une liste d'exceptions se complète
        toujours un cas trop tard."""
        posee = self._posee_par_le_guichet
        if posee is not None and self.derniere_erreur == posee:
            self.derniere_erreur = None
        self._posee_par_le_guichet = None

    def reclamer(self, identifiant):
        """Prendre la demande pour soi : XAFe tranche (`update … where etat =
        'en_attente'`, 409 sinon). Rend une `Prise` datée sur l'horloge de
        XAFe, avec la limite XAFe ; False dans tous les autres cas — un 409
        n'est pas une panne, c'est la règle qui tient, et il reste muet. Un
        401 (la signature) ou un 400 (la porte), eux, se NOMMENT dans
        `derniere_erreur` comme au dépôt et à la relève : la demande reste
        « en attente » chez XAFe et sera reprise au tour suivant, rien n'est
        perdu — mais /statut doit dire pourquoi rien ne part."""
        try:
            type_, n = self._cible(identifiant)
        except (TypeError, ValueError):
            return False
        try:
            statut, ligne, heure = self._appel(
                "PATCH", f"totem-commandes/{n}",
                {"type": type_, "etat": "en_cours"})
        except PorteMuette as e:
            self._erreur_du_guichet(str(e))
            return False
        if statut == 409:
            return False
        if statut == 401:
            self._erreur_du_guichet("signature refusée")
            return False
        if statut != 200 or not isinstance(ligne, dict):
            self._erreur_du_guichet(f"réclamation refusée {statut}")
            return False
        depose = ligne.get("demandee_le") or ligne.get("cree_le")
        return Prise(_age_de_la_demande(depose, heure),
                     limite=XAFE_DEMANDE_PERIMEE_S)

    def commande_maj(self, identifiant, champs):
        """Rendre compte à XAFe. Un SMS : « envoye » ou « echoue », avec la
        phrase du robot. Une écriture sans état (le masquage d'un secret —
        XAFe n'en porte pas) ne va nulle part et réussit."""
        etat = (champs or {}).get("etat")
        if etat is None:
            return True
        try:
            type_, n = self._cible(identifiant)
        except (TypeError, ValueError):
            return False
        if type_ == "sms":
            etat_xafe = {"faite": "envoye", "echouee": "echoue"}.get(etat)
            if etat_xafe is None:
                return False
            corps = {"type": "sms", "etat": etat_xafe,
                     "resultat": champs.get("resultat")}
        else:
            corps = {"type": "transferts", "etat": etat,
                     "resultat": champs.get("resultat"),
                     "reference_operateur": champs.get("reference_operateur")}
        # `traitee_le` et `parametres` ne partent pas : la porte les ignore.
        try:
            statut, _, _ = self._appel("PATCH", f"totem-commandes/{n}", corps)
        except PorteMuette as e:
            self._erreur_du_guichet(str(e))
            return False
        return statut == 200

    def commandes_abandonnees(self, avant):
        """XAFe n'offre pas de liste des commandes en cours : [] toujours."""
        return []

    def publier_solde(self, *args, **kwargs):
        return True     # XAFe ne reçoit pas les soldes : c'est la plateforme

    def publier_comptes(self, *args, **kwargs):
        return True

    def publier_raccourcis(self, *args, **kwargs):
        return True

    def enregistrer_terminal(self, *args, **kwargs):
        return True     # chaque appel signé vaut déjà signe de vie chez XAFe

    # ---- le fil ---------------------------------------------------------------
    def reveiller(self):
        """Une ligne vient d'entrer au journal : ne pas attendre la pause."""
        self._reveil.set()

    def demarrer(self):
        if not self.actif:
            return None
        fil = threading.Thread(target=self._boucle, name="porte xafe",
                               daemon=True)
        fil.start()
        return fil

    def arreter(self):
        self._marche = False
        self._reveil.set()

    def _boucle(self):
        while self._marche:
            try:
                self._pousser_tout()
            except Exception as e:
                # Une exception ICI n'est pas XAFe qui se tait : c'est le
                # robot (le journal, un bogue). /statut doit le nommer, sans
                # quoi on chercherait une panne réseau chez XAFe. Le nom de
                # l'exception reste hors de la phrase lue par le propriétaire
                # (`resume`), il sert à qui enquête.
                self.derniere_erreur = f"robot : {type(e).__name__}: {e}"[:300]
            if self._reveil.wait(timeout=self.pause):
                self._reveil.clear()
                time.sleep(DEBOUNCE)

    def _pousser_tout(self):
        """Lot après lot tant que la file n'est pas lue au bout : un lot PLEIN
        clos en entier, ou un lot plein dont une partie s'est close ici (des
        publicités) et l'autre est partie — les encaissements au-delà du
        centième n'attendent pas la pause suivante. Une coupure, ou un lot
        dont rien n'a été clos, rend 0 et sort : on ne relit pas la même file
        en boucle sur une panne."""
        total = 0
        while self._marche:
            envoyes = self.pousser_paiements()
            total += envoyes
            if envoyes <= 0:
                break
            if envoyes < LOT and not self._lot_etait_plein:
                break
            time.sleep(0.2)
        return total

    def resume(self):
        """Ligne d'état pour /statut : dit CE QUI cloche, pas seulement qu'on
        attend — « injoignable » quand XAFe n'a pas répondu, « refuse la
        signature » quand il a répondu 401, « moteur en panne » quand il a
        répondu « erreur » sur une ligne."""
        if not self.actif:
            return t("XAFe disabled", "XAFe désactivé")
        reste = self.journal.xafe_en_attente()
        if self._crochet_en_panne:
            return t("XAFe: the robot cannot tell a card's float (a defect on "
                     f"our side) · {reste} waiting",
                     "XAFe : le robot ne sait pas dire le float d'une carte "
                     f"(défaut de notre côté) · {reste} en attente")
        erreur = self.derniere_erreur
        if erreur == "signature refusée":
            return t(f"XAFe refuses the signature · {reste} waiting",
                     f"XAFe refuse la signature · {reste} en attente")
        if erreur and erreur.startswith("moteur"):
            return t(f"XAFe engine down · {reste} waiting",
                     f"XAFe moteur en panne · {reste} en attente")
        if erreur and erreur.startswith("lot refusé"):
            return t(f"XAFe refuses the batch · {reste} waiting",
                     f"XAFe refuse le lot · {reste} en attente")
        if erreur == "file illisible":
            return t(f"XAFe: queue unreadable (our defect) · {reste} waiting",
                     f"XAFe : file illisible (défaut de notre côté) · {reste} en attente")
        if erreur and erreur.startswith("robot"):
            # Le fil a levé : ce n'est pas le réseau, c'est le robot.
            return t(f"XAFe: the robot failed (a defect on our side) · {reste} waiting",
                     f"XAFe : le robot a échoué (défaut de notre côté) · {reste} en attente")
        if erreur:
            return t(f"XAFe unreachable · {reste} waiting",
                     f"XAFe injoignable · {reste} en attente")
        if not reste:
            return t("XAFe up to date", "XAFe à jour")
        return t(f"XAFe · {reste} waiting", f"XAFe · {reste} en attente")
