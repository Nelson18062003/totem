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
| **Planté** | L'objet ne bouge pas. C'est sa raison d'être. | Une marque verticale, dense, qui tient debout toute seule. |
| **Traversé** | On agit *à travers* lui, on ne le manipule pas. | Une forme faite de passages, pas de blocs. |
| **Double** | Un modem par opérateur, tous deux à l'écoute en permanence. | Deux brins, jamais un seul, jamais confondus. |

### D'où vient la forme

Un totem n'est pas une colonne. Le premier jet de cette identité dessinait un
chapiteau, un fût et un socle — c'est-à-dire le vocabulaire de la colonne
gréco-romaine, posé sur un produit camerounais. L'erreur était de fond.

La forme vient d'ailleurs : du **tressage**. Vannerie de raphia, claustras de
bambou, treillis de losanges des Grassfields — une géométrie du pays, qui dit
exactement ce que fait le produit. On n'y emprunte aucun motif particulier,
encore moins un signe rituel : seulement la grammaire commune du tissage,
deux brins qui se croisent.

---

## 2. Le symbole — « La Tresse »

![Le symbole](../brand/totem-symbole.svg)

**Deux brins qui se croisent à chaque registre et se rejoignent aux deux
bouts.**

Ce que le tressage dit, et qu'aucune autre forme ne disait :

- **Deux brins, jamais confondus.** MTN et Orange, chacun sur son modem, tous
  deux à l'écoute. Ils se croisent en permanence sans jamais fusionner — c'est
  très exactement l'architecture multi-comptes.
- **Ni début ni fin.** Les brins convergent en haut et en bas : le lien ne se
  rompt pas. File d'attente hors ligne, chien de garde, reprise automatique.
- **Le vide fait le motif.** Entre deux croisements, le blanc dessine un
  **losange**. Le treillis n'est pas posé sur la marque : il naît du tressage.
- **Vertical, à registres répétés.** Un mât, vu de face. Un totem.

Le symbole ne varie **jamais** : trois losanges, quel que soit le nombre de
comptes branchés. Une marque qui suit les données n'est plus une marque.

### Construction

Grille de **32 × 32**, tracé inscrit dans **18 × 28**.

| Paramètre | Valeur | Ce que ça règle |
|---|---|---|
| Losanges | **3** | le nombre de registres |
| Axe | **16** | l'axe de symétrie |
| Écart d'un brin à l'axe | **6,6** | la largeur de la tresse |
| Épaisseur d'un brin | **4,8** | la matière |
| Cambrure | **0,7** | 0 = brin droit, 1 = brin cordé |
| Jeu au passage dessous | **1,15** | la respiration du croisement |

Les brins sont deux polylignes qui **coïncident aux bornes paires** — ce sont
les croisements — et atteignent leur écart maximal aux bornes impaires. La
cambrure les transforme en cordes par interpolation Catmull-Rom.

Le passage dessus-dessous n'est pas un empilement : le brin du dessous est
**interrompu par un masque orienté le long de celui du dessus**. C'est un
entrelacs véritable, qui tient dans n'importe quelle couleur sur n'importe
quel fond.

### Variante petite taille

Le jour du tressage mesure environ 7 unités sur 32 avec le jeu, soit **22 % de
la largeur du tracé** — mais il est vu de biais, et ce qui compte est sa
projection : elle passe sous le pixel dès que le symbole descend en dessous de
**22 px**. On sert alors `totem-symbole-mini.svg` : les deux brins fondus. Même
silhouette, le passage en moins. Le composant `<Symbole/>` bascule tout seul.

**Taille minimale absolue : 16 px.**

---

## 3. Le motif — la claustra

![Le motif](../brand/totem-motif.svg)

C'est la partie de l'identité qui n'existait pas du tout avant. **La même
tresse, répétée.** Les colonnes voisines sont décalées d'un demi-losange : les
vides s'imbriquent, et l'ensemble devient un mur ajouré.

| Fichier | Usage |
|---|---|
| `totem-motif.svg` | Un panneau fini — couverture, affiche, autocollant du boîtier. |
| `totem-motif-tuile.svg` | Une période du tressage, **raccordable à l'infini**. C'est la source de la classe CSS `.claustra`. |

La claustra est de la **marque**, pas de la donnée. Elle a droit aux écrans qui
parlent de TOTEM — connexion, couverture de documentation, page de
présentation. Elle n'a jamais le droit de passer derrière un montant, un solde
ou un état : un fond travaillé sous un chiffre, c'est du bruit sur une
information qui compte.

---

## 4. Le mot

`TOTEM` s'écrit en **DM Sans Bold (700)**, **capitales**, interlettrage
**+0,18 em**.

L'écart large est délibéré : il donne au mot une allure **lapidaire**,
d'inscription gravée, et il fait contrepoids à la densité du symbole. Il ne
s'applique **qu'au nom de la marque** — le jeton `--tracking-marque`. Partout
ailleurs, les capitales gardent l'interlettrage courant.

Les fichiers de `brand/` contiennent le mot **vectorisé** : ils ne dépendent
d'aucune police installée. Dans l'application il reste du texte vivant
(composant `<Logo/>`), donc sélectionnable et lisible par un lecteur d'écran.

---

## 5. Les verrouillages

| Fichier | Usage |
|---|---|
| `totem-logo.svg` | Le verrouillage de référence : symbole latérite, mot encre. |
| `totem-logo-vertical.svg` | Formats étroits ou carrés : couvertures, affiches, autocollant du boîtier. |
| `totem-logo-encre.svg` | Quand la couleur est impossible (fax, tampon, gravure une couleur). |
| `totem-symbole.svg` | Seul, quand le nom est déjà écrit à côté : favicon, avatar, en-tête d'app. |

**Proportions du verrouillage horizontal** (unité = hauteur de capitale) :

- hauteur du symbole = **1,45 ×** la hauteur de capitale (**2,1 ×** en vertical),
- écart symbole ↔ mot = **0,78 ×**,
- le symbole est centré **optiquement sur la capitale**, pas sur la ligne de base.

### Zone de protection

Aucun élément — texte, image, bord de page, bord de bouton — n'entre dans une
marge égale à **la largeur du symbole**, tout autour du verrouillage. Le
symbole étant étroit et haut, c'est une marge plus généreuse qu'il n'y paraît :
elle empêche la tresse d'être lue comme une texture de fond.

### Tailles minimales

| | Écran | Impression |
|---|---|---|
| Verrouillage horizontal | 110 px de large | 28 mm |
| Verrouillage vertical | 60 px de large | 15 mm |
| Symbole seul | 16 px | 5 mm |

---

## 6. Ce qu'on ne fait pas

- ❌ **Défaire le tressage.** Les brins passent dessus-dessous. Deux brins qui
  se superposent sans se croiser ne sont plus une tresse, c'est un gribouillis.
- ❌ **Ajouter ou retirer des losanges** selon le nombre de comptes.
- ❌ **Utiliser le motif comme fond** derrière un montant, un solde ou un état.
- ❌ **Recomposer le mot** dans une autre police, ou lui retirer son interlettrage.
- ❌ **Déformer** : le verrouillage se met à l'échelle proportionnellement, point.
- ❌ **Poser un dégradé, une ombre portée, un biseau.** La marque est un aplat mat.
- ❌ **Colorer le symbole** autrement qu'en latérite, en encre, en blanc, ou
  dans la couleur du texte courant. Jamais en jaune MTN, jamais en orange Orange.
- ❌ **Enfermer le symbole dans un cercle ou un carré** ailleurs que dans les
  icônes applicatives fournies.

---

## 7. Couleurs

Depuis l'adoption des fondations du **Simple Design System** (Figma) pour
l'interface, la répartition est simple : **la latérite** — la terre rouge sur
laquelle le totem est planté — porte la marque, et elle seule ; l'interface,
elle, est **neutre**, du blanc au presque-noir, et l'action principale est
sombre, jamais colorée. Les valeurs ci-dessous sont relevées dans le fichier
Figma du système, pas approchées.

La latérite ne se confond avec aucun opérateur : MTN est un jaune vif, Orange
un orange vif ; la latérite est sombre et rabattue. TOTEM reste la surface
neutre sur laquelle la marque vient se poser.

### La marque

| Jeton | Hex | Rôle | Contraste sur `surface` |
|---|---|---|---|
| `laterite` | `#9A4B2E` | **La couleur de la marque.** Le symbole, la claustra. | 5,9:1 |
| `laterite-clair` | `#D08A63` | La même, sur fond sombre. | 6,4:1 sur `ink` |
| `sable` | `#F4EFE9` | Le fond des surfaces de marque. | — |

### Neutres — la gamme du système

| Jeton | Hex | Rôle | Contraste |
|---|---|---|---|
| `surface` | `#F5F5F5` | Fond de page | — |
| `surface-raised` | `#FFFFFF` | Cartes | — |
| `surface-2` | `#E6E6E6` | Champs, survol, puces | — |
| `surface-3` | `#D9D9D9` | Séparateurs pleins, barres | — |
| `line` | `#D9D9D9` | Bordures fines | — |
| `ink` | `#1E1E1E` | Texte principal | 16,1:1 |
| `ink-soft` | `#444444` | Texte secondaire | 9,7:1 |
| `ink-faint` | `#767676` | Texte tertiaire | **4,5:1 — passe AA** |

> Le système propose `#B3B3B3` en tertiaire ; il plafonne à 2,4:1, sous le
> seuil AA. On lui préfère `#767676`, pris dans la même gamme : aucune couleur
> de texte de l'interface n'est sous le seuil.

### L'action

| Jeton | Hex | Rôle | Contraste |
|---|---|---|---|
| `accent` | `#2C2C2C` | Bouton premier, sélection, focus. | 13,4:1 |
| `accent-hover` | `#1E1E1E` | Survol | — |
| `accent-soft` | `#E6E6E6` | Fond d'état sélectionné | — |

### Sémantique — celle du système

| Jeton | Hex | Rôle | Contraste |
|---|---|---|---|
| `positive` | `#02542D` | Crédit, encaissement (texte) | 8,1:1 |
| `positive-vif` | `#14AE5C` | Points et pastilles d'état | — |
| `negative` | `#C00F0C` | Débit, sortie | 5,9:1 |
| `alert` | `#975102` | Attention, file d'attente | 4,6:1 |

Le texte reste sombre et lisible ; le vif est réservé aux points d'état.

### Couleurs opérateur — ce sont des données

| Jeton | Hex | |
|---|---|---|
| `op-mtn` | `#FFCC00` | |
| `op-orange` | `#FF7900` | |

Elles n'appartiennent pas à TOTEM. Autorisées en **liseré, pastille ou point
de 4 px maximum**, pour distinguer deux comptes. Jamais en aplat de fond,
jamais en texte, jamais dans le logo.

---

## 8. Typographie

**L'interface parle Inter** — la famille du Simple Design System, chargée par
`next/font` : aucun appel réseau au rendu, aucun saut de mise en page.
**DM Sans ne subsiste qu'à deux endroits** : le mot TOTEM du logotype (le
logotype ne se recompose pas), et les reçus PDF, où elle est embarquée côté
terminal (`totem/polices/`).

| Graisse | Usage |
|---|---|
| 400 Regular | Corps de texte |
| 500 Medium | Libellés, éléments actifs |
| 600 SemiBold | Titres |
| 700 Bold | Le mot TOTEM (DM Sans), et lui seul |

### Échelle — celle du système, ramenée à l'application

| Jeton | Taille | Usage |
|---|---|---|
| `text-hero` | 2 → 3 rem | Le solde, et rien d'autre |
| `text-display` | 2 rem | Montants de compte |
| `text-title` | 1,5 rem | Titre de page |
| `text-heading` | 1,25 rem | Titre de section |
| `text-body` | 1 rem | Corps |
| `text-small` | 0,875 rem | Annexe |
| `text-caption` | 0,75 rem | Étiquette |

### Une règle ferme

1. **Les chiffres sont tabulaires.** Classe `.tabnums` sur tout montant, tout
   solde, tout numéro. Une colonne de montants doit s'aligner à la virgule.

---

## 9. Formes et icônes

**Rayons** — ceux du système : `--radius-card` 8 px · `--radius-btn` 8 px ·
`--radius-sm` 4 px. La pilule (`rounded-full`) est réservée à la recherche et
à la barre flottante.

**Icônes** — jeu maison dans `web/app/icons.tsx` : trait de **1,5 px**, grille
**24 × 24**, extrémités et jointures arrondies, jamais de remplissage. Le trait
arrondi des icônes est le même que celui des brins : c'est ce qui les fait
tenir ensemble.

**Aucun emoji dans l'interface.** Un emoji est rendu par le système : il change
de dessin d'un téléphone à l'autre, et il fait basculer l'application du côté
du jouet. Le `🗿` du README est une licence éditoriale, pas un composant.

**Aucune ombre décorative.** Une seule ombre dans tout le système, celle de la
barre flottante mobile, et elle sert à établir un plan.

---

## 10. Ton

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

## 11. Les fichiers

Tout est dans [`brand/`](../brand/) — voir son [README](../brand/README.md).

Le symbole est décrit **une seule fois**, en coordonnées de grille, dans
`brand/generer.py`. Tout le reste en découle : les verrouillages, les icônes,
le motif, la tuile. Si la tresse doit bouger, elle bouge là, puis on reporte
dans `web/app/marque.tsx` — jamais l'inverse, et jamais dans un seul des deux.
