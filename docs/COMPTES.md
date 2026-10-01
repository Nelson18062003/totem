# Les comptes

> Qui peut ouvrir TOTEM, ce que chacun voit, et comment on entre.

---

## Avant / après

**Au début**, la plateforme avait UN mot de passe, rangé dans une variable
d'environnement sur Vercel. Impossible de savoir qui s'était connecté,
d'ouvrir à quelqu'un sans lui donner la clé de la maison, de la lui retirer
sans la changer pour tout le monde.

**Ensuite**, chacun a eu son compte : un courriel, un mot de passe. Mais un
compte créé voyait **tout** — chaque carte, chaque SMS, chaque montant.

**Depuis le 1er octobre 2026** :

- on entre **par un code** envoyé au courriel — il n'y a plus de mot de passe ;
- chaque personne ne voit que **les cartes SIM qu'on lui a confiées**.

---

## Entrer : un courriel, puis un code

1. On tape son courriel, on appuie sur **Recevoir un code**.
2. Un code à six chiffres arrive dans la boîte (regarder aussi les
   indésirables).
3. On le tape. On est dedans.

Le web et l'application du téléphone font **exactement** le même chemin, et
la même règle décide (`web/lib/porte.ts`).

Ce que le code tient, et c'est la base qui le fait respecter
(`poser_un_code`, `essayer_un_code` dans `sql/schema.sql`) :

| Règle | Pourquoi |
|---|---|
| Il sert **une fois** | même tapé par dix mains en même temps — `sql/verifier-les-regles.sh` le lance pour de vrai |
| Il vit **dix minutes** | le temps d'ouvrir sa boîte, pas celui de traîner |
| **Cinq** essais faux le brûlent | un code n'a qu'un million de valeurs |
| Pas **deux codes dans la minute** | sinon n'importe qui remplirait une boîte en boucle |
| Il n'est **jamais rangé** | la base ne garde que son empreinte, signée avec le secret de la plateforme : volée, elle ne donne rien |

Pourquoi un code plutôt qu'un mot de passe : un mot de passe se choisit mal,
se réutilise d'un site à l'autre, se note sur un papier — et sa fuite
AILLEURS ouvrait la porte ici. Un code ne se choisit pas, et chaque entrée
prouve qu'on tient la boîte.

### Ce que la plateforme refuse de dire

« Si cette adresse a un accès, un code vient de partir. » — **la même phrase
pour tout le monde**, au même moment. Le travail (chercher le compte, poser
le code, envoyer la lettre) se fait APRÈS la réponse : ni le message ni le
chronomètre ne disent quelles adresses ont un compte ici. Un code faux, un
code expiré, une adresse inconnue reçoivent aussi le même refus.

### Ce qu'une attaque peut coûter

Un attaquant ne peut pas entrer, mais en tapant des codes faux sur VOTRE
adresse, il peut brûler votre code en cours : vous en redemandez un. Le
frein (par adresse réseau, compté dans la base) le ralentit, puis le mure.
`web/scripts/verifier-le-frein.mjs` le mesure.

### La clé de secours

Le mot de passe unique `TOTEM_MOT_DE_PASSE`, sous un lien discret de l'écran
de connexion : « Utiliser la clé de secours ». **C'est le seul mot de passe
qui reste**, et il existe pour une raison : les comptes vivent dans Supabase
et les codes partent par Resend. Si l'un des deux se tait, **plus personne
n'entre** — pas même le propriétaire, pas même pour constater la panne.

Qui a accès aux variables d'environnement de Vercel **est** le propriétaire :
cette clé voit tout et administre.

---

## Le premier compte est celui du propriétaire

Sur une plateforme neuve, il n'y a aucun compte. **Le premier créé est celui
du propriétaire.** Il ne repart pas avec une session : un code part à son
courriel, et c'est ce code qui ouvre. Un courriel mal tapé à l'installation
se voit donc tout de suite.

**Dès que ce compte existe, plus aucune inscription n'est possible.**
`/api/inscription` refuse, et le lien « Créer un compte » disparaît.

---

## Faire entrer quelqu'un

**Console → Les gens** (web), ou **Réglages → Qui peut se connecter** (web et
téléphone) → **Créer un compte**.

Un courriel, et c'est tout. Il n'y a plus de mot de passe à inventer, à
recopier, à envoyer par WhatsApp. La personne reçoit une lettre qui lui dit
qu'elle a accès ; pour entrer, elle tape son courriel et reçoit un code.

Le compte naît **approuvé** (créer EST décider) et **invité**, jamais
propriétaire.

---

## Ce que chacun voit : les cartes confiées

Sur la même page, chaque compte porte la ligne **« Cartes qu'il voit »**, et
le bouton **Confier des cartes** : une case par carte SIM de la maison —
présente dans le terminal ou retirée.

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
téléphone déjà connecté : la liste est relue à chaque demande.

**La console → Les cartes SIM** montre, pour chaque carte, à qui elle est
confiée.

Les liens signés (un reçu, un bilan ouverts dans le navigateur du téléphone)
tiennent la même règle : un lien de reçu ne se signe que pour un reçu
visible, et un lien de bilan porte **pour qui** il a été fait — réécrit pour
« tout », il n'ouvre plus rien.

---

## Un invité regarde ; il ne compose pas

Confier une carte, c'est la **montrer**, pas la mettre entre les mains :

| Qui | Consulter | Déposer une demande au terminal (USSD, solde…) |
|---|---|---|
| Personne (sans session) | non | non |
| Invité | ses cartes | **non** |
| Propriétaire | tout | oui |
| Clé de secours | tout | oui |

Un invité ne reclasse pas un SMS, ne marque rien comme lu, et n'inscrit pas
son téléphone aux notifications : celles-ci portent le SMS reçu en aperçu,
de toutes les cartes.

Laisser un vendeur **opérer** sa propre carte (dépôt, retrait) serait la
prochaine étape. Elle se décide, elle ne s'improvise pas : c'est de l'argent.

---

## Fermer, supprimer

Un compte se **bloque** ou se **supprime** d'un bouton. Le jeton déjà délivré
cesse d'ouvrir quoi que ce soit — à la demande suivante, pas dans un mois.
Supprimer un compte efface aussi ses cartes confiées et son code en cours.

Le compte du propriétaire ne se ferme ni ne se supprime — par personne, pas
même avec la clé de secours : une plateforme sans propriétaire rouvrirait ses
inscriptions au monde entier.

---

## Installer

1. Exécuter `migrations/20261001_codes-et-cartes.sql` dans Supabase
   (SQL Editor → New query → coller → Run). Rejouable. Il se vérifie
   lui-même, et **efface les anciennes empreintes de mot de passe**.
2. Régler le courrier : voir `docs/CLOUD.md`, « Le courrier des codes ».
3. Vérifier que `SESSION_SECRET` est posé sur Vercel — il signe les sessions
   ET les empreintes des codes.
4. Confier à chaque invité ses cartes : **jusque-là, il ne voit rien.**

⚠️ **Les applications déjà installées** envoient encore un mot de passe, qui
ne marche plus : il faut leur pousser la mise à jour (voir `docs/MOBILE.md`)
avant ou en même temps que la plateforme.

---

## Vérifier

```sh
cd web && node scripts/verifier-les-comptes.mjs   # la vie d'un compte
cd web && node scripts/verifier-les-cartes.mjs    # chacun ne voit que ses cartes
sh sql/verifier-les-regles.sh                      # le code ne sert qu'une fois
```

`verifier-les-cartes` se met à la place d'un vendeur et cherche ce qui fuit :
l'application, les pages, le bilan, un lien signé réécrit, un reçu deviné,
les coordonnées d'une autre carte. Rendre la règle aveugle le fait échouer
dix-sept fois.
