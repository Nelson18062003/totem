# brand/ — les fichiers de la marque TOTEM

La charte complète : [`docs/IDENTITE.md`](../docs/IDENTITE.md).

Le symbole est **« La Tresse »** : deux brins qui se croisent à chaque registre
et se rejoignent aux deux bouts. Entre deux croisements, le vide dessine un
losange.

Tous les fichiers sont des **SVG vectorisés** : le mot « TOTEM » y est un
tracé, pas du texte. Ils s'affichent à l'identique partout, sans que DM Sans
ait besoin d'être installée.

## Symbole seul

| Fichier | Quand |
|---|---|
| `totem-symbole.svg` | Sur fond clair. Latérite `#9A4B2E`. |
| `totem-symbole-encre.svg` | Quand la couleur est impossible : tampon, gravure, une seule encre. |
| `totem-symbole-reserve.svg` | Sur fond sombre. Sable clair. |
| `totem-symbole-mono.svg` | `currentColor` — hérite de la couleur du texte. À préférer dans du code. |
| `totem-symbole-mini.svg` | **En dessous de 22 px.** Les deux brins fondus : les jours du tressage se boucheraient. |

## Verrouillages

| Fichier | Quand |
|---|---|
| `totem-logo.svg` | Référence. Symbole latérite, mot encre. |
| `totem-logo-encre.svg` | Une seule couleur. |
| `totem-logo-reserve.svg` | Sur fond sombre. |
| `totem-logo-mono.svg` | `currentColor`. |
| `totem-logo-vertical.svg` | Formats étroits ou carrés. |
| `totem-logo-vertical-reserve.svg` | Le même, sur fond sombre. |

## Motif

| Fichier | Quand |
|---|---|
| `totem-motif.svg` | Un panneau fini : couverture, affiche, autocollant du boîtier. |
| `totem-motif-tuile.svg` | Une période du tressage, **raccordable à l'infini**. Copiée dans `web/public/motif.svg`, elle alimente la classe CSS `.claustra`. |

Le motif est de la marque, pas de la donnée : jamais derrière un montant.

## Icônes applicatives

| Fichier | Quand |
|---|---|
| `totem-icone-app.svg` | Tuile 512 px, fond encre. Écran d'accueil, boutique. Le symbole n'occupe que 66 % du carré : la tuile survit au rognage rond ou en goutte d'Android. |
| `totem-icone-app-laterite.svg` | Variante fond latérite. |
| `totem-icone-app-ronde.svg` | Variante ronde : avatar, badge. |
| `totem-favicon.svg` | 32 px, tracé fondu. Copié dans `web/app/icon.svg`. |

## PNG

Le jeu complet est dans **`brand/png/`** — à coller dans un document, un
courriel, une présentation, partout où le SVG n'entre pas.

| Fichier | Largeur |
|---|---|
| `totem-logo.png`, `-encre`, `-sur-sable`, `-reserve` | 2000 px |
| `totem-logo-vertical.png`, `-reserve` | 1200 px |
| `totem-symbole.png`, `-encre`, `-reserve`, `-mini` | 1024 px |
| `totem-icone-app.png`, `-laterite`, `-ronde` | 1024 px |
| `totem-favicon.png` | 512 px |
| `totem-motif.png` | 2000 px |
| `totem-motif-tuile.png` | 512 px |
| `planche-de-contact.png` | toutes les variantes d'un coup d'œil |

Fond **transparent** partout, sauf les variantes `-reserve` : un tracé clair
sur fond transparent est invisible là où on le colle, elles portent donc leur
fond encre incrusté.

## Comment ça se régénère

Le symbole est décrit **une seule fois**, en coordonnées de grille, en tête de
`generer.py`. Tout le reste en découle.

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

Deux copies conformes restent à refaire à la main si le symbole bouge :

```sh
cp brand/totem-favicon.svg     web/app/icon.svg
cp brand/totem-motif-tuile.svg web/public/motif.svg
```

## Le symbole vit à deux endroits

1. **`brand/generer.py`** — la source, qui fait autorité.
2. **`web/app/marque.tsx`** — le portage React, qui recopie les mêmes tracés.

Une retouche se fait dans `generer.py`, puis se reporte dans `marque.tsx`.
Jamais l'inverse, jamais dans un seul des deux.

## Ce qu'on n'a pas le droit d'en faire

Défaire le tressage, faire varier le nombre de losanges, poser le motif sous
des données, dégradé, ombre portée, déformation, recomposition du mot dans une
autre police, coloration en jaune MTN ou en orange Orange. Le détail — et les
raisons — dans [`docs/IDENTITE.md`](../docs/IDENTITE.md), section 6.
