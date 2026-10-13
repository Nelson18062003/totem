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
     resérialisation n'est pas signer ce qu'on envoie ;
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
     active ne change rien à ce qui part chez Bonzini.

CHAQUE EXIGENCE A SON TÉMOIN : `PorteDAvant` (marque avant la requête),
`PorteToutMarque` (un 200 = tout marqué), `PorteSansRecalage` (ne lit pas
l'heure de la base), `PorteQuiSigneLeMauvaisCorps` (signe une sérialisation,
envoie une autre), `PorteTeteDeFile` (la porte des premiers jours : le float
avant la lecture, un seul lot, personne d'écarté), `PorteSansEcartement` (lit
au-delà du lot mais ne transmet pas les cartes écartées à la lecture : cent
encaissements qui attendent remplissent chaque lot, pour toujours),
`PorteUnSeulLot` (s'arrête après un lot plein), `PorteSansControleDePosition`
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
# sous `hmac` (Python) et `signer()` (porte.ts, Node 22).
VECTEURS = (
    ("secret-akwa", 1760000000, b'{"source_id":1}',
     "6cd538e613e3887d02e9579d3cc8b74b7060e6f9e9d21397da186982a023d690"),
    ("secret-akwa", 1760000000, b"",
     "c14bcf618b7f9b1681049182f2b8d047f8dac9ebe37a3b9444c8221772091389"),
)

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
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.serveur.server_port}"

    def fermer(self):
        self.serveur.shutdown()
        self.serveur.server_close()

    # --- la porte : recopie de porte.ts 52-66 ---------------------------------
    def _verifier(self, entetes, corps_brut):
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
        attendue = hmac.new(cle.encode(), ts.encode() + b"." + corps_brut,
                            hashlib.sha256).hexdigest()
        return terminal if hmac.compare_digest(attendue, signature) else None

    def _traiter(self, methode, chemin, entetes, brut):
        with self.verrou:
            if self.en_panne:
                return 503, {"erreur": "en panne"}
            if self.refuser_signatures > 0:
                self.refuser_signatures -= 1
                return 401, {"erreur": "signature refusée"}
        terminal = self._verifier(entetes, brut)
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
            if "sens" in l and l["sens"] != "entree":
                resultats.append({"source_id": source_id, "resultat": "ignore",
                                  "motif": "seules les entrées d'argent comptent"})
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

    def _signer(self, horodatage, corps_octets):
        if corps_octets:
            corps_octets = json.dumps(json.loads(corps_octets)).encode()
        return super()._signer(horodatage, corps_octets)


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
        for cle, ts, corps, attendue in VECTEURS:
            self.assertEqual(p._signer(ts, corps), attendue)
        # TÉMOIN : la même charge, sérialisée avec les séparateurs par défaut,
        # ne donne PAS la même signature — c'est pourquoi on sérialise une fois.
        autre = json.dumps({"source_id": 1}).encode()
        self.assertNotEqual(autre, VECTEURS[0][2])
        self.assertNotEqual(p._signer(1760000000, autre), VECTEURS[0][3])

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
            sig = hmac.new(b"secret-akwa", ts.encode() + b"." + corps_signe,
                           hashlib.sha256).hexdigest()
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
            "texte": SMS_ENTREE, "emis_le": None})
        self.assertNotIn("carte", ligne)
        self.assertEqual(_etat(journal, 1), (1, "credite XAFe-DP-000001", 0))

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
        threading.Thread(target=serveur.serve_forever, daemon=True).start()
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

    def test_une_sortie_ne_part_pas(self):
        g = self.guichet()
        journal = journal_avec_carte()
        journal.sms("MobileMoney", SMS_SORTIE, "MTN ·0011", ICCID)
        self.assertEqual(self.porte(g, journal).pousser_paiements(), 0)
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
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(_etat(journal, 1)[:2], (1, "sans objet"))
        journal.sms("MobileMoney", SMS_DEUX_PARTIES, "MTN ·0011", ICCID)
        p.fournir_numeros = None
        self.assertEqual(p.pousser_paiements(), 0)
        self.assertEqual(_etat(journal, 2)[:2], (1, "sans objet"))
        self.assertEqual(g.requetes, [])

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
        threading.Thread(target=serveur.serve_forever, daemon=True).start()

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
        # Porte ACTIVE : la relève des commandes rend [] et ne fait aucune
        # requête — elle n'est pas branchée (docs/XAFE.md, le code secret).
        self.assertEqual(p.commandes_en_attente(), [])
        self.assertEqual(g.requetes, [])
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
