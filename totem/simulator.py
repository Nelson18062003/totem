# -*- coding: utf-8 -*-
"""Faux modem : imite une SIM Mobile Money camerounaise (MTN ou Orange).

Permet de tester tout le robot (bot Telegram, sessions USSD, SMS, multi-comptes)
sur un simple PC, sans Raspberry Pi ni SIM. PIN de simulation : 1234.
"""

import random
import re
import time

from .modem import USSD_FERMEE, USSD_OUVERTE

NOMS = ["NGONO Marie", "TCHOUMI Paul", "FOTSO Jean", "ABENA Rose", "KAMGA Eric"]

PROFILS = {
    "MTN": {
        "code": "*126#",
        "reseau": "MTN CM (simulation)",
        "service": "MobileMoney",
        "solde": 872_500,
        "menu": ("MTN MoMo\n1. Transfert d'argent\n2. Retrait d'argent\n"
                 "3. Paiements\n4. Epargne\n5. Mon compte\n6. Quitter"),
    },
    "Orange": {
        "code": "#150#",
        "reseau": "Orange CM (simulation)",
        "service": "Orange Money",
        "solde": 415_000,
        # Volontairement différent de MTN : numérotation avec « ) », en-tête
        # sur deux lignes, et une option qui CONTIENT « code secret » sans
        # rien demander. C'est le piège qui faisait apparaître le pavé au
        # mauvais moment ; il doit rester dans le simulateur.
        "menu": ("Orange Money\nBienvenue. Choisissez :\n1) Transfert d'argent\n"
                 "2) Retrait\n3) Paiement facture\n4) Credit\n5) Mon compte\n"
                 "6) Gerer mon code secret\n7) Quitter"),
        "menu_secret": ("Gerer mon code secret\n1) Changer mon code secret\n"
                        "2) Code secret oublie\n3) Retour"),
    },
}

# ICCID et IMSI de simulation : deux cartes distinctes, pour vérifier que les
# journaux ne se mélangent pas.
IDENTITES = {
    "MTN": ("89237010000000000011", "624010000000011"),
    "Orange": ("89237020000000000022", "624020000000022"),
}

MENU_COMPTE = "Mon compte\n1. Consulter le solde\n2. Dernieres transactions\n3. Retour"


class ModemSimule:
    """Même interface publique que ModemSerie, sans matériel."""

    def __init__(self, operateur="MTN", sms_auto=False):
        profil = PROFILS.get(operateur, PROFILS["MTN"])
        self.operateur_nom = operateur
        self.code_ussd = profil["code"]
        self.reseau = profil["reseau"]
        self.service = profil["service"]
        self.menu_principal = profil["menu"]
        self.menu_secret = profil.get("menu_secret")
        self.solde = profil["solde"]
        self._iccid, self._imsi = IDENTITES.get(operateur, ("", ""))
        self.etape = None          # position dans le menu simulé
        self.memoire = {}          # numéro/montant saisis pendant un transfert
        self.sms_en_attente = []
        self.sms_auto = sms_auto
        self._index_sms = 0
        self._prochain_sms_auto = time.time() + random.randint(20, 45)

    # ---- état -------------------------------------------------------------
    def signal(self):
        return random.randint(22, 28)

    def operateur(self):
        return self.reseau

    def sim_presente(self):
        return True

    def iccid(self):
        return self._iccid

    def imsi(self):
        return self._imsi

    def numero(self):
        return ""  # comme la plupart des SIM prépayées : non provisionné

    def itinerance(self):
        return False

    def changer_de_carte(self, iccid, imsi=None):
        """Simule l'échange physique de la puce dans le berceau.

        Éprouve ce qui, autrement, ne se teste qu'en ouvrant le boîtier : le
        robot doit s'apercevoir du remplacement, l'annoncer, et surtout ne pas
        mélanger les deux historiques.
        """
        self._iccid = iccid
        if imsi is not None:
            self._imsi = imsi
        self.etape = None
        self.sms_en_attente = []

    def memoire_sms(self):
        return len(self.sms_en_attente), 50

    def redemarrer(self):
        time.sleep(1)
        self.etape = None

    # ---- USSD -------------------------------------------------------------
    def ussd_demarrer(self, code):
        if code.strip() != self.code_ussd:
            return USSD_FERMEE, (f"Code {code} inconnu sur ce reseau "
                                 f"(simulation : {self.code_ussd}).")
        self.etape = "menu"
        return USSD_OUVERTE, self.menu_principal

    def ussd_repondre(self, reponse):
        r = reponse.strip()
        if self.etape == "menu":
            if r == "1":
                self.etape = "transfert_numero"
                return USSD_OUVERTE, "Transfert\nEntrez le numero du beneficiaire :"
            if r == "5":
                self.etape = "compte"
                return USSD_OUVERTE, MENU_COMPTE
            if self.menu_secret and r == "6":
                # Ce menu PARLE du code secret sans rien demander : le pavé
                # ne doit pas s'ouvrir.
                self.etape = "code_secret"
                return USSD_OUVERTE, self.menu_secret
            self.etape = None
            return USSD_FERMEE, "Au revoir (simulation : options limitées)."
        if self.etape == "code_secret":
            self.etape = None
            return USSD_FERMEE, "Service momentanement indisponible (simulation)."
        if self.etape == "compte":
            self.etape = None
            if r == "1":
                return USSD_FERMEE, f"Votre solde est de {self._fmt(self.solde)} FCFA."
            return USSD_FERMEE, "Fin de session."
        if self.etape == "transfert_numero":
            self.memoire["numero"] = r
            self.etape = "transfert_montant"
            return USSD_OUVERTE, "Entrez le montant (FCFA) :"
        if self.etape == "transfert_montant":
            self.memoire["montant"] = int(re.sub(r"\D", "", r) or 0)
            self.etape = "transfert_pin"
            return USSD_OUVERTE, "Confirmez avec votre code PIN :"
        if self.etape == "transfert_pin":
            self.etape = None
            if r != "1234":
                return USSD_FERMEE, "PIN incorrect. Transaction annulee."
            montant = self.memoire.get("montant", 0)
            frais = max(100, montant // 100)
            self.solde -= montant + frais
            return USSD_FERMEE, (
                f"Transfert de {self._fmt(montant)} FCFA vers "
                f"{self.memoire.get('numero')} reussi. Frais : {self._fmt(frais)} FCFA. "
                f"Nouveau solde : {self._fmt(self.solde)} FCFA."
            )
        return USSD_FERMEE, "Aucune session en cours."

    def ussd_annuler(self):
        self.etape = None

    # ---- SMS --------------------------------------------------------------
    def injecter_paiement(self, nom=None, montant=None):
        """Simule un client qui paie : génère le SMS correspondant."""
        nom = nom or random.choice(NOMS)
        montant = montant or random.choice([5000, 10000, 15000, 25000, 35000, 50000])
        self.solde += montant
        texte = (
            f"Vous avez recu {self._fmt(montant)} FCFA de {nom} "
            f"(6{random.randint(70, 99)}{random.randint(100000, 999999)}). "
            f"Nouveau solde : {self._fmt(self.solde)} FCFA."
        )
        self._index_sms += 1
        self.sms_en_attente.append((self._index_sms, self.service, texte))
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

    @staticmethod
    def _fmt(n):
        return f"{n:,}".replace(",", " ")
