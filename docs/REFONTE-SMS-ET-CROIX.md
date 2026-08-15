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

*Phase 3 (références et principes de conception) : après validation.*
