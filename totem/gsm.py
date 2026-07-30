# -*- coding: utf-8 -*-
"""Encodage/décodage des textes USSD et SMS (GSM 7 bits / UCS2)."""

import re


def semble_hexa_ucs2(texte: str) -> bool:
    """Un payload UCS2 arrive en hexadécimal pur, longueur multiple de 4."""
    t = texte.strip()
    return len(t) >= 4 and len(t) % 4 == 0 and re.fullmatch(r"[0-9A-Fa-f]+", t) is not None


def decode_ucs2(texte_hexa: str) -> str:
    try:
        return bytes.fromhex(texte_hexa.strip()).decode("utf-16-be")
    except (ValueError, UnicodeDecodeError):
        return texte_hexa


def encode_ucs2(texte: str) -> str:
    return texte.encode("utf-16-be").hex().upper()


def decode_auto(texte: str) -> str:
    """Décode une charge utile +CUSD/+CMGL : UCS2 hexa si détecté, sinon tel quel."""
    if semble_hexa_ucs2(texte):
        decode = decode_ucs2(texte)
        # Garde le décodage seulement s'il produit du texte plausible
        if any(c.isprintable() for c in decode):
            return decode
    return texte
