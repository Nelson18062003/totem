#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenere tous les fichiers de la marque TOTEM.

    pip install fonttools
    python3 brand/generer.py

Le symbole — « La Tresse » — est decrit ici une seule fois, en coordonnees de
grille. Le mot est vectorise depuis DM Sans Bold : le script telecharge la
police, en extrait les contours, applique l'interlettrage de la charte, et
n'en garde que des traces. Aucun fichier produit ne depend d'une police
installee.

Les PNG se fabriquent a part, avec `brand/generer-png.mjs`.

Voir docs/IDENTITE.md.
"""
import math
import os
import urllib.request

RACINE = os.path.dirname(os.path.abspath(__file__))
POLICE_URL = ("https://fonts.gstatic.com/s/dmsans/v17/"
              "rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwARZthTg.ttf")
POLICE = os.path.join(RACINE, ".dmsans-700.ttf")

LATERITE, ENCRE, SABLE, CLAIR = "#9a4b2e", "#16171a", "#f4efe9", "#fbfbfc"

# --- Le symbole « La Tresse » -------------------------------------------------
# Deux brins qui se croisent a chaque registre et se rejoignent aux deux bouts.
# Entre deux croisements, le vide dessine un losange : le treillis nait du
# tressage, il n'est pas pose dessus.
GRILLE = 32
LOBES = 3          # nombre de losanges — fixe, quel que soit le nombre de comptes
CX = 16.0          # axe
AMP = 6.6          # ecart d'un brin a l'axe
BRIN = 4.8         # epaisseur d'un brin
HAUT, BAS = 4.4, 27.6
CAMBRURE = 0.7     # 0 = brin droit, 1 = brin corde
JEU = 1.15         # respiration au passage dessous


def _brins(lobes=None, cx=None, haut=None, bas=None):
    """Les deux polylignes. Elles coincident aux bornes paires : ce sont les
    croisements. Aux bornes impaires, chacune atteint son ecart maximal."""
    lobes = LOBES if lobes is None else lobes
    cx = CX if cx is None else cx
    haut = HAUT if haut is None else haut
    bas = BAS if bas is None else bas
    m = 2 * lobes
    h = (bas - haut) / m
    a, b = [], []
    for i in range(m + 1):
        y = haut + h * i
        if i % 2 == 0:
            a.append((cx, y)); b.append((cx, y))
        else:
            s = 1 if (i // 2) % 2 == 0 else -1
            a.append((cx + AMP * s, y)); b.append((cx - AMP * s, y))
    return a, b


def _cambre(pts, tension):
    """Catmull-Rom -> Bezier : arrondit les sommets, cambre les diagonales."""
    if tension <= 0 or len(pts) < 3:
        return "M" + "L".join(f"{x:.3f} {y:.3f}" for x, y in pts)
    p = [pts[0]] + list(pts) + [pts[-1]]
    d = [f"M{pts[0][0]:.3f} {pts[0][1]:.3f}"]
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) * tension / 3, p1[1] + (p2[1] - p0[1]) * tension / 3)
        c2 = (p2[0] - (p3[0] - p1[0]) * tension / 3, p2[1] - (p3[1] - p1[1]) * tension / 3)
        d.append(f"C{c1[0]:.3f} {c1[1]:.3f} {c2[0]:.3f} {c2[1]:.3f} "
                 f"{p2[0]:.3f} {p2[1]:.3f}")
    return "".join(d)


def symbole(prefixe, couleur="currentColor", tisse=True,
            lobes=None, cx=None, haut=None, bas=None):
    """Le symbole complet. `tisse=False` fond les deux brins : c'est la
    variante des petites tailles, ou les jours du tressage se boucheraient."""
    lobes = LOBES if lobes is None else lobes
    cx = CX if cx is None else cx
    haut = HAUT if haut is None else haut
    bas = BAS if bas is None else bas
    a, b = _brins(lobes, cx, haut, bas)
    da, db = _cambre(a, CAMBRURE), _cambre(b, CAMBRURE)
    trait = (f'fill="none" stroke="{couleur}" stroke-width="{BRIN}" '
             f'stroke-linecap="round" stroke-linejoin="round"')
    if not tisse:
        return f'  <path d="{da}" {trait}/>\n  <path d="{db}" {trait}/>\n'

    m, h = 2 * lobes, (bas - haut) / (2 * lobes)
    coupes = {"a": [], "b": []}
    for k, i in enumerate(range(2, m, 2)):
        y = haut + h * i
        dessus, dessous = ("a", "b") if k % 2 == 0 else ("b", "a")
        src = a if dessus == "a" else b
        ang = math.degrees(math.atan2(src[i + 1][1] - src[i - 1][1],
                                      src[i + 1][0] - src[i - 1][0]))
        lo, la = BRIN * 3.2, BRIN + 2 * JEU
        coupes[dessous].append(
            f'<rect x="{-lo/2:.2f}" y="{-la/2:.2f}" width="{lo:.2f}" '
            f'height="{la:.2f}" fill="#000" '
            f'transform="translate({cx:.2f},{y:.2f}) rotate({ang:.2f})"/>')
    x0, y0 = cx - AMP - BRIN, haut - BRIN
    masques = "".join(
        f'<mask id="{prefixe}{n}" maskUnits="userSpaceOnUse" x="{x0:.2f}" '
        f'y="{y0:.2f}" width="{2*AMP+2*BRIN:.2f}" height="{bas-haut+2*BRIN:.2f}">'
        f'<rect x="{x0:.2f}" y="{y0:.2f}" width="{2*AMP+2*BRIN:.2f}" '
        f'height="{bas-haut+2*BRIN:.2f}" fill="#fff"/>{"".join(coupes[n])}</mask>'
        for n in ("a", "b"))
    return (f'  <defs>{masques}</defs>\n'
            f'  <path d="{da}" {trait} mask="url(#{prefixe}a)"/>\n'
            f'  <path d="{db}" {trait} mask="url(#{prefixe}b)"/>\n')


# --- Proportions de la charte -------------------------------------------------
CAP = 20.0            # hauteur de capitale de reference
TRACKING = 0.18       # interlettrage du mot, en em
RATIO_H = 1.45        # hauteur du symbole / hauteur de capitale, verrouillage horizontal
RATIO_V = 2.1         # idem, verrouillage vertical
ECART = 0.78          # ecart symbole / mot, en hauteurs de capitale
PART_ICONE = 0.66     # part du carre occupee par le symbole dans une icone
SYM_H = 28.0          # hauteur reelle du trace dans la grille de 32
SYM_Y = 2.0           # ordonnee du haut du trace


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
        # y inverse : la ligne de base tombe a y = CAP, la capitale a y = 0.
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
    for nom, couleur, tisse, pref in [
        ("totem-symbole.svg", LATERITE, True, "s1"),
        ("totem-symbole-encre.svg", ENCRE, True, "s2"),
        ("totem-symbole-reserve.svg", CLAIR, True, "s3"),
        ("totem-symbole-mono.svg", "currentColor", True, "s4"),
        ("totem-symbole-mini.svg", "currentColor", False, "s5"),
    ]:
        ecrire(nom, svg(64, 64, f"0 0 {GRILLE} {GRILLE}", symbole(pref, couleur, tisse)))

    # 2. Verrouillage horizontal
    h_sym = RATIO_H * CAP
    k = h_sym / SYM_H
    y_sym = CAP / 2 - h_sym / 2         # centrage optique sur la capitale
    x_mot = GRILLE * k * 0 + (25.0 - 7.0) * k + ECART * CAP   # largeur du trace = 18
    largeur = x_mot + mot_l
    y_haut = min(y_sym, -0.4)
    hauteur = max(y_sym + h_sym, 20.4) - y_haut
    # le trace commence a x=7 et y=2 dans la grille de 32
    place = f'translate({-7*k:.3f},{-SYM_Y*k + y_sym:.3f}) scale({k:.5f})'

    def horizontal(couleur_sym, couleur_mot, pref):
        return svg(round(largeur * 2), round(hauteur * 2),
                   f"0 {y_haut:.2f} {largeur:.2f} {hauteur:.2f}",
                   f'  <g transform="{place}">\n{symbole(pref, couleur_sym)}  </g>\n'
                   f'  <path fill="{couleur_mot}" transform="translate({x_mot:.2f},0)" '
                   f'd="{mot}"/>\n')

    ecrire("totem-logo.svg", horizontal(LATERITE, ENCRE, "h1"))
    ecrire("totem-logo-encre.svg", horizontal(ENCRE, ENCRE, "h2"))
    ecrire("totem-logo-reserve.svg", horizontal(CLAIR, CLAIR, "h3"))
    ecrire("totem-logo-mono.svg", horizontal("currentColor", "currentColor", "h4"))

    # 3. Verrouillage vertical
    h_v = RATIO_V * CAP
    kv = h_v / SYM_H
    x_v = mot_l / 2 - (18 * kv) / 2
    y_mot = h_v + ECART * CAP
    place_v = f'translate({-7*kv + x_v:.3f},{-SYM_Y*kv:.3f}) scale({kv:.5f})'

    def vertical(couleur_sym, couleur_mot, pref):
        h = y_mot + CAP
        return svg(round(mot_l * 2), round((h + 0.8) * 2),
                   f"0 -0.4 {mot_l:.2f} {h + 0.8:.2f}",
                   f'  <g transform="{place_v}">\n{symbole(pref, couleur_sym)}  </g>\n'
                   f'  <path fill="{couleur_mot}" transform="translate(0,{y_mot:.2f})" '
                   f'd="{mot}"/>\n')

    ecrire("totem-logo-vertical.svg", vertical(LATERITE, ENCRE, "v1"))
    ecrire("totem-logo-vertical-reserve.svg", vertical(CLAIR, CLAIR, "v2"))

    # 4. Icones applicatives
    def icone(rayon, pref, tisse=True, taille=512, fond=ENCRE, sym=SABLE):
        m = (1 - PART_ICONE) * GRILLE / 2
        return svg(taille, taille, f"0 0 {GRILLE} {GRILLE}",
                   f'  <rect width="{GRILLE}" height="{GRILLE}" rx="{rayon}" '
                   f'fill="{fond}"/>\n'
                   f'  <g transform="translate({m:.2f},{m:.2f}) scale({PART_ICONE})">\n'
                   f'{symbole(pref, sym, tisse)}  </g>\n')

    ecrire("totem-icone-app.svg", icone(7.2, "i1"))
    ecrire("totem-icone-app-ronde.svg", icone(16, "i2"))
    ecrire("totem-icone-app-laterite.svg", icone(7.2, "i3", fond=LATERITE, sym=SABLE))
    ecrire("totem-favicon.svg", icone(6, "i4", tisse=False, taille=32))

    # 5. Le motif — le meme tressage, repete : une claustra.
    #    Les colonnes voisines sont decalees d'un demi-lobe : les losanges
    #    s'imbriquent, comme sur un mur ajoure.
    pas_x, lobes_m, colonnes = 2 * AMP + BRIN, 7, 6
    demi = (BAS - HAUT) / LOBES / 2
    champ, largeur_m = [], pas_x * colonnes
    hauteur_m = (BAS - HAUT) / LOBES * lobes_m
    for c in range(colonnes):
        decal = demi if c % 2 else 0
        champ.append(symbole(f"m{c}", LATERITE, True, lobes=lobes_m,
                             cx=pas_x * (c + 0.5),
                             haut=-demi * 2 - decal,
                             bas=hauteur_m + demi * 2 - decal))
    ecrire("totem-motif.svg", svg(
        512, round(512 * hauteur_m / largeur_m),
        f"0 0 {largeur_m:.2f} {hauteur_m:.2f}",
        f'  <rect width="{largeur_m:.2f}" height="{hauteur_m:.2f}" fill="{SABLE}"/>\n'
        + "".join(champ)))

    # 6. La tuile — une periode du tressage, raccordable a l'infini.
    #    Le tressage se repete tous les deux lobes (c'est la periode de
    #    l'alternance dessus-dessous) ; on dessine large et on rogne.
    lobe = (BAS - HAUT) / LOBES
    periode, colonne = lobe * 2, 2 * AMP + BRIN
    ecrire("totem-motif-tuile.svg", svg(
        round(colonne * 8), round(periode * 8),
        f"{CX - colonne/2:.3f} 0 {colonne:.3f} {periode:.3f}",
        f'  <defs><clipPath id="tuile"><rect x="{CX - colonne/2:.3f}" y="0" '
        f'width="{colonne:.3f}" height="{periode:.3f}"/></clipPath></defs>\n'
        f'  <g clip-path="url(#tuile)">\n'
        f'{symbole("t1", LATERITE, True, lobes=6, haut=-periode, bas=periode * 2)}'
        f'  </g>\n'))

    print(f"\ntrace du symbole : 18 x {SYM_H:.0f} dans une grille de {GRILLE}")
    print(f"verrouillage horizontal : {largeur:.2f} de large (capitale {CAP:.0f})")


if __name__ == "__main__":
    main()
