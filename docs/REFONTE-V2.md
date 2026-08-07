# Refonte v2 — l'ordre de mission

> La v1 a rendu l'interface **cohérente**. Elle l'a aussi rendue **épaisse**.
> La v2 ne corrige pas des dimensions : elle enlève des objets, déplace ce qui
> est mal placé, et cadre ce qui reste au millimètre.

Ce document consolide neuf enquêtes — quatre de recherche, trois de critique
visuelle, deux d'ergonomie. Chaque décision ci-dessous est **prise**, pas
proposée. Personne ne la rediscute ; on l'applique.

---

## 1. La faute d'origine

**44 px est le seuil de WCAG 2.5.5, qui est de niveau AAA. Le seuil AA, 2.5.8,
vaut 24.** La v1 a imposé AAA à chaque objet cliquable, en confondant la région
qui accepte l'appui avec le rectangle qu'on dessine — alors que la norme définit
une cible comme « *the region of the display that will accept a pointer
action* ».

Ce que ça coûtait, mesuré sur un téléphone de 390 px :

| Écran | Objets DOM | Décor avant le 1ᵉʳ contenu | Hauteur |
|---|---|---|---|
| Comptes | 107 | **67 %** | 1218 px |
| Accueil | 137 | 44 % | 1212 px |
| Encaissements | 132 | 40 % | 1476 px |
| Réglages | **221** | — | **2637 px = 3,12 écrans** |

**On dessine petit, on vise grand.**

| Objet | Boîte visuelle | Cible |
|---|---|---|
| Puce, badge cliquable | **28** | 44, verticale seule |
| Bouton compact, bouton d'icône | **32** | 44 |
| Bouton courant | **40** | 44 |
| Action primaire, destructive | **44** | 44 |
| Rangée de liste | 56 / 72 | sa hauteur |

Le mécanisme est un **pseudo-élément débordant** (`.cible`, `.cible-libre`),
jamais du padding : le padding déplace le survol, l'anneau de focus et la mise
en page. C'est ce que font Material 3 (puce 32 → cible 48) et Primer (bouton 32
→ 44 en pointeur grossier).

**Gouttière minimale entre deux cibles voisines : 12 px.** Deux objets de 32
séparés de 8 voient leurs cibles se recouvrir de 4, et la norme retire l'aire
commune du calcul : les deux retombent à 40.

---

## 2. Ce qu'on tue

Total récupéré, mesuré : **plus de 2 300 px** sur l'ensemble des écrans.

| Écran | Objet | Gain |
|---|---|---|
| Accueil | Bascule de langue de l'en-tête — **doublon du rail**, 7 216 px² contre 4 704 pour le titre de page | 56 px + 61 % de la largeur d'en-tête |
| Accueil | Carte « Terminal » (emplacement, version, santé) — 3 lignes qu'on ne touche jamais | 292 px, et 136 800 px² de colonne vide en 1440 |
| Comptes | Encadré « Aucune carte » + ses 3 boutons qui agissent sur une carte inexistante | 334 px |
| Encaissements | Les 7 puces de filtre — **637 px demandés pour 358 disponibles**, aucune forme ne tiendra jamais | 108 px |
| Encaissements | Le disque décoratif de 32 px — il prend exactement les 44 px qui manquent au titre pour ne pas se tronquer | 44 px de largeur par rangée |
| Encaissements | Le paragraphe d'introduction — il décrit ce que la liste montre | 54 px |
| Analyse | Le graphique — 214,5 px pour deux valeurs déjà écrites au-dessus, 5 barres sur 7 réduites à un tiret de 4 px, l'encre ne fait que 16 % du rectangle | 214,5 px |
| Réglages | La section « Codes USSD » — 572 px (21,7 %) pour 6 lignes en lecture seule | 604 px |
| Réglages | Les 5 paragraphes gris — 289 px, dont un de 97 px plus haut que la carte qu'il commente | 289 px |
| Réglages | La carte « Nelson » — 2 lignes non modifiables qui ouvrent le mur | 138 px |

**On lit au plus 28 % des mots d'une page, plus probablement 20 %** (NN/g). Un
paragraphe explicatif permanent est payé en hauteur, jamais en compréhension.

---

## 3. Ce qu'on déplace

L'interface donne sa meilleure place à la déconnexion et relègue les actions
utiles hors de portée. Modèle d'atteinte : pivot du pouce à (340, 880), arc
FACILE ≤ 270 px, MOYEN ≤ 430, DIFFICILE au-delà.

| Élément | Où il est | Verdict | Où il va |
|---|---|---|---|
| **Se déconnecter** | 195/742, arc **200 FACILE** | le geste le plus regretté est le plus facile | en haut de l'écran, ou derrière une confirmation |
| Consulter le solde (Comptes) | 516 px du bas, arc **571** | l'action n°1 est hors d'atteinte | sous 560 px du bas |
| Recherche (Encaissements) | 588 px du bas | **le pire point de l'application** | derrière une icône dans l'en-tête |
| Les 7 filtres | arcs 424–532 | tous en zone rouge | un déclencheur unique bas, ouvrant une feuille |
| Exporter le bilan | y 797 | **occulté par la barre flottante** | 78 px de garde basse sur tout contenu |
| Pavé secret | **hors écran** dès 8 échanges (grille à y=759 sous un corps qui finit à 762) | il faut le chercher au doigt | épinglé en bas, le fil défile derrière |
| Annuler la session | pleine largeur sous le pavé, zone la plus accessible | la place du pouce va à l'abandon | discret, en haut ; la place revient à « Valider » |

**La barre flottante fuit après 8 px de défilement** et ne revient qu'après 40
de remontée : sur les réglages elle est invisible sur **96 %** de la page. NN/g
mesure une navigation masquée à **57 % d'usage contre 86 %**. Seuil porté à
80 px.

---

## 4. Le pavé secret

C'est l'objet le plus manipulé au pouce, et le plus maltraité.

| Constat mesuré | Décision |
|---|---|
| Grille de 208 px sur 390 : **91 px de vide de chaque côté, 46 % de l'écran perdu** | la grille prend toute la largeur de sa carte |
| Touches 64 × 48, **ratio 1,33** — plus larges que hautes pour un doigt rond | carrées, 64 minimum |
| Hors écran dès que le fil s'allonge | épinglé en bas, le fil défile derrière |
| « Valider » jouxte « 0 » à 8 px : un zéro raté valide un code court | gouttière de 12 px minimum autour de Valider |
| Pastilles de 12 px : on ne compte pas d'un coup d'œil | 16 px, écart 12 |

**Règle non négociable, inchangée :** le code n'est jamais stocké, jamais écrit
dans un message, jamais journalisé autrement que `****`. L'`aria-label` ne
transmet que la longueur.

---

## 5. La typographie, au millimètre

Trois faits mesurés dans le fichier de police, et non déduits :

1. **DM Sans n'a aucune fonction `tnum`.** Sa table GSUB contient `calt ccmp
   dnom frac kern liga locl mark mkmk numr`. `font-variant-numeric:
   tabular-nums` est **inerte**, et la classe `.tabnums` posée dans toute
   l'application n'a jamais rien fait. Les chasses vont de **312** pour le
   « 1 » à **684** pour le « 0 » — 5,95 px d'écart à 16 px.
   → **L'alignement vient de la mise en page** : colonne de largeur fixe, texte
   calé à droite (`.colonne-montant`).

2. **U+202F, l'espace fine insécable qu'émet `toLocaleString("fr-FR")`, est
   absente de DM Sans.** Chaque montant portait donc un blanc rendu par une
   police de repli. Corrigé en U+00A0 (présente, chasse 266).

3. **Le signe fait partie du montant.** U+2212 (moins mathématique) a la même
   chasse que le plus — 550 — là où U+002D en fait 541. On écrit toujours
   U+2212.

**Le cadrage optique.** Métriques mesurées : `upm 1000, ascendante 992,
descendante −310, capitale 700, hauteur d'x 504`. Un libellé bas-de-casse
paraît **1,42 px trop bas** dans un bouton à 16 px.

La première correction employait `text-box: trim-both cap alphabetic` — la
technique la plus récente, qui rogne le blanc de fonderie. **Elle est
disqualifiée ici** : elle cale le haut de la boîte sur la hauteur des
CAPITALES, et en français les accents vivent au-dessus. Combinée à la moindre
troncature, elle décapite les é — mesuré sur un déclencheur de filtre, la boîte
tombait à 10 px pour 20, et « Opérateur » et « Catégorie » perdaient leur
accent.

La correction se fait donc par **déplacement** (`translateY(-0.045em)`), qui
obtient le même résultat optique sans jamais toucher à la géométrie de la
boîte — donc sans rien pouvoir rogner. Une technique qui mutile la langue du
produit est écartée, si moderne soit-elle.

**L'interlettrage suit la taille.** Le `-0.011em` global n'était juste qu'à
16 px. Sept paliers, le zéro tombant vers 12 px — en dessous, on **écarte**.

---

## 6. Le vocabulaire

`carte`, `SIM`, `puce`, `compte` désignent **le même objet sur le même écran**.
Le paragraphe d'aide de 48 mots qui explique la différence n'existe que parce
que l'interface ne s'est pas décidée. **Un seul mot, et le paragraphe tombe.**

`4/31` est l'échelle GSM du signal, affichée nue, en gris, sans étiquette. **4
sur 31, c'est un réseau très faible** — une information vitale rendue
illisible. On écrit « Réseau faible ».

Les textes vivent dans `lib/textes/` et sont bilingues : **on ne remplace jamais
une chaîne sans donner sa traduction**, et on ne crée pas de clé sans nécessité.

---

## 7. La densité

Deux densités, **jamais cinq** : le coût de Material montre où mène le cran par
composant. Pilotage par attribut hérité sur une **zone**, pas sur l'appareil —
modèle Cloudscape, qui exclut explicitement de la densification tout ce dont la
cible est déjà restreinte.

Varient : padding vertical, gouttières, interligne, hauteur de rangée (recul de
4 px par cran).
**Gelés :** taille du corps de texte, rayons, et la cible de 44.

Les `@container` sont Baseline depuis février 2023 et Tailwind v4 les expose
(`@container/liste`, `@sm/liste:p-4`). Un composant doit être dense dans une
colonne étroite et aéré en pleine largeur **sans savoir sur quel appareil il
tourne** : la media query mesure la fenêtre, jamais le trou où l'on pose le
composant.

---

## 8. Ce qui ne bouge pas

- La palette, les trois rayons, les sept crans typographiques.
- La géométrie du symbole de marque (grille 32, trait 4,8, trois losanges).
- Le code PIN : jamais stocké, jamais journalisé.
- `analyse_sms.py` renvoie `None` dans le doute et n'invente jamais un montant.
- Aucun texte affiché ne change sans sa traduction.

---

## 9. Ce que la refonte a réellement donné

Toutes les mesures ci-dessous ont été prises **au navigateur**, à 390 × 844,
avec les mêmes données avant et après. Aucune n'est déduite.

### Le décor — la part de l'écran consommée avant le premier contenu

| Écran | Avant | Après |
|---|---|---|
| Accueil, sans puce | **78,0 %** | **14,7 %** |
| Accueil, puce en place | 24,2 % | 14,7 % |
| Puces, sans puce | **65,6 %** | **20,5 %** |
| Puces, puce en place | 19,4 % | 14,2 % |
| Encaissements | **60,6 %** | **28,3 %** |

### La hauteur des pages et le nombre d'objets

| Écran | Avant | Après |
|---|---|---|
| Réglages, deux puces | 2581 px · 241 objets | **1672 px · 184 objets** |
| Réglages, sans puce | 2275 px · 184 objets | **1366 px · 127 objets** |
| Encaissements | 2356 px · 176 objets | **2036 px · 172 objets** |
| Analyse | 895 px · 79 objets | **844 px · 46 objets** |
| Puces, sans puce | 1278 px · 96 objets | **948 px · 72 objets** |

L'écran d'analyse tient désormais **dans un écran**, sans défilement.

### Les composants

| | Avant | Après |
|---|---|---|
| Barre de filtres | **637 px demandés pour 358** (178 %) | **242,8 px** (68 %), une rangée |
| Touche du pavé secret | 64 × 48, ratio 1,33 | **96,5 × 96,5**, carrée |
| Grille du pavé dans sa carte | 208 / 322 = 64 % | **313,5 / 322 = 97 %** |
| Colonne des montants | bords à 270 **et** 258 | **écart nul** aux trois largeurs |
| Vide titre ↔ montant en 1440 | 592 px | **12 px** |
| Colonne des SMS en 1440 | 594 px | **926 px** |

### Ce que seule la mesure au doigt a pu trouver

Aucun de ces défauts n'était détectable en relisant le code — tous les jetons
étaient conformes, et le gardien n'a jamais rien signalé :

1. **On ne pouvait pas télécharger un reçu sur un téléphone.** `.entree` fait
   de `<main>` un contexte d'empilement : le voile en `z-30` passait sous la
   barre en `z-20`. Corrigé par un portail.
2. **Le pavé du code secret sortait de l'écran** dès huit échanges — le cas
   normal d'un dépôt.
3. **`cadre-optique` décapitait les accents français** : `text-box-edge: cap`
   cale la boîte sur la hauteur des capitales, et les é vivent au-dessus.
4. **Les pastilles du pavé n'avaient pas de `role="img"`** : l'étiquette de
   longueur n'était annoncée par aucun lecteur d'écran.
5. **Cinq contrôles ne faisaient rien** — les trois boutons de `/cartes`,
   « Exporter le bilan », et « Ajouter un raccourci », dont l'état n'était
   jamais écrit nulle part. Tous parfaitement dimensionnés.

### Ce qui reste ouvert

- **Des emojis dans la fiche d'un SMS** (`📥 Dépôt`, `📤 Retrait`) alors que
  `IDENTITE.md` §9 les interdit : « il change de dessin d'un téléphone à
  l'autre, et il fait basculer l'application du côté du jouet ».
- **272 px de gouttières mortes en 1440**, dans `coquille.tsx`.
- `BasculeLangue` n'a plus aucun appelant.
- Un montant de **−1 248 500 FCFA** déborde encore la colonne en 390 px.
- La barre reste absente sur ~90 % d'une descente ininterrompue : le seuil
  règle le geste, pas la longueur de la page.
