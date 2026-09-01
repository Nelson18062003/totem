# TOTEM ADMIN — NORMES DIMENSIONNELLES (spécification fermée)

Tranché à partir des sources officielles (Apple HIG, Material 3 v0.192, WCAG 2.2,
GitHub Primer, shadcn/ui, Vercel Geist, Atlassian) et de l'étude de craft
(Linear, Stripe, Vercel, Datadog). **Ces valeurs ne se discutent pas et ne
s'improvisent pas.** Tout ce qui n'est pas dans une échelle ci-dessous est
interdit. L'outil `mesure.mjs` le vérifie à la machine : zéro violation exigée.

---

## 0. La règle des deux graisses
La police de marque (DM Sans) n'existe qu'en **400** et **700**. Aucune graisse
intermédiaire n'existe : demander 500 ou 600 produirait un faux gras. Donc :
- `font-synthesis: none` sur tout le document — aucune graisse fabriquée.
- **400** partout par défaut.
- **700** réservé à quatre usages : le wordmark, les identifiants qu'on cherche
  du regard (nom de terminal, nom de personne, numéro de SIM), les valeurs
  chiffrées qui portent la décision (montant, chiffre KPI), et les overlines.
- La hiérarchie vient de la **taille + la couleur + l'espace**, jamais du gras.

## 1. Échelle typographique (px) — 7 tailles, rien d'autre
| Taille | Interligne | Rôle | Graisse | Tracking |
|---|---|---|---|---|
| **11** | 16 | overline (petites capitales), libellés de colonnes | 700 | +0.08em |
| **12** | 16 | métadonnées, secondaire, sous-lignes | 400 | 0 |
| **13** | 20 | **corps d'interface**, cellules de table, navigation | 400 | 0 |
| **14** | 20 | emphase, titres de cartes, libellés de boutons | 400/700 | 0 |
| **16** | 24 | titres de section, valeurs de fiche | 400/700 | −0.01em |
| **20** | 28 | titre de page | 700 | −0.015em |
| **28** | 32 | chiffre KPI | 700 | −0.02em |

Rien sous 11px. Rien entre deux paliers. Aucune demi-valeur (12.5px interdit).
`font-variant-numeric: tabular-nums` sur **tout** chiffre affiché.

## 2. Hauteurs de contrôles (px) — 3 hauteurs, rien d'autre
| Hauteur | Usage |
|---|---|
| **28** | contrôle secondaire en barre d'outils, filtre, contrôle en cellule |
| **32** | **défaut** — tout bouton, tout champ, tout select, tout onglet |
| **40** | action primaire isolée (fin de panneau, formulaire) |

Bouton icône : **32 × 32** (icône 16). Padding horizontal : 12px (32 et 40), 10px (28).
Cible minimale absolue : **24 × 24 px** (WCAG 2.2 §2.5.8) — desktop.
Sur mobile : **44 × 44 px** minimum, contrôles en 44 ou 48.

## 3. Tables
- En-tête : **36px**, libellés 11px overline.
- Ligne : **44px** (défaut). Variante dense **36px** — une seule densité par table.
- Écart maximal entre lignes d'une même table : **2px**. Une table dont les
  lignes ne font pas toutes la même hauteur est un défaut, pas un style.
- Padding cellule : 12px horizontal (16px sur la première et la dernière colonne).
- Nombres **à droite**, en tabulaires ; texte à gauche ; en-tête aligné comme sa colonne ; jamais centré.
- Séparateurs horizontaux 1px `rgba(22,23,26,.07)` ; **aucun séparateur vertical**.
- Survol : fond `#faf9f8`. Sélection : fond `#f7f4f1` + liseré latéral latérite 2px.

## 4. Grille d'espacement — base 4
Paliers autorisés : **4, 8, 12, 16, 20, 24, 32, 40, 48, 64**.
- Padding de page : 24px vertical, 32px horizontal.
- Gouttière entre cartes : 16px. Entre bandes majeures : 24px.
- Padding de carte : 16px (dense) ou 20px (normal). En-tête de carte : 16px 20px.
- **Espacement inter-groupes ≥ 2× l'espacement intra-groupe** (Gestalt).

## 5. Rayons
| Rayon | Usage |
|---|---|
| **6px** | boutons, champs, chips carrées, petites pastilles de fond |
| **10px** | cartes, panneaux, popovers |
| **999px** | pilules, bascule de langue, avatars, badges d'état |

## 6. Icônes — 3 corps, rien d'autre
**16px** dans les contrôles, boutons, cellules · **20px** dans la navigation ·
**24px** pour les vignettes d'état en tête de bloc.
Trait 1.5px, `stroke-linecap: round`, `fill: none`, couleur héritée (`currentColor`).
Les pastilles d'état ne sont **pas** des SVG : ce sont des `<span>` ronds de 8px.

## 7. Élévation — une seule pile d'ombre
```css
--ombre: 0 0 0 1px rgba(22,23,26,.07), 0 1px 2px rgba(22,23,26,.04);
--ombre-flottante: 0 0 0 1px rgba(22,23,26,.08), 0 8px 24px -8px rgba(22,23,26,.14);
```
Les cartes n'ont **pas** de `border` : l'anneau de 1px de l'ombre fait la bordure
(il ne touche pas au box-model, donc les hauteurs restent exactes).
Aucune autre ombre n'est autorisée.

## 8. Couleurs (identité TOTEM — non négociable)
```
fond #fbfaf9 · carte #ffffff · fond-2 #f4f2f0 · plein #ebe8e5 · trait #e8e5e1
encre #16171a · secondaire #62605c · tertiaire #77726b
latérite #9a4b2e (marque) · sable #f4efe9
positif #17603f · négatif #8a2020 · alerte #8a6d1f
Orange CM : fond #f9ece4 / texte #a14e1f — MTN : fond #fdf6dc / texte #7a6414
```
La couleur de statut n'existe **qu'à l'échelle d'une pastille ou d'une pilule** —
jamais en aplat de grande surface. Contraste texte ≥ 4.5:1, composants ≥ 3:1.

## 9. Hiérarchie des actions — la règle du bouton unique
**UN seul bouton plein par écran.** Deuxième niveau : contour. Troisième :
fantôme (texte). Au-delà de trois actions dans une zone : menu « ⋯ ».
Ne jamais mélanger contour et fantôme dans le même groupe.
Action dangereuse : contour rouge, jamais plein.

## 10. Instruments (SVG dessinés à la main)
- **Sparkline** : 100 × 32, trait 1.5px, zéro axe, point plein sur la dernière valeur, aire sous la courbe à 10 % d'opacité.
- **Barres de signal** : 5 barres de 3px, gap 2px, hauteurs 5/7/9/11/13, socle commun, barres éteintes en `#e0dcd7`.
- **Jauge** : hauteur 6px, rayon plein, piste `#ebe8e5`.
- **Fil d'événements** : rail 2px, pastilles 8px (ou vignette 24px), horodatage 12px tabulaire, 16px entre événements.

## 11. Chrome commun (identique sur les 7 écrans desktop)
- Rail gauche : **220px**, item de nav **32px** (13px, icône 20px, point latérite sur l'actif), pied de rail à 12px.
- Barre haute : **60px** — titre de page 20px + fil d'ariane 13px à gauche ; recherche (32px, 320px de large), bascule `English | Français` (32px, **en toutes lettres**), avatar 32px à droite.
- Zone de page : padding 24px 32px, largeur utile 1500 − 220 = 1280px.

## 12. Mobile (390 × 844, dsf 3)
- Échelle typo : 11 / 12 / 13 / 15 / 17 / 22 / 28.
- Cibles ≥ 44px ; lignes de liste 64px ; cartes pleine largeur, marges **16px**, gap 12px.
- Tab bar : **49px** + **34px** de safe area = 83px ; 5 onglets ; icônes 24px ; libellés 11px.
- Fraîcheur des données affichée en clair (« Updated 12 s ago »).

## 13. Ce qui est interdit, sans exception
Demi-pixels · tailles hors échelle · `border` sur une carte · deux ombres
différentes · plus d'un bouton plein · couleur en aplat de grande surface ·
abréviation « EN/FR » (toujours **English | Français** en toutes lettres) ·
graisse 500/600 (elle n'existe pas) · texte sous 11px · icône hors 16/20/24 ·
lignes de table inégales · débordement horizontal.
