# Plusieurs cartes, plusieurs réseaux — comment tout s'emboîte

TOTEM est né avec une seule carte Orange. Il héberge maintenant Orange **et**
MTN côte à côte, et il est bâti pour accueillir un troisième opérateur demain
sans qu'on ait à repenser quoi que ce soit. Ce document dit où chaque notion
vit, et donne la marche à suivre, pas à pas, pour brancher un nouvel
opérateur.

## Les quatre notions, et où chacune vit

**La carte** — une puce physique, identifiée par son **ICCID** (le numéro de
série gravé dessus, unique au monde). C'est la caisse : le solde, les SMS,
l'historique appartiennent à la carte, jamais à l'opérateur. Deux SIM MTN
sont deux caisses. L'ICCID voyage de bout en bout : journal local du robot
(`totem/storage.py`), base cloud (`sql/schema.sql` — `cartes`, `comptes`,
`paiements.carte`), écrans de la plateforme (`web/lib/types.ts`).

**Le compte** — une carte posée dans un modem, avec sa session USSD et son
verrou (`totem/compte.py`). Un module H87600 = un modem = un compte. Les
modules sont détectés tout seuls au branchement (`totem/detect.py`) : rien à
déclarer, l'ordre des prises ne compte pas.

**L'opérateur** — « Orange », « MTN »… Il est lu sur l'**IMSI** de la puce
(les cinq premiers chiffres : `62401` = MTN Cameroun, `62402` = Orange
Cameroun — `totem/carte.py`), jamais sur le réseau capté : une puce MTN en
itinérance reste MTN. C'est à l'opérateur qu'appartiennent **les codes USSD
et les formulations de SMS** — pas à la carte : « \*126# puis 5 » vaut pour
toute puce MTN.

**Le terminal** — le Raspberry Pi de Douala, qui héberge plusieurs comptes à
la fois et pousse tout vers la base.

## Ce qui appartient au réseau, et comment on l'apprend

### Les codes USSD

Chaque opérateur a les siens, et **rien ne se devine** : une erreur de
chiffre envoie de l'argent ailleurs. Trois sources, dans cet ordre :

1. **Le catalogue de départ** (`totem/codes.py` côté robot,
   `web/lib/codes.ts` côté plateforme) : les codes composés sur un vrai
   téléphone. Orange y a ses cinq portes (`#148*2#`, `#148*5#`…) ; MTN n'y a
   pour l'instant que sa porte d'entrée, le menu `*126#`.
2. **Les raccourcis appris** : on fait l'opération une fois sur Telegram,
   puis 💾 — le robot retient le parcours (« \*126# puis 5 puis 1 »), le
   range **par opérateur** dans son journal, et le pousse dans la table
   `raccourcis` de la base. La plateforme lit cette table : le bouton appris
   apparaît sur l'écran USSD et dans les Réglages, et se rejoue étape par
   étape. Le code secret n'est **jamais** dans un parcours — l'apprentissage
   s'arrête juste avant.
3. **Le repli sur le menu** : un geste du guichet (dépôt, retrait,
   transfert…) dont le code profond n'est pas relevé passe par la porte du
   menu de l'opérateur (`codeGeste`, `web/lib/codes.ts`). La session s'ouvre
   sur `*126#`, le propriétaire choisit l'option, et la plateforme répond
   toute seule aux questions qu'elle reconnaît (numéro, montant). Un guichet
   MTN n'est donc jamais vide — il est juste moins direct tant que les codes
   profonds ne sont pas appris.

### La lecture des SMS

`totem/analyse_sms.py` ne se branche **pas** par opérateur : il lit des
formulations — « recu », « received », « Nouveau solde », « Net debit
amount »… — écrites pour couvrir MTN et Orange, en français et en anglais,
avec et sans accents. Un SMS d'une forme nouvelle n'est pas mal lu : il est
rangé « illisible » ou « message », **jamais inventé** (`None` dans le
doute). Et quand le lecteur s'améliore, le robot **relit tout l'historique**
tout seul (l'empreinte du lecteur, `tests/test_relecture.py`) : les vieux SMS
MTN mal compris se réparent d'eux-mêmes à la mise à jour.

### Le solde

Le solde d'une carte vient d'une seule source : la **réponse USSD de
l'opérateur** (`publier_solde`, `totem/nuage.py`), rattachée à l'ICCID.
Jamais un calcul à nous, jamais un SMS.

## Le chemin d'une opération lancée depuis la plateforme

```
écran (accueil, opérations, USSD)
  └─ choisit une carte → POST /api/commande {code, carte: ICCID}
       └─ table « commandes » (Supabase)
            └─ le robot relève (totem/pilotage.py)
                 └─ _compte_vise : l'ICCID désigne LA carte
                      └─ le modem de cette carte compose, la réponse remonte
```

Chaque demande porte l'ICCID de la carte choisie. Sans lui (vieil écran), le
robot compose sur sa première carte — le terminal à une seule SIM ne voit
aucune différence. Le libellé (« mtn ») reste accepté : c'est le geste
historique de Telegram.

## Marche à suivre : brancher un nouvel opérateur demain

Disons qu'un troisième réseau arrive. Dans l'ordre :

1. **Poser la puce dans un module.** Rien d'autre : la détection crée le
   compte toute seule, la carte est enregistrée par son ICCID, la base la
   reçoit. Si l'opérateur s'affiche « SIM inconnue », ajouter son préfixe
   IMSI dans `RESEAUX` (`totem/carte.py`) — une ligne.
2. **Sa marque à l'écran** (facultatif) : logo et couleur dans
   `web/app/logos-operateurs.tsx`. Sans eux, la carte s'affiche avec la puce
   neutre et son libellé écrit — jamais un écran cassé.
3. **Ses codes USSD.** Sur un vrai téléphone, relever la porte d'entrée du
   service d'argent, puis : soit l'inscrire au catalogue (`totem/codes.py` et
   `web/lib/codes.ts`), soit faire chaque opération une fois sur Telegram et
   💾 — les boutons appris arrivent tout seuls sur la plateforme. Le guichet
   web fonctionne dès que la porte du menu est connue (repli `codeGeste`).
4. **Ses SMS.** Garder les premiers vrais SMS (dépôt, retrait, transfert,
   solde), en faire des tests dans `tests/test_analyse_sms.py`, puis élargir
   les motifs d'`analyse_sms.py` jusqu'à ce qu'ils passent — sans jamais
   inventer un montant. La relecture automatique répare l'historique.
5. **Le nom du service sur les reçus** : une entrée dans `SERVICES`
   (`totem/app.py`) — « Orange Money », « MTN MoMo », le sien.
6. **La base : rien.** Les tables sont déjà par ICCID et par opérateur ;
   aucun schéma à toucher.

Ce qui ne doit jamais se faire : deviner un code USSD, deviner le sens ou le
montant d'un SMS, ranger quoi que ce soit par « réseau capté » plutôt que par
ICCID ou opérateur d'origine.

## Pourquoi les SMS MTN et Orange peuvent différer sans rien casser

Un SMS n'est jamais interprété pour être stocké : le **texte d'origine fait
foi**, il part entier vers la base, et l'analyse n'est qu'une lecture posée
dessus (montant, sens, catégorie) — refaite à chaque amélioration. Si MTN
écrit « You have received » là où Orange écrit « Vous avez recu », c'est un
motif de plus dans `analyse_sms.py`, pas une nouvelle architecture. Le pire
cas d'un SMS d'une forme inconnue : il s'affiche tel quel, marqué
« illisible », en attendant que le lecteur apprenne sa forme.
