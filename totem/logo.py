# -*- coding: utf-8 -*-
"""« La Tresse » : le symbole de la marque, posé sur un PDF.

Le tracé n'est pas recopié ici. Il est décrit une seule fois, dans
`brand/generer.py`, en coordonnées de grille — deux brins qui se croisent à
chaque registre et se rejoignent aux deux bouts. Ce module va le chercher là
où il est et le traduit pour le PDF. Le jour où la charte bouge, elle bouge en
un seul endroit.

Le tressage lui-même — quel brin passe dessus, quel brin passe dessous — se
fait par découpe : au croisement, le brin de dessous est interrompu sur la
largeur de l'autre. En SVG c'est un masque ; en PDF, un trou dans le contour
de découpe.
"""

import importlib.util
import math
import os

_charte = None


def charte():
    """Charge `brand/generer.py`, où qu'il se trouve.

    Le dossier `brand/` est installé à côté du paquet sur le Pi. S'il manque —
    installation partielle, dépôt tronqué — on le dit franchement plutôt que
    de dessiner un symbole approximatif.
    """
    global _charte
    if _charte is not None:
        return _charte

    ici = os.path.dirname(os.path.abspath(__file__))
    for racine in (os.path.dirname(ici), ici, "/opt/totem"):
        chemin = os.path.join(racine, "brand", "generer.py")
        if os.path.exists(chemin):
            specification = importlib.util.spec_from_file_location(
                "totem_charte", chemin)
            module = importlib.util.module_from_spec(specification)
            specification.loader.exec_module(module)
            _charte = module
            return _charte
    raise FileNotFoundError(
        "brand/generer.py est introuvable : le symbole de la marque y est "
        "décrit, et TOTEM ne le redessine pas de son côté.")


def brins():
    """[(tracé, découpes)] pour les deux brins, en coordonnées de la grille.

    Une découpe est un quadrilatère : le rectangle du croisement, déjà tourné
    dans l'axe du brin qui passe dessus.
    """
    g = charte()
    a, b = g._brins()
    traces = {"a": g._cambre(a, g.CAMBRURE), "b": g._cambre(b, g.CAMBRURE)}
    coupes = {"a": [], "b": []}

    registres = 2 * g.LOBES
    pas = (g.BAS - g.HAUT) / registres
    for rang, i in enumerate(range(2, registres, 2)):
        y = g.HAUT + pas * i
        dessus = "a" if rang % 2 == 0 else "b"
        dessous = "b" if dessus == "a" else "a"
        source = a if dessus == "a" else b
        angle = math.atan2(source[i + 1][1] - source[i - 1][1],
                           source[i + 1][0] - source[i - 1][0])
        longueur, largeur = g.BRIN * 3.2, g.BRIN + 2 * g.JEU
        coupes[dessous].append(_quadrilatere(g.CX, y, longueur, largeur, angle))

    return [(traces["a"], coupes["a"]), (traces["b"], coupes["b"])]


def _quadrilatere(cx, cy, longueur, largeur, angle):
    """Les quatre sommets du rectangle de découpe, tourné dans l'axe du brin."""
    cos, sin = math.cos(angle), math.sin(angle)
    sommets = []
    for dx, dy in ((-longueur / 2, -largeur / 2), (longueur / 2, -largeur / 2),
                   (longueur / 2, largeur / 2), (-longueur / 2, largeur / 2)):
        sommets.append((cx + dx * cos - dy * sin, cy + dx * sin + dy * cos))
    return sommets


def poser(page, x, y, cote, teinte):
    """Dépose le symbole dans un carré de `cote` points, coin haut gauche en
    (x, y). Le tracé occupe la grille de 32 de la charte, bord à bord."""
    g = charte()
    echelle = cote / g.GRILLE
    for trace, coupes in brins():
        # L'épaisseur s'exprime dans la grille : la transformation la
        # met déjà à l'échelle, la remultiplier l'y appliquerait deux fois.
        page.trace(trace, teinte, g.BRIN, echelle, x, y,
                   decoupes=coupes)


__all__ = ["brins", "charte", "poser"]
