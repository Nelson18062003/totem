# Le système TOTEM

> La précision ne vient pas du soin apporté à chaque bouton. Elle vient d'un
> système de contraintes écrit d'avance, auquel chaque bouton se soumet.

Ce document est la **source unique de vérité dimensionnelle**. Il complète
[`IDENTITE.md`](IDENTITE.md), qui dit ce qu'est la marque ; celui-ci dit à
quelles dimensions elle se construit. Les valeurs vivent dans
[`web/app/globals.css`](../web/app/globals.css) ; ce document dit comment on
les assemble.

**Personne n'invente une valeur.** Si une dimension manque ici, on l'ajoute
ici — on ne l'improvise pas dans un écran.

---

## 1. Les trois règles

### R1 — La grille de 4

Tout espacement, toute hauteur, toute taille d'icône est un multiple de 4 px.
L'échelle est **fermée à huit crans** :

| Cran Tailwind | 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16 |
|---|---|---|---|---|---|---|---|---|
| **px** | 4 | 8 | 12 | 16 | 24 | 32 | 48 | 64 |

Le pas suit l'amplitude : à 24 px, un écart de 4 px ne se voit plus, donc on ne
le propose pas. Aucun système de référence n'utilise une échelle linéaire — ni
Carbon, ni Atlassian, ni Radix, ni Primer.

**Les demi-crans sont interdits.** `py-2.5` vaut 10 px, `gap-1.5` vaut 6 px,
`px-3.5` vaut 14 px : des multiples de 2, jamais de 4. Ce sont eux qui
désalignaient les rangées de 2 px. Le 2 px n'existe que pour l'optique —
bordures et anneau de focus — jamais pour la mise en page.

### R2 — Une seule échelle de contrôle, plancher 44 px

| Jeton | px | Pour quoi |
|---|---|---|
| `h-controle` | **44** | Le défaut. Tout ce sur quoi on appuie. |
| `h-controle-fort` | **48** | Action primaire, action destructive. |
| `h-controle-compact` | 40 | Uniquement dans une barre déjà dense, **et seulement si la zone d'appui est étendue à 44 par ailleurs**. |

Pas de seconde densité pour la souris : la détection du type de pointeur n'est
pas fiable (hybrides, tablettes avec trackpad), et deux échelles échoueraient
en silence. Un contrôle de 44 px reste confortable au curseur ; un contrôle de
36 px est inutilisable au pouce.

Le 48 px n'est pas un caprice : 44 px valent 8,3 mm, soit 0,9 mm sous les
9,2 mm mesurés par Parhi *et al.* (MobileHCI 2006) pour une sélection discrète.
Ce qui coûte cher à rater mérite le cran au-dessus.

**Écart entre deux cibles : 8 px minimum**, et jamais moins de 24 px de centre
à centre (mécanisme de l'exception « espacement » de WCAG 2.5.8).

Cette règle vise le **cas dangereux** : deux cibles voisines qui déclenchent des
actions *différentes* et se touchent — viser une rangée et déclencher son bouton
de téléchargement. Elle ne vise pas les rangées contiguës d'une même liste ni
les éléments empilés d'un menu : là, chaque cible fait déjà 44 px, leurs centres
sont à 44 ou 48 px l'un de l'autre, et l'absence de gouttière est la forme même
d'une liste. Le contrôle adversarial a relevé ces cas-là ; ils sont conformes,
c'était la règle qui était écrite trop large.

### R3 — Un contrôle déclare sa hauteur

```tsx
// NON — la hauteur est une conséquence que personne n'a calculée
<button className="px-3.5 py-2.5 text-small">…</button>

// OUI — la hauteur est une décision, le contenu se centre dedans
<button className="flex h-controle items-center justify-center px-4">…</button>
```

C'est de la première forme que venaient les **neuf hauteurs de bouton
différentes dans un seul fichier** (24, 28, 30, 32, 34, 36, 38, 40, 44 px), et
le champ de 32 px collé à son bouton « OK » de 30 px — désalignés parce que
l'un portait une bordure et l'autre non.

---

## 2. Ce que dit la mesure

Relevé sur les 9 écrans avant refonte :

| | |
|---|---|
| Violations mesurées | **352** |
| Contrôles interactifs | 76 |
| … sous la cible de 44 px | **59** |
| … déclarant leur hauteur | **3** |
| Balises `<button>` écrites à la main | 50 |
| Composants de bouton partagés | **0** |
| Valeurs d'espacement distinctes | jusqu'à **16 par zone** |
| Tailles d'icône en circulation | **14, 15, 16, 18, 20, 22, 26** |

La cause racine n'était pas le désordre : c'est que les jetons typographiques
ne portaient **aucun interligne**. Sans hauteur de ligne déclarée, aucune
hauteur de contrôle n'est calculable — elle tombait de la métrique par défaut
de DM Sans. Les dimensions n'étaient pas irrespectées : elles n'étaient jamais
énoncées.

---

## 3. Typographie

Sept crans, chacun avec **son interligne**. Tous les interlignes fixes sont des
multiples de 4 : la grille survit jusque dans le texte.

| Jeton | Taille | Interligne | Graisse | Usage |
|---|---|---|---|---|
| `text-hero` | 32 → 44 fluide | 1,1 | 700 | Le solde, et rien d'autre |
| `text-display` | 26 → 32 fluide | 1,15 | 600 | Montants de compte |
| `text-title` | 22 | 28 | 600 | Titre de page |
| `text-heading` | 17 | 24 | 600 | Titre de section |
| `text-body` | **16** | 24 | 400 | **Le corps. Le défaut.** |
| `text-small` | **14** | 20 | 400/500 | Annexe : métadonnée, second rang |
| `text-caption` | 12 | 16 | 600 | Étiquette, en-tête de colonne |

Deux crans ont été remontés : le corps de 15 à 16, l'annexe de 13 à 14. La
charte nommait `text-small` « Annexe » ; l'interface s'en servait **117 fois**
contre 36 pour le corps. Le texte de lecture de l'application était donc
l'annexe, à 13 px — une valeur de densité bureau chez Material, une note de bas
de page chez Apple, et un cran que GOV.UK a purement supprimé.

**Deux règles fermes, inchangées :** chiffres tabulaires (`.tabnums`) sur tout
montant ; `letter-spacing: -0.011em` sur le corps.

**Longueur de ligne :** tout bloc de texte suivi porte `max-w-lecture` (68 ch).

---

## 4. Couleurs — ce qui a changé

La palette est celle de la charte. **Deux corrections**, toutes deux motivées
par un calcul, pas par un goût :

| Jeton | Avant | Après | Pourquoi |
|---|---|---|---|
| `ink-faint` | `#77726B` | **`#6B665F`** | L'ancien était annoté « 4,6:1, passe AA » — vrai sur le fond de page seulement. Sur un champ : 4,27. Sur le sable : 4,17. Sur une barre : 3,91. Le nouveau donne 4,66 au pire. |
| — | — | **`contour` `#85817A`** | Nouveau. `line` (`#E8E5E1`) vaut 1,26:1 : il ne peut pas porter le contour d'un champ ou d'un bouton, que WCAG 1.4.11 exige à 3:1. Le nouveau donne 3,18 au pire. |

> **Cette valeur a été calculée deux fois.** La première (`#8F8B84`) avait été
> éprouvée contre le blanc, le fond de page et `surface-2` — mais pas contre
> `surface-3`, qui est le fond d'un bouton secondaire **pressé**. Le contour y
> tombait à 2,78:1 : sous le seuil, au moment précis où l'on appuie dessus.
> C'est le contrôle adversarial qui l'a trouvé, en mesurant les couleurs
> réellement rendues. Le « au pire » d'une couleur se mesure sur **tous** les
> fonds où elle a le droit de se poser — y compris ceux qui n'existent que le
> temps d'un appui.

**Deux filets, et il faut choisir.** `border-line` sépare — décoratif, invisible,
et c'est très bien. `border-contour` affirme : « ceci est un champ », « ceci est
un bouton ». Toute bordure qui est le **seul** indice d'un contrôle est un
`contour`.

**On n'éteint jamais par l'opacité.** `disabled:opacity-40` sur du blanc donne
2,6:1 ; `opacity-30` donne 1,96:1. Un contrôle éteint prend `text-ink-eteint`
et `bg-surface-eteint` : inerte, mais lisible.

**La couleur ne porte jamais seule une information.** Crédit `#17603F` et débit
`#8A2020` sont à **1,21:1 l'un de l'autre** : en niveaux de gris, ils sont
indiscernables. Le signe `+` / `−` et le libellé sont obligatoires dans la
chaîne du montant.

---

## 5. Les six familles

Toutes les valeurs ci-dessous sont des jetons. Aucun nombre écrit à la main.

### 5.1 Boutons — `app/ui/bouton.tsx`

| Variante | Fond | Texte | Bordure | Hauteur |
|---|---|---|---|---|
| `primaire` | `bg-accent` | `text-sur-couleur` | aucune | `h-controle-fort` (48) |
| `secondaire` | `bg-surface-raised` | `text-ink` | `border-contour` 1 px | `h-controle` (44) |
| `discret` | transparent | `text-ink` | aucune | `h-controle` (44) |
| `danger` | `bg-negative` | `text-sur-couleur` | aucune | `h-controle-fort` (48) |
| `icone` | selon variante | — | selon variante | carré `size-controle` (44×44) |

**L'action principale est indigo**, pas noire. La charte le dit depuis le
début : « l'indigo porte l'action ». L'app peignait ses primaires en `bg-ink`.

Communs à toutes les variantes :

- Padding horizontal **`px-4`** (16 px). Rapport padding/hauteur = 0,36 —
  dans la fourchette 0,33–0,375 sur laquelle convergent Carbon, Primer,
  Polaris et Atlassian.
- Écart icône ↔ texte **`gap-2`** (8 px). Unanime chez tous les systèmes.
- Icône **`size-icone`** (20 px) : c'est la taille pour un contrôle de 44–48.
- Rayon **`rounded-btn`** (8 px).
- Contenu centré : `flex items-center justify-center`.
- Un bouton pleine largeur garde sa hauteur : `w-full` ne change rien à `h-`.
- **Libellé : `text-small font-medium`** (14/20, graisse 500). Ce n'est pas un
  emploi d'« annexe » : la table des graisses de `IDENTITE.md` §8 assigne
  explicitement le 500 aux « libellés, éléments actifs ». Le libellé d'un
  contrôle est un libellé, pas du corps de texte.

États obligatoires, tous les cinq : **repos · survol · focus · pressé ·
éteint**. Le focus est global (anneau indigo 2 px, décalage 2 px) — on ne le
réécrit pas, et on ne pose jamais `outline-none` sans remplacement.

Chaque état a son ton. La palette n'en avait que deux ; il en fallait quatre de
plus, ajoutés après que la fabrication a buté dessus :

| | repos | survol | pressé |
|---|---|---|---|
| primaire | `accent` | `accent-hover` | `accent-presse` |
| danger | `negative` | `negative-hover` | `negative-presse` |

Chaque palier se détache du précédent d'un rapport d'environ 1,25 — le pas que
la charte s'était déjà donné entre `accent` et `accent-hover`. Le blanc reste
au-dessus de 9:1 sur les six tons.

### 5.2 Champs et formulaires — `app/ui/champ.tsx`

- Hauteur **`h-controle`** (44). Zone de texte : **`min-h-zone-texte`** (96).
- Fond **`bg-surface-raised`**, jamais `surface-2`. Trois raisons mesurées : le
  contour y gagne 3,39:1 au lieu de 3,04 ; le texte tertiaire y passe à 5,69:1
  au lieu de 4,27 — c'est précisément la paire qui échouait ; et un bouton
  discret posé DANS le champ peut y survoler en `surface-2` sans devenir
  invisible.
- Padding horizontal **`px-4`**.
- **Padding vertical : interdit sur un champ d'une ligne** — il se centre dans
  sa hauteur. **Obligatoire sur une zone de texte** (`py-3`) — elle se remplit
  par le haut, et son jeton de 96 px compte déjà ces 12 + 12 autour de trois
  lignes de 24. Ce n'est pas une entorse à la règle R3 : la hauteur reste
  déclarée, le padding ne fait que placer le texte dedans.
- Bordure **`border-contour`** 1 px au repos → `border-accent` au focus.
- Libellé au-dessus, `text-small` 500, écart **`mb-2`** (8 px).
- Message d'aide ou d'erreur en dessous, `text-small`, écart **`mt-2`** (8 px).
- **Tout champ a un libellé associé.** Quatre champs de l'app n'en avaient
  aucun, et l'un n'avait même pas de `placeholder` : rien à annoncer.
- Un champ et le bouton qui le suit sur la même rangée ont **la même hauteur**.
  C'est le sens de la règle R3.

### 5.3 Cartes et listes — `app/ui/carte.tsx`, `app/ui/rangee.tsx`

- Padding de carte **`p-4`** (16). Convergence Polaris / Carbon / Radix.
- Rayon **`rounded-card`** (12). Material et Radix donnent la même valeur.
- Séparateur 1 px `border-line`, retrait 16 px.
- Rangées de liste — seules hauteurs publiées par un système de référence
  (Material) :

| Jeton | px | Contenu |
|---|---|---|
| `h-rangee` | 56 | une ligne |
| `h-rangee-2` | 72 | deux lignes |
| `h-rangee-3` | 88 | trois lignes |

**Une rangée à contenu libre porte un plafond.** La liste des encaissements
rendait le SMS entier en `whitespace-pre-wrap` : une rangée de 76 px minimum,
non bornée, qui atteignait 142 px pour un SMS de quatre lignes. Le texte long
se tronque et s'ouvre dans la fiche.

**Une liste dans une carte va bord à bord.** La carte porte `p-4`, la rangée
porte `px-4` : empilés, ils font 32 px de retrait et le séparateur ne tombe
plus sur les 16 px annoncés. Donc une carte qui contient une liste **retire son
padding horizontal** — c'est la rangée qui le porte, et elle seule. Un seul
padding, jamais deux. La rangée doit pouvoir aller jusqu'au bord : c'est elle
qu'on touche, et une zone de contact qui s'arrête à 16 px du bord perd du doigt
sur toute sa longueur.

**Le disque décoratif et le bouton d'action ne se ressemblent pas.** Disque
`size-disque` (32), rond, filet `line`. Action de queue `size-controle` (44),
carrée, filet `contour`. Dans l'ancienne liste, les deux faisaient 36 px : rien
ne disait lequel répondait au doigt.

**Chevron : `size-icone` (20).** Il appartient au contrôle, pas à la rangée —
la taille 24 est réservée à l'icône de tête, qui appartient au contenu.

### 5.4 Navigation — `app/ui/nav-*.tsx`

- Élément de menu **`h-controle`** (44), identique **déplié et replié**. Le
  rail perdait 4 px en se repliant, parce que la hauteur suivait le texte.
- Icônes de navigation **`size-icone-lg`** (24).
- Rail 240 px déplié / 72 px replié — inchangé, déjà sur la grille.
- Barre flottante mobile : pilule active et bouton inactif à la **même
  hauteur** (44). L'une faisait 40, l'autre 44.

### 5.5 Sélecteurs et contrôles — `app/ui/interrupteur.tsx`, `app/ui/case.tsx`

| Élément | Dimensions | Cible |
|---|---|---|
| Interrupteur | piste `48 × 28`, pastille `24`, course 20 | 44×44 |
| Case à cocher | `20 × 20`, rayon 6 | 44×44 |
| Bouton radio | `20 × 20`, rond | 44×44 |
| Puce sélectionnable | `h-controle` (44) | 44 |

La piste vaut 1,71 fois sa hauteur — tous les systèmes qui la publient sont
entre 1,6 et 2,0. La pastille vaut la hauteur moins 4.

**Une puce sur laquelle on clique n'est pas un badge** : elle prend
`h-controle` comme tout le reste. Trois filtres sélectionnables de l'app
faisaient 28, 32 et 40 px, avec deux rayons différents.

### 5.6 États et feedback — `app/ui/etat.tsx`

| Élément | Hauteur | Note |
|---|---|---|
| Badge / pastille de compte | `h-badge` (20) | non interactif |
| Puce d'information | `h-puce` (28) | non interactive |
| Bandeau d'alerte | `min-h-controle-fort` (48) | icône 20, padding `p-4` |
| État vide | `p-6` (24) | **un seul composant**, `<Vide>` |
| Indicateur de chargement | `size-icone-lg` (24) | |

L'état vide était réécrit à la main **quatre fois**, avec quatre paddings
différents, alors que `app/vide.tsx` existait déjà.

### 5.7 Fenêtres — `app/ui/fenetre.tsx`

Ce n'est pas une famille de plus, c'est une correction de défauts réels :

- **Hauteur maximale et défilement interne obligatoires.** La fiche SMS n'en
  avait aucun : un SMS de quatre lignes poussait les boutons d'action hors de
  l'écran, sans moyen de les atteindre.
- **L'en-tête reste hors de la zone défilante.** Dans la fenêtre d'opération,
  `overflow-y-auto` englobait l'en-tête : le bouton de fermeture partait avec.
- **Fermeture au clavier** (Échap), `role="dialog"`, `aria-modal`, piège de
  focus. Aucun n'était présent.
- Bouton de fermeture **44×44** — il faisait 18×18.
- Sur mobile, marge basse sûre (`env(safe-area-inset-bottom)`).

---

### 5.8 Les plans

Quatre plans, pas davantage. Une interface qui empile plus de quatre niveaux ne
sait plus lequel est devant.

| Plan | Quoi |
|---|---|
| `z-10` | Ce qui colle en défilant : en-tête de liste, en-tête de fenêtre |
| `z-20` | La barre flottante mobile — seule porteuse de `shadow-barre` |
| `z-30` | Voile et fenêtre modale |
| `z-40` | Rien, pour l'instant. Réservé à ce qui doit passer devant une fenêtre. |

L'ombre n'est pas un plan. Elle **dit** qu'il y en a un, sur le seul élément qui
flotte réellement au-dessus du contenu qui défile dessous. Toute autre ombre est
un refus (`docs/IDENTITE.md` §9).

### 5.9 Deux emplois de `contour`

`contour` est décrit comme un filet, mais il a le droit d'être un **aplat** :
la piste d'un interrupteur au repos doit tenir 3:1 contre le fond *et* contre sa
pastille blanche, et une bordure y casserait la géométrie de la piste. C'est le
seul cas. Partout ailleurs, `contour` est un trait de 1 px.

## 6. Vérifier

```sh
cd web && node scripts/verifier-le-systeme.mjs
```

Il relit tous les écrans, refuse ce qui sort de l'échelle, et nomme le fichier
et la ligne. Sortie 1 s'il reste une infraction.

L'interface avait déjà une charte, et elle était bonne. Elle n'a pas tenu,
parce que rien ne la vérifiait. **Une règle que personne ne compte n'est pas
une règle.**
