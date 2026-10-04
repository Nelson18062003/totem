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
# La ponctuation TYPOGRAPHIQUE en fait partie : un opérateur qui code en UCS2
# le fait justement pour « … », « ’ », « « » » ou « → ». Absente d'ici, la
# bonne lecture d'une demande de code (« Entrez votre PIN… ») perdait contre
# un charabia GSM 7 bits, et le pavé du code ne s'ouvrait pas.
RE_PLAUSIBLE = re.compile(
    r"[\w \n\r\t.,;:!?'\"()\[\]{}<>/\\@#%&*+=~^$£€¥°|\-"
    "\u00a0\u00ab\u00bb\u2010-\u2027\u2030-\u205e\u2190-\u21ff\u2700-\u27bf"
    "\U0001f000-\U0001faff]", re.UNICODE)
# Ce qu'une lecture UCS2 FAUSSE produit : des idéogrammes, du hangul, de la
# zone privée. Un menu d'opérateur camerounais n'en contient jamais.
RE_IDEOGRAMME = re.compile("[\u3000-\u9fff\uac00-\ud7af\ue000-\uf8ff]")
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


def _lecture_ucs2_franche(brut):
    """La lecture UCS2, si elle a l'air d'un texte d'opérateur — sinon None.

    Sert quand le DCS ANNONCE l'UCS2 : on le croit, sauf si la lecture donne
    des idéogrammes ou des caractères de contrôle (un firmware qui déclare
    l'UCS2 et renvoie du GSM 7 bits tassé — voir `test_dcs_menteur_rattrape`)."""
    if not semble_hexa_ucs2(brut):
        return None
    lecture = decode_ucs2(brut)
    if not lecture:
        return None
    if any(ord(c) < 0x20 and c not in "\n\r\t" for c in lecture):
        return None
    if len(RE_IDEOGRAMME.findall(lecture)) * 2 > len(lecture):
        return None
    return lecture


def _texte_qui_se_lit_deja(brut):
    """En mode texte (AT+CSCS="GSM"), le modem livre le message LISIBLE. Une
    suite de chiffres est alors un nombre — un solde, un numéro, un code,
    « 00 » — jamais une charge codée : « 237677123456 » se lisait « #lÑΓAF ».
    Un mot court fait de lettres A à F (« CAFE ») non plus. Seule une longue
    suite hexadécimale, avec au moins une lettre, peut être le brut du
    réseau qu'un firmware aurait laissé passer."""
    return brut.isdigit() or len(brut) < 8


def decode_auto(texte, dcs=None, mode_texte=None):
    """Décode une charge utile +CUSD/+CMGL. Ne renvoie jamais d'exception :
    en dernier recours, le texte d'origine est rendu tel quel.

    `mode_texte` : vrai quand le modem est en AT+CSCS="GSM" (il livre le
    texte lisible), faux en UCS2, None quand on ne le sait pas."""
    brut = (texte or "").strip()
    if not brut or not _est_hexa(brut):
        return texte          # déjà lisible (AT+CSCS="GSM")

    annonce = alphabet_du_dcs(dcs)
    # LE DCS QUI ANNONCE L'UCS2 EST CRU, quand la lecture tient debout. La
    # plausibilité ne départage que ce que le DCS ne dit pas : « Entrez
    # votre PIN… » en UCS2 perdait contre son charabia GSM 7 bits, à cause
    # d'un seul « … ».
    if annonce == "ucs2":
        franche = _lecture_ucs2_franche(brut)
        if franche is not None:
            return franche
    if mode_texte and _texte_qui_se_lit_deja(brut):
        return texte

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
    nom, meilleure = max(
        lectures, key=lambda paire: (round(plausibilite(paire[1]), 3),
                                     paire[0] == annonce))
    return meilleure if plausibilite(meilleure) > 0 else texte


# ---- ce qui part au réseau ---------------------------------------------------
class ChargeRefusee(ValueError):
    """Une réponse qui ne peut pas partir telle quelle sur le réseau. Rien
    n'a été écrit au modem : la session, elle, n'a pas bougé."""

    def __init__(self, caracteres):
        super().__init__(caracteres)
        self.caracteres = caracteres


def charge_pour_le_reseau(texte):
    """La réponse telle qu'elle peut partir dans `AT+CUSD=1,"…",15`.

    - Les retours à la ligne et caractères de contrôle sont retirés : ils
      refermeraient la commande AT (défense contre l'injection).
    - Les chiffres d'une autre écriture (« ٥٠٠٠ », chiffres pleine largeur)
      deviennent des chiffres ordinaires : c'est le même nombre, et le réseau
      ne connaît que ceux-là. Ils partaient en octets UTF-8, sans aucun sens
      pour l'opérateur.
    - Tout le reste doit être un caractère imprimable ordinaire. Le
      guillemet et la barre oblique inverse sont REFUSÉS, pas retirés en
      silence : « \\22 » vaut un guillemet dans une commande AT (V.250), et
      changer ce que la personne a tapé sans le dire, sur un écran d'argent,
      serait pire qu'un refus. Rien n'est parti, on le dit, elle retape.
    """
    import unicodedata

    texte = re.sub(r"[\r\n\x00-\x1f\x7f]", "", texte or "")
    sortie, refuses = [], []
    for c in texte:
        if c.isdigit() and not c.isascii():
            try:
                sortie.append(str(unicodedata.digit(c)))
                continue
            except (TypeError, ValueError):
                pass
        normal = unicodedata.normalize("NFKC", c)
        if (len(normal) == 1 and normal.isascii() and normal.isprintable()
                and normal not in '"\\'):
            sortie.append(normal)
        else:
            refuses.append(c)
    if refuses:
        raise ChargeRefusee("".join(dict.fromkeys(refuses)))
    return "".join(sortie)
