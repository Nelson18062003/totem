# -*- coding: utf-8 -*-
"""Détection automatique des modems branchés.

Un SIM7600 expose plusieurs ports série (/dev/ttyUSB0..4) : diagnostic, GPS,
AT, PPP, audio. Avec deux modems on obtient donc une dizaine de ports, dans un
ordre qui dépend de l'ordre de branchement — on ne peut rien coder en dur.

Méthode : on interroge chaque port avec « AT », et ceux qui répondent donnent
leur IMEI. L'IMEI identifie le modem physique : les ports partageant le même
IMEI appartiennent au même appareil. On garde le premier port AT de chacun.

La détection lit aussi l'identité de la carte insérée (ICCID, IMSI, numéro) :
c'est elle, et non le modem, qui nomme le compte et cloisonne l'historique.
Voir `carte.py` pour le détail de ces trois numéros.
"""

import glob
import re
import time

from .carte import Carte

RE_IMEI = re.compile(r"\b(\d{15})\b")
RE_IMSI = re.compile(r"\b(\d{14,15})\b")
RE_ICCID = re.compile(r"\b(\d{18,22})\b")
RE_OPERATEUR = re.compile(r'\+COPS:\s*\d+(?:,\d+,"([^"]*)")?')
RE_CNUM = re.compile(r'\+CNUM:[^,]*,"([^"]+)"')
RE_CREG = re.compile(r"\+CREG:\s*\d+,(\d+)")

# Les firmwares SIM7600 ne s'accordent pas sur la commande d'ICCID.
COMMANDES_ICCID = ("AT+CICCID", "AT+CCID", "AT+ICCID")


class InfoModem:
    """Ce qu'on sait d'un modem détecté, avant de l'ouvrir pour de bon."""

    def __init__(self, port, imei, carte=None, sim_prete=False):
        self.port = port
        self.imei = imei                    # identité du modem, pas de la SIM
        self.carte = carte or Carte()       # identité de la SIM insérée
        self.sim_prete = sim_prete

    @property
    def libelle(self):
        """Nom du compte : « MTN ·8901 ». Vient de la carte, jamais du réseau."""
        return self.carte.libelle

    @property
    def description(self):
        return self.carte.description

    def __repr__(self):
        return f"<Modem {self.description} sur {self.port}>"


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


def _lire_iccid(ser):
    """Les firmwares SIM7600 répondent selon les cas à +CICCID, +CCID ou
    +ICCID. On essaie les trois : ici, contrairement au fonctionnement en
    régime, la détection n'a lieu qu'une fois au démarrage."""
    for commande in COMMANDES_ICCID:
        m = RE_ICCID.search(_dialogue(ser, commande, delai=2.0))
        if m:
            return m.group(1)
    return ""


def _sonder(port, baud=115200):
    """Interroge un port série. Renvoie un InfoModem, ou None si ce port n'est
    pas un port AT exploitable."""
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
        carte = Carte()
        if sim_prete:
            # ICCID et IMSI se lisent dès que la carte est prête, sans
            # attendre l'enregistrement sur le réseau.
            imsi = RE_IMSI.search(_dialogue(ser, "AT+CIMI", delai=2.0))
            numero = RE_CNUM.search(_dialogue(ser, "AT+CNUM", delai=2.0))
            reseau = RE_OPERATEUR.search(_dialogue(ser, "AT+COPS?", delai=2.0))
            # +CREG: <n>,<stat> — stat 5 = enregistré sur un réseau visité.
            etat = RE_CREG.search(_dialogue(ser, "AT+CREG?"))
            carte = Carte(
                iccid=_lire_iccid(ser),
                imsi=imsi.group(1) if imsi else "",
                numero=numero.group(1) if numero else "",
                reseau=(reseau.group(1).strip()
                        if reseau and reseau.group(1) else ""),
                itinerance=bool(etat and etat.group(1) == "5"),
            )
        return InfoModem(port, imei.group(1), carte, sim_prete)
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
        info = _sonder(port)
        if not info:
            continue
        # Plusieurs ports du même modem répondent : on garde le premier
        # (le plus petit numéro), qui est le port AT principal.
        if info.imei not in par_imei:
            par_imei[info.imei] = info
    return list(par_imei.values())
