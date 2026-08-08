# Mettre en service ce qui a été dessiné

Vingt-cinq écrans ont été dessinés et mesurés. Ce document dit dans quel ordre
on les met en service, et surtout **pourquoi cet ordre-là**.

## L'ampleur, mesurée

| | Aujourd'hui | Dessiné |
|---|---|---|
| Écrans | 9 pages | **25** (8 console · 7 porte admin · 10 client) |
| Comptes | aucun — un mot de passe partagé | personnes nommées, trois rôles |
| Rôles | aucun, `sujet = "proprietaire"` en dur | propriétaire · opérateur · lecteur |
| Sessions | un jeton d'un mois, **rien à révoquer** | registre, révocation à la seconde |
| Invitations | aucune | liées au numéro, à usage unique |
| Tables | 7 | 7 + **personnes, acces, invitations, sessions** |
| Tests | 437, au vert | + ceux de l'identité et des rôles |

## L'ordre, et sa raison

Un audit adverse a formulé la contrainte mieux que je ne l'aurais fait :

> Le vrai risque n'est pas l'intrusion, c'est l'imputabilité. Le jour où
> 300 000 F disparaissent, TOTEM ne pourra ni confondre l'opérateur ni le
> disculper — le journal dira « quelqu'un ».

C'est pour cela que **rien de visible ne vient en premier**. Un écran de rôles
posé sur un système qui ne sait pas qui a appuyé est un décor.

---

### Phase 0 · Les fondations qu'on ne voit pas

**0.1 — Réconcilier les jetons.** L'application a déjà une charte en jetons
Tailwind (`web/app/globals.css`) et elle diverge de la maquette. Deux défauts
y ont été trouvés **par le calcul**, les mêmes que dans la maquette :

- `--color-ink-faint` `#77726b` tient **3,91:1** sur `--color-surface-3`, sous
  le seuil de 4,5:1. Le commentaire annonce « 4,6:1, passe AA » — vrai sur le
  fond le plus clair seulement, faux là où l'encre se pose réellement.
- `--color-line` `#e8e5e1` tient **1,26:1** : posé autour d'un champ vide, il
  rend le champ invisible tant qu'on n'a pas cliqué dedans (WCAG 2.2 §1.4.11).

On corrige, on ajoute le trait de contrôle, et on porte `mesure.mjs` sur les
vraies pages : ce qui a servi à la maquette doit servir au produit.

**0.2 — L'identité.** `personnes`, `acces` (un rôle par commerce et par carte),
`invitations`, `sessions`. Et la colonne « demandé par » sur `commandes`, qui
manque. Fichier rejouable, comme le reste de `sql/schema.sql`.

**0.3 — Le verrou.** Trois corrections, toutes vérifiées dans le code :

- `web/middleware.ts:16` — sans `SESSION_SECRET`, il fait `NextResponse.next()`
  et **ouvre tout**. Le défaut doit être l'inverse : fermé, 503.
- `web/lib/session.ts:33` — le jeton porte `sujet = "proprietaire"` en dur, pas
  d'identifiant de session, pas d'appareil. Il portera un identifiant vérifié
  en base, donc révocable.
- `/api/deconnexion` efface un cookie et rien d'autre. Tant qu'il n'y a pas de
  registre, l'écran ne doit pas écrire « déconnecté » : ce serait mentir.

À la fin de la phase 0, rien n'a changé à l'écran. C'est normal, et c'est le
seul moment du chantier où ça l'est.

---

### Phase 1 · La porte du client

`C1` invitation · `C2` code · `C3` la façon d'entrer · `C4` le papier ·
`C5` l'entrée quotidienne · `C6` les refus.

En premier parce que **rien n'existe avant l'invitation** : aucun compte client
ne peut naître autrement. Et parce que `C2` est le seul mécanisme d'identité
disponible sur ce parc de téléphones — dessiné une fois, il resservira cinq
fois.

`C4` est en quatrième et pas en dixième : **le chemin de retour doit exister
avant la première sortie.** Un compte créé sans filet, c'est un commerçant
coupé de son propre argent dans six mois.

### Phase 2 · Le comptoir et les gens

`C7` l'accueil selon le rôle · `C9` les gens du commerce.

C'est la première preuve **visible** que les rôles existent. Et c'est là que
retirer une clé ferme les sessions **en cours** — l'écart entre une case cochée
et une sécurité.

### Phase 3 · Le retour et les messages

`C8` « je n'arrive plus à entrer » · `C10` les messages.

`C8` met **fermer** avant **rentrer**, et fermer ne demande aucune preuve.
`C10` passe par `verifier-sms.mjs` : un SMS n'est pas une chaîne de caractères,
c'est un encodage, et le point médian de la marque le fait basculer en UCS-2.

### Phase 4 · La porte super-admin

`A1` à `A7`. Après le client, parce que le client est la partie qui n'existe
pas du tout aujourd'hui, tandis que l'administrateur a au moins une porte.

### Phase 5 · La console d'administration

Les huit écrans. En dernier des écrans parce qu'ils **lisent** surtout, et que
lire est ce que le système sait déjà faire.

### Phase 6 · Les règles qui protègent sans discipline

Plafond journalier par rôle, fenêtre horaire du comptoir, limitation des
tentatives **par authentifiant** (l'application a son propre compteur),
cloisonnement par carte, détection d'anomalie.

C'est la seule famille de défenses qui ne demande **rien** à l'utilisateur — et
elle attrape à elle seule l'employé licencié, le neveu qui connaît le geste, le
téléphone arraché et la contrainte physique. Elle vient en dernier dans l'ordre
de construction, jamais dans l'ordre d'importance.

---

## Ce qui clôt chaque phase

La même liste, sans exception, avant de passer à la suivante :

```sh
python3 -m unittest discover -s tests     # la batterie complète
cd web && npx next build                  # l'application web
node recus/maquette.mjs                   # les reçus PDF
python3 brand/generer.py                  # les fichiers de la marque
```

Plus la mesure au pixel des écrans touchés, et une capture. Un écran qui n'a
pas été mesuré n'est pas livré.

## Ce que ce plan ne fait pas

Trois chantiers sont **hors** de ces phases, et il faut le dire plutôt que le
laisser croire :

- **Le PIN qui traverse Internet.** Il transite en clair dans
  `commandes.parametres` jusqu'à la relève du Pi. La promesse « TOTEM ne
  demande jamais le PIN » est vraie au sens « ne le stocke pas », fausse au
  sens du trajet. Le vrai remède est le SIM Toolkit (`docs/USSD-OU-STK.md`).
- **La clé `service_role` côté web.** Elle contourne la RLS par conception ;
  tant qu'elle est là, les politiques du schéma donnent une fausse impression
  de cloisonnement.
- **Le point unique de rupture.** Un seul super-administrateur, en France.
  Chaque recours humain de `CAS-LIMITES.md` pointe vers la même personne.

Aucun des trois ne se règle par un écran.
