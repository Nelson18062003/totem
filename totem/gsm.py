# -*- coding: utf-8 -*-
"""Encodage/décodage des textes USSD et SMS.

Trois représentations peuvent sortir d'un SIM7600, selon le jeu de caractères
du modem (AT+CSCS) et le codage choisi par le réseau (le champ DCS de +CUSD) :

  - texte lisible tel quel        (AT+CSCS="GSM", réseau en alphabet latin)
  - hexadécimal UCS2              (AT+CSCS="UCS2" — 4 chiffres hexa par caractère)
  - hexadécimal GSM 7 bits packé  (certains firmwares renvoient le brut du réseau)

Le troisième cas est le piège : lu comme de l'UCS2 il produit des idéogrammes,
laissé tel quel il produit un mur de chiffres hexadécimaux. C'est une cause
classique de menus opérateur illisibles. On décide donc avec le DCS quand il
est disponible, et on tranche sinon en notant la plausibilité de chaque
lecture — un menu Mobile Money est fait de lettres latines, de chiffres et de
ponctuation, jamais d'idéogrammes.
"""

import re

# Alphabet GSM 03.38 (128 positions). L'ordre est normatif : ne pas trier.
ALPHABET_GSM = (
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§"
    "¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
# Caractères atteints par la séquence d'échappement 0x1B.
EXTENSION_GSM = {0x0A: "\f", 0x14: "^", 0x28: "{", 0x29: "}", 0x2F: "\\",
                 0x3C: "[", 0x3D: "~", 0x3E: "]", 0x40: "|", 0x65: "€"}
ECHAPPEMENT = 0x1B

RE_HEXA = re.compile(r"\A[0-9A-Fa-f]+\Z")
# Ce qu'un menu d'opérateur contient légitimement.
RE_PLAUSIBLE = re.compile(r"[\w \n\r\t.,;:!?'\"()\[\]{}<>/\\@#%&*+=~^$£€¥°|-]", re.UNICODE)
SEUIL_PLAUSIBILITE = 0.9


def _est_hexa(texte):
    t = (texte or "").strip()
    return len(t) >= 2 and len(t) % 2 == 0 and RE_HEXA.match(t) is not None


def semble_hexa_ucs2(texte):
    """Un payload UCS2 arrive en hexadécimal pur, longueur multiple de 4."""
    t = (texte or "").strip()
    return len(t) >= 4 and len(t) % 4 == 0 and RE_HEXA.match(t) is not None


def plausibilite(texte):
    """Part de caractères attendus dans un texte d'opérateur, entre 0 et 1.
    Sert d'arbitre quand le DCS ne dit pas comment lire la charge utile."""
    if not texte:
        return 0.0
    return len(RE_PLAUSIBLE.findall(texte)) / len(texte)


# ---- UCS2 -----------------------------------------------------------------
def decode_ucs2(texte_hexa):
    try:
        return bytes.fromhex(texte_hexa.strip()).decode("utf-16-be")
    except (ValueError, UnicodeDecodeError):
        return ""


def encode_ucs2(texte):
    return texte.encode("utf-16-be").hex().upper()


# ---- GSM 7 bits packé ------------------------------------------------------
def depaqueter_septets(octets):
    """Déballe des septets tassés dans des octets (7 caractères par 8 octets)."""
    septets, reste, bits = [], 0, 0
    for octet in octets:
        septets.append(((octet << bits) | reste) & 0x7F)
        reste = octet >> (7 - bits)
        bits += 1
        if bits == 7:
            septets.append(reste & 0x7F)
            reste, bits = 0, 0
    return septets


def decode_gsm7(texte_hexa):
    """Hexadécimal d'un GSM 7 bits packé → texte."""
    try:
        octets = bytes.fromhex(texte_hexa.strip())
    except ValueError:
        return ""
    septets = depaqueter_septets(octets)
    # Le bourrage final produit souvent un retour chariot parasite.
    while septets and septets[-1] == 0x0D:
        septets.pop()
    sortie, echappe = [], False
    for septet in septets:
        if echappe:
            sortie.append(EXTENSION_GSM.get(septet, " "))
            echappe = False
        elif septet == ECHAPPEMENT:
            echappe = True
        else:
            sortie.append(ALPHABET_GSM[septet])
    return "".join(sortie)


# ---- arbitrage -------------------------------------------------------------
def alphabet_du_dcs(dcs):
    """Alphabet annoncé par le champ DCS de +CUSD (3GPP 23.038), ou None.

    Les valeurs vues en pratique : 0 et 15 → alphabet GSM par défaut,
    72 (0x48) et 68 (0x44) → UCS2."""
    if dcs is None:
        return None
    if dcs in (0, 15):
        return "gsm7"
    groupe = dcs & 0x0C
    if groupe == 0x08:
        return "ucs2"
    if groupe == 0x00:
        return "gsm7"
    return None


def decode_auto(texte, dcs=None):
    """Décode une charge utile +CUSD/+CMGL. Ne renvoie jamais d'exception :
    en dernier recours, le texte d'origine est rendu tel quel."""
    brut = (texte or "").strip()
    if not brut or not _est_hexa(brut):
        return texte          # déjà lisible (AT+CSCS="GSM")

    lectures = []
    if semble_hexa_ucs2(brut):
        lectures.append(("ucs2", decode_ucs2(brut)))
    lectures.append(("gsm7", decode_gsm7(brut)))
    lectures = [(nom, lecture) for nom, lecture in lectures if lecture]
    if not lectures:
        return texte

    # C'est la lecture la plus plausible qui gagne, pas celle annoncée : des
    # firmwares déclarent un codage et en renvoient un autre. Le DCS ne sert
    # qu'à départager deux lectures aussi crédibles l'une que l'autre.
    annonce = alphabet_du_dcs(dcs)
    nom, meilleure = max(
        lectures, key=lambda paire: (round(plausibilite(paire[1]), 3),
                                     paire[0] == annonce))
    return meilleure if plausibilite(meilleure) > 0 else texte
