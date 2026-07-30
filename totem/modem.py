# -*- coding: utf-8 -*-
"""Pilotage du modem SIM7600 par commandes AT (port série USB).

Le HAT Waveshare SIM7600G-H (B) expose plusieurs ports série via USB ;
le port AT est généralement /dev/ttyUSB2 sur Raspberry Pi OS.
"""

import re
import threading
import time

from .gsm import decode_auto, encode_ucs2

# +CUSD: <m>[,"<texte>",<dcs>]  — m=0 fin, m=1 réponse attendue, m=2 annulé par le réseau
RE_CUSD = re.compile(r'\+CUSD:\s*(\d)(?:\s*,\s*"(.*?)"\s*(?:,\s*(\d+))?)?', re.S)
RE_CSQ = re.compile(r"\+CSQ:\s*(\d+),")
RE_COPS = re.compile(r'\+COPS:\s*\d+(?:,\d+,"([^"]*)")?')
# Identité de la SIM : ICCID (numéro gravé sur la carte, 18 à 22 chiffres),
# IMSI (identité de l'abonné sur le réseau), MSISDN (le numéro de téléphone,
# rarement provisionné sur les SIM prépayées).
RE_ICCID = re.compile(r"\b(\d{18,22})\b")
RE_IMSI = re.compile(r"^\s*(\d{14,15})\s*$", re.M)
RE_CNUM = re.compile(r'\+CNUM:\s*"[^"]*"\s*,\s*"([^"]+)"')
# +CPMS: "ME",12,255,"ME",12,255,"ME",12,255  → occupation de la mémoire SMS
RE_CPMS = re.compile(r'\+CPMS:\s*"[^"]*",\s*(\d+),\s*(\d+)')

# Emplacements de stockage des SMS, du plus grand au plus petit. La mémoire du
# modem (ME) contient des centaines de messages ; la SIM (SM) une vingtaine
# seulement, et un stockage plein fait PERDRE les SMS suivants — sur une SIM
# d'encaissement, cela veut dire des paiements jamais vus.
MEMOIRES_SMS = ("ME", "SM")
# +CMGL: <index>,"REC UNREAD","<expéditeur>",...  puis le texte sur la ligne suivante
RE_CMGL = re.compile(r'\+CMGL:\s*(\d+),"[^"]*","([^"]*)"[^\n]*\n(.*?)(?=\r?\n\+CMGL:|\r?\nOK\r?\n|\Z)', re.S)

USSD_OUVERTE = 1
USSD_FERMEE = 0
USSD_ANNULEE = 2


class ErreurModem(Exception):
    pass


class ModemSerie:
    """Interface du modem réel. Toutes les méthodes sont sérialisées (un seul
    échange AT à la fois) car le port série ne supporte pas la concurrence."""

    def __init__(self, port="/dev/ttyUSB2", baud=115200):
        import serial  # pyserial — importé ici pour que le mode simulation s'en passe

        self.ser = serial.Serial(port, baud, timeout=1)
        self.verrou = threading.Lock()
        self.ucs2 = False
        self.stockage_sms = "SM"
        self._initialiser()

    # ---- bas niveau -------------------------------------------------------
    def _envoyer(self, commande, attente=0.3):
        self.ser.reset_input_buffer()
        self.ser.write((commande + "\r").encode())
        time.sleep(attente)
        fin = time.time() + 5
        tampon = b""
        while time.time() < fin:
            tampon += self.ser.read_all()
            texte = tampon.decode(errors="replace")
            if "OK" in texte or "ERROR" in texte:
                return texte
            time.sleep(0.1)
        return tampon.decode(errors="replace")

    def _initialiser(self):
        with self.verrou:
            for cmd in ("AT", "ATE0", "AT+CMEE=2", "AT+CUSD=1", "AT+CMGF=1",
                        # Stocker les SMS entrants et signaler leur arrivée
                        # plutôt que de les déverser sur le port série.
                        "AT+CNMI=2,1,0,0,0"):
                self._envoyer(cmd)
            # Préférer la mémoire du modem : la SIM déborde en une journée
            # chargée, et un stockage plein fait perdre les SMS suivants.
            self.stockage_sms = "SM"
            for emplacement in MEMOIRES_SMS:
                if "OK" in self._envoyer(f'AT+CPMS="{emplacement}","{emplacement}",'
                                         f'"{emplacement}"'):
                    self.stockage_sms = emplacement
                    break
            # Jeu de caractères : GSM si possible, sinon UCS2 (réponses en hexa)
            if "OK" not in self._envoyer('AT+CSCS="GSM"'):
                self._envoyer('AT+CSCS="UCS2"')
                self.ucs2 = True

    # ---- état -------------------------------------------------------------
    def signal(self):
        """Force du signal 0..31 (99 = inconnu)."""
        with self.verrou:
            m = RE_CSQ.search(self._envoyer("AT+CSQ"))
        return int(m.group(1)) if m else 99

    def operateur(self):
        with self.verrou:
            m = RE_COPS.search(self._envoyer("AT+COPS?"))
        return decode_auto(m.group(1)) if m and m.group(1) else "inconnu"

    def sim_presente(self):
        with self.verrou:
            return "READY" in self._envoyer("AT+CPIN?")

    def iccid(self):
        """Numéro de série gravé sur la carte SIM : identité **stable et
        unique** de la puce, quel que soit l'opérateur. C'est lui qui sert à
        cloisonner les journaux quand plusieurs SIM se succèdent dans le HAT.
        Les SIM7600 répondent selon les firmwares à +CICCID, +CCID ou +ICCID."""
        with self.verrou:
            for commande in ("AT+CICCID", "AT+CCID", "AT+ICCID"):
                m = RE_ICCID.search(self._envoyer(commande))
                if m:
                    return m.group(1)
        return ""

    def imsi(self):
        """Identité de l'abonné sur le réseau. Ses 5 premiers chiffres sont le
        code pays + code opérateur (624 01 = MTN Cameroun, 624 02 = Orange)."""
        with self.verrou:
            m = RE_IMSI.search(self._envoyer("AT+CIMI"))
        return m.group(1) if m else ""

    def numero(self):
        """Numéro de téléphone (MSISDN). Souvent vide : la plupart des SIM
        prépayées ne l'inscrivent pas dans la carte. Ne jamais s'en servir
        comme identifiant — utiliser l'ICCID."""
        with self.verrou:
            m = RE_CNUM.search(self._envoyer("AT+CNUM"))
        return m.group(1) if m else ""

    def redemarrer(self):
        with self.verrou:
            self._envoyer("AT+CFUN=1,1", attente=1)
        time.sleep(25)
        self._initialiser()

    # ---- USSD -------------------------------------------------------------
    def _attendre_cusd(self, delai=30):
        fin = time.time() + delai
        tampon = ""
        while time.time() < fin:
            tampon += self.ser.read_all().decode(errors="replace")
            m = RE_CUSD.search(tampon)
            if m:
                time.sleep(1.2)  # laisser arriver la fin du payload
                tampon += self.ser.read_all().decode(errors="replace")
                m = RE_CUSD.search(tampon)
                etat = int(m.group(1))
                # Le DCS dit dans quel alphabet le réseau a codé sa réponse.
                # L'ignorer, c'est risquer d'afficher un menu en idéogrammes
                # ou en chiffres hexadécimaux.
                dcs = int(m.group(3)) if m.group(3) else None
                texte = decode_auto(m.group(2) or "", dcs)
                return etat, texte.strip()
            time.sleep(0.25)
        raise ErreurModem("Pas de réponse USSD du réseau (délai dépassé).")

    def _cusd(self, charge):
        if self.ucs2:
            charge = encode_ucs2(charge)
        with self.verrou:
            self.ser.reset_input_buffer()
            self.ser.write(f'AT+CUSD=1,"{charge}",15\r'.encode())
            return self._attendre_cusd()

    def ussd_demarrer(self, code):
        """Ouvre une session USSD (ex. *126#). Retourne (etat, texte)."""
        return self._cusd(code)

    def ussd_repondre(self, reponse):
        """Répond dans la session USSD ouverte."""
        return self._cusd(reponse)

    def ussd_annuler(self):
        with self.verrou:
            self._envoyer("AT+CUSD=2")

    # ---- SMS --------------------------------------------------------------
    def lire_sms(self):
        """[(index, expéditeur, texte)] de TOUS les SMS stockés, sans effacer.

        L'effacement est laissé à l'appelant, qui ne doit le faire qu'une fois
        le message journalisé : si le robot meurt entre la lecture et
        l'écriture, le SMS est encore dans le modem au redémarrage. C'est
        volontairement « lire tout » et non « lire les non-lus » — lire un
        message le marque comme lu, et un plantage juste après le ferait
        disparaître à jamais."""
        with self.verrou:
            brut = self._envoyer('AT+CMGL="ALL"', attente=0.6)
        return [(int(m.group(1)), decode_auto(m.group(2)),
                 decode_auto(m.group(3).strip()))
                for m in RE_CMGL.finditer(brut)]

    def effacer_sms(self, index):
        """Efface un SMS du modem, une fois qu'il est en sécurité au journal."""
        with self.verrou:
            return "OK" in self._envoyer(f"AT+CMGD={index}")

    def memoire_sms(self):
        """(occupés, capacité) du stockage des SMS. Une mémoire pleine fait
        perdre les messages suivants : c'est surveillé en continu."""
        with self.verrou:
            m = RE_CPMS.search(self._envoyer("AT+CPMS?"))
        return (int(m.group(1)), int(m.group(2))) if m else (0, 0)
