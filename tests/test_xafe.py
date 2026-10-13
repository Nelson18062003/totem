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
     lignes ; l'historique ne part pas à la naissance de la colonne ; aucun
     secret ni donnée personnelle au journal ; le réveil est immédiat ; le
     démarrage du robot lance la porte ; sans configuration, rien ne change.

CHAQUE EXIGENCE A SON TÉMOIN : `PorteDAvant` (marque avant la requête),
`PorteToutMarque` (un 200 = tout marqué), `PorteSansRecalage` (ne lit pas
l'heure de la base), `PorteQuiSigneLeMauvaisCorps` (signe une sérialisation,
envoie une autre). Ce sont des copies figées, pas des appels au code du jour.

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
from totem.nuage import Nuage
from totem.storage import Journal
from totem.xafe import PorteXafe

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


class FausseCarteMTN:
    identifiee = True
    iccid = ICCID
    imsi = "624010000000011"
    operateur = "MTN"
    libelle = "MTN ·0011"
    numero = ""


class FauxXafe:
    """Le guichet XAFe, imité : il vérifie la signature comme `porte.ts`,
    rend des verdicts par ligne, retient ce qu'il a crédité (la MÊME réponse
    revient, « deja »), et sait tomber en panne ou décaler son horloge."""

    def __init__(self, port=0):
        self.cles = {"akwa-1": "secret-akwa"}
        self.decalage = 0.0         # horloge du guichet − horloge de la machine
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
        if abs((time.time() + self.decalage) - int(ts)) > 300:
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


# --- aides -------------------------------------------------------------------

def journal_avec_carte(numero="677000000"):
    journal = Journal(":memory:")
    journal.voir_carte(FausseCarteMTN())
    if numero:
        journal.definir_identite(ICCID, numero=numero)
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


def _etat(journal, id_):
    return journal.conn.execute(
        "SELECT COALESCE(envoye_xafe,0), xafe_reponse, COALESCE(envoye,0) "
        "FROM sms WHERE id = ?", (id_,)).fetchone()


def _evenements(journal):
    return [t for (t,) in journal.conn.execute("SELECT texte FROM evenements")]


class Banc(unittest.TestCase):
    def setUp(self):
        self._debounce, self._pas = module_xafe.DEBOUNCE, module_xafe.PAS_RELEVE
        module_xafe.DEBOUNCE = 0
        module_xafe.PAS_RELEVE = 0
        self.guichets, self.portes = [], []

    def tearDown(self):
        for p in self.portes:
            p.arreter()
        for g in self.guichets:
            g.fermer()
        module_xafe.DEBOUNCE, module_xafe.PAS_RELEVE = self._debounce, self._pas

    def guichet(self):
        g = FauxXafe()
        self.guichets.append(g)
        return g

    def porte(self, guichet, journal, classe=PorteXafe, **kw):
        p = porte(guichet, journal, classe, **kw)
        self.portes.append(p)
        return p


# =============================================================================
# A. LA SIGNATURE
# =============================================================================

class TestLaSignature(Banc):

    def test_la_signature_python_est_celle_de_la_porte(self):
        p = PorteXafe("http://127.0.0.1:1", "secret-akwa", "akwa-1", Journal(":memory:"))
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

        def envoyer(corps_signe, corps_envoye, age=0, entetes=True):
            ts = str(int(time.time()) - age)
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
        self.assertEqual(envoyer(corps, corps, age=299), 200, message)

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
        g.verdicts[3] = "credite"
        self.assertEqual(p.pousser_paiements(), 1)
        self.assertEqual(_etat(journal, 3)[0], 1)
        self.assertEqual(len(g.lignes_recues()[-1:]), 1)
        self.assertEqual(g.lignes_recues()[-1]["source_id"], 3)
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

    def test_un_sens_inconnu_faute_de_numero_n_est_pas_clos(self):
        """DÉCISION ÉCRITE : la carte est déclarée, l'analyse a eu sa chance.
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
        evts = [e for e in _evenements(journal) if "XAFe" in e]
        self.assertTrue(evts)
        for e in evts:
            self.assertNotIn("secret-akwa", e)
            self.assertIsNone(re.search(r"[0-9a-f]{64}", e))
            for interdit in ("677123456", "25000", "25 000", "NGONO", "677000000"):
                self.assertNotIn(interdit, e)

    def test_inerte_sans_configuration(self):
        journal = Journal(":memory:")
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
        # Et Bonzini ne voit aucune différence : le robot avec `xafe=None` et
        # le robot sans le paramètre produisent les MÊMES requêtes.
        from tests.test_recus import _robot
        serveur = HTTPServer(("127.0.0.1", 0), FauxSupabase)
        threading.Thread(target=serveur.serve_forever, daemon=True).start()
        try:
            releves = []
            for avec_parametre in (False, True):
                FauxSupabase.recu = []
                robot, compte, modem, j = _robot()
                if avec_parametre:
                    robot.xafe = None
                # Le même texte dans les deux cas : le simulateur tire un
                # numéro au hasard, et deux relèves ne se compareraient pas.
                modem.sms_en_attente.append((1, modem.service, SMS_ENTREE))
                robot._relever_sms(compte)
                nuage = Nuage(f"http://127.0.0.1:{serveur.server_address[1]}",
                              "fausse-cle", "douala", j)
                nuage.fournir_numeros = robot._nos_numeros
                nuage.pousser_paiements()
                releves.append([(table, [{k: v for k, v in l.items() if k != "recu_le"}
                                         for l in corps])
                                for table, corps in FauxSupabase.recu])
            self.assertEqual(releves[0], releves[1])
            self.assertTrue(releves[0], "aucune requête : la comparaison ne mesure rien")
        finally:
            serveur.shutdown()
            serveur.server_close()

    def test_https_ou_rien(self):
        journal = Journal(":memory:")
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

    def test_le_robot_branche_ses_crochets_sur_la_porte(self):
        from tests.test_recus import _robot
        robot, compte, modem, journal = _robot()
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


if __name__ == "__main__":
    unittest.main()
