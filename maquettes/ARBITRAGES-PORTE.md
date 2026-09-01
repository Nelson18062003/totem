# Quatre décisions à prendre avant de coder la porte

La porte super-admin est dessinée et mesurée. Quatre choses ne se décident pas
au dessin : elles engagent la sécurité du compte qui commande sept terminaux.
Chacune est écrite ici avec ce qu'elle coûte et ce qu'elle protège.

---

## 1. Le courriel peut-il ouvrir la porte à lui seul ?

**L'état actuel du dessin.** L'écran d'entrée propose « on vous envoie un code »
et « ouvrez votre application » comme deux chemins équivalents. Le bouton plein,
celui que l'œil trouve en premier, envoie un code par courriel.

**Ce que dit la norme.** Le NIST a publié en août 2025 la révision 4 de
SP 800-63B. Son §3.1.3.1 est sans nuance :

> *Email SHALL NOT be used for out-of-band authentication.*

La raison n'est pas théorique : une boîte aux lettres ne prouve la possession
d'aucun appareil. Elle s'ouvre depuis n'importe quel écran du monde avec un mot
de passe qui, lui, peut avoir fuité ailleurs. Un code envoyé dans cette boîte
hérite de sa faiblesse. Et pour atteindre le niveau AAL2 — celui qu'on attend
d'une console qui pilote de l'argent — il faut **deux** facteurs de nature
différente ; ici, la boîte est le facteur unique.

**Trois chemins.**

| | Ce qu'on demande | Ce que ça coûte | Où ça place la porte |
|---|---|---|---|
| **A** | Le courriel seul, comme aujourd'hui | rien, c'est déjà dessiné | sous AAL2 — un facteur |
| **B** | L'application obligatoire ; le courriel devient un secours, avec un délai et une lettre d'avertissement | un jour de plus, et il faut installer l'application avant la première vraie connexion | AAL2 |
| **C** | Adresse **puis** application (ou code de secours) à chaque fois | même travail que B, plus long à l'usage quotidien | AAL2, sans exception |

**Ce que je recommande : B.** L'application est déjà entièrement dessinée
(planche A5, quatre étapes, dix codes sur papier). La rendre obligatoire ne
demande aucun dessin neuf — seulement d'inverser ce que l'écran d'entrée met en
avant. Le courriel reste, mais comme secours, avec ce qu'un secours doit avoir :
une attente, et une lettre qui prévient.

**Si vous choisissez A**, il faut l'écrire quelque part et l'assumer : ce n'est
pas un oubli, c'est un arbitrage. Je le noterai dans `docs/`.

---

## 2. Combien de temps une session reste-t-elle ouverte ?

**L'état actuel.** « Se souvenir de cet appareil pendant 30 jours ». La planche
A6 montre deux appareils retenus jusqu'en septembre.

**Ce que dit la norme.** AAL2 demande une nouvelle preuve **au moins toutes les
12 heures**, et après **30 minutes** sans rien faire.

**Le vrai coût.** Vous pilotez depuis la France, souvent le soir. 30 minutes
d'inactivité, c'est un café qui vous fait retaper un code. 12 heures, c'est une
fois par jour.

**Trois chemins.** 30 jours (confortable, sous AAL2) · 12 h + 30 min (conforme,
plus exigeant) · un intermédiaire : 12 h partout, mais l'inactivité ne ferme que
si l'écran montre de l'argent.

**Ce que je recommande : le troisième.** Il tient la norme là où elle protège
quelque chose, et il ne vous fait pas retaper un code pour avoir regardé une
liste de terminaux.

---

## 3. La porte doit-elle dire pourquoi elle refuse ?

**La contradiction, telle qu'elle est dessinée aujourd'hui.** La planche A4 se
contredit elle-même : en bas, elle promet que « le refus est une seule phrase,
toujours la même, et il ne resserre jamais la devinette » ; en haut, elle montre
« ce code ne correspond pas » d'un côté, « ce code a expiré » de l'autre, et un
compteur « 1 essai sur 3 utilisé ».

Les deux se défendent. Distinguer *faux* de *périmé* évite à quelqu'un de
recommencer dix fois avec une vieille lettre. Ne rien distinguer ne donne rien à
celui qui essaie au hasard.

**Ce que je recommande : garder la distinction et réécrire la promesse.** Ce que
la porte ne doit jamais dire, c'est si l'**adresse** existe — c'est ce qui
transforme une porte en annuaire du personnel. Savoir qu'un code a expiré
n'apprend rien à un inconnu, puisqu'il n'a pas de code. Je réécrirai la ligne du
bas pour qu'elle dise exactement cela.

---

## 4. L'application doit-elle aussi être comptée ?

**L'état actuel.** Trois codes faux mettent l'adresse en pause un quart d'heure —
mais la planche A4 dit que « l'application continue de marcher pendant la
pause ».

**Le trou.** Les six chiffres de l'application sont devinables si personne ne
compte les essais. La pause protège le courriel et laisse l'autre porte ouverte.

**Ce que je recommande, sans arbitrage nécessaire : son propre compteur.** Cinq
refus de suite et l'application se met en pause à son tour. C'est une ligne de
texte à ajouter sur A4, et une règle côté serveur. Je le fais si vous ne dites
rien.

---

## Ce qui est déjà corrigé, sans attendre de décision

- Le champ du code ne tronque plus un collage (`maxlength` retiré) — WCAG 2.2 §3.3.8.
- Le bord des champs et des boutons passe de 1,26:1 à 3,38:1 — un champ vide se
  voit maintenant sans cliquer dedans. Cela touche les quinze écrans.
- Les cases à cocher sont de vraies cases, 24×24, atteignables au clavier.
- Les refus s'annoncent à la voix (`role="alert"`) et se rattachent à leur champ.
- La fenêtre de fin de session est une vraie boîte de dialogue, et le travail
  qu'elle recouvre sort de l'ordre de tabulation.
- La bascule de langue n'est plus un faux jeu d'onglets : deux liens, celui du
  jour marqué.
- La porte ne dit plus « l'appareil dont vous vous êtes servi hier » : elle le
  disait à qui tapait une adresse, et le contredisait deux planches plus loin.
- Le code ne voyage plus dans l'objet du courriel — l'objet dit qui a demandé.
- Dix moins un font neuf (la planche A5 annonçait sept).
- Les deux horloges de la lettre affichent enfin deux heures différentes :
  en août, Paris est à UTC+2 et Douala à UTC+1.
