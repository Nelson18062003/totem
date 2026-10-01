# -*- coding: utf-8 -*-
"""LA CHAÎNE ENTIÈRE, DES OCTETS DU MODEM JUSQU'À L'ÉCRAN.

    python3 outils/eprouver-la-chaine.py

POURQUOI CE FICHIER EXISTE. Un SMS d'encaissement traverse sept mains avant
d'être un chiffre à l'écran :

    octets PDU du modem → décodage → recollage des morceaux → lecture du
    montant → journal du Pi → montée au nuage → lecture par la plateforme

Chaque main a ses tests. Personne ne parcourait le trajet ENTIER. Et le
dernier pas — ce que le robot ÉCRIT dans la base, relu par la plateforme —
n'était parcouru par rien du tout : le faux nuage ne savait même pas recevoir
une écriture du robot.

Or c'est là que se cache la question qui compte : le robot et la plateforme
lisent le même SMS DEUX FOIS, chacun avec son propre code, dans deux langages
différents. Rien ne vérifiait qu'ils tombent d'accord sur le montant.

CE QUE CE HARNAIS GARDE :

  1. un encaissement ordinaire arrive entier, et le MÊME montant se retrouve
     à l'écran ;
  2. un message long, coupé en deux par l'opérateur, se recolle — un montant
     coupé en deux ferait n'importe quoi ;
  3. un SMS avec accents (UCS-2) traverse sans se déformer ;
  4. l'heure RÉSEAU du message est celle qui est retenue, pas l'heure de
     relève du Pi — les deux divergent après une coupure ;
  5. UNE COUPURE DE COURANT NE COMPTE PAS L'ARGENT DEUX FOIS. C'est la
     vérification la plus importante : le robot écrit au journal AVANT
     d'effacer dans le modem, donc un SMS déjà journalisé PEUT être relu au
     redémarrage. Il doit alors être reconnu, pas recompté ;
  6. un SMS illisible ne bloque pas ceux qui suivent.

Rien ici ne touche à une vraie base ni à un vrai terminal : un faux modem, un
faux nuage, une plateforme lancée pour l'occasion.
"""

import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))

from totem.app import Robot
from totem.compte import Compte
from totem.modem import ModemSerie
from totem.nuage import Nuage
from totem.simulator import ModemSimule
from totem.storage import Journal
from tests.test_pdu import fabriquer_pdu

PORT = 3166
NUAGE = 4992
BASE = f"http://127.0.0.1:{PORT}"
MDP = "un-mot-de-passe-assez-long"
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(RACINE, "web")

echecs = 0


def verifier(quoi, ok, detail=""):
    global echecs
    if not ok:
        echecs += 1
    print(f"  {'✓' if ok else '✗'} {quoi:<56} {detail}")


def port_libre(port):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1.5)
        return False
    except urllib.error.URLError:
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# LE FAUX MODEM : il rend de VRAIS octets PDU, comme le port série.
# ---------------------------------------------------------------------------
def modem_pdu(*pdus):
    """Un ModemSerie sans matériel, dont AT+CMGL rend ces PDU-là."""
    m = ModemSerie.__new__(ModemSerie)
    m.verrou = threading.Lock()
    m.mode_pdu = True
    m._morceaux_vus = {}
    m.efface = []
    lignes = "".join(f"+CMGL: {i},1,,{len(p) // 2}\r\n{p}\r\n" for i, p in pdus)
    m._envoyer = lambda commande, delai=10: lignes + "\r\nOK\r\n"
    m.effacer_sms = lambda indices: m.efface.append(list(indices))
    return m


class CompteEssai(Compte):
    """Un compte dont le modem rend des PDU. Le reste est simulé."""

    def __init__(self, modem_reel, libelle="MTN ·0011"):
        simule = ModemSimule(operateur="MTN")
        super().__init__(simule, "MTN")
        self._pdu = modem_reel
        self.libelle = libelle

    def lire_sms(self):
        return self._pdu.lire_sms()

    def effacer_sms(self, indices):
        self._pdu.effacer_sms(indices)


def main():
    global echecs
    for port in (PORT, NUAGE):
        if not port_libre(port):
            print(f"\n✗ Le port {port} est déjà occupé — arrêtez l'essai précédent.")
            return 1

    print("\nCompilation de la plateforme…")
    if subprocess.run(["npx", "next", "build"], cwd=WEB,
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        print("✗ la compilation a échoué — la chaîne ne peut rien prouver")
        return 1

    env_nuage = {**os.environ, "PORT": str(NUAGE)}
    faux_nuage = subprocess.Popen(["node", "scripts/faux-nuage.mjs"], cwd=WEB,
                                  env=env_nuage, stdout=subprocess.DEVNULL,
                                  stderr=subprocess.DEVNULL)
    plateforme = subprocess.Popen(
        ["npx", "next", "start", "-p", str(PORT)], cwd=WEB,
        env={**os.environ,
             "SUPABASE_URL": f"http://127.0.0.1:{NUAGE}",
             "SUPABASE_CLE": "peu-importe",
             "SESSION_SECRET": "secret-de-la-chaine",
             "TOTEM_MOT_DE_PASSE": "cle-de-secours-chaine"},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(f"{BASE}/api/plateforme", timeout=2)
                break
            except Exception:
                time.sleep(0.5)

        # --- LE TERMINAL : du PDU jusqu'au nuage ---------------------------
        print("\nDu modem au nuage")
        maintenant = datetime.now(timezone.utc)
        veille = maintenant - timedelta(hours=3)

        pdus = [
            # 1. un encaissement ordinaire
            (1, fabriquer_pdu(
                "Vous avez recu 27500 FCFA de ABENA Rose (677445566). "
                "Ref: PP260831.1042.A9. Nouveau solde: 900000 FCFA.",
                expediteur="MTNMobileMoney", quand=veille)),
            # 2 et 3. un message LONG, coupé par l'opérateur — le montant est
            # à cheval sur la coupure : mal recollé, il devient n'importe quoi.
            (2, fabriquer_pdu("Vous avez recu 13", expediteur="MTNMobileMoney",
                              reference=42, total=2, position=1, quand=maintenant)),
            (3, fabriquer_pdu("0000 FCFA de KAMGA Eric (699112233).",
                              expediteur="MTNMobileMoney",
                              reference=42, total=2, position=2, quand=maintenant)),
            # 4. des accents : le SMS part en UCS-2, pas en GSM 7 bits.
            (4, fabriquer_pdu("Retrait effectué : 5000 FCFA. Solde : 895000 FCFA.",
                              expediteur="MTNMobileMoney", ucs2=True,
                              quand=maintenant)),
        ]
        modem = modem_pdu(*pdus)
        journal = Journal(":memory:")
        nuage = Nuage(f"http://127.0.0.1:{NUAGE}", "peu-importe",
                      "douala-faux", journal)
        compte = CompteEssai(modem)

        class TransportMuet:
            def envoyer(self, *a, **k): return 1
            def modifier(self, *a, **k): return True
            def supprimer(self, *a, **k): pass
            def envoyer_fichier(self, *a, **k): return True
            def acheminer(self, *a, **k): return 1
            def role(self, _u): return "admin"
            def recevoir(self): raise KeyboardInterrupt
            def accuser(self, *a, **k): pass
            def retirer_boutons(self, *a, **k): pass

        robot = Robot([compte], TransportMuet(), journal, nom="T", pause_sms=1)
        robot._relever_sms(compte)

        lignes = journal.derniers_sms(20, ())
        textes = [t for _, _, t, _ in lignes]
        # QUATRE PDU, TROIS MESSAGES : deux d'entre eux sont les deux moitiés
        # d'un seul SMS. Le recolleur doit les rendre comme un.
        verifier("quatre PDU donnent trois messages", len(lignes) == 3,
                 f"{len(lignes)} lignes")
        verifier("le message long est recollé, montant intact",
                 any("130000 FCFA" in t for t in textes),
                 next((t[:38] for t in textes if "13" in t), "absent"))
        verifier("les accents traversent le PDU sans se déformer",
                 any("effectué" in t for t in textes))

        # L'heure RÉSEAU, pas l'heure de relève : elles divergent après une
        # coupure, et c'est la réseau qui fait foi pour l'ordre et les reçus.
        brutes = journal.sms_non_envoyes(20)
        heures = [l[6] for l in brutes]
        verifier("chaque message porte son heure réseau",
                 all(h for h in heures), f"{sum(1 for h in heures if h)}/3")
        verifier("l'encaissement d'il y a trois heures garde SON heure",
                 any(h and h.startswith(veille.strftime("%Y-%m-%dT%H")) for h in heures))

        envoyes = nuage.pousser_paiements()
        verifier("le nuage les accepte tous les trois", envoyes == 3,
                 f"{envoyes} envoyés")

        # --- LA PLATEFORME : le même argent, relu par un autre code --------
        print("\nDu nuage à l'écran (deux lectures du même SMS)")
        poster(f"{BASE}/api/inscription",
               {"courriel": "chaine@essai.cm", "motdepasse": MDP})
        biscuit = connexion()
        donnees = lire(f"{BASE}/api/donnees?sms=200", biscuit)
        ordinaire = next((p for p in donnees["paiements"]
                          if "ABENA Rose" in p["smsBrut"]), None)
        verifier("l'encaissement est arrivé jusqu'à l'écran",
                 ordinaire is not None)
        if ordinaire:
            # LA VÉRIFICATION QUI N'EXISTAIT PAS : le robot (Python) et la
            # plateforme (TypeScript) lisent le même SMS chacun de son côté.
            # Ils doivent tomber sur le MÊME montant.
            verifier("le robot et la plateforme comptent le même montant",
                     ordinaire["montant"] == 27500, f"{ordinaire['montant']} FCFA")
            verifier("le sens est le bon", ordinaire["sens"] == "in",
                     str(ordinaire["sens"]))
            verifier("le tiers est la personne, pas l'opérateur",
                     ordinaire["tiers"] == "ABENA Rose", str(ordinaire["tiers"]))

        long_ = next((p for p in donnees["paiements"] if "KAMGA" in p["smsBrut"]), None)
        verifier("le message long vaut 130 000 à l'écran, pas 13",
                 long_ is not None and long_["montant"] == 130000,
                 str(long_["montant"]) if long_ else "absent")

        # --- LA COUPURE DE COURANT ----------------------------------------
        #
        # Le robot écrit au journal AVANT d'effacer dans le modem : si le
        # courant tombe entre les deux, le SMS est encore dans le modem au
        # redémarrage. C'est voulu — mieux vaut le relire que le perdre. Mais
        # il ne doit surtout pas être RECOMPTÉ.
        print("\nUne coupure de courant ne compte pas l'argent deux fois")
        avant = len(journal.derniers_sms(50, ()))
        modem2 = modem_pdu(*pdus)          # le modem n'a rien effacé
        compte2 = CompteEssai(modem2)
        robot2 = Robot([compte2], TransportMuet(), journal, nom="T", pause_sms=1)
        robot2._relever_sms(compte2)
        apres = len(journal.derniers_sms(50, ()))
        verifier("relire le modem n'ajoute aucune ligne", apres == avant,
                 f"{avant} → {apres}")

        nuage.pousser_paiements()
        donnees2 = lire(f"{BASE}/api/donnees?sms=200", biscuit)
        abena = [p for p in donnees2["paiements"] if "ABENA Rose" in p["smsBrut"]]
        verifier("l'encaissement n'apparaît qu'UNE fois à l'écran",
                 len(abena) == 1, f"{len(abena)} fois")
        # On ne compte QUE les messages venus du modem d'essai : le faux nuage
        # porte aussi ses propres encaissements de démonstration, et les
        # additionner ferait dire n'importe quoi à ce contrôle.
        miens = [p for p in donnees2["paiements"]
                 if "ABENA Rose" in p["smsBrut"] or "KAMGA Eric" in p["smsBrut"]]
        total = sum(p["montant"] or 0 for p in miens)
        verifier("le total encaissé n'a pas doublé", total == 27500 + 130000,
                 f"{total} FCFA sur {len(miens)} lignes")

        # --- UN SMS ILLISIBLE NE BLOQUE PAS LES AUTRES --------------------
        print("\nUn message abîmé ne fait pas tomber la relève")
        modem3 = modem_pdu(
            (9, "07911111111111F1040B911111111111F100005260101010104A" + "ZZ"),
            (10, fabriquer_pdu("Vous avez recu 4000 FCFA de FOTSO Jean.",
                               expediteur="MTNMobileMoney", quand=maintenant)))
        compte3 = CompteEssai(modem3)
        journal3 = Journal(":memory:")
        robot3 = Robot([compte3], TransportMuet(), journal3, nom="T", pause_sms=1)
        robot3._relever_sms(compte3)
        gardes = journal3.derniers_sms(10, ())
        verifier("le message valide passe malgré le voisin abîmé",
                 any("FOTSO" in t for _, _, t, _ in gardes),
                 f"{len(gardes)} lignes")
        verifier("l'emplacement abîmé est libéré, pas gardé pour toujours",
                 any(9 in lot for lot in modem3.efface), str(modem3.efface))
    finally:
        plateforme.kill()
        faux_nuage.kill()

    print("\n✓ La chaîne tient, des octets du modem jusqu'à l'écran.\n"
          if echecs == 0 else f"\n✗ {echecs} vérification(s) en échec.\n")
    return 0 if echecs == 0 else 1


def poster(url, corps, biscuit=None):
    donnees = json.dumps(corps).encode()
    req = urllib.request.Request(url, data=donnees, method="POST",
                                 headers={"content-type": "application/json"})
    if biscuit:
        req.add_header("cookie", biscuit)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}"), r.headers
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}"), e.headers


def connexion():
    _, _, entetes = poster(f"{BASE}/api/connexion",
                           {"courriel": "chaine@essai.cm", "motdepasse": MDP})
    biscuits = entetes.get_all("set-cookie") or []
    return "; ".join(c.split(";")[0] for c in biscuits)


def lire(url, biscuit):
    req = urllib.request.Request(url, headers={"cookie": biscuit})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


if __name__ == "__main__":
    sys.exit(main())
