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
# +CREG: <n>,<stat> — stat 5 = enregistré sur un réseau visité (itinérance).
RE_CREG = re.compile(r"\+CREG:\s*\d+,(\d+)")
# +CPMS: "ME",12,255,"ME",12,255,"ME",12,255  → occupation de la mémoire SMS
RE_CPMS = re.compile(r'\+CPMS:\s*"[^"]*",\s*(\d+),\s*(\d+)')

# Emplacements de stockage des SMS, du plus grand au plus petit. La mémoire du
# modem (ME) contient des centaines de messages ; la SIM (SM) une vingtaine
# seulement, et un stockage plein fait PERDRE les SMS suivants — sur une SIM
# d'encaissement, cela veut dire des paiements jamais vus.
MEMOIRES_SMS = ("ME", "SM")
# Fin d'une réponse AT : une ligne entière, pas les lettres « OK » croisées
# au hasard dans le texte d'un SMS.
RE_FIN_AT = re.compile(r"(?:^|[\r\n])\s*(?:OK|ERROR|\+CM[ES] ERROR:[^\r\n]*)\s*(?:[\r\n]|$)")
# Commandes de lecture de l'ICCID : elles varient selon les firmwares.
COMMANDES_ICCID = ("AT+CICCID", "AT+CCID", "AT+ICCID")

# Durées de mémorisation (secondes). L'ICCID expire avant la vérification de
# SIM (toutes les 60 s) pour qu'un changement de carte soit bien détecté.
TTL_SIGNAL = 8
TTL_OPERATEUR = 45
TTL_ICCID = 45
TTL_IMSI = 300
TTL_SIM_PRESENTE = 8
# Au-delà, on se contente de ce que le réseau a envoyé jusque-là.
GRACE_CUSD = 1.2
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
        self._memo = {}
        self._commande_iccid = None    # celle que ce firmware accepte
        self._initialiser()

    # ---- bas niveau -------------------------------------------------------
    def _envoyer(self, commande, delai=5):
        """Envoie une commande AT et rend la réponse dès qu'elle est complète.

        La lecture démarre immédiatement et s'accélère tant que le modem
        parle : une pause fixe avant de lire, c'est de l'attente pure ajoutée
        à *chaque* commande, et il y en a plusieurs par écran affiché.

        La fin est repérée sur une ligne `OK` / `ERROR` entière et non sur la
        présence des lettres « OK » quelque part — un SMS contenant le mot
        interrompait la lecture au milieu."""
        self.ser.reset_input_buffer()
        self.ser.write((commande + "\r").encode())
        fin = time.time() + delai
        tampon = b""
        pause = 0.01
        while time.time() < fin:
            morceau = self.ser.read_all()
            if morceau:
                tampon += morceau
                texte = tampon.decode(errors="replace")
                if RE_FIN_AT.search(texte):
                    return texte
                pause = 0.01          # il parle : on reste collé au port
            else:
                pause = min(pause * 2, 0.08)   # silence : on lève le pied
            time.sleep(pause)
        return tampon.decode(errors="replace")

    def _cache(self, cle, ttl, producteur):
        """Mémorise brièvement une lecture du modem.

        Afficher un écran demandait jusqu'à cinq allers-retours AT (signal,
        opérateur, SIM, ICCID…), chacun sérialisé derrière le même verrou que
        la session USSD. Ces valeurs ne changent pas d'une seconde à l'autre."""
        valeur, expiration = self._memo.get(cle, (None, 0.0))
        if time.monotonic() < expiration:
            return valeur
        valeur = producteur()
        self._memo[cle] = (valeur, time.monotonic() + ttl)
        return valeur

    def _oublier(self):
        self._memo.clear()

    def oublier_cache(self):
        """Jette les lectures mémorisées.

        Indispensable après un changement de carte : l'IMSI est gardé cinq
        minutes, et servir celui de la puce précédente ferait porter à la
        nouvelle le nom de l'ancienne — donc le mauvais opérateur, dans le
        journal comme dans le cloud."""
        self._oublier()

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
        return self._cache("signal", TTL_SIGNAL, self._lire_signal)

    def _lire_signal(self):
        with self.verrou:
            m = RE_CSQ.search(self._envoyer("AT+CSQ", delai=2))
        return int(m.group(1)) if m else 99

    def operateur(self):
        return self._cache("operateur", TTL_OPERATEUR, self._lire_operateur)

    def _lire_operateur(self):
        with self.verrou:
            m = RE_COPS.search(self._envoyer("AT+COPS?", delai=3))
        return decode_auto(m.group(1)) if m and m.group(1) else "inconnu"

    def sim_presente(self):
        return self._cache("sim_presente", TTL_SIM_PRESENTE, self._lire_sim_presente)

    def _lire_sim_presente(self):
        with self.verrou:
            return "READY" in self._envoyer("AT+CPIN?", delai=2)

    def iccid(self):
        """Numéro de série gravé sur la carte SIM : identité **stable et
        unique** de la puce, quel que soit l'opérateur. C'est lui qui sert à
        cloisonner les journaux quand plusieurs SIM se succèdent dans le HAT."""
        return self._cache("iccid", TTL_ICCID, self._lire_iccid)

    def _lire_iccid(self):
        """Les SIM7600 répondent selon les firmwares à +CICCID, +CCID ou
        +ICCID. On retient celle qui marche : essayer les trois à chaque fois
        gelait le modem plusieurs secondes, toutes les minutes."""
        candidates = ([self._commande_iccid] if self._commande_iccid
                      else list(COMMANDES_ICCID))
        with self.verrou:
            for commande in candidates:
                m = RE_ICCID.search(self._envoyer(commande, delai=2))
                if m:
                    self._commande_iccid = commande
                    return m.group(1)
        self._commande_iccid = None    # ce firmware a peut-être changé d'avis
        return ""

    def imsi(self):
        return self._cache("imsi", TTL_IMSI, self._lire_imsi)

    def _lire_imsi(self):
        """Identité de l'abonné sur le réseau. Ses 5 premiers chiffres sont le
        code pays + code opérateur (624 01 = MTN Cameroun, 624 02 = Orange)."""
        with self.verrou:
            m = RE_IMSI.search(self._envoyer("AT+CIMI", delai=2))
        return m.group(1) if m else ""

    def numero(self):
        """Numéro de téléphone (MSISDN). Souvent vide : la plupart des SIM
        prépayées ne l'inscrivent pas dans la carte. Ne jamais s'en servir
        comme identifiant — utiliser l'ICCID."""
        with self.verrou:
            m = RE_CNUM.search(self._envoyer("AT+CNUM"))
        return m.group(1) if m else ""

    def itinerance(self):
        """La carte est-elle enregistrée sur un réseau qui n'est pas le sien ?

        +CREG: <n>,<stat> — stat 5 signifie « enregistré, en itinérance ».
        C'est le cas d'une SIM camerounaise essayée depuis la France : le nom
        du réseau devient celui de l'opérateur visité, et il ne faut surtout
        pas en déduire l'opérateur de la carte (voir carte.py)."""
        with self.verrou:
            m = RE_CREG.search(self._envoyer("AT+CREG?", delai=2))
        return bool(m and m.group(1) == "5")

    def redemarrer(self):
        with self.verrou:
            self._envoyer("AT+CFUN=1,1", delai=2)
        self._oublier()          # tout est à relire après un redémarrage
        self._commande_iccid = None
        time.sleep(25)
        self._initialiser()

    # ---- USSD -------------------------------------------------------------
    @staticmethod
    def _cusd_complet(tampon, m):
        """La réponse USSD est-elle arrivée en entier ?

        L'ancienne version attendait 1,2 s après avoir vu le début de la
        réponse, systématiquement — soit plus d'une seconde perdue à chaque
        écran de menu. On regarde plutôt si la ligne est terminée : elle l'est
        presque toujours dès la première lecture."""
        if m.group(2) is None:
            # « +CUSD: <m> » sans texte : complet une fois la ligne finie.
            return bool(re.search(r"\+CUSD:\s*\d\s*[\r\n]", tampon))
        return bool(re.search(r"[\r\n]", tampon[m.end():]))

    def _attendre_cusd(self, delai=30):
        fin = time.time() + delai
        tampon = ""
        premier_signe = None
        pause = 0.02
        while time.time() < fin:
            morceau = self.ser.read_all().decode(errors="replace")
            if morceau:
                tampon += morceau
                pause = 0.02
            else:
                pause = min(pause * 2, 0.15)
            m = RE_CUSD.search(tampon)
            if m:
                if premier_signe is None:
                    premier_signe = time.time()
                # Complet → on rend la main tout de suite. Sinon on laisse
                # un court sursis à la fin du message pour arriver.
                if (self._cusd_complet(tampon, m)
                        or time.time() - premier_signe > GRACE_CUSD):
                    # Le DCS dit dans quel alphabet le réseau a codé sa
                    # réponse. L'ignorer, c'est risquer d'afficher un menu en
                    # idéogrammes ou en chiffres hexadécimaux.
                    dcs = int(m.group(3)) if m.group(3) else None
                    texte = decode_auto(m.group(2) or "", dcs)
                    return int(m.group(1)), texte.strip()
            time.sleep(pause)
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
            brut = self._envoyer('AT+CMGL="ALL"', delai=8)
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
