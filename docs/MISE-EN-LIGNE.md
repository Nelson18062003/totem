# Mettre l'application en ligne (Vercel)

> Résultat : une adresse comme `totem.vercel.app`, ouvrable depuis n'importe
> quel téléphone dans le monde. Gratuit. Cinq minutes.

L'application affiche pour l'instant des **données de démonstration** : c'est
l'interface qu'on met en ligne, pas encore les vrais comptes. Un bandeau le
rappelle à la première visite.

---

## 1. Déployer (une seule fois)

1. Allez sur **vercel.com** → **Sign up** → **Continue with GitHub**.
2. **Add New… → Project**.
3. Choisissez le dépôt **`totem`** → **Import**.
4. ⚠️ **Le seul réglage qui compte** — dépliez **Root Directory** et
   sélectionnez le dossier **`web`**.
   *(L'application Next.js vit dans `web/`, pas à la racine du dépôt. Sans ce
   réglage, le déploiement échoue en disant qu'il ne trouve pas de projet.)*
5. Laissez tout le reste par défaut (Vercel reconnaît Next.js seul) → **Deploy**.
6. Deux minutes plus tard, votre adresse s'affiche. Ouvrez-la.

## 2. Mettre à jour, ensuite

Rien à faire. **Chaque fusion sur `main` redéploie automatiquement.** Les
branches en cours de relecture reçoivent chacune leur propre adresse de
prévisualisation, ce qui permet de regarder une PR avant de la fusionner.

## 3. Installer sur l'écran d'accueil du téléphone

L'interface s'ouvre alors en plein écran, sans barre de navigateur — comme une
vraie application.

- **iPhone (Safari)** : bouton Partager → *Sur l'écran d'accueil*.
- **Android (Chrome)** : menu ⋮ → *Installer l'application*.

## 4. Un mot sur la sécurité

Tant que l'application n'affiche que des données inventées, une adresse
publique ne présente aucun risque : il n'y a rien de vrai à voir, et aucun
bouton ne pilote quoi que ce soit.

**Avant de brancher les vraies données** (phase 3), il faudra fermer la porte —
c'est l'objet de la phase 4 : écran de connexion, mot de passe, double
authentification. L'ordre est volontaire : **on n'expose jamais de l'argent sur
une adresse publique sans verrou.**

En attendant, l'application demande aux moteurs de recherche de ne pas
l'indexer, donc elle ne remontera pas dans Google.

## 5. Si le déploiement échoue

| Message | Cause | Remède |
|---|---|---|
| « No Next.js version detected » | Root Directory oublié | Réglez-le sur `web` (Settings → General) |
| Erreur de compilation | Une erreur dans le code | Vercel affiche le journal complet ; la même erreur apparaît en local avec `npm run build` |
| Page blanche | Cache du navigateur | Rechargez en vidant le cache (Ctrl+Maj+R) |

## 6. Vérifier en local avant de déployer

```
cd web
npm install
npm run build     # doit finir sur « Compiled successfully »
npm run dev       # puis ouvrez http://localhost:3000
```
