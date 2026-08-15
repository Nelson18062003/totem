# Refonte : SMS entrants & croix de fermeture — journal de travail

Ce document suit la mission en cours : (A) refondre le module des SMS reçus
pour le rendre simple, (B) corriger, une fois pour toutes et partout, la croix
de fermeture invisible. Chaque phase s'écrit ici avant d'être validée par le
propriétaire. Aucun code d'interface ne change avant validation.

---

## Phase 0 — Analyse et cadrage

### Le projet, en une page

TOTEM héberge des SIM Mobile Money (MTN MoMo, Orange Money) sur un
Raspberry Pi resté à Douala ; le propriétaire, à distance, pilote tout par
Telegram et par une plateforme web. Trois logiciels cohabitent dans ce dépôt :

- **`totem/` (Python)** — le robot du Pi : modems, PDU, sessions USSD,
  analyse des SMS (`analyse_sms.py`), reçus PDF, Telegram, cloud Supabase.
- **`web/` (Next.js App Router + Tailwind v4)** — la plateforme web, bilingue
  FR/EN, qui lit Supabase et dépose des commandes que le robot exécute.
- **`recus/`, `brand/`** — les reçus PDF et l'identité (Simple Design System :
  neutres francs, rayon 8 px, aucune ombre, latérite réservée à la marque).

La donnée centrale est le **SMS** (`docs/SMS.md`) : tout est gardé intact,
l'interprétation (montant, sens, catégorie) vit *à côté* du texte, jamais à sa
place. Le propriétaire n'est pas informaticien : le dépôt nomme l'objet, pas
la technique.

### Les deux problèmes, bien distincts

**Problème A — le module SMS entrants (refonte de module).**
Recevoir et lire un SMS doit être un geste évident. Aujourd'hui : trop
d'informations d'un coup, écran mal organisé, et la fiche d'un SMS ouvre une
fenêtre qui mange l'écran, déverse tout, et force à défiler.
Portée : la boîte de réception (`web/app/encaissements/`), les derniers SMS de
l'accueil (`web/app/derniers-sms.tsx`), la fiche (`web/app/fiche-sms.tsx`).

**Problème B — la croix de fermeture invisible (motif transversal).**
La croix « X » qui ferme ou arrête est un petit trait gris pâle en haut à
droite, sans fond, sans étiquette, dupliquée à la main dans chaque écran.
Ce n'est pas un défaut du module SMS : le même trait sert sur l'accueil, le
solde, la session USSD, le lancement d'un code. Il se corrige **une fois**,
comme un composant partagé, appliqué partout — pas écran par écran.
Cas aggravé : quand la croix **arrête** une action (session USSD en cours),
son invisibilité est un danger fonctionnel, pas une laideur.

### Inventaire préliminaire des croix (sera approfondi en Phase 2)

| Où | Fichier | Ce que fait la croix | Taille | Risque |
|----|---------|----------------------|--------|--------|
| Fiche d'un SMS | `web/app/fiche-sms.tsx:221` | FERMER la fiche | 18 px, gris pâle, sans zone tactile élargie | faible |
| Pop-up d'opération (accueil, solde) | `web/app/operation.tsx:189` | ANNULER — envoie `ussd_fin`, **raccroche la session réseau** | 18 px | **élevé** |
| Session USSD (console) | `web/app/ussd/console.tsx:212` | RACCROCHER la session en cours | 16 px | **élevé** |
| Recherche (boîte de réception) | `web/app/encaissements/liste.tsx:106` | EFFACER la recherche | 15 px | faible |
| Réglages — numéro | `web/app/reglages/interactifs.tsx:138` | ANNULER l'édition | 14 px (dans un bouton bordé de 32 px) | faible |
| Réglages — ajout de code | `web/app/reglages/interactifs.tsx:244` | ANNULER l'ajout | 15 px (bouton bordé 36 px) | faible |

À quoi s'ajoute la fermeture par **clic sur le voile** : sur le pop-up
d'opération (`operation.tsx:177`), un clic à côté de la carte **raccroche une
session USSD en cours** — le geste le plus destructeur de la plateforme est
aussi le plus facile à faire par accident.

Trois sens différents cohabitent donc sous le même trait : **fermer** (rien ne
se perd), **annuler** (une saisie se perd), **arrêter** (une session réseau se
coupe). Le motif partagé devra les distinguer.

### Constats de cadrage

1. **Une passe de refonte a déjà eu lieu** (commits récents : fiche en
   feuille basse, session USSD en une seule carte, non-lus, catégories). La
   fiche actuelle sur `main` n'est déjà plus un plein écran sur ordinateur —
   mais sur téléphone elle peut toujours monter à `100dvh` (toute la hauteur),
   et elle empile montant + 6 lignes de détails + choix de nature + texte du
   SMS + 3 boutons. Il faut confronter les captures du propriétaire à l'état
   réellement déployé avant de refondre.
2. **La croix n'est pas un composant** : six occurrences écrites à la main,
   tailles 14 à 18 px, presque toutes sans zone tactile élargie (la cible
   recommandée est ≥ 44 px), couleur `--color-ink-faint` (#767676) sans fond.
3. **La branche de travail** `claude/sms-redesign-close-button-cn924f` est au
   niveau de `main` (f07c885). Rien à rebaser à ce jour.

### Questions posées au propriétaire (en attente de réponse)

1. Appareils réellement utilisés (téléphone d'abord ? lequel ? ordinateur ?).
2. Les captures d'écran envoyées correspondent-elles au déploiement actuel ?
   Captures demandées : accueil, boîte de réception, fiche d'un long SMS
   ouverte, session USSD (téléphone et ordinateur), pop-up d'opération.
3. Volume quotidien de SMS et gestes les plus fréquents (retrouver un
   paiement ? vérifier un montant ? établir un reçu ?).
4. La croix de la session USSD double un bouton rouge « Annuler la session »
   déjà présent en bas — la gêne vient-elle de la croix, du doublon, des deux ?
5. Langue principale du propriétaire à l'écran (anglais ou français).

### Réponses reçues (15 août)

Captures du déploiement réel (totemlabs.app, téléphone) : elles correspondent
à `main`. Tous les appareils comptent (téléphones Android/iOS, tablettes,
ordinateurs, toutes tailles). Tous les gestes comptent (retrouver un paiement,
vérifier un montant, établir un reçu). Les deux langues restent au même rang.
L'usage réel, visible dans les captures : **beaucoup de consultations de solde
identiques**, quelques transferts noyés entre elles.

---

## Phase 1 — Audit à charge du module SMS (banc d'essai adversarial)

### La méthode

La plateforme a été lancée en local, branchée sur un **faux nuage** (un
serveur qui imite Supabase et le robot de Douala) chargé de données hostiles :
713 SMS sur 30 jours, un SMS de 1 200 caractères, un mot de 360 caractères
sans espace, de l'arabe et des émojis, des tentatives d'injection HTML, un
code à usage unique en clair, des soldes répétés à l'identique. Un navigateur
piloté (Chromium/Playwright) a parcouru l'application en 320×568, 390×844 et
1440×900, mesuré chaque croix, chaque fenêtre, chaque hauteur — et le faux
nuage a **journalisé chaque ordre reçu** de l'application, preuve à l'appui.
Outils : `faux-nuage.mjs`, `audit.mjs` (hors dépôt, répertoire de travail de
la session ; captures d'écran transmises au propriétaire).

### Les défauts, du plus grave au plus bénin

**P0 — dangers fonctionnels**

1. **Un appui sur le voile raccroche une session USSD en cours, en silence.**
   Déclencheur : ouvrir « Solde » depuis l'accueil, attendre le menu de
   l'opérateur, toucher n'importe où au-dessus de la feuille. Preuve au
   journal du banc : `POST commandes {"type":"ussd_fin"}` — la fenêtre se
   ferme, aucune confirmation, aucun message. En plein transfert, c'est la
   session perdue d'un frôlement de pouce. (`web/app/operation.tsx:177`,
   même motif `web/app/ussd/console.tsx:203`.)
2. **La fiche d'un long SMS ne laisse aucune sortie visible.** À 390×844 elle
   couvre 100 % de l'écran (mesuré) : plus de voile atteignable. La croix
   défile avec le contenu (l'en-tête n'est pas épinglé) : après deux écrans de
   lecture, plus rien ne permet de sortir sans remonter. Échap ne fait rien,
   même au bureau (testé : la fiche reste). (`web/app/fiche-sms.tsx:202-221`.)
3. **La commande de fermeture/arrêt est quasi introuvable.** Mesures : cibles
   de 14 à 18 px (le minimum recommandé est 44 px), gris `#767676` sans fond
   ni bord, et la croix de la fiche SMS n'a **aucune étiquette** (`aria-label`
   absent : un lecteur d'écran n'annonce rien). Trois sens différents —
   fermer, annuler, arrêter — sous le même trait.

**P1 — la structure du module (le « déversement »)**

4. **La liste montre le texte brut entier de chaque SMS** : une consultation
   de solde pèse autant qu'un transfert de 5 381 060 FCFA ; un transfert
   Orange = 9 lignes ; le montant est écrit deux fois (en vert au-dessus, dans
   le texte en dessous). Une ligne peut dépasser 450 px de haut.
5. **Les soldes répétés noient tout.** L'usage réel (captures du propriétaire)
   : cinq « The balance of your account is… » identiques d'affilée, les vrais
   mouvements perdus entre eux. Rien ne regroupe, rien ne distingue.
6. **Le bandeau mange l'écran avant le premier SMS** : 41 % de la fenêtre à
   390 px, **68 % à 320 px** (un seul SMS visible). Deux pastilles « All »
   empilées (opérateur, catégorie) : indiscernables l'une de l'autre.
7. **La fiche déverse tout d'un coup** : montant + 6 lignes de détail + 4
   boutons de nature + aide + message entier + 2-3 boutons d'action = 7
   éléments interactifs. Même un transfert ordinaire force le défilement à
   390×844 (mesuré).
8. **« Établir le reçu » est le bouton principal de TOUS les SMS** porteurs
   d'une ligne source — publicité et messages d'information compris. Un appui
   fabrique un reçu PDF officiel pour une réclame (constaté sur la fiche d'une
   publicité). Et les natures sont proposées même quand la catégorie est déjà
   connue. (`web/app/fiche-sms.tsx:283-291`.)
9. **Aucune pagination** : 713 SMS → 7 898 nœuds, page de 104 478 px,
   ~2 s de chargement en local (le réseau réel fera pire). La base grossit
   sans fin ; l'écran charge jusqu'à 1 000 lignes à chaque visite.
10. **La barre flottante recouvre la dernière ligne** de la liste (~90 px
    occultés sur téléphone).

**P2 — défauts de finition**

11. Le robot masque les codes à usage unique avant stockage, mais l'écran
    affiche aveuglément ce que la base contient : une ligne d'avant le
    masquage (ou un raté du robot) montre le code en entier. Pas de seconde
    ligne de défense côté écran pour la catégorie `code`.
12. Le point « non lu » fait 6 px : imperceptible sur téléphone.
13. Arabe + émojis : rendu sans isolation bidirectionnelle, l'ordre visuel
    se brouille (reste lisible, mais désordonné).
14. Sur la feuille USSD, la croix (16 px, « raccrocher ») double le bouton
    rouge « Annuler la session » : deux commandes pour le même geste
    destructeur, d'apparences contraires.

### Ce qui tient bon (à préserver dans la refonte)

- Aucune injection ne passe : le texte hostile s'affiche tel quel, aucun
  dialogue déclenché (React échappe tout).
- Un SMS qui arrive **pendant** une session USSD ne la casse pas ; la veille
  rafraîchit l'écran sans fermer les fenêtres (testé, preuve à l'écran).
- Le pavé secret apparaît exactement quand le réseau demande le PIN, et le
  PIN ne quitte jamais l'écran en clair.
- Le regroupement par jour, la recherche qui ignore les espaces, le reçu à
  même la ligne : des acquis.

---

## Phase 2 — L'inventaire des croix (validé sur banc, preuves photographiées)

### La parade

Chaque croix de la plateforme a été photographiée en gros plan dans son
contexte (390×844, zoom ×3) et mesurée au pixel : cible, contraste, étiquette
d'accessibilité, état pendant l'attente. Image « parade des croix » transmise
au propriétaire.

| # | Écran | Fichier | Le geste réel | Cible | Étiquette (aria) | Risque |
|---|-------|---------|---------------|-------|------------------|--------|
| 1 | Fiche d'un SMS | `web/app/fiche-sms.tsx:221` | FERMER (rien ne se perd) | 18×18 px | **aucune** | piège (voir plus bas) |
| 2 | Recherche de la boîte | `web/app/encaissements/liste.tsx:106` | EFFACER la saisie | 15×15 px | « Clear the search » | bénin |
| 3 | Pop-up d'opération, formulaire | `web/app/operation.tsx:189` | ANNULER (champs perdus) | 18×18 px | « Close » | gênant |
| 4 | Pop-up d'opération, **session en cours** | `web/app/operation.tsx:189` | **ARRÊTER la session USSD** | 18×18 px | « Close » — **mensongère** | **danger** |
| 5 | Session USSD (console) | `web/app/ussd/console.tsx:212` | **RACCROCHER** | 16×16 px | « Hang up the session » | **danger** |
| 6 | Réglages (numéro, ajout de code) | `web/app/reglages/interactifs.tsx:138, 244` | ANNULER l'édition | 32–36 px, bordé | « Cancel » | bénin |

Constantes mesurées : trait `#767676` (contraste 4,54:1 — au-dessus du
minimum de 3:1 pour un composant, mais sans fond, sans bord, sans zone
tactile : **le problème est la taille et l'affordance, pas la couleur**),
aucun rembourrage (la cible EST le dessin), tracé de 1,5 px qui, rendu à
16 px, fait à l'écran un cheveu d'un pixel. La seule croix correcte de la
plateforme est celle des réglages (n° 6) — bordée, 36 px — et c'est la moins
risquée des six.

### Trois mensonges structurels

1. **Un même dessin, trois gestes.** Les n° 3 et 4 sont *le même bouton du
   même fichier* : avant le lancement il jette un formulaire, pendant la
   session il **coupe une session réseau réelle** — rien ne change à l'écran,
   pas même l'étiquette (« Close » dans les deux cas). L'utilisateur ne peut
   pas savoir ce qu'il s'apprête à faire.
2. **Les gardes sont inversées pendant l'attente** (`operation.tsx`) : le
   bouton rouge « Annuler la session » — le geste sûr et visible — est
   désactivé (`disabled={attente}`, ligne 269), mais la croix (ligne 188) et
   le voile (ligne 177) restent actifs et raccrochent sans confirmation.
   Le chemin le plus visible est fermé, les deux chemins invisibles restent
   ouverts.
3. **Pendant l'attente de la console USSD, aucune sortie n'existe** :
   croix désactivée (`console.tsx:210`), voile inerte (`:204`), pied masqué
   (`:240`). Terminal muet = écran verrouillé jusqu'à 30 secondes.

### Les sorties qui ne sont pas des croix (le motif complet)

- **Le voile** ferme trois fenêtres : fiche SMS (`fiche-sms.tsx:202`,
  fermeture sans perte — acceptable), pop-up d'opération
  (`operation.tsx:177`, **raccroche une session en cours** — prouvé au
  journal du banc, phase 1), console mobile (`console.tsx:203`, raccroche
  aussi, gardé par `!attente`).
- **Échap n'existe nulle part** : aucun `keydown` d'échappement dans toute
  l'application (vérifié par recherche exhaustive). Au bureau, la fiche
  reste ouverte devant un clavier muet.
- **Sorties absentes** : la fiche d'un long SMS défilée (en-tête non épinglé
  → plus aucune commande à l'écran) ; la régénération d'un reçu (jusqu'à
  90 s de guet, aucun bouton pour y renoncer).
- **Trois entrées, un même pop-up** : accueil (`accueil-client.tsx:126`),
  guichet des opérations (`actions/guichet.tsx:143`), console USSD — le
  motif défaillant est déjà *de facto* partagé ; il n'attend qu'un composant.

### Verdict

La croix n'est pas un composant : six copies manuelles, tailles 15 à 36 px,
étiquettes tantôt absentes, tantôt mensongères, gardes incohérentes. Le
danger est concentré là où la croix ARRÊTE (n° 4 et 5) : c'est précisément là
que la refonte doit séparer les familles — FERMER (discret, sans perte),
ANNULER (visible, saisie perdue), ARRÊTER (franc, rouge, confirmé si la
session est en cours).

---

## Phase 3 — Références extérieures et règles de conception

### Ce que disent les références (URL + date)

**Fenêtres et feuilles.**
- Une fenêtre modale est une *interruption* : elle se réserve aux décisions
  qui l'exigent, jamais aux tâches longues ou à la lecture — un contenu
  complexe forcé dans une modale prive l'utilisateur de tout contexte.
  (NN/g, « Modal & Nonmodal Dialogs », nngroup.com/articles/modal-nonmodal-dialog/, 23 avril 2021.)
- La feuille basse (bottom sheet) est le bon véhicule mobile pour un détail
  consulté depuis une liste : elle garde la liste visible, se tire vers le
  haut pour en voir plus, se balaie vers le bas pour sortir. Sa poignée fait
  au minimum 48 dp — la cible, pas le dessin.
  (Material Design 3, « Bottom sheets », m3.material.io/components/bottom-sheets, consulté le 15 août 2026 ;
  Apple HIG, « Sheets » — détentes et glisser-pour-fermer, developer.apple.com/design, consulté le 15 août 2026.)

**Fermer, annuler, arrêter.**
- « Distinguer *cancel* de *close* est critique pour ne pas perdre le travail
  de l'utilisateur » : étiquettes de texte plutôt qu'une croix ; confirmation
  avant toute fermeture destructrice ; par défaut, sauver plutôt que jeter.
  (NN/g, « Cancel vs Close », nngroup.com/articles/cancel-vs-close/, 1er septembre 2019.)
- Confirmation pour le destructif — mais l'« annuler après coup » (undo) vaut
  mieux qu'une pluie de confirmations ; la confirmation se réserve aux actes
  irréversibles. (NN/g, « Confirmation Dialogs Can Prevent User Errors »,
  nngroup.com/articles/confirmation-dialog/, 24 juin 2018.)
- Un geste lourd de conséquences ne doit jamais habiter à côté d'un geste
  bénin sous la même apparence. (NN/g, « Dangerous UX: Consequential Options
  Close to Benign Options », nngroup.com/articles/proximity-consequential-options/, 2 août 2020.)

**Cibles.**
- WCAG 2.2, critère 2.5.8 (AA) : 24×24 px minimum ; critère 2.5.5 (AAA) :
  44×44 px. Plateforme d'argent pilotée au pouce → on vise 44.
  (w3.org/TR/WCAG22/, décembre 2024.)

**Densité.**
- La divulgation progressive : montrer d'abord ce qui décide, révéler le
  détail à la demande — la densité se gère par étages, pas par entassement.
  (NN/g, « Progressive Disclosure », nngroup.com/articles/progressive-disclosure/, J. Nielsen.)

**Paul Graham** (principes, pas citations — traduits en règles d'action) :
- *Taste for Makers* (paulgraham.com/taste.html, février 2002) : le bon
  design est simple, résout le bon problème, a l'air facile, et **est un
  re-design** — on a le droit de jeter ce qui ne marche pas.
- *Design and Research* (paulgraham.com/desres.html, janvier 2003) : on
  dessine pour l'utilisateur réel — ici, un commerçant qui vérifie de
  l'argent sur un téléphone, pas un informaticien devant un tableau de bord.
- *Startups in 13 Sentences* (paulgraham.com/13sentences.html, février 2009) :
  mieux vaut faire une chose qui rend un utilisateur vraiment heureux —
  le module SMS n'a qu'un métier : **lire l'argent qui arrive**.

### Le contrat de conception (les règles que la phase 4 devra prouver)

Chaque règle est testable sur le banc de la phase 1 — c'est lui qui jugera.

**Famille des sorties (le motif transversal) :**
- **R1 — Trois familles, trois visages.** FERMER (sans perte) : bouton
  bordé, discret. ANNULER (saisie perdue) : étiquette de texte, jamais une
  croix seule. ARRÊTER (session réseau) : bouton rouge à texte explicite
  (« Raccrocher »), **jamais** une croix, **jamais** le voile.
- **R2 — 44×44 px minimum** pour toute commande de sortie, fond ou bord
  visible, étiquette d'accessibilité exacte (jamais « Fermer » sur un
  bouton qui arrête).
- **R3 — Toute fenêtre a trois sorties** : la commande visible, le voile ou
  le balayage (seulement si la sortie est sans perte), la touche Échap.
  L'en-tête qui porte la sortie est **épinglé** — il ne défile jamais.
- **R4 — Pendant une attente réseau, la sortie reste vivante.** On peut
  toujours réduire ou quitter l'écran d'attente sans tuer la commande ;
  jamais d'écran verrouillé.
- **R5 — Arrêter une session en cours se confirme** (un geste de plus,
  léger), sauf si la session est déjà finie — alors fermer est immédiat.
  Un composant unique porte ces règles ; aucun écran ne redessine sa croix.

**Module SMS :**
- **R6 — La liste montre la lecture, la fiche montre la preuve.** Une ligne
  = qui, quand, combien (l'interprétation) ; le texte brut vit dans la
  fiche, en entier, jamais tronqué dans son rôle de pièce à conviction.
- **R7 — Le signal avant le bruit.** Les mouvements d'argent dominent ;
  les consultations de solde répétées se replient (la dernière fait foi) ;
  les publicités s'assourdissent. Rien ne se supprime : tout reste
  accessible d'un geste.
- **R8 — Un seul geste principal par vue**, décidé par la catégorie : le
  reçu ne se propose que pour un mouvement d'argent ; jamais pour une
  publicité, un code, un message.
- **R9 — Budget d'écran : le premier SMS au-dessus du pli à 320 px.**
  Le bandeau (titre, recherche, filtres) tient en deux rangées au plus.
- **R10 — La fiche est une feuille, pas un écran.** Détail en feuille basse
  (téléphone) / panneau ou carte (bureau), la liste reste visible derrière ;
  tirée vers le haut pour le texte intégral — divulgation progressive.
- **R11 — La liste pagine.** L'écran charge une page raisonnable et va
  chercher la suite au défilement ; 10 000 SMS ne font pas 10 000 nœuds.
- **R12 — Seconde ligne de défense** : un SMS de catégorie `code` remasque
  ses chiffres à l'affichage, même si la base a laissé passer.

---

## Phase 4 — La refonte, construite et jugée sur le banc

Pas de maquettes : la refonte est **écrite dans le code**, lancée sur le banc
de la phase 1 (mêmes données hostiles), et mesurée règle par règle. Captures
« avant/après » transmises au propriétaire.

### a. Le motif de sortie — `web/app/feuille.tsx`

Un seul fichier définit désormais la sortie de tous les écrans :

- **`BoutonFermer`** — LA croix de la plateforme : cible ronde de **44×44 px**,
  bord visible, fond de carte, étiquette d'accessibilité obligatoire et
  exacte. Plus personne ne dessine sa croix à la main.
- **`Feuille`** — LA fenêtre : feuille basse sur téléphone (88 dvh au plus —
  le voile reste tapotable), carte centrée dès les écrans moyens. En-tête
  **épinglé** (la sortie ne défile jamais), pied épinglé (les gestes restent
  sous le pouce), **Échap** partout, voile cliquable.
- **`SortieRetenue` + `BarreArret`** — l'arrêt d'une session réseau : croix,
  voile et Échap mènent tous à la **même confirmation légère**, posée dans le
  pied de la fenêtre (jamais une fenêtre sur la fenêtre) : « Raccrocher la
  session ? — La garder ouverte / Raccrocher (rouge) ». Le bouton rouge
  visible passe par la même porte. Une session déjà finie ferme sans question.

Adopté par : la fiche SMS (`fiche-sms.tsx`), le pop-up d'opération
(`operation.tsx` — accueil, guichet, solde), la console USSD
(`ussd/console.tsx` — qui garde sa coquille de page sur grand écran mais
emprunte toutes les pièces), les réglages (`reglages/interactifs.tsx`).
La recherche garde sa petite croix « effacer » (geste bénin) avec une zone
tactile élargie à la marge négative.

Deux réparations de fond au passage :

- **Une attente n'est plus un verrou** : la croix ne se désactive jamais ;
  fermer pendant une attente abandonne l'écran (un compteur de génération
  jette les réponses tardives — l'écran refermé ne se rouvre pas tout seul).
- **Raccrocher est immédiat** : l'ordre `ussd_fin` part au terminal sans
  faire patienter l'écran ; la fenêtre se replie sur-le-champ.

### b. Le module SMS

**La liste montre la lecture, la fiche montre la preuve.**

- Une ligne de mouvement d'argent : pastille · numéro · heure · **montant**
  en première ligne, **la partie humaine** (le tiers, désormais transmis par
  `lib/serveur.ts` → `tiers`) en seconde — plus jamais neuf lignes de texte
  opérateur. Le texte intégral vit dans la fiche.
- **Les consultations de solde répétées se replient** derrière la plus
  récente (« n consultations identiques plus tôt » — dépliables, jamais
  supprimées).
- **Les publicités parlent à voix basse** (gris, deux lignes au plus) ; les
  messages sans montant s'écourtent à deux lignes ; un mot de 360 caractères
  sans espace casse proprement.
- **Un code à usage unique remasque ses chiffres à l'affichage**
  (`texteSurEcran`), même si la base a laissé passer une ligne d'avant le
  masquage du robot.
- **La liste se dévoile par pages de 60** au fil du défilement
  (IntersectionObserver) : mille SMS ne font plus mille lignes.
- Le bandeau tient en deux rangées : recherche, puis UNE rangée de
  catégories qui **glisse** horizontalement ; le filtre par carte n'apparaît
  que s'il y a plusieurs cartes (plus de double « Tous »).
- `dir="auto"` sur tout texte opérateur : l'arabe se lit de droite à gauche.

**La fiche** (feuille, jamais un écran) : en-tête épinglé (sens + montant +
tiers + croix), détails seulement s'ils existent, la **nature en une ligne**
(le choix ne se déploie qu'à « Modifier »), le message d'origine en entier —
replié au-delà de 380 caractères (« Voir tout le message »). **Un seul geste
principal, choisi par la catégorie** : le reçu pour l'argent, la copie pour
le reste — une publicité ne propose plus jamais d'établir un reçu ; la
régénération d'un document devient un lien discret.

### Le contre-audit — le banc rejoue tout (production, `next build`)

| Mesure | Avant (phase 1) | Après (prouvé sur banc) |
|---|---|---|
| Fiche d'un transfert @390 | 100 % de l'écran, défile | **84 %, sans défilement interne** |
| Long SMS ouvert @390 | 100 %, croix partie au défilement, aucune sortie | **58 %, replié, croix épinglée toujours visible** |
| Croix | 15–18 px, nues, étiquettes absentes/mensongères | **44×44 px, bordées, étiquettes exactes** |
| Voile pendant une session | **raccroche en silence** (prouvé au journal) | **confirmation — 0 `ussd_fin` accidentel** (prouvé) |
| Arrêt confirmé | — | **exactement 1 `ussd_fin`** (prouvé au journal) |
| Échap | inexistant partout | ferme / demande, partout |
| Attente réseau | écran verrouillé jusqu'à 30 s | sortie toujours vivante |
| Boîte, 713 SMS | 7 898 nœuds, page de 104 478 px | **818 nœuds, 73 lignes**, pages de 60 |
| Premier SMS @320 | 68 % de chrome, 1 SMS visible | **38 %, 3 SMS visibles** |
| Filtres | 4 rangées empilées, deux « Tous » | 1 rangée glissante, un seul « Tous » |
| Publicité | « Établir le reçu » en geste principal | copie seule — **aucun reçu proposé** |
| Code à usage unique | affiché tel que la base le donne | **remasqué à l'écran** (liste et fiche) |
| Injection HTML | inerte (React) | inerte, vérifié à nouveau |
| SMS pendant une session | la session tient | la session tient, vérifié à nouveau |
| Hydratation React | — | propre, zéro erreur JS |

Vérifications du dépôt : `python3 -m unittest discover -s tests` → **451
tests, OK** ; `cd web && npx next build` → **compile**.

### Phase 4 bis — Le contre-audit de la refonte (à charge, contre soi-même)

La refonte a été attaquée comme l'original : sondes sur le banc, relecture
froide du code. Constats, du plus grave au plus bénin.

**Prouvé sur banc :**

1. **(P0) La session orpheline.** Fermer l'écran PENDANT la composition
   initiale (Échap, croix ou voile — pop-up comme console) n'envoie aucun
   `ussd_fin` (sonde : 0 au journal). Si l'opérateur ouvre la session après
   la fermeture, elle reste pendue sur la SIM sans écran, jusqu'au délai
   opérateur — et peut bloquer la composition suivante. (L'écran, lui, ne
   ressuscite pas : le compteur de génération tient.) → À réparer : toute
   sortie pendant une commande en vol raccroche défensivement.
2. **(P1) Échap jette un formulaire rempli sans un mot.** Numéro et montant
   saisis, Échap → tout disparaît, aucune question (sonde). Le contrat dit
   « ANNULER : une saisie se perd → visible ». → Confirmation légère quand
   un champ est rempli.
3. **(P1) Le cadran reste armé pendant une session ouverte.** Les raccourcis
   et le champ de composition ne se désactivent que pendant l'attente — pas
   pendant la session (sonde : actif). Composer un second code empile deux
   sessions côté opérateur. → Désarmer le cadran tant que la session vit.
4. **(P1, accessibilité) Le clavier s'échappe de la fenêtre.** Douze
   tabulations et le focus est SORTI du dialogue (sonde), malgré
   `aria-modal` ; pas de focus initial, pas de retour du focus à la
   fermeture. → Piège à focus dans `Feuille`.
5. **(P2) Un pli de soldes peut cacher des non-lus** : la pastille du menu
   reste allumée alors que la liste semble lue. → Un point sur le lien du
   pli quand il couvre des non-lus.

**Constaté à la relecture du code :**

6. **(P1) « Copier le SMS » copie le texte BRUT** (`fiche-sms.tsx`) : pour
   un code dont l'écran masque les chiffres, la copie les exfiltre si la
   base n'était pas masquée. → Copier `texteSurEcran(p)`.
7. **(P2) Le libellé du pli ment** : « consultations identiques » — deux
   soldes consécutifs peuvent différer (un dépôt au guichet change le solde
   sans SMS de mouvement). → « n consultations de solde plus tôt ».
8. **(P2) L'annulation des réglages a perdu son état désactivé** pendant
   l'enregistrement (le `BoutonFermer` n'a pas de `disabled`). → Le lui
   rendre.
9. **(P2) Le défilement s'enchaîne derrière la feuille** (pas
   d'`overscroll-contain` sur le corps ; la page derrière peut bouger sur
   iOS). → Contenir le défilement.
10. **(P3) Le dialogue n'a pas de nom accessible** (`aria-labelledby`
    absent). 11. **(P3)** Le masque `\d{3,8}` rate « 51 42 08 » (le robot
    reste la première défense). 12. **(P3)** La recherche retrouve les
    chiffres masqués (elle lit le brut). 13. **(P3)** Validité HTML : un
    `div` de choix sans `dt/dd` dans le `dl`. 14. **(P3)** Un glisser
    commencé dans la feuille et lâché sur le voile ferme/demande (classique
    mousedown-dedans/mouseup-dehors). 15. **(P3)** « Voir tout le message »
    ne se replie plus.

**Arbitrages assumés (pas des défauts, à trancher en connaissance) :**

- Un SMS de solde propose toujours son reçu (légitime : le reçu de solde
  existe, `docs/SMS.md`).
- Choisir une nature établit le reçu dans la foulée (comportement hérité,
  désormais derrière « Modifier » — moins d'accidents ; scinder « étiqueter »
  d'« établir » reste possible plus tard).
- La barre flottante passe au-dessus des dernières lignes en cours de
  défilement (motif standard ; le bas de page est dégagé).
- Le serveur charge toujours jusqu'à 1 000 lignes (l'écran n'en rend que 60) :
  la vraie pagination serveur est LE chantier structurel suivant.

### Phase 4 ter — Les réparations, prouvées une à une

Les quinze défauts du contre-audit sont réparés, et chaque réparation a été
rejouée sur le banc (production, données hostiles) :

| Défaut | Réparation | Preuve au banc |
|---|---|---|
| 1. Session orpheline | Toute sortie pendant une commande en vol raccroche défensivement (`operation.tsx`, `console.tsx`) | fermer pendant la composition → **1 `ussd_fin`** au journal |
| 2. Saisie jetée sans un mot | Formulaire entamé → même confirmation que le reste (« Jeter la saisie ? ») ; vide → sortie directe | question posée, champ conservé par « Continuer la saisie », sortie directe à vide |
| 3. Cadran armé en session | Composeur et raccourcis désactivés tant que la session vit (+ garde dans `composer`) | raccourci inerte pendant la session |
| 4. Focus fugueur | Piège à focus dans `Feuille` : entre à l'ouverture, circule en boucle, revient à la fermeture | 20 tabulations, le focus reste dans la fenêtre |
| 5. Non-lus sous un pli | Le lien du pli porte le point des non-lus qu'il couvre | visuel |
| 6. Copie qui exfiltre | « Copier le SMS » copie CE QUE L'ÉCRAN MONTRE (`texteSurEcran`) | presse-papiers : « Your one-time code is •••••• » |
| 7. Libellé menteur | « n consultations de solde plus tôt » | à l'écran |
| 8. Annulation des réglages | `BoutonFermer` retrouve `disabled` pendant l'envoi | code |
| 9. Défilement fuyant | `overscroll-contain` sur les corps de feuille | code |
| 10. Dialogue sans nom | `aria-labelledby` relié à l'en-tête (`useId`) | code |
| 11. Masque troué | Le motif attrape aussi « 51 42 08 » (chiffres espacés/tirets) | code |
| 12. Recherche indiscrète | Elle lit le texte AFFICHÉ : chercher « 514208 » → 0 ligne | 0 résultat |
| 13. HTML invalide | La nature sort du `dl` (bloc frère, même dessin) | hydratation propre |
| 14. Glisser-fermer | Seule une pression NÉE sur le voile ferme | code |
| 15. Message sans retour | « Replier le message » après dépliage | à l'écran |

Régressions rejouées : voile-en-session → confirmation puis exactement
1 `ussd_fin` ; Échap ; zéro erreur JS ; 451 tests Python OK ; `next build` OK.

### L'œil du solde (demande du propriétaire, 15 août)

Sur la carte de l'accueil, un œil à côté du chiffre : un appui **cache le
solde** (`••••••`), un appui le remontre. Le choix est **retenu sur
l'appareil** (réglage d'écran, pas de compte — `localStorage`) et survit au
rechargement. Tant que le choix n'est pas lu, le solde reste caché : il ne
doit jamais apparaître PUIS se cacher. Étiquettes bilingues (« Masquer le
solde » / « Hide the balance »). Fichiers : `accueil-client.tsx`,
`icons.tsx` (`IconEye`, `IconEyeOff`), `lib/textes/accueil.ts`. Prouvé au
banc : caché → rechargé → toujours caché → remontré.

---

## Phase 5 — Ce qui est fait, ce qui reste, à qui la main

### Sur la branche `claude/sms-redesign-close-button-cn924f`, dans l'ordre

1. **Le motif de sortie** — `web/app/feuille.tsx` (nouveau) : `Feuille`,
   `BoutonFermer`, `BarreArret`, `SortieRetenue`. Piège à focus, Échap,
   voile, en-tête épinglé, confirmation d'arrêt.
2. **La fiche SMS** — `web/app/fiche-sms.tsx` : feuille, geste principal par
   catégorie, remasquage, repli du long message, nature en une ligne.
3. **La boîte** — `web/app/encaissements/liste.tsx` : lecture d'abord, plis
   de soldes, pages de 60, bandeau en deux rangées, `dir="auto"`.
4. **Les sessions** — `web/app/operation.tsx`, `web/app/ussd/console.tsx` :
   confirmation d'arrêt, raccrochage défensif, cadran désarmé en session,
   compteur de génération.
5. **Les données** — `web/lib/types.ts`, `web/lib/serveur.ts` : le `tiers`
   voyage jusqu'à l'écran.
6. **Les textes** — `lib/textes/{sms,ussd,guichet,accueil}.ts` : tout en
   double, anglais d'abord.
7. **L'œil du solde** — `web/app/accueil-client.tsx`, `web/app/icons.tsx`.
8. **Les réglages** — `web/app/reglages/interactifs.tsx` : boutons du motif.

### Ce que le propriétaire fait lui-même

1. **Relire ce journal**, et dire ce qui ne lui va pas (phase 6).
2. **Demander la pull request** quand il est satisfait — elle suivra le
   rituel du dépôt (`CLAUDE.md`) : relire `main`, rebaser, rejouer les
   vérifications, puis ouvrir.
3. **Après la mise en ligne, vérifier sur le vrai totemlabs.app** avec le
   vrai terminal : ouvrir un SMS, cacher le solde, lancer une session USSD
   et l'ANNULER — le vrai réseau doit bien recevoir le raccrochage.
4. Sur téléphone : vérifier que la feuille se ferme au doigt (voile, croix)
   et que rien ne dépasse sur son écran à lui.

### Les chantiers d'après (assumés hors de cette passe)

- **La pagination serveur** : l'écran ne rend que 60 lignes, mais le serveur
  charge encore jusqu'à 1 000 SMS par visite — le vrai remède est une API
  paginée (chargement à la demande depuis Supabase).
- **Le piège à focus de la feuille USSD sur téléphone** (la console garde sa
  coquille propre — le piège de `Feuille` ne s'y applique pas encore).
- **Scinder « étiqueter » et « établir le reçu »** : aujourd'hui choisir une
  nature établit le document dans la foulée (comportement hérité, désormais
  derrière « Modifier »).
- **« Tout marquer comme lu »** pour les plis de soldes anciens.

---

## Phase 6 — Le zoom sauvage (signalement du propriétaire, 15 août)

**Le symptôme.** Sur téléphone, l'écran zoome tout seul : en touchant des
boutons, en touchant des champs — l'usage devient pénible sur toute l'app.

**Pourquoi ça arrive — deux mécanismes du navigateur, pas un bug de TOTEM :**

1. **La loupe « serviable » de Safari.** Sur iPhone, quand on touche un champ
   de saisie dont le texte fait MOINS de 16 px, Safari juge le texte trop
   petit pour être tapé et zoome toute la page — et ne revient jamais en
   arrière tout seul. Six champs de la plateforme étaient à 14 px (la réponse
   d'une session USSD, les champs des réglages) : chaque appui dessus zoomait
   l'écran.
2. **Le double-tap de zoom.** Les navigateurs mobiles réservent le double
   appui au zoom. Deux appuis rapides sur un bouton — le pavé du code secret,
   les puces de catégorie, une liste qu'on parcourt vite — sont pris pour ce
   geste : l'écran zoome, puis dézoome. Il faut déclarer explicitement
   « ici, un appui est un clic » (`touch-action: manipulation`), et la
   plateforme ne le déclarait nulle part.

**Pourquoi l'audit ne l'avait pas vu :** le banc pilote un moteur de bureau
qui IMITE les tailles d'écran du téléphone — mais ces deux comportements
appartiennent aux vrais navigateurs mobiles (Safari surtout) et n'existent
pas dans l'imitation. Leçon retenue : les règles anti-zoom sont désormais
vérifiées par inspection directe (taille calculée de chaque champ).

**La réparation** (`globals.css`, + six champs) :

- `touch-action: manipulation` sur tout : un appui est un clic, jamais un
  geste de zoom. Le pincement à deux doigts reste permis — l'accessibilité
  ne se négocie pas (le réglage `maximumScale: 5` du viewport ne bouge pas ;
  pas de `user-scalable=no`, le remède brutal qui punit les malvoyants).
- Plus aucun champ sous 16 px : les six champs à 14 px passent à 16 px, et
  une règle de fond (`:where(input…) { font-size: 1rem }`, poids nul) protège
  tout champ futur qu'on oublierait d'habiller.

**Prouvé au banc :** 6 champs inspectés sur tous les écrans (accueil, boîte,
USSD en session, réglages, formulaire d'opération) → **zéro champ sous
16 px** ; `touch-action: manipulation` calculé sur les boutons partout.
