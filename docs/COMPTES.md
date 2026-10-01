# Les comptes

> Qui peut ouvrir TOTEM, ce que chacun voit, et comment on décide.

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

### Puis la porte se referme

**Dès que ce compte existe, plus aucune inscription n'est possible.** Ni pour
un inconnu, ni pour le propriétaire lui-même. `/api/inscription` refuse, et le
lien « Créer un compte » disparaît des deux écrans — un bouton qui ne mène
qu'à un refus est un bouton de trop.

Pourquoi fermé plutôt qu'« ouvert mais en attente d'approbation » : une
plateforme qui suit l'argent d'une seule personne n'a aucune raison
d'accepter des inconnus. Un compte de plus, même en attente, c'est une ligne
de plus dans une base, un courriel de plus à surveiller, et une case de plus
où cliquer par erreur. Le défaut le plus sûr est celui qui ne demande rien à
personne.

Le refus ne distingue pas « ce courriel est déjà pris » de « inscriptions
fermées » : les distinguer dirait à un inconnu quelles adresses ont un compte
ici.

### Faire entrer quelqu'un

**Réglages → Qui peut se connecter → Créer un compte.**

Le propriétaire saisit le **prénom**, le **nom**, le **courriel** et un
**mot de passe** qu'il choisit, et transmet ce mot de passe à la personne.
Pendant la phase d'essai, personne ne s'inscrit seul : c'est lui qui pose
chaque compte. Le nom sert à reconnaître la personne dans la liste —
« vendeur2@gmail.com » ne dit pas qui c'est.

On le fait au même endroit sur le site (**Console → Les gens**, ou Réglages)
et sur le téléphone (**Réglages → Qui peut se connecter**). Le compte naît **approuvé** — c'est
lui qui crée, et créer *est* décider ; une case à cocher ensuite ne servirait
à rien. Il naît **invité**, jamais propriétaire : l'écran ne doit pas pouvoir
fabriquer un second propriétaire, qui pourrait ensuite fermer la porte au
premier.

Le mot de passe s'affiche en clair dans le formulaire, à dessein : le
propriétaire doit pouvoir le relire pour le transmettre. Ce n'est pas le sien.

L'inscription libre, elle, reste fermée. C'est désormais le seul chemin.

> **Il en fallait un.** Google EXIGE un compte qui fonctionne pour examiner
> l'application (formulaire « Informations de connexion » de la Play
> Console). Sans ce chemin, il aurait fallu livrer le compte du propriétaire
> à un examinateur — c'est-à-dire son mot de passe, sans moyen de le
> reprendre autrement qu'en le changeant.

### Ce qu'un compte créé voit : les cartes qu'on lui confie

**Rien, tant qu'on ne lui a pas confié de carte.** Sur chaque compte, la ligne
« Cartes qu'il voit » et le bouton **Confier des cartes** : une case par carte
SIM de la maison, présente dans le terminal ou retirée.

| Qui | Ce qu'il voit |
|---|---|
| Le propriétaire | **toutes** les cartes |
| La clé de secours | **toutes** les cartes |
| Un invité | **seulement** les cartes qu'on lui a confiées |
| Un invité sans carte | **rien** — et la page le dit en toutes lettres |

« Voir » veut dire **partout** : les écrans, l'application du téléphone, la
liste des SMS, les soldes, le bilan CSV, les reçus PDF, la fiche des
coordonnées, la pastille des non-lus. La règle est écrite UNE fois
(`web/lib/portee.ts`) et `chargerDonnees` exige une portée : une page qui
l'oublierait ne compilerait pas.

Une carte peut être confiée à plusieurs personnes ; une personne peut tenir
plusieurs cartes. Reprendre une carte agit **tout de suite**, même sur un
téléphone déjà connecté. **Console → Les cartes SIM** montre à qui chaque
carte est confiée.

Les liens signés (un reçu, un bilan ouverts dans le navigateur du téléphone)
tiennent la même règle : un lien de reçu ne se signe que pour un reçu
visible, et un lien de bilan porte **pour qui** il a été fait — réécrit pour
« tout », il n'ouvre plus rien.

Un compte se bloque ou se supprime d'un bouton, sur la même page. Supprimer
un compte efface aussi ses cartes confiées.

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

## Une carte confiée est une carte donnée

Il y a deux rôles : **propriétaire** et **titulaire** (un compte créé par le
propriétaire, à qui il confie des cartes).

Confier une carte, ce n'est pas la prêter pour qu'on la regarde : c'est la
**remettre**. Le titulaire y travaille comme le propriétaire travaille sur les
siennes — il compose, répond au menu, entre le code secret, établit les reçus,
classe ses SMS, renomme la carte. Son téléphone sonne quand l'argent arrive
**sur ses cartes**, et sur aucune autre. Le propriétaire garde la main sur
toutes, pour intervenir s'il y a un problème.

| Qui | Ses cartes | Les cartes des autres | Le carnet des boutons, les comptes, la console |
|---|---|---|---|
| Personne (sans session) | — | — | non |
| Titulaire | **tout** | **rien** — ni voir, ni composer, ni lire une réponse | non |
| Propriétaire | tout | tout | oui |
| Clé de secours | tout | tout | oui |

Le carnet des boutons d'un opérateur reste au propriétaire : il sert à
**toutes** les cartes de cet opérateur, et le réécrire changerait ce que les
autres composent.

**Chaque geste dit sa carte.** Une réponse au menu, un raccrochage, une
demande de reçu portent la carte qu'ils visent ; la plateforme vérifie qu'elle
est confiée à celui qui la porte (`maniement`, dans `web/lib/portee.ts`). Le
robot, lui, ne tient qu'une session à la fois : une réponse qui nomme une
carte ne tombe jamais dans la session ouverte sur une autre, un raccrochage
ne coupe que la sienne, et ouvrir une session n'interrompt pas l'opération
qu'un autre mène sur une autre carte — on lui répond « réessayez dans un
instant ».

**Chaque téléphone sonne pour son titulaire.** La table des appareils dit à
qui est chaque téléphone (colonne `utilisateur`, migration du 2 octobre). Le
robot fait sonner, pour un SMS : les téléphones du propriétaire, et ceux des
comptes à qui la carte de ce SMS est confiée. « Envoyer un essai » ne fait
sonner que les téléphones de celui qui appuie.

Un **ancien jeton**, émis avant les comptes, ne désigne personne : il ouvre
encore les écrans jusqu'à son expiration, mais plus le guichet. Il suffit de
se déconnecter et de se reconnecter.

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

## Installer

1. Exécuter `migrations/20260829_consolidation.sql` dans Supabase
   (SQL Editor → New query → coller → Run). Le script est rejouable.
2. Vérifier que `SESSION_SECRET` est posé sur Vercel — sans lui, aucune
   session ne peut être signée, et **le verrou n'est pas actif du tout**.
3. Ouvrir la plateforme, créer le premier compte : c'est le vôtre.
4. **Les cartes de chacun** : exécuter aussi
   `migrations/20261001_consolidation.sql` (même chemin). Il ajoute la
   liste des cartes confiées, le prénom et le nom des comptes, et se vérifie
   lui-même. Il ne touche à aucun mot de passe. **À faire avant de mettre la
   plateforme à jour** : sans lui, les invités ne voient rien.
5. **Les cartes données** : exécuter aussi
   `migrations/20261002_consolidation.sql`. Il dit à qui sonne chaque
   téléphone. Sans lui, la plateforme refuse d'inscrire le téléphone d'un
   titulaire — inscrit sans nom, il serait pris pour celui du propriétaire et
   recevrait chaque SMS de la maison.
6. Confier ses cartes à chaque titulaire — jusque-là, il ne voit rien.

`TOTEM_MOT_DE_PASSE` devient facultatif. Le garder donne la clé de secours ;
ne pas le poser n'empêche rien, tant que Supabase répond.

---

## Vérifier

```sh
cd web && node scripts/verifier-les-comptes.mjs   # la vie d'un compte
cd web && node scripts/verifier-les-cartes.mjs    # chacun ne voit que ses cartes
```

Il lance un vrai serveur et déroule la vie entière d'un compte : la première
inscription, une deuxième qui doit attendre, les mauvais mots de passe,
l'approbation, la fermeture, la clé de secours. Il cherche surtout à prendre
en défaut — un compte non approuvé qui entrerait, un invité qui
administrerait, un mot de passe qui se retrouverait quelque part en clair.
