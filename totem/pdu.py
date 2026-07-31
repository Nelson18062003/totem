# -*- coding: utf-8 -*-
"""Décodage des SMS au format PDU, et recollage des messages longs.

Pourquoi ce module existe
-------------------------
Un SMS ne peut pas dépasser 160 caractères (70 en alphabet étendu). Au-delà,
le réseau le **découpe en morceaux** et ajoute dans chacun un petit en-tête
invisible qui dit : « ceci est le morceau 2 sur 3 du message n° 47 ».

En mode texte (`AT+CMGF=1`), le modem livre ces morceaux comme des messages
**séparés et sans en-tête** : impossible de savoir qu'ils vont ensemble, ni
dans quel ordre. Un relevé de compte arrivait donc coupé en deux, et rien
n'indiquait qu'il manquait la suite.

En mode PDU (`AT+CMGF=0`), le modem livre le message **brut**, en-tête
compris. On peut alors reconnaître les morceaux d'un même message et les
recoller dans l'ordre.

Ce que contient un PDU reçu (SMS-DELIVER), dans l'ordre
-------------------------------------------------------
    [longueur du centre SMS][centre SMS]
    [octet d'en-tête]            ← son bit 6 dit s'il y a un en-tête de découpe
    [numéro de l'expéditeur]
    [protocole][codage]          ← codage : alphabet GSM 7 bits, ou UCS2
    [horodatage du centre SMS]   ← 7 octets
    [longueur des données][données]
"""

import re
from datetime import datetime, timedelta, timezone

from .gsm import ALPHABET_GSM, EXTENSION_GSM, ECHAPPEMENT

RE_HEXA_PDU = re.compile(r"\A[0-9A-Fa-f]+\Z")

# Identifiants des en-têtes de découpe (TP-UDH), 3GPP 23.040 §9.2.3.24.
CONCAT_8BITS = 0x00      # numéro de message sur 1 octet
CONCAT_16BITS = 0x08     # numéro de message sur 2 octets

# Au-delà, on renonce à attendre les morceaux manquants et on livre ce qu'on a
# plutôt que de retenir indéfiniment un message incomplet.
PATIENCE_MORCEAUX = timedelta(minutes=15)


class Morceau:
    """Un PDU décodé. Seul ou morceau d'un message plus long."""

    __slots__ = ("expediteur", "texte", "horodatage", "reference", "total",
                 "position")

    def __init__(self, expediteur, texte, horodatage=None,
                 reference=None, total=1, position=1):
        self.expediteur = expediteur
        self.texte = texte
        self.horodatage = horodatage
        self.reference = reference   # None = message d'un seul tenant
        self.total = total
        self.position = position

    @property
    def entier(self):
        return self.reference is None or self.total <= 1

    def __repr__(self):
        return (f"Morceau({self.expediteur!r}, {self.position}/{self.total}, "
                f"{self.texte[:24]!r})")


class ErreurPDU(Exception):
    pass


# ---- lecture bit à bit -----------------------------------------------------
def septets(octets, nombre, saut=0):
    """Déballe `nombre` septets tassés dans `octets`, puis en ignore `saut`.

    Les caractères GSM tiennent sur 7 bits : huit octets en contiennent neuf.
    Il faut donc lire à cheval sur les octets, bit par bit."""
    sortie = []
    for index in range(nombre):
        debut = index * 7
        octet = debut // 8
        decalage = debut % 8
        if octet >= len(octets):
            break
        valeur = octets[octet] >> decalage
        if decalage > 1 and octet + 1 < len(octets):
            valeur |= octets[octet + 1] << (8 - decalage)
        sortie.append(valeur & 0x7F)
    return sortie[saut:]


def texte_gsm7(valeurs):
    sortie, echappe = [], False
    for valeur in valeurs:
        if echappe:
            sortie.append(EXTENSION_GSM.get(valeur, " "))
            echappe = False
        elif valeur == ECHAPPEMENT:
            echappe = True
        else:
            sortie.append(ALPHABET_GSM[valeur])
    return "".join(sortie)


# ---- champs d'un PDU -------------------------------------------------------
def _adresse(octets, i):
    """Numéro de l'expéditeur. Les chiffres sont stockés par paires inversées
    (« 12 34 » se lit « 21 43 »), et certains expéditeurs sont des noms
    (« MobileMoney ») écrits en alphabet GSM."""
    nb_chiffres = octets[i]
    type_adresse = octets[i + 1]
    i += 2
    nb_octets = (nb_chiffres + 1) // 2
    brut = octets[i:i + nb_octets]
    i += nb_octets

    if (type_adresse & 0x70) == 0x50:          # expéditeur alphanumérique
        return texte_gsm7(septets(brut, (nb_chiffres * 4) // 7)).rstrip(), i

    chiffres = "".join(f"{octet & 0x0F:X}{octet >> 4:X}" for octet in brut)
    chiffres = chiffres[:nb_chiffres].replace("F", "")
    if (type_adresse & 0x70) == 0x10:          # format international
        chiffres = "+" + chiffres
    return chiffres, i


def _horodatage(octets, i):
    """Date du centre SMS : 7 octets, chiffres par paires inversées, le
    dernier octet portant le décalage horaire par quarts d'heure."""
    valeurs = []
    for octet in octets[i:i + 7]:
        valeurs.append((octet & 0x0F) * 10 + (octet >> 4))
    i += 7
    if len(valeurs) < 7:
        return None, i
    annee, mois, jour, heure, minute, seconde, quarts = valeurs
    negatif = bool(octets[i - 1] & 0x08)
    quarts = ((octets[i - 1] & 0x07) * 10) + (octets[i - 1] >> 4)
    decalage = timedelta(minutes=15 * quarts) * (-1 if negatif else 1)
    try:
        return datetime(2000 + annee, mois, jour, heure, minute, seconde,
                        tzinfo=timezone(decalage)), i
    except ValueError:
        return None, i


def _entete_decoupe(udh):
    """(référence, total, position) si le message est découpé, sinon None."""
    i = 0
    while i + 1 < len(udh):
        identifiant, longueur = udh[i], udh[i + 1]
        valeur = udh[i + 2:i + 2 + longueur]
        if identifiant == CONCAT_8BITS and len(valeur) >= 3:
            return valeur[0], valeur[1], valeur[2]
        if identifiant == CONCAT_16BITS and len(valeur) >= 4:
            return (valeur[0] << 8) | valeur[1], valeur[2], valeur[3]
        i += 2 + longueur
    return None


def decoder(pdu_hexa):
    """Un PDU hexadécimal → Morceau. Lève ErreurPDU si illisible."""
    brut = (pdu_hexa or "").strip().replace(" ", "")
    if not brut or not RE_HEXA_PDU.match(brut) or len(brut) % 2:
        raise ErreurPDU("PDU illisible")
    try:
        octets = bytes.fromhex(brut)
    except ValueError as e:
        raise ErreurPDU(str(e))

    try:
        i = 1 + octets[0]                       # on saute le centre SMS
        premier = octets[i]
        i += 1
        expediteur, i = _adresse(octets, i)
        i += 1                                  # protocole (TP-PID)
        codage = octets[i]
        i += 1
        horodatage, i = _horodatage(octets, i)
        longueur = octets[i]
        i += 1
        donnees = octets[i:]
    except IndexError:
        raise ErreurPDU("PDU tronqué")

    avec_entete = bool(premier & 0x40)
    decoupe = None
    if avec_entete and donnees:
        taille_udh = donnees[0]
        decoupe = _entete_decoupe(donnees[1:1 + taille_udh])
    else:
        taille_udh = -1                          # aucun en-tête

    alphabet = codage & 0x0C
    if alphabet == 0x08:                         # UCS2
        utiles = donnees[taille_udh + 1:] if avec_entete else donnees
        texte = utiles[:longueur].decode("utf-16-be", errors="replace")
    elif alphabet == 0x00:                       # alphabet GSM 7 bits
        saut = 0
        if avec_entete:
            octets_udh = taille_udh + 1
            saut = -(-octets_udh * 8 // 7)       # arrondi supérieur
        texte = texte_gsm7(septets(donnees, longueur, saut))
    else:                                        # 8 bits : rare, latin-1
        utiles = donnees[taille_udh + 1:] if avec_entete else donnees
        texte = utiles[:longueur].decode("latin-1", errors="replace")

    if decoupe:
        reference, total, position = decoupe
        return Morceau(expediteur, texte, horodatage, reference, total, position)
    return Morceau(expediteur, texte, horodatage)


# ---- recollage -------------------------------------------------------------
def recoller(morceaux, maintenant=None):
    """[(index_pdu, Morceau)] → [(indices, expéditeur, texte, complet)].

    Les morceaux d'un même message sont réunis dans l'ordre. Un message dont
    il manque une partie est retenu — sauf s'il attend depuis trop longtemps :
    mieux vaut alors livrer ce qu'on a, signalé comme incomplet, que de le
    garder indéfiniment.

    `indices` liste TOUS les emplacements à effacer dans le modem, pour qu'un
    morceau ne reste jamais orphelin.
    """
    maintenant = maintenant or datetime.now(timezone.utc)
    seuls, groupes = [], {}

    for index, morceau in morceaux:
        if morceau.entier:
            seuls.append(([index], morceau.expediteur, morceau.texte, True))
        else:
            cle = (morceau.expediteur, morceau.reference, morceau.total)
            groupes.setdefault(cle, []).append((index, morceau))

    for (expediteur, _, total), parties in groupes.items():
        parties.sort(key=lambda p: p[1].position)
        indices = [index for index, _ in parties]
        recus = {m.position for _, m in parties}
        complet = len(recus) == total

        if not complet and not _trop_vieux(parties, maintenant):
            continue                             # on attend encore la suite

        texte = "".join(m.texte for _, m in parties)
        if not complet:
            manquants = sorted(set(range(1, total + 1)) - recus)
            texte += (f"\n\n[⚠️ message incomplet : morceau(x) "
                      f"{', '.join(map(str, manquants))} sur {total} "
                      f"jamais reçu(s)]")
        seuls.append((indices, expediteur, texte, complet))

    return seuls


def _trop_vieux(parties, maintenant):
    """A-t-on assez attendu les morceaux manquants ?"""
    dates = [m.horodatage for _, m in parties if m.horodatage]
    if not dates:
        return False          # sans date, on préfère attendre le tour suivant
    return maintenant - max(dates) > PATIENCE_MORCEAUX
