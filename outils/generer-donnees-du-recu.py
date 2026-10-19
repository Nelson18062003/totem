#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Les données que le reçu de la PLATEFORME emprunte au boîtier.

    python3 outils/generer-donnees-du-recu.py

Le reçu de la plateforme (`web/lib/recu-pdf.ts`) transcrit `totem/recu.py`.
Il lui faut ce que le boîtier lit dans le dépôt : « La Tresse » telle que
`totem/logo.py` la tire de `brand/generer.py` (les deux brins et leurs
découpes au croisement), les marques de `brand/marques-operateurs.json`, et
les deux fichiers DM Sans de `totem/polices/`.
Rien de cela ne se recopie à la main : ce script les écrit dans
`web/lib/recu-donnees.ts`, et `tests/test_recu_de_la_plateforme.py` exige
que le fichier soit à jour — une charte qui bouge d'un côté seulement ferait
deux reçus différents pour le même SMS.
"""

import base64
import json
import os
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RACINE)

from totem import logo  # noqa: E402

SORTIE = os.path.join(RACINE, "web", "lib", "recu-donnees.ts")


def contenu():
    g = logo.charte()
    brins = [{"trace": trace, "decoupes": [[[round(x, 6), round(y, 6)] for x, y in q] for q in coupes]}
             for trace, coupes in logo.brins()]
    with open(os.path.join(RACINE, "brand", "marques-operateurs.json"), encoding="utf-8") as f:
        marques = json.load(f)
    polices = {}
    for graisse in ("400", "700"):
        with open(os.path.join(RACINE, "totem", "polices", f"dmsans-{graisse}.ttf"), "rb") as f:
            polices[graisse] = base64.b64encode(f.read()).decode("ascii")
    return (
        "// FICHIER FABRIQUÉ par outils/generer-donnees-du-recu.py — ne pas modifier à la main.\n"
        "//\n"
        "// « La Tresse » (brand/generer.py, lue par totem/logo.py), les marques des réseaux\n"
        "// (brand/marques-operateurs.json) et les polices DM Sans (totem/polices/), pour que le reçu de la plateforme soit celui du boîtier.\n"
        "// tests/test_recu_de_la_plateforme.py exige qu'il soit à jour.\n\n"
        f"export const GRILLE = {json.dumps(g.GRILLE)};\n"
        f"export const EPAISSEUR_BRIN = {json.dumps(g.BRIN)};\n"
        f"export const BRINS: {{ trace: string; decoupes: [number, number][][] }}[] = {json.dumps(brins)};\n"
        f"export const MARQUES: Record<string, {{ nom: string; voir: [number, number, number, number]; rayon?: number; fond: string; encre: string; traces: string[] }}> = {json.dumps(marques, ensure_ascii=False)};\n"
        f"export const DM_SANS_400 = \"{polices['400']}\";\n"
        f"export const DM_SANS_700 = \"{polices['700']}\";\n"
    )


if __name__ == "__main__":
    texte = contenu()
    if "--verifier" in sys.argv:
        with open(SORTIE, encoding="utf-8") as f:
            sys.exit(0 if f.read() == texte else 1)
    with open(SORTIE, "w", encoding="utf-8") as f:
        f.write(texte)
    print(f"✓ {os.path.relpath(SORTIE, RACINE)} ({len(texte) // 1024} Ko)")
