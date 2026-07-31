# Identité TOTEM

> Le totem reste au pays ; à travers lui, vous agissez à distance.

Ce document est la charte. Il dit ce qu'est la marque, comment on la dessine,
et surtout ce qu'on n'a pas le droit d'en faire. Les fichiers sont dans
[`brand/`](../brand/) ; les jetons de couleur et de typographie vivent dans
[`web/app/globals.css`](../web/app/globals.css).

---

## 1. L'idée

TOTEM n'est pas une application de paiement de plus. C'est un **objet resté au
pays**, planté à Douala, à travers lequel son propriétaire agit depuis
n'importe où. Trois traits fondent tout le reste :

| Trait | Ce que ça veut dire | Ce que ça impose au design |
|---|---|---|
| **Planté** | L'objet ne bouge pas. C'est sa raison d'être. | Une marque stable, verticale, posée sur une base. Rien qui flotte. |
| **Traversé** | On agit *à travers* lui, on ne le manipule pas. | Sobriété : l'interface est un passage, pas un spectacle. |
| **Gardien** | Le PIN n'est jamais stocké, aucun port n'est ouvert. | Une forme dense, fermée, sans transparence ni brillance. |

Le nom porte déjà l'image : un totem est une pièce **verticale**, **gravée**,
**empilée**, plantée à l'entrée. Le symbole ne fait que la dessiner.

---

## 2. Le symbole — « Le Pilier »

![Le symbole](../brand/totem-symbole.svg)

Un **T** dont le fût porte **deux incisions** et repose sur un **socle évasé**.

Trois lectures, dans cet ordre :

1. **Un T** — l'initiale. C'est ce qu'on voit à 16 px, et c'est suffisant.
2. **Une colonne gravée** — chapiteau, fût incisé, socle : la silhouette d'un
   totem vue de face. C'est ce qui apparaît à partir de 20 px.
3. **Un empilement** — les incisions découpent le fût en trois bandes, comme
   les figures superposées d'un mât. Elles rappellent aussi qu'il y a
   **plusieurs comptes empilés dans un seul objet** (un modem par opérateur).

Le symbole ne varie **jamais** : le nombre d'incisions est fixe, quel que soit
le nombre de comptes branchés. Une marque qui change au gré des données n'est
plus une marque.

### Construction

Grille de **32 × 32**, contenu inscrit dans **26 × 26** (marge de 3 sur les
quatre côtés). Toutes les mesures sont en unités de grille.

```
   0        3                                  29    32
0  ┌────────────────────────────────────────────────┐
3  │        ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓         │  chapiteau : 26 × 6,4
   │        ┗━━━━━━━━━━┓         ┏━━━━━━━━┛         │
9,4│                   ┃         ┃                  │  fût : 6,8 de large
   │                   ┃  ▁▁▁▁▁  ┃                  │  incision 1 : 4,6 × 2
   │                   ┃  ▁▁▁▁▁  ┃                  │  incision 2 : 4,6 × 2
24,6│         ┏━━━━━━━━┛         ┗━━━━━━━━┓         │
   │         ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛         │  socle : 14,4 × 4,4
29 │                                                │
32 └────────────────────────────────────────────────┘
```

- **Rayon des angles saillants : 1,2.** Les angles rentrants restent vifs —
  c'est la règle des vraies lettres, pas des icônes.
- **Incisions : traversantes en largeur ? Non.** Elles s'arrêtent à 1,1 des
  bords du fût. Une incision qui touche le bord coupe la silhouette et le
  symbole se lit alors comme un T *cassé*. Elle doit rester une gravure.
- **Un seul tracé, règle `evenodd`.** Les incisions sont des trous, pas des
  formes blanches posées dessus : le symbole se peint donc dans n'importe
  quelle couleur, sur n'importe quel fond, sans réserve.

### Variante petite taille

Une incision mesure 2 unités de haut sur 32, soit **6,25 % de la taille
rendue**. En dessous de **20 px**, elle passe sous 1,25 px et se bouche sur un
écran non-retina. On sert alors `totem-symbole-mini.svg` : la même silhouette, la gravure
en moins. Le composant React `<Symbole/>` bascule tout seul au-dessous de 20.

**Taille minimale absolue : 16 px.**

---

## 3. Le mot

`TOTEM` s'écrit en **DM Sans Bold (700)**, **capitales**, interlettrage
**+0,18 em**.

L'interlettrage large est délibéré : il donne au mot une allure **lapidaire**,
d'inscription gravée dans la pierre. Il ne s'applique **qu'au nom de la
marque** — le jeton `--tracking-marque`. Partout ailleurs, les capitales
gardent l'interlettrage courant.

Les fichiers de `brand/` contiennent le mot **vectorisé** : ils ne dépendent
d'aucune police installée. Dans l'application, le mot reste du texte vivant
(composant `<Logo/>`), ce qui le laisse sélectionnable et accessible.

---

## 4. Les verrouillages

| Fichier | Usage |
|---|---|
| `totem-logo.svg` | Le verrouillage de référence. Par défaut, partout. |
| `totem-logo-vertical.svg` | Formats étroits ou carrés : couvertures, affiches, autocollant sur le boîtier. |
| `totem-symbole.svg` | Seul, quand le nom est déjà écrit à côté : favicon, avatar, en-tête d'app. |

**Proportions du verrouillage horizontal** (unité = hauteur de capitale) :

- hauteur du symbole = **1,5 ×** la hauteur de capitale,
- écart symbole ↔ mot = **0,7 ×**,
- le symbole est centré **optiquement sur la capitale**, pas sur la ligne de base.

Dans le verrouillage vertical, le symbole passe à **2 ×** la hauteur de
capitale et l'écart reste à 0,7 ×.

### Zone de protection

Aucun élément — texte, image, bord de page, bord de bouton — n'entre dans une
marge égale à **la moitié de la hauteur du symbole**, tout autour du
verrouillage.

### Tailles minimales

| | Écran | Impression |
|---|---|---|
| Verrouillage horizontal | 100 px de large | 25 mm |
| Verrouillage vertical | 60 px de large | 15 mm |
| Symbole seul | 16 px | 5 mm |

---

## 5. Ce qu'on ne fait pas

- ❌ **Recomposer le mot** dans une autre police, ou lui retirer son interlettrage.
- ❌ **Déformer** : le verrouillage se met à l'échelle proportionnellement, point.
- ❌ **Faire varier le nombre d'incisions** selon le nombre de comptes.
- ❌ **Poser un dégradé, une ombre portée, un biseau, une brillance.** Le symbole
  est un aplat mat. Toujours.
- ❌ **Le poser sur une photo chargée** sans aplat de protection.
- ❌ **Le colorer** autrement qu'en encre, en blanc, ou dans la couleur du texte
  courant. Jamais en jaune MTN, jamais en orange Orange.
- ❌ **Recréer le mot avec un T majuscule ordinaire** en guise de symbole : le
  symbole est un tracé précis, il ne s'improvise pas.
- ❌ **Enfermer le symbole dans un cercle ou un carré** ailleurs que dans les
  icônes applicatives fournies.

---

## 6. Couleurs

La règle tient en une ligne : **la couleur ne décore rien, elle porte un sens.**

### Neutres — la base de tout

| Jeton | Hex | Rôle | Contraste sur `surface` |
|---|---|---|---|
| `surface` | `#fbfbfc` | Fond de page | — |
| `surface-raised` | `#ffffff` | Cartes | — |
| `surface-2` | `#f2f3f5` | Champs, survol, puces | — |
| `surface-3` | `#e9eaee` | Séparateurs pleins, barres | — |
| `line` | `#e6e7eb` | Bordures fines | — |
| `ink` | `#16171a` | **Couleur de marque.** Texte principal. | 17,3:1 |
| `ink-soft` | `#5d5f68` | Texte secondaire | 6,2:1 |
| `ink-faint` | `#8e909a` | Texte tertiaire | 3,1:1 ⚠️ |

> ⚠️ `ink-faint` ne passe pas le seuil AA (4,5:1) pour du texte courant.
> Réservé aux mentions non essentielles en corps ≥ 18,66 px gras ou ≥ 24 px
> normal, ou aux éléments décoratifs. **Ne jamais y mettre un montant, un état
> ou une consigne.** À corriger si un jour ces libellés deviennent essentiels
> — `#71737d` passerait à 4,6:1.

### Accent — une seule, froide

| Jeton | Hex | Rôle | Contraste |
|---|---|---|---|
| `accent` | `#1f3a8a` | Bleu de garde. Liens, sélection, action principale. | 10,0:1 |
| `accent-hover` | `#182d6b` | Survol | — |
| `accent-soft` | `#eef1f8` | Fond d'état sélectionné | — |

**Pourquoi froid.** MTN est jaune, Orange est orange. Une marque chaude se
ferait avaler par ses propres opérateurs : chaque carte de compte porterait la
couleur d'un concurrent de la nôtre. TOTEM reste la **surface neutre** sur
laquelle ces deux couleurs se posent. C'est une décision stratégique, pas un
goût.

### Sémantique — désaturée

| Jeton | Hex | Rôle | Contraste |
|---|---|---|---|
| `positive` | `#17603f` | Crédit, encaissement | 7,3:1 |
| `negative` | `#8a2020` | Débit, sortie | 8,8:1 |
| `alert` | `#8a5a10` | Attention, file d'attente | 5,7:1 |

Sombres et mates, jamais vives. Un encaissement n'est pas une fête.

### Couleur de récit

| Jeton | Hex | Rôle | Contraste |
|---|---|---|---|
| `laterite` | `#9a4b2e` | Latérite de Douala. **Supports éditoriaux uniquement.** | 5,9:1 |

C'est la couleur de la terre sur laquelle le totem est planté : elle ancre la
marque quelque part. Autorisée sur une couverture de documentation, une page
de présentation, un filet éditorial. **Interdite dans l'application** : elle
n'est ni un état, ni une action, et elle n'a rien à y dire.

### Couleurs opérateur — ce sont des données

| Jeton | Hex | |
|---|---|---|
| `op-mtn` | `#ffcc00` | |
| `op-orange` | `#ff7900` | |

Elles n'appartiennent pas à TOTEM. Autorisées en **liseré, pastille ou point
de 4 px maximum**, pour distinguer deux comptes. Jamais en aplat de fond,
jamais en texte, jamais dans le logo.

---

## 7. Typographie

**Une seule famille : DM Sans.** Chargée par `next/font` — aucun appel réseau
au moment du rendu, aucun saut de mise en page.

| Graisse | Usage |
|---|---|
| 400 Regular | Corps de texte |
| 500 Medium | Libellés, éléments actifs |
| 600 SemiBold | Titres |
| 700 Bold | Le mot TOTEM, et lui seul |

### Échelle

| Jeton | Taille | Usage |
|---|---|---|
| `text-hero` | 2 → 2,75 rem | Le solde, et rien d'autre |
| `text-display` | 1,625 → 2 rem | Montants de compte |
| `text-title` | 1,375 rem | Titre de page |
| `text-heading` | 1,0625 rem | Titre de section |
| `text-body` | 0,9375 rem | Corps |
| `text-small` | 0,8125 rem | Annexe |
| `text-caption` | 0,75 rem | Étiquette |

### Deux règles fermes

1. **Les chiffres sont tabulaires.** Classe `.tabnums` sur tout montant, tout
   solde, tout numéro. Une colonne de montants doit s'aligner à la virgule.
2. **`letter-spacing: -0.011em` sur le corps.** DM Sans est un peu lâche par
   défaut ; ce resserrage lui donne sa densité. Ne pas le retirer.

---

## 8. Formes et icônes

**Rayons** — trois valeurs, pas quatre :
`--radius-card` 12 px · `--radius-btn` 8 px · `--radius-sm` 6 px.
Les pilules (`rounded-full`) sont réservées à la barre de navigation mobile et
aux pastilles d'état.

**Icônes** — jeu maison dans `web/app/icons.tsx` : trait de **1,5 px**, grille
**24 × 24**, extrémités et jointures arrondies, jamais de remplissage.

**Aucun emoji dans l'interface.** Un emoji est rendu par le système : il
change de dessin d'un téléphone à l'autre, et il fait basculer l'application du
côté du jouet. Le `🗿` du README est une licence éditoriale, pas un composant.

**Aucune ombre décorative.** Une seule ombre dans tout le système, celle de la
barre flottante mobile, et elle sert à établir un plan — pas à faire joli.

---

## 9. Ton

TOTEM parle **français**, à la deuxième personne du pluriel, à un propriétaire
qui n'est pas informaticien.

- **Dire l'objet, pas la technique.** « Le robot » plutôt que « le daemon ».
  « Le terminal est actif » plutôt que « heartbeat OK ».
- **Une phrase = une action.** Les guides d'installation tiennent en gestes
  numérotés (voir `FICHE-DOUALA.md`) parce qu'ils sont exécutés par quelqu'un
  qui a le carton ouvert devant lui.
- **Ne jamais dramatiser un incident.** « Le second modem ne répond plus, le
  premier continue » — un fait, une conséquence.
- **Le nom s'écrit TOTEM** en capitales dans les titres et l'interface, *totem*
  en minuscules quand on parle de l'objet physique.

---

## 10. Les fichiers

Tout est dans [`brand/`](../brand/). Voir le [README](../brand/README.md) pour
le détail fichier par fichier.

Les tracés sont générés depuis une source unique. Si le symbole doit bouger,
il bouge dans `brand/`, puis on reporte dans `web/app/marque.tsx` — jamais
l'inverse, et jamais dans un seul des deux.
