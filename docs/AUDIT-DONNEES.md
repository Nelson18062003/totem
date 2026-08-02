# Audit de la base et du pipeline de données — août 2026

Analyse de bout en bout du trajet **SIM → journal SQLite (Pi) → Supabase →
application web**, sur quatre angles : sécurité, intégrité du schéma, cohérence
du pipeline, échelle. Chaque point porte son emplacement (`fichier:ligne`), le
scénario réel qui le déclenche, l'impact, et le correctif.

Deux constats transverses d'abord :

- **Le socle est sain.** Le modèle « hors-ligne d'abord, le Pi fait foi, le
  cloud rattrape » est solide ; le bloc de migration `add column if not exists`
  est **complet** (aucune autre colonne manquante que `expediteur`, déjà
  rattrapée) ; les montants sont en `numeric` ; le bucket des reçus est privé.
- **Trois classes de défauts** reviennent : des **pertes silencieuses** (une
  panne qui ne dit pas son nom), un **problème d'heure** de bout en bout, et
  une **surface web non protégée**.

---

## 🔴 Critique

### C1 — Le numéro déclaré est effacé toutes les 60 s
`storage.py` — `voir_carte` refait à chaque recensement (toutes les
`VERIF_CARTES_SECONDES = 60`) :
`UPDATE cartes SET … numero = ? … WHERE iccid = ?` avec `carte.numero`, le
numéro **lu sur la puce** (`AT+CNUM`), presque toujours **vide** sur une SIM
prépayée. Le numéro saisi à la main (Telegram ou plateforme, via
`definir_identite`) est donc **écrasé par du vide dans la minute**.

- **Impact** : c'est la donnée « source de vérité » du sens des opérations
  (`_nos_numeros`). Sans elle, un dépôt/transfert reste sans sens tranché, et
  les reçus écrivent « Montant net » au lieu de « reçu »/« envoyé ». Le champ
  `nom` est épargné (l'`UPDATE` ne le touche pas) — le numéro doit l'être aussi.
- **Correctif** : ne jamais écraser un `numero` non vide par du vide —
  `COALESCE(NULLIF(?, ''), numero)` — ou séparer « lu sur la puce » de
  « déclaré par l'humain ».

### C2 — L'application web n'a aucune authentification réelle
`web/app/connexion/page.tsx` est une **maquette** (« rien n'est vérifié ici ») ;
il n'existe **aucun `middleware.ts`**, aucune route `/api/**` ne contrôle de
session. **Aujourd'hui, quiconque atteint l'URL du déploiement lit tout le
tableau de bord et appelle toutes les API.**
- **Correctif** : Supabase Auth (« phase 4 ») + middleware protégeant `/` et
  `/api/**` **avant toute exposition publique** ; d'ici là, verrouiller
  l'accès (mot de passe Vercel / allow-list).

### C3 — La clé de service est utilisée côté web ; la RLS est court-circuitée
`web/lib/serveur.ts` lit et écrit avec `SUPABASE_CLE` = la clé **`service_role`**
(cf. `docs/CLOUD.md`), qui **contourne la RLS par conception**. Les politiques
`using (true)` du schéma ne sont donc **jamais évaluées** pour le web. Si cette
clé fuit (variables Vercel, logs, bundle), c'est la maîtrise **totale** de la
base : lire, modifier, **effacer** la comptabilité, injecter des commandes.
- **Correctif** : passer en clé `anon` + session, réactiver la RLS ; restreindre
  le scope de la variable, prévoir sa rotation.

### C4 — Pilotage à distance non authentifié + code PIN en clair transitoire
`POST /api/commande` (`web/app/api/commande/route.ts`) n'exige **aucune**
authentification. Un anonyme peut composer un USSD, modifier l'identité d'une
carte, lire les soldes, ou **harceler le modem**. Le seul rempart contre le vol
est le **code secret**, exigé côté Pi. Or ce PIN transite **en clair** dans
`commandes.parametres` de l'`INSERT` jusqu'à la relève du robot
(`pilotage.py` le masque *après* lecture) — quelques secondes, davantage si le
Pi est hors ligne. Fenêtre de capture pour qui a la clé de service ou une
session.
- **Correctif** : authentifier toutes les routes `/api/**` ; ne jamais faire
  transiter le PIN par la base (STK, ou canal éphémère non persistant), TTL
  d'expiration sur les commandes `secret`.

---

## 🟠 Grave

### G1 — Décalage d'une heure sur TOUT (confirmé par 3 audits indépendants)
`nuage.py` — `_horodatage` envoie l'heure **locale du Pi (Douala, UTC+1) sans
fuseau** dans des colonnes `timestamptz`. Supabase l'interprète en **UTC** ; le
web reformate en `Africa/Douala` → **+1 h** partout. Effets en cascade :
- `enLigne` (seuil 3 min) et `enPlace` (10 min) reçoivent un `vu_le`/
  `derniere_vue` « dans le futur » → **un terminal mort paraît en ligne ~1 h**,
  une carte retirée reste « en place » ~1 h.
- Les paiements de fin de soirée basculent au lendemain.
- **Correctif** : une ligne — émettre l'ISO avec offset
  (`datetime.now().astimezone().isoformat()`) ou en UTC de bout en bout.

### G2 — L'heure réseau du SMS (TP-SCTS) est décodée puis jetée
`modem.py` — `lire_sms` ignore le dernier champ de `recoller(...)`, alors que
`pdu.py` décode bien `Morceau.horodatage` (l'heure du centre SMS). Seule survit
l'heure où le Pi a **relevé** le message.
- **Scénario** : après une coupure, 20 SMS relevés d'un coup reçoivent tous
  quasi le même horodatage → chronologie effondrée, reçus mal datés. Aggravé
  car un Pi **n'a pas d'horloge sauvegardée** : au démarrage hors-ligne,
  `datetime.now()` peut être franchement faux, tandis que le PDU, lui, porte
  l'heure exacte.
- **Correctif** : propager `horodatage` jusqu'au journal (colonne `emis_le`),
  l'utiliser comme heure de référence (repli sur l'heure Pi en mode texte).
  → C'est exactement ce que prévoit `docs/SMS.md`.

### G3 — Une exception de journalisation tue le fil de surveillance, en silence
`app.py` — dans `_boucle_surveillance`, l'appel `_relever_sms(compte)` n'est
**pas** protégé, et dans `_relever_sms` la boucle qui journalise les messages
est **hors** du `try`. Si `journal.sms` lève (disque plein, `database is
locked`), le fil **meurt sans bruit** : plus aucun SMS relevé, Telegram semble
juste « calme ».
- **Correctif** : envelopper chaque itération dans un try/except qui journalise
  et continue ; superviser et relancer le fil.

### G4 — Le dédoublonnage peut effacer un vrai paiement
`storage.py` — `sms_existe` compare `(expediteur, texte, compte)` sur 900 s, et
dans `app.py` l'effacement modem est **hors** du `if not sms_existe`. Deux
paiements réels au texte identique (soldes, promos, formats sans référence) à
moins de 15 min → le second est jugé doublon : **ni journalisé, ni notifié, ni
poussé — mais effacé du modem.** Perte définitive.
- **Correctif** : n'effacer que ce qui vient d'être journalisé ; renforcer la
  clé avec la référence de transaction ou l'heure réseau (G2).

### G5 — Les totaux d'argent deviennent faux au-delà de 1000 lignes
`web/lib/serveur.ts` charge `limit=1000` puis additionne en JavaScript. Le
**total encaissé par carte** (`totalRecu`) et l'**analyse hebdomadaire** sont
donc plafonnés aux 1000 derniers SMS, **sans le dire**. Une carte retirée
affiche un total sous-évalué ; à ~140 encaissements/jour, l'analyse 7 jours est
déjà tronquée.
- **Correctif** : agrégats **SQL** (vue/RPC : `sum`, `count`, groupés par carte
  et par jour de Douala), pagination réelle pour l'historique.

### G6 — Effacer la ligne du terminal efface tout le grand livre
`sql/schema.sql` — les sept tables sont en `on delete cascade` sur
`terminaux(id)`. Supprimer « douala » **efface en cascade** paiements, cartes,
comptes, reçus, événements — irréversible ; les PDF du bucket deviennent
orphelins. Renommer l'`id` **scinde** l'historique sans rien supprimer.
- **Correctif** : `on delete restrict` sur les tables financières ; `id`
  terminal immuable et documenté.

### G7 — Injection de commandes AT via le champ `texte`
`web/app/api/commande/route.ts` borne `texte` à 120 caractères **sans filtrer**
`"`, `\r`, `\n`. Passé brut à `AT+CUSD=1,"{charge}"` (`modem.py`) en **mode GSM**
(le défaut), un `texte` piégé ferme la chaîne et **injecte des commandes AT**
(ex. `AT+CMGD` = effacer les SMS non encore lus).
- **Correctif** : rejeter/filtrer `"`, `\r`, `\n` et les caractères de contrôle
  avant l'AT ; toujours encoder la charge (hex/UCS2).

---

## 🟡 Moyen

- **M1 — Blocage « tout ou rien » encore présent** sur `pousser_evenements` et
  `pousser_cartes` (`nuage.py`) : la reprise ligne par ligne n'a été appliquée
  qu'aux paiements. Une ligne refusée gèle toute la file (événements ou cartes),
  en silence. → router ces deux files par `_tenter_insert` (même diagnostic
  `reseau`/`schema`/`refuse` + alerte).
- **M2 — RLS `using (true)` sans cloisonnement** (`sql/schema.sql`) : aucun
  filtre par propriétaire/terminal. Inoffensif tant qu'un projet Supabase = un
  propriétaire (cf. `CLOUD.md`), mais **fuite totale** dès que deux terminaux
  cohabitent. → colonne de propriété + policies `auth.uid()`.
- **M3 — IDOR sur les reçus et les commandes** : `/api/recu/[numero]` et
  `/api/commande/[id]` ne vérifient aucune propriété ; numéros prévisibles
  (`TM-AAAA-MMJJ-NNNN`), `id` séquentiels → énumération de **tous les reçus
  PDF nominatifs**. → authentifier + vérifier l'appartenance.
- **M4 — SMS résiduels attribués à la mauvaise carte au swap** (`modem.py`
  préfère la mémoire ME, qui survit au retrait ; `_recenser` passe avant
  `_relever`) : un SMS de l'ancienne puce, encore en mémoire, est journalisé
  avec l'ICCID de la **nouvelle**. → relever la mémoire avant d'acter le
  changement d'ICCID.
- **M5 — Un SMS rangé comme « paiement »** (`nuage.py`, table `paiements`) : la
  table contient **tous** les SMS (pubs, codes, messages) avec les colonnes de
  paiement à `NULL`. Les totaux restent justes (filtrés sur `sens='entree'`),
  mais la sémantique est fausse et l'affichage montre le bruit. De plus,
  `"compte": compte or expediteur` met parfois l'expéditeur dans une colonne
  « libellé de compte ». → c'est l'objet de la refonte `docs/SMS.md` (table
  `sms`).
- **M6 — `comptes.libelle NOT NULL` → rejet silencieux** du lot comptes (sans
  alerte, contrairement aux paiements) si le libellé est vide. → fallback sur
  l'ICCID abrégé, ou colonne nullable.
- **M7 — Un paiement « refuse » est marqué transmis** (`nuage.py`) : mis de
  côté définitivement, il ne remonte jamais même si le refus était réparable.
  → colonne `quarantaine` distincte de `envoye`, rejouable après correction.
- **M8 — PDU illisible : jamais journalisé ni effacé** (`modem.py` `except
  ErreurPDU: continue`) → il occupe un emplacement mémoire à chaque tour et,
  accumulé, sature la mémoire (perte des SMS suivants). → journaliser en
  « non décodable » et l'effacer.
- **M9 — Perte de mise à jour sur `cartes.envoye`** : une modification
  d'identité pendant un `pousser_cartes` en vol peut être écrasée par
  `marquer_cartes_envoyees`. → garde optimiste `WHERE envoye = 0`.
- **M10 — Retard de synchro invisible côté web** : le robot connaît son retard
  (`reste_a_envoyer`, affiché sur `/statut` Telegram) mais la plateforme montre
  le cloud comme s'il était complet. → publier le retard et afficher un bandeau.
- **M11 — Découpage du jour incohérent** entre la liste (Douala, correct) et
  l'analyse (fuseau du serveur de rendu) → un même paiement peut tomber dans
  deux jours différents. → un seul utilitaire « jour de Douala ».

---

## ⚪ Mineur

- **P1 — Débit de rattrapage** : `LOT=100` / `pause=60 s` → ~1,7 SMS/s au
  plancher ; un carnet de 1000 SMS met ~10 min à remonter après coupure.
  → drainer tant que le lot est plein.
- **P2 — Index** : `paiements_tiers_idx`, `paiements_compte_idx`,
  `paiements_carte_idx` **jamais utilisés** (le web filtre en JS après
  `select=*`) ; `cartes_derniere_vue_idx` **inefficace** (tri sans le préfixe
  `terminal`) ; **manquant** sur `recus.etabli_le` (tri à chaque page).
  → aligner index et requêtes réelles.
- **P3 — N+1 au rendu** : `recuDe` re-scanne les reçus pour chaque paiement
  (~10⁶ itérations) ; `sims.map` re-filtre les 1000 lignes par carte.
  → indexer en `Map` une seule fois.
- **P4 — `comptes.numero` jamais écrit** (colonne morte, toujours `NULL`).
- **P5 — Date du numéro de reçu ≠ date du contenu** (programmé vs fabriqué).
- **P6 — Reçu abandonné après 60 essais, sans alerte.**
- **P7 — Mode texte (repli)** : SMS longs tronqués, sans heure réseau.
- **P8 — Un PIN purement numérique peut passer dans le champ `code`** d'une
  commande `ussd` et être journalisé en clair dans `evenements`.

---

## Ce qui est explicitement sain (à conserver)

- Bloc de migration **exhaustif** (aucune autre colonne manquante).
- CHECK `sens`/`genre` non violables par le code.
- `numeric` correct (soldes à la décimale préservés), borné à 15/6 chiffres.
- Le Pi reste source de vérité : le cloud ne peut pas falsifier la comptabilité.
- PIN masqué avant composition et jamais journalisé dans `_repondre`.
- Bucket `recus` réellement privé ; `chargerRecu` revérifie le numéro.
- Clé server-only (pas de `NEXT_PUBLIC_`) ; corps des commandes non journalisé.
- Reprise ligne par ligne des paiements + diagnostic `reseau`/`schema`/`refuse`.

---

## Ordre de traitement proposé

1. **C1** (numéro effacé) et **G3** (fil qui meurt) — pertes silencieuses au
   cœur du système, correctifs courts.
2. **G1 + G2** — un seul chantier « heure réseau de bout en bout ».
3. **G4** (dédoublonnage) et **M4/M8** (mémoire modem).
4. **Sécurité C2/C3/C4 + M2/M3 + G7** — avant toute exposition publique.
5. **G5 + M5** — la refonte SMS (`docs/SMS.md`) : table `sms`, agrégats SQL,
   catégories, nature → reçu. Elle règle d'un coup la sémantique, les totaux
   et la classification.
6. **M1** (files evenements/cartes) et le reste des moyens/mineurs.
