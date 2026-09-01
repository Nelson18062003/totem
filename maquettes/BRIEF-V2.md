# ORDRE DE MISSION — TOTEM ADMIN v2

Tu es **chef d'équipe d'un seul écran** de la console super-admin TOTEM.
La v1 a été rejetée par le propriétaire : « trop de boutons, composants et
éléments mal faits, les tailles sont horribles, tu ne respectes pas les
dimensions ». On refait tout, au millimètre, avec un système de design commun
et un contrôle dimensionnel à la machine.

Répertoire de travail : `/tmp/claude-0/-home-user-totem/fb61f3f9-bcef-57b0-8fbd-bfd6b9054382/scratchpad/admin/v2`
**Travaille uniquement dans ce répertoire.**

## 1. À lire AVANT d'écrire une ligne (obligatoire)
- `NORMES.md` — la spécification dimensionnelle. **Aucune valeur hors de ces échelles.**
- `FICHE-CRAFT.md` — les 15 règles d'or et les techniques des meilleures consoles.
- `HISTOIRE.md` — les données canoniques. **Ton écran doit dire exactement la
  même chose que les autres** (mêmes terminaux, mêmes soldes, mêmes horaires).
- `systeme.css` — la feuille commune : lis-la en entier, tu dois connaître les
  classes disponibles. `galerie.src.html` + `galerie.png` montrent chaque
  composant en situation : c'est ton catalogue de pièces.
- `sprite.html` — le jeu d'icônes (`<svg class="ic16"><use href="#i-flotte"/></svg>`).

## 2. Fichiers partagés — INTERDICTION d'y toucher
`systeme.css`, `sprite.html`, `chrome.html`, `barre-droite.html`, `normes.json`,
`mesure.mjs`, `forger.mjs`, `NORMES.md`, `HISTOIRE.md`, `galerie.*`.
Huit équipes travaillent en parallèle : une modification partagée casserait le
travail des autres. Si une classe manque, écris-la dans le `<style>` de TON
fichier, avec des valeurs prises dans les échelles de `NORMES.md`, et signale-le
dans ton rapport final.

## 3. Le contrat de fabrication
Tu écris **un seul fichier** : `TON-NOM.src.html`. Il doit contenir, dans cet ordre :

```html
<meta charset="utf-8"><title>TOTEM ADMIN — …</title>
<!--SYSTEME-->
<style>
  /* uniquement ce qui est propre à cet écran, valeurs issues de NORMES.md */
</style>
<!--SPRITE-->
<body data-ecran="fleet">   <!-- fleet|terminals|sims|clients|releases|audit|alerts -->
<div class="app">
  <!--RAIL-->
  <main>
    <header class="barre">
      <h1>Fleet overview</h1><span class="ariane">7 sites · Cameroon</span>
      <!--BARRE-DROITE-->
    </header>
    <div class="page">
      … TON ÉCRAN …
    </div>
  </main>
</div>
```

Les marqueurs `<!--RAIL-->` et `<!--BARRE-DROITE-->` injectent le chrome commun :
**ne le réécris jamais à la main**, le rail doit être identique au pixel sur les
sept écrans desktop. `data-ecran` allume tout seul le bon élément de navigation.

Puis, à chaque itération :
```sh
cd .../scratchpad/admin/v2 && node forger.mjs TON-NOM
```
Cette commande assemble, **mesure**, et capture `TON-NOM.png`.

## 4. La boucle de qualité — non négociable, minimum 3 tours
1. Écrire / corriger le `.src.html`.
2. `node forger.mjs TON-NOM` → **zéro violation exigée**. Tant qu'il reste une
   violation, tu corriges : c'est une erreur de fabrication, pas un avis.
3. **REGARDER l'image** avec l'outil Read. Vraiment la regarder : alignements,
   respirations, longueurs de ligne, équilibre des colonnes, hiérarchie,
   ce qui déborde, ce qui est trop dense, ce qui est vide pour rien.
4. Corriger ce que tu as vu. Recommencer.
Tu ne rends ton travail qu'après **au moins 3 tours complets** et une dernière
capture propre à zéro violation.

Hauteur de page visée : **940 à 1400 px**. Plus haut = tu as mis trop de choses ;
choisis, hiérarchise, coupe. Aucun débordement horizontal (l'outil le refuse).

## 5. Déploie ta propre sous-équipe (exigé)
Tu es chef d'équipe, pas artisan solitaire. Lance en parallèle, avec l'outil
Agent (`subagent_type: "general-purpose"`), **au moins deux spécialistes** qui
te rendent du matériau que tu assembles et corriges toi-même :
- un **ergonome** : à qui l'écran s'adresse, ce qu'on doit voir en 2 secondes,
  l'ordre de lecture, ce qui doit disparaître, la hiérarchie des actions
  (rappel : UN SEUL bouton plein sur tout l'écran) ;
- un **facteur d'instruments** : les SVG dessinés à la main dont ton écran a
  besoin (sparkline, jauges, barres de signal, diagramme, fil vertical…) aux
  dimensions exactes de `NORMES.md`, rendus sous forme de fragments HTML prêts
  à coller, testés hors ligne ;
- (si utile) un **rédacteur** : chaque libellé en anglais naturel de locuteur
  natif, court, concret, jamais du jargon technique — « the terminal is
  reporting » plutôt que « heartbeat OK ». Aucun texte de remplissage.
Donne-leur le chemin de ce brief et des fichiers à lire. Tu restes responsable :
tu vérifies, tu mesures, tu regardes, tu corriges.

## 6. Les fautes de la v1 à ne pas refaire
- Tailles de police en demi-pixels et micro-textes à 9 px → **échelle fermée**.
- Boutons de hauteurs disparates, cibles minuscules → **28 / 32 / 40 seulement**.
- Lignes de table inégales → **44 px partout dans une même table**.
- Trop de boutons partout → **un seul plein**, le reste en contour puis fantôme,
  au-delà de trois actions un menu « ⋯ ».
- Aplats de couleur trop larges → la couleur vit dans une pastille ou une pilule.
- Cartes qui flottent avec des ombres différentes → **une seule pile d'ombre**.
- « EN | FR » → **toujours « English | Français » en toutes lettres**.
- Du remplissage qui ne raconte rien → chaque ligne de l'écran doit être vraie
  au regard de `HISTOIRE.md`.

## 7. Ton rapport final (texte de retour)
En français, court : ce que montre l'écran et pourquoi cette organisation ;
le résultat de la dernière mesure (doit être « zéro violation ») ; la hauteur
de page finale ; ce que tes 3 tours ont corrigé ; toute classe locale que tu as
dû créer. Pas de recopie de code.
