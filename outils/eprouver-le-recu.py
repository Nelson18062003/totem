# -*- coding: utf-8 -*-
"""LE REÇU, DU SMS REÇU PAR LE BOÎTIER JUSQU'AU TÉLÉPHONE — CHRONOMÉTRÉ.

    python3 outils/eprouver-le-recu.py

POURQUOI CE FICHIER EXISTE. Le propriétaire : « ça prend trop de temps pour
générer les PDF ; je reçois le PDF sur Telegram, et sur le téléphone je dois
encore refaire le reçu ». Fabriquer le document prend une quinzaine de
millisecondes. Ce qui prenait du temps, c'était le TRAJET :

    le reçu inscrit attendait dix secondes (le délai qui laisse l'alerte
    texte partir la première sur Telegram), puis le tour de surveillance
    suivant, partait sur Telegram — et n'était déposé sur la plateforme
    qu'APRÈS que Telegram l'avait pris. Telegram lent : le téléphone
    attendait. Telegram en panne : le téléphone n'avait rien, jamais. Une
    demande faite depuis l'application subissait les mêmes dix secondes.

Chaque morceau avait ses tests ; personne ne chronométrait le trajet. Ce
harnais le fait, avec un vrai robot, un vrai pont vers le nuage, le faux
nuage et la plateforme compilée — et il mesure là où le téléphone regarde :
`/api/recu-du-sms`, la question que pose la fiche d'un SMS, puis le PDF
lui-même, téléchargé.

CE QU'IL EXIGE :

  1. Telegram rapide, lent ou EN PANNE : le reçu est sur la plateforme en
     moins de LIMITE secondes après la relève du SMS ;
  2. l'alerte texte part toujours AVANT le PDF sur Telegram, et le PDF y
     garde son délai ;
  3. une demande de l'application (« Établir le reçu ») est servie sans les
     dix secondes : quand le boîtier répond, le document est déjà là ;
  4. redemander le même reçu ne le refait pas : la réponse est immédiate et
     la date du document ne bouge pas.

SON TÉMOIN. `RobotDAvant` rejoue l'ancien ordre — Telegram d'abord, la
plateforme après, la demande seulement inscrite — en quelques lignes. Les
exigences 1 et 3 sont jouées contre lui AVANT les vraies : s'il les passe,
le harnais s'arrête, car il ne verrait rien. Ses temps sont les temps
« avant » ; ceux du vrai robot, les temps « après ». (L'exigence 4 n'a pas
de témoin ici : `tests/test_recus.py` garde l'ancienne refabrication.)

Ce qu'il ne mesure PAS : le relais de la demande par la base — le guichet
du boîtier relève les demandes toutes les trois secondes au repos
(`PAS_REPOS`, totem/pilotage.py). C'est la même attente avant et après.

Rien ici ne touche à une vraie base ni à un vrai terminal.
"""

import json
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from totem.app import DELAI_RECU, Robot
from totem.compte import Compte
from totem.nuage import DEBOUNCE, Nuage
from totem.pilotage import Pilotage
from totem.simulator import ModemSimule
from totem.storage import Journal

PORT = 3168
NUAGE = 4994
BASE = f"http://127.0.0.1:{PORT}"
MDP = "un-mot-de-passe-assez-long"
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(RACINE, "web")

# Le reçu doit être chez le téléphone en moins de LIMITE secondes. Le trajet
# honnête : la relève, le dépôt (quelques dixièmes), la montée du SMS par le
# pont (une seconde de regroupement), une question de la fiche.
LIMITE = 5.0
# Une demande de l'application : le boîtier répond quand le document est
# déposé. Au-delà, c'est une attente qu'on s'inflige.
LIMITE_DEMANDE = 3.0
# Le tour de surveillance, comme en service (`pause_sms`).
TOUR = 10
# Combien de temps on accepte d'attendre avant de conclure « jamais ».
PATIENCE = 25

echecs = 0


def verifier(quoi, ok, detail=""):
    global echecs
    if not ok:
        echecs += 1
    print(f"  {'✓' if ok else '✗'} {quoi:<58} {detail}")


def port_libre(port):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1.5)
        return False
    except urllib.error.URLError:
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# TROIS TELEGRAM : rapide, lent, en panne. Chacun note QUAND il a reçu quoi.
# ---------------------------------------------------------------------------
class Telegram:
    def __init__(self, allure="rapide"):
        self.allure = allure
        self.journal = []        # (instant, "alerte" | "pdf")

    def envoyer(self, *a, **k):
        self.journal.append((time.monotonic(), "alerte"))
        return 1

    def envoyer_fichier(self, *a, **k):
        if self.allure == "panne":
            return False
        if self.allure == "lent":
            time.sleep(20)       # un envoi de document qui traîne
        self.journal.append((time.monotonic(), "pdf"))
        return True

    def modifier(self, *a, **k): return True
    def supprimer(self, *a, **k): pass
    def acheminer(self, *a, **k):
        # Le chemin du facteur (totem/courrier.py) : c'est par lui que part
        # l'alerte d'un SMS. Il veut « livre », pas un numéro.
        self.journal.append((time.monotonic(), "alerte"))
        return "livre"
    def role(self, _u): return "admin"
    def recevoir(self): return []
    def accuser(self, *a, **k): pass
    def retirer_boutons(self, *a, **k): pass
    def publier_commandes(self, *a, **k): pass
    def vider_backlog(self): pass


# ---------------------------------------------------------------------------
# LE TÉMOIN : l'ordre d'avant, réécrit en quelques lignes.
# ---------------------------------------------------------------------------
class RobotDAvant(Robot):
    """Telegram d'abord ; la plateforme ne voit que ce que Telegram a pris ;
    une demande de l'application est seulement inscrite."""

    def lancer_le_depot(self):
        return None

    def _recu_apres_coup(self, source_id, nature=None, langue=None):
        texte = self.journal.texte_sms(source_id)
        return texte and self._programmer_recu(
            source_id, texte, nature=nature, langue=langue, expliquer=True)

    def _distribuer_recus(self):
        j = self.journal
        for ligne in j.recus_a_envoyer(DELAI_RECU):
            nom, pdf, legende = self._fabriquer_recu(ligne)
            if self.transport.envoyer_fichier(nom, pdf, legende):
                j.recu_envoye(ligne[0])
            else:
                j.recu_echoue(ligne[0])
                break
        envoyes = {i for (i,) in j.conn.execute(
            "SELECT id FROM recus WHERE envoye = 1").fetchall()}
        for ligne in j.recus_a_archiver():
            if ligne[0] in envoyes:
                nom, pdf, _ = self._fabriquer_recu(ligne)
                if self.nuage.archiver_recu(nom, pdf, self._fiche_recu(ligne)):
                    j.recu_archive(ligne[0])


# ---------------------------------------------------------------------------
# UN BOÎTIER EN SERVICE, en petit : le tour de surveillance toutes les dix
# secondes, le pont qui monte les SMS dès qu'on le réveille, et (pour le
# vrai robot) le fil du dépôt.
# ---------------------------------------------------------------------------
class Boitier:
    numero = 0

    def __init__(self, classe, telegram, recus=True):
        Boitier.numero += 1
        self.nom = f"recu-essai-{Boitier.numero}"
        self.journal = Journal(":memory:")
        self.modem = ModemSimule("MTN")
        self.compte = Compte(self.modem, "MTN")
        self.nuage = Nuage(f"http://127.0.0.1:{NUAGE}", "peu-importe",
                           self.nom, self.journal)
        self.telegram = telegram
        self.robot = classe([self.compte], telegram, self.journal, nom="T",
                            pause_sms=TOUR, nuage=self.nuage, recus=recus)
        self.marche = True
        threading.Thread(target=self._tour, daemon=True).start()
        threading.Thread(target=self._pont, daemon=True).start()
        self.robot.lancer_le_depot()

    def _tour(self):
        while self.marche:
            self.robot._etape("distribution des reçus",
                              self.robot._distribuer_recus)
            fin = time.monotonic() + TOUR
            while self.marche and time.monotonic() < fin:
                time.sleep(0.1)

    def _pont(self):
        while self.marche:
            if self.nuage._reveil.wait(timeout=0.3):
                self.nuage._reveil.clear()
                time.sleep(DEBOUNCE)
                self.nuage.pousser_paiements()

    def recevoir(self, texte):
        """Un SMS tombe dans le modem ; le poste de la carte le relève."""
        self.modem.sms_en_attente.append((1, "MTNMobileMoney", texte))
        self.robot._relever_sms(self.compte)
        return time.monotonic()

    def arreter(self):
        self.marche = False
        self.robot.actif = False
        self.robot._reveil_depot.set()


# ---------------------------------------------------------------------------
# CE QUE VOIT LE TÉLÉPHONE.
# ---------------------------------------------------------------------------
def lire(chemin, biscuit, brut=False):
    req = urllib.request.Request(f"{BASE}{chemin}", headers={"cookie": biscuit})
    with urllib.request.urlopen(req, timeout=20) as r:
        corps = r.read()
    return corps if brut else json.loads(corps)


def poster(chemin, corps, biscuit=None):
    req = urllib.request.Request(f"{BASE}{chemin}", data=json.dumps(corps).encode(),
                                 method="POST",
                                 headers={"content-type": "application/json"})
    if biscuit:
        req.add_header("cookie", biscuit)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.headers


def sms_a_l_ecran(biscuit, tiers, fin):
    while time.monotonic() < fin:
        for p in lire("/api/donnees?sms=200", biscuit)["paiements"]:
            if tiers in p["smsBrut"]:
                return p
        time.sleep(0.2)
    return None


def recu_pour_le_telephone(biscuit, tiers, depuis, patience=PATIENCE):
    """Le temps écoulé depuis `depuis` jusqu'à ce que la fiche du SMS
    obtienne son numéro de reçu — ou None : jamais dans la patience."""
    fin = depuis + patience
    p = sms_a_l_ecran(biscuit, tiers, fin)
    if p is None:
        return None, None, None
    while time.monotonic() < fin:
        n = lire(f"/api/recu-du-sms?id={p['id']}", biscuit).get("recu")
        if n:
            return time.monotonic() - depuis, n, p
        time.sleep(0.2)
    return None, None, p


NOMS = ["", "ABENA Rose", "KAMGA Eric", "FOTSO Jean", "NGONO Marie",
        "ETOGA Paul", "MBALLA Claire", "TCHOUMI Alain"]


def encaissement(k, montant):
    tiers = NOMS[k]
    return tiers, (f"Vous avez recu {montant} FCFA de {tiers} (6770000{k:02d}). "
                   f"Ref: PP261004.10{k:02d}.R{k}. Nouveau solde: 900000 FCFA.")


def secondes(s):
    return "jamais" if s is None else f"{s:.1f} s"


def main():
    global echecs
    for port in (PORT, NUAGE):
        if not port_libre(port):
            print(f"\n✗ Le port {port} est déjà occupé — arrêtez l'essai précédent.")
            return 1

    # Recompiler : `next start` sert « .next », pas le disque.
    print("\nCompilation de la plateforme…")
    if subprocess.run(["npx", "next", "build"], cwd=WEB,
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        print("✗ la compilation a échoué — le trajet ne peut rien prouver")
        return 1

    faux_nuage = subprocess.Popen(
        ["node", "scripts/faux-nuage.mjs"], cwd=WEB,
        env={**os.environ, "PORT": str(NUAGE)},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True)
    plateforme = subprocess.Popen(
        ["npx", "next", "start", "-p", str(PORT)], cwd=WEB,
        env={**os.environ,
             "SUPABASE_URL": f"http://127.0.0.1:{NUAGE}",
             "SUPABASE_CLE": "peu-importe",
             "SESSION_SECRET": "secret-du-recu",
             "TOTEM_MOT_DE_PASSE": "cle-de-secours-recu"},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        # Son PROPRE groupe : « npx » lance le vrai serveur en dessous, et
        # c'est le groupe entier qu'on arrête à la fin.
        start_new_session=True)
    boitiers = []

    try:
        for _ in range(120):
            try:
                urllib.request.urlopen(f"{BASE}/api/plateforme", timeout=2)
                break
            except Exception:
                time.sleep(0.5)

        poster("/api/inscription", {"courriel": "recu@essai.cm", "motdepasse": MDP})
        _, entetes = poster("/api/connexion", {"courriel": "recu@essai.cm",
                                               "motdepasse": MDP})
        biscuit = "; ".join(c.split(";")[0]
                            for c in (entetes.get_all("set-cookie") or []))

        def un_sms(classe, allure, k, montant):
            b = Boitier(classe, Telegram(allure))
            boitiers.append(b)
            time.sleep(3)                  # le SMS tombe au milieu d'un tour
            tiers, texte = encaissement(k, montant)
            t0 = b.recevoir(texte)
            duree, numero, p = recu_pour_le_telephone(biscuit, tiers, t0)
            return b, t0, duree, numero, p

        def une_demande(classe, k, montant):
            """Un SMS sans reçu (les reçus coupés à son arrivée), puis la
            demande « Établir le reçu » qui arrive au boîtier."""
            b = Boitier(classe, Telegram("rapide"), recus=False)
            boitiers.append(b)
            time.sleep(3)
            tiers, texte = encaissement(k, montant)
            b.recevoir(texte)
            p = sms_a_l_ecran(biscuit, tiers, time.monotonic() + 10)
            b.robot.recus = True
            guichet = Pilotage(b.nuage, b.robot.comptes, b.journal,
                               programmeur=b.robot._recu_apres_coup)
            t0 = time.monotonic()
            reponse = guichet._etablir_recu({"source_id": 1, "nature": "depot"},
                                            langue="fr")
            repondu = time.monotonic() - t0
            duree, numero, _ = recu_pour_le_telephone(biscuit, tiers, t0)
            return b, guichet, reponse, repondu, duree, numero, p

        # --- LE TÉMOIN D'ABORD ------------------------------------------
        print("\nLe témoin : l'ancien ordre (Telegram d'abord, dix secondes)")
        _, _, avant_rapide, _, _ = un_sms(RobotDAvant, "rapide", 1, 11000)
        print(f"    Telegram rapide  : reçu chez le téléphone en {secondes(avant_rapide)}")
        _, _, avant_panne, _, _ = un_sms(RobotDAvant, "panne", 2, 12000)
        print(f"    Telegram en panne: reçu chez le téléphone en {secondes(avant_panne)}")
        _, _, rep_av, repondu_av, avant_demande, _, _ = une_demande(RobotDAvant, 3, 13000)
        print(f"    Demande de l'application : réponse en {repondu_av:.1f} s, "
              f"reçu chez le téléphone en {secondes(avant_demande)}")
        voit = ((avant_rapide is None or avant_rapide > LIMITE)
                and avant_panne is None
                and (avant_demande is None or avant_demande > LIMITE_DEMANDE))
        if not voit:
            print("\n✗ Le témoin passe les exigences : ce harnais ne verrait "
                  "rien. Il s'arrête.")
            return 1
        print("    → le témoin échoue, comme il le doit.")
        for b in boitiers:
            b.arreter()

        # --- LE VRAI ROBOT ----------------------------------------------
        print("\nDu SMS au téléphone : la plateforme d'abord")
        for allure, k, montant in (("rapide", 4, 14000), ("lent", 5, 15000),
                                   ("panne", 6, 16000)):
            b, t0, duree, numero, p = un_sms(Robot, allure, k, montant)
            verifier(f"Telegram {allure} : le reçu est chez le téléphone",
                     duree is not None and duree <= LIMITE,
                     f"{secondes(duree)} (limite {LIMITE:.0f} s, avant : "
                     f"{secondes(avant_panne if allure == 'panne' else avant_rapide)})")
            if numero:
                pdf = lire(f"/api/recu/{numero}", biscuit, brut=True)
                verifier(f"Telegram {allure} : le PDF se télécharge",
                         pdf[:5] == b"%PDF-", f"{numero}, {len(pdf)} octets")
            if allure == "rapide":
                # L'ordre sur Telegram : l'alerte, PUIS le PDF, avec son délai.
                fin = time.monotonic() + PATIENCE
                while time.monotonic() < fin and not any(
                        q == "pdf" for _, q in b.telegram.journal):
                    time.sleep(0.2)
                alerte = next((i for i, q in b.telegram.journal if q == "alerte"), None)
                pdf_tg = next((i for i, q in b.telegram.journal if q == "pdf"), None)
                verifier("Telegram : l'alerte texte part avant le PDF",
                         alerte is not None and pdf_tg is not None and alerte < pdf_tg,
                         "" if pdf_tg is None or alerte is None
                         else f"PDF {pdf_tg - alerte:.1f} s après l'alerte")
                verifier("Telegram : le PDF garde son délai",
                         alerte is not None and pdf_tg is not None
                         and pdf_tg - alerte >= DELAI_RECU - 0.5)
            b.arreter()

        print("\nUne demande de l'application : servie sans attendre")
        b, guichet, reponse, repondu, duree, numero, p = une_demande(Robot, 7, 17000)
        verifier("le boîtier répond vite", repondu <= LIMITE_DEMANDE,
                 f"{repondu:.1f} s (limite {LIMITE_DEMANDE:.0f} s)")
        verifier("sa réponse dit « prêt » — le document est déposé",
                 "prêt" in reponse, reponse[:60])
        verifier("le reçu est chez le téléphone",
                 duree is not None and duree <= LIMITE_DEMANDE,
                 f"{secondes(duree)} (avant : {secondes(avant_demande)})")

        print("\nRedemander le même reçu ne le refait pas")
        if numero:
            avant = lire(f"/api/recu/{numero}/fiche", biscuit).get("etabliLe")
            time.sleep(1.1)                # la date est à la seconde
            t0 = time.monotonic()
            reponse2 = guichet._etablir_recu({"source_id": 1, "nature": "depot"},
                                             langue="fr")
            delai = time.monotonic() - t0
            apres = lire(f"/api/recu/{numero}/fiche", biscuit).get("etabliLe")
            verifier("la réponse est immédiate", delai <= 1.0, f"{delai:.2f} s")
            # « Déjà à jour » vient du ROBOT, qui a refait le document en
            # mémoire et comparé son empreinte à celle déposée — jamais de
            # l'égalité des numéros, qu'un document refait garde aussi.
            verifier("même numéro, dit « déjà à jour »",
                     numero in reponse2 and "déjà à jour" in reponse2,
                     reponse2[:60])
            verifier("le document n'est pas refait (sa date ne bouge pas)",
                     avant is not None and avant == apres, f"{avant} → {apres}")
        else:
            verifier("un reçu à redemander", False, "la demande n'a rien donné")
        b.arreter()
    finally:
        for b in boitiers:
            b.arreter()
        for proc in (plateforme, faux_nuage):
            try:
                os.killpg(proc.pid, signal.SIGTERM)      # le groupe entier
            except ProcessLookupError:
                pass

    print("\n✓ Le reçu arrive au téléphone sans attendre Telegram.\n"
          if echecs == 0 else f"\n✗ {echecs} vérification(s) en échec.\n")
    return 0 if echecs == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
