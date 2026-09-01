# Plusieurs clients, une seule SIM ? Les « numéros virtuels » n'existent pas — voici ce qui existe

> Question posée (septembre 2026) : « J'ai obtenu une SIM MTN "Master" — sans
> frais, sans plafond de volume, au nom de l'entreprise. Je veux que d'autres
> personnes utilisent TOTEM, chacune avec son compte, mais sur MON
> infrastructure et MA SIM. Quand quelqu'un leur envoie de l'argent, il
> arrive sur mon numéro, au nom de l'entreprise : je ne sais pas à qui il est
> destiné. Peut-on créer des numéros virtuels par-dessus la SIM, comme les
> fintechs font avec les IBAN virtuels ? »
>
> Réponse courte : **non, pas chez MTN, pas sur ce rail-là.** Un compte
> Mobile Money, c'est un numéro de téléphone, une identité KYC, une puce.
> MTN Cameroun ne fabrique pas de sous-numéros. Mais le vrai problème —
> *savoir pour qui un encaissement est arrivé* — a quatre solutions
> connues. Trois sont bonnes, une est un bricolage. Et il y a une question
> de droit qu'on ne peut pas contourner en écrivant du code.

---

## 1. Pourquoi l'analogie avec l'IBAN virtuel ne tient pas

Au Nigeria, Paystack, Flutterwave ou Monnify donnent à chaque client un
« compte virtuel » : un numéro de compte à dix chiffres, unique, qui verse en
réalité dans un seul compte de la fintech chez Wema ou Providus Bank. Cela
marche parce qu'une **banque** peut créer autant de numéros de compte qu'elle
veut sous un même compte de règlement : c'est une ligne dans son grand livre.

Au Kenya, M-Pesa a l'équivalent côté opérateur : le **Paybill**. Le payeur
tape un numéro d'entreprise PUIS un « numéro de compte » libre (référence
d'élève, de contrat, de commande). L'attribution est faite par le payeur
lui-même, au moment de payer.

**MTN Cameroun n'a ni l'un ni l'autre.**

- Un transfert de personne à personne (`*126#`, « Envoyer de l'argent ») porte
  un montant et un destinataire. Pas de référence. Le SMS que TOTEM lit dit
  « recu 25 000 FCFA de NGONO Marie (677123456) » — l'expéditeur, pas le
  motif.
- Un paiement marchand se compose `*126*4*CODE_MARCHAND*MONTANT#`. Là encore :
  un code, un montant, un PIN. Aucun champ « référence » dans le parcours
  USSD public ([source](https://infospratiques.cm/mtn-mobile-money-cameroun/)).
- Il n'existe aucune offre publique « sous-numéro », « portefeuille
  virtuel » ou « SIM virtuelle » chez MTN Cameroun. La seule chose
  « virtuelle » lancée récemment est une carte Mastercard prépayée adossée au
  compte MoMo, pour payer en ligne — l'inverse de ce qu'on cherche
  ([source](https://www.investiraucameroun.com/finance/2412-22924-au-cameroun-mtn-mobile-money-lance-une-carte-prepayee-virtuelle-momo-adossee-a-mastercard)).

Donc : **sur le rail « quelqu'un envoie à mon numéro », l'information « pour
qui » n'est transportée par personne.** Aucun logiciel ne peut la lire dans un
SMS où elle n'est pas.

Une précision honnête : « SIM Master » n'est pas un nom de produit qu'on
trouve publié par MTN Cameroun. Sans frais et sans plafond, cela ressemble
à une **puce commerciale d'agent ou de super-agent** (la puce qui porte le
« float » et fait dépôts et retraits pour les clients), ou à un statut de
partenaire d'entreprise. La première chose à faire est de demander à MTN
**quel statut exact** porte cette carte, parce que les portes qui s'ouvrent
ensuite (§ 4) en dépendent.

---

## 2. Ce qu'on sait déjà sans rien changer : QUI a payé

Le SMS de MTN porte le nom et le numéro de l'expéditeur, et TOTEM les lit
déjà (`analyse_sms.py`, tests `recu … de NGONO Marie (677123456)`). Ce qui
manque n'est pas « qui a payé », c'est **« pour qui »**.

Il y a un cas où « qui » suffit : quand un payeur donné ne paie toujours
qu'une seule personne. L'élève d'une école, le locataire d'un bailleur, le
membre d'une tontine. Un **annuaire des payeurs** (« le 677 12 34 56, c'est
un client de Marie ») règle ces flux-là. Il ne règle pas le marché où un même
client achète chez deux utilisateurs de TOTEM, ni l'inconnu qui paie pour la
première fois.

---

## 3. Les quatre façons d'attribuer un encaissement

### Voie A — inverser le sens : c'est TOTEM qui demande le paiement (« request to pay »)

Au lieu que le client *envoie* de l'argent à un numéro et qu'on devine, la
plateforme *demande* le paiement : elle dit à l'opérateur « prélève 15 000 F
sur le 677 12 34 56, référence TOTEM-MARIE-0042 ». Le client reçoit sur son
téléphone une invite « Confirmez le paiement de 15 000 F à ENTREPRISE ? » et
tape son PIN. L'opérateur rappelle la plateforme avec le résultat.

**L'attribution est parfaite par construction** : c'est TOTEM qui a créé
l'opération, avec l'identifiant de l'utilisateur dedans. Plus rien à deviner,
plus de SMS à interpréter pour ce flux-là. C'est ainsi que travaillent toutes
les fintechs de la zone, sans exception.

Deux chemins pour y arriver :

| | MTN MoMo Open API, en direct | Par un agrégateur |
|---|---|---|
| Où | `momodeveloper.mtn.com` → « Go Live » avec le dossier d'entreprise du Cameroun (registre, NIU, adresse) ; au Cameroun, Y-Note / Paynote accompagnent l'intégration MTN et Orange | pawaPay, CamPay, CinetPay, Notch Pay, Monetbil… |
| Délai | 3 à 6 mois, un contrat par opérateur | 5 à 10 jours ouvrés après dépôt des documents (pawaPay) ; « instantané » revendiqué par CamPay |
| Coût | 1 à 2 % négociés (la fiche Ghana annonce 2 %, « négociable ») | pawaPay Cameroun : 1,75 % à l'encaissement, 1,3 % au décaissement ; CamPay : 2 % / 1 % ; marché : 2 à 3 % |
| Orange en plus | second contrat, seconde intégration | inclus |
| Où va l'argent | un compte de collecte partenaire, distinct de la SIM | un solde chez l'agrégateur, reversé à J+1 |

Sources : [aperçu API et Go Live](https://medium.com/@raymondzian/unleashing-the-power-of-the-mtn-momo-open-api-c6b6c5c4b0c5),
[retour d'expérience Go Live 2025](https://cleverengineer.substack.com/p/going-live-with-mtn-momo-api-in-2025),
[Y-Note, collecte MTN MoMo Cameroun](https://www.y-note.cm/formulaire-dinscription-mtn-momo-cameroun-webpaiement-cameroun-collection/),
[frais pawaPay](https://www.pawapay.io/fees), [CamPay](https://www.campay.net/),
[comparatif 2026](https://www.mmgate.org/int/blog/api-paiement-en-ligne-cameroun-2026),
[intégration directe : 3 à 6 mois, 1 à 2 %](https://elyonpay.com/blog/payment-gateway-cameroun-guide-entreprises.html).

**Ce que ça change pour la SIM Master :** rien ne passe plus par elle pour
ces encaissements. Son avantage « zéro frais » vaut sur le rail USSD de la
puce, pas sur le rail API, qui a sa propre grille. Il faut l'accepter :
l'attribution parfaite se paie 1 à 2 %.

### Voie A' — un compte par utilisateur chez l'agrégateur (le vrai « sous-compte »)

Notch Pay propose « Sync » : la plateforme crée un **compte connecté** par
vendeur, encaisse en son nom, prélève sa commission, et chaque vendeur a son
tableau de bord et ses reversements automatiques vers SON Mobile Money
([source](https://developer.notchpay.co/sync/index.md)). C'est exactement le
modèle « plusieurs comptes TOTEM sur une infrastructure TOTEM » — et l'argent
de Marie n'est **jamais** sur le compte de l'entreprise, ce qui compte au § 5.

### Voie B — garder la SIM, et attribuer par attente déclarée

Sans API, sans contrat, dès maintenant. L'utilisateur TOTEM déclare **avant**
que son client paie : « j'attends 15 000 F du 677 12 34 56 » (ou simplement
« j'attends 15 000 F dans l'heure »). Quand le SMS arrive sur la SIM, la
plateforme cherche une attente qui colle — même expéditeur, même montant,
fenêtre de temps — et l'attribue. Ce qui ne colle à rien tombe dans une file
**« à attribuer »**, à la main, comme les SMS « illisibles » aujourd'hui.

C'est le pendant, côté entrées, des **intentions** que TOTEM tient déjà côté
sorties (la clé d'intention d'un transfert). Même table d'esprit, même
discipline : une attente a une fenêtre, un montant, un état, et ne peut être
consommée qu'une fois.

Limites franches : deux utilisateurs qui attendent le même montant au même
moment d'un même inconnu, c'est indécidable — et à mesure que le nombre
d'utilisateurs grandit, ces collisions grandissent. La voie B est un **pont**,
pas une destination.

### Voie C — l'empreinte de montant (le bricolage, dit pour être complet)

Chaque encaissement attendu reçoit un montant unique : 15 000 F devient
15 023 F, et 023 identifie l'attente. Techniquement ça marche ; on l'a vu
faire là où aucun champ de référence n'existe. Mais le client ne comprend
pas pourquoi il paie 15 023, les collisions arrivent vite quand les
utilisateurs se multiplient, et devant un comptable ou un régulateur cela
ressemble à ce que c'est : un contournement. À réserver à un essai, jamais à
une offre.

### Voie D — une identité MTN par utilisateur : sous-agents, codes marchands, SIM

La façon dont MTN lui-même donne une identité distincte à chaque acteur d'un
réseau, c'est **une puce par acteur**, sous l'ombrelle d'un partenaire :

- **Super-agent → agents.** La demande d'agent MoMo se dépose « auprès du
  super-agent » avec une lettre d'engagement et un dossier ; le super-agent
  porte le float et touche une part de la commission
  ([source](https://temovision.com/mtn-mobile-money-agent-cameroon/),
  [source](https://www.ictd.ac/blog/cameroon-mobile-money-agents-struggling-to-increase-revenue/)).
  Si la SIM Master est une SIM de super-agent, MTN sait créer des comptes
  d'agents rattachés à elle : chacun a son numéro, son nom, son SMS.
- **Codes marchands.** Un marchand accepteur reçoit un code à six chiffres ;
  le payeur ne paie **aucun frais** vers un code marchand et voit le nom du
  marchand ([source](https://home.mtn.cm/presentation-de-la-campagne/)). Un
  code par utilisateur TOTEM, sous un partenariat d'entreprise, donnerait une
  attribution parfaite et gratuite pour le payeur. Reste à savoir si MTN
  l'accorde à un partenaire pour le compte de tiers : c'est une question à
  poser, pas une chose écrite.
- **Une SIM par utilisateur, hébergée par TOTEM.** C'est déjà l'architecture :
  « un modem = une SIM = un compte ». Elle se met à l'échelle avec un **banc
  de SIM** (32, 64, 128 emplacements) et des passerelles GSM multi-ports,
  plutôt qu'avec un HAT par Pi. Deux réserves : le coût par utilisateur, et
  surtout l'accord de MTN — un banc de SIM ressemble, vu du réseau, à une
  « SIM box », l'outil des fraudeurs, et MTN Cameroun est en campagne contre
  la fraude MoMo ([source](https://fr.allafrica.com/stories/202509300387.html)).
  Sans lettre de MTN, on risque la coupure des puces.

---

## 4. Ce qu'il faut demander à MTN, précisément

La recherche publique s'arrête là où commence le contrat. Avec l'interlocuteur
qui a délivré la SIM Master, poser ces cinq questions, par écrit :

1. **Quel est le statut exact de cette SIM ?** Agent, super-agent, marchand,
   partenaire d'entreprise ? Chaque statut ouvre des portes différentes.
2. **Peut-on créer des comptes rattachés** (agents ou marchands) sous ce
   statut, pour des tiers qui utilisent notre plateforme ? À quel prix, avec
   quel dossier par tiers ?
3. **L'accès API Collections / Disbursements** est-il possible au nom de
   l'entreprise, à quelle grille de frais, et par qui passe le dossier au
   Cameroun (MTN directement ou un intégrateur agréé) ?
4. **Le rail « paiement de facture »** (MoMo Bills, celui d'Eneo et de
   Camwater) accepte-t-il de nouveaux facturiers ? Il est le seul parcours
   USSD grand public où le payeur saisit une référence — l'équivalent
   camerounais du Paybill.
5. **Est-il permis d'héberger plusieurs puces MTN sur un banc de SIM** pour
   un usage Mobile Money déclaré ? Une réponse écrite vaut une assurance.

---

## 5. La question de droit, qu'on ne contourne pas

Le jour où l'argent de Marie transite par le compte de l'entreprise avant
d'aller chez Marie, l'entreprise **encaisse pour le compte de tiers**. Dans la
CEMAC, c'est un service de paiement au sens du règlement n° 04/18/CEMAC/UMAC/
COBAC du 21 décembre 2018, réservé aux établissements de crédit, aux
établissements de microfinance et aux **établissements de paiement agréés**
— société anonyme, agrément du ministre des Finances sur avis conforme de la
COBAC, capital minimum de plusieurs centaines de millions de FCFA
([source](https://www.labase-lextenso.fr/l-essentiel-droits-africains-des-affaires/2019-n5/les-conditions-d-exercice-des-services-de-paiement-dans-la-cemac-DAA112d1),
[source](https://kalieu-elongo.com/le-statut-des-etablissements-de-paiement-en-zone-cemac/)).
Ce n'est pas à la portée d'une plateforme naissante, et ce n'est pas un
détail : c'est la différence entre un outil et une banque.

Deux nouvelles rendent la chose praticable :

- **Une réforme est en projet**, pour application au 1er janvier 2027, qui
  crée des catégories plus légères : l'**agrégateur** (« une solution
  technique unifiée permettant d'accepter, de traiter et de suivre des
  opérations de paiement ») et l'**initiateur de paiement**, sous un régime
  d'**autorisation** en un mois plutôt que d'agrément — à condition de **ne
  pas détenir les fonds des clients** — plus un **bac à sable** de douze mois
  ([source](https://www.droitmediasfinance.com/index.php/actualites/droit-tech-fintech/1298-cemac-une-reforme-en-cours-de-la-reglementation-des-services-de-paiements-agregateurs-initiateurs-de-paiement-transfert-dargent-bac-a-sable-reglementaire)).
  C'est un projet, pas un texte en vigueur ; il dit la direction.
- **Ne pas détenir les fonds** est un choix d'architecture, pas de droit.
  Tant que l'argent de Marie arrive sur un compte qui est **à Marie** (sa
  propre SIM hébergée dans TOTEM, son compte connecté chez l'agrégateur, son
  code marchand), TOTEM reste ce qu'il est aujourd'hui : un outil technique
  qui pilote et lit le compte de son propriétaire. C'est la position la plus
  sûre, et c'est aussi la plus simple à expliquer.

Le modèle « tout le monde encaisse sur ma SIM Master et je redistribue » est
précisément celui qui exige un agrément. Il faut le savoir avant de le
vendre.

---

## 6. Ce qu'on recommande

**Ne pas construire de « numéros virtuels ».** Ils n'existent pas, et les
imiter sur une seule SIM mène soit au bricolage (voie C), soit à l'agrément
d'établissement de paiement (§ 5).

**Faire, dans l'ordre :**

| Quand | Quoi | Ce que ça donne |
|---|---|---|
| Maintenant, sans personne | Les **attentes d'encaissement** (voie B) et l'**annuaire des payeurs** (§ 2) dans la plateforme, avec la file « à attribuer » | L'attribution pour les flux connus, sur la SIM qu'on a |
| Semaines | Un compte chez un agrégateur ; un bouton **« Demander un paiement »** dans l'application : numéro du client, montant, le client tape son PIN, le rappel attribue | L'attribution parfaite, MTN et Orange, sans contrat opérateur |
| En parallèle | Les cinq questions à MTN (§ 4), par écrit ; un avis d'avocat CEMAC sur la structure choisie | Savoir ce que la SIM Master permet vraiment |
| Mois | Selon les réponses : API MTN en direct, codes marchands ou comptes d'agents par utilisateur, comptes connectés chez l'agrégateur | Le coût qui baisse, l'argent de chacun chez chacun |

Le fil conducteur : **l'argent de chaque utilisateur arrive chez lui, et
TOTEM reste le totem — celui qui voit, qui pilote, qui tient le journal.**
C'est la promesse de la première ligne du README, et elle vaut aussi pour la
suite.

---

## Sources consultées

- [MTN MoMo Open API — présentation, pays couverts, Go Live](https://medium.com/@raymondzian/unleashing-the-power-of-the-mtn-momo-open-api-c6b6c5c4b0c5)
- [Request to Pay — référence technique](https://medium.com/@bmskmike/mtn-mobile-money-momo-request-to-pay-api-complete-technical-reference-for-nigerian-developers-4c148732dceb)
- [Go Live MTN MoMo API en 2025 — retour d'expérience](https://cleverengineer.substack.com/p/going-live-with-mtn-momo-api-in-2025)
- [Frais du produit Collections (fiche Ghana, « négociable »)](https://momodeveloper.mtn.com/Ghana_Collection_productDetails)
- [Y-Note — collecte MTN MoMo Cameroun](https://www.y-note.cm/formulaire-dinscription-mtn-momo-cameroun-webpaiement-cameroun-collection/)
- [Orange Money Cameroun — partenaire Web Payment](https://www.orange.cm/fr/om-partenaires/partenaire-webpayment.html)
- [MTN Mobile Money Cameroun 2026 — tarifs, codes, paiement marchand](https://infospratiques.cm/mtn-mobile-money-cameroun/)
- [MTN Cameroun — paiement marchand sans frais](https://home.mtn.cm/presentation-de-la-campagne/)
- [Devenir agent MTN MoMo au Cameroun — le rôle du super-agent](https://temovision.com/mtn-mobile-money-agent-cameroon/)
- [ICTD — la répartition des commissions agents / super-agents au Cameroun](https://www.ictd.ac/blog/cameroon-mobile-money-agents-struggling-to-increase-revenue/)
- [MTN Cameroun — lutte contre la fraude MoMo](https://fr.allafrica.com/stories/202509300387.html)
- [Carte virtuelle MoMo Mastercard](https://www.investiraucameroun.com/finance/2412-22924-au-cameroun-mtn-mobile-money-lance-une-carte-prepayee-virtuelle-momo-adossee-a-mastercard)
- [pawaPay — frais](https://www.pawapay.io/fees) · [pawaPay — parcours d'encaissement (invite PIN)](https://docs.pawapay.io/v2/docs/deposits)
- [CamPay — services et frais](https://www.campay.net/)
- [Notch Pay Sync — comptes connectés](https://developer.notchpay.co/sync/index.md)
- [Comparatif des API de paiement au Cameroun 2026](https://www.mmgate.org/int/blog/api-paiement-en-ligne-cameroun-2026)
- [Passerelles de paiement au Cameroun — délais et coûts d'une intégration directe](https://elyonpay.com/blog/payment-gateway-cameroun-guide-entreprises.html)
- [Règlement 04/18/CEMAC — conditions d'exercice des services de paiement](https://www.labase-lextenso.fr/l-essentiel-droits-africains-des-affaires/2019-n5/les-conditions-d-exercice-des-services-de-paiement-dans-la-cemac-DAA112d1)
- [Le statut des établissements de paiement en zone CEMAC](https://kalieu-elongo.com/le-statut-des-etablissements-de-paiement-en-zone-cemac/)
- [CEMAC — réforme en cours : agrégateurs, initiateurs, bac à sable](https://www.droitmediasfinance.com/index.php/actualites/droit-tech-fintech/1298-cemac-une-reforme-en-cours-de-la-reglementation-des-services-de-paiements-agregateurs-initiateurs-de-paiement-transfert-dargent-bac-a-sable-reglementaire)
- [Marché du paiement mobile en CEMAC 2026 — régimes et parts de marché](https://simiz.io/blog/marche-paiement-mobile-cemac-2026)
