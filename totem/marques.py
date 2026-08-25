# -*- coding: utf-8 -*-
"""Les marques des opérateurs, posées sur un PDF.

Le dessin n'est pas recopié ici. Les deux logos sont décrits une seule fois,
dans `brand/marques-operateurs.json`, en tracés relevés des fichiers publiés
par les opérateurs — le carré au mot blanc d'Orange, l'ovale au sigle de MTN
(charte 2022). Ce module va les y chercher et les traduit pour le PDF ; la
plateforme lit le même fichier depuis `web/app/logos-operateurs.tsx`.

Même principe que « La Tresse » : un dessin vit à un seul endroit. Le jour où
un opérateur change de logo, il change dans un fichier, et le reçu, l'écran et
la maquette suivent ensemble.

Ce sont des marques de TIERS. Elles disent factuellement de quel réseau vient
l'opération — jamais que le document émane de l'opérateur : l'émetteur reste
TOTEM, seul, à gauche de l'en-tête.
"""

import json
import os

_marques = None


def marques():
    """Le fichier des marques, chargé une fois.

    Absent — installation partielle, dépôt tronqué — on le dit franchement
    plutôt que de dessiner un logo approximatif.
    """
    global _marques
    if _marques is not None:
        return _marques
    ici = os.path.dirname(os.path.abspath(__file__))
    for racine in (os.path.dirname(ici), ici, "/opt/totem"):
        chemin = os.path.join(racine, "brand", "marques-operateurs.json")
        if os.path.exists(chemin):
            with open(chemin, encoding="utf-8") as fichier:
                _marques = json.load(fichier)
            return _marques
    raise FileNotFoundError(
        "brand/marques-operateurs.json est introuvable : les logos des "
        "opérateurs y sont décrits, et TOTEM ne les redessine pas de son côté.")


def marque_de(operateur):
    """La marque d'un opérateur, ou None s'il n'en a pas de connue.

    On compare sur le DÉBUT du nom : « MTN MoMo », « MTN Cameroon » et « MTN »
    désignent le même réseau, et un opérateur inconnu ne reçoit pas le logo
    d'un autre.
    """
    nom = (operateur or "").strip().lower()
    if not nom:
        return None
    for cle, marque in marques().items():
        if nom.startswith(cle):
            return marque
    return None


def rapport(marque):
    """Largeur / hauteur de la marque, d'après sa zone de dessin."""
    _, _, largeur, hauteur = marque["voir"]
    return largeur / hauteur


def poser(page, marque, x, haut, hauteur):
    """Dépose la marque, coin haut gauche en (x, haut). Renvoie sa largeur.

    La zone de dessin du fichier officiel (« viewBox ») peut commencer
    ailleurs qu'à l'origine : celle de MTN part de (−128, −64), le fond
    débordant du sigle. On cale donc son coin sur (x, haut) plutôt que de
    supposer une origine à zéro.
    """
    vx, vy, vlargeur, vhauteur = marque["voir"]
    echelle = hauteur / vhauteur
    largeur = vlargeur * echelle
    page.rectangle(x, haut, largeur, hauteur, marque["fond"],
                   rayon=marque.get("rayon", 0) * echelle)
    page.remplir(marque["traces"], marque["encre"], echelle,
                 x - vx * echelle, haut - vy * echelle)
    return largeur


__all__ = ["marque_de", "marques", "poser", "rapport"]
