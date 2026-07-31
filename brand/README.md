# brand/ — les fichiers de la marque TOTEM

La charte complète : [`docs/IDENTITE.md`](../docs/IDENTITE.md).

Tous les fichiers sont des **SVG vectorisés** : le mot « TOTEM » y est un
tracé, pas du texte. Ils s'affichent donc à l'identique partout, sans que
DM Sans ait besoin d'être installée.

## Symbole seul

| Fichier | Quand |
|---|---|
| `totem-symbole.svg` | Sur fond clair. Encre `#16171a`. |
| `totem-symbole-reserve.svg` | Sur fond sombre. Clair `#fbfbfc`. |
| `totem-symbole-mono.svg` | `currentColor` — hérite de la couleur du texte. À préférer dans du code. |
| `totem-symbole-mini.svg` | **En dessous de 20 px.** Silhouette sans les incisions, qui se boucheraient. |

## Verrouillages

| Fichier | Quand |
|---|---|
| `totem-logo.svg` | Référence. Par défaut, partout, sur fond clair. |
| `totem-logo-reserve.svg` | Le même, sur fond sombre. |
| `totem-logo-mono.svg` | `currentColor`. |
| `totem-logo-vertical.svg` | Formats étroits ou carrés. |
| `totem-logo-vertical-reserve.svg` | Le même, sur fond sombre. |

## Icônes applicatives

| Fichier | Quand |
|---|---|
| `totem-icone-app.svg` | Tuile 512 px, coins arrondis. Écran d'accueil, boutique. Le symbole n'occupe que 60 % du carré : la tuile survit au rognage rond ou en goutte d'Android. |
| `totem-icone-app-ronde.svg` | Variante ronde : avatar, badge. |
| `totem-favicon.svg` | 32 px, tracé simplifié. Copié dans `web/app/icon.svg`. |

## Aperçus PNG

`totem-logo.png` et `totem-symbole.png` : à coller dans un document, un
courriel, une présentation — partout où le SVG n'entre pas. Fond transparent.

## Comment ça se régénère

Tout sort de deux scripts. Le symbole est décrit une seule fois, en
coordonnées de grille, dans `generer.py`.

```sh
pip install fonttools
python3 brand/generer.py       # les SVG (le mot est vectorisé depuis DM Sans Bold)
node    brand/generer-png.mjs  # les PNG et les icônes de l'application web
```

`generer.py` télécharge la police lui-même : aucun fichier produit ne dépend
d'une police installée sur la machine.

`generer-png.mjs` écrit directement dans l'application web :

```
web/app/apple-icon.png     180 px   (Apple exige du PNG)
web/public/icone-192.png   192 px   tuile masquable
web/public/icone-512.png   512 px   tuile masquable
```

`web/app/icon.svg` est une copie conforme de `totem-favicon.svg`, à refaire à
la main si le symbole bouge :

```sh
cp brand/totem-favicon.svg web/app/icon.svg
```

## Le symbole vit à deux endroits

1. **`brand/generer.py`** — la source, qui fait autorité.
2. **`web/app/marque.tsx`** — le portage React, qui recopie les mêmes tracés.

Une retouche se fait dans `generer.py`, puis se reporte dans `marque.tsx`.
Jamais l'inverse, jamais dans un seul des deux.

## Ce qu'on n'a pas le droit d'en faire

Dégradé, ombre portée, biseau, déformation, recomposition du mot dans une
autre police, coloration en jaune MTN ou en orange Orange, variation du nombre
d'incisions. Le détail — et les raisons — dans
[`docs/IDENTITE.md`](../docs/IDENTITE.md), section 5.
