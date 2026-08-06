# Consignes de travail sur TOTEM

## Avant toute pull request

Dans cet ordre, **sans exception** :

1. **Aller voir `main`.** `git fetch origin main`, puis regarder où il en est.
2. **Lire ce qui s'y est passé** depuis la dernière fois : les commits, les
   fichiers touchés, ce que ça change pour le travail en cours.
3. **Vérifier les conflits.** Quels fichiers sont modifiés des deux côtés ?
   Rebaser, puis **relire le résultat** — un rebase « réussi » peut très bien
   avoir avalé un des deux côtés sans rien signaler.
4. **Regarder les pull requests** : lesquelles sont ouvertes, lesquelles ont
   été fusionnées, à quel niveau on se trouve.
5. **Rejouer les vérifications à ce niveau-là** : les tests, la compilation.
   Le compte de tests d'il y a une heure ne vaut plus rien.

**Seulement ensuite, créer la pull request.**

Une PR ouverte avant cette vérification est à refaire : elle décrit un état du
dépôt qui n'existe plus. La fermer et en ouvrir une propre, sur une base
vérifiée.

## Le dépôt parle français

Code, commentaires, noms de fonctions, messages de commit, documentation,
descriptions de PR : tout est en français.

On nomme **l'objet, pas la technique**. « Le robot » plutôt que « le daemon ».
« Le terminal est actif » plutôt que « heartbeat OK ». Le propriétaire n'est
pas informaticien.

## Branche de travail

Développer sur la branche indiquée par la session. Ne jamais pousser sur une
autre branche sans autorisation explicite.

## Vérifier avant d'annoncer

```sh
python3 -m unittest discover -s tests     # la batterie complète
cd web && npx next build                  # l'application web
cd web && node scripts/verifier-le-systeme.mjs   # les dimensions de l'interface
node recus/maquette.mjs                   # les reçus PDF
python3 brand/generer.py                  # les fichiers de la marque
```

Ne jamais annoncer qu'une chose fonctionne sans l'avoir lancée. Si un test
échoue, le dire avec sa sortie.

## Ce qui ne s'improvise pas

- **Le symbole de la marque** est décrit une seule fois, dans
  `brand/generer.py`. Tout le reste en découle. Voir `docs/IDENTITE.md`.
- **Les dimensions de l'interface** sont décrites une seule fois, dans
  `web/app/globals.css`, et assemblées selon `docs/SYSTEME.md`. Aucune valeur
  ne s'écrit dans un écran : grille de 4 px, échelle fermée à huit crans,
  cible tactile de 44 px, hauteur de contrôle **déclarée** et jamais obtenue
  par empilement de paddings. `verifier-le-systeme.mjs` le vérifie et refuse
  le reste.
- **Le code PIN** n'est jamais stocké, jamais écrit dans un message, jamais
  journalisé autrement que `****`.
- **Un SMS mal compris** vaut mieux qu'un SMS mal interprété : `analyse_sms.py`
  renvoie `None` dans le doute, et n'invente jamais un montant.
