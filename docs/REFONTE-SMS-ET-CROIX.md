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

*Les phases suivantes s'écriront ici après validation de celle-ci.*
