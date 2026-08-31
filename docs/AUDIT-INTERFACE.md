# Audit de l'interface — relevé du 31 août 2026

Ce document n'est pas une impression : chaque ligne vient d'une **mesure**,
prise sur la plateforme en marche (faux nuage + `next start`), avec le compte
ouvert. La méthode et l'instrument sont décrits au § 6.

Ce qu'il faut dire d'abord, parce que ça change tout le reste : **l'interface
n'est pas en désordre.** Les jetons existent
([`web/app/globals.css`](../web/app/globals.css)), la charte existe
([`docs/IDENTITE.md`](IDENTITE.md)), le téléphone les reprend un par un
([`mobile/src/theme/jetons.ts`](../mobile/src/theme/jetons.ts)). Sur cinq
formats et huit écrans, **aucun débordement horizontal, aucun contenu coupé.**
C'est rare et c'est acquis.

Les défauts ci-dessous sont donc d'une autre nature : ce ne sont pas des
écrans mal dessinés, ce sont **trois manques de fondation** qui laissent
l'interface dériver là où personne ne regarde.

---

## 1. La couleur du texte tertiaire ne passe pas AA — 102 endroits

**Gravité : P0** (lisibilité) · **Cause : la mesure a été faite sur le mauvais fond.**

`--color-ink-faint: #767676` porte en commentaire « 4,5:1, passe AA »
([`globals.css:24`](../web/app/globals.css)). C'est vrai **sur blanc** :
4,54:1. Mais le fond de page n'est pas blanc, c'est
`--color-surface: #f5f5f5` ([`globals.css:100`](../web/app/globals.css)).

| Texte tertiaire sur… | Rapport mesuré | Verdict |
|---|---|---|
| blanc `#ffffff` (dans une carte) | **4,54:1** | passe AA |
| **fond de page `#f5f5f5`** | **4,17:1** | **échoue AA** |
| **champ / puce `#e6e6e6`** | **3,64:1** | **échoue AA** |

`text-ink-faint` est employé **102 fois** dans 19 fichiers. La majorité de ces
textes est posée sur le fond de page, pas sur une carte.

Le cas le plus dur, parce que c'est de l'**argent** :
[`app/analyse/page.tsx:140`](../web/app/analyse/page.tsx) affiche les montants
du graphique en `text-[0.625rem]` — **10 px mesurés** sur téléphone — en
`text-ink-faint`. Petit texte, 4,17:1 : l'échec est franc.

**Correctif proposé :** assombrir le jeton jusqu'à ce qu'il passe sur le fond
de page, pas sur le blanc. Mesuré :

| Candidat | sur `#f5f5f5` | sur `#e6e6e6` | Verdict |
|---|---|---|---|
| `#767676` (actuel) | 4,17:1 | 3,64:1 | échoue |
| `#6b6b6b` | 4,89:1 | 4,27:1 | échoue encore sur les puces |
| **`#666666`** | **5,27:1** | **4,60:1** | **passe partout** |

Un seul jeton à changer, les 102 endroits suivent.

---

## 2. Le web n'a pas de couche de composants — le téléphone, si

**Gravité : P1** · **Cause : rien n'empêche de retaper un bouton à la main.**

Le téléphone a ses primitives : [`mobile/src/ui.tsx`](../mobile/src/ui.tsx)
expose `Texte`, `Carte`, `Filet`, `Pastille`. Le web n'a **rien** — pas de
`web/app/ui.tsx`. Chaque bouton, chaque champ y est réassemblé à la main.

Les jetons sont pourtant respectés (`rounded-btn`, `text-small`,
`border-line`) : l'interface ne *paraît* donc pas cassée. Elle dérive
en silence, et la dérive se compte :

| Ce qui devrait avoir UNE valeur | Valeurs trouvées |
|---|---|
| L'état **désactivé** | `opacity-40` (×15), `opacity-30` (×6), `opacity-50` (×3), `opacity-35` (×3) — **4 valeurs** |
| Le **survol** du bouton premier | `opacity-90` (×18), `opacity-70` (×4), `opacity-100` (×1) — **3 valeurs** |
| La **hauteur** d'un bouton | `py-2.5` (×31), `py-2` (×15), `py-1.5` (×13), `py-3` (×6), `py-1` (×4), `py-0.5` (×2) — **6 valeurs** |

Vingt-cinq chaînes de classes distinctes pour ce qui n'est, sémantiquement,
que quatre composants : bouton premier, bouton second, champ, puce.

Aucune de ces valeurs n'est *fausse* isolément. C'est bien le problème : sans
composant, personne ne peut voir qu'elles se contredisent.

**Correctif proposé :** un `web/app/ui.tsx` en pendant de celui du téléphone —
`Bouton` (premier/second/discret), `Champ`, `Puce`, `Carte`. Les états y sont
décidés **une fois**. Voir la maquette au § 5.

---

## 3. Les cibles tactiles sont sous 44 px — jusqu'à 41 par écran

**Gravité : P1** · **Cause : l'échelle d'espacement n'a pas de règle de hauteur.**

Mesuré au navigateur, sur les formats tactiles :

| Écran | Téléphone (390) | Tablette (834) |
|---|---|---|
| Réglages | **32** cibles < 44 px | **41** |
| Encaissements | 12 | 17 |
| SMS | 12 | 17 |
| Accueil | 12 | 20 |
| Code USSD | 8 | 17 |

Les plus petites relevées :

- **24 × 40 px** — les interrupteurs des notifications (« Chaque paiement
  reçu », « Rapport quotidien ») ([`reglages/interactifs.tsx`](../web/app/reglages/interactifs.tsx))
- **18 × 18 px** — le lien Réglages de l'accueil
- **21 × 114 px** — « Voir les soldes »
- **30–31 px** — les puces de filtre des encaissements, les champs de nom et
  de numéro des réglages

**La tablette est le cas le plus net, et le moins visible :** à 834 px on est
au-delà du seuil `md`, donc c'est le **rail de bureau** qui s'affiche — mais on
y touche avec un doigt. Ses huit entrées font **40 px de haut**. Le rail n'a
jamais été pensé pour être touché.

**Correctif proposé :** une échelle de hauteurs de contrôle dans les jetons
(`--h-control-sm/md/lg`), avec un plancher de 44 px dès que le pointeur est
grossier (`@media (pointer: coarse)`). Portée par les composants du § 2, donc
appliquée partout d'un coup.

---

## 4. Deux points mineurs, mesurés

- **Couleurs hors jeton** — [`app/fiche-sms.tsx:52-58`](../web/app/fiche-sms.tsx)
  pose quatre hexadécimaux bruts (`#cff7d3`, `#02542d`, `#fff1c2`, `#522504`)
  pour les puces de nature. Leur contraste est bon (7,75:1 et 11,45:1), mais
  ils ne sont **dans aucun jeton** — ni dans `globals.css`, ni dans
  `jetons.ts`. Le téléphone ne peut donc pas les reprendre. **P2.**
- **Le point d'état vert** — `--color-positive-vif: #14ae5c` mesure **2,90:1**
  sur blanc. C'est un élément d'interface non textuel qui porte une
  information (« terminal actif ») : WCAG 1.4.11 demande 3:1. Il s'en manque
  très peu : `#0f9e50` donne 3,48:1 sur blanc et 3,20:1 sur le fond de
  page. **P3.**

---

## 5. Ce qui va bien — et qu'il ne faut pas « améliorer »

Dit explicitement, pour que personne ne le défasse :

- **Aucun débordement horizontal** sur 390 / 834 / 1280 / 1440 / 1920.
- **La colonne de contenu est plafonnée à 944 px** et centrée — mesuré
  identique de 1280 à 2560 px. Ce n'est pas un oubli, c'est une longueur de
  ligne tenue.
- **Pas d'ombre, latérite réservée à la marque, action neutre** — la charte est
  respectée dans le code, y compris sur le téléphone.
- **Le mouvement est déjà raisonné** : les commentaires de `globals.css`
  expliquent pourquoi l'entrée de page est un fondu pur et pourquoi
  l'animation est en `backwards`. Ce sont des corrections de vrais défauts.

Reste une **occasion**, pas un défaut : à 1920 px il y a 368 px de vide à
droite des encaissements, alors que l'accueil, lui, sait s'en servir (le
panneau « Terminal »). Une fiche de SMS en colonne droite y tiendrait. À
proposer, pas à imposer.

---

## 6. L'instrument — et pourquoi l'ancien ne voyait rien

[`web/scripts/shot.mjs`](../web/scripts/shot.mjs) parcourt neuf routes **sans
jamais se connecter**. Or `/cartes` sans session renvoie **307 vers
/connexion** (vérifié). Il photographie donc **neuf fois l'écran de
connexion** en croyant photographier l'application.

C'est exactement le piège que [`CLAUDE.md`](../CLAUDE.md) décrit pour le
harnais des formats du téléphone — « il a mesuré l'écran de connexion aux huit
tailles, en vert, sans jamais voir un écran de l'application ». Le même piège
est resté ouvert côté web.

L'instrument de cet audit se connecte d'abord, puis **refuse de mesurer** s'il
se retrouve sur `/connexion`. Il relève par écran : débordement horizontal (et
le coupable), cibles sous 44 px (avec leur taille réelle), texte sous 12 px.

**À faire :** le promouvoir en `web/scripts/verifier-les-formats.mjs`, avec son
garde-fou — un contrôle qui passe sans rien regarder est pire que pas de
contrôle.
