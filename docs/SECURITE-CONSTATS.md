# Le registre des constats de sécurité

*Tour 3 — 31 août 2026. Corrigé : 17. Ouvert : 0. Classé : 2.*

**Plus rien n'est en attente.** Les deux constats laissés au propriétaire ont
été traités : la migration des règles dormantes est APPLIQUÉE sur la base en
service — et vérifiée en endossant réellement les rôles `anon` et
`authenticated` — et les actions GitHub sont épinglées, avec Dependabot pour
qu'elles continuent de monter. Le tour 3 a aussi ouvert le dernier morceau
non audité, le disque du Pi, et y a trouvé un P1.

**Ce que le tour 2 a changé.** L'audit est passé du côté du ROBOT — celui qui
tient les vraies cartes SIM. Deux défauts P1 y attendaient, tous deux sur le
canal par lequel la plateforme fait composer un code : le code confidentiel
pouvait rester en clair dans la base, et une même demande pouvait être
composée deux fois. Tous deux mesurés rouges avant correction. Semgrep a
aussi été joué, et le lecteur de SMS — la seule entrée du système qui
n'exige rien de personne — a été poussé sans rien trouver.

**Ce que le tour 1 a changé.** Les trois P1 sont traités, les trois P2 aussi,
et deux constats qui étaient RAISONNÉS sont devenus MESURÉS avant d'être
corrigés — SEC-01 et SEC-04 ont d'abord été vus rouges dans un vrai serveur.
Un seul constat reste ouvert, SEC-03 : le correctif est écrit et vérifiable,
mais il s'applique à la base EN SERVICE, et cela n'appartient pas à un
audit.

**Comment lire.** `CONFIRMÉ` = prouvé, avec le fichier et la ligne, ou une
requête jouée contre la base. `THÉORIQUE` = raisonné, pas encore éprouvé — et
tant que ce n'est pas éprouvé, ça ne compte pas. La gravité dit ce qu'un
attaquant obtient, pas à quel point c'est agaçant.

| # | Gravité | Sujet | État | Statut |
|---|---|---|---|---|
| SEC-01 | **P1** | Une session ne se révoque jamais | MESURÉ | **corrigé** |
| SEC-02 | **P1** | Toute l'autorisation tient à un seul fichier | CONFIRMÉ | **corrigé** |
| SEC-03 | **P1** | Les règles de la base ouvrent le grand livre | **PROUVÉ FERMÉ** | **corrigé** |
| SEC-04 | P2 | Le frein se contourne avec un en-tête | MESURÉ | **corrigé** |
| SEC-05 | P2 | Aucun en-tête de sécurité | CONFIRMÉ | **corrigé** |
| SEC-06 | P2 | Un invité peut reclasser un paiement | MESURÉ | **corrigé** |
| SEC-07 | P3 | Un nom de fichier non échappé | CONFIRMÉ | **corrigé** |
| SEC-08 | P3 | Le courriel entre dans les journaux | CONFIRMÉ | **corrigé** |
| SEC-09 | P3 | Dépendances à mettre à jour | CONFIRMÉ | **corrigé** |
| SEC-10 | — | `rls_auto_enable` : fausse alerte | CONFIRMÉ | classé |
| SEC-11 | **P1** | Le code secret survit dans la base | MESURÉ | **corrigé** |
| SEC-12 | **P1** | Une demande peut être composée deux fois | MESURÉ | **corrigé** |
| SEC-13 | P3 | Une saisie devient du code dans les workflows | CONFIRMÉ | **corrigé** |
| SEC-14 | P3 | Les actions GitHub suivent une étiquette mobile | CONFIRMÉ | **corrigé** |
| SEC-15 | — | SHA-1 dans `app.py` : fausse alerte | CONFIRMÉ | classé |
| SEC-16 | **P1** | Les secrets du Pi sont lisibles par tous | MESURÉ | **corrigé** |

**MESURÉ** veut dire quelque chose de précis ici : l'essai a d'abord été écrit,
lancé, et vu ÉCHOUER contre le défaut — avant toute correction. Un essai qu'on
n'a jamais vu rouge ne prouve rien quand il est vert.

---

## SEC-01 · P1 · Une session ne se révoque jamais

**ASVS** V3.3.1, V3.3.2 (fin de session) · **API Top 10** API1, API5 ·
**CWE-613** (expiration de session insuffisante) · **Confiance : HAUTE**

**Ce qui se passe.** Le verrou ne regarde que la signature et l'échéance du
jeton (`web/middleware.ts:96` → `web/lib/session.ts:61-88`). Il ne consulte
jamais la base. Or le jeton vit **un mois** (`session.ts:27`).

Fermer un compte (`web/app/api/comptes/route.ts:71`) ou le supprimer
(ligne 72) ne change donc **rien** pour qui est déjà entré : le jeton reste
signé, reste valable, et continue d'ouvrir.

**Ce que ça donne.** Un invité qu'on vient de mettre dehors garde, jusqu'à
trente jours :

- `GET /api/donnees` — les 302 paiements, tous les soldes, toutes les cartes ;
- `GET /api/bilan?jours=90` — le même historique en CSV, à télécharger ;
- `GET /api/recu/<n>` — les 203 reçus PDF ;
- toutes les pages de la plateforme.

Aucune de ces portes ne redemande qui parle. `/api/donnees` appelle bien
`compteConnecte` (ligne 59) — mais seulement pour afficher un courriel, jamais
pour décider.

**L'autre moitié du problème.** Il n'y a pas de « me déconnecter partout ». Un
téléphone volé, un jeton copié : le propriétaire n'a aucun geste. Changer son
mot de passe n'y fait rien non plus.

**La racine.** Un jeton sans état ne peut pas être repris. Il faut un point
où la révocation s'exprime.

**Ce que je propose (GELÉ — c'est de l'authentification, j'attends l'accord).**
Un seul garde partagé, appelé par toute route non ouverte, qui refait la
vérification *et* relit l'état du compte en base. Le verrou du bord reste le
premier filtre rapide ; il cesse d'être le seul juge. Coût : une lecture par
requête, à mettre en cache quelques secondes.

**CORRIGÉ.** `web/lib/garde.ts` — un garde partagé qui refait la vérification
de signature *et* relit l'état du compte en base, avec un cache de dix
secondes. Une session fermée met donc au plus dix secondes à mourir partout,
et le geste du propriétaire efface le verdict tout de suite
(`comptes/route.ts`, `oublierLeVerdict`). Le verrou du bord reste : il cesse
d'être le seul juge.

Le point délicat était la panne : mettre tout le monde dehors parce que
Supabase hoquette transformerait une panne en verrou sur sa propre maison.
D'où `etatDuCompte` (`lib/serveur.ts`), qui distingue « fermé » de « je ne
sais pas », et un **sursis de cinq minutes** sur le dernier verdict connu.
Passé ce délai, plus personne — et la clé de secours, qui ne demande rien à
la base, reste ouverte.

**MESURÉ.** L'essai a d'abord été vu ROUGE : un jeton d'un compte fermé
ouvrait encore `/api/donnees` (200), `/api/bilan` (200), `/api/actualite`
(200) et la fabrique de liens (200) ; un jeton de compte **supprimé** aussi
(200). Après correction : 401 sur les cinq. Et deux essais de plus, parce
qu'une révocation qui ne se défait pas serait un autre défaut — un compte
rouvert retrouve sa session (200), le même jeton. Voir
`web/scripts/verifier-les-comptes.mjs`, section « Le propriétaire referme ».

---

## SEC-02 · P1 · Toute l'autorisation tient à un seul fichier

**ASVS** V4.1.1, V1.4.1 · **API Top 10** API5 · **CWE-306** ·
**Confiance : HAUTE**

**Ce qui se passe.** `web/middleware.ts` est la seule chose qui protège les
données. Aucune route ne revérifie qu'une session existe. `/api/bilan`,
`/api/donnees`, `/api/actualite`, `/api/recu/…` n'ont pas une ligne
d'authentification : elles servent tout ce qu'on leur demande, et comptent sur
le fait que personne n'arrive jusqu'à elles.

Deux façons dont ça casse :

1. **`SESSION_SECRET` absent = maison ouverte, en silence**
   (`middleware.ts:47`). C'est délibéré pour le développement local. Mais
   c'est aussi ce qui se passe si la variable disparaît d'un réglage Vercel :
   la plateforme sert alors 302 paiements et 203 reçus à qui passe, sans une
   ligne de journal, sans rien à l'écran qui le dise.

2. **Un défaut du cadre.** L'avis
   [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24)
   (CVE-2026-64642, CVSS 8.3) décrit un contournement de middleware dans
   Next.js. Sa recommandation, mot pour mot : *« enforce authorization through
   server-side data operations rather than relying exclusively on
   middleware »*. C'est exactement ce que cette plateforme ne fait pas.

**Sur ce défaut-là, précisément.** `web/package.json` fixe `next@16.2.10` ; la
plage touchée est `>= 16.0.0, < 16.2.11`. **Mais les conditions ne sont pas
réunies ici** : il faut une seule locale dans `config.i18n.locales`, et
`web/next.config.ts` est vide — il n'y a pas de bloc `i18n` du tout. **Ce
défaut n'est donc pas exploitable sur TOTEM.** Ce qui reste vrai, c'est la
leçon : il n'y a pas de deuxième ligne. (La mise à jour, elle, est en SEC-09.)

**Ce que je propose (GELÉ).** Deux gestes :
- le garde partagé de SEC-01, qui règle les deux d'un coup ;
- **refuser de démarrer** en production sans `SESSION_SECRET`, au lieu de
  s'ouvrir. Le développement local garde son passe-droit ; la production, non.

**CORRIGÉ**, en trois gestes.

1. **Toute porte fermée appelle désormais un garde** — 24 portes, routes et
   écrans compris, y compris celles qui n'en avaient jamais eu
   (`/api/bilan`, `/api/donnees`, `/api/actualite`, les reçus, les
   coordonnées, et les six pages qui affichent des chiffres). Les documents
   acceptent aussi leur lien signé (`exigerSessionOuLien`) : la brèche
   volontaire reste ouverte, telle qu'elle était.

2. **La production refuse de servir sans `SESSION_SECRET`** au lieu de
   s'ouvrir (`middleware.ts`). Les écrans ouverts restent atteignables — il
   faut pouvoir dire « cette plateforme n'est pas configurée », et
   `/api/plateforme` doit pouvoir le répondre au téléphone. Tout le reste :
   503. Mesuré : `/api/donnees`, `/api/bilan`, `/api/actualite`,
   `/api/recu/x`, `/api/comptes`, `/api/lu` → 503 ;
   `/api/plateforme`, `/connexion`, `/confidentialite`, `/suppression` →
   200 ; `/` → 307 vers la connexion.

3. **Un relevé qui interdit d'oublier la prochaine.** C'est le geste qui
   compte le plus, parce que le garde se pose porte par porte : rien
   n'obligerait la route de demain à y penser — c'est exactement ainsi que
   `/api/nature` et `/api/lu` sont restées ouvertes (SEC-06).
   `verifier-le-verrou.mjs` lit maintenant la liste `OUVERT` du middleware,
   parcourt tous les `route.ts` et `page.tsx`, et **échoue** si l'un d'eux
   n'appelle aucun garde. Il a immédiatement trouvé `app/sms/page.tsx`, que
   j'avais laissée de côté ; elle est gardée aussi, sans exception — une
   liste d'exceptions est l'endroit exact où la prochaine porte oubliée irait
   se ranger sans qu'on la voie.

Sur le défaut du cadre lui-même : `next` est passé en **16.2.11**, hors de la
plage touchée (voir SEC-09).

---

## SEC-03 · P1 · Les règles de la base ouvrent le grand livre

**ASVS** V4.2.1 · **API Top 10** API1, API3 · **CWE-1230** ·
**Confiance : HAUTE sur la forme, MOYENNE sur l'exploitation**

**Ce qui se passe.** Joué en lecture seule contre le projet en service
(`hzixkjoybstkgfbhvyun`, `pg_policies`) :

| Table | Règle | Rôle | Condition |
|---|---|---|---|
| `paiements` | lecture connectee | `authenticated` | `true` |
| `comptes` | lecture connectee | `authenticated` | `true` |
| `recus` | lecture connectee | `authenticated` | `true` |
| `cartes`, `terminaux`, `evenements`, `raccourcis` | idem | `authenticated` | `true` |
| `commandes` | lecture connectee | `authenticated` | `true` |
| `commandes` | demander une commande | `authenticated` | **INSERT**, `with check true` |
| `storage.objects` | recus lecture connectee | `authenticated` | `bucket_id = 'recus'` |

`using (true)` veut dire : **tout compte connecté à la base lit tout**.

**Pourquoi c'est là.** `sql/schema.sql:398` dit « L'application web lit avec la
clé publique ». **Ce n'est plus vrai.** `web/lib/serveur.ts:25-26,37` lit avec
la **clé de service**, qui contourne toutes ces règles. Ces politiques ne
protègent donc rien du tout — elles ne font qu'attendre.

**Ce que ça donne.** La clé « anon » de Supabase est publique **par
construction** : elle est sans danger *parce que* les règles de la base
protègent les données. Ici elles ne les protègent pas. Quiconque a cette clé
et peut créer un compte Supabase Auth devient `authenticated`, et lit alors
les 302 paiements, tous les soldes, les 203 reçus — et **dépose des commandes**,
c'est-à-dire fait composer un code sur une vraie SIM.

**Ce qui retient aujourd'hui.** `auth.users` contient **0 ligne** : personne
n'a jamais endossé ce rôle. Et la clé anon n'est ni dans le dépôt, ni dans le
paquet du téléphone, ni dans le code du navigateur (vérifié).

**Ce qui reste à vérifier [À VÉRIFIER].** L'inscription est-elle ouverte sur le
projet ? Tableau de bord Supabase → Authentication → Providers. Si elle est
ouverte (le défaut), la seule chose qui protège 302 paiements est le secret
d'une clé conçue pour être publique.

**Ce que je propose (GELÉ — c'est la base de données).** **Supprimer ces
politiques.** L'application n'utilise pas Supabase Auth ; elles ne servent à
rien. RLS reste active, sans aucune politique — exactement la posture déjà
choisie, et expliquée, pour `utilisateurs` et `appareils`
(`sql/schema.sql:424-429`). Et corriger le commentaire de `schema.sql`, qui
décrit une architecture abandonnée.

**APPLIQUÉ, ET PROUVÉ FERMÉ** (31 août 2026).

Le correctif est `migrations/20260831_regles_dormantes.sql` : il retire les
politiques, s'assure que RLS reste active partout, et porte son propre bloc
de vérification. `sql/schema.sql` ne les recrée plus sur une base neuve, et
son commentaire — qui décrivait une architecture abandonnée, et affirmait que
« l'application web lit avec la clé publique » — dit maintenant la vérité :
la base ne protège rien, toute l'autorisation est du code.

**COMMENT ON L'A VÉRIFIÉ**, et c'est le point important : pas en constatant
l'absence de politiques, mais en ENDOSSANT les rôles qu'un attaquant
aurait. `set local role authenticated`, puis les mêmes requêtes qu'avant :

| | avant | après |
|---|---|---|
| `paiements` vus par `authenticated` | 303 | **0** |
| `comptes` (soldes) | tous | **0** |
| `recus` | 203 | **0** |
| `commandes` | 859 | **0** |
| déposer une commande (composer sur une vraie SIM) | accepté | **`new row violates row-level security policy`** |

Et `anon` : 0 paiements. Les données, elles, n'ont pas bougé — 303 paiements,
203 reçus, 2 comptes, avant comme après. Le conseiller Supabase ne signale
plus que « RLS active, aucune politique » sur chaque table, en INFO : c'est
exactement l'état voulu, celui qui était déjà assumé pour `utilisateurs` et
`appareils`.

**Un mot sur la méthode.** J'ai d'abord cru avoir laissé une ligne d'essai
derrière moi : le compte des commandes était passé de 859 à 860 entre deux
requêtes. Vérification faite, la ligne 860 était une VRAIE commande du
propriétaire, arrivée entre-temps — elle portait un code, une carte, une
langue, et l'état « faite », ce que mon insertion n'avait pas. La mienne
avait bien été refusée. Compter une différence n'est pas constater une
cause ; il a fallu aller regarder la ligne.

**Ce que la question de l'inscription Supabase Auth devient.** Sans objet
pour l'argent : même un compte `authenticated` créé librement ne voit plus
rien. Elle reste bonne à savoir, elle n'est plus un risque.

---

## SEC-04 · P2 · Le frein se contourne avec un en-tête

**ASVS** V2.2.1 · **API Top 10** API4 · **CWE-307** ·
**Confiance : MOYENNE — THÉORIQUE**

**Ce qui se passe.** `web/lib/frein.ts:46` :

```ts
return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "global";
```

C'est la valeur **la plus à gauche** de `X-Forwarded-For` — celle que le client
écrit lui-même. Un attaquant qui change cet en-tête à chaque essai obtient un
seau neuf à chaque fois : le frein ne freine plus rien, et les deux portes de
mot de passe (`/api/connexion`, `/api/session`) s'essaient à pleine cadence.

**La deuxième moitié.** Le seau vit dans la mémoire d'une instance
(`frein.ts:13`) — le fichier le dit lui-même. Sur Vercel, chaque instance
froide repart à zéro. Même sans tricher sur l'en-tête, le frein est mou.

Ce qui limite les dégâts : PBKDF2 à 210 000 tours coûte cher au serveur comme
à l'attaquant, et douze caractères minimum font un grand espace à parcourir.
Ça ralentit ; ça n'arrête pas.

**Ce que je propose (à confirmer avant de toucher).** Prendre un en-tête
attesté par la plateforme (`x-vercel-forwarded-for`, `x-real-ip`) plutôt que
celui du client ; et garder un compteur global, non indexé sur une valeur
fournie par le visiteur, comme filet.

**MESURÉ, PUIS CORRIGÉ.** Le harnais a été écrit d'abord, et il a pris le
frein en défaut : vingt essais sous vingt adresses inventées, puis un
vingt-et-unième qui repartait en **6 ms** — là où un essai vraiment freiné en
prend 2006. Le frein comptait jusqu'à un, indéfiniment.

Le correctif (`lib/frein.ts`) ajoute un **second seau, commun**, qui ne
dépend d'aucune valeur fournie par le visiteur : aucun en-tête ne le remet à
zéro. Il est large — vingt essais libres — pour qu'un propriétaire distrait ne
le sente jamais. Le délai retenu est le plus sévère des deux. Et
`cleDeFrein` préfère désormais un en-tête que la plateforme pose elle-même
(`x-vercel-forwarded-for`, `x-real-ip`) à celui que le client écrit.

Après correction, même essai : **6007 ms** au vingt-et-unième. Et la
vérification qui comptait autant — « une adresse innocente reste libre » —
tient toujours à 6 ms : le frein mord sur la cadence, pas sur tout le monde.

**Ce qui n'est PAS réglé, et reste vrai :** le seau vit dans la mémoire d'une
instance. Sur Vercel, chaque instance froide repart à zéro. Un frein
réellement partagé demanderait un compteur hors du serveur (Upstash, ou une
table). Noté pour un tour suivant ; ce n'est plus un contournement d'un
en-tête, c'est une limite d'architecture.

---

## SEC-05 · P2 · Aucun en-tête de sécurité

**ASVS** V14.4 · **CWE-693** · **Confiance : HAUTE**

`web/next.config.ts` tient en trois lignes et ne déclare aucun en-tête.
Manquent : `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options`, `X-Frame-Options` / `frame-ancestors`,
`Referrer-Policy`, `Permissions-Policy`.

Ce que ça coûte concrètement : la plateforme peut être mise dans un cadre
invisible chez quelqu'un d'autre (détournement de clic sur des boutons qui
font bouger de l'argent), et le moindre défaut d'échappement n'a aucun filet.

**CORRIGÉ.** Les cinq en-têtes fixes vivent dans `next.config.ts` ; la
politique de contenu, qui porte un nonce tiré à chaque requête, vit dans
`middleware.ts` — le nonce évite le `unsafe-inline` habituel sur les scripts.
`frame-ancestors 'none'` ferme le détournement de clic.

`preload` n'est **pas** posé sur HSTS : il engage le domaine sur une liste
tenue par les navigateurs, dont on ne se retire pas d'un geste. C'est au
propriétaire de le décider.

**Vérifié sur le fil, et dans un vrai navigateur** — parce qu'une politique de
contenu mal posée ne casse pas la compilation, elle casse l'écran, en
silence. `curl -I` montre les six en-têtes ; Chromium charge l'écran de
connexion avec **0 refus de la politique**, les 15 balises `<script>` de Next
portent toutes le nonce, et la saisie dans un champ est relue correctement —
ce qui prouve que l'hydratation a bien eu lieu.

**Résidu :** `style-src` garde `unsafe-inline`. Next et Tailwind posent des
styles en ligne ; un style ne fait pas partir de données, et le fermer
demanderait un nonce sur les styles aussi. Assumé.

---

## SEC-06 · P2 · Un invité peut reclasser un paiement

**ASVS** V4.1.3 (moindre privilège) · **API Top 10** API5 (BFLA) ·
**CWE-862** · **Confiance : HAUTE**

Le principe est écrit dans le dépôt : « Un invité voit les écrans. Il ne touche
pas aux cartes » (`web/app/api/commande/route.ts:25`). `/api/commande` et
`/api/essai-notification` le font respecter par `estProprietaire`.

**Deux portes l'oublient :**

- `web/app/api/nature/route.ts` — aucun contrôle. Un invité reclasse
  n'importe quel paiement. Ce n'est pas cosmétique : la nature **déclenche
  l'établissement du reçu**. Un invité peut donc faire fabriquer, ou faire
  refaire, des reçus sur des opérations réelles.
- `web/app/api/lu/route.ts` — aucun contrôle. Un invité marque les SMS lus, et
  fait disparaître la pastille qui prévient le propriétaire.

Ni l'un ni l'autre ne vérifie non plus **quel** paiement est visé : n'importe
quel identifiant entier passe.

**Ce que je propose (GELÉ — c'est de l'autorisation).** Le même
`estProprietaire` que les deux autres routes, avec la même clause « sans
`SESSION_SECRET`, on ne fait pas semblant ».

**MESURÉ, PUIS CORRIGÉ.** Vus rouges d'abord : un invité obtenait **200** sur
`/api/nature` et **200** sur `/api/lu`. Les deux routes appellent maintenant
`exigerProprietaire`, comme leurs deux voisines. Après correction : **403**
pour l'invité, et le propriétaire passe toujours.

Le relevé statique de SEC-02 est ce qui empêche la prochaine porte de
répéter l'oubli.

---

## SEC-07 · P3 · Un nom de fichier non échappé

**CWE-116** · **Confiance : HAUTE**

`web/app/api/recu/[numero]/route.ts:23` :

```ts
"content-disposition": `inline; filename="${numero}.pdf"`,
```

`numero` arrive brut du chemin. La route sœur `/lien` valide pourtant
(`/^[\w.-]{1,64}$/`, ligne 28), et `chargerRecu` nettoie la valeur **qu'elle
interroge** (`serveur.ts:339`) — mais l'en-tête, lui, reçoit l'original. Un
guillemet dans le numéro déforme l'en-tête.

Portée réelle : petite. La porte est derrière le verrou, le chemin par lien
signé n'accepte que `[\w.-]{1,64}` (`middleware.ts:69`), et un retour à la
ligne ferait échouer la construction de la réponse. C'est de l'hygiène — mais
la validation existe déjà à côté, et son absence ici est un oubli.

**CORRIGÉ.** La même règle des deux côtés : `/^[\w.-]{1,64}$/` avant tout
le reste, et un 400 sinon.

---

## SEC-08 · P3 · Le courriel entre dans les journaux

**ASVS** V7.1.1 · **CWE-532** · **Confiance : HAUTE**

`web/lib/serveur.ts:41` :

```ts
console.error(`Supabase : ${chemin} → ${r.status}`);
```

Sur le chemin de connexion, `chemin` porte le courriel
(`utilisateurs?courriel=eq.…`, ligne 613). Dès que Supabase répond une erreur,
le courriel du compte part dans les journaux Vercel — que la plateforme n'a
aucune raison de garder.

**CORRIGÉ.** `lib/serveur.ts` journalise la TABLE et le code
(`table(chemin)`), jamais le chemin filtré. Le courriel ne peut plus tomber
dans les journaux de l'hébergeur par une erreur de la base.

---

## SEC-09 · P3 · Dépendances à mettre à jour

**API Top 10** API8 · **Confiance : HAUTE** (`npm audit`, 31 août 2026)

**`web/`**
- `next@16.2.10` → **`16.2.11`**. Cinq avis, dont
  [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24)
  (CVE-2026-64642, CVSS 8.3, contournement de middleware). **Les conditions ne
  sont pas réunies ici** — pas de bloc `i18n` dans `next.config.ts` — donc pas
  exploitable sur TOTEM ; voir SEC-02. Les avis « Server Actions » ne
  s'appliquent pas non plus : le dépôt n'en contient aucune. La mise à jour
  reste due, elle est mineure.
- `nanoid < 3.3.18` — [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8),
  CWE-835. Indirecte, chaîne de compilation. `npm audit fix`.

**`mobile/`** — 11 avis modérés, tous dans l'outillage de compilation d'Expo
(`@expo/config`, `@expo/config-plugins`). Rien dans ce qui entre dans le
paquet installé. À traiter avec la prochaine montée d'Expo, pas en urgence.

**CORRIGÉ EN PARTIE.** `next` est en **16.2.11** (épinglé exactement) et
`nanoid` en **3.3.18**. La batterie complète a été jouée après la montée.

**ENTIÈREMENT FERMÉ** (tour 3). `next` est monté en **16.3.3**, ce qui emporte
les trois derniers avis — `postcss` et `sharp`, tous deux dans les
dépendances de `next` lui-même. `npm audit` rend maintenant **0 vulnérabilité**.

La montée a eu sa propre batterie, parce qu'elle change le cadre : compilation,
types, le verrou, les comptes, et surtout la politique de contenu REVÉRIFIÉE
dans un vrai navigateur — la propagation du nonce par Next est exactement le
genre de chose qu'une montée de version peut casser en silence. Zéro refus,
tous les scripts portent le nonce, le chemin du PDF passe toujours.

---

## SEC-10 · Classé · `rls_auto_enable` : fausse alerte

Le conseiller Supabase signale (WARN, deux fois) que
`public.rls_auto_enable()` est `SECURITY DEFINER` et joignable par `anon` et
`authenticated` via `/rest/v1/rpc/…`.

**Vérifié, et c'est faux.** `pg_get_functiondef` montre une fonction qui
`RETURNS event_trigger` : PostgREST ne sait pas l'appeler, et son corps ne fait
qu'activer RLS sur les tables nouvellement créées — un filet, pas une porte.
Elle est posée par la plateforme Supabase, pas par ce dépôt. Elle a aussi
`SET search_path TO 'pg_catalog'`, ce qui ferme le détournement habituel des
fonctions `SECURITY DEFINER`.

Classé sans suite. Noté ici pour qu'on ne le rejuge pas à chaque tour.

---

## Ce qui a été regardé et n'a rien donné

Ce n'est pas du remplissage : ces contrôles n'ont pas à être refaits au
prochain tour.

- **Mots de passe** — PBKDF2-SHA256, 210 000 tours, sel de 16 octets, nombre de
  tours inscrit dans l'empreinte et réhaché à la connexion suivante
  (`lib/motdepasse.ts`). Douze caractères minimum, sans règle de composition.
  Conforme à l'OWASP et au NIST.
- **Découverte des comptes** — une empreinte leurre fait tourner PBKDF2 même
  quand le courriel est inconnu (`porte.ts:47`) ; l'inscription refuse *avant*
  de regarder si le courriel existe (`porte.ts:175`). Correctement traité.
- **Comparaisons à temps constant** — `egaliteConstante` empreinte d'abord en
  SHA-256, si bien que la durée ne trahit ni le contenu **ni la longueur**
  (`session.ts:111`).
- **Forme canonique du jeton** — le réencodage en base64url est comparé au
  jeton reçu (`session.ts:79`), ce qui ferme la malléabilité du dernier
  caractère. Trouvé par le harnais du dépôt, pas par moi.
- **Liens signés** — la signature couvre le genre, l'identifiant *et*
  l'échéance ; l'identifiant est validé avant signature comme avant
  vérification, donc aucun « : » ne déplace les frontières du corps signé
  (`lien-signe.ts:47`). Dix minutes.
- **Injection PostgREST** — les identifiants sont filtrés avant de partir
  (`serveur.ts:329,339`) ou encodés (`serveur.ts:613,707`), et les entiers
  passent par `Number.isInteger`. Rien trouvé.
- **Formules dans le CSV** — les cellules commençant par `= + - @` sont
  préfixées d'une apostrophe (`bilan/route.ts:31`). Correctement traité.
- **Injection de commandes AT** — guillemets, retours à la ligne et caractères
  de contrôle retirés des réponses USSD (`commande/route.ts:60`), et le robot
  revérifie de son côté.
- **Secrets dans le dépôt** — rien, historique compris ; deux secrets
  d'essai clairement nommés dans `web/scripts/`. Aucun secret derrière un
  préfixe `NEXT_PUBLIC_` ou `EXPO_PUBLIC_`.
- **Les reçus PDF** — le SOLDE n'y figure pas, délibérément : « un reçu se
  tend à un client ; il n'a pas à y lire la caisse de l'agent »
  (`recu.py:640`). Le document remis à un tiers ne porte que l'opération.
- **Le lecteur de SMS, poussé** — c'est la seule entrée du système qui
  n'exige ni compte, ni jeton, ni autorisation : quiconque connaît le numéro
  de la SIM peut lui écrire. Dix charges hostiles de 5 000 à 20 000
  caractères (virgules et points répétés, devises en boucle, nombres à
  rallonge, sauts de ligne) passées dans `analyser` : **pire cas 6,7 ms**,
  strictement linéaire. Aucun emballement, alors même qu'un SMS concaténé ne
  dépasse pas ~6 000 caractères sur le réseau. Le seul motif à quantificateurs
  imbriqués (`MONTANT`) est déterministe. Pas de ReDoS.
- **Les rôles du robot sur Telegram** — les conversations non déclarées sont
  ignorées en silence, et le répartiteur des boutons est fermé dans le bon
  sens : une liste blanche de gestes d'observateur, puis le contrôle
  administrateur pour tout le reste, y compris les genres inconnus. Un
  observateur voit l'activité ; il ne compose rien.
- **Le code PIN côté Telegram** — journalisé `****` (`app.py:616,1082`),
  affiché en points, tampon vidé à l'envoi ; et un code tapé au clavier par
  habitude est **effacé de la conversation** puis journalisé `****` lui aussi.
- **L'injection de commandes AT** — guillemets, retours chariot et caractères
  de contrôle retirés dans `modem._cusd`, en plus du nettoyage déjà fait côté
  web. Défense en profondeur réelle, aux deux bouts.
- **Les messages d'erreur du modem** ne recopient jamais ce qui a été composé.
- **Le diagnostic Telegram** ne montre ni secret, ni clé, ni adresse de base —
  version, durée, ICCID masqué, mémoire SMS, signal.
- **Le coffre du téléphone** — Keystore/Keychain, avec un refus franc plutôt
  qu'un repli sur `localStorage` hors développement (`mobile/src/api/coffre.ts`).
- **L'adresse du téléphone** — `https` exigé, sauf boucle locale
  (`mobile/src/api/guichet.ts:76`).
- **SSRF** — une seule sortie, vers une adresse fixe (`lib/pousser.ts:82`).
- **Cookies** — `httpOnly`, `secure`, `sameSite: lax`, `path: /`. `lax` suffit :
  toutes les écritures sont des `POST` en `application/json`, qu'un formulaire
  d'un autre site ne sait pas fabriquer.

## SEC-11 · P1 · Le code secret survit dans la base

**ASVS** V6.2, V7.1.1 · **CWE-312** (donnée sensible en clair) ·
**Confiance : HAUTE — MESURÉ**

**La règle que ça enfreint.** Elle est écrite dans les consignes du dépôt :
« Le code PIN n'est jamais stocké, jamais écrit dans un message, jamais
journalisé autrement que `****`. » Et `pilotage.py` la redisait lui-même :
« s'il ne devait rester qu'une règle, ce serait celle-là ».

**Ce qui se passait.** Quand le propriétaire compose son code depuis
l'application, il voyage jusqu'au robot par la table `commandes`. Le robot
l'efface avant de le composer :

```py
if parametres.get("secret"):
    self.nuage.commande_maj(identifiant, {"parametres": {"secret": True}})
```

L'effacement était **demandé**, jamais **vérifié**. `commande_maj` rend
`False` quand elle n'aboutit pas — réseau coupé, 5xx de Supabase — et cette
réponse partait à la poubelle, ici comme à ses deux autres appels. Le code
partait alors sur le réseau **en laissant sa copie en clair dans la base**,
pour toujours.

**Pourquoi personne ne l'avait vu.** Il existait un essai,
`test_le_code_secret_est_masque_avant_d_etre_compose`. Mais le faux nuage du
harnais rendait `True` à toute écriture : **il ne savait pas échouer**.
L'essai mesurait donc le cas où il n'y a rien à craindre. C'est exactement ce
que le dépôt dit ailleurs — *un contrôle qui passe sans rien regarder est pire
que pas de contrôle : il rassure*.

**MESURÉ.** Le faux nuage sait maintenant tomber en panne. Avec l'ancien code,
nuage muet : `compte.recu` contenait `"1234"`. Le code était composé, et sa
copie restait en base.

**CORRIGÉ**, en deux temps — parce que refuser de composer ne suffit pas :

1. **On ne compose plus si l'effacement n'a pas abouti.** Le refus est
   explicite et dit pourquoi. C'est le bon sens du dépôt appliqué ici : un
   transfert manqué se refait d'un geste, et le propriétaire voit le refus
   tout de suite ; un code confidentiel qui a fui ne se reprend pas — il faut
   aller le changer chez l'opérateur, en supposant qu'on ait remarqué.
2. **L'effacement repart avec l'écriture finale**, qui a lieu de toute façon.
   Refuser de composer met à l'abri du pire — composer ET garder une copie —
   mais n'efface rien tout seul : après un hoquet, la ligne serait restée là
   avec le code dedans, et personne ne repassait. Deux occasions valent mieux
   qu'une, et un hoquet dure quelques secondes.

**Vérifié aussi :** aucun message d'erreur du modem ne recopie ce qui a été
composé (`totem/modem.py`), donc le code ne peut pas ressortir par le champ
`resultat`.

---

## SEC-12 · P1 · Une demande peut être composée deux fois

**ASVS** V11.1.4 (transactions rejouées) · **CWE-362** (course) ·
**Confiance : HAUTE — MESURÉ**

**Ce qui se passait.** Le robot prenait une demande en charge ainsi :

```py
self.nuage.commande_maj(identifiant, {"etat": "en_cours"})
```

Ce n'est pas une prise en charge, c'est un ordre : « mets-la en cours ». Il ne
demande pas **si elle est encore à prendre**, et sa réponse n'est pas
regardée. Deux conséquences, et il y a de l'argent au bout des deux :

- **Deux robots.** Un second Pi branché, ou un redémarrage qui chevauche
  l'ancien : les deux lisent la même ligne `en_attente` et composent tous les
  deux. Sur un transfert, c'est deux fois l'argent, et la seconde fois
  personne ne l'a demandée.
- **Un seul robot suffit.** Si l'écriture échoue, la ligne reste
  `en_attente` — et le tour suivant la reprend, **après l'avoir déjà
  exécutée**.

Il n'y avait ni clé d'idempotence, ni contrainte d'unicité, ni prise
conditionnelle : rien dans le système n'empêchait le double.

**MESURÉ.** Avec l'ancien code, une demande déjà prise par un autre robot
était composée quand même : `compte.recu == ["*126*1*696000000*50000#"]`.

**CORRIGÉ.** `nuage.reclamer(id)` fait un PATCH **conditionnel** —
`commandes?id=eq.N&etat=eq.en_attente` — et lit ce que la base a réellement
modifié (`Prefer: return=representation`). Une liste vide veut dire « un autre
est passé avant toi ». C'est la base qui tranche, en une seule requête, dans
le même verrou de ligne : elle seule voit les deux robots. Lire d'abord puis
écrire ensuite laisserait justement la place entre les deux.

`_traiter` ne commence donc qu'après avoir gagné la ligne. Perdue **ou
incertaine** — nuage muet, réponse illisible — il s'en va en silence : ne rien
faire se rattrape au tour suivant, composer deux fois jamais.

**Résidu :** cela protège du double **entre robots** et du rejeu après une
écriture ratée. Cela ne rend pas la demande idempotente de bout en bout — si
le modem exécute puis que la ligne n'est jamais marquée `faite`, la demande
reste `en_cours` et n'est plus reprise. C'est le bon côté de l'erreur.

---

## SEC-13 · P3 · Une saisie devient du code dans les workflows

**API Top 10** API8 · **CWE-94** · **Confiance : HAUTE** (Semgrep,
`run-shell-injection`, 7 emplacements)

Les deux workflows collaient des valeurs saisies dans leurs lignes de
commande :

```yaml
run: |
  MESSAGE="${{ inputs.message }}"
```

`${{ … }}` est remplacé **avant** que le shell ne lise la ligne : un message
bien choisi n'est plus un message, c'est une commande. Elle s'exécuterait sur
une machine qui tient le jeton Expo et la clé du Play Store — et
`mise-a-jour.yml` pousse du code vers des téléphones **en service**.

**Ce qui limitait la portée :** les deux workflows sont en
`workflow_dispatch`, donc réservés à qui a déjà le droit d'écrire dans le
dépôt — et qui peut donc déjà modifier le workflow lui-même. Ce n'est pas un
franchissement de privilège ; c'est de la défense en profondeur, gratuite.

**CORRIGÉ.** Toutes les valeurs passent par `env:` et sont lues comme des
variables ordinaires, que le shell ne relit jamais comme du code. Y compris
celles que GitHub contraint déjà (`choice`, `boolean`) : une règle sans
exception se tient, une règle avec « sauf celles-là » se perd le jour où
quelqu'un change le type d'une entrée sans y penser. Semgrep ne signale plus
rien sur ce point.

---

## SEC-14 · P3 · Les actions GitHub suivent une étiquette mobile

**API Top 10** API8 · **CWE-1357** · **Confiance : HAUTE** — **à décider**

Six emplois d'actions, tous sur une étiquette qui peut être redéplacée :
`actions/checkout@v4`, `actions/setup-node@v4`, `expo/expo-github-action@v8`.

Une étiquette n'est pas un contenu : celui qui la contrôle peut la faire
pointer ailleurs. Ces workflows tiennent `EXPO_TOKEN` et `GOOGLE_PLAY_CLE`, et
publient vers des téléphones en service — c'est ce qu'une action détournée
obtiendrait. `actions/*` appartient à GitHub (risque plus faible) ;
`expo/expo-github-action` est un tiers.

**CORRIGÉ.** Les trois sont épinglées à leur empreinte, avec la version
lisible en commentaire — sans quoi plus personne ne sait ce qui tourne :

| action | empreinte | version |
|---|---|---|
| `actions/checkout` | `11d5960a3267…` | v4.4.0 |
| `actions/setup-node` | `49933ea5288c…` | v4.4.0 |
| `expo/expo-github-action` | `c7b66a9c327a…` | 8.2.1 |

Chaque empreinte a été **résolue depuis le dépôt d'origine** (`git ls-remote`)
puis recoupée avec la version précise qu'elle porte — pas recopiée de
mémoire, où elle n'aurait été qu'une suite de caractères plausibles.

**Le coût est réel, et il est couvert.** Épingler supprime les montées
automatiques, corrections de sécurité comprises. D'où
`.github/dependabot.yml`, qui ouvre une pull request hebdomadaire quand une
nouvelle version paraît : on relit, on fusionne. Le choix reste au
propriétaire ; c'est l'information qui vient à lui, au lieu qu'il aille la
chercher — ce que personne ne fait.

---

## SEC-15 · Classé · SHA-1 dans `app.py` : fausse alerte

Semgrep signale `insecure-hash-algorithm-sha1` en `totem/app.py:214`.

**Vérifié, et c'est faux.** Ce SHA-1 n'est pas un contrôle de sécurité :
c'est une **empreinte de contenu** qui sert à savoir si le lecteur de SMS a
changé, pour relire l'historique le cas échéant. Personne n'a intérêt à en
fabriquer une collision, et une collision ne donnerait rien — au pire, un
historique non relu. SHA-1 convient parfaitement à cet usage.

Classé sans suite. Noté ici pour qu'on ne le rejuge pas à chaque tour.

---

## SEC-16 · P1 · Les secrets du Pi sont lisibles par tous

**ASVS** V14.1, V7.1 · **CWE-732** (droits trop larges) · **CWE-312** ·
**Confiance : HAUTE — MESURÉ**

**Ce qui se passait.** Deux fichiers valent tout le reste sur cette machine :

- **`totem.conf`** — il porte le jeton du robot Telegram, qui permet de
  PARLER à sa place donc de piloter la SIM, et la **clé de service Supabase**,
  qui contourne toutes les règles de la base : la lire, c'est lire, écrire et
  effacer tout le grand livre. Le fichier d'exemple le dit lui-même :
  « ⚠ SECRÈTE : elle contourne… ».
- **`/var/lib/totem/journal.db`** — tout l'historique : montants, tiers,
  numéros de téléphone, soldes.

L'installateur copiait l'exemple (`cp`) puis y écrivait les secrets, **sans
jamais restreindre les droits** ; `mkdir -p /var/lib/totem` suivait le umask ;
et SQLite créait sa base de la même façon. Sur un Raspberry Pi, umask vaut
022 : **tout naissait en 0644**, lisible par n'importe quel compte de la
machine. Un Pi n'est pas une machine à un seul utilisateur — il a un compte
`pi`, souvent un accès SSH partagé pour la maintenance, parfois un second
compte pour quelqu'un du bureau.

Le jeton du robot s'affichait aussi **en clair à l'écran** pendant
l'installation (`read -rp`), qui se fait souvent en partage d'écran ou devant
quelqu'un qui aide.

**MESURÉ.** `tests/test_secrets_au_repos.py` crée les fichiers comme le code
les crée et regarde les droits obtenus : `journal.db` en **0o644**, la
sauvegarde en **0o644**. Cinq essais rouges au départ.

**CORRIGÉ**, aux trois endroits :

1. **`install.sh`** — `chmod 600` sur la configuration **avant** d'y écrire
   les secrets (l'ordre n'est pas décoratif : les poser d'abord les ferait
   exister en clair et lisibles, ne serait-ce qu'un instant), puis à chaque
   passage pour rattraper les installations existantes ; `chmod 700` sur
   `/var/lib/totem` ; et `read -rsp` pour que le jeton ne s'affiche plus.
2. **`storage.py`** — le journal ET sa sauvegarde se referment à 0600 dès
   l'ouverture. La sauvegarde compte autant : c'est une copie ENTIÈRE, et la
   laisser ouverte le temps du transfert annulerait le soin pris sur
   l'original.
3. **`config.py`** — le robot DIT, au démarrage, si son fichier de secrets est
   lisible par d'autres.

**LE CAS QU'ON NE PEUT PAS FERMER, et pourquoi on le dit au lieu de le taire.**
Le chemin recommandé est `/boot/firmware/totem.conf`, sur la partition de
démarrage. Elle est en **FAT — un système de fichiers sans droits Unix**.
Aucun `chmod` n'y peut rien, et c'est un choix assumé : on veut pouvoir
corriger la configuration depuis un PC Windows, en sortant la carte, sans
savoir ouvrir un terminal. Refuser de démarrer mettrait le robot à l'arrêt
pour un défaut qui n'est pas une panne — et un robot arrêté, c'est une caisse
qu'on ne surveille plus.

Alors le robot le dit, à chaque démarrage, avec le geste exact pour y
remédier (`sudo mv … /etc/totem.conf && sudo chmod 600 …`). **Un risque qu'on
connaît et qu'on a choisi n'est pas le même qu'un risque qu'on ignore.**

**Résidu assumé :** sur la partition de démarrage, ces secrets restent
lisibles. Quiconque prend la carte SD les lit, sur n'importe quel ordinateur.
C'est vrai de toute installation Raspberry Pi, et le déplacement vers `/etc`
est à un `mv` de distance.

---

## Le résidu — ce qui reste vrai après le tour 3

À écrire, sinon « corrigé » finit par vouloir dire « on n'y pense plus ».

- ~~Le frein ne vit que dans une instance.~~ **Fermé au tour 3** : une
  ardoise commune en base (table `freins`) compte les échecs de toutes les
  instances. Mesuré avec DEUX serveurs partageant la même base — la seconde,
  mémoire vierge, est passée de 37 ms à 8 032 ms. Elle ne ferme jamais la
  porte à elle seule : base muette, on retombe sur la mémoire locale.
- ~~`next` reste en 16.2.11.~~ **Fermé au tour 3** : 16.3.3, `npm audit` rend
  0 vulnérabilité.
- ~~SEC-03 n'est pas appliqué.~~ **Appliqué au tour 3**, et prouvé fermé en
  endossant les rôles `anon` et `authenticated`.
- ~~Une demande exécutée mais jamais marquée reste bloquée.~~ **Fermé au
  tour 3** : le robot reprend les demandes restées « en cours » plus de cinq
  minutes et les marque ÉCHOUÉES — jamais « en attente », ce qui les ferait
  rejouer alors qu'on ne sait pas si le code a été composé. Le message
  renvoie au solde, qui fait foi.
- ~~Les actions GitHub ne sont pas épinglées.~~ **Fermé au tour 3.**
- **Les secrets sur la partition de démarrage restent lisibles.** FAT n'a pas
  de droits ; le robot le dit à chaque démarrage, avec le geste pour y
  remédier. Voir SEC-16.
- **Le garde relit la base toutes les dix secondes** (immédiat sur un geste
  du propriétaire), et accorde cinq minutes de sursis si la base se tait.
- **`style-src` garde `unsafe-inline`.** Voir SEC-05.
- **Le frein interroge la base à chaque tentative de connexion.** C'est un
  aller-retour de plus sur un chemin qui en compte déjà (PBKDF2, 210 000
  tours). Assumé : la connexion n'est pas un chemin chaud.
- **Un seul niveau de lecture.** Tout compte approuvé voit tout l'argent. Ce
  n'est pas un défaut, c'est le modèle — une caisse, un propriétaire — mais
  cela cesserait d'en être un le jour où de vraies personnes seraient
  invitées.

## Ce qui n'a pas encore été regardé

- TLS et en-têtes en service (`testssl.sh`, `curl -I` sur le domaine réel) —
  il faut l'adresse de production.
- DNS : CAA, SPF/DKIM/DMARC, sous-domaines pendants.
- **`detect.py` et `courrier.py`** : la découverte des modems, la file
  sortante. Aucun des deux ne touche à un secret ni à une décision d'accès —
  c'est pourquoi ils viennent après le reste.
- **CodeQL** — pas encore joué (Semgrep l'a été au tour 2, et rejoué au
  tour 3 : plus aucun constat d'injection).
- **Les vérifications du BORD** — TLS, en-têtes servis en production,
  DNS/CAA, SPF/DKIM/DMARC, sous-domaine pendant. **C'est le seul morceau que
  je ne peux pas faire seul : il faut l'adresse de production.** Les en-têtes
  ont été vérifiés sur un vrai serveur local et dans un vrai navigateur, mais
  ce n'est pas la même chose que de les voir sortir de Vercel.
