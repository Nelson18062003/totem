# -*- coding: utf-8 -*-
"""Détection automatique des modems branchés.

Un SIM7600 expose plusieurs ports série (/dev/ttyUSB0..4) : diagnostic, GPS,
AT, PPP, audio. Avec deux modems on obtient donc une dizaine de ports, dans un
ordre qui dépend de l'ordre de branchement — on ne peut rien coder en dur.

Méthode : on interroge chaque port avec « AT », et ceux qui répondent donnent
leur IMEI. L'IMEI identifie le modem physique : les ports partageant le même
IMEI appartiennent au même appareil. On garde le premier port AT de chacun.

Nommer le compte : l'IMSI, et surtout pas le réseau visité
----------------------------------------------------------
Le nom du réseau (« AT+COPS? ») est celui sur lequel le modem est *enregistré
en ce moment*. En itinérance, c'est l'opérateur du pays où l'on se trouve, pas
celui de la carte : une SIM MTN Cameroun essayée en France répond « Orange F ».
S'y fier renommerait le compte à chaque déplacement du boîtier — et couperait
l'historique en deux dans la base le jour de l'arrivée à Douala.

L'IMSI (« AT+CIMI ») est gravé sur la carte et ne bouge jamais. Ses cinq
premiers chiffres sont le pays (MCC) et l'opérateur (MNC) d'origine :
624-01 = MTN Cameroun, où que soit le boîtier. C'est donc lui qui nomme le
compte ; le nom du réseau ne sert plus qu'à signaler l'itinérance.
"""

import glob
import re
import time

RE_IMEI = re.compile(r"\b(\d{15})\b")
RE_IMSI = re.compile(r"\b(\d{14,15})\b")
RE_OPERATEUR = re.compile(r'\+COPS:\s*\d+(?:,\d+,"([^"]*)")?')
RE_CREG = re.compile(r"\+CREG:\s*\d+,(\d+)")

# MCC+MNC → nom court de l'opérateur d'origine de la carte.
# Le Cameroun d'abord (c'est là que vivent les SIM), la France ensuite
# (c'est là que se font les essais avant expédition).
RESEAUX = {
    "62401": "MTN",        # MTN Cameroon
    "62402": "Orange",     # Orange Cameroun
    "62404": "Nexttel",    # Nexttel (Viettel)
    "62407": "Camtel",     # Camtel / Blue
    "20801": "Orange F",   # Orange France
    "20802": "Orange F",
    "20810": "SFR",
    "20813": "SFR",
    "20815": "Free",
    "20820": "Bouygues",
}


def operateur_depuis_imsi(imsi):
    """« 624011234567890 » → « MTN ». None si l'IMSI est absent ou inconnu."""
    if not imsi or len(imsi) < 5:
        return None
    return RESEAUX.get(imsi[:5])


def _depuis_nom_reseau(nom):
    """Repli quand l'IMSI ne dit rien : deviner d'après le nom du réseau."""
    majuscules = (nom or "").upper()
    if "MTN" in majuscules:
        return "MTN"
    if "ORANGE" in majuscules:
        return "Orange"
    return None


class InfoModem:
    """Ce qu'on sait d'un modem détecté, avant de l'ouvrir pour de bon."""

    def __init__(self, port, imei, imsi="", operateur="", sim_prete=False,
                 itinerance=False):
        self.port = port
        self.imei = imei
        self.imsi = imsi
        self.operateur = operateur      # réseau visité, tel qu'annoncé
        self.sim_prete = sim_prete
        self.itinerance = itinerance

    @property
    def libelle(self):
        """Nom court et stable du compte : « MTN », « Orange »…

        Il vient de la carte, donc il ne change pas quand le boîtier voyage.
        Sans IMSI exploitable, on retombe sur le nom du réseau — mieux que
        rien, mais susceptible de bouger en itinérance.
        """
        return (operateur_depuis_imsi(self.imsi)
                or _depuis_nom_reseau(self.operateur)
                or self.operateur
                or "SIM inconnue")

    @property
    def description(self):
        """Une ligne lisible pour le diagnostic, itinérance comprise."""
        if self.itinerance and self.operateur:
            return f"{self.libelle} (itinérance sur {self.operateur})"
        return self.libelle

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
        imsi = operateur = ""
        itinerance = False
        if sim_prete:
            # L'IMSI se lit dès que la carte est prête, sans attendre le réseau.
            trouve = RE_IMSI.search(_dialogue(ser, "AT+CIMI"))
            if trouve:
                imsi = trouve.group(1)
            m = RE_OPERATEUR.search(_dialogue(ser, "AT+COPS?", delai=2.0))
            if m and m.group(1):
                operateur = m.group(1).strip()
            # +CREG: <n>,<stat> — stat 5 = enregistré sur un réseau visité.
            etat = RE_CREG.search(_dialogue(ser, "AT+CREG?"))
            itinerance = bool(etat and etat.group(1) == "5")
        return InfoModem(port, imei.group(1), imsi, operateur, sim_prete,
                         itinerance)
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
