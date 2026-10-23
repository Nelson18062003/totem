# -*- coding: utf-8 -*-
"""Pilotage du modem SIM7600 par commandes AT (port série USB).

Le HAT Waveshare SIM7600G-H (B) expose plusieurs ports série via USB ;
le port AT est généralement /dev/ttyUSB2 sur Raspberry Pi OS.
"""

import glob
import re
import threading
import time

from .gsm import (ALPHABET_GSM, ECHAPPEMENT, EXTENSION_GSM, ChargeRefusee,
                  charge_pour_le_reseau, decode_auto, encode_ucs2,
                  texte_pour_sms)
from .pdu import (ChargeTropLongue, ErreurPDU, decoder, encoder_submit,
                  numero_international, recoller)
from .service import SANS_SERVICE, etat_du_service
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
# L'accusé du modem après l'envoi d'un SMS : la référence qu'il lui a donnée.
RE_CMGS = re.compile(r"\+CMGS:\s*(\d+)")
# Le refus d'un envoi : « +CMS ERROR » (le service SMS), ou les refus de
# toute commande. `RE_ERREUR_AT` ne connaît que « +CME » : un « +CMS ERROR:
# 500 » passait pour du silence, et l'on attendait l'accusé une minute.
RE_ERREUR_SMS = re.compile(
    r"(?:^|[\r\n])\s*(ERROR|\+CM[ES] ERROR:[^\r\n]*)\s*(?=[\r\n]|$)")
# L'invite « > » : le modem attend la charge du SMS. Ce n'est pas une fin au
# sens de `RE_FIN_AT` (pas de OK, pas de retour à la ligne après).
RE_INVITE = re.compile(rb">\s*$")
RE_COPS = re.compile(r'\+COPS:\s*\d+(?:,\d+,"([^"]*)")?')
# Le mode aussi : 0 le modem choisit, 1 un réseau lui est imposé.
RE_COPS_ETAT = re.compile(r'\+COPS:\s*(\d+)(?:,(\d+),"([^"]*)")?')
# Identité de la SIM : ICCID (numéro gravé sur la carte, 18 à 22 chiffres),
# IMSI (identité de l'abonné sur le réseau), MSISDN (le numéro de téléphone,
# rarement provisionné sur les SIM prépayées).
RE_ICCID = re.compile(r"\b(\d{18,22})\b")
RE_IMSI = re.compile(r"^\s*(\d{14,15})\s*$", re.M)
RE_CNUM = re.compile(r'\+CNUM:\s*"[^"]*"\s*,\s*"([^"]+)"')
# +CREG: <n>,<stat> — stat 5 = enregistré sur un réseau visité (itinérance).
RE_CREG = re.compile(r"\+CREG:\s*\d+,(\d+)")
# La même chose côté 4G (EPS). Lue seulement quand la carte n'est pas
# inscrite pour les appels et les SMS : « inscrite en 4G seulement », c'est
# un réseau limité, pas une carte sans rien.
RE_CEREG = re.compile(r"\+CEREG:\s*\d+,(\d+)")
RE_CFUN = re.compile(r"\+CFUN:\s*(\d+)")
# Le modem refuse parce que la carte n'a pas de réseau : « +CME ERROR: 30 »
# (no network service) ou 32 (network not allowed — emergency calls only).
# PAS 31 (network timeout) : là, quelque chose est peut-être parti.
RE_SANS_RESEAU = re.compile(
    r"\+CME ERROR:\s*(?:30|32|no network service|network not allowed)\b", re.I)
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
TTL_INSCRIPTION = 5
DELAI_RELEVE = 10         # secondes laissées au modem pour lister ses SMS
DELAI_CHOIX_RESEAU = 120  # choisir un réseau peut prendre jusqu'à deux minutes (27.007)
# Au-delà, on se contente de ce que le réseau a envoyé jusque-là.
GRACE_CUSD = 1.2
# Mode texte — repli quand le firmware refuse le mode PDU.
# +CMGL: <index>,"REC UNREAD","<expéditeur>",…  puis le texte à la ligne
RE_CMGL = re.compile(r'\+CMGL:\s*(\d+),"[^"]*","([^"]*)"[^\n]*\n(.*?)(?=\r?\n\+CMGL:|\r?\nOK\r?\n|\Z)', re.S)
# Mode PDU — le seul qui livre l'en-tête de découpe des messages longs.
# +CMGL: <index>,<état>,<alpha>,<longueur>  puis le PDU hexadécimal à la ligne
RE_CMGL_PDU = re.compile(
    r"\+CMGL:\s*(\d+)\s*,[^\n]*\n\s*([0-9A-Fa-f]{20,})", re.I)

# Réponse à « AT+CUSD? » : le réglage des annonces (0 : le modem garde les
# réponses USSD pour lui, 1 : il les annonce sur le port).
RE_REGLAGE_CUSD = re.compile(r"\+CUSD:\s*(\d)\s*(?=[\r\n]|$)")
RE_CSCS = re.compile(r'\+CSCS:\s*"([^"]*)"')
# Les réglages se reposent tant que le modem en refuse un : un modem qui
# vient de revenir sur le bus les refuse volontiers quelques secondes.
ESSAIS_REGLAGES = 3
PAUSE_REGLAGES = 2.0

USSD_OUVERTE = 1
USSD_FERMEE = 0
USSD_ANNULEE = 2


def _trace_du_morceau(emplacement, pdu, morceau):
    """Ce qu'on garde d'un PDU relevé, pour le journal du boîtier : le PDU
    brut, son en-tête de découpe et l'heure écrite par l'opérateur. Un PDU
    illisible (`morceau` à None) garde au moins sa place et ses octets."""
    heure = getattr(morceau, "horodatage", None)
    return {
        "emplacement": emplacement,
        "pdu": pdu.upper(),
        "expediteur": getattr(morceau, "expediteur", None),
        "reference": getattr(morceau, "reference", None),
        "total": getattr(morceau, "total", None),
        "position": getattr(morceau, "position", None),
        "heure_reseau": heure.isoformat() if hasattr(heure, "isoformat") else None,
    }


class ErreurModem(Exception):
    pass


class ModemFerme(ErreurModem):
    """Le port du modem est FERMÉ : sa relance n'a pas retrouvé le modem sur
    le bus USB, et le robot n'a plus rien d'ouvert à lui écrire.

    Le 23 octobre, MTN ·6414 a décroché deux fois en une minute ; la
    seconde relance ne l'a pas retrouvé en quarante-cinq secondes, et les
    relèves suivantes écrivaient au journal « argument must be an int, or
    have a fileno() method » — le message de Python devant un port fermé,
    que le propriétaire lisait tel quel. La relève suivante l'a bien
    relancé, mais trois lignes de charabia entre les deux, c'est trois
    lignes qui n'expliquent rien. Le journal dit maintenant la cause."""

    def __init__(self, port):
        nom = (port or "").rsplit("/", 1)[-1] or "?"
        super().__init__(t(
            f"the modem is not open ({nom}): it has not come back on the "
            "USB bus since its restart",
            f"le modem n'est pas ouvert ({nom}) : il n'est pas revenu sur "
            "le bus USB depuis sa relance"))


class ModemMuet(ErreurModem):
    """Le modem n'a RIEN répondu — pas un octet — à une commande qui répond
    toujours. Ce n'est pas un modem débranché : un port débranché lève
    « Input/output error », et le chien de garde le voit. C'est un port
    ouvert, qui accepte ce qu'on lui écrit, et qui se tait.

    Le 23 octobre, la carte Orange ·4177 a passé la matinée ainsi sur
    ttyUSB20 : « signal unknown · registration unreadable · USSD setting
    unreadable », et chaque code « sans réponse du réseau ». Le réseau n'y
    était pour rien, le modem ne répondait à aucune commande. Mais la relève
    des SMS, toutes les dix secondes, rendait « aucun SMS » sans lever ; le
    chien de garde comptait zéro échec ; la veille du réseau lisait
    « inconnu », qui ne compte ni pour ni contre. Rien ne le relançait. Le
    propriétaire relançait tout le robot à la main, dont la détection prenait
    un port qui répond — et ça repartait, jusqu'à la fois suivante.

    Un silence complet est donc une PANNE, dite avec son port, et comptée
    comme un « Input/output error » : trois de suite, et le modem est
    relancé, port rouvert là où il répond."""

    def __init__(self, port, commande, delai):
        self.port = port
        nom = (port or "").rsplit("/", 1)[-1] or "?"
        try:
            from .detect import interface_usb
            interface = interface_usb(port)
        except Exception:
            interface = None
        ou = nom if interface is None else f"{nom} (interface {interface})"
        super().__init__(t(
            f"the modem answered nothing on {ou} in {delai:g} s "
            f"({commande}): mute, not unplugged",
            f"le modem n'a rien répondu sur {ou} en {delai:g} s "
            f"({commande}) : muet, pas débranché"))


class ReponseNonRecue(ErreurModem):
    """La demande est ÉCRITE au modem, et le réseau n'a rien dit à temps.

    Ce n'est pas un échec : la réponse — peut-être un code secret — est
    peut-être arrivée chez l'opérateur, et l'opération peut aboutir. Le dire
    « n'a pas pu faire », c'était faire recommencer un transfert parti."""


class RefusDuModem(ErreurModem):
    """Le modem a refusé le code AVANT de l'envoyer (« +CME ERROR: … ») :
    rien n'est parti. La cause brute se garde pour le journal ; le
    propriétaire, lui, lit ce qu'elle veut dire. Vu sur la plateforme le
    22 octobre : « no network service » (la carte n'a plus de réseau à cet
    instant), « unknown network message » et « unknown » (le réseau a
    répondu quelque chose que le modem ne comprend pas), « retry
    operation » (le modem était occupé). La cause brute va au journal, la
    phrase à l'écran."""

    def __init__(self, cause):
        self.cause = (cause or "").strip()
        super().__init__(self.phrase())

    @property
    def sans_reseau(self):
        """La cause dit-elle « pas de réseau » ? Un état lisible, que la
        veille du réseau traite (voir `PasDeReseau`)."""
        return bool(RE_SANS_RESEAU.search(self.cause))

    def phrase(self, langue=None):
        brute = self.cause.lower()
        # « +CME ERROR: 30 » dit la même chose que « no network service »,
        # en chiffres : c'est la règle de `sans_reseau` qui tranche.
        if self.sans_reseau or "no network" in brute:
            sens = t("the card has no network signal right now",
                     "la carte n'a pas de réseau en ce moment", langue=langue)
        elif "retry" in brute or "busy" in brute:
            sens = t("the modem was busy, try again in a moment",
                     "le modem était occupé, réessayez dans un instant",
                     langue=langue)
        elif "network message" in brute or brute.endswith("unknown"):
            sens = t("the network rejected the code in a way the modem "
                     "does not understand",
                     "le réseau a rejeté le code d'une façon que le modem "
                     "ne comprend pas", langue=langue)
        else:
            sens = t("the modem refused the code",
                     "le modem a refusé le code", langue=langue)
        # Les mots du modem (« +CME ERROR: … ») vont au journal, avec la
        # sonde (`Pilotage._refus_du_modem`) — pas sous les yeux du
        # propriétaire, qui n'est pas informaticien.
        return t(f"Nothing was sent: {sens}.",
                 f"Rien n'est parti : {sens}.", langue=langue)


class PasDeReseau(RefusDuModem):
    """Le modem a refusé la demande parce que la carte n'est inscrite sur
    aucun réseau (« +CME ERROR: no network service », 30, 32) — ou elle se
    reconnecte à son réseau (`reconnexion` : la radio ou le modem se
    relancent). Rien n'est parti : c'est le modem qui le dit avant d'écrire
    quoi que ce soit au réseau.

    C'EST UN ÉTAT QUE LE BOÎTIER SAIT LIRE : son inscription. La veille du
    réseau (`service.py`, `Robot._veiller_service`) s'en occupe — la radio,
    puis le modem, jamais quand tout un opérateur est coupé. Il ne compte
    donc pas parmi les codes qui n'atteignent pas le réseau SANS qu'on sache
    pourquoi (`Compte.codes_sans_reseau`) : trois codes tapés pendant une
    coupure de l'opérateur ne doivent pas relancer un modem en bon état."""

    def __init__(self, cause=None, reconnexion=False):
        self.reconnexion = reconnexion
        # Pendant une relance, le modem n'a rien dit : aucune commande n'est
        # partie, il n'y a pas de cause à lui prêter.
        if cause is None:
            cause = "" if reconnexion else "no network service"
        super().__init__(cause)

    @property
    def sans_reseau(self):
        return True

    def phrase(self, langue=None):
        if self.reconnexion:
            return t("The card is reconnecting to its network — nothing was "
                     "sent. Try again in a minute.",
                     "La carte se reconnecte à son réseau — rien n'est parti. "
                     "Réessayez dans une minute.", langue=langue)
        return super().phrase(langue)


class MessageTropLong(ErreurModem):
    """Le message ne tient pas dans un SMS (160 caractères, 70 hors de
    l'alphabet GSM). Rien n'a été écrit au modem — et on le dit comme une
    LONGUEUR, pas comme des caractères refusés."""

    def __init__(self, refus):
        self.combien, self.borne = refus.combien, refus.borne
        super().__init__(t(
            f"Message too long: {refus.combien} characters, {refus.borne} at "
            f"most — nothing was sent.",
            f"Message trop long : {refus.combien} caractères, {refus.borne} au "
            f"plus — rien n'est parti."))


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


class EnvoiIncertain(ErreurModem):
    """Le SMS est ÉCRIT au modem et l'accusé (+CMGS) n'est pas venu à temps.
    Ce n'est pas un échec : il a peut-être été remis."""


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


def phrase_du_silence(etat):
    """La ligne du journal quand le réseau n'a pas répondu : ce que le modem
    en dit, en mots. Jamais un code, jamais un numéro — un port, un signal,
    un état du réseau."""
    port = (etat.get("port") or "").rsplit("/", 1)[-1] or t("unknown port",
                                                              "port inconnu")
    signal = etat.get("signal", 99)
    parties = [t(f"signal {signal}/31", f"signal {signal}/31") if signal != 99
               else t("signal unknown", "signal inconnu")]
    enregistre = etat.get("enregistre")
    parties.append(
        t("on the network", "réseau enregistré") if enregistre
        else t("CARD OFF THE NETWORK", "CARTE HORS RÉSEAU") if enregistre is False
        else t("registration unreadable", "enregistrement illisible"))
    annonces = etat.get("annonces")
    if annonces is False:
        if etat.get("repare"):
            parties.append(t("USSD replies were NOT announced — settings "
                             "re-applied", "annonces USSD INACTIVES — "
                             "réglages refaits"))
        else:
            parties.append(t("USSD replies NOT announced — settings refused: "
                             + ", ".join(etat.get("refuses") or []),
                             "annonces USSD INACTIVES — réglages refusés : "
                             + ", ".join(etat.get("refuses") or [])))
    elif annonces:
        parties.append(t("USSD replies announced", "annonces USSD actives"))
    else:
        parties.append(t("USSD setting unreadable", "réglage USSD illisible"))
    if etat.get("alphabet"):
        parties.append(etat["alphabet"])
    parties.append(port)
    return " · ".join(parties)


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

    def __init__(self, port="/dev/ttyUSB2", baud=115200, imei=""):
        from .detect import ouvrir_la_prise

        self.port = port
        self.baud = baud
        self.ser = ouvrir_la_prise(port, baud)
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
        # L'identité du MODEM, pas de la carte : c'est elle qu'on reconnaît
        # quand il revient sur le bus sous un autre nom (voir `_rouvrir`).
        self.imei = imei or self._lire_imei()

    # ---- bas niveau -------------------------------------------------------
    def _envoyer(self, commande, delai=5):
        """Envoie une commande AT et rend la réponse dès qu'elle est complète.

        La lecture démarre immédiatement et s'accélère tant que le modem
        parle : une pause fixe avant de lire, c'est de l'attente pure ajoutée
        à *chaque* commande, et il y en a plusieurs par écran affiché.

        La fin est repérée sur une ligne `OK` / `ERROR` entière et non sur la
        présence des lettres « OK » quelque part — un SMS contenant le mot
        interrompait la lecture au milieu.

        CE QUI ATTEND SUR LE PORT SE LIT AVANT D'ÊTRE JETÉ. Le fil d'une
        carte relève ses SMS toutes les dix secondes, menu ouvert ou non.
        Si l'opérateur refermait le menu (« +CUSD: 2 ») pendant que la
        personne tapait son code, cette relève vidait le port sans le lire :
        le menu passait pour ouvert, et le code secret partait comme un
        NOUVEAU code USSD. L'annonce est gardée là où `_cusd` la cherche."""
        # Un port FERMÉ (la relance n'a pas retrouvé le modem) se dit en
        # français, pas par l'erreur de Python sur un descripteur absent.
        if not getattr(self.ser, "is_open", True):
            raise ModemFerme(self.port)
        en_attente = getattr(self.ser, "in_waiting", 0) or 0
        if en_attente:
            self._garder_les_annonces(self.ser.read(en_attente) or b"")
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
        """Pose les réglages du robot — et VÉRIFIE que le modem les prend.

        Le modem repart avec SES réglages par défaut chaque fois qu'il
        redémarre : une coupure sur le bus USB, un « AT+CFUN », une baisse
        de courant. Par défaut, il n'annonce pas les réponses USSD
        (+CUSD) : il envoie le code au réseau, reçoit la réponse, et la
        garde pour lui. Les SMS, eux, se relèvent toujours (AT+CMGL est une
        question, pas une annonce). C'est exactement la panne du 22 octobre
        à Douala : les quatre modems décrochés à la même minute, rouverts
        par le robot, et la carte Orange qui lisait ses SMS mais répondait
        « sans réponse du réseau » à chaque code, jusqu'à ce qu'on relance
        tout le robot.

        Les réglages étaient envoyés UNE fois, sans regarder la réponse —
        et un modem qui vient de revenir sur le bus les refuse volontiers
        pendant quelques secondes (« SIM busy », ou rien du tout). On
        recommence donc tant qu'un réglage essentiel est refusé, puis on
        retient ceux qui le restent (`reglages_refuses`) : le journal et le
        diagnostic les disent, au lieu de laisser deviner."""
        with self.verrou:
            refuses = []
            for essai in range(ESSAIS_REGLAGES):
                refuses = self._regler()
                if not refuses:
                    break
                time.sleep(PAUSE_REGLAGES)
            self.reglages_refuses = refuses

    def _regler(self):
        """Un passage de réglages. Rend les commandes ESSENTIELLES que le
        modem a refusées (ou laissées sans réponse) — vide si tout est pris.
        À appeler sous le verrou."""
        refuses = []
        if "OK" not in self._envoyer("AT"):
            # Un modem qui ne dit même pas « OK » n'est pas là : inutile de
            # lui poser huit autres questions à cinq secondes chacune. On
            # repart sur les réglages les plus prudents, et on le dit.
            self.mode_pdu = False
            self.stockage_sms = "SM"
            self.ucs2 = False
            return ["AT"]
        # Une radio restée coupée — le robot arrêté entre les deux gestes de
        # `relancer_radio` — se rallume d'abord. On ne touche à rien si elle
        # est allumée, ou si le modem ne sait pas le dire. (Après le « AT » :
        # un modem muet ne coûte qu'une question par passage.)
        radio = RE_CFUN.search(self._envoyer("AT+CFUN?", delai=3))
        if radio and radio.group(1) in ("0", "4"):
            self._envoyer("AT+CFUN=1", delai=15)
        for cmd in ("ATE0", "AT+CMEE=2",
                    # Sans elle, la réponse du réseau à un code USSD n'est
                    # jamais annoncée sur le port : « sans réponse », toujours.
                    "AT+CUSD=1",
                    # Stocker les SMS entrants et signaler leur arrivée
                    # plutôt que de les déverser sur le port série.
                    "AT+CNMI=2,1,0,0,0"):
            if "OK" not in self._envoyer(cmd):
                refuses.append(cmd)
        # Mode PDU : c'est le SEUL qui livre l'en-tête de découpe des
        # messages longs. En mode texte, un SMS de plus de 160 caractères
        # arrive en morceaux séparés, sans rien pour les rattacher — donc
        # tronqué à l'écran. On retombe en mode texte si le firmware
        # refuse, plutôt que de ne plus lire aucun SMS.
        self.mode_pdu = "OK" in self._envoyer("AT+CMGF=0")
        if not self.mode_pdu and "OK" not in self._envoyer("AT+CMGF=1"):
            refuses.append("AT+CMGF")
        # Préférer la mémoire du modem : la SIM déborde en une journée
        # chargée, et un stockage plein fait perdre les SMS suivants.
        self.stockage_sms = "SM"
        for emplacement in MEMOIRES_SMS:
            if "OK" in self._envoyer(f'AT+CPMS="{emplacement}","{emplacement}",'
                                     f'"{emplacement}"'):
                self.stockage_sms = emplacement
                break
        else:
            refuses.append("AT+CPMS")
        # Jeu de caractères : GSM si possible, sinon UCS2 (réponses en hexa)
        self.ucs2 = False
        if "OK" not in self._envoyer('AT+CSCS="GSM"'):
            if "OK" in self._envoyer('AT+CSCS="UCS2"'):
                self.ucs2 = True
            else:
                refuses.append("AT+CSCS")
        return refuses

    def etat_apres_silence(self):
        """Ce que le modem sait, quand le réseau n'a pas répondu à un code.

        « Sans réponse du réseau » couvre trois pannes qui ne se réparent
        pas pareil : l'opérateur qui tarde (rien à faire ici), une carte qui
        n'est plus enregistrée sur le réseau (+CREG), et un modem qui a
        perdu le réglage des annonces USSD (+CUSD: 0) — celle-là, on la
        répare sur-le-champ en reposant les réglages, et on le dit.

        Rend un dictionnaire : `port`, `annonces` (le modem annonce-t-il
        les réponses USSD ?), `enregistre` (la carte est-elle sur le
        réseau ?), `signal` (0..31, 99 inconnu), `alphabet`, `repare`,
        `refuses`. Les lectures illisibles valent None."""
        with self.verrou:
            urc = RE_REGLAGE_CUSD.search(self._envoyer("AT+CUSD?", delai=2))
            creg = RE_CREG.search(self._envoyer("AT+CREG?", delai=2))
            csq = RE_CSQ.search(self._envoyer("AT+CSQ", delai=2))
            cscs = RE_CSCS.search(self._envoyer("AT+CSCS?", delai=2))
            etat = {
                "port": self.port,
                "annonces": (urc.group(1) == "1") if urc else None,
                # La même table que la veille du service : 9 et 10 (chez elle,
                # en itinérance), 6 et 7 (SMS seulement) ne sont pas « hors
                # réseau ».
                "enregistre": (etat_du_service(int(creg.group(1))) not in SANS_SERVICE)
                              if creg else None,
                "signal": int(csq.group(1)) if csq else 99,
                "alphabet": cscs.group(1) if cscs else "",
                "repare": False,
                "refuses": [],
            }
            attendu = "UCS2" if getattr(self, "ucs2", False) else "GSM"
            derive = etat["alphabet"] and etat["alphabet"] != attendu
            if etat["annonces"] is False or derive:
                etat["refuses"] = self._regler()
                etat["repare"] = "AT+CUSD=1" not in etat["refuses"]
                self.reglages_refuses = etat["refuses"]
        return etat

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

    # ---- le choix du réseau (AT+COPS) ----------------------------------------
    #
    # Une carte en itinérance choisit seule l'antenne qu'elle emprunte. Le
    # propriétaire peut lui en imposer une (voir `reseaux.py`, [reseaux]) :
    # c'est « Choisir le réseau manuellement » d'un téléphone. Le modem garde
    # ce choix, même éteint — d'où `reseau_automatique`, qui le rend.

    def reseau_choisi(self):
        """(mode, code) tel que le modem le dit — mode 0 : il choisit seul,
        1 : un réseau lui est imposé ; code « 20801 », ou "" s'il n'est sur
        aucun réseau. None si la réponse ne se lit pas. La lecture se fait
        en CODES (format 2), puis le format des NOMS est rendu : c'est lui
        que `operateur()` lit pour l'écran."""
        with self.verrou:
            self._envoyer("AT+COPS=3,2", delai=3)
            m = RE_COPS_ETAT.search(self._envoyer("AT+COPS?", delai=3))
            self._envoyer("AT+COPS=3,0", delai=3)
        if not m:
            return None
        return (int(m.group(1)), m.group(3) or "")

    def imposer_reseau(self, code):
        """Impose le réseau `code` à la carte (AT+COPS=1,2,"code"). Peut
        prendre jusqu'à deux minutes : la carte se réinscrit. Rend True si
        le modem a accepté. Le format des noms est rendu ensuite, pour que
        l'écran continue de lire « Orange F » et non « 20801 »."""
        with self.verrou:
            ok = "OK" in self._envoyer(f'AT+COPS=1,2,"{code}"', delai=DELAI_CHOIX_RESEAU)
            self._envoyer("AT+COPS=3,0", delai=3)
            self._oublier_le_reseau()
        return ok

    def reseau_automatique(self):
        """Rend à la carte le choix de son réseau (AT+COPS=0)."""
        with self.verrou:
            ok = "OK" in self._envoyer("AT+COPS=0", delai=DELAI_CHOIX_RESEAU)
            self._oublier_le_reseau()
        return ok

    def _oublier_le_reseau(self):
        memo = getattr(self, "_memo", None)
        if memo is not None:
            for cle in ("inscription", "signal", "operateur"):
                memo.pop(cle, None)

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
        # 10 : « itinérance, urgences seulement en CSFB » — itinérance aussi.
        return bool(m and m.group(1) in ("5", "10"))

    def inscription(self):
        """(sim_prete, creg, cereg) — ce que le modem sait de l'inscription
        de la carte (voir `service.etat_du_service`). None là où la réponse
        ne se lisait pas : une lecture ratée ne dit jamais « pas de réseau »."""
        if getattr(self, "_memo", None) is None:
            return self._lire_inscription()
        return self._cache("inscription", TTL_INSCRIPTION, self._lire_inscription)

    def _lire_inscription(self):
        # Une SIM absente ou verrouillée répond « +CREG: 0,0 » comme une
        # carte sans réseau : on regarde la SIM d'abord, sous le MÊME verrou.
        with self.verrou:
            if "READY" not in self._envoyer("AT+CPIN?", delai=2):
                return (False, None, None)
            m = RE_CREG.search(self._envoyer("AT+CREG?", delai=2))
            creg = int(m.group(1)) if m else None
            cereg = None
            if creg is not None and creg not in (1, 5, 6, 7, 9, 10):
                m = RE_CEREG.search(self._envoyer("AT+CEREG?", delai=2))
                cereg = int(m.group(1)) if m else None
        return (True, creg, cereg)

    def relancer_radio(self):
        """Coupe la radio de la carte (mode avion, AT+CFUN=4) puis la rallume
        (AT+CFUN=1) : la carte se réinscrit comme un téléphone qu'on sort du
        mode avion. La SIM reste alimentée, les réglages et les SMS rangés ne
        bougent pas — rien n'est à réinitialiser.

        La radio ne doit JAMAIS rester coupée : le rallumage est dans un
        `finally`, et il est VÉRIFIÉ (AT+CFUN? doit dire 1), jusqu'à trois
        fois. Rend True si la radio est revenue."""
        allumee = False
        with self.verrou:
            try:
                self._envoyer("AT+CFUN=4", delai=15)
                time.sleep(3)
            finally:
                for _ in range(3):
                    self._envoyer("AT+CFUN=1", delai=15)
                    m = RE_CFUN.search(self._envoyer("AT+CFUN?", delai=3))
                    if m and m.group(1) == "1":
                        allumee = True
                        break
                    time.sleep(3)
            memo = getattr(self, "_memo", None)
            if memo is not None:
                for cle in ("inscription", "signal", "operateur"):
                    memo.pop(cle, None)
        return allumee

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

    def _lire_imei(self):
        from .detect import RE_IMEI

        with self.verrou:
            m = RE_IMEI.search(self._envoyer("AT+CGSN", delai=2))
        return m.group(1) if m else ""

    def _rouvrir(self, patience=45):
        """Referme le port et rouvre CE modem, sous son nouveau nom s'il le faut.

        Au retour sur le bus USB, le noyau ne rend pas forcément le même
        numéro : le modem parti de `/dev/ttyUSB2` peut revenir sur `ttyUSB6`.
        S'entêter sur l'ancien chemin, c'est attendre un port qui n'existera
        plus jamais — on redemande donc lequel est le bon.

        Et « le bon » se PROUVE. L'ancien nom peut très bien exister encore,
        porté par un AUTRE modem revenu plus vite : un port qui s'ouvre ne dit
        rien de qui est derrière. Dans la nuit du 16 au 17 octobre, quatre
        modems relancés ensemble sont revenus dans le désordre, et trois des
        quatre comptes ont rouvert un port du MÊME modem — celui de la
        MTN ·3501. Le robot a cru à trois changements de carte, et les trois
        autres modems sont restés sans personne pour relever leurs SMS. On ne
        garde donc un port que si le modem y donne l'IMEI qu'il avait.
        """
        from .detect import imei_de, ouvrir_la_prise

        try:
            self.ser.close()
        except Exception:
            pass

        # Sans IMEI connu (un modem qui ne l'a jamais dit), on ne peut rien
        # prouver : on reprend le premier port qui s'ouvre, comme avant.
        imei = getattr(self, "imei", "")
        fin = time.time() + patience
        derniere = None
        while time.time() < fin:
            time.sleep(2)
            for chemin in self._chemins_possibles():
                try:
                    ser = ouvrir_la_prise(chemin, self.baud)
                except Exception as e:
                    derniere = e
                    continue
                trouve = imei_de(ser) if imei else ""
                if imei and trouve != imei:
                    try:
                        ser.close()
                    except Exception:
                        pass
                    if trouve:
                        derniere = t(f"{chemin} belongs to another modem",
                                     f"{chemin} est à un autre modem")
                    continue
                self.ser = ser
                self.port = chemin
                return
        raise ErreurModem(t(
            f"the modem did not come back on the serial port after "
            f"{patience} s ({derniere}). Check the USB cable and the power "
            f"supply: the HAT draws 3 A, and a charger that falls short "
            f"makes it drop off the bus.",
            f"le modem n'est pas revenu sur le port série après {patience} s "
            f"({derniere}). Vérifiez le câble USB et l'alimentation : le HAT "
            f"réclame 3 A, un chargeur trop juste le fait décrocher du bus."))

    def _chemins_possibles(self):
        """Tous les ports, dans l'ordre des numéros : le premier qui donne
        NOTRE IMEI est le port AT principal, comme à la détection.

        L'ANCIEN NUMÉRO N'A PLUS DE PRIVILÈGE. Le noyau ne redonne pas à un
        modem revenu un bloc de cinq numéros qui se suivent : il lui donne
        les plus petits numéros libres. Le 22 octobre, le même modem est
        revenu sur ttyUSB 2, 7, 12, 13, 14, puis 2, 7, 13, 14, 15, puis 2, 7,
        12, 14, 15 — son port AT valait 12, puis 13, puis 12, et son port de
        données (le quatrième, qui répond aussi aux commandes AT et donne le
        même IMEI) valait 13, puis 14, puis 14. Reprendre « l'ancien port
        d'abord » (13) au troisième retour, c'était se brancher sur le port
        de DONNÉES du bon modem : les commandes passent, les SMS se lisent,
        et les réponses USSD n'y arrivent pas forcément. Les numéros sont
        donnés dans l'ordre des interfaces : le plus petit qui porte l'IMEI
        est le port AT, toujours.

        On ne lance plus la détection complète ici : elle interrogeait chaque
        port (carte, numéro, réseau…) à chaque tour d'attente, toutes les deux
        secondes, et c'est elle qui dérangeait les modems voisins."""
        from .detect import INTERFACE_AT, _numero_port, interface_usb

        chemins = sorted(set(glob.glob("/dev/ttyUSB*")) | {self.port},
                         key=_numero_port)
        # Le cas courant — le modem revient sous le même nom — ne doit rien
        # coûter : l'ancien port passe en premier SI ce nom désigne encore un
        # port AT principal (interface 2), ou si /sys ne sait pas le dire.
        # Devenu le port de données du même modem, il perd son tour.
        interface = interface_usb(self.port)
        if self.port and interface in (None, INTERFACE_AT):
            chemins = [self.port] + [c for c in chemins if c != self.port]
        return chemins

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
                if erreur and RE_SANS_RESEAU.search(erreur.group(1)):
                    # « no network service », tel quel, était la seule chose
                    # que le propriétaire lisait — en anglais.
                    raise PasDeReseau(erreur.group(1))
                if erreur:
                    raise RefusDuModem(erreur.group(1))
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

    def _attendre_invite(self, delai=5):
        """Attend l'invite « > » qui suit `AT+CMGS=<n>` : le modem demande
        la charge. Rien n'est encore parti à cet instant — un refus ici
        (« +CMS ERROR », « ERROR ») ou le silence sont des échecs FRANCS, et
        l'appelant peut le dire sans détour."""
        fin = time.time() + delai
        tampon = b""
        pause = 0.01
        while time.time() < fin:
            morceau = self.ser.read_all()
            if morceau:
                tampon += morceau
                if RE_INVITE.search(tampon):
                    return
                erreur = RE_ERREUR_SMS.search(tampon.decode(errors="replace"))
                if erreur:
                    cause = erreur.group(1).strip()
                    raise ErreurModem(t(
                        f"The modem refused to send ({cause}). Nothing was sent.",
                        f"Le modem a refusé l'envoi ({cause}). Rien n'est parti."))
                pause = 0.01
            else:
                pause = min(pause * 2, 0.08)
            time.sleep(pause)
        # L'invite peut encore arriver juste après l'échéance : le modem
        # serait alors en saisie, et la commande suivante — l'USSD d'une
        # demande Bonzini — avalée comme texte du message jusqu'à un Ctrl-Z
        # qui ne vient jamais. Un Échap annule la saisie ; hors saisie, le
        # modem l'ignore. La faute d'un SMS XAFe ne tombe pas sur Bonzini.
        self.ser.write(b"\x1b")
        raise ErreurModem(t("The modem did not ask for the message (no prompt). "
                            "Nothing was sent.",
                            "Le modem n'a pas demandé le message (pas d'invite). "
                            "Rien n'est parti."))

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
            # Une annonce gardée par une commande (`_garder_les_annonces`)
            # attend dans la traîne : c'est ici qu'elle se lit.
            if b"+CMTI" in self._traine_urc or b"+CMT" in self._traine_urc:
                self._traine_urc = b""
                return True
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
            brut = self._envoyer(commande, delai=DELAI_RELEVE)
        # PAS UN OCTET en dix secondes : le modem est muet, et c'est une
        # panne (voir `ModemMuet`). Une réponse entamée mais sans « OK »
        # n'en est pas une : une mémoire pleine met du temps à se lister, et
        # ce qui est lu se traite ; la suite vient au tour d'après.
        if not brut.strip():
            raise ModemMuet(self.port, commande, DELAI_RELEVE)
        if not self.mode_pdu:
            # Le mode texte ne livre pas l'horodatage réseau : emis_le = None,
            # l'appelant retombera sur l'heure de relève du Pi.
            return [([int(m.group(1))], decode_auto(m.group(2), mode_texte=True),
                     decode_auto(m.group(3).strip(), mode_texte=True), None)
                    for m in RE_CMGL.finditer(brut)]

        morceaux, illisibles = [], []
        # CE QUE LE MODEM A RENDU, TEL QUEL : chaque PDU avec son en-tête de
        # découpe et l'heure écrite par l'opérateur. Le décodage le jetait :
        # un SMS livré « incomplet », on ne pouvait plus dire si le morceau
        # manquant n'était jamais venu ou s'il était venu trop tard. L'appelant
        # le range au journal du boîtier (`Journal.morceaux_vus`).
        self.derniere_releve = []
        for m in RE_CMGL_PDU.finditer(brut):
            index = int(m.group(1))
            try:
                morceau = decoder(m.group(2))
                morceaux.append((index, morceau))
            except ErreurPDU:
                morceau = None
                illisibles.append(index)   # on connaît sa place : on pourra l'effacer
            self.derniere_releve.append(_trace_du_morceau(index, m.group(2), morceau))
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

    def envoyer_sms(self, numero, texte, delai=60):
        """Envoie un SMS ; rend la référence (+CMGS) que le modem lui donne.

        Le dialogue : `AT+CMGS=<longueur>`, le modem répond par l'invite
        « > » (pas un OK : `_attendre_invite`), on écrit le PDU puis Ctrl-Z,
        et le modem rend `+CMGS: <réf>` puis OK quand le réseau a accepté le
        message — deux à dix secondes d'ordinaire, jusqu'à une minute sur un
        réseau lent. Le verrou est tenu jusqu'à l'accusé, comme `lire_sms`
        le tient dix secondes : entre l'invite et le Ctrl-Z, le port n'est à
        personne d'autre, et un autre échange y glisserait ses octets DANS le
        message.

        Trois issues, qu'on distingue parce qu'elles n'appellent pas la même
        suite : `ReponseRefusee` / `ErreurModem` — RIEN n'est parti ;
        `EnvoiIncertain` — la charge est écrite, l'accusé n'est pas venu : le
        SMS a peut-être été remis ; une référence — il est parti.

        Toujours en PDU quand le modem y est (`mode_pdu`) : le texte n'entre
        alors jamais dans une commande AT, et le guillemet comme la barre y
        sont des caractères ordinaires. Le mode texte n'est qu'un repli, et
        on ne bascule JAMAIS `AT+CMGF` pour un envoi : la relève des SMS en
        dépend. Ce repli n'est éprouvé qu'en GSM : sous `AT+CSCS="UCS2"`, le
        modem attend aussi l'ADRESSE codée en UCS2, et elle part ici en
        chiffres clairs — rien ne le promet, `mode_pdu` est posé au
        démarrage et c'est lui la voie normale."""
        try:
            texte = texte_pour_sms(texte)
            longueur, hexa = encoder_submit(numero, texte)
        except ChargeTropLongue as refus:
            raise MessageTropLong(refus) from None
        except ChargeRefusee as refus:
            raise ReponseRefusee(refus.caracteres) from None
        with self.verrou:
            # Ce que le port a dit depuis le dernier échange se lit avant
            # d'être jeté (même geste que `_cusd`) : un « +CUSD: 2 » croisé ici
            # ferme le menu pour la réponse USSD suivante — mais ce n'est pas
            # une réponse USSD, on ne lève pas `MenuReferme`.
            en_attente = getattr(self.ser, "in_waiting", 0) or 0
            reste = self.ser.read(en_attente) if en_attente else b""
            if RE_CUSD_FERME.search(reste or b""):
                self._ferme_par_le_reseau = True
            self.ser.reset_input_buffer()
            if getattr(self, "mode_pdu", False):
                self.ser.write(f"AT+CMGS={longueur}\r".encode())
                self._attendre_invite()
                self.ser.write(hexa.encode() + b"\x1a")
            else:
                charge = encode_ucs2(texte) if getattr(self, "ucs2", False) else texte
                # Les chiffres que `encoder_submit` a validés, avec le 237,
                # jamais le numéro reçu tel quel : la même défense que `_cusd`
                # contre un guillemet ou un retour chariot dans la commande.
                self.ser.write(f'AT+CMGS="+{numero_international(numero)}"\r'.encode())
                self._attendre_invite()
                self.ser.write(charge.encode("utf-8") + b"\x1a")
            fin = time.time() + delai
            tampon = b""
            pause = 0.02
            while time.time() < fin:
                morceau = self.ser.read_all()
                if morceau:
                    tampon += morceau
                    pause = 0.02
                    texte_lu = tampon.decode(errors="replace")
                    m = RE_CMGS.search(texte_lu)
                    if m:
                        self._garder_les_annonces(tampon)
                        return m.group(1)
                    erreur = RE_ERREUR_SMS.search(texte_lu)
                    if erreur:
                        self._garder_les_annonces(tampon)
                        cause = erreur.group(1).strip()
                        raise ErreurModem(t(
                            f"The network refused the SMS ({cause}). Nothing was sent.",
                            f"Le réseau a refusé le SMS ({cause}). Rien n'est parti."))
                else:
                    pause = min(pause * 2, 0.15)
                time.sleep(pause)
            self._garder_les_annonces(tampon)
        raise EnvoiIncertain(t(
            "No delivery report from the modem in time: the SMS may still "
            "have been sent.",
            "Accusé non reçu du modem à temps : le SMS a peut-être été remis."))

    def _garder_les_annonces(self, tampon):
        """Les annonces non sollicitées croisées pendant l'envoi (+CMTI,
        +CUSD) ne se perdent pas : elles vont là où `sms_annonce` les lit."""
        if b"+CMTI" in tampon or b"+CMT" in tampon or b"+CUSD" in tampon:
            self._traine_urc = (getattr(self, "_traine_urc", b"") + tampon)[-64:]
            if RE_CUSD_FERME.search(tampon):
                self._ferme_par_le_reseau = True

    def memoire_sms(self):
        """(occupés, capacité) du stockage des SMS. Une mémoire pleine fait
        perdre les messages suivants : c'est surveillé en continu."""
        with self.verrou:
            m = RE_CPMS.search(self._envoyer("AT+CPMS?"))
        return (int(m.group(1)), int(m.group(2))) if m else (0, 0)
