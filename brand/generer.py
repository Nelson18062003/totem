#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenere tous les fichiers de la marque TOTEM.

    pip install fonttools
    python3 brand/generer.py

Le symbole est defini une seule fois ici, en coordonnees de grille. Le mot
« TOTEM » est vectorise depuis DM Sans Bold : le script telecharge la police,
en extrait les contours, applique l'interlettrage de la charte, et n'en garde
que des traces. Aucun fichier produit ne depend d'une police installee.

Les PNG (icones applicatives, apercus) se fabriquent a part, avec
`brand/generer-png.mjs`.

Voir docs/IDENTITE.md.
"""
import os
import urllib.request

RACINE = os.path.dirname(os.path.abspath(__file__))
POLICE_URL = ("https://fonts.gstatic.com/s/dmsans/v17/"
              "rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwARZthTg.ttf")
POLICE = os.path.join(RACINE, ".dmsans-700.ttf")

ENCRE, CLAIR = "#16171a", "#fbfbfc"

# --- Le symbole « Le Pilier » -------------------------------------------------
# Grille 32 x 32, contenu inscrit dans 26 x 26 (marge de 3 sur les 4 cotes).
# Angles saillants arrondis a 1,2 ; angles rentrants vifs.
FUT = ("M4.2 3H27.8A1.2 1.2 0 0 1 29 4.2V8.2A1.2 1.2 0 0 1 27.8 9.4H19.4V24.6H22"
       "A1.2 1.2 0 0 1 23.2 25.8V27.8A1.2 1.2 0 0 1 22 29H10A1.2 1.2 0 0 1 8.8 27.8"
       "V25.8A1.2 1.2 0 0 1 10 24.6H12.6V9.4H4.2A1.2 1.2 0 0 1 3 8.2V4.2"
       "A1.2 1.2 0 0 1 4.2 3Z")
# Deux incisions de 4,6 x 2. Elles s'arretent a 1,1 des bords du fut : une
# incision traversante couperait la silhouette et le T se lirait comme casse.
INCISIONS = ("M14.1 13.35H17.9A0.4 0.4 0 0 1 18.3 13.75V14.95A0.4 0.4 0 0 1 17.9 15.35"
             "H14.1A0.4 0.4 0 0 1 13.7 14.95V13.75A0.4 0.4 0 0 1 14.1 13.35Z"
             "M14.1 18.95H17.9A0.4 0.4 0 0 1 18.3 19.35V20.55A0.4 0.4 0 0 1 17.9 20.95"
             "H14.1A0.4 0.4 0 0 1 13.7 20.55V19.35A0.4 0.4 0 0 1 14.1 18.95Z")
SYMBOLE = FUT + INCISIONS      # a partir de 20 px
SYMBOLE_MINI = FUT             # en dessous de 20 px

# --- Proportions de la charte -------------------------------------------------
CAP = 20.0            # hauteur de capitale de reference
TRACKING = 0.18       # interlettrage du mot, en em
RATIO_H = 1.5         # hauteur du symbole / hauteur de capitale, verrouillage horizontal
RATIO_V = 2.0         # idem, verrouillage vertical
ECART = 0.7           # ecart symbole / mot, en hauteurs de capitale
PART_ICONE = 0.60     # part du carre occupee par le symbole dans une icone


def mot_vectorise():
    """Renvoie (trace, largeur) du mot TOTEM : capitale 20, ligne de base y=20."""
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.misc.transform import Transform

    if not os.path.exists(POLICE):
        print("telechargement de DM Sans Bold…")
        urllib.request.urlretrieve(POLICE_URL, POLICE)

    police = TTFont(POLICE)
    upm = police["head"].unitsPerEm
    echelle = CAP / police["OS/2"].sCapHeight
    glyphes, cmap, hmtx = police.getGlyphSet(), police.getBestCmap(), police["hmtx"]

    plume = SVGPathPen(glyphes, ntos=lambda v: f"{v:.2f}")
    x, ecart_lettres = 0.0, TRACKING * upm * echelle
    for caractere in "TOTEM":
        nom = cmap[ord(caractere)]
        # y inverse : la ligne de base tombe a y = CAP, la ligne de capitale a y = 0.
        glyphes[nom].draw(TransformPen(plume, Transform(echelle, 0, 0, -echelle, x, CAP)))
        x += hmtx[nom][0] * echelle + ecart_lettres
    return plume.getCommands(), x - ecart_lettres   # sans l'ecart final


def svg(largeur, hauteur, cadre, corps):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{cadre}" '
            f'width="{largeur}" height="{hauteur}" role="img" aria-label="TOTEM">\n'
            f'  <title>TOTEM</title>\n{corps}</svg>\n')


def ecrire(nom, contenu):
    open(os.path.join(RACINE, nom), "w").write(contenu)
    print("  ", nom)


def main():
    mot, mot_l = mot_vectorise()

    # 1. Symbole seul
    for nom, trace, couleur in [
        ("totem-symbole.svg", SYMBOLE, ENCRE),
        ("totem-symbole-reserve.svg", SYMBOLE, CLAIR),
        ("totem-symbole-mono.svg", SYMBOLE, "currentColor"),
        ("totem-symbole-mini.svg", SYMBOLE_MINI, "currentColor"),
    ]:
        ecrire(nom, svg(64, 64, "0 0 32 32",
                        f'  <path fill="{couleur}" fill-rule="evenodd" d="{trace}"/>\n'))

    # 2. Verrouillage horizontal
    h_sym = RATIO_H * CAP
    k = h_sym / 26.0                    # le contenu du symbole mesure 26 unites
    y_sym = CAP / 2 - h_sym / 2         # centrage optique sur la capitale
    x_mot = h_sym + ECART * CAP
    largeur = x_mot + mot_l
    # Le cadre va du haut du symbole a son bas, debordement du O compris.
    y_haut = min(y_sym, -0.4)
    hauteur = max(y_sym + h_sym, 20.4) - y_haut
    place_sym = f'translate({-3 * k:.3f},{-3 * k + y_sym:.3f}) scale({k:.5f})'

    def horizontal(couleur):
        return svg(round(largeur * 2), round(hauteur * 2),
                   f"0 {y_haut:.2f} {largeur:.2f} {hauteur:.2f}",
                   f'  <g fill="{couleur}" fill-rule="evenodd">\n'
                   f'    <path transform="{place_sym}" d="{SYMBOLE}"/>\n'
                   f'    <path transform="translate({x_mot},0)" d="{mot}"/>\n  </g>\n')

    ecrire("totem-logo.svg", horizontal(ENCRE))
    ecrire("totem-logo-reserve.svg", horizontal(CLAIR))
    ecrire("totem-logo-mono.svg", horizontal("currentColor"))

    # 3. Verrouillage vertical
    h_v = RATIO_V * CAP
    kv = h_v / 26.0
    x_v = mot_l / 2 - h_v / 2
    y_mot = h_v + ECART * CAP
    place_v = f'translate({-3 * kv + x_v:.3f},{-3 * kv:.3f}) scale({kv:.5f})'

    def vertical(couleur):
        h = y_mot + CAP
        return svg(round(mot_l * 2), round((h + 0.8) * 2),
                   f"0 -0.4 {mot_l:.2f} {h + 0.8:.2f}",
                   f'  <g fill="{couleur}" fill-rule="evenodd">\n'
                   f'    <path transform="{place_v}" d="{SYMBOLE}"/>\n'
                   f'    <path transform="translate(0,{y_mot})" d="{mot}"/>\n  </g>\n')

    ecrire("totem-logo-vertical.svg", vertical(ENCRE))
    ecrire("totem-logo-vertical-reserve.svg", vertical(CLAIR))

    # 4. Icones applicatives
    def icone(rayon, trace=SYMBOLE, taille=512):
        marge = (1 - PART_ICONE) * 16
        return svg(taille, taille, "0 0 32 32",
                   f'  <rect width="32" height="32" rx="{rayon}" fill="{ENCRE}"/>\n'
                   f'  <path fill="{CLAIR}" fill-rule="evenodd" '
                   f'transform="translate({marge:.2f},{marge:.2f}) scale({PART_ICONE})" '
                   f'd="{trace}"/>\n')

    ecrire("totem-icone-app.svg", icone(7.2))
    ecrire("totem-icone-app-ronde.svg", icone(16))
    ecrire("totem-favicon.svg", icone(6, trace=SYMBOLE_MINI, taille=32))

    print(f"\nlargeur du verrouillage horizontal : {largeur:.2f} (capitale {CAP:.0f})")


if __name__ == "__main__":
    main()
