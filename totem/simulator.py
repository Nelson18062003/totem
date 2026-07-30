# -*- coding: utf-8 -*-
"""Faux modem pour le mode simulation : imite une SIM camerounaise (MTN MoMo
ou Orange Money) avec ses menus USSD et ses SMS de paiement.

Permet de tester tout le robot (bot Telegram, sessions USSD, SMS) sur un
simple PC, sans Raspberry Pi ni SIM. PIN de simulation : 1234.

Les deux menus ne sont pas décoratifs : ils reproduisent les différences qui
cassaient l'affichage (numérotation avec « ) », ligne d'en-tête, entrée
« Gerer mon code secret » qui ne doit PAS déclencher le pavé PIN).
"""

import random
import re
import time

from .modem import USSD_FERMEE, USSD_OUVERTE

NOMS = ["NGONO Marie", "TCHOUMI Paul", "FOTSO Jean", "ABENA Rose", "KAMGA Eric"]

RESEAUX = {
    "MTN": {
        "operateur": "MTN Cameroon (simulation)",
        "code": "*126#",
        "iccid": "89237010000000000011",
        "imsi": "624010000000011",
        "expediteur": "MobileMoney",
        "option_compte": "5",
        "option_secret": None,
        "menus": {
            "menu": ("MTN MoMo\n1. Transfert d'argent\n2. Retrait d'argent\n"
                     "3. Paiements\n4. Epargne\n5. Mon compte\n6. Quitter"),
            "compte": ("Mon compte\n1. Consulter le solde\n"
                       "2. Dernieres transactions\n3. Retour"),
        },
        "sms": "Vous avez recu {montant} FCFA de {nom} ({num}). Nouveau solde : {solde} FCFA.",
    },
    "ORANGE": {
        "operateur": "Orange Cameroun (simulation)",
        "code": "#148#",
        "iccid": "89237020000000000022",
        "imsi": "624020000000022",
        "expediteur": "OrangeMoney",
        "option_compte": "4",
        "option_secret": "5",
        "menus": {
            # Numérotation avec « ) », en-tête sur deux lignes, et surtout une
            # option qui contient « code secret » sans rien demander du tout.
            "menu": ("Orange Money\nBienvenue. Choisissez :\n1) Transfert d'argent\n"
                     "2) Retrait d'argent\n3) Paiement marchand\n4) Mon compte\n"
                     "5) Gerer mon code secret\n6) Quitter"),
            "compte": ("Mon compte\n1) Consulter le solde\n2) Historique\n3) Retour"),
        },
        "sms": "Vous avez recu {montant} FCFA de {nom} ({num}). Nouveau solde : {solde} FCFA.",
    },
}


class ModemSimule:
    """Même interface publique que ModemSerie, sans matériel."""

    def __init__(self, sms_auto=False, reseau="MTN"):
        self.reseau = RESEAUX[reseau.upper()]
        self.solde = 847_500
        self.etape = None          # position dans le menu simulé
        self.memoire = {}          # numéro/montant saisis pendant un transfert
        self.sms_en_attente = []
        self.sms_auto = sms_auto
        self._prochain_sms_auto = time.time() + 20
        self._index_sms = 0

    # ---- état -------------------------------------------------------------
    def signal(self):
        return random.randint(22, 28)

    def operateur(self):
        return self.reseau["operateur"]

    def sim_presente(self):
        return True

    def iccid(self):
        return self.reseau["iccid"]

    def imsi(self):
        return self.reseau["imsi"]

    def numero(self):
        return ""  # comme la plupart des SIM prépayées : non provisionné

    def redemarrer(self):
        time.sleep(1)

    def changer_de_sim(self, reseau):
        """Simule le remplacement physique de la carte SIM dans le HAT."""
        self.reseau = RESEAUX[reseau.upper()]
        self.etape = None

    # ---- USSD -------------------------------------------------------------
    def ussd_demarrer(self, code):
        if code.strip() != self.reseau["code"]:
            return USSD_FERMEE, (
                f"Code {code} inconnu (simulation : seul {self.reseau['code']} "
                f"existe sur cette SIM).")
        self.etape = "menu"
        return USSD_OUVERTE, self.reseau["menus"]["menu"]

    def ussd_repondre(self, reponse):
        r = reponse.strip()
        menus = self.reseau["menus"]
        if self.etape == "menu":
            if r == "1":
                self.etape = "transfert_numero"
                return USSD_OUVERTE, "Transfert d'argent\nEntrez le numero du beneficiaire :"
            if r == self.reseau["option_compte"]:
                self.etape = "compte"
                return USSD_OUVERTE, menus["compte"]
            if r == self.reseau["option_secret"]:
                # Piège volontaire : ce menu parle de « code secret » mais ne
                # demande aucune saisie. Le pavé PIN ne doit pas s'afficher.
                self.etape = "code_secret"
                return USSD_OUVERTE, ("Gerer mon code secret\n1) Changer mon code secret\n"
                                      "2) Code secret oublie\n3) Retour")
            self.etape = None
            return USSD_FERMEE, "Au revoir (simulation : options limitées)."
        if self.etape == "code_secret":
            self.etape = None
            return USSD_FERMEE, "Service momentanement indisponible (simulation)."
        if self.etape == "compte":
            self.etape = None
            if r == "1":
                return USSD_FERMEE, f"Votre solde est de {self.solde:,} FCFA.".replace(",", " ")
            return USSD_FERMEE, "Fin de session."
        if self.etape == "transfert_numero":
            self.memoire["numero"] = r
            self.etape = "transfert_montant"
            return USSD_OUVERTE, "Entrez le montant (FCFA) :"
        if self.etape == "transfert_montant":
            self.memoire["montant"] = int(re.sub(r"\D", "", r) or 0)
            self.etape = "transfert_pin"
            return USSD_OUVERTE, "Confirmez avec votre code secret :"
        if self.etape == "transfert_pin":
            self.etape = None
            if r != "1234":
                return USSD_FERMEE, "Code incorrect. Transaction annulee."
            montant = self.memoire.get("montant", 0)
            frais = max(100, montant // 100)
            self.solde -= montant + frais
            return USSD_FERMEE, (
                f"Transfert de {montant:,} FCFA vers {self.memoire.get('numero')} reussi. "
                f"Frais : {frais:,} FCFA. Nouveau solde : {self.solde:,} FCFA."
            ).replace(",", " ")
        return USSD_FERMEE, "Aucune session en cours."

    def ussd_annuler(self):
        self.etape = None

    # ---- SMS --------------------------------------------------------------
    def injecter_paiement(self, nom=None, montant=None):
        """Simule un client qui paie : génère le SMS correspondant."""
        nom = nom or random.choice(NOMS)
        montant = montant or random.choice([5000, 10000, 15000, 25000, 35000, 50000])
        self.solde += montant
        texte = self.reseau["sms"].format(
            montant=f"{montant:,}".replace(",", " "), nom=nom,
            num=f"6{random.randint(70, 99)}{random.randint(100000, 999999)}",
            solde=f"{self.solde:,}".replace(",", " "))
        self._index_sms += 1
        self.sms_en_attente.append((self._index_sms, self.reseau["expediteur"], texte))
        return texte

    def lire_sms(self):
        """[(index, expéditeur, texte)] — comme le modem réel, sans effacer."""
        if self.sms_auto and time.time() >= self._prochain_sms_auto:
            self.injecter_paiement()
            self._prochain_sms_auto = time.time() + random.randint(30, 90)
        return list(self.sms_en_attente)

    def effacer_sms(self, index):
        avant = len(self.sms_en_attente)
        self.sms_en_attente = [s for s in self.sms_en_attente if s[0] != index]
        return len(self.sms_en_attente) < avant

    def memoire_sms(self):
        return len(self.sms_en_attente), 50
