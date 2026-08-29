// La configuration de Metro, l'empaqueteur de React Native.
//
// Deux ajouts, et ils servent la même chose : que l'application lise LE MÊME
// noyau que la plateforme web, sans copie.
//
// Par défaut, Metro ne regarde que sous `mobile/`. Le noyau vit sous
// `web/noyau/` (voir le README de ce dossier : le Root Directory de Vercel
// interdit de le remonter à la racine). Il faut donc :
//
//   1. `watchFolders` — lui dire d'aussi SURVEILLER ce dossier, sinon une
//      correction du dictionnaire n'apparaîtrait qu'après un redémarrage ;
//   2. `extraNodeModules` — lui apprendre à quoi « @noyau/… » correspond,
//      le même alias que `web/tsconfig.json`.
//
// Sans ces deux lignes, l'application ne compile pas : les 1 000 lignes du
// dictionnaire seraient introuvables.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projet = __dirname;
const noyau = path.resolve(projet, "..", "web", "noyau");

const config = getDefaultConfig(projet);

config.watchFolders = [...(config.watchFolders ?? []), noyau];

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@noyau": noyau,
};

// Les modules se cherchent dans le dossier de l'application — le noyau n'a
// pas de dépendances à lui, ce n'est que du TypeScript sans attaches.
config.resolver.nodeModulesPaths = [path.resolve(projet, "node_modules")];

module.exports = config;
