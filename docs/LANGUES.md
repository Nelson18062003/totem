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

Le canal USSD est du **texte brut envoyé par l'opérateur** (docs/USSD-OU-STK.md).
Quand le robot compose `#148#`, c'est le serveur d'Orange qui écrit la
réponse, dans la langue **réglée chez l'opérateur pour cette SIM** — TOTEM ne
fait que la transporter, il n'a aucune prise dessus. Il en va de même des SMS
de confirmation : au Cameroun, MTN et Orange écrivent d'ailleurs souvent un
mélange des deux langues, et le lecteur de SMS du robot (`analyse_sms.py`)
comprend déjà les deux.

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
l'opérateur**, une fois pour toutes, pas dans TOTEM :

- la plupart des menus Mobile Money offrent une option de langue (souvent dans
  « Mon compte » / « My account ») — accessible depuis la console USSD de la
  plateforme, comme n'importe quel parcours ;
- le service client de l'opérateur peut aussi faire le changement.

Une fois la SIM passée en anglais, tout ce qu'elle envoie arrive en anglais —
et TOTEM continue de tout comprendre, puisqu'il lit les deux langues.

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
