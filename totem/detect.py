# -*- coding: utf-8 -*-
"""Détection automatique des modems branchés.

Un SIM7600 expose plusieurs ports série (/dev/ttyUSB0..4) : diagnostic, GPS,
AT, PPP, audio. Avec deux modems on obtient donc une dizaine de ports, dans un
ordre qui dépend de l'ordre de branchement — on ne peut rien coder en dur.

Méthode : on interroge chaque port avec « AT », et ceux qui répondent donnent
leur IMEI. L'IMEI identifie le modem physique : les ports partageant le même
IMEI appartiennent au même appareil. On garde le premier port AT de chacun.
"""

import glob
import re
import time

RE_IMEI = re.compile(r"\b(\d{15})\b")
RE_OPERATEUR = re.compile(r'\+COPS:\s*\d+(?:,\d+,"([^"]*)")?')
RE_ICCID = re.compile(r"\b(\d{18,20})\b")


class InfoModem:
    """Ce qu'on sait d'un modem détecté, avant de l'ouvrir pour de bon."""

    def __init__(self, port, imei, operateur, sim_prete):
        self.port = port
        self.imei = imei
        self.operateur = operateur
        self.sim_prete = sim_prete

    @property
    def libelle(self):
        """Nom court et parlant : « MTN », « Orange », sinon le nom réseau."""
        nom = (self.operateur or "").upper()
        if "MTN" in nom:
            return "MTN"
        if "ORANGE" in nom:
            return "Orange"
        return self.operateur or "SIM inconnue"

    def __repr__(self):
        return f"<Modem {self.libelle} sur {self.port}>"


def _dialogue(ser, commande, delai=1.2):
    """Envoie une commande AT et renvoie la réponse brute (chaîne vide si muet)."""
    try:
        ser.reset_input_buffer()
        ser.write((commande + "\r").encode())
    except Exception:
        return ""
    fin = time.time() + delai
    tampon = b""
    while time.time() < fin:
        try:
            tampon += ser.read_all()
        except Exception:
            break
        texte = tampon.decode(errors="replace")
        if "OK" in texte or "ERROR" in texte:
            return texte
        time.sleep(0.05)
    return tampon.decode(errors="replace")


def _sonder(port, baud=115200):
    """Interroge un port. Renvoie (imei, operateur, sim_prete) ou None."""
    import serial

    try:
        ser = serial.Serial(port, baud, timeout=0.5)
    except Exception:
        return None  # port occupé (robot déjà lancé) ou inutilisable
    try:
        # Un port non-AT (diagnostic, GPS…) ne répondra jamais « OK ».
        if "OK" not in _dialogue(ser, "AT", delai=1.0):
            return None
        _dialogue(ser, "ATE0", delai=0.5)
        imei = RE_IMEI.search(_dialogue(ser, "AT+CGSN"))
        if not imei:
            return None  # sans IMEI on ne peut pas regrouper : on ignore
        sim_prete = "READY" in _dialogue(ser, "AT+CPIN?")
        operateur = ""
        if sim_prete:
            m = RE_OPERATEUR.search(_dialogue(ser, "AT+COPS?", delai=2.0))
            if m and m.group(1):
                operateur = m.group(1).strip()
        return imei.group(1), operateur, sim_prete
    finally:
        try:
            ser.close()
        except Exception:
            pass


def _numero_port(port):
    """Pour trier ttyUSB2 avant ttyUSB10 (tri naturel, pas alphabétique)."""
    m = re.search(r"(\d+)$", port)
    return int(m.group(1)) if m else 0


def detecter_modems(motif="/dev/ttyUSB*"):
    """Renvoie la liste des modems trouvés, un seul port AT par appareil."""
    par_imei = {}
    for port in sorted(glob.glob(motif), key=_numero_port):
        sonde = _sonder(port)
        if not sonde:
            continue
        imei, operateur, sim_prete = sonde
        # Plusieurs ports du même modem répondent : on garde le premier
        # (le plus petit numéro), qui est le port AT principal.
        if imei not in par_imei:
            par_imei[imei] = InfoModem(port, imei, operateur, sim_prete)
    return list(par_imei.values())
