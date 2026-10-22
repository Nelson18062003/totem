# -*- coding: utf-8 -*-
"""LA PORTE XAFe, contre un faux guichet qui VÉRIFIE la signature.

Un faux guichet qui accepterait tout ne garderait rien de la porte : il
recopie la vérification de `porte.ts` (trois en-têtes, fenêtre de cinq
minutes, HMAC sur les OCTETS reçus), rend ses verdicts ligne par ligne, et
sait tomber en panne, refuser une signature, ou avancer son horloge de cinq
heures comme la vraie base le ferait devant un Pi sorti d'une coupure.

CE QUE CES TESTS GARDENT :

  A. la signature de Python est celle de `porte.ts` (vecteurs figés, calculés
     ici ET avec `signer()` sous Node 22) ; la sonde du faux guichet refuse
     bien un octet retouché, sinon l'essai ne mesure rien ; signer une
     resérialisation n'est pas signer ce qu'on envoie ; la signature couvre
     la méthode et le chemin — un « réclamer » capturé ne vaut que pour SA
     commande, et la signature d'avant (le corps seul) est refusée ;
  B. une ligne se marque APRÈS le verdict, jamais avant ; un 200 se lit ligne
     par ligne, « erreur » reste en file ; une signature refusée ne jette
     rien ; l'horloge du Pi décalée passe après recalage ; Bonzini et XAFe ne
     se retiennent pas ; un SMS appartient au propriétaire — pub, code,
     solde, sortie ne font aucune requête ; une carte sans numéro retient ses
     lignes — LES SIENNES SEULEMENT, la file des autres cartes ne l'attend
     pas, et une publicité se clôt quelle que soit la carte ; une carte d'un
     autre réseau ne retient rien ; un encaissement derrière cent publicités
     part au même tour ; CENT VINGT encaissements qui attendent ne font pas
     tourner la file sans fin — l'écartement est transmis à la lecture, et
     la lecture est bornée ; un crochet qui lève n'est pas « pas de numéro » ;
     lot après lot tant qu'un lot est plein ; une file vide ne se dit plus
     injoignable ; un verdict désaligné ne marque pas une autre ligne ;
     l'historique ne part pas à la naissance de la colonne ; aucun secret ni
     donnée personnelle au journal ; le réveil est immédiat ; le démarrage du
     robot lance la porte ; sans configuration, rien ne change — et une porte
     active ne change rien à ce qui part chez Bonzini ;
  C. le guichet des SMS à envoyer : relevé (cadencé, [] sans réseau entre
     deux), réclamé (un 409 fait partir en silence), parti par la carte de
     l'opérateur — une seule, sinon refus sans envoyer —, rendu à XAFe
     « envoye » ou « echoue » avec la raison ; un code vieux ne part pas
     (limite XAFe, pas celle de Bonzini) et son témoin ; « peut-être remis »
     quand l'accusé manque ; ni code ni numéro au journal ; les ids XAFe et
     Bonzini ne se confondent pas dans UN seul `Pilotage` ; les transferts ne
     sont pas relevés ; le robot confie la porte au même guichet.

CHAQUE EXIGENCE A SON TÉMOIN : `PorteDAvant` (marque avant la requête),
`PorteToutMarque` (un 200 = tout marqué), `PorteSansRecalage` (ne lit pas
l'heure de la base), `PorteQuiSigneLeMauvaisCorps` (signe une sérialisation,
envoie une autre), `PorteTeteDeFile` (la porte des premiers jours : le float
avant la lecture, un seul lot, personne d'écarté), `PorteSansEcartement` (lit
au-delà du lot mais ne transmet pas les cartes écartées à la lecture : cent
encaissements qui attendent remplissent chaque lot, pour toujours),
`PorteUnSeulLot` (s'arrête après un lot plein), `PorteLotMixteSArrete` (s'arrête
sur un lot plein dont une partie s'est close ici), `PorteSansControleDePosition`
(zippe les verdicts à l'aveugle), `PorteQuiMarqueEnvoye` (touche au drapeau de
Bonzini). Ce sont des copies figées, pas des appels au code du jour.

Lancer :  python3 -m unittest tests.test_xafe -v
"""

import hashlib
import hmac
import json
import os
import re
import sqlite3
import tempfile
import threading
import time
import unittest
from email.utils import formatdate
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import totem.xafe as module_xafe
from totem.analyse_sms import analyser
from totem.nuage import Nuage, _horodatage
from totem.storage import Journal
from totem.xafe import SANS_FLOAT, Attente, PorteXafe

from tests.test_nuage import FauxSupabase

# Vecteurs figés : clé « secret-akwa », horodatage 1760000000. Identiques
# sous `hmac` (Python) et `signer()` (porte.ts, Node 22) — les mêmes que
# `supabase/functions/verifier-la-porte.ts` chez XAFe : si l'un des deux
# côtés change sa façon de signer, l'un des deux harnais tombe.
VECTEURS = (
    ("secret-akwa", 1760000000, "POST", "totem-sms", b'{"source_id":1}',
     "39d1d43fa33a2b411a55c9acd469e95015592ec444780bdf3919d205845863e7"),
    ("secret-akwa", 1760000000, "GET", "totem-commandes?type=sms", b"",
     "15cee40c5d8b04bd7d2fb9c2957573fc1859d2b4f4f3dfc77e355363f09080fd"),
    ("secret-akwa", 1760000000, "PATCH", "totem-commandes/7",
     b'{"type":"transferts","etat":"en_cours"}',
     "d2f0862df695658e7e387a5831dcd4a5e04e4382a19f9550e1dc943cd5ca040b"),
)


def cible(chemin):
    """Ce que la porte signe d'une adresse : le chemin à partir du nom de la
    porte (« totem-… »), requête comprise — `cibleDe` dans porte.ts."""
    url = urlparse(chemin)
    morceaux = [m for m in url.path.split("/") if m]
    debut = next((i for i, m in enumerate(morceaux) if m.startswith("totem-")), 0)
    return "/".join(morceaux[debut:]) + (f"?{url.query}" if url.query else "")


def signer(cle, ts, methode, chemin, corps):
    return hmac.new(cle.encode(), str(ts).encode() + b"."
                    + f"{methode} {cible(chemin)}".encode() + b"." + corps,
                    hashlib.sha256).hexdigest()


SMS_ENTREE = ("Vous avez recu 25 000 FCFA de NGONO Marie (677123456). "
              "Ref: PP0947. Nouveau solde: 900000 FCFA.")
SMS_SORTIE = ("Vous avez envoye 10000 FCFA a 699112233 KAMGA Eric. "
              "Ref: PP0948. Nouveau solde: 890000 FCFA.")
SMS_CODE = "Votre code de confirmation est 483921"
SMS_PUB = "MTN MoMo: profitez de -50% sur vos forfaits ce week-end ! Tapez *123#."
SMS_SOLDE = "Votre solde est de 900000 FCFA."
SMS_DEUX_PARTIES = "Transfert de 5000 FCFA de 677000000 vers 699112233 reussi. Ref: TX1."

ICCID = "89237010000000000011"
ICCID_2 = "89237010000000000022"
ICCID_CAMTEL = "89237070000000000033"


class FausseCarteMTN:
    identifiee = True
    iccid = ICCID
    imsi = "624010000000011"
    operateur = "MTN"
    libelle = "MTN ·0011"
    numero = ""


class FausseCarteMTN2(FausseCarteMTN):
    iccid = ICCID_2
    imsi = "624010000000022"
    libelle = "MTN ·0022"


class FauxXafe:
    """Le guichet XAFe, imité : il vérifie la signature comme `porte.ts`,
    rend des verdicts par ligne, retient ce qu'il a crédité (la MÊME réponse
    revient, « deja »), et sait tomber en panne ou décaler son horloge."""

    def __init__(self, port=0):
        self.cles = {"akwa-1": "secret-akwa"}
        self.decalage = 0.0         # horloge du guichet − horloge de la machine
        self.horloge = time.time    # injectable : la sonde teste la borne EXACTE
        self.en_panne = False
        self.refuser_signatures = 0  # n prochains appels → 401 quoi qu'il arrive
        self.verdicts = {}          # source_id → credite|retenue|ignore|erreur
        self.requetes = []          # (methode, chemin, en-têtes, corps brut, statut)
        self.credites = {}          # (terminal, source_id) → réponse rendue
        self.retenues = {}
        self.commandes = {}         # id → ligne transfert
        self.messages = {}          # id → ligne sms
        self.deja_prises = set()
        self.patches = []           # (chemin, corps dict)
        self.soldes = []            # les soldes reçus seuls (consultations USSD, relevés)
        self.depose_il_y_a = 0.0
        self.verrou = threading.Lock()
        self.compteur = 0
        guichet = self

        class Gestion(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def date_time_string(soi, timestamp=None):
                return formatdate(time.time() + guichet.decalage, usegmt=True)

            def log_message(soi, *args):
                pass

            def _corps(soi):
                taille = int(soi.headers.get("Content-Length", 0) or 0)
                return soi.rfile.read(taille) if taille else b""

            def _repondre(soi, statut, corps):
                charge = json.dumps(corps, ensure_ascii=False).encode("utf-8")
                soi.send_response(statut)
                soi.send_header("Content-Type", "application/json; charset=utf-8")
                soi.send_header("Content-Length", str(len(charge)))
                soi.end_headers()
                soi.wfile.write(charge)

            def _servir(soi, methode):
                brut = soi._corps()
                statut, corps = guichet._traiter(methode, soi.path,
                                                 soi.headers, brut)
                with guichet.verrou:
                    guichet.requetes.append(
                        (methode, soi.path, dict(soi.headers), brut, statut))
                soi._repondre(statut, corps)

            def do_POST(soi):
                soi._servir("POST")

            def do_GET(soi):
                soi._servir("GET")

            def do_PATCH(soi):
                soi._servir("PATCH")

        self.serveur = ThreadingHTTPServer(("127.0.0.1", port), Gestion)
        self.serveur.daemon_threads = True
        threading.Thread(target=lambda: self.serveur.serve_forever(poll_interval=0.05),
                         daemon=True).start()
        self.url = f"http://127.0.0.1:{self.serveur.server_port}"

    def fermer(self):
        self.serveur.shutdown()
        self.serveur.server_close()

    # --- la porte : recopie de `verifier` dans porte.ts ---------------------------------
    def _verifier(self, entetes, methode, chemin, corps_brut):
        terminal = entetes.get("x-totem-terminal")
        ts = entetes.get("x-totem-horodatage")
        signature = entetes.get("x-totem-signature")
        if not terminal or not ts or not signature:
            return None
        if not re.fullmatch(r"[0-9]{1,12}", ts) or not re.fullmatch(r"[0-9a-f]{64}", signature):
            return None
        if abs((self.horloge() + self.decalage) - int(ts)) > 300:
            return None
        cle = self.cles.get(terminal)
        if not cle:
            return None
        attendue = signer(cle, ts, methode, chemin, corps_brut)
        return terminal if hmac.compare_digest(attendue, signature) else None

    def _traiter(self, methode, chemin, entetes, brut):
        with self.verrou:
            if self.en_panne:
                return 503, {"erreur": "en panne"}
            if self.refuser_signatures > 0:
                self.refuser_signatures -= 1
                return 401, {"erreur": "signature refusée"}
        terminal = self._verifier(entetes, methode, chemin, brut)
        if terminal is None:
            return 401, {"erreur": "signature refusée"}
        url = urlparse(chemin)
        try:
            charge = json.loads(brut) if brut else None
        except ValueError:
            return 400, {"erreur": "JSON illisible"}
        if url.path == "/functions/v1/totem-sms" and methode == "POST":
            return self._sms(terminal, charge)
        if url.path.startswith("/functions/v1/totem-commandes"):
            return self._commandes(terminal, methode, url, charge)
        return 404, {"erreur": "inconnu"}

    def _sms(self, terminal, charge):
        # des soldes seuls (0016) : comme la vraie porte, un par un
        if isinstance(charge, dict) and isinstance(charge.get("soldes"), list) and "lignes" not in charge:
            with self.verrou:
                self.soldes.extend(charge["soldes"])
            return 200, {"soldes": [{"solde": "note"} for _ in charge["soldes"]]}
        if isinstance(charge, list):
            lignes, liste = charge, True
        elif isinstance(charge, dict) and isinstance(charge.get("lignes"), list):
            lignes, liste = charge["lignes"], True
        else:
            lignes, liste = [charge], False
        if not lignes or len(lignes) > 200:
            return 400, {"erreur": "un lot va de 1 à 200 lignes"}
        resultats = []
        for l in lignes:
            if not isinstance(l, dict):
                resultats.append({"resultat": "refuse", "motif": "ligne vide"})
                continue
            if "terminal" in l and l["terminal"] != terminal:
                resultats.append({"resultat": "refuse",
                                  "motif": "la ligne n'est pas de ce terminal"})
                continue
            try:
                source_id = int(l["source_id"])
            except (KeyError, TypeError, ValueError):
                resultats.append({"resultat": "refuse", "motif": "source_id manquant"})
                continue
            if l.get("sens") == "sortie":
                # comme la vraie porte (0014) : une sortie du float est notée,
                # jamais créditée — la preuve d'un remboursement payé à la main
                resultats.append({"source_id": source_id, "resultat": "constatee"})
                continue
            if "sens" in l and l["sens"] != "entree":
                resultats.append({"source_id": source_id, "resultat": "ignore",
                                  "motif": "seules les entrées et les sorties d'argent comptent"})
                continue
            with self.verrou:
                cle = (terminal, source_id)
                deja = self.credites.get(cle) or self.retenues.get(cle)
                if deja is not None:
                    resultats.append({**deja, "deja": True})
                    continue
                verdict = self.verdicts.get(source_id, "credite")
                if verdict == "erreur":
                    resultats.append({"source_id": source_id, "resultat": "erreur",
                                      "motif": "moteur en panne"})
                    continue
                if verdict == "refuse":
                    resultats.append({"source_id": source_id, "resultat": "refuse",
                                      "motif": "float inconnu de ce terminal"})
                    continue
                self.compteur += 1
                n = self.compteur
                if verdict == "retenue":
                    r = {"source_id": source_id, "resultat": "retenue", "id": n}
                    self.retenues[cle] = r
                else:
                    r = {"source_id": source_id, "resultat": "credite",
                         "reference": f"XAFe-DP-{n:06d}", "ligne": dict(l)}
                    self.credites[cle] = r
                resultats.append({k: v for k, v in r.items() if k != "ligne"})
        return 200, (resultats if liste else resultats[0])

    def _heure(self, il_y_a=None):
        quand = time.time() + self.decalage - (self.depose_il_y_a if il_y_a is None else il_y_a)
        return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(quand)) + ".1234+00:00"

    def _commandes(self, terminal, methode, url, charge):
        corps = charge if isinstance(charge, dict) else {}
        morceaux = [m for m in url.path.split("/") if m]
        ident = int(morceaux[-1]) if morceaux and morceaux[-1].isdigit() else None
        type_ = str(corps.get("type") or parse_qs(url.query).get("type", ["transferts"])[0])
        if type_ not in ("transferts", "sms"):
            return 400, {"erreur": "type inconnu : transferts ou sms"}
        table = self.messages if type_ == "sms" else self.commandes
        with self.verrou:
            if methode == "GET":
                lignes = []
                for c in table.values():
                    if c.get("etat", "en_attente") != "en_attente":
                        continue
                    if c.get("terminal") not in (None, terminal):
                        continue
                    c = dict(c)
                    cle_date = "cree_le" if type_ == "sms" else "demandee_le"
                    c.setdefault(cle_date, self._heure())
                    lignes.append(c)
                return 200, lignes
            if methode == "PATCH" and ident is not None:
                self.patches.append((url.path, dict(corps)))
                ligne = table.get(ident)
                etat = str(corps.get("etat") or "")
                if etat == "en_cours":
                    if (ligne is None or ligne.get("etat", "en_attente") != "en_attente"
                            or ident in self.deja_prises):
                        return 409, {"erreur": "commande déjà prise ou inconnue"}
                    ligne["etat"] = "en_cours"
                    ligne.setdefault("cree_le" if type_ == "sms" else "demandee_le",
                                     self._heure())
                    return 200, dict(ligne)
                if ligne is None:
                    return 400, {"erreur": "commande inconnue"}
                if ligne.get("etat") in ("faite", "echouee", "envoye", "echoue"):
                    return 200, {"commande": ligne["etat"], "deja": True}
                if type_ == "sms":
                    if etat not in ("envoye", "echoue"):
                        return 400, {"erreur": "etat inconnu"}
                    ligne["etat"] = etat
                    ligne["resultat"] = corps.get("resultat")
                    return 200, {"message": etat}
                if etat == "faite":
                    ligne.update(etat="faite", resultat=corps.get("resultat"),
                                 reference_operateur=corps.get("reference_operateur"))
                    return 200, {"commande": "faite"}
                if etat == "echouee":
                    reprises = ligne.get("reprises", 0) + 1
                    ligne["reprises"] = reprises
                    ligne["resultat"] = corps.get("resultat")
                    if reprises < 3:
                        ligne["etat"] = "en_attente"
                        return 200, {"commande": "en_attente", "reprises": reprises}
                    ligne["etat"] = "echouee"
                    return 200, {"commande": "echouee"}
                return 400, {"erreur": "etat inconnu"}
        return 405, {"erreur": "GET ?type=… ou PATCH /:id"}

    # --- lecture ---------------------------------------------------------------
    def statuts(self):
        with self.verrou:
            return [s for _, _, _, _, s in self.requetes]

    def lignes_recues(self):
        """Les lignes de SMS arrivées au guichet, dans l'ordre."""
        out = []
        with self.verrou:
            for methode, chemin, _, brut, statut in self.requetes:
                if methode == "POST" and "totem-sms" in chemin and statut == 200:
                    charge = json.loads(brut)
                    out.extend(charge["lignes"] if isinstance(charge, dict) else charge)
        return out


# --- les témoins : des copies de ce qu'on refuse, pas le code du jour --------

class PorteDAvant(PorteXafe):
    """LE TÉMOIN : marque tout comme envoyé AVANT la requête — et même sur
    une panne. C'est la faute qu'un pont « optimiste » commet."""

    def pousser_paiements(self):
        if not self.actif:
            return 0
        lignes = self.journal.sms_a_pousser_xafe(100)
        charge = []
        for (i, date, exp, texte, compte, iccid, emis) in lignes:
            l = self._ligne(i, date, exp, texte, compte, iccid, emis, ())
            if isinstance(l, dict):
                charge.append(l)
        if not charge:
            return 0
        self.journal.marquer_sms_xafe([(l["source_id"], "credite ?") for l in charge])
        try:
            self._appel("POST", "totem-sms", {"lignes": charge})
        except module_xafe.PorteMuette as e:
            self.derniere_erreur = str(e)
        return len(charge)


class PorteSansSorties(PorteXafe):
    """TÉMOIN (figé avant 0014) : la porte ne laissait partir que les
    entrées ; un paiement fait depuis la puce était clos « sans objet », et
    rien ne prouvait chez XAFe qu'un remboursement manuel était parti."""

    def _ligne(self, id_local, date, expediteur, texte, compte, iccid, emis_le,
               numeros):
        try:
            p = analyser(texte, numeros=numeros)
        except Exception:
            p = None
        if p is not None and p.sens == "sortie":
            return "sans objet"
        return super()._ligne(id_local, date, expediteur, texte, compte, iccid,
                              emis_le, numeros)


class PorteQuiEnvoieLesCommissions(PorteXafe):
    """TÉMOIN (figé avant la correction) : la porte ne voyait pas qu'un SMS
    ne parlait que d'une commission, et l'envoyait chez XAFe comme un
    encaissement — où elle restait retenue pour toujours."""

    def _ligne(self, *args, **kwargs):
        import totem.xafe as porte_xafe
        vrai = porte_xafe.analyser

        def aveugle(texte, numeros=()):
            p = vrai(texte, numeros=numeros)
            if p is None:
                # La lecture d'AVANT, figée ici : le lecteur d'aujourd'hui range
                # la commission d'Orange à part et ne rend plus rien pour elle —
                # sans cette ligne, le témoin passerait et ne prouverait plus rien.
                m = re.search(r"commission of (\d+) FCFA", texte)
                if m:
                    from totem.analyse_sms import Paiement
                    p = Paiement("entree", int(m.group(1)), texte)
            if p is not None:
                p.commission = None
            return p
        porte_xafe.analyser = aveugle
        try:
            return super()._ligne(*args, **kwargs)
        finally:
            porte_xafe.analyser = vrai


class PorteQuiCroitToutExpediteur(PorteXafe):
    """TÉMOIN (figé avant la correction) : la porte ne regardait pas QUI
    écrivait. Un SMS d'argent tapé sur le téléphone d'un particulier partait
    chez XAFe comme un encaissement (revue d'attaque du 22/10/2026)."""

    @staticmethod
    def _expediteur_douteux(expediteur):
        return False


class PorteToutMarque(PorteXafe):
    """LE TÉMOIN : un 200, et toutes les lignes du lot sont closes, quel que
    soit le verdict de chacune."""

    def pousser_paiements(self):
        if not self.actif:
            return 0
        lignes = self.journal.sms_a_pousser_xafe(100)
        charge = []
        for (i, date, exp, texte, compte, iccid, emis) in lignes:
            l = self._ligne(i, date, exp, texte, compte, iccid, emis, ())
            if isinstance(l, dict):
                charge.append(l)
        if not charge:
            return 0
        try:
            statut, _, _ = self._appel("POST", "totem-sms", {"lignes": charge})
        except module_xafe.PorteMuette:
            return 0
        if statut == 200:
            self.journal.marquer_sms_xafe([(l["source_id"], "credite") for l in charge])
            return len(charge)
        return 0


class PorteSansRecalage(PorteXafe):
    """LE TÉMOIN : ne lit jamais l'heure de la base — signe avec celle du Pi."""

    def _noter_l_heure(self, reponse):
        return None


class PorteQuiSigneLeMauvaisCorps(PorteXafe):
    """LE TÉMOIN : signe `json.dumps(corps)` (séparateurs par défaut) et
    envoie la version compacte. Deux sérialisations du même objet."""

    def _signer(self, horodatage, methode, chemin, corps_octets):
        if corps_octets:
            corps_octets = json.dumps(json.loads(corps_octets)).encode()
        return super()._signer(horodatage, methode, chemin, corps_octets)


class PorteQuiSigneLeCorpsSeul(PorteXafe):
    """LE TÉMOIN : la signature d'avant, horodatage + corps, sans la méthode
    ni le chemin. La porte doit la refuser — sinon rien ne prouve qu'elle
    vérifie ce qu'on croit."""

    def _signer(self, horodatage, methode, chemin, corps_octets):
        return hmac.new(self.cle.encode(), str(int(horodatage)).encode()
                        + b"." + corps_octets, hashlib.sha256).hexdigest()


class PorteTeteDeFile(PorteXafe):
    """LE TÉMOIN : la porte des premiers jours, figée. Elle cherche le float
    AVANT de lire le SMS, lit UN lot par id sans écarter personne, et laisse
    en file ce qu'elle ne sait pas rattacher. Cent lignes d'une carte non
    déclarée — même des publicités — et plus rien ne part pour aucune carte."""

    def _ligne(self, id_local, date, expediteur, texte, compte, iccid, emis_le,
               numeros):
        float_ = None
        if self.fournir_float and iccid:
            try:
                float_ = self.fournir_float(iccid)
            except Exception:
                float_ = None
        if not float_:
            return None
        try:
            p = analyser(texte, numeros=numeros)
        except Exception:
            p = None
        if p is None or p.sens != "entree" or not p.montant or p.montant <= 0:
            return "sans objet"
        return {"terminal": self.terminal, "source_id": id_local,
                "operateur": float_[0], "float_numero": float_[1],
                "sens": "entree", "montant": p.montant, "numero": p.numero,
                "tiers": p.nom or p.numero, "reference": p.reference,
                "texte": texte, "emis_le": _horodatage(emis_le) if emis_le else None,
                "recu_le": _horodatage(date)}

    def pousser_paiements(self):
        if not self.actif:
            return 0
        lignes = self.journal.sms_a_pousser_xafe(100)
        if not lignes:
            return 0
        numeros = tuple(self.fournir_numeros()) if self.fournir_numeros else ()
        charge, sans_objet = [], []
        for (i, date, exp, texte, compte, iccid, emis) in lignes:
            l = self._ligne(i, date, exp, texte, compte, iccid, emis, numeros)
            if l is None:
                continue
            if l == "sans objet":
                sans_objet.append((i, "sans objet"))
            else:
                charge.append(l)
        if sans_objet:
            self.journal.marquer_sms_xafe(sans_objet)
        if not charge:
            return 0
        try:
            statut, reponse, _ = self._appel("POST", "totem-sms", {"lignes": charge})
        except module_xafe.PorteMuette as e:
            self.derniere_erreur = str(e)
            return 0
        if statut != 200:
            return 0
        a_marquer = []
        for l, v in zip(charge, reponse if isinstance(reponse, list) else [reponse]):
            if isinstance(v, dict) and v.get("resultat") == "credite":
                a_marquer.append((l["source_id"], f"credite {v.get('reference', '')}"))
        self.journal.marquer_sms_xafe(a_marquer)
        return len(a_marquer)


class PorteSansEcartement(PorteXafe):
    """LE TÉMOIN : la porte du jour, à UN appel près — `sms_a_pousser_xafe(LOT)`
    sans `sauf_iccid`. Elle écarte les cartes dans sa tête, jamais dans la
    lecture : dès que cent lignes ATTENDENT (pas des publicités, qui se
    closent), chaque lot est fait d'elles, rien ne part, et la lecture
    suivante rend les mêmes cent. Figée AVEC la borne et `_marche`, pour
    qu'un témoin ne tourne pas sans fin dans la batterie : c'est la ligne de
    la carte déclarée qui doit rester à 0, pas le fil qui doit pendre."""

    def pousser_paiements(self):
        if not self.actif:
            return 0
        numeros = tuple(self.fournir_numeros()) if self.fournir_numeros else ()
        ecartees = set(self._cartes_en_attente())
        lectures = 0
        while self._marche:
            if lectures >= module_xafe.LECTURES_PAR_TOUR:
                return 0
            lectures += 1
            lignes = self.journal.sms_a_pousser_xafe(module_xafe.LOT)   # sans sauf_iccid
            if not lignes:
                return 0
            charge, closes = [], []
            for (i, date, exp, texte, compte, iccid, emis) in lignes:
                l = self._ligne(i, date, exp, texte, compte, iccid, emis, numeros)
                if l is None:
                    ecartees.add(iccid)
                elif isinstance(l, str):
                    closes.append((i, l))
                else:
                    charge.append(l)
            if closes:
                self.journal.marquer_sms_xafe(closes)
            if charge:
                break
            if len(lignes) < module_xafe.LOT:
                return 0
        else:
            return 0
        try:
            statut, reponse, _ = self._appel("POST", "totem-sms", {"lignes": charge})
        except module_xafe.PorteMuette as e:
            self.derniere_erreur = str(e)
            return 0
        if statut != 200:
            return 0
        a_marquer = []
        for l, v in zip(charge, reponse if isinstance(reponse, list) else [reponse]):
            if isinstance(v, dict) and v.get("resultat") == "credite":
                a_marquer.append((l["source_id"], f"credite {v.get('reference', '')}"))
        self.journal.marquer_sms_xafe(a_marquer)
        return len(a_marquer)


class PorteUnSeulLot(PorteXafe):
    """LE TÉMOIN : `_pousser_tout` qui s'arrête après le premier lot, plein
    ou non. Après des mois rouverts, la file se viderait à cent lignes par
    pause (une minute) au lieu de partir d'un trait."""

    def _pousser_tout(self):
        total = 0
        while self._marche:
            total += self.pousser_paiements()
            break
        return total


class PorteLotMixteSArrete(PorteXafe):
    """LE TÉMOIN (figé, commit e336e79) : `_pousser_tout` qui s'arrête dès
    que moins de LOT lignes ont été CLOSES — sans regarder si le lot lu était
    plein. Cinquante publicités closes ici et cinquante encaissements partis
    font 50 < LOT : la chaîne s'arrête, et les encaissements au-delà du
    centième attendent la pause suivante."""

    def _pousser_tout(self):
        total = 0
        while self._marche:
            envoyes = self.pousser_paiements()
            total += envoyes
            if envoyes < module_xafe.LOT:
                break
        return total


class PorteSansControleDePosition(PorteXafe):
    """LE TÉMOIN : zippe les verdicts sur les lignes à l'aveugle, sans
    regarder leur `source_id`. Une réponse de moins, et chaque ligne reçoit
    la preuve de sa voisine."""

    def pousser_paiements(self):
        if not self.actif:
            return 0
        lignes = self.journal.sms_a_pousser_xafe(100)
        charge = []
        for (i, date, exp, texte, compte, iccid, emis) in lignes:
            l = self._ligne(i, date, exp, texte, compte, iccid, emis, ())
            if isinstance(l, dict):
                charge.append(l)
        if not charge:
            return 0
        try:
            statut, reponse, _ = self._appel("POST", "totem-sms", {"lignes": charge})
        except module_xafe.PorteMuette:
            return 0
        if statut != 200:
            return 0
        a_marquer = []
        for l, v in zip(charge, reponse if isinstance(reponse, list) else [reponse]):
            if isinstance(v, dict) and v.get("resultat") == "credite":
                a_marquer.append((l["source_id"], f"credite {v.get('reference', '')}"))
        self.journal.marquer_sms_xafe(a_marquer)
        return len(a_marquer)


class PorteQuiClotSansCarte(PorteXafe):
    """TÉMOIN (figé, commit acd8f06) : une ligne sans ICCID est close « sans
    float XAFe », comme une carte d'un autre réseau — un état transitoire
    (le modem n'avait pas encore lu la puce) pris pour un jamais."""

    def _ligne(self, id_local, date, expediteur, texte, compte, iccid, emis_le,
               numeros):
        if not iccid:
            try:
                p = analyser(texte, numeros=numeros)
            except Exception:
                p = None
            if p is None or p.sens != "entree" or not p.montant or p.montant <= 0:
                return "sans objet"
            return "sans float XAFe"
        return super()._ligne(id_local, date, expediteur, texte, compte, iccid,
                              emis_le, numeros)


class PorteQuiMarqueEnvoye(PorteXafe):
    """LE TÉMOIN : une porte qui toucherait au drapeau de BONZINI (`envoye`).
    Bonzini ne recevrait plus rien — « un drapeau ne se réunit pas »."""

    def pousser_paiements(self):
        lignes = self.journal.sms_a_pousser_xafe(100)
        self.journal.marquer_sms_envoyes([l[0] for l in lignes])
        return super().pousser_paiements()


class PorteQuiEffaceParListe(PorteXafe):
    """TÉMOIN figé (commit 410fc03) : la relève d'avant effaçait sur un 200
    tout ce que `derniere_erreur` portait, sauf ce qu'une LISTE lui disait
    d'épargner (« moteur », « robot »). « lot refusé » et « file illisible »
    n'y étaient pas : le dépôt les posait toutes les soixante secondes, la
    relève les effaçait dans les dix, et /statut lisait « 3 en attente »
    sans cause cinquante secondes par minute."""

    def _la_porte_repond(self):
        erreur = self.derniere_erreur or ""
        if not erreur.startswith(("moteur", "robot")):
            self.derniere_erreur = None


class HoteMuet:
    """Un hébergeur en panne, ou une route 3G morte : il ACCEPTE la connexion
    et ne répond jamais. Ce n'est pas « connexion refusée » (qui échoue en
    une milliseconde) : c'est le cas qui tient un GET jusqu'à son délai."""

    def __init__(self):
        import socket
        self._prise = socket.socket()
        self._prise.bind(("127.0.0.1", 0))
        self._prise.listen(64)
        self._prise.settimeout(0.2)
        self.url = f"http://127.0.0.1:{self._prise.getsockname()[1]}"
        self.connexions = []
        self._ouvert = True
        threading.Thread(target=self._accueillir, daemon=True).start()

    def _accueillir(self):
        import socket
        while self._ouvert:
            try:
                c, _ = self._prise.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            self.connexions.append(c)      # gardée ouverte, jamais servie

    def fermer(self):
        self._ouvert = False
        for c in self.connexions:
            try:
                c.close()
            except OSError:
                pass
        self._prise.close()


# --- aides -------------------------------------------------------------------

_JOURNAUX = []


def _journal():
    """Un journal en mémoire, fermé en fin de module : sans cela, chacun
    laissait un « ResourceWarning: unclosed database » au ramassage."""
    journal = Journal(":memory:")
    _JOURNAUX.append(journal)
    return journal


def tearDownModule():
    for journal in _JOURNAUX:
        try:
            journal.conn.close()
        except Exception:
            pass


def journal_avec_carte(numero="677000000"):
    journal = _journal()
    journal.voir_carte(FausseCarteMTN())
    if numero:
        journal.definir_identite(ICCID, numero=numero)
    return journal


def journal_deux_cartes():
    """Deux cartes MTN dans le boîtier ; SEULE la ·0022 est déclarée chez
    XAFe — le cas ordinaire à la mise en service."""
    journal = _journal()
    journal.voir_carte(FausseCarteMTN())
    journal.voir_carte(FausseCarteMTN2())
    journal.definir_identite(ICCID_2, numero="677000022")
    return journal


def porte(guichet, journal, classe=PorteXafe, **kw):
    p = classe(guichet.url, "secret-akwa", "akwa-1", journal, **kw)
    p.fournir_numeros = lambda: tuple(journal.numeros_declares())
    p.fournir_float = (lambda iccid: ("mtn", journal.identite(iccid)[0])
                       if journal.identite(iccid)[0] else None)
    return p


def _attendre(condition, delai=10):
    fin = time.monotonic() + delai
    while time.monotonic() < fin:
        if condition():
            return True
        time.sleep(0.05)
    return condition()


def _dans_un_fil(appel, delai=10):
    """(terminé, résultat) : `appel()` joué dans un fil joint à `delai`. Un
    fil encore vivant est un ÉCHEC de l'essai (« la file tourne sans fin »),
    pas un blocage de la batterie."""
    boite = {}
    fil = threading.Thread(target=lambda: boite.setdefault("r", appel()), daemon=True)
    fil.start()
    fil.join(delai)
    return (not fil.is_alive()), boite.get("r")


def _etat(journal, id_):
    return journal.conn.execute(
        "SELECT COALESCE(envoye_xafe,0), xafe_reponse, COALESCE(envoye,0) "
        "FROM sms WHERE id = ?", (id_,)).fetchone()


def _evenements(journal):
    return [t for (t,) in journal.conn.execute("SELECT texte FROM evenements")]


class Banc(unittest.TestCase):
    def setUp(self):
        self._debounce = module_xafe.DEBOUNCE
        module_xafe.DEBOUNCE = 0
        self.guichets, self.portes = [], []

    def tearDown(self):
        for p in self.portes:
            p.arreter()
        for g in self.guichets:
            g.fermer()
        module_xafe.DEBOUNCE = self._debounce

    def guichet(self):
        g = FauxXafe()
        self.guichets.append(g)
        return g

    def porte(self, guichet, journal, classe=PorteXafe, **kw):
        p = porte(guichet, journal, classe, **kw)
        self.portes.append(p)
        _JOURNAUX.append(journal)
        return p


# =============================================================================
# A. LA SIGNATURE
# =============================================================================

class TestLaSignature(Banc):

    def test_la_signature_python_est_celle_de_la_porte(self):
        p = PorteXafe("http://127.0.0.1:1", "secret-akwa", "akwa-1", _journal())
        for cle, ts, methode, chemin, corps, attendue in VECTEURS:
            self.assertEqual(p._signer(ts, methode, chemin, corps), attendue)
            # la sonde du faux guichet signe comme la porte, elle aussi
            self.assertEqual(signer(cle, ts, methode,
                                    f"/functions/v1/{chemin}", corps), attendue)
        # TÉMOIN : la même charge, sérialisée avec les séparateurs par défaut,
        # ne donne PAS la même signature — c'est pourquoi on sérialise une fois.
        autre = json.dumps({"source_id": 1}).encode()
        self.assertNotEqual(autre, VECTEURS[0][4])
        self.assertNotEqual(p._signer(1760000000, "POST", "totem-sms", autre),
                            VECTEURS[0][5])

    def test_la_sonde_du_faux_guichet(self):
        """Si le faux guichet accepte ou refuse tout, l'essai ne mesure rien."""
        import urllib.error
        import urllib.request
        g = self.guichet()
        corps = b'{"lignes":[{"source_id":1,"sens":"entree","montant":1}]}'
        # L'horloge du faux est FIGÉE pour la sonde : à l'horloge vraie, la
        # borne à 299 s tombait une fois sur deux quand la requête partait à
        # .998 de la seconde — un rouge sans raison tous les trois cents
        # lancements. Figée, c'est la borne EXACTE de porte.ts qu'on éprouve.
        instant = int(time.time())
        g.horloge = lambda: instant

        def envoyer(corps_signe, corps_envoye, age=0, entetes=True):
            ts = str(instant - age)
            sig = signer("secret-akwa", ts, "POST", "/functions/v1/totem-sms",
                         corps_signe)
            req = urllib.request.Request(f"{g.url}/functions/v1/totem-sms",
                                         data=corps_envoye, method="POST")
            if entetes:
                req.add_header("x-totem-terminal", "akwa-1")
                req.add_header("x-totem-horodatage", ts)
                req.add_header("x-totem-signature", sig)
            try:
                with urllib.request.urlopen(req, timeout=5) as r:
                    return r.status
            except urllib.error.HTTPError as e:
                return e.code

        message = "le faux guichet accepte ou refuse tout : l'essai ne mesure rien"
        self.assertEqual(envoyer(corps, corps), 200, message)
        retouche = corps.replace(b'"montant":1', b'"montant":2')
        self.assertEqual(envoyer(corps, retouche), 401, message)
        self.assertEqual(envoyer(corps, corps, entetes=False), 401, message)
        self.assertEqual(envoyer(corps, corps, age=301), 401, message)
        self.assertEqual(envoyer(corps, corps, age=300), 200, message)
        self.assertEqual(envoyer(corps, corps, age=-300), 200, message)
        self.assertEqual(envoyer(corps, corps, age=-301), 401, message)

    def test_temoin_une_reserialisation_est_refusee(self):
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal, PorteQuiSigneLeMauvaisCorps)
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertIn(401, g.statuts())
        self.assertEqual(_etat(journal, 1)[0], 0, "la ligne n'est pas close")

    def test_temoin_la_signature_d_avant_est_refusee(self):
        """La signature d'avant ne couvrait que l'horodatage et le corps. La
        porte doit la refuser : la dépose comme la relève."""
        g = self.guichet()
        g.messages = {3: message_xafe()}
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal, PorteQuiSigneLeCorpsSeul)
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(_etat(journal, 1)[0], 0, "la ligne n'est pas close")
        self.assertEqual(p.commandes_en_attente(), [])
        self.assertFalse(p.reclamer("sms:3"))
        self.assertEqual(set(g.statuts()), {401})
        self.assertEqual(g.messages[3].get("etat", "en_attente"), "en_attente")

    def test_un_patch_capture_ne_vaut_que_pour_sa_commande(self):
        """#54 : un « réclamer » capturé pour la commande 3, rejoué tel quel
        sur la 4 ou sur un autre guichet dans les cinq minutes, est refusé.
        Rejoué sur la 3, il retombe sur la règle (déjà prise, 409)."""
        import urllib.error
        import urllib.request
        g = self.guichet()
        g.messages = {3: message_xafe(), 4: message_xafe()}
        p = self.porte(g, journal_avec_carte())
        self.assertTrue(p.reclamer("sms:3"))
        methode, chemin, entetes, brut, statut = g.requetes[-1]
        self.assertEqual((methode, statut), ("PATCH", 200))

        def rejouer(vers, methode="PATCH"):
            req = urllib.request.Request(f"{g.url}{vers}", data=brut, method=methode)
            for nom in ("x-totem-terminal", "x-totem-horodatage",
                        "x-totem-signature", "Content-Type"):
                req.add_header(nom, {k.lower(): v for k, v in entetes.items()}[nom.lower()])
            try:
                with urllib.request.urlopen(req, timeout=5) as r:
                    return r.status
            except urllib.error.HTTPError as e:
                return e.code

        self.assertEqual(rejouer("/functions/v1/totem-commandes/4"), 401)
        self.assertEqual(rejouer("/functions/v1/totem-commandes/4?type=sms"), 401)
        self.assertEqual(rejouer(chemin, "POST"), 401)
        self.assertEqual(g.messages[4].get("etat", "en_attente"), "en_attente",
                         "la commande 4 n'a été réclamée par personne")
        self.assertEqual(rejouer(chemin), 409, "la sonde rejoue vraiment la bonne requête")


# =============================================================================
# B. POUSSER LES ENCAISSEMENTS
# =============================================================================

class TestPousser(Banc):

    def test_un_sms_d_argent_part_signe_et_entier(self):
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal)
        self.assertEqual(p.pousser_paiements(), 1)
        methode, chemin, entetes, brut, statut = g.requetes[0]
        self.assertEqual(statut, 200)
        for nom in ("x-totem-terminal", "x-totem-horodatage", "x-totem-signature"):
            self.assertIn(nom, {k.lower() for k in entetes})
        ligne = g.lignes_recues()[0]
        recu_le = ligne.pop("recu_le")
        self.assertRegex(recu_le, r"[+-]\d\d:\d\d$")
        self.assertEqual(ligne, {
            "terminal": "akwa-1", "source_id": 1, "operateur": "mtn",
            "float_numero": "677000000", "sens": "entree", "montant": 25000,
            "numero": "677123456", "tiers": "NGONO Marie", "reference": "PP0947",
            "texte": SMS_ENTREE, "emis_le": None,
            # le « nouveau solde » que l'opérateur annonce : la parité chez XAFe
            "solde_apres": 900000})
        self.assertNotIn("carte", ligne)
        self.assertEqual(_etat(journal, 1), (1, "credite XAFe-DP-000001", 0))

    def test_l_heure_reseau_part_avec_son_fuseau(self):
        """`emis_le` (TP-SCTS, l'heure RÉSEAU du SMS) est un champ du contrat
        (`p_emis_le` chez XAFe) : un encaissement d'il y a trois heures doit
        garder SON heure chez XAFe, avec son fuseau — sans quoi Supabase le
        lit en UTC et le décale. `"emis_le": None` survivait à tous les
        tests : aucun n'écrivait l'heure réseau au journal."""
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID,
                    emis_le="2026-10-13T06:15:00")
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        self.assertEqual(self.porte(g, journal).pousser_paiements(), 2)
        datee, sans = g.lignes_recues()
        self.assertRegex(datee["emis_le"], r"^2026-10-13T06:15:00[+-]\d\d:\d\d$")
        self.assertEqual(datee["emis_le"], _horodatage("2026-10-13T06:15:00"),
                         "la même conversion que Bonzini : un seul fuseau")
        self.assertIsNone(sans["emis_le"], "sans heure réseau, rien n'est inventé")

    def test_le_tiers_n_est_jamais_la_chaine_traduite(self):
        """`tiers` = nom ou numéro, JAMAIS `p.tiers` : c'est une chaîne
        traduite (« Inconnu » / « Unknown ») que XAFe prendrait pour le nom
        d'un payeur. Les deux ne divergent que sans nom ET sans numéro — un
        cas qu'aucun SMS des tests ne joue : on le fabrique au lecteur."""
        class Lecture:
            sens, montant, numero, nom, reference = "entree", 5000, None, None, "R1"
            tiers = "Inconnu"
        vrai = module_xafe.analyser
        module_xafe.analyser = lambda texte, numeros=(): Lecture()
        try:
            p = PorteXafe("http://127.0.0.1:1", "k", "akwa-1", _journal())
            p.fournir_float = lambda iccid: ("mtn", "677000000")
            ligne = p._ligne(1, "2026-10-13 10:00:00", "X", "n'importe quoi",
                             "MTN ·0011", ICCID, None, ())
        finally:
            module_xafe.analyser = vrai
        self.assertIsInstance(ligne, dict)
        self.assertIsNone(ligne["tiers"], "« Inconnu » est parti chez XAFe comme un nom")
        self.assertEqual(ligne["montant"], 5000)

    def test_actif_exige_un_terminal(self):
        """La troisième condition de `actif` : URL et clé ne suffisent pas,
        la porte refuse une ligne sans terminal. En service, `config.charger`
        retombe toujours sur le nom de [cloud] ; ici, on retire ce filet."""
        journal = _journal()
        p = PorteXafe("https://xafe.exemple.cm", "k", "", journal)
        self.assertFalse(p.actif)
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertIsNone(p.demarrer())

    def test_une_exception_du_robot_ne_se_dit_pas_injoignable(self):
        """Le fil attrape tout ; `str(e)` posé tel quel faisait dire
        « XAFe injoignable » à /statut pour une erreur sqlite ou un bogue du
        robot — on cherchait une panne réseau chez XAFe. L'objet n'est pas
        le réseau, et la ligne d'état le nomme."""
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal, pause=3600)

        def leve():
            raise sqlite3.OperationalError("database is locked")
        p._pousser_tout = leve
        fil = p.demarrer()
        self.assertTrue(_attendre(lambda: bool(p.derniere_erreur), delai=5))
        p.arreter()
        fil.join(10)
        self.assertTrue(p.derniere_erreur.startswith("robot"), p.derniere_erreur)
        self.assertTrue("le robot a échoué" in p.resume() or "robot failed" in p.resume(),
                        p.resume())
        self.assertFalse("injoignable" in p.resume() or "unreachable" in p.resume())
        self.assertEqual(g.requetes, [], "rien n'est parti : la panne est locale")
        # TÉMOIN : `str(e)` posé tel quel se lit « injoignable ».
        p.derniere_erreur = "database is locked"
        self.assertTrue("injoignable" in p.resume() or "unreachable" in p.resume(),
                        "LE TÉMOIN PASSE : une erreur locale nue ne se lit plus "
                        "« injoignable », l'essai ne mesure rien")

    def test_la_cle_anon_part_en_en_tetes_quand_elle_est_donnee(self):
        """La passerelle Supabase (verify_jwt) refuse une requête sans
        `apikey`/`Authorization` AVANT la porte : le symptôme serait « XAFe
        refuse la signature » pour toujours, et le journal tromperait.
        Rendue muette (`if self.anon:` → jamais), la batterie restait verte."""
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal, anon="cle-anon")
        self.assertEqual(p.pousser_paiements(), 1)
        entetes = {k.lower(): v for k, v in g.requetes[0][2].items()}
        self.assertEqual(entetes.get("apikey"), "cle-anon")
        self.assertEqual(entetes.get("authorization"), "Bearer cle-anon")
        # Sans clé anon (la porte ouverte), aucun des deux.
        g2 = self.guichet()
        j2 = journal_avec_carte()
        j2.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        self.assertEqual(self.porte(g2, j2).pousser_paiements(), 1)
        entetes = {k.lower() for k in g2.requetes[0][2]}
        self.assertNotIn("apikey", entetes)
        self.assertNotIn("authorization", entetes)

    def exigences_de_la_coupure(self, classe):
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal, classe)
        manques = []
        g.en_panne = True
        if p.pousser_paiements() != 0:
            manques.append("une panne compte comme un envoi")
        if len(journal.sms_a_pousser_xafe(100)) != 1:
            manques.append("la ligne a quitté la file pendant la panne")
        if p.derniere_erreur is None:
            manques.append("la panne n'est pas notée")
        if not ("waiting" in p.resume() or "en attente" in p.resume()):
            manques.append(f"le résumé ne dit pas l'attente : {p.resume()}")
        g.en_panne = False
        if p.pousser_paiements() != 1:
            manques.append("le retour du réseau n'envoie pas la ligne")
        if p.pousser_paiements() != 0:
            manques.append("la ligne repart une seconde fois")
        if len(g.credites) != 1:
            manques.append(f"{len(g.credites)} crédit(s) au lieu d'un")
        # À LA MAIN : renvoyer la même ligne — la même réponse, « deja ».
        ligne = g.lignes_recues()[0] if g.lignes_recues() else None
        if ligne:
            statut, rep, _ = p._appel("POST", "totem-sms", {"lignes": [ligne]})
            if not (statut == 200 and rep[0].get("deja") is True
                    and rep[0].get("reference") == "XAFe-DP-000001"):
                manques.append(f"le rejeu ne rend pas la même réponse : {rep}")
            if len(g.credites) != 1:
                manques.append("le rejeu a crédité une seconde fois")
        return manques

    def test_une_coupure_ne_perd_rien_et_ne_double_rien(self):
        self.assertEqual(self.exigences_de_la_coupure(PorteXafe), [])
        temoin = self.exigences_de_la_coupure(PorteDAvant)
        self.assertNotEqual(temoin, [],
                            "LE TÉMOIN PASSE : la porte d'avant tient les mêmes "
                            "exigences, l'essai ne mesure rien")

    def test_les_verdicts_se_lisent_ligne_par_ligne(self):
        g = self.guichet()
        journal = journal_avec_carte()
        for _ in range(4):
            journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        g.verdicts = {1: "credite", 2: "ignore", 3: "erreur", 4: "refuse"}
        # Le faux ne rend « ignore » que sur un sens ≠ entree : on force la
        # ligne 2 à l'octet près, comme le ferait un verdict de la porte.
        vrai_sms = g._sms

        def sms_force(terminal, charge):
            statut, res = vrai_sms(terminal, charge)
            for r in res:
                if r.get("source_id") == 2:
                    r.clear()
                    r.update({"source_id": 2, "resultat": "ignore"})
            return statut, res
        g._sms = sms_force
        p = self.porte(g, journal)
        incidents = []
        p.sur_incident = lambda i, e: incidents.append((i, e))
        self.assertEqual(p.pousser_paiements(), 3)
        self.assertEqual(_etat(journal, 1)[:2], (1, "credite XAFe-DP-000001"))
        self.assertEqual(_etat(journal, 2)[:2], (1, "ignore"))
        self.assertEqual(_etat(journal, 3)[0], 0, "« erreur » doit rester en file")
        self.assertEqual(_etat(journal, 4)[0], 1)
        self.assertTrue(_etat(journal, 4)[1].startswith("refuse "))
        self.assertEqual(sorted(i for i, _ in incidents), [3, 4])
        evts = _evenements(journal)
        refuses = [e for e in evts if "refusé par XAFe" in e or "refused by XAFe" in e]
        self.assertTrue(any(" 4 " in e for e in refuses), evts)
        self.assertFalse(any(" 3 " in e for e in refuses), evts)
        # Le verdict « erreur » se LIT dans /statut par la vraie porte — pas
        # par un `derniere_erreur` posé à la main : rendue muette, cette
        # écriture laissait la batterie verte.
        self.assertTrue((p.derniere_erreur or "").startswith("moteur"), p.derniere_erreur)
        self.assertTrue("moteur en panne" in p.resume() or "engine down" in p.resume(),
                        p.resume())
        g.verdicts[3] = "credite"
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(_etat(journal, 3)[0], 1)
        self.assertEqual(len(g.lignes_recues()[-1:]), 1)
        self.assertEqual(g.lignes_recues()[-1]["source_id"], 3)
        self.assertIsNone(p.derniere_erreur)
        self.assertIn(p.resume(), ("XAFe à jour", "XAFe up to date"))
        # TÉMOIN : un 200 = tout marqué → la ligne « erreur » est close.
        g2 = self.guichet()
        j2 = journal_avec_carte()
        for _ in range(3):
            j2.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        g2.verdicts = {3: "erreur"}
        self.porte(g2, j2, PorteToutMarque).pousser_paiements()
        self.assertEqual(_etat(j2, 3)[0], 1,
                         "LE TÉMOIN PASSE : marquer tout sur un 200 laisse la "
                         "ligne en file, l'essai ne mesure rien")

    def test_une_signature_refusee_ne_jette_rien(self):
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal)
        g.refuser_signatures = 1
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(_etat(journal, 1)[0], 0)
        self.assertEqual(p.derniere_erreur, "signature refusée")
        refus = [e for e in _evenements(journal)
                 if "refuse la signature" in e or "refuses the terminal signature" in e]
        self.assertEqual(len(refus), 1)
        self.assertEqual(p.pousser_paiements(), 1)
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        g.refuser_signatures = 1
        self.assertEqual(p.pousser_paiements(), 0)
        refus = [e for e in _evenements(journal)
                 if "refuse la signature" in e or "refuses the terminal signature" in e]
        self.assertEqual(len(refus), 1, "le même avis ne se répète pas")
        self.assertTrue("refuse la signature" in p.resume()
                        or "refuses the signature" in p.resume(), p.resume())
        # Un AUTRE avis, un autre drapeau : après la signature refusée du
        # matin, le refus d'un lot (400, un défaut de notre côté) l'après-midi
        # se journalise encore — un seul drapeau pour les deux l'avalait.
        g._sms = lambda terminal, charge: (400, {"erreur": "lot mal formé"})
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(_etat(journal, 2)[0], 0, "rien n'est jeté")
        lots = [e for e in _evenements(journal)
                if "refuse le lot" in e or "refuses the batch" in e]
        self.assertEqual(len(lots), 1, "le refus du lot est avalé par le drapeau du 401")
        self.assertTrue("refuse le lot" in p.resume() or "refuses the batch" in p.resume(),
                        p.resume())

    def test_l_horloge_du_pi_decalee_passe_apres_recalage(self):
        g = self.guichet()
        g.decalage = 5 * 3600
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal)
        self.assertEqual(p.pousser_paiements(), 1, "un 401 appris se rejoue une fois")
        self.assertEqual(g.statuts(), [401, 200])
        self.assertLess(abs(p.heure_de_la_base().timestamp() - (time.time() + g.decalage)), 5)
        # TÉMOIN : sans recalage, deux 401 et rien n'est parti.
        g2 = self.guichet()
        g2.decalage = 5 * 3600
        j2 = journal_avec_carte()
        j2.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p2 = self.porte(g2, j2, PorteSansRecalage)
        self.assertEqual(p2.pousser_paiements(), 0)
        self.assertEqual(g2.statuts(), [401])

    def test_bonzini_et_xafe_ne_se_retiennent_pas(self):
        serveur = HTTPServer(("127.0.0.1", 0), FauxSupabase)
        threading.Thread(target=lambda: serveur.serve_forever(poll_interval=0.05),
                         daemon=True).start()
        try:
            FauxSupabase.recu = []
            g = self.guichet()
            journal = journal_avec_carte()
            journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
            nuage = Nuage(f"http://127.0.0.1:{serveur.server_address[1]}",
                          "fausse-cle", "douala", journal)
            p = self.porte(g, journal)
            FauxSupabase.en_panne = True
            self.assertEqual(nuage.pousser_paiements(), 0)
            self.assertEqual(p.pousser_paiements(), 1)
            self.assertEqual(_etat(journal, 1), (1, "credite XAFe-DP-000001", 0))
            # L'inverse.
            journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
            FauxSupabase.en_panne = False
            g.en_panne = True
            self.assertEqual(nuage.pousser_paiements(), 2)
            self.assertEqual(p.pousser_paiements(), 0)
            self.assertEqual(_etat(journal, 2), (0, None, 1))
        finally:
            FauxSupabase.en_panne = False
            serveur.shutdown()
            serveur.server_close()

    def _exiger_le_faux_garde_ici(self, porte_cls):
        """N'importe qui peut écrire à la puce. Le faux « vous avez reçu »,
        envoyé d'un téléphone, ne part pas ; le vrai, de l'opérateur, part."""
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("+237699000111", SMS_ENTREE, "MTN ·0011", ICCID)
        journal.sms("237 699 00 01 11", SMS_ENTREE, "MTN ·0011", ICCID)
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal, porte_cls)
        self.assertEqual(p.pousser_paiements(), 1, "seul le SMS de l'opérateur part")
        self.assertEqual(len(g.lignes_recues()), 1)
        for i in (1, 2):
            self.assertEqual(_etat(journal, i)[:2], (1, "expediteur non operateur"))

    def test_un_sms_d_argent_d_un_particulier_ne_part_pas(self):
        self._exiger_le_faux_garde_ici(PorteXafe)

    def test_le_temoin_envoie_le_faux(self):
        with self.assertRaises(AssertionError, msg="LE TÉMOIN PASSE : l'essai ne mesure rien"):
            self._exiger_le_faux_garde_ici(PorteQuiCroitToutExpediteur)

    def test_une_pub_ou_un_code_ne_genere_aucune_requete(self):
        g = self.guichet()
        journal = journal_avec_carte()
        for texte in (SMS_CODE, SMS_PUB, SMS_SOLDE):
            journal.sms("MobileMoney", texte, "MTN ·0011", ICCID)
        p = self.porte(g, journal)
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(g.requetes, [])
        for i in (1, 2, 3):
            self.assertEqual(_etat(journal, i)[:2], (1, "sans objet"))

    def _exiger_la_sortie_constatee(self, porte_cls):
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_SORTIE, "MTN ·0011", ICCID)
        p = self.porte(g, journal, porte_cls)
        self.assertEqual(p.pousser_paiements(), 1, "la sortie part chez XAFe")
        ligne = g.lignes_recues()[0]
        self.assertEqual((ligne["sens"], ligne["montant"], ligne["numero"], ligne["reference"]),
                         ("sortie", 10000, "699112233", "PP0948"),
                         "le bénéficiaire et l'ID : de quoi la rapprocher d'un remboursement")
        self.assertEqual(_etat(journal, 1)[:2], (1, "constatee"))

    def test_une_sortie_part_pour_prouver_un_remboursement(self):
        """Un remboursement payé à la main depuis la puce : le SMS de
        l'opérateur part chez XAFe, qui le rapproche par son transaction ID.
        Il n'y crédite rien (la porte le note « constatee »)."""
        self._exiger_la_sortie_constatee(PorteXafe)

    def test_le_temoin_garde_la_sortie(self):
        with self.assertRaises(AssertionError, msg="LE TÉMOIN PASSE : la porte "
                               "d'avant tient la même exigence, l'essai ne mesure rien"):
            self._exiger_la_sortie_constatee(PorteSansSorties)

    # Deux vrais SMS de la puce Orange du 17/10/2026, numéros changés : la
    # commission de l'agent, puis le retrait du client qui la fait naître.
    SMS_COMMISSION = ("You received the commission of 1350 FCFA for transaction Cash Out "
                      "which is executed from WOULEGE, 699000000 to WONDER PHONE,696103864.")
    SMS_CASH_OUT = ("CashOut success to 699000000 WOULEGE from 696103864 WONDER PHONE. The details "
                    "are as follows: transaction amount: 500000 FCFA, charges: 0 FCFA, commission: "
                    "0 FCFA, TXN id :CO261017.0545.C42162")

    def _exiger_la_commission_gardee_ici(self, porte_cls):
        g = self.guichet()
        journal = journal_avec_carte(numero="696103864")
        journal.sms("OrangeMoney", self.SMS_COMMISSION, "OM ·0011", ICCID)
        journal.sms("OrangeMoney", self.SMS_CASH_OUT, "OM ·0011", ICCID)
        p = self.porte(g, journal, porte_cls)
        self.assertEqual(p.pousser_paiements(), 1, "seul le retrait du client part")
        lignes = g.lignes_recues()
        self.assertEqual([(l["montant"], l["reference"]) for l in lignes], [(500000, "CO261017.0545.C42162")])
        self.assertEqual(_etat(journal, 1)[:2], (1, "sans objet"), "la commission est close ici, sans requête")

    def test_la_commission_d_un_agent_ne_part_pas(self):
        """Une commission entre sur la puce, mais ne paie aucun client : chez
        XAFe, elle restait retenue pour toujours (vu le 17/10/2026)."""
        self._exiger_la_commission_gardee_ici(PorteXafe)

    def test_le_temoin_envoie_la_commission(self):
        with self.assertRaises(AssertionError, msg="LE TÉMOIN PASSE : l'essai ne mesure rien"):
            self._exiger_la_commission_gardee_ici(PorteQuiEnvoieLesCommissions)

    def test_sorties_non_les_garde_ici(self):
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_SORTIE, "MTN ·0011", ICCID)
        p = self.porte(g, journal)
        p.sorties = False
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(g.requetes, [])
        self.assertEqual(_etat(journal, 1)[:2], (1, "sans objet"))

    def test_une_carte_sans_numero_retient_la_ligne(self):
        g = self.guichet()
        journal = journal_avec_carte(numero=None)
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal)
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(g.requetes, [])
        self.assertEqual(_etat(journal, 1)[0], 0)
        avis = [e for e in _evenements(journal)
                if "pas de numéro déclaré" in e or "no declared number" in e]
        self.assertEqual(len(avis), 1)
        self.assertNotIn("677123456", avis[0])
        self.assertNotIn("NGONO", avis[0])
        journal.definir_identite(ICCID, numero="677000000")
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(g.lignes_recues()[0]["float_numero"], "677000000")

    def test_un_sens_inconnu_faute_de_numero_est_clos_sans_objet(self):
        """DÉCISION ÉCRITE (à trancher par le propriétaire à la relecture) :
        la carte est déclarée, l'analyse a eu sa chance.
        Avec nos numéros, le sens est tranché (ici : une SORTIE, sans objet) ;
        sans eux (`fournir_numeros` absent), le sens reste None et la ligne
        est close « sans objet » plutôt que de rester en file pour toujours."""
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_DEUX_PARTIES, "MTN ·0011", ICCID)
        p = self.porte(g, journal)
        # avec nos numéros, c'est une SORTIE : elle part, comme preuve (0014)
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(_etat(journal, 1)[:2], (1, "constatee"))
        self.assertEqual(g.lignes_recues()[0]["sens"], "sortie")
        avant = len(g.requetes)
        journal.sms("MobileMoney", SMS_DEUX_PARTIES, "MTN ·0011", ICCID)
        p.fournir_numeros = None
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(_etat(journal, 2)[:2], (1, "sans objet"))
        self.assertEqual(len(g.requetes), avant, "un sens inconnu ne part pas")

    def test_l_historique_ne_part_pas_a_la_creation_de_la_colonne(self):
        with tempfile.TemporaryDirectory() as dossier:
            chemin = os.path.join(dossier, "journal.db")
            brut = sqlite3.connect(chemin)
            brut.execute("CREATE TABLE sms(id INTEGER PRIMARY KEY, date, expediteur, "
                         "texte, compte, iccid, emis_le, envoye)")
            for i in range(3):
                brut.execute("INSERT INTO sms(date, expediteur, texte, compte, iccid, "
                             "emis_le, envoye) VALUES(?,?,?,?,?,?,1)",
                             ("2026-01-01T10:00:00", "MobileMoney", SMS_ENTREE,
                              "MTN ·0011", ICCID, None))
            brut.commit()
            brut.close()
            journal = Journal(chemin)
            self.assertEqual(journal.sms_a_pousser_xafe(), [])
            for i in (1, 2, 3):
                self.assertEqual(_etat(journal, i)[1], "avant XAFe")
            journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
            self.assertEqual(len(journal.sms_a_pousser_xafe()), 1)
            self.assertEqual(journal.remettre_sms_xafe(depuis_id=2), 3)
            self.assertEqual(len(journal.sms_a_pousser_xafe()), 3)
            journal.conn.close()
            # TÉMOIN : la colonne ajoutée SANS le semis laisse partir les 3.
            chemin2 = os.path.join(dossier, "temoin.db")
            brut = sqlite3.connect(chemin2)
            brut.execute("CREATE TABLE sms(id INTEGER PRIMARY KEY, date, expediteur, "
                         "texte, compte, iccid, emis_le, envoye)")
            for i in range(3):
                brut.execute("INSERT INTO sms(date, texte) VALUES('2026-01-01', ?)",
                             (SMS_ENTREE,))
            brut.execute("ALTER TABLE sms ADD COLUMN envoye_xafe INTEGER DEFAULT 0")
            brut.execute("ALTER TABLE sms ADD COLUMN xafe_reponse TEXT")
            brut.commit()
            brut.close()
            temoin = Journal(chemin2)
            self.assertEqual(len(temoin.sms_a_pousser_xafe()), 3,
                             "LE TÉMOIN PASSE : sans semis, l'historique partirait")
            temoin.conn.close()

    def test_aucun_secret_ni_donnee_personnelle_au_journal(self):
        """Dans les DEUX langues : la batterie tourne en anglais, et une
        donnée glissée dans la seule phrase française — celle qui part au
        journal d'un Pi réglé `langue = fr` — passait inaperçue."""
        from totem import textes
        self.addCleanup(textes.definir_langue, textes.langue_active())
        for langue in ("en", "fr"):
            with self.subTest(langue=langue):
                textes.definir_langue(langue)
                g = self.guichet()
                journal = journal_avec_carte(numero=None)
                journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
                p = self.porte(g, journal)
                p.pousser_paiements()                      # carte sans numéro
                journal.definir_identite(ICCID, numero="677000000")
                g.refuser_signatures = 1
                p.pousser_paiements()                      # signature refusée
                g.verdicts = {1: "refuse"}
                p.pousser_paiements()                      # refus
                journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
                g.verdicts = {}
                p.pousser_paiements()                      # crédit
                journal.sms("MobileMoney", SMS_ENTREE, "Camtel ·0033", ICCID_CAMTEL)
                journal.sms("MobileMoney", SMS_ENTREE, "", "")
                vrai = p.fournir_float
                p.fournir_float = lambda i: SANS_FLOAT if i == ICCID_CAMTEL else vrai(i)
                p.pousser_paiements()                      # sans float, sans ICCID
                journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0022", ICCID_2)
                p.fournir_float = lambda i: Attente("pas encore identifiée") \
                    if i == ICCID_2 else vrai(i)
                p.pousser_paiements()                      # la carte attend, raison dite
                evts = [e for e in _evenements(journal) if "XAFe" in e]
                self.assertGreaterEqual(len(evts), 7, evts)
                for e in evts:
                    self.assertNotIn("secret-akwa", e)
                    self.assertIsNone(re.search(r"[0-9a-f]{64}", e))
                    for interdit in ("677123456", "25000", "25 000", "NGONO", "677000000"):
                        self.assertNotIn(interdit, e)

    def test_inerte_sans_configuration(self):
        journal = _journal()
        p = PorteXafe("", "", "", journal)
        self.assertFalse(p.actif)
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertIsNone(p.demarrer())
        # Le canard que `Pilotage` attend d'un guichet : la relève des
        # commandes XAFe n'est pas branchée, elle rend [] sans réseau.
        self.assertEqual(p.commandes_en_attente(), [])
        self.assertEqual(p.commandes_abandonnees(time.time()), [])
        self.assertEqual(p.resume(), "XAFe désactivé" if "XAFe désactivé" in p.resume()
                         else "XAFe disabled")
        self.assertEqual(_evenements(journal), [])
        # Et Bonzini ne voit aucune différence : le robot SANS porte et le
        # robot avec une porte ACTIVE (qui passe la première) produisent les
        # MÊMES requêtes chez Bonzini. Une première version comparait deux
        # robots sans porte — le même état deux fois, une comparaison qui ne
        # pouvait pas échouer. Le témoin : une porte qui touche au drapeau
        # `envoye` — Bonzini ne reçoit plus rien.
        from tests.test_recus import _robot
        serveur = HTTPServer(("127.0.0.1", 0), FauxSupabase)
        threading.Thread(target=lambda: serveur.serve_forever(poll_interval=0.05),
                         daemon=True).start()

        def releve_bonzini(classe_porte):
            FauxSupabase.recu = []
            robot, compte, modem, j = _robot()
            _JOURNAUX.append(j)
            # Une carte identifiée et DÉCLARÉE, comme une vraie puce : sans
            # ICCID, la ligne attend ici et la porte ne fait aucune requête —
            # la « porte active » n'envoyait rien, et l'essai mesurait moins
            # qu'il ne disait.
            from totem.carte import Carte
            compte.carte = Carte(iccid="89237020000000004432", imsi="624020000000001")
            j.voir_carte(compte.carte)
            j.definir_identite(compte.carte.iccid, numero="696103864")
            guichet = None
            if classe_porte is not None:
                guichet = self.guichet()
                robot.xafe = self.porte(guichet, j, classe_porte)
            # Le même texte dans les deux cas : le simulateur tire un
            # numéro au hasard, et deux relèves ne se compareraient pas.
            modem.sms_en_attente.append((1, modem.service, SMS_ENTREE))
            robot._relever_sms(compte)
            if robot.xafe is not None:
                robot.xafe.pousser_paiements()      # la porte passe D'ABORD
                self.assertEqual(len(guichet.credites), 1,
                                 "la porte active n'a rien déposé chez XAFe : "
                                 "la comparaison ne mesure pas une porte qui passe")
            nuage = Nuage(f"http://127.0.0.1:{serveur.server_address[1]}",
                          "fausse-cle", "douala", j)
            nuage.fournir_numeros = robot._nos_numeros
            nuage.pousser_paiements()
            return [(table, [{k: v for k, v in l.items() if k != "recu_le"}
                             for l in corps])
                    for table, corps in FauxSupabase.recu]

        try:
            sans_porte = releve_bonzini(None)
            self.assertTrue(sans_porte, "aucune requête : la comparaison ne mesure rien")
            self.assertEqual(releve_bonzini(PorteXafe), sans_porte,
                             "une porte XAFe active change ce qui part chez Bonzini")
            self.assertNotEqual(releve_bonzini(PorteQuiMarqueEnvoye), sans_porte,
                                "LE TÉMOIN PASSE : une porte qui marque « envoye » "
                                "ne change rien chez Bonzini, l'essai ne mesure rien")
        finally:
            serveur.shutdown()
            serveur.server_close()

    def test_https_ou_rien(self):
        journal = _journal()
        p = PorteXafe("http://xafe.exemple.cm", "k", "akwa-1", journal)
        self.assertFalse(p.actif)
        self.assertTrue(any("Adresse XAFe refusée" in e or "XAFe address refused" in e
                            for e in _evenements(journal)))
        self.assertTrue(PorteXafe("http://127.0.0.1:9", "k", "akwa-1", journal).actif)
        self.assertTrue(PorteXafe("https://xafe.exemple.cm", "k", "akwa-1", journal).actif)

    def test_resume(self):
        g = self.guichet()
        journal = journal_avec_carte()
        p = self.porte(g, journal)
        self.assertIn(p.resume(), ("XAFe à jour", "XAFe up to date"))
        # Porte ACTIVE : la relève des SMS à envoyer rend [] quand XAFe n'a
        # rien — le guichet lui-même est éprouvé dans `TestLeGuichetDesSms`.
        self.assertEqual(p.commandes_en_attente(), [])
        self.assertEqual(g.statuts(), [200])
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        self.assertIn("2", p.resume())
        self.assertTrue("en attente" in p.resume() or "waiting" in p.resume())
        p.derniere_erreur = "503"
        self.assertTrue("injoignable" in p.resume() or "unreachable" in p.resume())
        self.assertIn("2", p.resume())
        # XAFe a RÉPONDU : ce n'est pas « injoignable », et /statut le dit.
        p.derniere_erreur = "signature refusée"
        self.assertTrue("refuse la signature" in p.resume()
                        or "refuses the signature" in p.resume(), p.resume())
        p.derniere_erreur = "moteur : moteur en panne"
        self.assertTrue("moteur en panne" in p.resume() or "engine down" in p.resume(),
                        p.resume())
        self.assertIn("2", p.resume())


class TestLaFileNeSeBloquePas(Banc):
    """UNE LIGNE QUI ATTEND NE TIENT PAS LA FILE. Scénario prouvé par la
    relecture : deux cartes MTN, seule la ·0022 déclarée ; cent SMS de la
    ·0011 non déclarée, puis UN encaissement de la ·0022 — trois tours, zéro
    requête, « 101 en attente », et le client XAFe jamais crédité. La porte
    cherchait le float AVANT de lire le SMS (des publicités attendaient un
    numéro), et lisait le lot par id sans écarter personne."""

    # Cent vingt-deux encaissements de la carte NON déclarée : PLUS qu'un lot
    # de lignes qui attendent. Avec cinquante seulement, la mutation qui perd
    # l'écartement (`sms_a_pousser_xafe(LOT)` sans `sauf_iccid`) laissait les
    # trente tests verts : le lot de cent contenait encore l'encaissement
    # déclaré. Avec plus de cent, le premier lot n'est fait que de lignes qui
    # attendent, et la lecture suivante rend les mêmes — pour toujours.
    # Les publicités sont dans le PREMIER lot : une publicité derrière le
    # premier lot d'une carte écartée attend avec sa carte (c'est le prix de
    # l'écartement : la carte n'est plus relue ce tour-ci), et se clôt « sans
    # objet » dès que le numéro arrive — elle ne retient personne.
    TEXTES_0011 = [SMS_PUB if (i % 13 == 0 and i < 100) else SMS_ENTREE
                   for i in range(130)]
    ENCAISSEMENTS_QUI_ATTENDENT = TEXTES_0011.count(SMS_ENTREE)      # 122

    def tete_de_file(self, classe):
        """(guichet, journal, porte, id de la ligne déclarée, résultat du
        premier tour, terminé). Le tour se joue dans un FIL joint à dix
        secondes : une file qui tourne sans fin est un échec mesuré, pas une
        batterie qui pend."""
        g = self.guichet()
        journal = journal_deux_cartes()
        # La carte NON déclarée parle la première : cent vingt-deux
        # encaissements, et huit publicités dans le premier lot.
        for texte in self.TEXTES_0011:
            journal.sms("MobileMoney", texte, "MTN ·0011", ICCID)
        declaree = journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0022", ICCID_2)
        p = self.porte(g, journal, classe)
        termine, closes = _dans_un_fil(p.pousser_paiements)
        if not termine:
            p.arreter()         # `while self._marche` : le tour sort avec la porte
        return g, journal, p, declaree, closes, termine

    def test_une_carte_sans_numero_ne_retient_que_ses_lignes(self):
        g, journal, p, declaree, closes, termine = self.tete_de_file(PorteXafe)
        self.assertTrue(termine, "la file tourne sans fin : le tour n'est pas "
                                 "revenu en dix secondes")
        self.assertEqual(closes, 1, "l'encaissement de la carte déclarée part au premier tour")
        self.assertEqual(len(g.requetes), 1)
        self.assertEqual(_etat(journal, declaree)[:2], (1, "credite XAFe-DP-000001"))
        self.assertEqual(g.lignes_recues()[0]["float_numero"], "677000022")
        # Les publicités de la carte non déclarée sont closes SANS attendre
        # un numéro dont elles n'ont aucun besoin ; ses encaissements, eux,
        # attendent — et seulement eux.
        for i, texte in enumerate(self.TEXTES_0011, start=1):
            self.assertEqual(_etat(journal, i)[:2],
                             (1, "sans objet") if texte == SMS_PUB else (0, None), i)
        self.assertEqual(journal.xafe_en_attente(), self.ENCAISSEMENTS_QUI_ATTENDENT)
        avis_sur = lambda: [e for e in _evenements(journal)
                            if "pas de numéro déclaré" in e or "no declared number" in e]
        self.assertEqual(len(avis_sur()), 1)
        self.assertIn("0011", avis_sur()[0])
        self.assertIsNone(p.derniere_erreur, "rien ne cloche : des lignes attendent, c'est tout")
        # Au tour suivant, les lignes retenues ne sont même pas relues : la
        # file les écarte, aucune requête de plus, et l'avis ne se répète pas
        # (la liste est RELUE : affirmée sur l'ancienne, elle ne pouvait pas
        # échouer).
        termine, closes = _dans_un_fil(p.pousser_paiements)
        self.assertTrue(termine and closes == 0, (termine, closes))
        self.assertEqual(len(g.requetes), 1)
        self.assertEqual(len(avis_sur()), 1, "l'avis ne se répète pas")
        # Le numéro arrive (Telegram /reglages) : ses cent vingt lignes partent
        # d'un trait — lot après lot — avec SON float.
        journal.definir_identite(ICCID, numero="677000011")
        termine, envoyes = _dans_un_fil(p._pousser_tout)
        self.assertTrue(termine)
        self.assertEqual(envoyes, self.ENCAISSEMENTS_QUI_ATTENDENT)
        self.assertEqual(journal.xafe_en_attente(), 0)
        self.assertEqual({l["float_numero"] for l in g.lignes_recues()[1:]}, {"677000011"})
        self.assertEqual(len(g.credites), self.ENCAISSEMENTS_QUI_ATTENDENT + 1)
        # TÉMOIN 1 : la porte des premiers jours laisse la ligne déclarée à 0.
        g2, j2, _, declaree2, closes2, termine2 = self.tete_de_file(PorteTeteDeFile)
        self.assertTrue(termine2 and closes2 == 0 and g2.requetes == []
                        and _etat(j2, declaree2)[:2] == (0, None),
                        "LE TÉMOIN PASSE : la porte d'avant dépose la ligne de la "
                        "carte déclarée, l'essai ne mesure rien")
        # TÉMOIN 2 : la porte du jour SANS l'écartement transmis à la lecture.
        # Cent vingt lignes qui attendent remplissent chaque lot ; la ligne
        # déclarée n'est jamais lue. (Figée avec sa borne : elle rend 0 au
        # lieu de pendre — c'est la ligne qu'on regarde, pas le fil.)
        g3, j3, _, declaree3, closes3, termine3 = self.tete_de_file(PorteSansEcartement)
        self.assertFalse(closes3 == 1 and _etat(j3, declaree3)[:2] == (1, "credite XAFe-DP-000001"),
                         "LE TÉMOIN PASSE : sans transmettre les cartes écartées à "
                         "la lecture, la ligne déclarée part quand même — la scène "
                         "ne porte pas assez de lignes qui attendent")
        self.assertEqual(g3.requetes, [], "le témoin n'a rien envoyé : sa file ne bouge pas")

    def test_la_lecture_est_bornee_et_s_arrete_avec_la_porte(self):
        """Si l'écartement se perdait au niveau de la BASE (une lecture qui
        ignore `sauf_iccid`), la porte du jour ne doit pas tourner sans fin :
        dix lots, puis le tour est perdu, dit au journal et à /statut — et
        `arreter()` sort du tour même sans la borne. Sur un Pi, la scène est
        réelle : une carte oubliée dans /reglages avec plus de cent
        encaissements, ou une période rouverte par `remettre_sms_xafe`."""
        g = self.guichet()
        journal = journal_deux_cartes()
        for _ in range(self.ENCAISSEMENTS_QUI_ATTENDENT):
            journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        declaree = journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0022", ICCID_2)
        p = self.porte(g, journal)
        vraie = journal.sms_a_pousser_xafe
        lectures = []

        def sans_ecartement(limite=100, sauf_iccid=()):
            lectures.append(len(sauf_iccid))
            return vraie(limite)                    # la base oublie l'écartement
        journal.sms_a_pousser_xafe = sans_ecartement
        termine, closes = _dans_un_fil(p.pousser_paiements)
        self.assertTrue(termine, "la file tourne sans fin malgré la borne")
        self.assertEqual(closes, 0)
        self.assertEqual(len(lectures), module_xafe.LECTURES_PAR_TOUR)
        self.assertTrue(all(n >= 1 for n in lectures[1:]),
                        "la porte transmettait bien les cartes écartées : c'est la base qui les a perdues")
        self.assertEqual(g.requetes, [])
        self.assertEqual(_etat(journal, declaree)[:2], (0, None), "rien n'est perdu : la ligne attend")
        self.assertEqual(p.derniere_erreur, "file illisible")
        self.assertTrue("file illisible" in p.resume() or "queue unreadable" in p.resume(), p.resume())
        avis = [e for e in _evenements(journal) if "dix lots" in e or "ten batches" in e]
        self.assertEqual(len(avis), 1)
        # Le tour suivant ne répète pas l'avis.
        termine, _ = _dans_un_fil(p.pousser_paiements)
        self.assertTrue(termine)
        self.assertEqual(len([e for e in _evenements(journal) if "dix lots" in e or "ten batches" in e]), 1)
        # Sans la borne, c'est `arreter()` qui sort du tour.
        sauve = module_xafe.LECTURES_PAR_TOUR
        module_xafe.LECTURES_PAR_TOUR = 10 ** 9
        try:
            threading.Timer(0.5, p.arreter).start()
            termine, closes = _dans_un_fil(p.pousser_paiements, delai=10)
        finally:
            module_xafe.LECTURES_PAR_TOUR = sauve
        self.assertTrue(termine, "`arreter()` ne sort pas du tour : le fil tournerait à vide")
        self.assertEqual(closes, 0)
        # La base retrouve l'écartement, la porte repart : la ligne déclarée part.
        journal.sms_a_pousser_xafe = vraie
        p._marche = True
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(_etat(journal, declaree)[:2], (1, "credite XAFe-DP-000001"))

    def test_lot_apres_lot_tant_qu_un_lot_est_plein(self):
        """`_pousser_tout` enchaîne les lots : cent un encaissements d'une
        carte déclarée partent en DEUX requêtes, d'un trait. Retirer la
        condition (`break` inconditionnel) laissait trente tests verts : la
        file se serait vidée à cent lignes par pause."""
        g = self.guichet()
        journal = journal_avec_carte()
        for _ in range(module_xafe.LOT + 1):
            journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal)
        termine, total = _dans_un_fil(p._pousser_tout)
        self.assertTrue(termine)
        self.assertEqual(total, module_xafe.LOT + 1)
        self.assertEqual(len([r for r in g.requetes if r[0] == "POST"]), 2)
        self.assertEqual(journal.xafe_en_attente(), 0)
        self.assertEqual(len(g.credites), module_xafe.LOT + 1)
        # TÉMOIN : un seul lot, et il en reste un.
        g2 = self.guichet()
        j2 = journal_avec_carte()
        for _ in range(module_xafe.LOT + 1):
            j2.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        termine2, total2 = _dans_un_fil(self.porte(g2, j2, PorteUnSeulLot)._pousser_tout)
        self.assertTrue(termine2 and total2 == module_xafe.LOT and j2.xafe_en_attente() == 1,
                        "LE TÉMOIN PASSE : la porte qui s'arrête après un lot vide "
                        "quand même la file, l'essai ne mesure rien")

    def test_un_lot_mixte_ne_coupe_pas_la_chaine(self):
        """Cinquante publicités puis cent encaissements : le premier lot lu
        (plein) clôt cinquante lignes ici et en envoie cinquante — moins que
        LOT. `_pousser_tout` d'avant s'arrêtait là, et les cinquante
        encaissements suivants attendaient la pause (une minute) ou un
        réveil : une période rouverte se vidait à cent lignes par minute au
        lieu de partir d'un trait. Le lot lu était plein : la file n'est pas
        finie, on continue. Une coupure, ou un lot où rien ne se clôt, sort
        toujours — on ne relit pas la même file en boucle sur une panne."""
        def semer(journal):
            for _ in range(50):
                journal.sms("MobileMoney", SMS_PUB, "MTN ·0011", ICCID)
            for _ in range(100):
                journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        g = self.guichet()
        journal = journal_avec_carte()
        semer(journal)
        p = self.porte(g, journal)
        termine, total = _dans_un_fil(p._pousser_tout)
        self.assertTrue(termine)
        self.assertEqual(total, 100)
        self.assertEqual(journal.xafe_en_attente(), 0)
        self.assertEqual(len([r for r in g.requetes if r[0] == "POST"]), 2)
        # Une panne au milieu : la chaîne sort, rien ne tourne à vide.
        g3 = self.guichet()
        j3 = journal_avec_carte()
        semer(j3)
        g3.en_panne = True
        p3 = self.porte(g3, j3)
        termine3, total3 = _dans_un_fil(p3._pousser_tout)
        self.assertTrue(termine3 and total3 == 0, (termine3, total3))
        self.assertEqual(len([r for r in g3.requetes if r[0] == "POST"]), 1,
                         "sur une panne, on ne relit pas la file en boucle")
        self.assertEqual(j3.xafe_en_attente(), 100)
        # TÉMOIN : la chaîne d'avant laisse cinquante encaissements en file.
        g2 = self.guichet()
        j2 = journal_avec_carte()
        semer(j2)
        termine2, total2 = _dans_un_fil(self.porte(g2, j2, PorteLotMixteSArrete)._pousser_tout)
        self.assertTrue(termine2 and total2 == 50 and j2.xafe_en_attente() == 50,
                        "LE TÉMOIN PASSE : la chaîne d'avant vide aussi un lot "
                        "mixte d'un trait, l'essai ne mesure rien")

    def test_un_crochet_qui_leve_n_est_pas_un_numero_manquant(self):
        """`fournir_float` qui LÈVE sur une carte déclarée : la ligne attend
        (on ne sait rien), mais l'avis « pas de numéro déclaré » n'est PAS
        écrit — le propriétaire irait déclarer un numéro qui est déjà là —
        et /statut dit ce qui cloche, pas seulement « en attente »."""
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal)
        vrai = p.fournir_float

        def casse(iccid):
            raise AttributeError("'NoneType' object has no attribute 'carte'")
        p.fournir_float = casse
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(g.requetes, [])
        self.assertEqual(_etat(journal, 1)[:2], (0, None), "la ligne attend : rien n'est perdu")
        evts = _evenements(journal)
        self.assertFalse(any("pas de numéro déclaré" in e or "no declared number" in e
                             for e in evts), evts)
        panne = [e for e in evts if "n'a pas su dire le float" in e or "could not tell the float" in e]
        self.assertEqual(len(panne), 1, evts)
        # On nomme l'objet, pas la technique : « un défaut de notre côté »,
        # jamais le nom d'une classe d'exception, que le propriétaire ne
        # sait pas lire. Le nom reste la CLÉ qui dédoublonne l'avis.
        self.assertTrue("défaut de notre côté" in panne[0] or "defect on our side" in panne[0], panne[0])
        self.assertNotIn("AttributeError", panne[0])
        for interdit in ("677123456", "25000", "25 000", "NGONO", "677000000"):
            self.assertNotIn(interdit, panne[0])
        r = p.resume()
        self.assertTrue("défaut de notre côté" in r or "defect on our side" in r, r)
        self.assertNotIn("AttributeError", r)
        self.assertNotRegex(r, r"^XAFe (· 1 en attente|· 1 waiting)$", "/statut ne dit pas seulement « en attente »")
        self.assertEqual(p._crochet_en_panne, {ICCID: "AttributeError"}, "la clé garde le détail")
        # L'avis ne se répète pas tant que l'erreur est la même.
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(len([e for e in _evenements(journal)
                              if "n'a pas su dire le float" in e or "could not tell the float" in e]), 1)
        # Le crochet réparé : la ligne part au tour même, et /statut se rassoit.
        p.fournir_float = vrai
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(_etat(journal, 1)[:2], (1, "credite XAFe-DP-000001"))
        self.assertIn(p.resume(), ("XAFe à jour", "XAFe up to date"))

    def test_une_file_vide_ne_se_dit_plus_injoignable(self):
        """Après une panne, un tour qui n'a plus rien à dire à XAFe (file
        vide, ou tout clos ici) remet /statut d'aplomb : une porte qui n'a
        plus rien à envoyer n'est pas « injoignable »."""
        g = self.guichet()
        journal = journal_avec_carte()
        p = self.porte(g, journal)
        p.derniere_erreur = "503"
        journal.sms("MobileMoney", SMS_PUB, "MTN ·0011", ICCID)      # close ici, sans réseau
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertIsNone(p.derniere_erreur)
        self.assertIn(p.resume(), ("XAFe à jour", "XAFe up to date"))
        p.derniere_erreur = "503"
        self.assertEqual(p.pousser_paiements(), 0)                 # file vide
        self.assertIn(p.resume(), ("XAFe à jour", "XAFe up to date"))
        # Mais une ligne qui attend VRAIMENT une réponse garde la panne.
        g.en_panne = True
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertTrue("injoignable" in p.resume() or "unreachable" in p.resume(), p.resume())

    def test_une_carte_d_un_autre_reseau_ne_retient_rien(self):
        """Une carte Camtel ou Nexttel n'a pas de float XAFe — et n'en aura
        jamais : attendre un numéro serait attendre pour toujours. Elle se
        clôt ici, sans réseau, avec une preuve qui le dit.

        Mais une ligne SANS ICCID n'est pas « d'un autre réseau » : le modem
        n'avait pas lu la puce quand ce SMS est entré. C'est un encaissement
        réel, d'une carte peut-être MTN — il ATTEND (0), écarté de la
        lecture, avec un avis qui dit quoi faire ; il ne retient pas les
        autres. La porte d'avant le clôturait « sans float XAFe », comme une
        Camtel : perdu pour XAFe sans recours (`remettre_sms_xafe` le
        rouvrait, le tour suivant le reclôturait). C'est son témoin."""
        g = self.guichet()
        journal = journal_deux_cartes()
        camtel = journal.sms("MobileMoney", SMS_ENTREE, "Camtel ·0033", ICCID_CAMTEL)
        sans_carte = journal.sms("MobileMoney", SMS_ENTREE, "", "")
        pub = journal.sms("MobileMoney", SMS_PUB, "Camtel ·0033", ICCID_CAMTEL)
        pub_sans_carte = journal.sms("MobileMoney", SMS_PUB, "", "")
        declaree = journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0022", ICCID_2)
        p = self.porte(g, journal)
        vrai = p.fournir_float
        p.fournir_float = (lambda iccid: SANS_FLOAT if iccid == ICCID_CAMTEL
                           else vrai(iccid))
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(len(g.requetes), 1)
        self.assertEqual([l["source_id"] for l in g.lignes_recues()], [declaree])
        self.assertEqual(_etat(journal, camtel)[:2], (1, "sans float XAFe"))
        self.assertEqual(_etat(journal, pub)[:2], (1, "sans objet"))
        self.assertEqual(_etat(journal, pub_sans_carte)[:2], (1, "sans objet"),
                         "une pub sans carte n'attend rien : l'analyse vient d'abord")
        self.assertEqual(_etat(journal, sans_carte)[:2], (0, None),
                         "un encaissement sans carte ATTEND, il n'est pas perdu")
        self.assertEqual(journal.xafe_en_attente(), 1)
        avis_sur = lambda: [e for e in _evenements(journal)
                            if "sans float XAFe" in e or "without an XAFe float" in e
                            or "sans carte identifiée" in e or "without an identified card" in e]
        avis = avis_sur()
        self.assertEqual(len(avis), 2, ("un avis par cause : la Camtel, et la sans-carte", avis))
        # Deux causes, deux phrases : « la carte Orange … ni MTN ni Orange »
        # se contredisait pour le propriétaire — et « sans float » sur une
        # carte qu'on n'a pas identifiée affirmait ce qu'on ne sait pas.
        sans_carte_avis = [e for e in avis if "sans carte identifiée" in e
                           or "without an identified card" in e]
        self.assertEqual(len(sans_carte_avis), 1, avis)
        self.assertTrue("ICCID" in sans_carte_avis[0]
                        and ("Redémarrez" in sans_carte_avis[0] or "Restart" in sans_carte_avis[0]),
                        ("l'avis dit quoi faire", sans_carte_avis[0]))
        self.assertTrue(any(("ni MTN ni Orange" in e or "neither MTN nor Orange" in e) and "0033" in e
                            for e in avis), avis)
        self.assertFalse(any("pas de numéro déclaré" in e or "no declared number" in e
                             for e in _evenements(journal)),
                         "une ligne sans carte n'a pas « un numéro à déclarer »")
        for e in avis:
            for interdit in ("677123456", "25000", "25 000", "NGONO"):
                self.assertNotIn(interdit, e)
        # Au tour suivant : la ligne sans carte est ÉCARTÉE de la lecture
        # (aucune requête, la file lit au-delà d'elle), l'avis ne se répète
        # pas, et un encaissement déclaré derrière elle part quand même.
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(len(avis_sur()), 2, "l'avis ne se répète pas (la liste est RELUE)")
        self.assertEqual(len(g.requetes), 1)
        derriere = journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0022", ICCID_2)
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(_etat(journal, derriere)[:2], (1, "credite XAFe-DP-000002"))
        self.assertEqual(_etat(journal, sans_carte)[:2], (0, None))
        self.assertIsNone(p.derniere_erreur, "rien ne cloche : une ligne attend, c'est tout")
        # Quelqu'un qui sait pose l'ICCID sur la ligne : elle part au tour
        # même, avec le float de SA carte — c'est le recours que l'avis nomme.
        journal.conn.execute("UPDATE sms SET iccid = ? WHERE id = ?", (ICCID_2, sans_carte))
        journal.conn.commit()
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(_etat(journal, sans_carte)[:2], (1, "credite XAFe-DP-000003"))
        self.assertEqual(g.lignes_recues()[-1]["float_numero"], "677000022")
        self.assertEqual(journal.xafe_en_attente(), 0)
        # TÉMOIN : la porte d'avant clôt la ligne sans carte « sans float
        # XAFe » — et la reclôt après `remettre_sms_xafe`.
        g2, j2 = self.guichet(), journal_deux_cartes()
        perdue = j2.sms("MobileMoney", SMS_ENTREE, "", "")
        p2 = self.porte(g2, j2, PorteQuiClotSansCarte)
        p2.pousser_paiements()
        self.assertEqual(_etat(j2, perdue)[:2], (1, "sans float XAFe"),
                         "LE TÉMOIN PASSE : la porte d'avant laisse aussi attendre "
                         "la ligne sans carte, l'essai ne mesure rien")
        self.assertEqual(j2.remettre_sms_xafe(depuis_id=perdue), 1)
        p2.pousser_paiements()
        self.assertEqual(_etat(j2, perdue)[:2], (1, "sans float XAFe"),
                         "le témoin est censé reclore ce qu'on rouvre — sans recours")
        self.assertEqual(g2.requetes, [])

    def test_une_carte_pas_encore_identifiee_attend_et_dit_pourquoi(self):
        """Le robot rend `Attente(motif)` : la carte est là, avec son ICCID,
        mais il ne sait pas encore ce qu'elle est (IMSI non lu) — ou son
        numéro déclaré est mal formé. La ligne attend comme « sans numéro »,
        n'est pas close, ne retient pas les autres cartes ; et l'avis est
        CELUI DU ROBOT, jamais « pas de numéro déclaré » : le propriétaire
        irait déclarer un numéro qui est déjà là. Le motif ne porte rien du
        SMS. Dès que le robot sait, la ligne part au tour même."""
        g = self.guichet()
        journal = journal_deux_cartes()
        journal.definir_identite(ICCID, numero="677000011")
        attend = journal.sms("MobileMoney", SMS_ENTREE, "SIM inconnue ·0011", ICCID)
        pub = journal.sms("MobileMoney", SMS_PUB, "SIM inconnue ·0011", ICCID)
        declaree = journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0022", ICCID_2)
        p = self.porte(g, journal)
        vrai = p.fournir_float
        motif = "le robot ne l'a pas encore identifiée (le modem n'a pas lu son IMSI) — redémarrez le boîtier"
        p.fournir_float = lambda i: Attente(motif) if i == ICCID else vrai(i)
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual([l["source_id"] for l in g.lignes_recues()], [declaree])
        self.assertEqual(_etat(journal, attend)[:2], (0, None), "la ligne attend, rien n'est perdu")
        self.assertEqual(_etat(journal, pub)[:2], (1, "sans objet"))
        self.assertEqual(journal.xafe_en_attente(), 1)
        evts = _evenements(journal)
        avis = [e for e in evts if motif in e]
        self.assertEqual(len(avis), 1, evts)
        self.assertIn("0011", avis[0])
        self.assertTrue("encaissements attendent" in avis[0] or "payments wait" in avis[0], avis[0])
        self.assertFalse(any("pas de numéro déclaré" in e or "no declared number" in e
                             or "sans float" in e or "without an XAFe float" in e for e in evts), evts)
        for interdit in ("677123456", "25000", "25 000", "NGONO", "677000011"):
            self.assertNotIn(interdit, avis[0])
        self.assertIsNone(p.derniere_erreur)
        # Tour suivant : écartée, pas relue, l'avis ne se répète pas.
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(len(g.requetes), 1)
        self.assertEqual(len([e for e in _evenements(journal) if motif in e]), 1)
        # Le robot sait enfin (le boîtier a redémarré) : la ligne part, avec
        # SON float — et la carte sort de la liste des écartées au même tour.
        p.fournir_float = vrai
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(_etat(journal, attend)[:2], (1, "credite XAFe-DP-000002"))
        self.assertEqual(g.lignes_recues()[-1]["float_numero"], "677000011")
        self.assertEqual(journal.xafe_en_attente(), 0)

    def test_cent_publicites_devant_un_encaissement_partent_au_meme_tour(self):
        """Carte déclarée, cent publicités puis un encaissement : UN appel le
        dépose. La porte d'avant rendait 0 (les cent closes « sans objet »,
        l'encaissement pas même lu) et le déposait au tour suivant — sur des
        mois rouverts, la file se vidait à cent lignes par minute."""
        g = self.guichet()
        journal = journal_avec_carte()
        for _ in range(100):
            journal.sms("MobileMoney", SMS_PUB, "MTN ·0011", ICCID)
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p = self.porte(g, journal)
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(journal.xafe_en_attente(), 0)
        self.assertEqual(len(g.requetes), 1)
        # TÉMOIN : la porte d'avant s'arrête au bout du premier lot.
        g2 = self.guichet()
        j2 = journal_avec_carte()
        for _ in range(100):
            j2.sms("MobileMoney", SMS_PUB, "MTN ·0011", ICCID)
        j2.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        self.assertTrue(self.porte(g2, j2, PorteTeteDeFile).pousser_paiements() == 0
                        and j2.xafe_en_attente() == 1,
                        "LE TÉMOIN PASSE : la porte d'avant lit déjà au-delà du "
                        "lot, l'essai ne mesure rien")

    def test_un_verdict_desaligne_ne_marque_pas_une_autre_ligne(self):
        """Le contrôle `source_id` est la seule garde contre une réponse
        désalignée (une ligne de moins, un ordre différent) : sans lui, la
        MAUVAISE ligne serait close avec la référence d'une autre. Retiré,
        les tests d'avant passaient tous."""
        g = self.guichet()
        journal = journal_avec_carte()
        for _ in range(3):
            journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        vrai_sms = g._sms

        def desaligne(terminal, charge):
            statut, res = vrai_sms(terminal, charge)
            return statut, [res[2], res[1]]     # la première perdue, les autres à l'envers
        g._sms = desaligne
        p = self.porte(g, journal)
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(_etat(journal, 2)[:2], (1, "credite XAFe-DP-000002"))
        self.assertEqual(_etat(journal, 1)[:2], (0, None), "la ligne 1 n'a pas de verdict : elle reste")
        self.assertEqual(_etat(journal, 3)[:2], (0, None))
        # Au tour suivant, la porte rend la MÊME réponse (« deja ») : chaque
        # ligne reçoit sa propre référence.
        g._sms = vrai_sms
        self.assertEqual(p.pousser_paiements(), 2)
        self.assertEqual(_etat(journal, 1)[:2], (1, "credite XAFe-DP-000001"))
        self.assertEqual(_etat(journal, 3)[:2], (1, "credite XAFe-DP-000003"))
        self.assertEqual(len(g.credites), 3)
        # TÉMOIN : zipper à l'aveugle donne à la ligne 1 la référence de la 3.
        g2 = self.guichet()
        j2 = journal_avec_carte()
        for _ in range(3):
            j2.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        vrai2 = g2._sms
        g2._sms = lambda terminal, charge: (lambda s, r: (s, [r[2], r[1]]))(*vrai2(terminal, charge))
        self.porte(g2, j2, PorteSansControleDePosition).pousser_paiements()
        self.assertEqual(_etat(j2, 1)[:2], (1, "credite XAFe-DP-000003"),
                         "LE TÉMOIN PASSE : zipper à l'aveugle ne trompe pas la "
                         "ligne 1, l'essai ne mesure rien")


# =============================================================================
# C. LE GUICHET : les SMS que XAFe confie au boîtier
# =============================================================================

TEXTE_CODE = "XAFe Exchange : votre code est 123456. Il vaut 10 minutes."


def message_xafe(ident=3, operateur="mtn", numero="699112233", texte=TEXTE_CODE,
                 float_numero=None):
    m = {"id": ident, "terminal": None, "operateur": operateur, "numero": numero,
         "texte": texte, "etat": "en_attente", "cle": f"num-{ident}-1"}
    if float_numero is not None:
        # `messages_sortants` ne le porte pas encore ; le jour où XAFe nomme
        # le float, la ligne le portera à plat, comme l'opérateur.
        m["float_numero"] = float_numero
    return m


class PilotageDAvant:
    """TÉMOIN figé : la résolution d'avant, par opérateur SEUL — le
    `float_numero` d'une ligne n'était pas même relevé. Posé sur un
    `Pilotage` du jour (`_candidats_xafe` remplacé), il doit refuser un SMS
    dont le float est pourtant nommé."""

    @staticmethod
    def candidats(pilotage, parametres):
        return pilotage._comptes_de_l_operateur(parametres.get("operateur"))


def compte_mtn(carte=None):
    from tests.test_pilotage import FauxCompte
    return FauxCompte([], libelle="MTN ·0011", carte=carte or FausseCarteMTN())


def _patches_sms(guichet, ident):
    return [(chemin, corps) for chemin, corps in guichet.patches
            if chemin.endswith(f"/totem-commandes/{ident}")]


class PorteSansSoldes(PorteXafe):
    """Le témoin : la porte d'avant, qui jetait les soldes (« XAFe ne reçoit
    pas les soldes »). Les mêmes exigences doivent échouer sur elle."""

    def publier_solde(self, *args, **kwargs):
        return True


class TestLesSoldesDesFloats(Banc):
    """La colonne « floats » de la parité chez XAFe : le solde que
    l'opérateur annonce, sans réseau dans l'appel, le plus récent gagnant."""

    def _exiger_le_solde_publie(self, classe):
        g = self.guichet()
        journal = journal_avec_carte()
        p = self.porte(g, journal, classe)
        debut = time.monotonic()
        p.publier_solde(ICCID, 1250000, moment="2026-10-17T09:00:00+01:00")
        self.assertLess(time.monotonic() - debut, 0.05, "aucun réseau dans l'appel")
        self.assertEqual(g.requetes, [], "rien ne part avant le tour de la porte")
        p._pousser_tout()
        self.assertEqual(g.soldes, [{"operateur": "mtn", "float_numero": "677000000",
                                     "solde": 1250000.0, "annonce_le": "2026-10-17T09:00:00+01:00"}])
        p._pousser_tout()
        self.assertEqual(len(g.soldes), 1, "un solde parti ne repart pas")

    def test_un_solde_annonce_part_au_tour_suivant(self):
        self._exiger_le_solde_publie(PorteXafe)

    def test_le_temoin_jette_le_solde(self):
        with self.assertRaises(AssertionError, msg="LE TÉMOIN PASSE : l'essai ne mesure rien"):
            self._exiger_le_solde_publie(PorteSansSoldes)

    def test_un_solde_plus_ancien_ne_remplace_pas_un_plus_recent(self):
        g = self.guichet()
        p = self.porte(g, journal_avec_carte())
        p.publier_solde(ICCID, 500, moment="2026-10-17T10:00:00+01:00")
        p.publier_solde(ICCID, 400, moment="2026-10-17T08:00:00+01:00")   # un relevé rejoué en retard
        p._pousser_tout()
        self.assertEqual([x["solde"] for x in g.soldes], [500.0])

    def test_une_carte_sans_numero_garde_son_solde_pour_plus_tard(self):
        g = self.guichet()
        journal = journal_avec_carte(numero=None)
        p = self.porte(g, journal)
        p.publier_solde(ICCID, 700)
        p._pousser_tout()
        self.assertEqual(g.soldes, [], "pas de float connu : rien ne part")
        journal.definir_identite(ICCID, numero="677000000")
        p._pousser_tout()
        self.assertEqual([x["solde"] for x in g.soldes], [700.0], "le numéro déclaré, le solde part")

    def test_un_solde_negatif_ou_illisible_ne_part_jamais(self):
        g = self.guichet()
        p = self.porte(g, journal_avec_carte())
        self.assertFalse(p.publier_solde(ICCID, -1))
        self.assertFalse(p.publier_solde(ICCID, "beaucoup"))
        self.assertFalse(p.publier_solde("", 100))
        p._pousser_tout()
        self.assertEqual(g.soldes, [])

    def test_xafe_muet_ne_perd_pas_le_solde(self):
        g = self.guichet()
        p = self.porte(g, journal_avec_carte())
        p.publier_solde(ICCID, 900)
        g.en_panne = True
        p._pousser_tout()
        g.en_panne = False
        p._pousser_tout()
        self.assertEqual([x["solde"] for x in g.soldes], [900.0], "repris au tour suivant")


class TestLeGuichetDesSms(Banc):
    """Un SMS à envoyer : relevé chez XAFe, réclamé, parti par la carte de
    l'opérateur, et XAFe prévenu — sans que le code n'entre au journal."""

    def setUp(self):
        super().setUp()
        self._pas = module_xafe.PAS_RELEVE
        module_xafe.PAS_RELEVE = 0

    def tearDown(self):
        module_xafe.PAS_RELEVE = self._pas
        super().tearDown()

    def pilote(self, guichet, journal, comptes):
        from totem.pilotage import Pilotage
        p = self.porte(guichet, journal)
        return p, Pilotage(None, comptes, journal, guichets=[p])

    def jouer(self, porte, pilotage):
        """Relève puis exécute, comme la boucle le ferait : rend les demandes."""
        demandes = porte.commandes_en_attente()
        for d in demandes:
            pilotage._traiter(d, porte)
        return demandes

    def test_un_sms_a_envoyer_part_par_la_carte_de_l_operateur(self):
        g = self.guichet()
        g.messages = {3: message_xafe()}
        journal = journal_avec_carte()
        compte = compte_mtn()
        porte, pilotage = self.pilote(g, journal, [compte])
        demandes = self.jouer(porte, pilotage)
        self.assertEqual([d["id"] for d in demandes], ["sms:3"])
        self.assertEqual(demandes[0]["type"], "sms_xafe")
        self.assertEqual(compte.sms_envoyes, [("699112233", TEXTE_CODE)])
        self.assertEqual(_patches_sms(g, 3), [
            ("/functions/v1/totem-commandes/3", {"type": "sms", "etat": "en_cours"}),
            ("/functions/v1/totem-commandes/3",
             {"type": "sms", "etat": "envoye", "resultat": "remis au réseau (réf. 1)"}),
        ])
        self.assertEqual(g.messages[3]["etat"], "envoye")
        # Le code et le numéro ne sont nulle part au journal.
        for e in _evenements(journal):
            self.assertNotIn("123456", e)
            self.assertNotIn("699112233", e)
        self.assertTrue(any("MTN ·0011" in e and ("réf. 1" in e or "ref. 1" in e)
                            for e in _evenements(journal)), _evenements(journal))
        # Un second tour ne le renvoie pas : il n'est plus en attente.
        self.assertEqual(self.jouer(porte, pilotage), [])
        self.assertEqual(len(compte.sms_envoyes), 1)

    def test_la_demande_porte_sa_carte_et_va_dans_sa_file(self):
        """Le CÂBLAGE, pas le helper : c'est `_distribuer` qui doit nommer la
        carte avant de choisir la file. La première version de ce test
        appelait `_nommer_la_carte` elle-même puis lisait `_cle_de_file` :
        `_distribuer` pouvait oublier l'appel sans qu'un test rougisse — et la
        demande partait dans la file commune, un second fil sur la même puce.
        Ici la demande passe par `_distribuer`, et c'est le registre des
        files qu'on lit."""
        g = self.guichet()
        g.messages = {3: message_xafe()}
        journal = journal_avec_carte()
        compte = compte_mtn()
        porte, pilotage = self.pilote(g, journal, [compte])
        d = porte.commandes_en_attente()[0]
        self.assertNotIn("carte", d["parametres"], "XAFe ne nomme pas la carte")
        # Le fil de la file ne démarre pas : on lit le REGISTRE, et il doit
        # être figé par construction. Avec le vrai `_servir` et `_marche`
        # faux, ce fil sautait sa boucle et retirait la file du registre dès
        # qu'il obtenait le verrou — l'assertion ne tenait que parce que le
        # fil principal gardait la main jusqu'à elle (vérifié : un
        # `time.sleep(0)` entre les deux lignes la faisait échouer). Un test
        # dont la vérité dépend d'une course n'est pas une mesure.
        pilotage._servir = lambda *a: None
        pilotage._distribuer(d, porte)
        self.assertEqual(d["parametres"].get("carte"), ICCID)
        self.assertEqual(list(pilotage._files), [ICCID])
        self.assertEqual(pilotage._files[ICCID].get_nowait(), (porte, d))

    def test_temoin_un_distribuer_qui_oublie_la_carte_va_dans_la_file_commune(self):
        """Le même essai, sur un `Pilotage` dont `_nommer_la_carte` ne fait
        rien (la mutation faite à la main sur `_distribuer`) : la demande
        doit aller dans la file commune — sinon l'assertion du test
        précédent ne mesure rien."""
        from totem.pilotage import FILE_COMMUNE
        g = self.guichet()
        g.messages = {3: message_xafe()}
        journal = journal_avec_carte()
        compte = compte_mtn()
        porte, pilotage = self.pilote(g, journal, [compte])
        pilotage._nommer_la_carte = lambda demande: None
        pilotage._servir = lambda *a: None      # le registre, figé (voir ci-dessus)
        d = porte.commandes_en_attente()[0]
        pilotage._distribuer(d, porte)
        self.assertNotIn("carte", d["parametres"])
        self.assertEqual(list(pilotage._files), [FILE_COMMUNE],
                         "LE TÉMOIN PASSE : sans nommer la carte, la demande "
                         "trouve quand même la file de la carte")

    def exigences_de_la_meme_file(self, oublie_la_carte=False):
        """Une demande USSD Bonzini puis un SMS XAFe sur la MÊME carte,
        distribués dans cet ordre comme la boucle le ferait : le SMS attend
        que le menu USSD ait répondu — même file, un seul fil — et les deux
        finissent, dans l'ordre. Rend les manques."""
        import threading
        from tests.test_pilotage import FauxNuage
        from totem.pilotage import Pilotage
        g = self.guichet()
        g.messages = {3: message_xafe()}
        journal = journal_avec_carte()
        compte = compte_mtn()
        compte.reponses = [("fermee", "Solde : 1 000 FCFA")]
        commence, lache = threading.Event(), threading.Event()
        vrai = compte.ussd_demarrer

        def ussd_lent(code, **k):       # le réseau MTN tarde à répondre
            commence.set()
            lache.wait(5)
            return vrai(code, **k)
        compte.ussd_demarrer = ussd_lent

        porte = self.porte(g, journal)
        nuage = FauxNuage()
        pilotage = Pilotage(nuage, [compte], journal, guichets=[porte])
        if oublie_la_carte:
            pilotage._nommer_la_carte = lambda demande: None
        manques = []
        pilotage._marche = True
        try:
            pilotage._distribuer({"id": 7, "type": "ussd", "parametres": {
                "code": "*126#", "carte": ICCID, "par": "c:1"}}, nuage)
            if not commence.wait(2):
                manques.append("la demande Bonzini n'a pas été composée")
            for d in porte.commandes_en_attente():
                pilotage._distribuer(d, porte)
            time.sleep(0.4)
            if compte.sms_envoyes:
                manques.append("le SMS XAFe est parti PENDANT le menu USSD "
                               f"de la même carte : {compte.sms_envoyes}")
            if len(pilotage._files) != 1:
                manques.append(f"{len(pilotage._files)} files pour une carte : "
                               f"{sorted(pilotage._files)}")
            lache.set()
            if not _attendre(lambda: not pilotage._en_vol and compte.sms_envoyes):
                manques.append("les deux demandes n'ont pas fini")
        finally:
            lache.set()
            pilotage._marche = False
        if compte.recu != ["*126#"]:
            manques.append(f"le réseau a reçu {compte.recu}")
        if compte.sms_envoyes != [("699112233", TEXTE_CODE)]:
            manques.append(f"SMS partis : {compte.sms_envoyes}")
        if [c.get("etat") for i, c in nuage.maj if i == 7] != ["en_cours", "faite"]:
            manques.append(f"Bonzini lit {nuage.maj}")
        if g.messages[3].get("etat") != "envoye":
            manques.append(f"XAFe lit {g.messages[3].get('etat')!r}")
        return manques

    def test_une_demande_bonzini_et_un_sms_xafe_sur_la_meme_carte_passent_dans_l_ordre(self):
        """La promesse de docs/XAFE.md — « le SMS passe par la même file que
        les demandes Bonzini de la même carte ; il ne s'intercale jamais dans
        un menu USSD » — jouée : un USSD lent, puis le SMS."""
        self.assertEqual(self.exigences_de_la_meme_file(), [])

    def test_temoin_sans_nommer_la_carte_le_sms_s_intercale(self):
        manques = self.exigences_de_la_meme_file(oublie_la_carte=True)
        self.assertNotEqual(manques, [], "LE TÉMOIN PASSE : un `_distribuer` qui "
                            "oublie la carte tient encore l'ordre, l'essai ne "
                            "mesure rien")
        self.assertTrue(any("PENDANT" in m for m in manques), manques)

    def test_deux_cartes_mtn_refusent_sans_envoyer(self):
        g = self.guichet()
        g.messages = {3: message_xafe()}
        journal = journal_deux_cartes()
        c1, c2 = compte_mtn(), compte_mtn(FausseCarteMTN2())
        porte, pilotage = self.pilote(g, journal, [c1, c2])
        self.jouer(porte, pilotage)
        self.assertEqual(c1.sms_envoyes + c2.sms_envoyes, [])
        final = _patches_sms(g, 3)[-1][1]
        self.assertEqual(final["etat"], "echoue")
        self.assertIn("Rien n'est parti", final["resultat"])
        self.assertIn("Plusieurs cartes", final["resultat"])

    def exigences_du_float_nomme(self, d_avant=False):
        """Deux cartes MTN, le float de la ·0022 nommé sur la ligne : le code
        part par ELLE, et par elle seule. Rend les manques."""
        g = self.guichet()
        g.messages = {3: message_xafe(float_numero="677000022")}
        journal = journal_deux_cartes()
        c1, c2 = compte_mtn(), compte_mtn(FausseCarteMTN2())
        porte, pilotage = self.pilote(g, journal, [c1, c2])
        if d_avant:
            pilotage._candidats_xafe = lambda p: PilotageDAvant.candidats(pilotage, p)
        demandes = porte.commandes_en_attente()
        manques = []
        if demandes[0]["parametres"].get("float_numero") != "677000022":
            manques.append(f"le float n'est pas relevé : {demandes[0]['parametres']}")
        pilotage._nommer_la_carte(demandes[0])
        if demandes[0]["parametres"].get("carte") != ICCID_2:
            manques.append(f"la file n'est pas celle de la ·0022 : "
                           f"{demandes[0]['parametres'].get('carte')}")
        for d in demandes:
            pilotage._traiter(d, porte)
        if c2.sms_envoyes != [("699112233", TEXTE_CODE)]:
            manques.append(f"la ·0022 n'a pas envoyé : {c2.sms_envoyes}")
        if c1.sms_envoyes:
            manques.append(f"la ·0011 a envoyé : {c1.sms_envoyes}")
        final = _patches_sms(g, 3)[-1][1]
        if final.get("etat") != "envoye":
            manques.append(f"XAFe lit « {final.get('etat')} » : {final.get('resultat')!r}")
        return manques

    def test_un_float_nomme_choisit_la_carte_parmi_deux_mtn(self):
        """Le contrat promet `float_numero` ; la table ne l'a pas encore. Dès
        qu'une ligne le porte, c'est lui qui choisit — et deux cartes MTN ne
        sont plus un refus. Provoqué une fois : le filtre retiré de
        `_candidats_xafe`, ce test échoue (« Plusieurs cartes »)."""
        self.assertEqual(self.exigences_du_float_nomme(), [])

    def test_temoin_la_resolution_d_avant_refuse_le_float_nomme(self):
        manques = self.exigences_du_float_nomme(d_avant=True)
        self.assertNotEqual(manques, [], "LE TÉMOIN PASSE : la résolution par "
                            "opérateur seul choisit déjà la bonne carte, l'essai "
                            "ne mesure rien")
        self.assertTrue(any("Plusieurs cartes" in m for m in manques), manques)

    def test_un_float_nomme_inconnu_ne_part_pas(self):
        """Un float que personne ne porte ne rend JAMAIS « la première carte
        de l'opérateur » : le refus dit quoi faire. L'indicatif 237 devant le
        numéro déclaré est admis. Provoqué une fois : le filtre retiré, le
        code partait « envoye » par la seule carte MTN — c'est ce que ce test
        garde."""
        g = self.guichet()
        g.messages = {3: message_xafe(float_numero="677999999"),
                      4: message_xafe(4, float_numero="237677000000")}
        journal = journal_avec_carte()          # ·0011 déclarée 677000000
        compte = compte_mtn()
        porte, pilotage = self.pilote(g, journal, [compte])
        self.jouer(porte, pilotage)
        final = _patches_sms(g, 3)[-1][1]
        self.assertEqual(final["etat"], "echoue")
        self.assertIn("ne porte ce numéro", final["resultat"])
        self.assertIn("Rien n'est parti", final["resultat"])
        self.assertEqual(_patches_sms(g, 4)[-1][1]["etat"], "envoye")
        self.assertEqual(compte.sms_envoyes, [("699112233", TEXTE_CODE)])

    def test_une_ligne_fixe_est_refusee_sans_envoyer(self):
        """« 222123456 » : neuf chiffres, mais pas un mobile. Parti sans
        indicatif en « international », ce serait un autre pays."""
        g = self.guichet()
        g.messages = {3: message_xafe(numero="222123456")}
        journal = journal_avec_carte()
        compte = compte_mtn()
        porte, pilotage = self.pilote(g, journal, [compte])
        self.jouer(porte, pilotage)
        self.assertEqual(compte.sms_envoyes, [])
        final = _patches_sms(g, 3)[-1][1]
        self.assertEqual(final["etat"], "echoue")
        self.assertIn("mobile", final["resultat"])
        self.assertIn("Rien n'est parti", final["resultat"])

    def test_un_message_trop_long_se_dit_trop_long_pas_lettre_par_lettre(self):
        """Le modem refuse 161 caractères : XAFe lisait « des caractères que
        le réseau ne reçoit pas (« 1 » « 6 » « 1 » …) ». Le refus était juste,
        la phrase fausse."""
        from totem.modem import MessageTropLong
        from totem.pdu import ChargeTropLongue
        g = self.guichet()
        g.messages = {3: message_xafe()}
        journal = journal_avec_carte()
        compte = compte_mtn()
        compte.panne_envoi = MessageTropLong(ChargeTropLongue(161, 160, "caractères"))
        porte, pilotage = self.pilote(g, journal, [compte])
        self.jouer(porte, pilotage)
        final = _patches_sms(g, 3)[-1][1]
        self.assertEqual(final["etat"], "echoue")
        self.assertIn("trop long", final["resultat"])
        self.assertIn("161", final["resultat"])
        self.assertNotIn("« 1 »", final["resultat"])
        self.assertIn("Rien n'est parti", final["resultat"])

    def test_une_demande_bonzini_du_genre_sms_xafe_ne_fait_rien_partir(self):
        """Le genre n'est pas une autorisation : seul le guichet XAFe fait
        envoyer un SMS. Une ligne `commandes` Bonzini qui le porterait
        ferait partir un texte arbitraire depuis la SIM — refusée, et le
        compte rendu va à Bonzini."""
        from tests.test_pilotage import FauxNuage
        from totem.pilotage import Pilotage
        g = self.guichet()
        journal = journal_avec_carte()
        compte = compte_mtn()
        porte = self.porte(g, journal)
        nuage = FauxNuage()
        pilotage = Pilotage(nuage, [compte], journal, guichets=[porte])
        pilotage._traiter({"id": 7, "type": "sms_xafe", "parametres": {
            "operateur": "mtn", "numero": "699112233", "texte": TEXTE_CODE,
            "langue": "fr"}}, nuage)
        self.assertEqual(compte.sms_envoyes, [])
        self.assertEqual([c.get("etat") for i, c in nuage.maj if i == 7],
                         ["en_cours", "echouee"])
        self.assertIn("XAFe", nuage.maj[-1][1]["resultat"])
        self.assertIn("Rien n'est parti", nuage.maj[-1][1]["resultat"])
        self.assertEqual(g.patches, [])

    def test_la_releve_leve_l_erreur_quand_la_porte_repond(self):
        """Une coupure vue par la relève, puis le retour : /statut ne doit
        pas dire « injoignable » une minute de plus, jusqu'au tour du dépôt.
        Un 401 sur la relève se nomme comme au dépôt : « refuse la
        signature », pas « injoignable ». Ce que le dépôt seul sait (une
        ligne en « erreur » chez XAFe) n'est pas levé par la relève."""
        g = self.guichet()
        p = self.porte(g, journal_avec_carte())
        g.en_panne = True
        self.assertEqual(p.commandes_en_attente(), [])
        self.assertTrue(p.derniere_erreur, "la panne n'est pas notée")
        self.assertTrue("injoignable" in p.resume() or "unreachable" in p.resume())
        g.en_panne = False
        self.assertEqual(p.commandes_en_attente(), [])
        self.assertIsNone(p.derniere_erreur, "la relève passe et l'erreur reste")
        g.refuser_signatures = 1
        p.commandes_en_attente()
        self.assertEqual(p.derniere_erreur, "signature refusée")
        self.assertTrue("refuse la signature" in p.resume()
                        or "refuses the signature" in p.resume(), p.resume())
        p.commandes_en_attente()
        self.assertIsNone(p.derniere_erreur)
        # Ce que le DÉPÔT seul sait tient après un 200 de la relève — tout,
        # pas une liste : « moteur », mais aussi « lot refusé » (un 400, un
        # défaut de notre côté, reposé toutes les soixante secondes),
        # « file illisible » et « robot ». La première relève n'épargnait
        # que « moteur » et « robot » : /statut lisait « 3 en attente » sans
        # cause cinquante secondes par minute.
        du_depot = ("moteur : moteur en panne",
                    "lot refusé 400 {'erreur': 'un lot va de 1 à 200 lignes'}",
                    "file illisible",
                    "robot : KeyError: 'x'")
        for erreur in du_depot:
            p.derniere_erreur = erreur
            p.commandes_en_attente()
            self.assertEqual(p.derniere_erreur, erreur,
                             f"la relève a effacé ce que seul le dépôt sait : {erreur!r}")
        p.derniere_erreur = du_depot[1]
        p.commandes_en_attente()
        self.assertTrue("refuse le lot" in p.resume() or "refuses the batch" in p.resume(),
                        p.resume())
        # Et une panne vue par la relève APRÈS une erreur du dépôt ne la fait
        # pas oublier au retour : la relève n'efface que ce qu'elle a posé,
        # et le dépôt avait posé autre chose avant elle.
        p.derniere_erreur = "lot refusé 400 x"
        g.en_panne = True
        p.commandes_en_attente()
        self.assertNotEqual(p.derniere_erreur, "lot refusé 400 x")
        g.en_panne = False
        p.commandes_en_attente()
        self.assertIsNone(p.derniere_erreur, "la relève lève bien ce qu'elle a posé")
        # LE TÉMOIN : la relève d'avant, qui épargnait par liste, perd « lot
        # refusé » — sans quoi l'exigence ci-dessus ne mesure rien.
        temoin = self.porte(g, journal_avec_carte(), classe=PorteQuiEffaceParListe)
        temoin.derniere_erreur = du_depot[1]
        temoin.commandes_en_attente()
        self.assertIsNone(temoin.derniere_erreur,
                          "LE TÉMOIN PASSE : la relève d'avant garde aussi « lot refusé »")
        temoin.derniere_erreur = "file illisible"
        temoin.commandes_en_attente()
        self.assertIsNone(temoin.derniere_erreur,
                          "LE TÉMOIN PASSE : la relève d'avant garde aussi « file illisible »")

    def test_la_reclamation_nomme_un_refus_de_la_porte_et_tait_un_409(self):
        """Un 409 est la règle qui tient (un autre boîtier l'a prise) : muet.
        Un 401 sur le PATCH `en_cours`, lui, se nomme comme au dépôt et à la
        relève — sinon la demande restait « en attente » chez XAFe, reprise
        à chaque tour, et /statut ne disait rien de pourquoi rien ne part."""
        g = self.guichet()
        g.messages = {3: message_xafe()}
        p = self.porte(g, journal_avec_carte())
        self.assertEqual(len(p.commandes_en_attente()), 1)
        self.assertIsNone(p.derniere_erreur)
        g.refuser_signatures = 1
        self.assertFalse(p.reclamer("sms:3"))
        self.assertEqual(p.derniere_erreur, "signature refusée")
        self.assertTrue("refuse la signature" in p.resume()
                        or "refuses the signature" in p.resume(), p.resume())
        # La relève suivante passe : c'est le guichet qui l'avait posée.
        p.commandes_en_attente()
        self.assertIsNone(p.derniere_erreur)
        # Un 409 : silence. La demande est à un autre, ce n'est pas une panne.
        g.deja_prises = {3}
        self.assertFalse(p.reclamer("sms:3"))
        self.assertIsNone(p.derniere_erreur, "un 409 n'est pas une panne")
        # Une porte qui refuse autrement (un 400) se nomme aussi.
        g.deja_prises = set()
        self.assertFalse(p.reclamer("sms:999"))        # inconnue : 409 chez XAFe
        self.assertIsNone(p.derniere_erreur)
        g.messages[4] = message_xafe()
        p._cible = staticmethod(lambda ident: ("inconnu", 4))   # un type que la porte refuse
        self.assertFalse(p.reclamer("sms:4"))
        self.assertEqual(p.derniere_erreur, "réclamation refusée 400")

    def exigences_de_la_cadence_sous_un_xafe_muet(self, classe_pilotage):
        """Un XAFe qui accepte la connexion et ne répond jamais : la relève
        des demandes BONZINI doit garder sa cadence. Rend l'écart médian
        entre deux relèves Bonzini, mesuré pendant que le GET XAFe pend."""
        import statistics
        from tests.test_pilotage import FauxNuage
        hote = HoteMuet()
        self.addCleanup(hote.fermer)
        journal = journal_avec_carte()
        porte = PorteXafe(hote.url, "secret-akwa", "akwa-1", journal)
        self.portes.append(porte)
        _JOURNAUX.append(journal)
        self.assertTrue(porte.actif)

        class NuageQuiCompte(FauxNuage):
            def __init__(self):
                super().__init__()
                self.releves = []

            def commandes_en_attente(self):
                self.releves.append(time.monotonic())
                return []

        nuage = NuageQuiCompte()
        delai, module_xafe.DELAI_RELEVE = module_xafe.DELAI_RELEVE, 0.6
        self.addCleanup(setattr, module_xafe, "DELAI_RELEVE", delai)
        pilotage = classe_pilotage(nuage, [], journal, pause=0.05, guichets=[porte])
        pilotage.demarrer()
        try:
            time.sleep(2.0)
        finally:
            pilotage.arreter()
        releves = list(nuage.releves)
        self.assertGreaterEqual(len(releves), 2, "Bonzini n'a pas été relevé")
        self.assertTrue(porte.derniere_erreur, "le GET XAFe n'a pas même expiré")
        ecarts = [b - a for a, b in zip(releves, releves[1:])]
        return statistics.median(ecarts), max(ecarts)

    def test_un_xafe_muet_ne_retarde_pas_la_releve_des_demandes_bonzini(self):
        """docs/XAFE.md promet : « aucune n'attend l'autre ». Vrai pour le
        dépôt (son fil) ; faux pour le guichet tant que la relève XAFe
        tournait EN LIGNE dans la boucle de `Pilotage` — mesuré sur le
        code d'avant : 18 s entre deux relèves Bonzini au lieu de 3, et de
        1,5 en session, c'est-à-dire à chaque étape d'un menu USSD tenu
        depuis l'application, qui abandonne à 30 s. Ici le GET pend 0,6 s
        et la cadence Bonzini est de 0,05 s : elle doit le rester."""
        from totem.pilotage import Pilotage
        mediane, pire = self.exigences_de_la_cadence_sous_un_xafe_muet(Pilotage)
        self.assertLess(mediane, 0.3, f"la relève Bonzini attend XAFe : {mediane:.2f} s")
        self.assertLess(pire, 0.6, f"une relève Bonzini a attendu le GET XAFe : {pire:.2f} s")

    def test_temoin_la_boucle_unique_d_avant_fait_attendre_bonzini(self):
        """La boucle d'avant, recopiée : les deux guichets relevés l'un après
        l'autre dans le même fil. Sous le même XAFe muet, Bonzini doit
        attendre le GET (0,6 s) à chaque tour — sinon l'exigence ci-dessus
        ne mesure rien."""
        from totem.pilotage import Pilotage, PAS_SESSION

        class PilotageDUneSeuleBoucle(Pilotage):
            def demarrer(self):
                self._marche = True
                fil = threading.Thread(target=self._boucle, daemon=True)
                fil.start()
                return fil

            def _boucle(self):
                while self._marche:
                    try:
                        for guichet in self.guichets:
                            for demande in guichet.commandes_en_attente():
                                self._distribuer(demande, guichet)
                        self._expirer_session()
                        self._abandonner_les_orphelines()
                    except Exception:
                        pass
                    time.sleep(PAS_SESSION if (self._tenues() or self._en_vol)
                               else self.pause)

        mediane, _ = self.exigences_de_la_cadence_sous_un_xafe_muet(PilotageDUneSeuleBoucle)
        self.assertGreaterEqual(mediane, 0.55,
                                "LE TÉMOIN PASSE : la boucle unique d'avant garde aussi "
                                f"la cadence Bonzini ({mediane:.2f} s), l'essai ne mesure rien")

    def test_aucune_carte_de_l_operateur(self):
        g = self.guichet()
        g.messages = {3: message_xafe(operateur="om")}
        journal = journal_avec_carte()
        compte = compte_mtn()
        porte, pilotage = self.pilote(g, journal, [compte])
        self.jouer(porte, pilotage)
        self.assertEqual(compte.sms_envoyes, [])
        final = _patches_sms(g, 3)[-1][1]
        self.assertEqual(final["etat"], "echoue")
        self.assertIn("Aucune carte", final["resultat"])

    def test_une_commande_deja_prise_n_est_pas_envoyee(self):
        g = self.guichet()
        g.messages = {3: message_xafe()}
        g.deja_prises = {3}
        journal = journal_avec_carte()
        compte = compte_mtn()
        porte, pilotage = self.pilote(g, journal, [compte])
        self.jouer(porte, pilotage)
        self.assertEqual(compte.sms_envoyes, [])
        etats = [c.get("etat") for _, c in _patches_sms(g, 3)]
        self.assertEqual(etats, ["en_cours"], "après un 409, on s'en va en silence")

    def exigences_du_code_vieux(self, sans_garde=False):
        g = self.guichet()
        g.messages = {3: message_xafe()}
        g.depose_il_y_a = 3 * 3600
        journal = journal_avec_carte()
        compte = compte_mtn()
        porte, pilotage = self.pilote(g, journal, [compte])
        if sans_garde:
            pilotage._refuser_si_perimee = lambda *a, **k: None
        self.jouer(porte, pilotage)
        manques = []
        if compte.sms_envoyes:
            manques.append(f"envoyé malgré l'âge : {compte.sms_envoyes}")
        final = _patches_sms(g, 3)[-1][1]
        if final.get("etat") != "echoue":
            manques.append(f"finit « {final.get('etat')} »")
        elif "3 h" not in (final.get("resultat") or ""):
            manques.append(f"la raison ne dit pas la durée : {final.get('resultat')!r}")
        return manques

    def test_un_code_vieux_de_trois_heures_n_est_pas_envoye(self):
        self.assertEqual(self.exigences_du_code_vieux(), [])

    def test_temoin_sans_la_garde_le_code_vieux_part(self):
        self.assertNotEqual(self.exigences_du_code_vieux(sans_garde=True), [],
                            "LE TÉMOIN PASSE : sans la garde, l'essai ne voit pas le code partir")

    def test_cinq_minutes_passent_la_limite_xafe_et_pas_celle_de_bonzini(self):
        """La règle de la plateforme (60 s) refuserait un code déposé il y a
        cinq minutes ; la `Prise` XAFe porte sa limite (900 s) et il part."""
        from totem.pilotage import DEMANDE_PERIMEE_S
        self.assertLess(DEMANDE_PERIMEE_S, 5 * 60)
        g = self.guichet()
        g.messages = {3: message_xafe()}
        g.depose_il_y_a = 5 * 60
        journal = journal_avec_carte()
        compte = compte_mtn()
        porte, pilotage = self.pilote(g, journal, [compte])
        prise = porte.reclamer("sms:3")
        self.assertTrue(prise)
        self.assertEqual(prise.limite, module_xafe.XAFE_DEMANDE_PERIMEE_S)
        self.assertAlmostEqual(prise.age, 300, delta=5)
        # Le témoin : la même prise, sans sa limite, est refusée.
        from totem.nuage import Prise
        from totem.pilotage import RefusPoli
        with self.assertRaises(RefusPoli):
            pilotage._refuser_si_perimee(Prise(prise.age), "sms_xafe")
        pilotage._refuser_si_perimee(prise, "sms_xafe")      # passe

    def test_un_accuse_non_recu_dit_peut_etre_remis(self):
        from totem.modem import EnvoiIncertain, ErreurModem
        for panne, attendu in ((EnvoiIncertain("muet"), "peut-être"),
                               (ErreurModem("+CMS ERROR: 500"), "Rien n'est parti")):
            g = self.guichet()
            g.messages = {3: message_xafe()}
            journal = journal_avec_carte()
            compte = compte_mtn()
            compte.panne_envoi = panne
            porte, pilotage = self.pilote(g, journal, [compte])
            self.jouer(porte, pilotage)
            final = _patches_sms(g, 3)[-1][1]
            self.assertEqual(final["etat"], "echoue")
            self.assertIn(attendu, final["resultat"], final)

    def test_un_numero_ou_un_texte_illisible_ne_part_pas(self):
        g = self.guichet()
        g.messages = {3: message_xafe(numero="12"), 4: message_xafe(4, texte="  ")}
        journal = journal_avec_carte()
        compte = compte_mtn()
        porte, pilotage = self.pilote(g, journal, [compte])
        self.jouer(porte, pilotage)
        self.assertEqual(compte.sms_envoyes, [])
        for ident in (3, 4):
            final = _patches_sms(g, ident)[-1][1]
            self.assertEqual(final["etat"], "echoue")
            self.assertIn("Rien n'est parti", final["resultat"])

    def test_la_releve_est_cadencee_et_vaut_rien_sans_reseau(self):
        module_xafe.PAS_RELEVE = 3600
        g = self.guichet()
        g.messages = {3: message_xafe()}
        journal = journal_avec_carte()
        porte = self.porte(g, journal)
        self.assertEqual(len(porte.commandes_en_attente()), 1)
        avant = len(g.requetes)
        for _ in range(5):
            self.assertEqual(porte.commandes_en_attente(), [])
        self.assertEqual(len(g.requetes), avant, "entre deux relèves, aucune requête")

    def test_une_coupure_rend_rien_et_se_dit(self):
        g = self.guichet()
        g.messages = {3: message_xafe()}
        g.en_panne = True
        journal = journal_avec_carte()
        porte = self.porte(g, journal)
        self.assertEqual(porte.commandes_en_attente(), [])
        self.assertIsNotNone(porte.derniere_erreur)
        self.assertFalse(porte.reclamer("sms:3"))
        self.assertFalse(porte.commande_maj("sms:3", {"etat": "faite", "resultat": "x"}))
        g.en_panne = False
        self.assertEqual(len(porte.commandes_en_attente()), 1)

    def test_inerte_le_guichet_ne_fait_aucune_requete(self):
        g = self.guichet()
        g.messages = {3: message_xafe()}
        porte = PorteXafe("", "", "", _journal())
        self.assertEqual(porte.commandes_en_attente(), [])
        self.assertEqual(g.requetes, [])

    def test_le_masquage_d_un_secret_ne_va_pas_chez_xafe(self):
        g = self.guichet()
        porte = self.porte(g, journal_avec_carte())
        self.assertTrue(porte.commande_maj("sms:3", {"parametres": {"secret": True}}))
        self.assertEqual(g.requetes, [])

    def test_les_transferts_ne_sont_pas_releves(self):
        """Même avec `transferts = oui` : sans la décision du propriétaire sur
        le code secret, les relever les ferait échouer trois fois chez XAFe."""
        g = self.guichet()
        g.commandes = {7: {"id": 7, "terminal": "akwa-1", "type": "transfert",
                           "parametres": {"operateur": "mtn", "numero": "677123456",
                                          "montant": 5000}, "etat": "en_attente",
                           "reprises": 0, "cle": "XAFe-WD-1"}}
        porte = self.porte(g, journal_avec_carte(), transferts=True)
        self.assertEqual(porte.commandes_en_attente(), [])
        self.assertFalse(any("type=transferts" in chemin for _, chemin, _, _, _ in g.requetes))

    def test_les_ids_xafe_et_bonzini_ne_se_confondent_pas(self):
        """Une demande Bonzini n° 7 et un SMS XAFe n° 7 : deux clés de vol,
        deux fins. Et une clé « (guichet, id) » : la même boucle, un seul
        `Pilotage`."""
        from tests.test_pilotage import FauxNuage
        from totem.pilotage import Pilotage
        g = self.guichet()
        g.messages = {7: message_xafe(7)}
        journal = journal_avec_carte()
        compte = compte_mtn()
        porte = self.porte(g, journal)
        nuage = FauxNuage()
        nuage.commandes_en_attente = lambda: [{"id": 7, "type": "solde", "parametres": {}}]
        pilotage = Pilotage(nuage, [compte], journal, guichets=[porte])
        self.assertEqual(pilotage.guichets, [nuage, porte])
        self.assertEqual(pilotage._cle_en_vol(nuage, {"id": 7}), ("nuage", 7))
        self.assertEqual(pilotage._cle_en_vol(porte, {"id": "sms:7"}), ("xafe", "sms:7"))
        pilotage._marche = True
        try:
            for guichet in pilotage.guichets:
                for d in guichet.commandes_en_attente():
                    pilotage._distribuer(d, guichet)
            self.assertTrue(_attendre(lambda: not pilotage._en_vol and nuage.republies == 1
                                      and compte.sms_envoyes), "les deux demandes n'ont pas fini")
        finally:
            pilotage._marche = False
        self.assertEqual([c.get("etat") for i, c in nuage.maj if i == 7], ["en_cours", "faite"])
        self.assertEqual(g.messages[7]["etat"], "envoye")

    def test_le_robot_confie_la_porte_au_meme_guichet(self):
        """Le câblage dans `app.py` : XAFe actif, le robot donne la porte à
        `Pilotage` — avec Bonzini, et SANS (un `Pilotage` est alors créé pour
        elle seule). Retirer `guichets=` laissait la batterie verte."""
        from tests.test_recus import _robot
        g = self.guichet()
        robot, compte, modem, journal = _robot()
        _JOURNAUX.append(journal)
        robot.xafe = self.porte(g, journal)
        self.assertTrue(robot.xafe.actif)
        robot.demarrer(bloquant=False)
        try:
            self.assertIsNotNone(robot.pilotage)
            self.assertEqual(robot.pilotage.guichets, [robot.xafe])
            self.assertTrue(robot.pilotage._marche)
        finally:
            robot.arreter()
        # Avec un nuage : les deux guichets, la plateforme d'abord.
        robot2, _, _, journal2 = _robot()
        _JOURNAUX.append(journal2)
        robot2.xafe = self.porte(g, journal2)
        robot2.nuage = FauxSupabaseDocile()
        robot2.demarrer(bloquant=False)
        try:
            self.assertEqual(robot2.pilotage.guichets, [robot2.nuage, robot2.xafe])
        finally:
            robot2.arreter()


class FauxSupabaseDocile:
    """Le strict nécessaire pour que `Robot.demarrer` croie à un nuage."""
    actif = True

    def demarrer(self, **kw):
        return None

    def commandes_en_attente(self):
        return []

    def commandes_abandonnees(self, avant):
        return []

    def reveiller(self):
        pass

    def publier_comptes(self, *a, **k):
        return True

    def enregistrer_terminal(self, *a, **k):
        return True


class TestLeJournalXafe(unittest.TestCase):
    """Les deux promesses de `storage.py` que la porte suppose."""

    def test_une_ligne_close_ne_se_reecrit_pas(self):
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        journal.marquer_sms_xafe([(1, "credite A")])
        journal.marquer_sms_xafe([(1, "refuse B")])
        self.assertEqual(_etat(journal, 1)[:2], (1, "credite A"))
        self.assertEqual(journal.remettre_sms_xafe(depuis_id=1), 1)
        journal.marquer_sms_xafe([(1, "refuse B")])
        self.assertEqual(_etat(journal, 1)[:2], (1, "refuse B"), "rouverte, elle se réécrit")

    def test_la_file_ecarte_les_cartes_nommees(self):
        journal = journal_deux_cartes()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        journal.sms("MobileMoney", SMS_ENTREE, "", "")
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0022", ICCID_2)
        self.assertEqual([l[0] for l in journal.sms_a_pousser_xafe(100)], [1, 2, 3])
        self.assertEqual([l[0] for l in journal.sms_a_pousser_xafe(100, sauf_iccid={ICCID})],
                         [2, 3])
        self.assertEqual([l[0] for l in journal.sms_a_pousser_xafe(100, sauf_iccid={ICCID, ""})],
                         [3])
        self.assertEqual(journal.xafe_en_attente(), 3, "écarter n'est pas clore")
        # Rouvrir UNE carte (`remettre_sms_xafe(iccid=…)`, le geste que
        # docs/XAFE.md propose) : seules ses lignes repassent à 0.
        journal.marquer_sms_xafe([(1, "credite A"), (2, "credite B"), (3, "credite C")])
        self.assertEqual(journal.xafe_en_attente(), 0)
        self.assertEqual(journal.remettre_sms_xafe(iccid=ICCID), 1)
        self.assertEqual([l[0] for l in journal.sms_a_pousser_xafe(100)], [1])
        self.assertEqual(_etat(journal, 1)[:2], (0, None))
        self.assertEqual(_etat(journal, 2)[:2], (1, "credite B"))
        self.assertEqual(_etat(journal, 3)[:2], (1, "credite C"))


    def test_rouvrir_tout_se_demande_explicitement(self):
        """Un appel nu rouvrait TOUT, l'historique « avant XAFe » compris :
        des mois d'encaissements chez un tiers sur une faute de frappe. La
        règle tenait par la doc seule ; elle tient maintenant dans le code.
        Et `iccid=""` désigne les lignes SANS carte — pas « sans filtre »."""
        journal = journal_deux_cartes()
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        journal.sms("MobileMoney", SMS_ENTREE, "", "")
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0022", ICCID_2)
        journal.marquer_sms_xafe([(1, "avant XAFe"), (2, "credite B"), (3, "credite C")])
        with self.assertRaises(ValueError):
            journal.remettre_sms_xafe()
        self.assertEqual(journal.xafe_en_attente(), 0, "un appel refusé ne rouvre rien")
        self.assertEqual(journal.remettre_sms_xafe(iccid=""), 1,
                         "la chaîne vide désigne les lignes sans carte, et elles seules")
        self.assertEqual([l[0] for l in journal.sms_a_pousser_xafe(100)], [2])
        self.assertEqual(_etat(journal, 1)[:2], (1, "avant XAFe"),
                         "l'historique n'a pas bougé")
        self.assertEqual(journal.remettre_sms_xafe(tout=True), 3)
        self.assertEqual(journal.xafe_en_attente(), 3)


class TestLaConfiguration(unittest.TestCase):
    """Sans section [xafe], rien ; avec, les valeurs — et « non » se lit,
    parce que c'est ce que config.example.conf écrit."""

    def _charger(self, texte):
        from totem import config
        with tempfile.TemporaryDirectory() as dossier:
            chemin = os.path.join(dossier, "totem.conf")
            with open(chemin, "w", encoding="utf-8") as f:
                f.write(texte)
            vrais = list(config.CHEMINS)
            config.CHEMINS[:] = [chemin]
            try:
                return config.charger()
            finally:
                config.CHEMINS[:] = vrais

    def test_le_fichier_d_exemple_se_charge(self):
        """`recus = oui`, `sauvegarde_quotidienne = oui` : le fichier que
        l'installateur copie tel quel. Il refusait de se charger (« Not a
        boolean: oui ») — vu en essayant `transferts = non`, pas cherché."""
        racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(racine, "config.example.conf"), encoding="utf-8") as f:
            c = self._charger(f.read())
        self.assertIs(c["recus"], True)
        self.assertIs(c["xafe_transferts"], False)
        self.assertIs(c["xafe_sorties"], True)

    def test_sans_section_rien_ne_change(self):
        c = self._charger("[telegram]\njeton = x\nchat_id = 1\n")
        self.assertEqual((c["xafe_url"], c["xafe_cle"], c["xafe_anon"],
                          c["xafe_transferts"]), ("", "", "", False))
        self.assertEqual(c["xafe_terminal"], "totem")

    def test_la_section_se_lit_en_francais(self):
        c = self._charger("[telegram]\njeton = x\nchat_id = 1\n"
                          "[cloud]\nterminal = douala\n"
                          "[xafe]\nurl = https://x.supabase.co\ncle = k\n"
                          "transferts = non\n")
        self.assertEqual(c["xafe_terminal"], "douala", "à défaut, le nom de [cloud]")
        self.assertIs(c["xafe_transferts"], False)
        c = self._charger("[telegram]\njeton = x\nchat_id = 1\n"
                          "[xafe]\nterminal = akwa-1\ntransferts = oui\n")
        self.assertEqual(c["xafe_terminal"], "akwa-1")
        self.assertIs(c["xafe_transferts"], True)
        self.assertIs(c["xafe_sorties"], True, "oui par défaut")
        c = self._charger("[telegram]\njeton = x\nchat_id = 1\n"
                          "[xafe]\nterminal = akwa-1\nsorties = non\n")
        self.assertIs(c["xafe_sorties"], False)


class TestReveilImmediat(Banc):
    """Un encaissement connu ne doit pas attendre la pause."""

    def test_un_sms_part_sans_attendre(self):
        g = self.guichet()
        journal = journal_avec_carte()
        p = self.porte(g, journal, pause=3600)
        fil = p.demarrer()
        self.assertIsNotNone(fil)
        journal.sms("MobileMoney", SMS_ENTREE, "MTN ·0011", ICCID)
        p.reveiller()
        self.assertTrue(_attendre(lambda: len(g.credites) == 1, delai=5),
                        "la ligne n'est pas arrivée au guichet")
        p.arreter()
        fil.join(10)
        self.assertFalse(fil.is_alive())


class TestLeDemarrage(unittest.TestCase):
    """Le harnais lance la porte lui-même : sans ce test, retirer son
    démarrage du robot laissait toute la batterie verte. Vérifié une fois à
    la main : `demarrer()` sans l'appel à `self.xafe.demarrer()` fait
    échouer `demarre == 1`."""

    def test_le_robot_demarre_arrete_et_reveille_la_porte(self):
        from tests.test_recus import _robot

        class XafeDocile:
            actif = True

            def __init__(self):
                self.demarre = self.arrete = self.reveils = 0

            def demarrer(self):
                self.demarre += 1

            def arreter(self):
                self.arrete += 1

            def reveiller(self):
                self.reveils += 1

            def resume(self):
                return "XAFe à jour"

        robot, compte, modem, journal = _robot()
        _JOURNAUX.append(journal)
        robot.xafe = XafeDocile()
        robot.demarrer(bloquant=False)
        try:
            self.assertEqual(robot.xafe.demarre, 1)
        finally:
            robot.arreter()
        self.assertEqual(robot.xafe.arrete, 1)
        modem.injecter_paiement("NGONO Marie", 25000)
        robot._relever_sms(compte)
        self.assertGreaterEqual(robot.xafe.reveils, 1)
        # Un numéro déclaré depuis Telegram (/reglages) réveille aussi la
        # porte : une carte qui vient de recevoir son numéro libère ses
        # encaissements tout de suite, pas à la pause suivante. Retirer ce
        # réveil laissait la batterie verte.
        from totem.carte import Carte
        compte.carte = Carte(iccid="89237020000000004432", imsi="624020000000001")
        journal.voir_carte(compte.carte)
        robot.attente_identite = ("num", compte.carte.iccid)
        avant = robot.xafe.reveils
        robot._enregistrer_identite("696103864")
        self.assertEqual(journal.identite(compte.carte.iccid)[0], "696103864")
        self.assertEqual(robot.xafe.reveils, avant + 1,
                         "déclarer un numéro ne réveille pas la porte XAFe")

    def test_le_robot_branche_ses_crochets_sur_la_porte(self):
        from tests.test_recus import _robot
        robot, compte, modem, journal = _robot()
        _JOURNAUX.append(journal)
        p = PorteXafe("", "", "", journal)
        from totem.app import Robot
        r2 = Robot([compte], robot.transport, journal, numeros={"orange": "696103864"},
                   xafe=p)
        self.assertEqual(p.fournir_numeros, r2._nos_numeros)
        self.assertEqual(p.fournir_float, r2._carte_pour_xafe)
        self.assertEqual(p.sur_incident, r2._incident_xafe)
        # Une carte Orange déclarée en [numeros] : « om », neuf chiffres. Le
        # simulateur n'a pas d'ICCID : on lui en donne un, comme une vraie puce.
        from totem.carte import Carte
        compte.carte = Carte(iccid="89237020000000004432", imsi="624020000000001")
        journal.voir_carte(compte.carte)
        self.assertEqual(r2._carte_pour_xafe(compte.carte.iccid), ("om", "696103864"))
        self.assertIsNone(r2._carte_pour_xafe("inconnu"))
        self.assertIsNone(r2._carte_pour_xafe(""), "sans ICCID, jamais la première carte")
        # Une carte d'un autre réseau n'a pas de float XAFe, et n'en aura
        # jamais : ce n'est pas « pas encore de numéro » (None, la ligne
        # attend), c'est SANS_FLOAT (la ligne se clôt, elle ne retient rien).
        compte.carte = Carte(iccid=ICCID_CAMTEL, imsi="624070000000033")
        self.assertIs(r2._carte_pour_xafe(ICCID_CAMTEL), SANS_FLOAT)
        # Une puce française, un réseau que la table ne connaît pas : l'IMSI
        # nomme positivement autre chose que MTN ou Orange Cameroun.
        compte.carte = Carte(iccid=ICCID_CAMTEL, imsi="208010000000033")
        self.assertIs(r2._carte_pour_xafe(ICCID_CAMTEL), SANS_FLOAT)
        compte.carte = Carte(iccid=ICCID_CAMTEL, imsi="310260000000033")
        self.assertIs(r2._carte_pour_xafe(ICCID_CAMTEL), SANS_FLOAT)
        # L'IMSI est LU et nomme un réseau que la table ne connaît pas (une
        # puce d'un pays voisin), mais le réseau VISITÉ s'appelle « Orange
        # CM » : `Carte.operateur` retombe sur le nom et dit « Orange ».
        # C'est le seul cas qui sépare « décider sur l'IMSI » de « décider
        # sur le nom » quand l'IMSI est là — et le nom donnerait « om ».
        compte.carte = Carte(iccid=ICCID_CAMTEL, imsi="630010000000033", reseau="Orange CM")
        self.assertEqual(compte.carte.operateur, "Orange", "le contraste n'existe pas")
        self.assertIs(r2._carte_pour_xafe(ICCID_CAMTEL), SANS_FLOAT,
                      "une puce étrangère en itinérance Orange n'a pas de float « om »")
        # « JAMAIS » NE SE DÉCIDE PAS SUR UNE CARTE QU'ON N'A PAS IDENTIFIÉE.
        # IMSI non lu (AT+CIMI a échoué au démarrage) : `Carte.operateur` dit
        # « SIM inconnue » — ou le réseau VISITÉ, « Orange CM » sur une MTN en
        # itinérance. Ce n'est pas un autre réseau, c'est « pas encore su » :
        # la ligne ATTEND, et le robot dit pourquoi.
        for carte in (Carte(iccid="89237010000000000011", imsi=""),
                      Carte(iccid="89237010000000000011", imsi="", reseau="Orange CM"),
                      Carte(iccid="89237010000000000011", imsi="62")):
            compte.carte = carte
            verdict = r2._carte_pour_xafe("89237010000000000011")
            self.assertIsInstance(verdict, Attente, (carte.operateur, verdict))
            self.assertTrue("IMSI" in verdict.motif
                            and ("redémarrez" in verdict.motif or "restart" in verdict.motif),
                            verdict.motif)
        # Un numéro déclaré mais mal formé : ce n'est pas « pas de numéro »
        # (le propriétaire ne saurait pas quoi corriger), c'est une attente
        # qui nomme la faute. Le « 237 » devant, lui, est admis.
        compte.carte = Carte(iccid="89237020000000004432", imsi="624020000000001")
        for mal_forme, chiffres in (("69610386", 8), ("6961038645", 10), ("+237 69 61 03 86", 11)):
            r3 = Robot([compte], robot.transport, journal, numeros={"orange": mal_forme}, xafe=p)
            verdict = r3._carte_pour_xafe(compte.carte.iccid)
            self.assertIsInstance(verdict, Attente, (mal_forme, verdict))
            self.assertIn(str(chiffres), verdict.motif)
            self.assertTrue("mal formé" in verdict.motif or "malformed" in verdict.motif, verdict.motif)
        r3 = Robot([compte], robot.transport, journal, numeros={"orange": "+237 696 10 38 64"}, xafe=p)
        self.assertEqual(r3._carte_pour_xafe(compte.carte.iccid), ("om", "696103864"))
        r3 = Robot([compte], robot.transport, journal, numeros={}, xafe=p)
        self.assertIsNone(r3._carte_pour_xafe(compte.carte.iccid), "rien de déclaré : None, l'avis classique")
        # TÉMOIN (figé, commit acd8f06) : le crochet d'avant décidait sur le
        # NOM de l'opérateur — « SIM inconnue » valait Camtel. Sans ce
        # contraste, l'essai ne mesure rien.
        from totem.carte import operateur_xafe

        def crochet_d_avant(robot_, iccid):
            c = next((c for c in robot_.comptes if iccid and c.carte.iccid == iccid), None)
            if c is None:
                return None
            op = operateur_xafe(c.carte.operateur)
            if not op:
                return SANS_FLOAT
            numero = re.sub(r"\D", "", robot_._numero_du_compte(c) or "")[-9:]
            if len(numero) != 9:
                return None
            return op, numero
        compte.carte = Carte(iccid="89237010000000000011", imsi="")
        self.assertIs(crochet_d_avant(r2, "89237010000000000011"), SANS_FLOAT,
                      "LE TÉMOIN PASSE : le crochet d'avant laisse aussi attendre la "
                      "carte non identifiée, l'essai ne mesure rien")
        compte.carte = Carte(iccid=ICCID_CAMTEL, imsi="624070000000033")
        self.assertIs(crochet_d_avant(r2, ICCID_CAMTEL), SANS_FLOAT)
        # …et, sur le nom, la puce étrangère en itinérance Orange reçoit un
        # float « om » qui n'est pas le sien : c'est ce contraste-là que
        # l'IMSI évite, et que les cas d'IMSI court ne mesuraient pas.
        r4 = Robot([compte], robot.transport, journal, numeros={"orange": "696103864"}, xafe=p)
        compte.carte = Carte(iccid=ICCID_CAMTEL, imsi="630010000000033", reseau="Orange CM")
        self.assertEqual(crochet_d_avant(r4, ICCID_CAMTEL), ("om", "696103864"),
                         "LE TÉMOIN PASSE : le crochet d'avant refuse aussi la puce "
                         "en itinérance, l'essai ne mesure rien")
        self.assertIs(r4._carte_pour_xafe(ICCID_CAMTEL), SANS_FLOAT)

    def test_le_statut_porte_la_ligne_xafe(self):
        """docs/XAFE.md promet : « /statut ajoute une ligne 🔁 ». `resume()`
        est testé ; son BRANCHEMENT dans `_statut` ne l'était par rien —
        retiré, la batterie restait verte."""
        from tests.test_recus import _robot

        class XafeDocile:
            actif = True

            def resume(self):
                return "XAFe · 3 en attente"

        robot, compte, modem, journal = _robot()
        _JOURNAUX.append(journal)
        robot.xafe = XafeDocile()
        robot._statut()
        self.assertIn("🔁 XAFe · 3 en attente", robot.transport.messages[-1])
        robot.xafe = None
        robot._statut()
        self.assertNotIn("🔁", robot.transport.messages[-1])
        robot.xafe = XafeDocile()
        robot.xafe.actif = False
        robot._statut()
        self.assertNotIn("🔁", robot.transport.messages[-1], "inactive, la porte ne dit rien")

    def test_un_incident_xafe_arrive_sur_telegram_une_fois_par_quart_d_heure(self):
        """Le maillon porte → robot → Telegram : `sur_incident` est bien
        `_incident_xafe` (test ci-dessus), mais rendu muet, rien ne le voyait.
        Le propriétaire doit lire « XAFe » et le motif rendu par XAFe — jamais
        la clé ni une signature — et pas plus d'une fois par quart d'heure."""
        from tests.test_recus import _robot
        robot, compte, modem, journal = _robot()
        _JOURNAUX.append(journal)
        avant = len(robot.transport.messages)
        robot._incident_xafe(4, "float inconnu")
        self.assertEqual(len(robot.transport.messages), avant + 1)
        message = robot.transport.messages[-1]
        self.assertIn("XAFe", message)
        self.assertIn("float inconnu", message)
        self.assertTrue("rien n’est perdu" in message or "nothing is lost" in message, message)
        # Un second incident dans le quart d'heure : silence.
        robot._incident_xafe(5, "moteur : erreur")
        self.assertEqual(len(robot.transport.messages), avant + 1)
        # Le quart d'heure passé : il parle de nouveau — et un motif long est
        # coupé, pas la phrase.
        robot._dernier_avert_xafe -= 901
        robot._incident_xafe(6, "x" * 1000)
        self.assertEqual(len(robot.transport.messages), avant + 2)
        self.assertLess(len(robot.transport.messages[-1]), 800)
        for message in robot.transport.messages[avant:]:
            self.assertNotIn("secret-akwa", message)
            self.assertIsNone(re.search(r"[0-9a-f]{64}", message))


if __name__ == "__main__":
    unittest.main()
