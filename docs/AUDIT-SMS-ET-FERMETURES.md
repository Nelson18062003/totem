# Audit — la boîte des SMS reçus, et le geste de fermeture

> Document de travail. Phase 0 : comprendre, cadrer, questionner.
> Il s'enrichit à chaque phase (audit, casse-test, refonte, plan).

---

## 1. Le système, en bref

TOTEM fait recevoir sur la plateforme web les SMS que les cartes SIM
reçoivent à Douala. Le chemin d'un SMS, de l'antenne à l'écran :

| Étape | Où | Fichier |
|---|---|---|
| Le modem relève le SMS (PDU, SMS longs recomposés) | Raspberry Pi | `totem/modem.py`, `totem/pdu.py` |
| Lecture : montant, tiers, référence, solde | Pi | `totem/analyse_sms.py` |
| Journal local (source de vérité) | Pi | `totem/storage.py` |
| Poussée vers le cloud (hors-ligne d'abord, file d'attente) | Pi | `totem/nuage.py` |
| Table `paiements` (texte d'origine + champs compris) | Supabase | `sql/schema.sql` |
| Lecture côté serveur, mise en forme | Web | `web/lib/serveur.ts` |
| La boîte : liste, filtres, recherche | Web | `web/app/encaissements/liste.tsx` |
| La fiche d'un SMS (lecture, nature, reçu PDF) | Web | `web/app/fiche-sms.tsx` |
| La veille : rafraîchissement + pastille des non-lus | Web | `web/app/veille.tsx` |

Deux principes du dépôt gouvernent tout : **le message d'origine fait
foi** (jamais reformulé, jamais traduit), et **aucune donnée n'est
inventée** (dans le doute, le robot s'abstient).

## 2. Deux problèmes, deux portées — à ne pas confondre

### Problème A — le module « SMS reçus » (portée : module)

Le module noyait l'utilisateur : chaque SMS s'étalait en entier dans la
liste (huit lignes pour un transfert Orange), deux rangs de filtres
avant le contenu, un en-tête chiffré en doublon de l'accueil, et une
fiche qui s'ouvrait sur un tableau de détails avant le message.

### Problème B — la fermeture invisible (portée : plateforme)

La croix de fermeture était un trait nu dans un coin, presque
invisible — sur la fiche d'un SMS, mais aussi sur le pop-up d'une
opération (solde, transfert) et sur la session USSD. Trois sémantiques
distinctes se cachaient derrière le même dessin :

- **fermer** une lecture (fiche d'un SMS) — sans conséquence ;
- **annuler** une opération en cours (pop-up) — interrompt une session ;
- **raccrocher** une session USSD — interrompt un dialogue avec le réseau.

Une interruption invisible est un danger fonctionnel, pas un défaut
cosmétique : ne pas trouver comment arrêter une session d'argent est
aussi grave que l'arrêter par mégarde.

## 3. État des lieux — ce qui est déjà traité (PR #45), ce qui reste

### Déjà livré, vérifié sous données hostiles

- **Liste compacte** : qui (nom en évidence) · combien (à droite) ·
  quand (opérateur · heure) · deux lignes de message au plus. Le texte
  entier vit sur la fiche.
- **Filtres calmés** : catégories sur une seule ligne qui glisse du
  doigt ; filtre d'opérateur masqué s'il n'offre aucun choix.
- **Pages de 60** avec « Afficher plus (N restants) » — mille lignes ne
  se rendent plus d'un coup.
- **Fiche hiérarchisée** : qui/combien en tête, le message entier,
  les gestes (reçu PDF, copie), la nature, les détails sous un pli.
- **Robustesse** : une catégorie hors référentiel (colonne libre en
  base) ne plante plus la liste entière ; une référence sans espace ne
  déborde plus (`break-words`), vérifié programmatiquement.
- **Fermeture visible** : pastille pleine `BoutonFermer`
  (`web/app/fermer.tsx`), posée sur les trois fenêtres.

### Encore ouvert (au programme des phases suivantes)

- Casse-test complet (Phase 1) : RTL/arabe, émojis, réseau lent,
  ouverture/fermeture rapides, SMS arrivant PENDANT une fiche ouverte
  (la veille rafraîchit la page : la fiche survit-elle ?), 320 px de
  large, navigation clavier, lecteur d'écran, focus enfermé ou pas.
- Sémantique fine du geste d'arrêt (Phase 4a) : la croix doit-elle
  pouvoir INTERROMPRE une opération d'argent, ou seulement le bouton
  rouge explicite ? Confirmation ou pas ? → question ouverte n° 2.
- Regroupement des doublons (cinq « solde consulté » d'affilée) →
  question ouverte n° 3.
- Les deux croix restantes des Réglages (annulation d'un formulaire,
  `web/app/reglages/interactifs.tsx:138` et `:244`) : sémantique
  « annuler la saisie », risque faible — à aligner sur le motif commun
  ou à laisser en boutons bordés ?

## 4. Inventaire des fermetures (après PR #45)

| Écran | Sémantique | Où | Risque si invisible |
|---|---|---|---|
| Fiche d'un SMS | fermer (lecture) | `web/app/fiche-sms.tsx:236` | faible — frustration |
| Pop-up d'opération | annuler / raccrocher si session ouverte | `web/app/operation.tsx:188` (→ `annuler()` → `ussd_fin`) | élevé — interrompt une opération d'argent |
| Session USSD | raccrocher (désactivée pendant la composition) | `web/app/ussd/console.tsx:211` | élevé |
| Recherche de la boîte | effacer la saisie | `web/app/encaissements/liste.tsx:114` | faible — autre sémantique, ne pas confondre |
| Réglages (édition, ajout) | annuler la saisie | `web/app/reglages/interactifs.tsx:138`, `:244` | faible |

Le motif commun est défini UNE fois : `web/app/fermer.tsx`. Les trois
fenêtres l'utilisent ; les sorties textuelles (« Annuler la session »,
« Fermer », en rouge ou bordé, en bas de feuille) doublent la pastille —
deux chemins de sortie, l'un au pouce, l'autre à l'œil.

## 5. Protocole de casse — Phase 1 (déjà exécuté / à venir)

Déjà exécuté (harnais Playwright + page d'essai aux données hostiles,
jamais committée) :

- catégorie inconnue du référentiel → avant : plantage total ; après :
  pastille neutre ✔
- référence de 80 caractères sans espace → aucun débordement
  horizontal (vérifié par mesure du `scrollWidth`) ✔
- 183 lignes → 60 rendues, pagination ✔
- puces de filtre qui se repliaient → une ligne défilante ✔

À venir (après réponses de Phase 0) : émojis et RTL dans le corps d'un
SMS ; arrivée d'un SMS pendant une fiche ouverte (course entre
`router.refresh()` de la veille et l'état local) ; réseau lent (fiche
« marquer lu » qui échoue) ; 320 px ; double-clic frénétique sur une
ligne ; clavier et lecteur d'écran ; session USSD ouverte pendant
qu'on lit un SMS.

## 6. Questions ouvertes — Phase 0 (réponses attendues)

1. **Terrain d'usage** : le mobile (Safari iPhone d'après les captures)
   est-il l'écran premier, l'ordinateur restant secondaire ? Le casse-
   test priorisera dans cet ordre.
2. **Le geste d'arrêt d'une session d'argent** : la pastille de
   fermeture doit-elle pouvoir interrompre une opération en cours, ou
   faut-il réserver l'interruption au seul bouton rouge explicite
   (« Annuler la session ») — la pastille ne faisant alors que fermer
   une session déjà terminée ? Une confirmation (« Arrêter la
   session ? ») est-elle souhaitée quand un montant a déjà été saisi ?
3. **Les doublons de solde** : cinq « The balance of your account… »
   identiques d'affilée — a-t-on le droit de les regrouper à
   l'affichage (« Solde consulté 5 fois », dépliable), sachant que le
   journal, lui, garde tout ?
4. **Captures utiles** : après fusion de la PR #45 — la boîte sur votre
   téléphone réel, une fiche ouverte, et un transfert au moment du pavé.
   C'est sur CET état qu'il faut poursuivre l'audit, pas sur l'ancien.
