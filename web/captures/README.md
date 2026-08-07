# Les captures

Les neuf écrans, aux trois largeurs qui comptent : **téléphone 390 × 844**,
**tablette 834 × 1112**, **bureau 1440 × 900**. En français, en pleine hauteur.

| Dossier | Ce qu'on y voit |
|---|---|
| `avant/` | L'état du 6 août 2026, avant la refonte du système de dimensions. |
| `apres/` | Les mêmes écrans, reconstruits sur les composants. |
| `systeme/` | La planche de contrôle (`/styleguide`) : les six familles et tous leurs états. |

## Ce que la comparaison montre

Dans `avant/`, ce que l'audit avait mesuré est visible à l'œil nu : des
contrôles sous la cible tactile, des filtres à trois hauteurs différentes sur
une même barre, des encadrés d'état vide à la limite du visible (1,20:1), et
des rangées de liste dont la hauteur suivait le SMS reçu — de 76 à 142 px
selon le message.

Dans `systeme/`, les planches de sélecteurs portent les **zones tactiles
tracées en pointillés** : on y voit le carré de 44 px entourer une case à
cocher de 20. C'est la démonstration que le visuel a le droit d'être petit tant
que la région qui accepte l'appui ne l'est pas.

## Refaire les captures

```sh
cd web
npm run build
npx next start -p 3112 &
node scripts/shot.mjs mobile     # puis tablette, puis desktop
```

Les écrans se remplissent avec ce que la base contient. Sans
`SUPABASE_URL`/`SUPABASE_CLE`, ils sont vides et le disent — c'est le
comportement voulu, aucune donnée n'est inventée. Pour une maquette peuplée, on
branche une doublure locale qui sert la même forme REST ; elle ne vit que le
temps des captures et n'entre pas dans le dépôt.

Une précaution apprise à ses dépens : **ne pas recompiler pendant qu'un serveur
tourne**. Les empreintes des fichiers changent, l'hydratation meurt, et les
captures montrent une page qui ne répond plus — sans rien signaler.
