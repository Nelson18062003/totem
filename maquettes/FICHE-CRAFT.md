# FICHE « TECHNIQUES DE CRAFT » — issue de l'étude Linear / Stripe / Vercel / Retool / Grafana / Datadog (2024-2026)

## 1. Structure d'une page de monitoring / flotte
Anatomie canonique, de haut en bas :
1. Barre de page : titre + période/filtre + UNE action primaire, une seule ligne (56-64px).
2. Rangée de KPI : 3 à 5 cartes de même largeur, jamais 6+. Carte = overline, grand chiffre, delta coloré, sparkline optionnelle.
3. Zone principale : la table de flotte (le vrai contenu — graphique seulement là où une tendance a besoin d'une forme).
4. Panneau latéral 380-480px pour le détail d'une ligne (pattern Datadog/Linear), pas de nouvelle page.
5. Timeline d'incidents : liste verticale antéchronologique, pas un graphique.
Couleur réservée aux statuts et aux deltas (Vercel : la couleur de statut n'existe qu'à l'échelle d'une pastille ~10px, jamais en fond de grande surface).

## 2. Finition
- Cartes : fond blanc sur fond gris chaud, délimitées par la pile d'ombre
  `box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 2px 2px rgba(0,0,0,0.04);`
  (une couche = bordure, une couche = douceur). Jamais une grosse ombre unique. Pas de `border` sur les conteneurs (0 0 0 1px ne touche pas le box-model).
- Hairlines : 1px rgba(0,0,0,0.06-0.10) — jamais de gris opaque.
- Séparer par l'espace, pas par les traits : aucun trait interne aux cartes ; traits réservés aux rangées de table et frontières majeures. Espacement inter-groupes ≥ 2× l'intra-groupe.
- 6 états par élément interactif : default, hover (fond seul, +3-4 %), focus (anneau 2px, outline-offset 2px), active (scale 0.97), disabled, loading.
- Live : pastille 8px + halo pulsé + libellé (« active 12 s ago »).
- Statut : pastille 8px + libellé dans une pilule 20-24px de haut, padding 2px 8px, fond couleur à ~10 % d'opacité, texte 12px medium. La couleur n'est jamais le seul porteur d'information.

## 3. Typographie
- 5 tailles maximum : 12 / 13 / 16 / 20 / 28 px (métadonnées / corps / titres de cartes / titre de page / chiffres KPI).
- Graisses 400-500-600 uniquement ; 700 interdit (sauf wordmark de marque). Hiérarchie par taille + gris secondaire, pas par le gras.
- `font-variant-numeric: tabular-nums` sur TOUT chiffre affiché.
- Tracking -0.02em sur les chiffres ≥ 24px. Overlines : 11px uppercase, letter-spacing +0.06em, graisse 500.

## 4. Data-viz
- Sparkline : 100-140×32-40px en carte KPI, 80×24px en cellule. Trait 1.5px, zéro axe, zéro grille, point sur la dernière valeur, dégradé sous courbe à 8-12 %. Même échelle Y quand on compare.
- Jauges/progress : hauteur 4-6px, piste grise ~8 %. Pas de jauges circulaires décoratives.
- Bar chart miniature : barres 3-4px, gap 2px, hauteur 24-32px.
- Timeline : rail 2px, pastilles 8-10px colorées par sévérité, horodatage 12px gris tabular-nums, 12-16px entre événements.

## 5. Ergonomie
- Balayage en F : le KPI santé de flotte en haut à gauche, les actions en haut à droite.
- UN seul bouton primaire plein par écran ; secondaire = contour ; tertiaire = ghost ; > 3 actions → menu « ⋯ ». Jamais secondaire et tertiaire mélangés dans le même groupe.
- Tables : rangée 44px par défaut (compacte 36px, confortable 48-52px), chiffres à droite, texte à gauche, en-têtes en overline, hover fond +3 %.
- Progressive disclosure : page = les 3 contrôles qui comptent + alarmes ; le reste derrière un libellé honnête ; détail en panneau latéral.
- États vides honnêtes : dire ce qui est vide, pourquoi, UNE action proposée ; vide ≠ erreur ≠ zéro résultat filtré.

## 6. Mobile compagnon
- Tab bar : 49pt + 34pt safe area = 83pt ; icônes 25×25pt ; 3-5 onglets max.
- Cibles ≥ 44×44pt partout, y compris lignes de liste.
- Cartes pleine largeur, marges latérales 16pt, gap 12pt ; KPI santé en premier.
- Pull-to-refresh + horodatage « Updated X min ago » toujours visible.
- Actions destructives : jamais dans la tab bar — fin de fiche + confirmation.

## LES 15 RÈGLES D'OR
1. Une seule pile d'ombre partout : `0 0 0 1px rgba(0,0,0,0.08), 0 2px 2px rgba(0,0,0,0.04)`.
2. 5 tailles de texte max : 12/13/16/20/28. Toute exception se justifie par écrit.
3. Graisses 400-500-600 uniquement ; 700 interdit (hors wordmark).
4. `tabular-nums` sur tout chiffre.
5. Tracking -0.02em sur chiffres ≥24px ; overlines 11px uppercase +0.06em graisse 500.
6. 3-5 cartes KPI en première rangée, jamais six.
7. Sparkline 100×32, trait 1.5px, zéro axe, dégradé 10 %.
8. Statut = pastille 8px + libellé, pilule 20-24px, fond 10 % ; couleur jamais seule ; jamais en fond de zone.
9. Un seul bouton primaire plein par écran ; contour puis ghost ; >3 actions → « ⋯ ».
10. Séparer par l'espace ; aucun trait interne aux cartes ; inter-groupes ≥ 2× intra.
11. Rangées 44px (compacte 36), chiffres à droite, hover +3 %, cibles internes ≥44px.
12. Détail en panneau latéral 380-480px, jamais une nouvelle page.
13. 6 états conçus par composant ; focus anneau 2px ; active scale 0.97.
14. État vide = cause + UNE action ; vide/erreur/zéro-résultat distincts.
15. Mobile : tab bar 3-5 onglets 49pt+34pt, cibles ≥44pt, fraîcheur affichée.
