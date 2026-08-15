# Audit — la boîte des SMS reçus, et le geste de fermeture

> Phase 0 : cartographie, cadrage, questions. Document repris de zéro,
> sur pièces — chaque affirmation porte son fichier et sa ligne.
> Il s'enrichira à chaque phase (casse-test, inventaire, refonte, plan).

---

## 0. Méthode

Lecture intégrale du code de la plateforme web et des maillons du robot
qui la nourrissent ; relevé systématique de tout ce qui ferme, annule ou
interrompt ; liste des points durs décelables à froid, chacun devant
être PROUVÉ ou infirmé par le casse-test de Phase 1 — rien ne sera
affirmé sans avoir été exécuté.

## 1. Le terrain

- **Pile web** : Next.js 16 (App Router, rendu serveur dynamique),
  React 19, Tailwind v4 à jetons (`web/app/globals.css`), textes
  bilingues par dictionnaires (`web/lib/textes/`). Pas de bibliothèque
  de composants : tout est maison.
- **Données** : le Raspberry Pi est la source de vérité ; Supabase n'est
  qu'un relais lu par le serveur Next (`web/lib/serveur.ts`) — la clé ne
  quitte jamais le serveur. Le canal descendant (boutons → terminal)
  passe par la table `commandes` (`web/app/api/commande/route.ts`, qui
  borne et nettoie chaque champ — une réponse USSD est même purgée des
  caractères qui injecteraient des ordres AT au modem).
- **Temps réel** : une veille de 5 s (`web/app/veille.tsx:12`) interroge
  `/api/actualite` ; un SMS nouveau déclenche `router.refresh()`
  (`veille.tsx:49`) — l'écran entier se re-rend, où qu'on soit.
- **Verrou** : un mot de passe unique, session signée, middleware qui
  protège tout (`web/middleware.ts`).

## 2. Le chemin d'un SMS, de l'antenne à l'écran

| Étape | Fichier |
|---|---|
| Relève au modem, PDU recomposés | `totem/modem.py`, `totem/pdu.py` |
| Lecture (montant, tiers, référence) — `None` dans le doute | `totem/analyse_sms.py` |
| Journal local, source de vérité | `totem/storage.py` |
| Poussée cloud, hors-ligne d'abord | `totem/nuage.py` |
| Table `paiements` — le texte d'origine fait foi | `sql/schema.sql` |
| Mise en forme serveur (1000 SMS + 1000 reçus chargés) | `web/lib/serveur.ts:151` |
| La boîte : recherche, filtres, pages de 60 | `web/app/encaissements/liste.tsx` |
| La fiche : lecture, nature → reçu PDF | `web/app/fiche-sms.tsx` |
| Non-lus : marquage à l'ouverture | `web/app/api/lu/route.ts` |

Deux lois du dépôt encadrent toute refonte : **le message d'origine fait
foi** (jamais reformulé) et **rien ne s'invente** (dans le doute, on
s'abstient).

## 3. Les deux problèmes — portées distinctes

**A. Le module « SMS reçus »** (portée : module). Recevoir et lire un
SMS doit être sans effort. L'état courant du code structure la liste en
qui / combien / quand / deux lignes d'aperçu, pages de 60, filtres sur
une ligne ; la fiche ouvre sur qui-combien, le message entier, les
gestes, les détails sous un pli. C'est CET état qui passe au casse-test
de Phase 1 — il n'est pas présumé bon.

**B. Le geste de fermeture** (portée : plateforme). Trois sémantiques
sous un même dessin : *fermer* une lecture (anodin), *annuler* une
préparation (perd une saisie), *raccrocher* une session USSD en cours
(interrompt un dialogue d'argent avec le réseau). Un motif partagé
existe (`web/app/fermer.tsx` — pastille pleine) ; sa sémantique, elle,
n'est PAS encore différenciée : c'est l'objet de la Phase 4a.

## 4. Inventaire exhaustif de ce qui ferme, annule ou interrompt

| Où | Geste réel | Référence | Risque |
|---|---|---|---|
| Fiche SMS — pastille | fermer (lecture) | `web/app/fiche-sms.tsx:236` | faible |
| Fiche SMS — clic sur le fond | fermer | `fiche-sms.tsx:210` | faible |
| Pop-up opération — pastille | **annuler → `ussd_fin` si session ouverte** | `web/app/operation.tsx:188` → `:170` | **élevé** |
| Pop-up opération — clic sur le fond | **même interruption, sans confirmation** | `operation.tsx:182` | **élevé — arrêt accidentel possible** |
| Pop-up opération — bouton rouge | annuler la session (explicite) | `operation.tsx:~270` | voulu |
| Session USSD — pastille | raccrocher (inerte pendant la composition) | `web/app/ussd/console.tsx:211` | élevé |
| Session USSD — clic sur le voile | **raccrocher sans confirmation** | `console.tsx:203` | **élevé — arrêt accidentel** |
| Session USSD — bouton rouge / « Fermer » | annuler / fermer session finie | `console.tsx` pied | voulu |
| Recherche de la boîte — croix | effacer la saisie (autre sémantique) | `encaissements/liste.tsx:114` | faible |
| Réglages — deux croix bordées | annuler une saisie | `reglages/interactifs.tsx:138`, `:244` | faible |
| **Touche Échap** | **absente partout** | — | clavier sans issue |

## 5. Points durs relevés à froid — à prouver en Phase 1

1. **Arrêt accidentel d'une session d'argent** : le fond cliquable
   interrompt sans confirmation (`operation.tsx:182`,
   `console.tsx:203`). Un pouce qui dépasse la feuille suffit.
2. **Aucune grammaire de dialogue accessible** : pas de
   `role="dialog"`, pas d'`aria-modal`, pas de piège de focus, pas
   d'Échap — au clavier comme au lecteur d'écran, les fenêtres n'ont
   ni entrée ni sortie annoncées.
3. **Course veille ↔ fenêtres ouvertes** : `router.refresh()` part à
   chaque SMS entrant (`veille.tsx:49`) pendant qu'une fiche ou une
   session est ouverte. La fiche garde alors une copie FIGÉE du SMS
   (`liste.tsx` passe l'objet en l'état) : reçu établi entre-temps,
   position de défilement, feuille de session — que survit-il ?
4. **La recherche ment par omission** : elle ne fouille que les 1000
   derniers SMS chargés (`serveur.ts:159`) sans jamais le dire. Sur un
   an d'activité, un paiement ancien devient introuvable en silence —
   contraire à la loi « un silence vaut mieux qu'un mensonge » ?
5. **Poids par visite** : 1000 SMS + 1000 reçus re-mis en forme à
   CHAQUE rendu de la boîte, et re-téléchargés à chaque SMS entrant
   (veille). À mesurer sur téléphone réel.
6. **Non-lu qui échoue en silence** : si `/api/lu` répond 502, le point
   « non lu » reste malgré la lecture, sans nouvelle tentative
   (`fiche-sms.tsx:79`).
7. **Doublons à la chaîne** : cinq relevés de solde identiques
   d'affilée occupent cinq lignes — bruit réel constaté sur captures
   du propriétaire.
8. **Pagination et jours coupés** : les pages de 60 tranchent au
   milieu d'un jour ; l'en-tête du jour ne se répète pas après
   « Afficher plus ». À vérifier visuellement.
9. Corps hostiles jamais éprouvés : émojis, écritures droite-à-gauche,
   320 px de large, double-clic frénétique, réseau à 2G.

## 6. Questions critiques — réponses attendues avant la Phase 1

1. **Terrain premier.** Les captures sont un iPhone/Safari. Confirmez :
   mobile d'abord (Safari iOS ? Chrome Android aussi ?), l'ordinateur
   en second.
2. **Le geste d'arrêt — LA décision de fond.** Pendant une opération
   d'argent en cours : (a) la pastille et le fond interrompent
   immédiatement (état actuel) ; (b) seul le bouton rouge explicite
   interrompt, pastille et fond deviennent inertes en session ;
   (c) pastille et fond demandent confirmation (« Arrêter la
   session ? ») dès qu'une saisie a commencé. **Recommandation : (c)
   pour la pastille, et fond inerte en session** — un arrêt trouvable,
   jamais accidentel.
3. **Les doublons.** Droit de regrouper à l'affichage cinq relevés de
   solde identiques (« Solde consulté 5 fois », dépliable) — le journal
   gardant tout ?
4. **La profondeur d'historique.** 1000 SMS suffisent-ils, ou la
   recherche doit-elle fouiller tout l'historique (recherche côté
   serveur) ? A minima : la boîte doit-elle DIRE quand elle ne montre
   pas tout ?
5. **Captures attendues** (état déployé actuel, votre téléphone) : la
   boîte, une fiche ouverte, un transfert au moment du pavé.

## 7. Suite du protocole

- **Phase 1** : casse-test outillé (Playwright, données hostiles,
  réseau bridé, viewports 320→1440, clavier, course veille/fenêtres) —
  chaque défaut avec son déclencheur exact.
- **Phase 2** : verdict sur chaque ligne du tableau §4, avec preuve.
- **Phase 3** : règles de conception (dialogues, feuilles, arrêt sûr),
  tirées des principes de Paul Graham et des usages établis — en règles
  actionnables, pas en citations.
- **Phase 4** : refonte — motif d'arrêt/fermeture unique et sûr,
  puis le module SMS. Captures à l'appui.
- **Phase 5** : plan d'implémentation ordonné, `fichier:ligne`.

---

## 8. Phase 1 — verdicts du casse-test (preuves au harnais Playwright)

| Épreuve | Avant correctifs | Après correctifs |
|---|---|---|
| Échap, fiche ouverte | inopérant (défaut prouvé) | ferme ✔ |
| Fond cliqué, saisie remplie | feuille fermée, saisie PERDUE | feuille protégée ✔ |
| Échap, saisie remplie | perte sèche | question « Arrêter ? » ✔ |
| « Continuer » après la question | — | saisie intacte ✔ |
| 5 relevés de solde identiques | 5 lignes | 1 ligne « ×5 », dépliable ✔ |
| Émojis, RTL (arabe), 390 px | rendus sans casse | idem ✔ |
| 320 px de large | aucun débordement | idem ✔ |

## 9. Phases 4–5 — décisions appliquées (validées par le propriétaire)

- **Arrêt sûr (plateforme)** — règle unique, `web/app/fermer.tsx` :
  tant qu'il y a quelque chose à perdre (saisie commencée, session ou
  composition en cours), le FOND est inerte et la pastille comme ÉCHAP
  posent la question « Arrêter ? » (`ConfirmationArret`) ; le bouton
  rouge explicite reste direct. Une lecture (fiche SMS) ferme sans
  question. `role="dialog"` + `aria-modal` posés sur les fenêtres.
- **Recherche sur TOUT l'historique** — `rechercherPaiements`
  (`web/lib/serveur.ts`), route `/api/recherche`, branchée à la boîte
  avec 350 ms de calme après la frappe ; le fil dit « N résultats sur
  tout l'historique ». La question est purgée des caractères qui
  structurent la syntaxe PostgREST : elle ne peut que s'insérer comme
  motif, jamais réécrire la requête.
- **Répétitions repliées** — les messages identiques consécutifs SANS
  montant (soldes en rafale, publicités) tiennent en une ligne « ×N »
  dépliable ; un message qui porte un montant ne se regroupe jamais ;
  le journal garde tout.

Reste ouvert, assumé : le piège de focus complet des dialogues (le
clavier peut encore tabuler derrière la fenêtre) — noté pour une
prochaine fournée ; et la liaison reçu↔SMS des résultats de recherche
s'appuie sur les 1000 derniers reçus chargés.
