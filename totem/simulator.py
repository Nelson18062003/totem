# -*- coding: utf-8 -*-
"""Faux modem pour le mode simulation : imite une SIM MTN Cameroun avec MoMo.

Permet de tester tout le robot (bot Telegram, sessions USSD, SMS) sur un
simple PC, sans Raspberry Pi ni SIM. PIN MoMo de simulation : 1234.
"""

import random
import re
import time

from .modem import USSD_FERMEE, USSD_OUVERTE

MENU_PRINCIPAL = (
    "MTN MoMo\n1. Transfert d'argent\n2. Retrait d'argent\n3. Paiements\n"
    "4. Epargne\n5. Mon compte\n6. Quitter"
)
MENU_COMPTE = "Mon compte\n1. Consulter le solde\n2. Dernieres transactions\n3. Retour"

NOMS = ["NGONO Marie", "TCHOUMI Paul", "FOTSO Jean", "ABENA Rose", "KAMGA Eric"]


class ModemSimule:
    """Même interface publique que ModemSerie, sans matériel."""

    def __init__(self, sms_auto=False):
        self.solde = 847_500
        self.etape = None          # position dans le menu simulé
        self.memoire = {}          # numéro/montant saisis pendant un transfert
        self.sms_en_attente = []
        self.sms_auto = sms_auto
        self._prochain_sms_auto = time.time() + 20

    # ---- état -------------------------------------------------------------
    def signal(self):
        return random.randint(22, 28)

    def operateur(self):
        return "MTN Cameroon (simulation)"

    def sim_presente(self):
        return True

    def redemarrer(self):
        time.sleep(1)

    # ---- USSD -------------------------------------------------------------
    def ussd_demarrer(self, code):
        if code.strip() != "*126#":
            return USSD_FERMEE, f"Code {code} inconnu (simulation : seul *126# existe)."
        self.etape = "menu"
        return USSD_OUVERTE, MENU_PRINCIPAL

    def ussd_repondre(self, reponse):
        r = reponse.strip()
        if self.etape == "menu":
            if r == "1":
                self.etape = "transfert_numero"
                return USSD_OUVERTE, "Transfert d'argent\nEntrez le numero du beneficiaire :"
            if r == "5":
                self.etape = "compte"
                return USSD_OUVERTE, MENU_COMPTE
            self.etape = None
            return USSD_FERMEE, "Au revoir (simulation : options 1 et 5 seulement)."
        if self.etape == "compte":
            self.etape = None
            if r == "1":
                return USSD_FERMEE, f"Votre solde MoMo est de {self.solde:,} FCFA.".replace(",", " ")
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
                f"Transfert de {montant:,} FCFA vers {self.memoire.get('numero')} reussi. "
                f"Frais : {frais:,} FCFA. Nouveau solde : {self.solde:,} FCFA."
            ).replace(",", " ")
        return USSD_FERMEE, "Aucune session en cours."

    def ussd_annuler(self):
        self.etape = None

    # ---- SMS --------------------------------------------------------------
    def injecter_paiement(self, nom=None, montant=None):
        """Simule un client qui paie : génère le SMS MoMo correspondant."""
        nom = nom or random.choice(NOMS)
        montant = montant or random.choice([5000, 10000, 15000, 25000, 35000, 50000])
        self.solde += montant
        texte = (
            f"Vous avez recu {montant:,} FCFA de {nom} "
            f"(6{random.randint(70,99)}{random.randint(100000,999999)}). "
            f"Nouveau solde : {self.solde:,} FCFA."
        ).replace(",", " ")
        self.sms_en_attente.append(("MobileMoney", texte))
        return texte

    def lire_nouveaux_sms(self):
        if self.sms_auto and time.time() >= self._prochain_sms_auto:
            self.injecter_paiement()
            self._prochain_sms_auto = time.time() + random.randint(30, 90)
        sms, self.sms_en_attente = self.sms_en_attente, []
        return sms
