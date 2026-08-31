# Le registre des constats de sécurité

*Tour 1 — 31 août 2026. Corrigé : 8. Ouvert : 1 (à appliquer par le
propriétaire). Classé : 1.*

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
| SEC-03 | **P1** | Les règles de la base ouvrent le grand livre | CONFIRMÉ | **à appliquer** |
| SEC-04 | P2 | Le frein se contourne avec un en-tête | MESURÉ | **corrigé** |
| SEC-05 | P2 | Aucun en-tête de sécurité | CONFIRMÉ | **corrigé** |
| SEC-06 | P2 | Un invité peut reclasser un paiement | MESURÉ | **corrigé** |
| SEC-07 | P3 | Un nom de fichier non échappé | CONFIRMÉ | **corrigé** |
| SEC-08 | P3 | Le courriel entre dans les journaux | CONFIRMÉ | **corrigé** |
| SEC-09 | P3 | Dépendances à mettre à jour | CONFIRMÉ | **corrigé en partie** |
| SEC-10 | — | `rls_auto_enable` : fausse alerte | CONFIRMÉ | classé |

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

**ÉCRIT, PAS APPLIQUÉ — et c'est délibéré.**

Le correctif est `migrations/20260831_regles_dormantes.sql` : il retire les
politiques, s'assure que RLS reste active partout, et porte son propre bloc
de vérification. `sql/schema.sql` ne les recrée plus sur une base neuve, et
son commentaire — qui décrivait une architecture abandonnée, et affirmait que
« l'application web lit avec la clé publique » — dit maintenant la vérité :
la base ne protège rien, toute l'autorisation est du code.

**Ce qui reste à faire, et par qui.** Appliquer ce fichier dans l'éditeur SQL
de Supabase. Je ne l'ai pas fait moi-même : c'est la base EN SERVICE, celle
qui porte 302 paiements réels, et un audit n'écrit pas dans la production.
Le fichier est rejouable, ne touche aucune donnée, et son bloc (a) doit
rendre **zéro ligne**, (b) **zéro ligne**, (c) les mêmes comptes qu'avant.

**À vérifier au passage** [À VÉRIFIER] : l'inscription Supabase Auth est-elle
ouverte sur le projet (Authentication → Providers) ? Après cette migration,
la réponse n'a plus d'importance pour l'argent — mais elle vaut d'être
connue.

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

**Ce qui reste, et pourquoi je m'arrête là.** `npm audit` signale encore trois
avis de gravité haute, tous dans des dépendances **de `next` lui-même** :
`postcss` (≤ 8.5.22) et `sharp` (< 0.35.0). Les fermer demande
**`next@16.3.3`**, une montée mineure hors de la plage actuelle.

Ni l'un ni l'autre n'est atteignable ici, et c'est vérifié plutôt que
supposé :
  · `postcss` ne traite que la feuille de style du projet, à la compilation —
    aucune CSS fournie par un visiteur ne l'atteint ;
  · les avis `sharp`/libvips passent par l'optimisation d'images, et
    **`next/image` n'est utilisé nulle part** dans ce dépôt (`grep` : aucun).

Une montée mineure du cadre, juste après un changement d'autorisation aussi
large, brouillerait le diff pour fermer des avis qui n'ont pas de support
ici. Elle mérite son propre passage, avec sa propre batterie. **À faire au
tour suivant**, ou tout de suite si le propriétaire préfère.

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
- **Le coffre du téléphone** — Keystore/Keychain, avec un refus franc plutôt
  qu'un repli sur `localStorage` hors développement (`mobile/src/api/coffre.ts`).
- **L'adresse du téléphone** — `https` exigé, sauf boucle locale
  (`mobile/src/api/guichet.ts:76`).
- **SSRF** — une seule sortie, vers une adresse fixe (`lib/pousser.ts:82`).
- **Cookies** — `httpOnly`, `secure`, `sameSite: lax`, `path: /`. `lax` suffit :
  toutes les écritures sont des `POST` en `application/json`, qu'un formulaire
  d'un autre site ne sait pas fabriquer.

## Le résidu — ce qui reste vrai après le tour 1

À écrire, sinon « corrigé » finit par vouloir dire « on n'y pense plus ».

- **Le frein ne vit que dans une instance.** Il mord sur la cadence d'une
  instance chaude ; sur Vercel, une instance froide repart à zéro. Un frein
  réellement partagé demande un compteur hors du serveur.
- **Le garde relit la base toutes les dix secondes.** Une session fermée peut
  donc vivre dix secondes de plus — sauf si c'est le propriétaire qui vient de
  la fermer, auquel cas l'effet est immédiat. Ce n'est plus trente jours.
- **Le sursis de cinq minutes.** Si la base se tait, un compte vu approuvé il
  y a quatre minutes passe encore. C'est un choix : l'inverse ferait d'une
  panne de Supabase un verrou sur sa propre maison.
- **`style-src` garde `unsafe-inline`.** Voir SEC-05.
- **`next` reste en 16.2.11**, avec trois avis non atteignables dans ses
  propres dépendances. Voir SEC-09.
- **SEC-03 n'est pas appliqué** sur la base en service. Tant que ce n'est pas
  fait, les politiques `using (true)` sont toujours là.
- **Un seul niveau de lecture.** Tout compte approuvé voit tout l'argent. Ce
  n'est pas un défaut, c'est le modèle — une caisse, un propriétaire — mais
  cela cesserait d'en être un le jour où de vraies personnes seraient
  invitées.

## Ce qui n'a pas encore été regardé

- TLS et en-têtes en service (`testssl.sh`, `curl -I` sur le domaine réel) —
  il faut l'adresse de production.
- DNS : CAA, SPF/DKIM/DMARC, sous-domaines pendants.
- Le côté Python (`totem/`) : le robot, Telegram, le PIN, les codes USSD.
- Le mode de reprise des SMS et le canal `commandes`, du côté du Pi.
- Semgrep / CodeQL — pas encore joués.
- Le frein hors mémoire d'instance (voir le résidu).
