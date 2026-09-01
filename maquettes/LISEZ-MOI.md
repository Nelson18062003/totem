# Les maquettes

Les 25 écrans dessinés avant d'être construits. Ils vivaient dans un dossier
temporaire ; ils sont ici parce qu'un dossier temporaire disparaît, et qu'un
écran redessiné de mémoire n'est jamais le même.

**Ce sont des références, pas du code en service.** Rien ici n'est compilé,
rien n'est déployé. Ce qui tourne est dans `web/`.

## Ce qu'il y a

| Fichier | L'écran |
|---|---|
| `C1-invitation` | « Untel vous donne une clé de sa boutique » |
| `C2-code` | Les six chiffres reçus par mail |
| `C3-facon` | « Comment voulez-vous entrer, désormais ? » |
| `C4-papier` | Les dix codes à imprimer |
| `C5-entree` | L'entrée de tous les jours |
| `C6-refus` | Les quatre façons dont la porte refuse |
| `C7-comptoir` | L'accueil, selon le rôle |
| `C8-retour` | « Je n'arrive plus à entrer » |
| `C9-les-gens` | Les gens du commerce, et leurs clés |
| `C10-messages` | Les messages que TOTEM envoie |
| `A1` à `A7` | La porte du super-administrateur |
| `1-fleet` à `8-mobile` | La console de la plateforme |

## Les fichiers communs

- **`systeme.css`** — les jetons et les utilitaires partagés par toutes les
  maquettes. Il ne s'agit PAS de la charte de l'application : celle-ci vit
  dans `web/app/globals.css`, et c'est elle qui fait foi.
- **`sprite.html`** — le symbole de la marque. Il découle de `brand/generer.py`
  et ne se redessine jamais à la main (voir `docs/IDENTITE.md`).
- **`chrome.html`**, **`barre-droite.html`** — les gabarits communs.
- **`galerie.html`** — tout voir d'un coup.

## Les documents qui gouvernent

- **`NORMES.md`** — les dimensions, les contrastes, les cibles tactiles. Ce
  n'est pas un avis : `outils/mesure.mjs` le vérifie au pixel.
- **`CAS-LIMITES.md`** — le catalogue des situations tordues, avec pour
  chacune un verdict ÉCRAN / RÈGLE / HUMAIN.
- **`ARBITRAGES-PORTE.md`** — les quatre décisions de la porte super-admin.
- **`FICHE-CRAFT.md`**, **`BRIEF-V2.md`**, **`HISTOIRE.md`** — le pourquoi.

## Les outils

`outils/mesure.mjs` mesure un écran et refuse ce qui sort des normes.
`outils/inspecter.mjs` et `outils/inspecter-porte.mjs` relisent la cohérence
entre écrans. Ils tournent sur les maquettes, pas sur l'application.

## Attention

Un écran construit n'est pas tenu de copier sa maquette au pixel. La maquette
a été dessinée sans base de données ; la réalité impose des états que le
dessin ignore — vide, en attente, en panne, hors ligne. **La maquette dit
l'intention. Le code dit la vérité.** Quand les deux divergent, c'est le code
qui est relu, et la maquette qui est corrigée ou abandonnée.
