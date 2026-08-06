# Les captures

Les neuf écrans, aux trois largeurs qui comptent : **téléphone 390 × 844**,
**tablette 834 × 1112**, **bureau 1440 × 900**. En français, en pleine hauteur.

`avant/` est l'état du 6 août 2026, **avant la refonte du système de
dimensions** — la base de comparaison. On y voit ce que l'audit a mesuré :
des contrôles sous la cible tactile, des filtres de trois hauteurs
différentes sur une même barre, des encadrés d'état vide à la limite du
visible, et des rangées de liste dont la hauteur suit le texte reçu.

## Refaire les captures

```sh
cd web
npm run build
npx next start -p 3112 &
node scripts/shot.mjs mobile     # puis tablette, puis desktop
```

Les écrans se remplissent avec ce que la base contient. Sans
`SUPABASE_URL`/`SUPABASE_CLE`, ils sont vides et le disent — c'est le
comportement voulu, aucune donnée n'est inventée. Pour une maquette peuplée,
on branche une doublure locale qui sert la même forme REST ; elle ne vit que
le temps des captures et n'entre pas dans le dépôt.
