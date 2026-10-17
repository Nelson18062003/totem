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
  6. un SMS illisible ne bloque pas ceux qui suivent ;
  7. le MÊME SMS, lu une fois, arrive chez les DEUX destinations — Bonzini et
     XAFe Exchange — avec le même montant ; la coupure de courant ne le fait
     pas créditer deux fois chez XAFe ; et une panne de l'une ne retarde pas
     l'autre.

Rien ici ne touche à une vraie base ni à un vrai terminal : un faux modem, un
faux nuage, un faux XAFe (qui vérifie la signature), une plateforme lancée
pour l'occasion.
"""

import json
import os
import re
import signal
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
from totem.carte import Carte
from totem.compte import Compte
from totem.modem import ModemSerie
from totem.nuage import Nuage, _horodatage
from totem.simulator import ModemSimule
from totem.storage import Journal
from totem.xafe import PorteXafe
from tests.test_pdu import fabriquer_pdu
from tests.test_xafe import FauxXafe

PORT = 3166
NUAGE = 4992
XAFE = 4993
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

    @property
    def derniere_releve(self):
        # Les octets vus par la relève : c'est sur eux que le robot retrouve
        # la moitié d'un message déjà livré.
        return list(getattr(self._pdu, "derniere_releve", None) or [])


def main():
    global echecs
    for port in (PORT, NUAGE, XAFE):
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
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        # Son PROPRE groupe de processus. « npx » lance le vrai serveur en
        # dessous : tuer « npx » seul le laissait vivant, port occupé — la
        # chaîne ne tournait qu'une fois, puis refusait de repartir (ou,
        # pire, un autre harnais aurait mesuré CE serveur, et son vieux code).
        start_new_session=True)
    faux_xafe = FauxXafe(port=XAFE)

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
            # 5. UN RETRAIT CHEZ L'AGENT : le client retire, l'argent
            # électronique ARRIVE sur notre puce commerciale. « from » nomme
            # l'agent — c'est-à-dire nous — et se lisait comme le payeur :
            # « −75 000 » sur un argent qui venait d'entrer.
            (5, fabriquer_pdu(
                "CashOut success to 690000002 ESSAI CLIENT from 696100001 "
                "BOUTIQUE ESSAI. The details are as follows: transaction "
                "amount: 75000 FCFA, charges: 0 FCFA, commission: 0 FCFA, "
                "TXN id :CO261004.1538.A00001",
                expediteur="OrangeMoney", quand=maintenant)),
        ]
        modem = modem_pdu(*pdus)
        journal = Journal(":memory:")
        nuage = Nuage(f"http://127.0.0.1:{NUAGE}", "peu-importe",
                      "douala-faux", journal)
        xafe = PorteXafe(faux_xafe.url, "secret-akwa", "akwa-1", journal)
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

        # Le numéro de NOTRE puce : c'est lui qui dit de quel côté du
        # CashOut on se trouve.
        robot = Robot([compte], TransportMuet(), journal, nom="T", pause_sms=1,
                      numeros={compte.libelle.lower(): "696100001"}, xafe=xafe)
        # Le branchement que fait le vrai démarrage (`app.py`, « nuage= ») :
        # c'est par lui que la montée au nuage sait de quel côté on est.
        nuage.fournir_numeros = robot._nos_numeros
        # Pour XAFe, la carte doit être au registre avec son numéro : c'est
        # par lui que XAFe reconnaît le float.
        compte.carte = Carte(iccid="89237010000000000011", imsi="624010000000011")
        journal.voir_carte(compte.carte)
        journal.definir_identite(compte.carte.iccid, numero="677000011")
        robot._relever_sms(compte)

        lignes = journal.derniers_sms(20, ())
        textes = [t for _, _, t, _ in lignes]
        # CINQ PDU, QUATRE MESSAGES : deux d'entre eux sont les deux moitiés
        # d'un seul SMS. Le recolleur doit les rendre comme un.
        verifier("cinq PDU donnent quatre messages", len(lignes) == 4,
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
                 all(h for h in heures), f"{sum(1 for h in heures if h)}/{len(heures)}")
        verifier("l'encaissement d'il y a trois heures garde SON heure",
                 any(h and h.startswith(veille.strftime("%Y-%m-%dT%H")) for h in heures))

        envoyes = nuage.pousser_paiements()
        verifier("le nuage les accepte tous les quatre", envoyes == 4,
                 f"{envoyes} envoyés")

        # --- XAFe : le même SMS, la même lecture, un tiers de plus ---------
        print("\nDu modem à XAFe (le même montant, signé)")
        clos = xafe.pousser_paiements()
        entrees = [l for l in faux_xafe.lignes_recues()]
        # Trois entrées d'argent (ABENA, KAMGA, le CashOut) : le retrait avec
        # accents est une SORTIE, il reste chez le propriétaire.
        verifier("seules les entrées d'argent partent chez XAFe",
                 clos == 3 and len(entrees) == 3,
                 f"{clos} closes, {len(entrees)} lignes reçues")
        abena_xafe = next((l for l in entrees if "ABENA" in l["texte"]), None)
        verifier("le MÊME montant est arrivé chez Bonzini ET chez XAFe",
                 abena_xafe is not None and abena_xafe["montant"] == 27500
                 and abena_xafe["float_numero"] == "677000011"
                 and abena_xafe["operateur"] == "mtn",
                 f"{abena_xafe['montant']} F, float {abena_xafe['float_numero']}"
                 if abena_xafe else "absent")
        # L'heure RÉSEAU du contrat (`emis_le`) : le PDU d'il y a trois heures
        # garde SON heure chez XAFe comme chez Bonzini, et avec son fuseau.
        # Aucun test de la porte ne l'écrivait au journal : `"emis_le": None`
        # survivait à tout.
        heure_journal = journal.conn.execute(
            "SELECT emis_le FROM sms WHERE texte LIKE '%ABENA%'").fetchone()[0]
        verifier("l'encaissement d'il y a trois heures garde SON heure chez XAFe",
                 abena_xafe is not None and heure_journal
                 and abena_xafe["emis_le"] == _horodatage(heure_journal)
                 and re.search(r"[+-]\d\d:\d\d$", abena_xafe["emis_le"] or "") is not None
                 and abena_xafe["emis_le"].startswith(heure_journal[:13]),
                 f"journal {heure_journal!r}, XAFe {abena_xafe.get('emis_le')!r}"
                 if abena_xafe else "absent")
        verifier("la sortie avec accents est restée chez le propriétaire",
                 journal.conn.execute(
                     "SELECT xafe_reponse FROM sms WHERE texte LIKE 'Retrait%'"
                 ).fetchone()[0] == "sans objet")
        verifier("XAFe a crédité trois lignes, une fois chacune",
                 len(faux_xafe.credites) == 3, f"{len(faux_xafe.credites)} crédits")
        credits_avant_coupure = len(faux_xafe.credites)

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

        retrait = next((p for p in donnees["paiements"]
                        if "CashOut" in p["smsBrut"]), None)
        verifier("le retrait chez l'agent est une ENTRÉE à l'écran",
                 retrait is not None and retrait["sens"] == "in"
                 and retrait["montant"] == 75000,
                 f"{retrait['sens']} {retrait['montant']}" if retrait else "absent")
        verifier("celui qui a payé est le client, pas la boutique",
                 retrait is not None and retrait["tiers"] == "ESSAI CLIENT",
                 str(retrait["tiers"]) if retrait else "absent")

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
        xafe.pousser_paiements()
        # Ce que cette étape mesure : la relecture du modem ne ROUVRE pas la
        # file XAFe (rien n'est repassé à `envoye_xafe = 0`, donc aucune
        # requête). Le « deja » de la porte, lui, s'éprouve juste après.
        verifier("la relecture du modem ne rouvre pas la file XAFe",
                 journal.xafe_en_attente() == 0
                 and len(faux_xafe.credites) == credits_avant_coupure,
                 f"{journal.xafe_en_attente()} en attente, "
                 f"{len(faux_xafe.credites)} crédits")
        # Rouvrir la période À LA MAIN, comme le ferait quelqu'un qui sait
        # (`remettre_sms_xafe`) : les trois encaissements repassent par la
        # vraie porte, qui rend la MÊME réponse (« deja ») — rien n'est
        # crédité deux fois, et chaque ligne retrouve sa propre référence.
        # Toujours BORNÉE (`depuis_id`) : sans argument, le geste rouvrirait
        # aussi l'historique « avant XAFe » — des mois d'encaissements
        # déversés chez un tiers d'un coup. Le harnais sert de modèle.
        preuves_avant = dict(journal.conn.execute(
            "SELECT id, xafe_reponse FROM sms WHERE xafe_reponse LIKE 'credite %'"))
        rouvertes = journal.remettre_sms_xafe(depuis_id=1)
        requetes_avant = len(faux_xafe.requetes)
        reclos = xafe.pousser_paiements()
        preuves_apres = dict(journal.conn.execute(
            "SELECT id, xafe_reponse FROM sms WHERE xafe_reponse LIKE 'credite %'"))
        verifier("une période rouverte repasse par la porte sans recréditer",
                 rouvertes == 4 and reclos == 3
                 and len(faux_xafe.requetes) == requetes_avant + 1
                 and len(faux_xafe.credites) == credits_avant_coupure
                 and preuves_apres == preuves_avant,
                 f"{rouvertes} rouvertes, {reclos} reclos, "
                 f"{len(faux_xafe.credites)} crédits, "
                 f"preuves {'identiques' if preuves_apres == preuves_avant else 'changées'}")
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

        # --- UN SMS LONG LIVRÉ EN RETARD ----------------------------------
        #
        # Le cas de la vraie base : l'opérateur livre un SMS long trois heures
        # après l'avoir écrit. Le modem sonne pour le premier morceau, le
        # robot relève aussitôt ; la suite arrive au tour d'après. L'attente
        # se comptait sur l'heure de l'opérateur — déjà « trop vieille » : le
        # message partait coupé, en deux SMS « incomplets ».
        print("\nUn SMS long livré en retard arrive entier")
        ecrit = maintenant - timedelta(hours=3)
        debut = ("CashOut success to 690000010 ESSAI RETARD from 696100001 "
                 "BOUTIQUE ESSAI. The details are as follows: transaction "
                 "amount: 187500 FCFA, charges: 0 FCFA, commissio")
        fin = "n: 0 FCFA, TXN id :CO261016.0253.A12345"
        en_memoire = [(21, fabriquer_pdu(debut, expediteur="OrangeMoney",
                                         reference=91, total=2, position=1,
                                         quand=ecrit))]
        modem4 = ModemSerie.__new__(ModemSerie)
        modem4.verrou = threading.Lock()
        modem4.mode_pdu = True
        modem4._morceaux_vus = {}
        modem4._envoyer = lambda commande, delai=10: "".join(
            f"+CMGL: {i},1,,{len(p) // 2}\r\n{p}\r\n" for i, p in en_memoire) + "\r\nOK\r\n"
        modem4.effacer_sms = lambda indices: [en_memoire.remove(x) for x in list(en_memoire)
                                              if x[0] in indices] or True
        compte4 = CompteEssai(modem4)
        journal4 = Journal(":memory:")
        robot4 = Robot([compte4], TransportMuet(), journal4, nom="T", pause_sms=1)
        robot4._relever_sms(compte4)                  # le morceau 1, seul
        en_memoire.append((22, fabriquer_pdu(fin, expediteur="OrangeMoney",
                                             reference=91, total=2, position=2,
                                             quand=ecrit)))
        robot4._relever_sms(compte4)                  # la suite, au tour d'après
        textes4 = [t for _, _, t, _ in journal4.derniers_sms(10, ())]
        verifier("un seul SMS au journal, pas deux moitiés", len(textes4) == 1,
                 f"{len(textes4)} SMS")
        verifier("il est entier, référence comprise",
                 len(textes4) == 1 and "A12345" in textes4[0]
                 and "incomplet" not in textes4[0],
                 textes4[0][-40:].replace("\n", " ") if textes4 else "rien")

        # --- UNE OPÉRATION ANNONCÉE DEUX FOIS -----------------------------
        #
        # MTN annonce souvent une opération par deux SMS, au même numéro de
        # transaction. Dans la vraie base, les seconds avis anglais étaient
        # comptés en plus : 60 117 932 F d'entrées comptées deux fois. Et le
        # dépôt MTN en français n'était pas lu du tout.
        print("\nUne opération annoncée deux fois ne compte qu'une fois")
        principal = ("You have received 5000000 XAF from ESSAI NANA PAUL "
                     "(237690000007) on your mobile money account at 2026-10-03 "
                     "12:10:54. Message from sender: . Your new balance:10200500 "
                     "XAF. Financial Transaction Id: 19100000000.")
        avis = ("You have received 5,000,000 FCFA from - ESSAI NANA PAUL "
                "(237690000007) on 2026-10-02 08:27:33. Transaction Id: "
                "19100000000. New account balance: - FCFA.")
        depot_fr = ("Dépot de 42500 XAF effectué le 2026-10-12 11:16:29 au ESSAI "
                    "DEPOT FRANCAIS (237690000003), a été effectué avec succès. "
                    "Transaction ID:19234400000. Message:. Votre nouveau solde est "
                    "de 352418 XAF. Commission ajoutée : 66 XAF.")
        modem5 = modem_pdu(
            (31, fabriquer_pdu(principal[:153], expediteur="MobileMoney",
                               reference=92, total=2, position=1, quand=maintenant)),
            (32, fabriquer_pdu(principal[153:], expediteur="MobileMoney",
                               reference=92, total=2, position=2, quand=maintenant)),
            (33, fabriquer_pdu(avis, expediteur="MobileMoney", quand=maintenant)),
            (34, fabriquer_pdu(depot_fr[:153], expediteur="MobileMoney",
                               reference=93, total=2, position=1, quand=maintenant)),
            (35, fabriquer_pdu(depot_fr[153:], expediteur="MobileMoney",
                               reference=93, total=2, position=2, quand=maintenant)))
        compte5 = CompteEssai(modem5)
        robot5 = Robot([compte5], TransportMuet(), journal, nom="T", pause_sms=1)
        robot5._relever_sms(compte5)
        nuage.pousser_paiements()
        donnees5 = lire(f"{BASE}/api/donnees?sms=200", biscuit)
        piu = [p for p in donnees5["paiements"] if "ESSAI NANA PAUL" in p["smsBrut"]]
        verifier("les deux SMS de l'opération sont à l'écran", len(piu) == 2,
                 f"{len(piu)} SMS")
        verifier("le second est un avis en double, sans montant",
                 any(p["categorie"] == "doublon" and p["montant"] is None for p in piu),
                 str([(p["categorie"], p["montant"]) for p in piu]))
        verifier("l'opération compte 5 000 000, pas 10 000 000",
                 sum(p["montant"] or 0 for p in piu) == 5000000,
                 f"{sum(p['montant'] or 0 for p in piu)} FCFA")
        depot = next((p for p in donnees5["paiements"]
                      if "ESSAI DEPOT FRANCAIS" in p["smsBrut"]), None)
        verifier("le dépôt MTN en français est lu : une SORTIE de 42 500",
                 depot is not None and depot["montant"] == 42500
                 and depot["sens"] == "out" and depot["categorie"] == "depot",
                 f"{depot['categorie']} {depot['sens']} {depot['montant']}" if depot else "absent")

        # --- LA SUITE ARRIVE APRÈS COUP ----------------------------------
        #
        # Le 17 octobre, 08 h 10 : un transfert Orange s'affichait avec sa
        # seule fin, « morceau 1 sur 2 jamais reçu ». Un téléphone attend la
        # suite sept jours ; le robot abandonnait au bout d'un quart d'heure,
        # et un morceau arrivé ensuite devenait un second message coupé. La
        # moitié se montre maintenant tout de suite, dite incomplète, et la
        # suite la COMPLÈTE — au journal, puis à l'écran, sur la même ligne.
        print("\nLa suite d'un message, arrivée trois heures après, le complète")
        transfert = ("Successful transfer from 690000031 ETS ESSAI SUITE TARDIVE "
                     "DU LITTORAL to 696100001 BOUTIQUE ESSAI. Details: "
                     "Transaction ID: PP261017.0810.A00043, Transaction amount: "
                     "150000 FCFA, Charges: 0 FCFA, Commission: 0 FCFA, Net amount "
                     ":150000 FCFA, New balance: 3154870.6 FCFA.")
        ecrit6 = maintenant - timedelta(hours=3, minutes=5)
        attente = maintenant - timedelta(minutes=3)       # la patience est passée
        memoire6 = [(41, fabriquer_pdu(transfert[153:], expediteur="OrangeMoney",
                                       reference=94, total=2, position=2,
                                       quand=ecrit6))]
        modem6 = ModemSerie.__new__(ModemSerie)
        modem6.verrou = threading.Lock()
        modem6.mode_pdu = True
        modem6._morceaux_vus = {("OrangeMoney", 94, 2): attente}
        modem6._envoyer = lambda commande, delai=10: "".join(
            f"+CMGL: {i},1,,{len(p) // 2}\r\n{p}\r\n" for i, p in memoire6) + "\r\nOK\r\n"
        modem6.effacer_sms = lambda indices: [memoire6.remove(x) for x in list(memoire6)
                                              if x[0] in indices] or True
        compte6 = CompteEssai(modem6, libelle="Orange ·0042")
        robot6 = Robot([compte6], TransportMuet(), journal, nom="T", pause_sms=1)
        robot6._relever_sms(compte6)                 # la fin, seule
        nuage.pousser_paiements()
        avant = [p for p in lire(f"{BASE}/api/donnees?sms=200", biscuit)["paiements"]
                 if "A00043" in p["smsBrut"] or "3154870.6" in p["smsBrut"]]
        verifier("la moitié reçue se montre tout de suite, dite incomplète",
                 len(avant) == 1 and "pas encore arrivé" in avant[0]["smsBrut"],
                 f"{len(avant)} ligne(s)")
        memoire6.append((42, fabriquer_pdu(transfert[:153], expediteur="OrangeMoney",
                                           reference=94, total=2, position=1,
                                           quand=ecrit6)))
        modem6._morceaux_vus[("OrangeMoney", 94, 2)] = attente
        robot6._relever_sms(compte6)                 # le début, trois heures après
        nuage.pousser_paiements()
        apres = [p for p in lire(f"{BASE}/api/donnees?sms=200", biscuit)["paiements"]
                 if "A00043" in p["smsBrut"] or "3154870.6" in p["smsBrut"]]
        verifier("une seule ligne à l'écran, pas deux moitiés", len(apres) == 1,
                 f"{len(apres)} ligne(s)")
        verifier("elle est entière : le nom de qui a payé est revenu",
                 len(apres) == 1 and apres[0]["smsBrut"] == transfert,
                 apres[0]["smsBrut"][-60:].replace("\n", " ") if apres else "rien")
        verifier("et l'argent se lit : 150 000",
                 len(apres) == 1 and apres[0]["montant"] == 150000,
                 str(apres[0]["montant"]) if apres else "rien")

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

        # --- XAFe EN PANNE NE RETIENT PAS BONZINI --------------------------
        print("\nUne panne de XAFe ne retarde pas Bonzini")
        faux_xafe.en_panne = True
        modem4 = modem_pdu((11, fabriquer_pdu(
            "Vous avez recu 8000 FCFA de MBALLA Paul (677112233). Ref: PP9.",
            expediteur="MTNMobileMoney", quand=maintenant)))
        compte4 = CompteEssai(modem4)
        compte4.carte = compte.carte
        robot4 = Robot([compte4], TransportMuet(), journal, nom="T", pause_sms=1,
                       numeros={compte.libelle.lower(): "696100001"}, xafe=xafe)
        robot4._relever_sms(compte4)
        # Ce que cette étape garde : le drapeau de l'un ne touche pas celui
        # de l'autre (`envoye` = 1, `envoye_xafe` = 0), et la montée Bonzini
        # ne passe par rien de XAFe — on chronomètre le SEUL nuage. Elle ne
        # mesure PAS qu'un XAFe qui pend ne retarde pas le fil Bonzini : cela
        # tient par la structure (deux fils, deux files), gardée par B6 dans
        # tests/test_xafe.py. Un premier jet chronométrait les deux appels
        # ensemble : la durée mesurée incluait XAFe, et l'étape ne pouvait ni
        # échouer sur ce qu'elle nommait, ni passer si XAFe avait pendu.
        debut = time.monotonic()
        envoyes = nuage.pousser_paiements()
        duree = time.monotonic() - debut
        xafe.pousser_paiements()
        # On regarde LA ligne neuve, pas le nombre de lignes parties : le
        # premier passage de ce harnais comptait « 5 ligne(s) » ici — robot2
        # (la coupure de courant) est construit sans `numeros`, robot4 avec,
        # et l'empreinte du lecteur porte les numéros déclarés : Bonzini
        # relit alors tout l'historique (`_relire_sms_si_lecteur_change`,
        # voulu). Ce n'est pas ce que cette étape mesure.
        mballa = journal.conn.execute(
            "SELECT COALESCE(envoye, 0), COALESCE(envoye_xafe, 0) FROM sms "
            "WHERE texte LIKE '%MBALLA%'").fetchone()
        verifier("la ligne monte chez Bonzini (seul chronométré) en moins de 3 s, XAFe en panne",
                 envoyes >= 1 and mballa == (1, 0) and duree < 3,
                 f"{envoyes} ligne(s) parties, Bonzini/XAFe = {mballa}, {duree:.2f} s")
        # LA ligne, ici aussi, pas la longueur de la file : les étapes
        # d'avant y laissent des encaissements de cartes d'essai sans numéro
        # déclaré, qui attendent leur numéro — à bon droit, et sans rapport
        # avec la panne que cette étape mesure.
        def mballa_chez_xafe():
            return journal.conn.execute(
                "SELECT COALESCE(envoye_xafe, 0) FROM sms "
                "WHERE texte LIKE '%MBALLA%'").fetchone()[0]
        verifier("XAFe garde la ligne en attente", mballa_chez_xafe() == 0,
                 f"envoye_xafe = {mballa_chez_xafe()}")
        faux_xafe.en_panne = False
        xafe.pousser_paiements()
        verifier("XAFe revenu, la ligne part", mballa_chez_xafe() == 1,
                 f"envoye_xafe = {mballa_chez_xafe()}")
    finally:
        faux_xafe.fermer()
        try:
            os.killpg(plateforme.pid, signal.SIGTERM)    # le groupe entier
        except ProcessLookupError:
            pass
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
