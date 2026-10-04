# -*- coding: utf-8 -*-
"""Pilotage du modem SIM7600 par commandes AT (port série USB).

Le HAT Waveshare SIM7600G-H (B) expose plusieurs ports série via USB ;
le port AT est généralement /dev/ttyUSB2 sur Raspberry Pi OS.
"""

import re
import threading
import time

from .gsm import (ALPHABET_GSM, ECHAPPEMENT, EXTENSION_GSM, ChargeRefusee,
                  charge_pour_le_reseau, decode_auto, encode_ucs2)
from .pdu import ErreurPDU, decoder, recoller
from .textes import t

# +CUSD: <m>[,"<texte>",<dcs>]  — m=0 fin, m=1 réponse attendue, m=2 annulé par le réseau
#
# Le texte ne se découpe PAS au premier guillemet : en AT+CSCS="GSM", le
# modem livre le texte tel quel, guillemets intérieurs compris — « Transfert
# vers "ETS KAMDEM" » se lisait « Transfert vers », sans montant ni choix.
# Voir `lire_cusd`.
RE_TETE_CUSD = re.compile(r"\+CUSD:\s*(\d)")
# La vraie fin du texte : un guillemet suivi de « ,<dcs> » et d'une fin de
# ligne. On prend la DERNIÈRE.
RE_FIN_AVEC_DCS = re.compile(r'"[ \t]*,[ \t]*(\d+)[ \t]*(?=[\r\n]|$)')
# Sans DCS (firmwares rares) : un guillemet en fin de ligne — ambigu tant que
# le message peut encore arriver, donc pris seulement après le sursis.
RE_FIN_SANS_DCS = re.compile(r'"[ \t]*(?=[\r\n]|$)')
# Le modem refuse la commande elle-même (réseau occupé, SIM non enregistrée).
RE_ERREUR_AT = re.compile(
    r"(?:^|[\r\n])\s*(ERROR|\+CME ERROR:[^\r\n]*)\s*(?=[\r\n]|$)")
# Le réseau a refermé le menu de lui-même (0 fin, 2 annulé, 3-5 erreurs).
RE_CUSD_FERME = re.compile(rb"\+CUSD:\s*[02-5]")
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
# Mode texte — repli quand le firmware refuse le mode PDU.
# +CMGL: <index>,"REC UNREAD","<expéditeur>",…  puis le texte à la ligne
RE_CMGL = re.compile(r'\+CMGL:\s*(\d+),"[^"]*","([^"]*)"[^\n]*\n(.*?)(?=\r?\n\+CMGL:|\r?\nOK\r?\n|\Z)', re.S)
# Mode PDU — le seul qui livre l'en-tête de découpe des messages longs.
# +CMGL: <index>,<état>,<alpha>,<longueur>  puis le PDU hexadécimal à la ligne
RE_CMGL_PDU = re.compile(
    r"\+CMGL:\s*(\d+)\s*,[^\n]*\n\s*([0-9A-Fa-f]{20,})", re.I)

USSD_OUVERTE = 1
USSD_FERMEE = 0
USSD_ANNULEE = 2


class ErreurModem(Exception):
    pass


class ReponseNonRecue(ErreurModem):
    """La demande est ÉCRITE au modem, et le réseau n'a rien dit à temps.

    Ce n'est pas un échec : la réponse — peut-être un code secret — est
    peut-être arrivée chez l'opérateur, et l'opération peut aboutir. Le dire
    « n'a pas pu faire », c'était faire recommencer un transfert parti."""


class ReponseRefusee(ErreurModem):
    """La réponse contient ce que le réseau ne peut pas recevoir (voir
    `gsm.charge_pour_le_reseau`). Rien n'a été écrit au modem."""

    def __init__(self, caracteres):
        vus = " ".join(f"« {c} »" for c in caracteres)
        super().__init__(t(
            f"This reply contains characters the operator's network cannot "
            f"receive ({vus}) — nothing was sent.",
            f"Cette réponse contient des caractères que le réseau de "
            f"l'opérateur ne reçoit pas ({vus}) — rien n'est parti."))
        self.caracteres = caracteres


class MenuReferme(ErreurModem):
    """Le réseau avait déjà refermé le menu : la réponse n'a PAS été écrite.
    Rien n'est parti — surtout pas un code secret composé comme un code."""


def octets_en_texte(octets, alphabet_gsm=True):
    """Les octets du port série, lus UNE fois le message entier arrivé.

    Chaque morceau était décodé à part : un « é » coupé entre deux lectures
    devenait « �� ». En AT+CSCS="GSM", certains firmwares livrent l'alphabet
    du réseau tel quel : « é » vaut 0x05, « @ » vaut 0x00 — et un 0x00 fait
    refuser l'écriture du résultat par la base, la demande restait en
    suspens. Ces positions (sous 0x20) ne sont jamais du texte ordinaire : on
    les traduit par la table GSM. Le reste est de l'UTF-8, ou à défaut du
    Latin-1 — jamais un « � » quand une lecture existe."""
    try:
        texte = octets.decode("utf-8")
    except UnicodeDecodeError as e:
        if e.end >= len(octets) and e.reason == "unexpected end of data":
            texte = octets[:e.start].decode("utf-8", errors="replace")
        else:
            texte = octets.decode("latin-1")
    if not alphabet_gsm:
        return texte
    sortie, echappe = [], False
    for c in texte:
        code = ord(c)
        if echappe:
            echappe = False
            if code in EXTENSION_GSM:
                sortie.append(EXTENSION_GSM[code])
                continue
        if code == ECHAPPEMENT:
            echappe = True
            continue
        if code < 0x20 and c not in "\r\n":
            sortie.append(ALPHABET_GSM[code])
        else:
            sortie.append(c)
    return "".join(sortie)


def texte_de_l_operateur(texte):
    """Le texte de l'opérateur, INTACT — seules ses fins de ligne sont mises
    d'accord : un retour chariot seul (l'alphabet GSM en a un) recollait le
    menu en une phrase, « Menu1. Send2. Cash out », sans un bouton. Un 0x00
    ne peut pas entrer dans la base : il devient « \ufffd », visible."""
    texte = (texte or "").replace("\r\n", "\n").replace("\r", "\n")
    return texte.replace("\x00", "\ufffd").strip()


def lire_cusd(tampon, sursis_ecoule=False, a_l_echeance=False):
    """La réponse USSD à retenir dans `tampon`, ou None s'il faut attendre.

    Rend (etat, texte_brut, dcs). Trois règles, chacune née d'une panne :

    - Le texte va jusqu'au DERNIER guillemet suivi de « ,<dcs> » : un nom
      entre guillemets ne coupe plus le message.
    - Un « +CUSD: 2 » nu suivi d'une autre réponse est la queue de la
      session d'avant (le raccrochage qu'on vient d'envoyer) : on prend la
      suivante. Seul, il n'est cru qu'après le sursis — la vraie réponse
      arrive souvent juste derrière.
    - Un texte ouvert et pas encore refermé n'est JAMAIS rendu vide : on
      attend ; à l'échéance seulement, on rend ce qui est arrivé — le
      message de l'opérateur, même incomplet, plutôt qu'un écran blanc sur
      une session ouverte."""
    tetes = list(RE_TETE_CUSD.finditer(tampon))
    reponses = []
    for i, tete in enumerate(tetes):
        suivante = tetes[i + 1].start() if i + 1 < len(tetes) else len(tampon)
        segment = tampon[tete.end():suivante]
        etat = int(tete.group(1))
        ouverture = re.match(r'[ \t]*,[ \t]*"', segment)
        if not ouverture:
            nu_complet = (bool(re.match(r"[ \t]*[\r\n]", segment))
                          or i + 1 < len(tetes))
            reponses.append({"etat": etat, "texte": None, "dcs": None,
                             "complet": nu_complet, "partiel": None})
            continue
        corps = segment[ouverture.end():]
        fins = list(RE_FIN_AVEC_DCS.finditer(corps))
        if fins:
            fin = fins[-1]
            reponses.append({"etat": etat, "texte": corps[:fin.start()],
                             "dcs": int(fin.group(1)), "complet": True,
                             "partiel": None})
            continue
        fins = list(RE_FIN_SANS_DCS.finditer(corps))
        texte = corps[:fins[-1].start()] if fins else None
        reponses.append({"etat": etat, "texte": texte, "dcs": None,
                         "complet": bool(fins) and (sursis_ecoule
                                                    or i + 1 < len(tetes)),
                         "partiel": corps})

    def nu_annule(r):
        return r["texte"] is None and r["partiel"] is None and r["etat"] == 2

    # La queue d'une session d'avant ne masque pas la réponse qui la suit.
    while len(reponses) > 1 and nu_annule(reponses[0]):
        reponses.pop(0)
    if not reponses:
        return None
    derniere = reponses[-1]
    if nu_annule(derniere) and not (sursis_ecoule or a_l_echeance):
        return None
    if derniere["complet"]:
        return derniere["etat"], derniere["texte"] or "", derniere["dcs"]
    if a_l_echeance:
        partiel = derniere["partiel"]
        if partiel is None:
            return derniere["etat"], "", None
        return derniere["etat"], partiel.rstrip().rstrip('"'), None
    return None


class ModemSerie:
    """Interface du modem réel. Toutes les méthodes sont sérialisées (un seul
    échange AT à la fois) car le port série ne supporte pas la concurrence."""

    def __init__(self, port="/dev/ttyUSB2", baud=115200):
        import serial  # pyserial — importé ici pour que le mode simulation s'en passe

        self.port = port
        self.baud = baud
        self.ser = serial.Serial(port, baud, timeout=1)
        self.verrou = threading.Lock()
        self.ucs2 = False
        self.stockage_sms = "SM"
        self.mode_pdu = False
        self._memo = {}
        self._commande_iccid = None    # celle que ce firmware accepte
        self._traine_urc = b""         # fin des annonces non sollicitées (+CMTI)
        self._ferme_par_le_reseau = False  # un « +CUSD: 2 » vu entre deux échanges
        # Depuis quand attend-on chaque groupe de morceaux incomplet ?
        # Conservé d'un tour de relève à l'autre pour qu'un morceau au
        # SCTS corrompu ne bloque pas son emplacement modem pour toujours.
        self._morceaux_vus = {}
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
            for cmd in ("AT", "ATE0", "AT+CMEE=2", "AT+CUSD=1",
                        # Stocker les SMS entrants et signaler leur arrivée
                        # plutôt que de les déverser sur le port série.
                        "AT+CNMI=2,1,0,0,0"):
                self._envoyer(cmd)
            # Mode PDU : c'est le SEUL qui livre l'en-tête de découpe des
            # messages longs. En mode texte, un SMS de plus de 160 caractères
            # arrive en morceaux séparés, sans rien pour les rattacher — donc
            # tronqué à l'écran. On retombe en mode texte si le firmware
            # refuse, plutôt que de ne plus lire aucun SMS.
            self.mode_pdu = "OK" in self._envoyer("AT+CMGF=0")
            if not self.mode_pdu:
                self._envoyer("AT+CMGF=1")
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
        """Relance le modem, puis **rouvre le port**.

        Ce second geste n'est pas une précaution, c'est le cœur de l'affaire.
        Un modem qui redémarre disparaît du bus USB et y revient : le fichier
        de communication ouvert au démarrage du robot devient alors définitivement
        mort, et tout ce qu'on lui écrit répond « Input/output error ». Sans
        réouverture, le robot annonçait un redémarrage raté toutes les minutes,
        indéfiniment, alors que le modem était peut-être déjà revenu.

        L'ordre de redémarrage peut très bien échouer — si le modem s'est déjà
        évanoui, il n'y a plus personne pour l'entendre. On n'en fait pas une
        erreur : c'est la réouverture qui décide.
        """
        try:
            with self.verrou:
                self._envoyer("AT+CFUN=1,1", delai=2)
        except Exception:
            pass
        self._oublier()          # tout est à relire après un redémarrage
        self._commande_iccid = None
        self._rouvrir()
        self._initialiser()

    def _rouvrir(self, patience=45):
        """Referme le port et le rouvre, en acceptant qu'il ait changé de nom.

        Au retour sur le bus USB, le noyau ne rend pas forcément le même
        numéro : le modem parti de `/dev/ttyUSB2` peut revenir sur `ttyUSB6`.
        S'entêter sur l'ancien chemin, c'est attendre un port qui n'existera
        plus jamais — on redemande donc lequel est le bon.
        """
        import serial

        try:
            self.ser.close()
        except Exception:
            pass

        fin = time.time() + patience
        derniere = None
        while time.time() < fin:
            time.sleep(2)
            for chemin in self._chemins_possibles():
                try:
                    self.ser = serial.Serial(chemin, self.baud, timeout=1)
                    self.port = chemin
                    return
                except Exception as e:
                    derniere = e
        raise ErreurModem(t(
            f"the modem did not come back on the serial port after "
            f"{patience} s ({derniere}). Check the USB cable and the power "
            f"supply: the HAT draws 3 A, and a charger that falls short "
            f"makes it drop off the bus.",
            f"le modem n'est pas revenu sur le port série après {patience} s "
            f"({derniere}). Vérifiez le câble USB et l'alimentation : le HAT "
            f"réclame 3 A, un chargeur trop juste le fait décrocher du bus."))

    def _chemins_possibles(self):
        """Le port précédent d'abord — c'est le cas courant — puis ceux que la
        détection propose. On ne devine aucun numéro : on regarde."""
        chemins = [self.port]
        try:
            from .detect import detecter_modems
            chemins += [info.port for info in detecter_modems()]
        except Exception:
            pass
        vus = set()
        return [c for c in chemins if c and not (c in vus or vus.add(c))]

    # ---- USSD -------------------------------------------------------------
    def _attendre_cusd(self, delai=30):
        """La réponse du réseau à la commande qu'on vient d'écrire.

        Les octets s'accumulent et ne se lisent qu'ensemble (voir
        `octets_en_texte`) ; la réponse se découpe par `lire_cusd`."""
        mode_texte = not getattr(self, "ucs2", False)
        fin = time.time() + delai
        brut = b""
        premier_signe = None
        pause = 0.02
        while True:
            echeance = time.time() >= fin
            morceau = self.ser.read_all()
            if morceau:
                brut += morceau
                pause = 0.02
            else:
                pause = min(pause * 2, 0.15)
            tampon = octets_en_texte(brut, alphabet_gsm=mode_texte)
            if premier_signe is None and RE_TETE_CUSD.search(tampon):
                premier_signe = time.time()
            if premier_signe is None:
                # Le modem refuse la commande : on le dit TOUT DE SUITE, au
                # lieu de garder la carte trente secondes pour annoncer un
                # « délai dépassé » qui cache la vraie cause.
                erreur = RE_ERREUR_AT.search(tampon)
                if erreur:
                    cause = erreur.group(1).strip()
                    raise ErreurModem(t(
                        f"The modem refused the request ({cause}). "
                        "Nothing was sent.",
                        f"Le modem a refusé la demande ({cause}). "
                        "Rien n'est parti."))
            sursis = (premier_signe is not None
                      and time.time() - premier_signe > GRACE_CUSD)
            lu = lire_cusd(tampon, sursis_ecoule=sursis,
                           a_l_echeance=echeance and premier_signe is not None)
            if lu is not None:
                etat, texte, dcs = lu
                # Le DCS dit dans quel alphabet le réseau a codé sa
                # réponse. L'ignorer, c'est risquer d'afficher un menu en
                # idéogrammes ou en chiffres hexadécimaux.
                texte = decode_auto(texte, dcs, mode_texte=mode_texte)
                return etat, texte_de_l_operateur(texte)
            if echeance:
                break
            time.sleep(pause)
        raise ReponseNonRecue(t("No USSD reply from the network (timed out).",
                                "Pas de réponse USSD du réseau (délai dépassé)."))

    def _cusd(self, charge, reponse=False):
        # Défense en profondeur contre l'injection AT : un guillemet, une
        # barre oblique inverse ou un retour chariot refermeraient la chaîne
        # de la commande AT+CUSD. `charge_pour_le_reseau` les refuse — AVANT
        # d'écrire quoi que ce soit (`ReponseRefusee`).
        try:
            charge = charge_pour_le_reseau(charge)
        except ChargeRefusee as refus:
            raise ReponseRefusee(refus.caracteres) from None
        if self.ucs2:
            charge = encode_ucs2(charge)
        with self.verrou:
            # Ce que le port a dit depuis le dernier échange se lit AVANT
            # d'être jeté : un « +CUSD: 2 » non sollicité, c'est le réseau
            # qui a refermé le menu. Y répondre quand même ouvrait une
            # NOUVELLE session dont le code était… la réponse — un code
            # secret composé comme un code USSD.
            en_attente = getattr(self.ser, "in_waiting", 0) or 0
            reste = self.ser.read(en_attente) if en_attente else b""
            ferme = (getattr(self, "_ferme_par_le_reseau", False)
                     or bool(RE_CUSD_FERME.search(reste or b"")))
            self._ferme_par_le_reseau = False
            if reponse and ferme:
                raise MenuReferme(t(
                    "The operator had already closed this menu — nothing "
                    "was sent.",
                    "L'opérateur avait déjà refermé ce menu — rien n'est "
                    "parti."))
            self.ser.reset_input_buffer()
            self.ser.write(f'AT+CUSD=1,"{charge}",15\r'.encode())
            return self._attendre_cusd()

    def ussd_demarrer(self, code):
        """Ouvre une session USSD (ex. *126#). Retourne (etat, texte)."""
        return self._cusd(code)

    def ussd_repondre(self, reponse):
        """Répond dans la session USSD ouverte."""
        return self._cusd(reponse, reponse=True)

    def ussd_annuler(self):
        with self.verrou:
            self._envoyer("AT+CUSD=2")
            # Le réseau confirme souvent la libération par un « +CUSD: 2 »
            # qui arrive APRÈS le « OK ». Laissé dans le tampon, il était pris
            # pour la réponse de la composition suivante : le premier écran
            # d'un dépôt s'affichait vide et « fini ». On le laisse passer.
            fin = time.time() + 0.5
            vu = b""
            while time.time() < fin:
                vu += self.ser.read_all() or b""
                if re.search(rb"\+CUSD:[^\r\n]*[\r\n]", vu):
                    break
                time.sleep(0.03)
            self._ferme_par_le_reseau = False

    # ---- SMS --------------------------------------------------------------
    def sms_annonce(self):
        """Un SMS vient-il de s'annoncer sur le port (« +CMTI ») ?

        Le modem est réglé par AT+CNMI pour signaler tout SMS entrant par cette
        ligne, plutôt que de le déverser. On la guette pour relever le message
        AUSSITÔT, sans attendre le tour de surveillance suivant.

        Non bloquant. Consomme au passage les lignes non sollicitées en attente
        — elles seraient de toute façon jetées au début de la commande suivante
        (`reset_input_buffer`). Un « +CMTI » qui arriverait coupé en deux
        lectures est rattrapé par la courte traîne conservée."""
        try:
            with self.verrou:
                en_attente = getattr(self.ser, "in_waiting", 0)
                brut = self.ser.read(en_attente) if en_attente else b""
        except Exception:
            return False
        if not brut:
            return False
        self._traine_urc = (self._traine_urc + brut)[-64:]
        if RE_CUSD_FERME.search(self._traine_urc):
            # Le réseau a refermé le menu : la réponse suivante ne doit pas
            # partir (voir `_cusd`).
            self._ferme_par_le_reseau = True
        if b"+CMTI" in self._traine_urc or b"+CMT" in self._traine_urc:
            self._traine_urc = b""
            return True
        return False

    def lire_sms(self):
        """[(indices, expéditeur, texte)] de TOUS les SMS stockés, sans effacer.

        `indices` est une LISTE : un message long occupe plusieurs
        emplacements dans le modem, et il faut tous les effacer ensemble pour
        qu'aucun morceau ne reste orphelin.

        L'effacement est laissé à l'appelant, qui ne doit le faire qu'une fois
        le message journalisé : si le robot meurt entre la lecture et
        l'écriture, le SMS est encore dans le modem au redémarrage. C'est
        volontairement « lire tout » et non « lire les non-lus » — lire un
        message le marque comme lu, et un plantage juste après le ferait
        disparaître à jamais."""
        with self.verrou:
            commande = "AT+CMGL=4" if self.mode_pdu else 'AT+CMGL="ALL"'
            brut = self._envoyer(commande, delai=10)
        if not self.mode_pdu:
            # Le mode texte ne livre pas l'horodatage réseau : emis_le = None,
            # l'appelant retombera sur l'heure de relève du Pi.
            return [([int(m.group(1))], decode_auto(m.group(2), mode_texte=True),
                     decode_auto(m.group(3).strip(), mode_texte=True), None)
                    for m in RE_CMGL.finditer(brut)]

        morceaux, illisibles = [], []
        for m in RE_CMGL_PDU.finditer(brut):
            index = int(m.group(1))
            try:
                morceaux.append((index, decoder(m.group(2))))
            except ErreurPDU:
                illisibles.append(index)   # on connaît sa place : on pourra l'effacer
        # L'heure réseau (TP-SCTS) de chaque emplacement, lue sur le PDU :
        # c'est l'heure vraie de l'opération, celle que le journal retient.
        # ATTENTION : le 4e champ de `recoller` est « complet » (vrai/faux),
        # PAS cette heure — l'avoir confondu a bloqué la relève entière
        # (« 'bool' object has no attribute 'isoformat' » à chaque tour, et
        # aucun SMS ne passait plus). On la reprend donc ici, sur les
        # morceaux eux-mêmes, avant de la propager à l'appelant.
        heures = {index: morceau.horodatage for index, morceau in morceaux}
        messages = []
        # `getattr` défensif : un modem fabriqué sans `__init__` (les tests, ou
        # un chemin de reprise) n'a pas encore sa carte — on la crée à la volée.
        if not hasattr(self, "_morceaux_vus"):
            self._morceaux_vus = {}
        for indices, expediteur, texte, _complet in recoller(
                morceaux, premiere_vue=self._morceaux_vus):
            emis_le = max((h for h in (heures.get(i) for i in indices) if h),
                          default=None)
            messages.append((indices, expediteur, texte, emis_le))
        # Un PDU illisible n'était ni journalisé ni effacé : il occupait un
        # emplacement à CHAQUE tour et finissait par saturer la mémoire du
        # modem — donc par faire perdre les vrais SMS suivants. On le remonte
        # comme un message « non décodable » : l'appelant le journalise (trace
        # qu'un message est arrivé) et l'efface (libère la place).
        for index in illisibles:
            messages.append(
                ([index], "modem",
                 "⚠️ SMS reçu mais non décodable (format PDU illisible).", None))
        return messages

    def effacer_sms(self, indices):
        """Efface un ou plusieurs emplacements, une fois le message journalisé."""
        if isinstance(indices, int):
            indices = [indices]
        with self.verrou:
            return all("OK" in self._envoyer(f"AT+CMGD={i}") for i in indices)

    def memoire_sms(self):
        """(occupés, capacité) du stockage des SMS. Une mémoire pleine fait
        perdre les messages suivants : c'est surveillé en continu."""
        with self.verrou:
            m = RE_CPMS.search(self._envoyer("AT+CPMS?"))
        return (int(m.group(1)), int(m.group(2))) if m else (0, 0)
