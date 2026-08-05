# Les deux langues de TOTEM

TOTEM parle **anglais et français**. L'anglais est la langue principale — la
majorité des utilisateurs est anglophone — et le français reste à un geste.

L'anglais de TOTEM n'est pas une traduction plaquée : chaque phrase est écrite
pour elle-même, dans la même voix que le reste de la plateforme — on nomme
l'objet, pas la technique.

## Où se règle la langue

| Surface | Réglage | Défaut |
|---|---|---|
| **Plateforme web** (mobile et PC) | Réglages → Langue, ou les boutons « English · Français » de l'écran de connexion. Le choix vit dans un cookie du navigateur : chacun voit la plateforme dans sa langue. | anglais |
| **Robot** (Telegram, reçus PDF, rapports, alertes) | `totem.conf` → `[totem]` → `langue = en` ou `langue = fr` | anglais |
| **Réponses au guichet web** (résultats d'une demande déposée) | La demande porte la langue de l'écran qui l'a faite : le terminal répond dans cette langue-là. | la langue de l'écran |

Deux surfaces, deux réglages indépendants : le propriétaire peut piloter le
robot en français sur Telegram pendant qu'un associé anglophone lit la
plateforme en anglais.

## Ce que la langue ne touche jamais

**Le texte venu du réseau s'affiche mot pour mot.** Les menus USSD, les
réponses de session et les SMS de l'opérateur sont des documents : les
traduire serait les trahir — et en cas de litige, seul le texte d'origine
fait foi.

### Pourquoi la SIM ne suit pas la langue de la plateforme

La question se pose naturellement : la plateforme est en anglais, mais la
session USSD affiche « Entrez le montant (FCFA) : ». Pourquoi ?

**Ce que disent les normes** (vérifié dans les textes eux-mêmes, pas de
mémoire — références en bas de page) :

- La spécification de l'USSD, 3GPP TS 23.090, pose dès son premier
  paragraphe que l'USSD fait dialoguer l'utilisateur avec « *a PLMN operator
  defined application* » — une application définie par l'opérateur, dans son
  réseau — « *in a way which is transparent to the MS and to intermediate
  network entities* » : le texte est écrit chez l'opérateur et transporté
  **tel quel** jusqu'au téléphone (ici, jusqu'au modem du terminal). La norme
  ne définit ni le contenu des messages, ni un quelconque choix de langue par
  l'abonné.
- Le codage qui accompagne chaque message (3GPP TS 23.038, « CBS Data Coding
  Scheme », réutilisé par l'USSD) permet à l'opérateur d'**étiqueter** la
  langue du texte qu'il envoie — 0001 = English, 0011 = French… — mais c'est
  une étiquette descriptive, pas une demande : rien, dans le protocole, ne
  permet au téléphone d'exiger une langue.
- Sur le terrain, Orange Cameroun n'étiquette même pas : le relevé du dépôt
  (docs/USSD-OU-STK.md) montre `+CUSD: 1,"Entrez le montant (FCFA) :",15` —
  et la valeur 15 signifie, dans la table de la norme, « *Language
  unspecified* ».

Conclusion ferme : quand le robot compose `#148#`, c'est le serveur d'Orange
qui écrit la réponse, dans la langue **réglée chez l'opérateur pour cette
ligne** — TOTEM la transporte sans aucune prise dessus. Il en va de même des
SMS de confirmation : au Cameroun, MTN et Orange écrivent d'ailleurs souvent
un mélange des deux langues, et le lecteur de SMS du robot
(`analyse_sms.py`) comprend déjà les deux.

Ce que fait TOTEM :

- **l'habillage est traduit** — « USSD session », « PIN code », les boutons
  Valider/Annuler, les titres d'écran suivent la langue choisie ;
- **le contenu opérateur reste intact**, présenté comme une citation, dans la
  langue où la SIM l'a reçu ;
- **la compréhension est bilingue** — les détecteurs (demande de code, de
  montant, de destinataire ; lecture des SMS de paiement) reconnaissent le
  vocabulaire français **et** anglais, parce que le terrain mélange les deux.

### Changer la langue de la SIM elle-même

Si l'on veut que les menus USSD arrivent en anglais, cela se règle **chez
l'opérateur**, une fois pour toutes, pas dans TOTEM. La langue est un
réglage du compte de la ligne, côté réseau :

- quand le menu de l'opérateur offre une option de langue, elle se trouve en
  général sous « Mon compte » / « My account » — navigable depuis la console
  USSD de la plateforme, comme n'importe quel parcours ;
- sinon, le service client de l'opérateur fait le changement sur demande.

Des codes « pour passer sa SIM en anglais » circulent en ligne, mais aucun ne
vient d'une page officielle de MTN ou d'Orange Cameroun : fidèle à la règle
du dépôt — on ne devine pas, on relève sur le terrain — ce document n'en
grave aucun. Le jour venu, on ouvre le menu réel depuis la console et on lit
ce qu'il propose.

Une fois la ligne passée en anglais, tout ce qu'elle envoie arrive en
anglais — et TOTEM continue de tout comprendre, puisqu'il lit les deux
langues. À noter enfin : la voie des **API Mobile Money officielles**
(momodeveloper.mtn.com, Orange Developer — voir docs/USSD-OU-STK.md, voie B)
fait disparaître la question, puisqu'il n'y a plus de texte d'écran du tout :
les réponses sont des données structurées, et c'est TOTEM qui les met en
forme, dans la langue choisie.

#### Références

- [3GPP TS 23.090 — USSD, Stage 2](https://www.arib.or.jp/english/html/overview/doc/STD-T63v11_00/5_Appendix/Rel12/23/23090-c00.pdf)
  (§ 1 Scope : application définie par l'opérateur, transport transparent).
- [3GPP TS 23.038 — Alphabets and language-specific information](https://www.arib.or.jp/english/html/overview/doc/STD-T63v11_00/5_Appendix/Rel12/23/23038-c00.pdf)
  (§ 5 CBS Data Coding Scheme : la table des langues — 0001 English,
  0011 French, 1111 Language unspecified — et son usage par l'USSD).
- Le relevé de terrain du dépôt : docs/USSD-OU-STK.md (`+CUSD` reçu
  d'Orange avec le codage 15).

## Comment c'est construit

- **Web** : le cookie `totem_langue` est lu côté serveur ; chaque page est
  rendue dans la bonne langue dès la première peinture (pas de bascule à
  l'écran). Les textes vivent dans `web/lib/textes/`, un dictionnaire par
  écran, les deux langues côte à côte. Les dates et les montants suivent la
  langue (« 5 August » / « 5 août », « 25,000 FCFA » / « 25 000 FCFA ») ; le
  fuseau, lui, reste celui de Douala — l'argent vit là-bas.
- **Robot** : `totem/textes.py` expose `t("English", "Français")` ; les deux
  versions vivent côte à côte, au même endroit que le message. La langue vient
  de `totem.conf` au démarrage. Une demande venue de la plateforme impose sa
  langue par `t(..., langue=...)`.
- **Reçus PDF** : les libellés suivent la langue du robot (ou de la demande) ;
  les nombres s'écrivent « 25,000 » en anglais, « 25 000 » en français ; la
  maquette de référence (`recus/maquette.mjs`) existe dans les deux langues et
  le contrat « rien ne dépasse » est vérifié pour chacune.
- **Ce qui est stocké ne change jamais avec la langue** : catégories,
  sens (`entree`/`sortie`), clés de raccourcis, callback des boutons — la
  langue n'habille que l'affichage, jamais les données.

## Le dépôt, lui, parle français

Le code, les commentaires, les commits et cette documentation restent en
français (voir CLAUDE.md) : c'est la langue de travail du projet. Les deux
langues de ce document-ci sont celles de **l'interface**, pas du code.
