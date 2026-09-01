# Tout ce qui peut arriver, et qui décide

Quatre divisions ont cherché : le conforme, l'hostile, le matériel, l'humain.
Ce document rassemble ce qu'elles ont trouvé, en ne gardant que ce qui a été
**vérifié dans le code, dans un texte de norme, ou dans une source datée**.

Chaque cas porte un verdict, et c'est la seule chose qui compte vraiment :

- **ÉCRAN** — la personne sait déjà quoi faire, il lui manque de voir.
- **RÈGLE** — le système tranche seul, à 3 h du matin, et le défaut doit être
  le moins destructeur.
- **HUMAIN** — le fait est extérieur au système : une mort, un conflit, un vol.
  Un « appelez quelqu'un » n'est un chemin que s'il porte **un numéro, une
  phrase à dire, et un délai attendu**. Sinon c'est un abandon écrit en petit.

---

## Ce que l'état actuel du dépôt garantit

Ces cinq faits ont été lus dans le code, pas supposés. Ils commandent tout le
reste, et aucune règle de rôle ne peut s'écrire tant qu'ils tiennent.

| Ce qui est | Où |
|---|---|
| Sans `SESSION_SECRET`, **le verrou s'ouvre** : `return NextResponse.next()` | `web/middleware.ts:16` |
| Jeton `proprietaire.<expiration>.<signature>` — **sujet en dur**, pas d'identifiant de session, pas d'appareil | `web/lib/session.ts:33` |
| **30 jours**, et **rien à révoquer** : aucune table de sessions | `web/lib/session.ts:28` |
| **Un seul mot de passe**, partagé, sans limitation de tentatives | `web/app/api/connexion/route.ts` |
| Le web parle à Supabase avec la clé **`service_role`** : la RLS n'est jamais évaluée | `web/lib/serveur.ts` |

**La conséquence, et c'est la plus grave de tout ce document :** aucun
événement du système ne peut désigner **une personne**. La table `commandes`
n'a pas de colonne « demandé par ». Le jour où 300 000 F manquent, TOTEM ne
pourra ni confondre Ghislain ni le disculper — et une famille se déchirera sur
un journal qui dit « quelqu'un ».

> **Avant les rôles, avant les clés d'accès, avant le papier : une identité par
> personne, et une colonne qui dit qui a appuyé.** Le reste est décoratif tant
> qu'une session est un jeton d'un mois que personne ne peut retirer.

---

## A · Les gens, et ce qui leur arrive

**A1 · L'employé licencié à 18 h.** *Fréquent × grave.* Il rentre chez lui,
ouvre l'onglet resté connecté, et sort 180 000 F. Changer le mot de passe ne
casse rien : le jeton déjà signé reste valide jusqu'à son expiration.
→ **RÈGLE** : une table de sessions révocables. **ÉCRAN** : `C9`, où retirer
une clé ferme les sessions **en cours**, dans la seconde — pas à la prochaine
entrée. *Dessiné.*

**A2 · Deux personnes, un seul compte.** *Permanent × maximal.* C'est
l'état d'aujourd'hui, garanti par construction.
→ **RÈGLE** : le partage doit être **impossible**, pas déconseillé. Un compte,
une personne, un numéro.

**A3 · Le neveu qui connaît le geste de déverrouillage.** *Fréquent × grave.*
Une clé liée au téléphone authentifie **le téléphone**, pas la personne. Sur un
combiné de comptoir, elle appartient à qui le ramasse.
→ **ÉCRAN** : `C3` pose la question **avant** d'offrir quoi que ce soit — « ce
téléphone est-il à vous, ou à la boutique ? » — et la réponse **retire** la
voie au lieu d'ajouter un avertissement. *Dessiné.* **RÈGLE** : sur un appareil
partagé, jamais de clé liée au téléphone, session courte, sortie en fin de
journée.

**A4 · L'employé revient six mois plus tard.** *Fréquent × moyen.* Une nouvelle
invitation crée une seconde identité, et l'historique se coupe en deux.
→ **ÉCRAN** : « Cette personne a déjà travaillé ici, de mars à septembre.
Réactiver ? » **RÈGLE** : on réactive, on ne recrée jamais — exactement le
traitement déjà donné aux SIM retirées, qui retrouvent leur journal intact. Les
gens méritent au moins ce qu'on a fait pour les cartes.

**A5 · Le commerçant meurt.** *Rare par personne, certain sur une flotte ×
maximal.* Chez l'opérateur, le solde est bloqué jusqu'au jugement d'hérédité —
des mois. Mais **l'argent qui entre n'obéit pas à TOTEM** : les clients
continuent de payer sur la puce. Un gel qui arrête l'enregistrement perd de
l'argent en silence.
→ **RÈGLE** : un état « succession » qui gèle les **sorties** et les **accès**,
jamais l'**enregistrement**, jamais les reçus. **ÉCRAN**, un an plus tôt, à la
création du commerce, une seule question : « Si vous n'êtes plus joignable, qui
prévient-on ? » Trente secondes qui sauvent une boutique. **HUMAIN** pour en
sortir, contre une pièce.

**A6 · Le divorce, les deux héritiers.** *Occasionnel × maximal.* Deux
personnes réclament le même terminal, et le premier entré vide la caisse.
→ **RÈGLE** : conflit déclaré ⇒ **lecture seule pour tout le monde**, y compris
celui qui a l'air d'avoir raison. Le gel symétrique est le seul défaut honnête :
TOTEM ne doit pas trancher un litige au profit du plus rapide. **HUMAIN** pour
le lever, jamais un écran.

**A7 · La vente du commerce.** *Occasionnel × grave.* L'acheteur reçoit le
boîtier — et, si personne n'y pense, les clients du vendeur.
→ **HUMAIN** : une césure datée, inscrite au journal, irréversible. C'est un
acte, pas un réglage.

**A8 · La personne âgée à qui son fils fait tout.** *Fréquent × grave.*
Interdire est inutile : ça arrivera. Ne rien dire transforme une assistance en
captation qu'on ne peut plus dénouer.
→ **ÉCRAN + RÈGLE** : nommer la chose — « Mme Ngo, assistée de Paul » — un
mandat déclaré, révocable par elle seule, et un SMS **vers elle** à chaque
sortie au-dessus d'un seuil qu'elle fixe.

**A9 · Quelqu'un qui ne sait pas lire.** *Fréquent × grave.* Au marché de
Bafoussam ce n'est pas un cas limite, c'est une partie de la clientèle. Or
TOTEM affiche le SMS de l'opérateur mot pour mot — bonne règle pour la preuve,
la pire pour la décision.
→ **RÈGLE, et c'est la plus importante de la liste : aucune décision qui engage
de l'argent ne doit dépendre de la lecture d'une phrase.** Le montant en très
grands chiffres, une flèche entrante ou sortante, les trois tranches du numéro.
Le texte reste dessous, intact, pour qui sait lire et pour le litige. *Cette
règle sert aussi celui qui voit mal, celui qui ne parle ni français ni anglais,
et celui qui est pressé : trois problèmes, un seul travail.*

**A10 · Deux commerçants partagent un terminal.** *Fréquent × grave.* Le modèle
sépare déjà proprement les caisses par ICCID — mais **l'accès ne connaît que le
terminal**. Un seul mot de passe ouvre les deux journaux.
→ **RÈGLE**, presque gratuite vu le schéma : **l'accès se donne par carte, pas
par terminal.** La requête existe, il manque le filtre.

**A11 · L'homonyme, et celle qui change de nom en se mariant.**
→ **RÈGLE** : un nom n'identifie jamais un compte dans un écran de décision.
Nom **plus** un élément distinctif choisi par le propriétaire. Changer de nom
est une modification, jamais une nouvelle personne — sinon l'historique se
casse le jour du mariage.

---

## B · La contrainte, la ruse, le vol

**B1 · Le lien d'invitation dans le groupe WhatsApp de 40 personnes.**
*Fréquent × grave.*
→ **RÈGLE** : invitation **liée au numéro dès l'émission** — le code part sur
*ce* numéro, pas sur celui qu'on tape — usage unique, et l'ouverture par un
second navigateur invalide **et** alerte. **ÉCRAN** : `C6` dit « quelqu'un a
ouvert cette invitation avant vous », jamais « lien invalide » qui pousse à
réessayer. *Dessiné.*

**B2 · Le faux TOTEM qui relaie le code en temps réel.** *Fréquent × maximal.*
Et sa variante rentable : le faux TOTEM demande le PIN, et l'obtient — parce
que **le vrai en demande un**, sur un pavé qui ressemble à celui-là.
> La promesse « TOTEM ne demande jamais le PIN » est vraie au sens « ne le
> stocke pas ». Elle est **fausse en pratique** : `web/app/pave-secret.tsx`
> existe. Cette nuance ne survit à aucun hameçonnage.
→ **RÈGLE** : la clé d'accès est la seule défense réelle (liée au domaine, elle
ne part pas sur un faux site). Et le pavé ne s'ouvre **que** si le terminal a
déclaré une session USSD vivante, en affichant le texte exact du menu reçu à
l'instant — qu'un faux site ne peut pas produire. **ÉCRAN** : le contexte dans
le SMS lui-même, pas dans une page.

**B3 · Le téléphone déverrouillé arraché au feu de Deido.** *Occasionnel ×
grave.* Session vivante, soldes, noms, numéros de tous les clients.
→ **ÉCRAN** : montants et numéros **masqués par défaut**, révélés au toucher,
un par un. Un écran arraché ne montre rien. **RÈGLE** : expiration
d'inactivité, jeton lié à l'appareil.

**B4 · La révocation d'urgence, sans téléphone.** *Et personne n'y pense.*
Quelqu'un dont le téléphone vient d'être arraché **n'a pas d'appareil** pour
ouvrir un écran.
→ **ÉCRAN** : `C8` met **fermer** avant **rentrer**, et fermer ne demande
aucune preuve — fermer une porte n'a jamais nui à personne. *Dessiné.*
**RÈGLE** : un chemin hors application — un numéro, un SMS — qui gèle tout en
trente secondes depuis un combiné emprunté. *À dessiner.*

**B5 · La contrainte physique.** *Rare × maximal.* Trois hommes attendent à la
fermeture.
→ **RÈGLE, et c'est du temps, pas un refus.** Tout ce qui est facultatif sera
exigé sous contrainte ; tout ce qui est visible sera vu par l'agresseur. Un
second code « de détresse » qui **refuse** augmente le danger physique. Il doit
donc **accepter** : « Transfert enregistré, il partira dans quelques minutes —
le réseau est chargé » — phrase vraie dix fois par jour au Cameroun. Rien n'est
déposé, une alerte silencieuse part, tout est gelé six heures.
→ **ÉCRAN : aucun.** C'est la règle. Le geste de détresse ne se voit nulle part
— pas de bouton, pas de mention, pas d'aide en ligne. Il s'enseigne oralement à
l'installation, et l'écran de confirmation est identique aux pixels près dans
les deux cas, durées de réponse comprises.
→ Corollaire : **le plafond journalier est la vraie parade**, parce qu'il rend
la contrainte peu rentable par nature. On n'extorque pas ce que le système ne
sait pas faire en une fois.

**B6 · La reprise du numéro.** *Occasionnel × grave.* Duplication de SIM contre
10 000 F, ou — bien plus banal — un numéro inactif **réattribué** trois mois
plus tard à un inconnu qui reçoit un jour « Code 481 902 pour ouvrir TOTEM ».
→ **RÈGLE** : le SMS seul n'ouvre jamais un compte qui a de l'argent.
**Refroidissement de 48 h** sur un numéro fraîchement lié : il consulte, il ne
sort rien, et l'ancienne voie reste valide. L'alerte part sur **l'ancien et le
nouveau** numéro.

**B7 · Le rôle « lecteur » qui n'en est pas un.** *Permanent × grave.* La
comptable appelle `POST /api/commande` depuis la console de son navigateur.
→ **RÈGLE** : le rôle vit dans la session **serveur**, chaque route déclare son
rôle minimal, et le refus est journalisé. **ÉCRAN** : le bouton **présent mais
désarmé**, avec « Demander à Mme Fotso » — un bouton absent se contourne, un
bouton qui refuse enseigne. *Dessiné en `C7`.*

**B8 · Nelson devenu hostile, ou son compte pris.** *Rare × maximal.*
→ **RÈGLE** : le super-admin **ne peut déclencher aucun mouvement d'argent**,
par aucun chemin — séparation structurelle, pas contractuelle. Accès
d'assistance à durée limitée et **consenti**. **ÉCRAN**, des deux côtés :
côté client « Nelson (assistance) regarde votre boutique — jusqu'à 15 h 40 ·
Arrêter maintenant » ; côté Nelson « Vous regardez la caisse de quelqu'un. Elle
le voit. » *L'asymétrie doit être visible des deux côtés.* **À dessiner.**

**B9 · Le lien de reçu deviné.** `TM-2026-0731-0042` → essayer `-0041`.
La numérotation est entièrement prédictible et `/api/recu/[numero]` ne vérifie
aucune appartenance.
→ **RÈGLE** : un suffixe aléatoire dans l'URL, le numéro lisible restant pour
l'humain. **ÉCRAN**, là où on s'apprête à le partager : « Ce lien ouvre le
document pour qui l'a. Ne le publiez pas dans un groupe. »

**B10 · Le groupe Telegram comme porte dérobée.** L'appartenance au groupe donne
la lecture intégrale, et elle se gère **dans Telegram**, hors de TOTEM.
→ **ÉCRAN** : « 6 personnes lisent vos encaissements dans Telegram », avec la
liste. Une appartenance à un groupe doit apparaître comme un accès, parce que
c'en est un.

---

## C · Le courant, le réseau, la matière

**C1 · Le Pi redémarre après douze heures de délestage, sans réseau, avec une
horloge fausse.** *Très fréquent × grave.* Eneo programme à Douala des coupures
de 6 h à 18 h. Un Raspberry Pi n'a pas d'horloge sauvegardée. Au retour, il
relève vingt SMS et les date de n'importe quand — `TM-1970-0101-0043` remis à
un client.
→ **RÈGLE** : aucun reçu n'est établi tant que l'heure n'est pas certifiée par
une source extérieure. **Un reçu daté faux est pire que pas de reçu** — c'est
déjà la doctrine du dépôt pour les montants, elle n'est pas appliquée à l'heure.

**C2 · Le voyant vert d'un terminal mort.** *Très fréquent × grave.* Avec le
décalage d'horloge, un terminal éteint **paraît en ligne pendant une heure**.
L'opérateur dit à un client « c'est bon, c'est arrivé » en regardant une
pastille qui décrit un Pi hors tension.
→ **ÉCRAN + RÈGLE** : écrire « dernière nouvelle il y a 4 minutes » en toutes
lettres. Et surtout : **« aucun paiement » et « je ne sais pas » ne doivent
jamais avoir la même apparence.**

**C3 · Le forfait épuisé le 28, et la veille qui s'éteint sans le dire.**
*Très fréquent × grave.* `web/app/veille.tsx` échoue en silence : l'écran
continue d'afficher les mêmes chiffres, qui vieillissent.
→ **ÉCRAN** : « Écran figé depuis 13 h 42 — plus de connexion ». **RÈGLE** :
cadence dégradée au lieu d'un martèlement fixe — sur un forfait prépayé, c'est
de l'argent réel qui part pour rien.

**C4 · Un client attend, le téléphone n'a plus de réseau.** *Très fréquent.*
`manifest.ts` déclare une application installable, mais il n'y a **aucun service
worker** : hors ligne, c'est une page blanche. Le moment où l'écran compte le
plus est exactement celui où il n'y a rien.
→ **RÈGLE** : le dernier écran vu reste lisible hors ligne, horodaté et marqué
« pas rafraîchi ».

**C5 · Le terminal volé, et la puce sans code PIN.** *Rare × maximal.* La fiche
d'installation demande de désactiver le PIN de la puce — nécessaire pour que le
robot démarre, et c'est le point de rupture matériel : qui repart avec le
boîtier repart avec une SIM Mobile Money qui s'allume dans n'importe quel
téléphone.
→ **HUMAIN, porté par un écran** : l'alerte doit contenir **le numéro du
service client de l'opérateur, la phrase à dire, et le numéro de la ligne**. Un
« appelez quelqu'un » sans numéro ni phrase, c'est « débrouillez-vous ».

**C6 · Le commerce brûle ou est inondé, et le papier était dans le tiroir.**
*Rare × grave.* Un papier de secours rangé au même endroit que le terminal
n'est pas un secours : c'est une copie.
→ **ÉCRAN** : `C4` dit « gardez-le ailleurs qu'ici », et la règle est plus
forte que ça — **le papier ne s'imprime jamais dans la boutique où vit le
terminal**. *À durcir dans la maquette.*

**C7 · Nelson n'est pas joignable.** *Rare × maximal, et personne n'y pense.*
Un seul super-administrateur, en France. Hôpital, avion, deuil. Pendant ce
temps : aucune invitation, aucune révocation, aucune succession débloquée, pour
toute la flotte. **Chaque « HUMAIN » de ce document pointe aujourd'hui vers la
même personne** — c'est le vrai point unique de rupture.
→ **RÈGLE** : tout geste vital a un chemin qui ne passe pas par Nelson — le
propriétaire révoque chez lui, gèle chez lui, exporte chez lui. **HUMAIN** : un
second super-administrateur, et l'écrire plutôt que le découvrir un mardi.

---

## D · Ce que la maquette a appris en se faisant mesurer

Quatre règles nées de fautes réelles, commises dans ces écrans et attrapées par
l'outil — pas par l'œil.

1. **Un motif ne se pose pas sous une phrase.** Le claustra à pleine opacité
   avalait le titre de l'invitation, et le calcul de contraste ne savait rien
   d'une image. Le motif descend maintenant dans une couche, par une classe
   unique : il n'y a plus qu'une façon de s'en servir.
2. **La cible d'une case, c'est son étiquette.** Le doigt tombe sur la carte,
   pas sur le rond de 24px.
3. **Une rangée cliquable n'est pas un bouton.** Elle grandit avec son texte ;
   la contraindre à 44px forcerait à couper la phrase, c'est-à-dire à cacher
   l'information pour sauver la mesure.
4. **Un SMS n'est pas une chaîne de caractères, c'est un encodage.** Le point
   médian `·` de la marque ne tient pas dans l'alphabet GSM 03.38 : un seul
   suffit à basculer tout le message en UCS-2, qui tombe de 160 à 70 signes par
   morceau. Les trois SMS annoncés « un seul envoi » partaient en deux et trois
   morceaux — et un code coupé en deux arrive dans le désordre.
   → **Le point médian est interdit dans un message. Il reste à l'écran.**
   `verifier-sms.mjs` le vérifie et écrit les comptes lui-même : un chiffre
   écrit à la main dans une maquette est un chiffre qui sera faux à la
   prochaine phrase changée.

---

## Si l'on ne fait que trois choses

1. **Un registre de sessions révocables, et une colonne « demandé par ».**
   Sans imputabilité, le contrôle d'accès est décoratif.
2. **Un plafond journalier et une fenêtre horaire, côté serveur** — plus la
   carte de confirmation du chemin Telegram portée sur le web. C'est ce qui
   attrape le licencié, le neveu, le voleur et la contrainte, sans demander
   la moindre discipline à personne.
3. **Le cloisonnement par boutique, avec la clé publique et la RLS réellement
   évaluée.** Aujourd'hui `chargerDonnees` ne filtre par aucun terminal : dès
   le second client, chacun voit la comptabilité de l'autre.

Les clés d'accès, le papier et le geste de détresse viennent après. Ils ne
valent rien tant qu'une session est un jeton d'un mois que personne ne peut
retirer.
