# Comment on attaque TOTEM — le mode d'emploi de l'audit

*Condensé de l'OWASP ASVS L2, de l'API Security Top 10 et des CWE, **réduit à
ce qui existe vraiment ici**. Ce n'est pas une liste à cocher : c'est ce qu'on
va chercher, module par module, avec la commande pour le chercher.*

Une règle avant tout le reste, et le dépôt la connaît déjà : **un contrôle qui
passe sans rien regarder est pire que pas de contrôle — il rassure.** Chaque
essai décrit ici doit d'abord être vu **échouer** contre le défaut qu'il vise.
Un essai qu'on n'a jamais vu rouge ne prouve rien quand il est vert.

## Ce qu'on ne va pas chercher, et pourquoi

Autant le dire tout de suite, pour ne pas y revenir chaque tour
(justifications dans `CARTE-DU-SYSTEME.md` §6) :

| Famille | Pourquoi elle n'a pas de support ici |
|---|---|
| Injection SQL | pas une ligne de SQL écrite à la main ; tout passe par PostgREST |
| SSRF applicative | une seule sortie, adresse fixe (`lib/pousser.ts:82`) |
| Téléversement de fichier | l'utilisateur n'en dépose aucun |
| XSS stocké / réfléchi | React échappe ; aucun `dangerouslySetInnerHTML` |
| Server Actions | il n'y en a aucune (`grep "use server"` : vide) |
| Isolation entre locataires | une seule caisse, un seul propriétaire — assumé |
| Webhooks de paiement | il n'y en a pas ; l'argent arrive par SMS, via le Pi |

Ce qui **reste** est court, et c'est tant mieux : on peut le faire à fond.

---

## 1. La porte d'entrée — `lib/porte.ts`, `lib/session.ts`, `lib/frein.ts`

*ASVS V2 (mots de passe), V3 (sessions) · API2*

Ce qu'on va chercher :

- **Un jeton forgé passe-t-il ?** Signature bidouillée, échéance repoussée,
  sujet réécrit (`c:1` → `c:2`, ou → `secours` pour s'offrir l'administration),
  jeton d'un autre secret, jeton tronqué, jeton à deux ou quatre points,
  dernier caractère base64url modifié.
- **Une session survit-elle à sa révocation ?** ← **SEC-01**. Ouvrir, fermer
  le compte, rejouer le même jeton. C'est *l'essai* du tour 1.
- **Le frein freine-t-il vraiment ?** ← **SEC-04**. Deux cents essais avec
  deux cents `X-Forwarded-For` différents. Et en alternant les deux portes,
  `/api/connexion` et `/api/session`, pour vérifier que le seau est bien
  partagé.
- **La réponse dit-elle qui a un compte ici ?** Comparer message, code de
  statut **et durée** entre un courriel connu et un inconnu. C'est le rôle du
  leurre PBKDF2 (`porte.ts:47`) — il faut le mesurer, pas le croire.
- **Un compte non approuvé entre-t-il ?** Le mot de passe est bon, la porte
  doit rester fermée (`porte.ts:95`).
- **L'inscription se rouvre-t-elle ?** Elle se ferme dès qu'un compte existe.
  Que se passe-t-il si la base ne répond pas ? Le code répond « je ne sais
  pas » ≠ « il n'y a personne » (`porte.ts:169`) — à éprouver en coupant la
  base pour de vrai.
- **Un refus laisse-t-il quelque chose derrière lui ?** `porte.ts:182` vérifie
  le secret avant de créer. À rejouer.

Comment :
```sh
cd web && node scripts/verifier-le-verrou.mjs      # vrai serveur, vraies attaques
cd web && node scripts/verifier-les-comptes.mjs    # la vie entière d'un compte
```
Ces deux harnais existent déjà et sont bons. **On les allonge**, on n'en écrit
pas d'autres à côté.

---

## 2. Qui a le droit de quoi — `lib/qui.ts`, chaque route

*ASVS V4 · API1 (BOLA), API3 (BOPLA), API5 (BFLA) — **la priorité***

Il n'y a que deux niveaux ici : **entrer** et **administrer**. Donc la question
est simple, et elle se pose porte par porte : **un invité peut-il faire ceci ?**

La méthode, à refaire à chaque nouvelle route :

1. Ouvrir deux sessions — un propriétaire, un invité approuvé.
2. Appeler **toutes** les portes du tableau de `CARTE-DU-SYSTEME.md` §4 avec
   celle de l'invité.
3. Toute écriture qui répond autre chose que 403 est un constat.
4. Refaire avec **aucune** session, et avec un jeton **expiré**.

Déjà trouvé par cette méthode : **SEC-06** (`/api/nature`, `/api/lu`).

Le piège particulier à cette plateforme : `estProprietaire` est appelé
**route par route** (`commande`, `essai-notification`, `comptes`). Rien
n'oblige la route suivante à y penser. Chaque ajout de route est donc à
repasser à cette question, à la main, tant que le garde n'est pas partagé.

---

## 3. Les liens signés — `lib/lien-signe.ts`, `middleware.ts:60-85`

*ASVS V3.5 · CWE-639*

Trois genres (`recu`, `coordonnees`, `bilan`), dix minutes, HMAC sur
`genre:id:échéance`. Ce qu'on va chercher :

- **Un genre passe-t-il pour un autre ?** Un lien de reçu sur des coordonnées.
  (Le genre est signé — à éprouver, pas à croire.)
- **L'identifiant se déplace-t-il ?** Un « : » glissé dedans changerait les
  frontières du corps signé. `[\w.-]` le refuse (`middleware.ts:69`) — le
  vérifier depuis l'extérieur.
- **Le bilan tient-il sa portée ?** Un lien signé pour 7 jours doit refuser
  `jours=90`. Et : que fait `?jours=7&jours=90` ? Le verrou et la route
  lisent-ils bien la **même** valeur ? *(Les deux appellent `.get`, donc la
  première — mais c'est à prouver depuis un vrai serveur.)*
- **Une échéance se repousse-t-elle ?** `e=9999999999999` sans toucher `s`.
- **Un lien périmé revit-il ?** À la seconde près.

---

## 4. La base de données — `sql/schema.sql`, le projet en service

*ASVS V4.2 · API1*

**Le fait qui commande tout : la plateforme lit avec la clé de SERVICE, qui
contourne toutes les règles.** La base ne protège donc rien. Toute
l'autorisation est du TypeScript. À ne jamais oublier en lisant `schema.sql`,
dont les commentaires décrivent une architecture abandonnée (voir SEC-03).

À rejouer à chaque tour (lecture seule, contre le projet en service) :

```sql
-- Une table sans RLS ?
select tablename, rowsecurity from pg_tables where schemaname='public';
-- Une règle trop large ? (qual = 'true' sur une table qui porte de l'argent)
select tablename, policyname, roles::text, cmd, qual, with_check
  from pg_policies where schemaname in ('public','storage');
-- Une fonction SECURITY DEFINER apparue depuis la dernière fois ?
select proname, prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef;
-- Quelqu'un a-t-il endossé le rôle `authenticated` ?
select count(*) from auth.users;
```

Plus le conseiller Supabase (`get_advisors`, type `security`) — en sachant
qu'il se trompe : voir SEC-10, jugé et classé.

**Ce qui déclenche un P0 :** une table qui porte de l'argent, lisible par un
rôle que quelqu'un peut endosser, avec `qual = true`.

---

## 5. L'argent — `/api/commande`

*ASVS V11 (logique métier) · CWE-841*

C'est la seule porte d'où de l'argent peut bouger : elle dépose une demande que
le robot exécute sur une **vraie carte SIM**. Elle est réservée au
propriétaire (`commande/route.ts:36`) et son entrée est étroitement bornée.

Ce qu'on va chercher :

- **Un code composé qui n'a pas été validé** — chaque champ est filtré
  (`code` : `[^0-9#*]` retiré ; `texte` : guillemets et caractères de contrôle
  retirés ; `carte`/`iccid` : chiffres seuls). Chercher un chemin qui échappe
  au filtre.
- **Un trou de variable mal formé** — `{montan` sans fermeture. Le contrôle
  existe (ligne 143) ; l'éprouver.
- **Le rejeu** — la même demande déposée deux fois compose-t-elle deux fois ?
  **Il n'y a pas de clé d'idempotence.** À creuser au tour où l'on regarde le
  robot.
- **La course** — deux demandes simultanées sur la même carte. Le robot
  sérialise-t-il ? Question pour le côté Python.
- **Le PIN** — la règle du dépôt : jamais stocké, jamais dans un message,
  jamais journalisé autrement que `****`. `commande/route.ts` ne journalise
  pas le corps (ligne 27). À vérifier de bout en bout, jusqu'au Pi.

Les montants sont en `numeric` côté base (jamais en flottant) — c'est bon, et
c'était un vrai correctif (voir la migration d'août).

---

## 6. Le bord du réseau — Vercel, DNS, TLS

*ASVS V14.4, V9.1*

Rien de tout cela n'a encore été fait : il faut l'adresse de production.

```sh
curl -sSI https://<adresse>/                       # les en-têtes
curl -sSI https://<adresse>/api/donnees            # 401, et pas de fuite
testssl.sh --quiet --severity LOW https://<adresse>
dig CAA <domaine>; dig TXT <domaine>               # CAA, SPF/DMARC
```

Ce qu'on cherche :
- les six en-têtes manquants (**SEC-05**) ;
- un cache qui garderait une réponse authentifiée (`/api/donnees` porte
  `force-dynamic` ; `/api/bilan` porte `private, no-store` — le vérifier
  **depuis le bord**, pas dans le code) ;
- CORS : il n'y a aucun en-tête CORS posé, donc pas d'origine reflétée. À
  reconfirmer si une route en pose un jour ;
- TLS ≥ 1.2, chaîne valide, HSTS ;
- un sous-domaine pendant — c'est exactement la faute qui a déjà coûté cher à
  ce projet (l'adresse d'exemple appartenant à quelqu'un d'autre, voir
  `mobile/src/api/guichet.ts:22`).

---

## 7. Le téléphone — `mobile/`

*ASVS V1.14, V6*

- **Ce qui entre dans le paquet est public, pour toujours.** Le harnais existe :
  `cd mobile && node scripts/verifier-le-paquet.mjs`. À jouer avant toute
  compilation destinée au magasin.
- Le jeton vit dans le coffre du système, avec un refus franc hors du
  téléphone (`coffre.ts:25`). Vérifié, bon.
- L'adresse exige `https` sauf boucle locale (`guichet.ts:76`). Vérifié, bon.
- **Une mise à jour à distance arrive sur des téléphones en service, en
  quelques secondes.** La batterie se lance AVANT de publier.

---

## 8. Ce qu'on lance, et quand

```sh
# Après chaque correction, sans exception :
python3 -m unittest discover -s tests
cd web && npx next build && npm test
cd web && node scripts/verifier-le-verrou.mjs
cd web && node scripts/verifier-les-comptes.mjs
cd mobile && npx tsc --noEmit

# Si l'on a touché au téléphone :
cd mobile && node scripts/verifier-le-paquet.mjs
cd mobile && node scripts/verifier-les-formats.mjs /tmp/apercu

# Outils d'audit, pas encore joués :
npx semgrep --config p/owasp-top-ten --config p/jwt --config p/secrets web/ mobile/
npx osv-scanner --lockfile web/package-lock.json --lockfile mobile/package-lock.json
```

Ces harnais refusent de démarrer si leur port est pris — c'est délibéré : un
essai resté ouvert a déjà fait passer toute une batterie, en vert, contre du
vieux code.

## 9. La règle du changement

- **Ce que je corrige sans demander :** un en-tête ajouté, une validation
  d'entrée qui manquait, un journal qui en dit trop, une dépendance montée
  d'une version mineure.
- **Ce que je propose et n'applique pas sans accord :** tout ce qui touche à
  l'authentification, à qui-a-le-droit-de-quoi, aux règles de la base, au
  schéma, à l'argent. Une mauvaise correction d'autorisation sur une
  application qui suit de l'argent est pire que le défaut qu'elle prétend
  fermer.
- **Ce qui ne se fait jamais :** un essai actif contre le Vercel ou le
  Supabase en service. Sur ceux-là, lecture seule.
