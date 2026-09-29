# annonce/ — la vidéo d'annonce de TOTEM

**59,7 secondes**, deux formats : **16:9** (YouTube, LinkedIn, un écran de
salon) et **9:16** (statut WhatsApp, TikTok, Reels). Les deux sont dans
`rendu/`.

Pourquoi sous la minute : un statut WhatsApp coupe à soixante secondes, et
sur un fil la plupart des gens décrochent avant. Le nom TOTEM se pose donc à
15 s — la première version ne le montrait qu'à 64 s, après la coupure. Et la
première image porte déjà une phrase : sur un fil, la vidéo part muette et
l'image 0 sert d'aperçu.

## Le film, en sept actes

1. **La distance.** L'écran fendu en deux : Douala, où les paiements
   arrivent ; là-bas, un téléphone en veille, « Aucune notification ». Puis le
   *126# qu'on tape, qui échoue, et le réseau qui lâche. Le film se rembobine.
2. **Le point, et le nom.** Dans le silence, un point de latérite ; la Tresse
   se trace à la place de la couture, et le nom se pose : « Un boîtier au
   pays. Vos cartes SIM dedans. »
3. **Ce qu'il fait.** Le drop. Il écoute, il lit ; l'écran se fend comme à
   l'ouverture — à gauche le menu du réseau, qui tremble, à droite les mêmes
   lignes devenues boutons, nettes ; il compose le *126# à votre place, et le
   reçu suit.
4. **Le piège.** Un SMS piégé ; une machine naïve y lit 550 000 000 FCFA.
   L'image gèle, le son se tait. TOTEM : « Illisible. Aucun montant. » — et
   cette preuve reste à l'écran pendant la morale.
5. **L'épreuve.** 30 000 SMS piégés, lancés contre lui. Le courant saute :
   rien n'est compté deux fois. Un nouveau compte attend votre accord.
6. **Le rappel.** Vos SIM, au pays. Vous voyez. Vous agissez. La Terre, et
   les distances.
7. **La signature.** La Tresse, le nom, « Une télécommande. Aucun argent n'y
   transite. », la devise, « Bientôt ».

**Le faux tremble, le vrai ne bouge pas.** Un montant faux, une panne, une
panique vivent dans le MONDE et subissent glitch, secousse, aberration. Un
chiffre juste, l'interface réelle, la marque se posent dans la couche VÉRITÉ,
que la post-production ne touche jamais — seule la caméra la déplace.

Tout est **calculé** : aucune image de banque, aucun échantillon sonore, aucun
logiciel de montage. Chaque image est une fonction du temps, dessinée par une
page Chromium ; chaque son est une formule. On peut donc retourner la vidéo à
l'identique, en changer une phrase, ou la tourner dans un troisième format,
en une commande.

```sh
node annonce/verifier-l-annonce.mjs          # d'abord : ce que l'annonce a le droit de dire
node annonce/tourner.mjs                     # 16:9 → annonce/rendu/totem-annonce-16x9.mp4
node annonce/tourner.mjs --format 9x16       # 9:16 → annonce/rendu/totem-annonce-9x16.mp4
node annonce/tourner.mjs --temps 16,24.5     # deux images en PNG, pour relire un plan
node annonce/tourner.mjs --de 16 --a 26      # un extrait, avec le son
python3 annonce/musique.py musique.wav       # la musique seule
```

Il faut Node 22 et playwright (son Chromium), Python 3 avec numpy, et un
ffmpeg qui sait écrire du H.264 (`FFMPEG=…`, sinon celui du `PATH`, sinon
celui du paquet Python `imageio-ffmpeg`). Les polices de la marque (Inter,
DM Sans) et une chasse fixe (JetBrains Mono) se téléchargent au premier
tournage dans `annonce/.polices/`, jamais versionnées.

## Comment c'est construit

| Fichier | Ce qu'il fait |
|---|---|
| `conducteur.json` | **La partition commune** : le tempo, les sections, les impacts. La musique et l'image la lisent toutes les deux. |
| `plateau/plans.js` | Le découpage : chaque plan, ses temps, sa transition, ses effets. |
| `plateau/scenes.js` | Les scènes : la nuit des SMS, la Terre, la Tresse qui se tresse, le pavé, le piège… |
| `plateau/interface.js` | Les écrans de l'application, redessinés à partir du code (`web/noyau/textes/`, `mobile/src/`). |
| `plateau/marque.js` | La Tresse, **recalculée** depuis les paramètres de `brand/generer.py`, et le mot tiré de `brand/totem-logo.svg`. |
| `plateau/effets.js` | La post-production : aberration chromatique, lueur, glitch, flous de mouvement, grain, transitions en losange et en claustra. |
| `plateau/objets.js` | La puce SIM, le boîtier en isométrique, la Terre en points (Natural Earth, domaine public : `plateau/terre.json`). |
| `musique.py` | La musique : kick 808, log drums d'amapiano, balafon, braams, montées, impacts, le « ting » du SMS. |
| `tourner.mjs` | Le banc : plusieurs Chromium en parallèle, une image chacun à son tour, puis ffmpeg. |

**Le temps se compte en temps musicaux**, pas en secondes. Un plan qui
commence « au temps 32 » tombe sur le coup que la musique pose au temps 32 —
par construction, pas parce que quelqu'un l'a recalé à l'oreille.

**Pourquoi du 2D et pas du WebGL** : mesuré sur la machine de tournage, la
passe WebGL coûtait 210 ms par image (le processeur y imite une carte
graphique qu'il n'a pas) ; la même chaîne en compositions 2D tient en 45 ms.
Une minute se tourne en moins de deux.

## Ce qui est vérifié

- **La marque** : au démarrage, le plateau recalcule les deux brins et les
  coupes du passage dessous, et les compare au millième à
  `brand/totem-symbole.svg`. S'ils divergent, rien ne se tourne.
- **Le découpage** : les plans doivent couvrir le conducteur sans trou ni
  chevauchement.
- **Ce que l'annonce dit** (`verifier-l-annonce.mjs`) : aucune promesse que le
  dépôt ne tient pas (« IA », « dans les magasins », « chiffré de bout en
  bout », « partenaire de MTN », « à la seconde »…), aucune personne réelle
  (les noms et numéros relevés sur de vrais SMS dans les tests). Le harnais
  porte son témoin : une phrase interdite glissée exprès, qu'il doit attraper.

## Ce que la charte impose ici

- La marque est un **aplat mat** : les effets vivent dans les transitions, la
  caméra, la lumière du décor — jamais sur le symbole ni sur le mot une fois
  posés. Lueur et vignette sont coupées quand le logo tient l'écran.
- **Pas de logo d'opérateur** : ce sont des marques de tiers. Leurs couleurs
  n'apparaissent qu'en pastille de quelques points, comme dans l'application.
- **Le motif ne passe jamais derrière un montant.**
- **Les données** sont celles du faux nuage des essais (MAMA CLARISSE,
  TAILLEUR JEAN, BOUTIQUE AKWA, MTN ·8901…), jamais un vrai client.
- **Le téléphone dessiné est un Android générique** : c'est là que la
  sonnerie est prouvée. Sans clé Apple, un iPhone ne sonne pas encore
  (`docs/MOBILE.md`).
