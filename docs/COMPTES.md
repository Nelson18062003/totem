# Les comptes

> Qui peut ouvrir TOTEM, et comment on décide.

---

## Avant / après

**Avant**, la plateforme avait UN mot de passe, rangé dans une variable
d'environnement sur Vercel. Cela marche pour une personne seule, et cela ne
sait rien faire d'autre :

- impossible de savoir qui s'est connecté ;
- impossible d'ouvrir à quelqu'un sans lui donner la clé de la maison ;
- impossible de la lui retirer sans la changer pour tout le monde.

**Maintenant**, chacun a son compte : un courriel, un mot de passe.

---

## Comment ça se passe

### Le premier compte est le vôtre

Sur une plateforme neuve, il n'y a aucun compte. **Le premier créé est celui
du propriétaire**, et il entre immédiatement. C'est logique : personne n'est
là pour l'approuver, et l'attente serait sans fin. C'est celui qui installe
la maison.

### Les suivants attendent

N'importe qui peut créer un compte. **Personne n'entre pour autant.**

Un compte neuf est créé, et il attend. Il n'ouvre rien — ni les caisses, ni
les SMS, ni le guichet. C'est le propriétaire qui décide, depuis
**Réglages → Qui peut se connecter**.

Ce n'est pas une négligence d'avoir laissé l'inscription libre : ce qui
protège la plateforme n'est pas l'impossibilité de s'inscrire, c'est ce qu'un
compte neuf peut faire — c'est-à-dire rien.

### La clé de secours

L'ancien mot de passe unique (`TOTEM_MOT_DE_PASSE`) fonctionne toujours,
sous un lien discret de l'écran de connexion : « Utiliser la clé de secours ».

Elle existe pour une raison précise. Les comptes vivent dans Supabase. Si
Supabase ne répond pas, **plus personne n'entre** — pas même le propriétaire,
pas même pour constater la panne. Une base de données injoignable ne doit pas
être un verrou sur sa propre maison.

Qui a accès aux variables d'environnement de Vercel **est** le propriétaire :
cette clé donne donc aussi le droit d'administrer les comptes.

---

## Le mot de passe n'est jamais enregistré

Ce qui est rangé en base est une **empreinte** : un calcul qui va dans un sens
et pas dans l'autre. À la connexion, on refait le calcul sur ce qui vient
d'être tapé et on compare. La base ne contient donc jamais de quoi se
connecter à la place de quelqu'un — même volée, même lue par nous.

Le détail : `PBKDF2-SHA256`, 210 000 tours, un sel de 16 octets tiré au
hasard pour chaque mot de passe. Le nombre de tours est écrit dans l'empreinte
elle-même, si bien qu'en l'augmentant un jour, les anciennes continuent de se
vérifier et se réécrivent toutes seules à la connexion suivante. Personne
n'est mis dehors par un durcissement. Voir `web/lib/motdepasse.ts`.

**Une seule exigence : douze caractères.** Pas de « une majuscule, un chiffre,
un symbole » — ces règles-là produisent `Password1!`, qu'un dictionnaire
trouve en une seconde, et poussent à écrire le mot de passe sur un papier.

---

## Ce que la plateforme refuse de dire

Un courriel inconnu et un mauvais mot de passe reçoivent **exactement le même
message**, et prennent **exactement le même temps**.

Deux messages différents diraient à un inconnu quelles adresses ont un compte
ici — de quoi dresser une liste, puis s'acharner dessus. Deux durées
différentes le diraient aussi, sans un mot : c'est pourquoi la plateforme fait
tourner le calcul complet même quand le compte n'existe pas
(`LEURRE`, dans `web/lib/porte.ts`).

---

## Ce qui n'existe pas encore

**Rattacher une carte SIM à une personne.** L'idée — « l'administrateur te
donne les comptes qui sont à toi » — n'est pas construite. Tant qu'elle ne
l'est pas, un compte approuvé voit **tout** ce que voit le propriétaire.

C'est pourquoi l'approbation compte : n'approuvez que des personnes à qui vous
montreriez l'écran par-dessus votre épaule.

---

## Installer

1. Exécuter `migrations/20260829_utilisateurs.sql` dans Supabase
   (SQL Editor → New query → coller → Run). Le script est rejouable.
2. Vérifier que `SESSION_SECRET` est posé sur Vercel — sans lui, aucune
   session ne peut être signée, et **le verrou n'est pas actif du tout**.
3. Ouvrir la plateforme, créer le premier compte : c'est le vôtre.

`TOTEM_MOT_DE_PASSE` devient facultatif. Le garder donne la clé de secours ;
ne pas le poser n'empêche rien, tant que Supabase répond.

---

## Vérifier

```sh
cd web && node scripts/verifier-les-comptes.mjs
```

Il lance un vrai serveur et déroule la vie entière d'un compte : la première
inscription, une deuxième qui doit attendre, les mauvais mots de passe,
l'approbation, la fermeture, la clé de secours. Il cherche surtout à prendre
en défaut — un compte non approuvé qui entrerait, un invité qui
administrerait, un mot de passe qui se retrouverait quelque part en clair.
