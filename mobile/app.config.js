// Les quelques reglages qui ne peuvent pas vivre dans `app.json`.
//
// `app.json` reste la reference : Expo le lit d'abord et le passe ici. On ne
// fait qu'y ajouter ce qui depend de l'ENVIRONNEMENT — ce qu'un fichier JSON,
// par nature, ne sait pas faire.
//
// Pour l'instant, une seule chose : le fichier Firebase.
//
// POURQUOI FIREBASE. Sur Android, il n'existe qu'un seul chemin pour faire
// sonner un telephone : les serveurs de Google (FCM). Ce n'est pas un choix
// d'outil, c'est la plomberie du systeme — Expo passe par la, comme tout le
// monde. Le fichier `google-services.json` est la carte d'identite du projet
// Firebase : il dit a l'application a quel projet elle appartient.
//
// POURQUOI IL N'EST PAS DANS LE DEPOT. Il identifie le projet, et il n'a rien
// a faire dans un depot public. Il est depose comme SECRET DE FICHIER dans
// EAS, qui l'ecrit sur la machine de compilation et pose son chemin dans
// `GOOGLE_SERVICES_JSON`.
//
// POURQUOI C'EST CONDITIONNEL. Tant que le secret n'existe pas, la
// compilation doit continuer de marcher : l'application se construit, elle
// s'installe, tout fonctionne — seules les notifications restent muettes.
// Une ligne fixe dans `app.json` ferait au contraire echouer la compilation
// avec « Cannot copy google-services.json », pour un fichier absent.

const { existsSync } = require("fs");

/** Le chemin du fichier Firebase, s'il y en a un a portee. */
function fichierFirebase() {
  // EAS ecrit le secret de fichier ou il veut, et donne son chemin ici.
  const depuisEas = process.env.GOOGLE_SERVICES_JSON;
  if (depuisEas && existsSync(depuisEas)) return depuisEas;
  // Sur la machine de quelqu'un qui compile a la main, le fichier peut etre
  // simplement pose a cote. Il est ignore par git (voir .gitignore).
  if (existsSync(`${__dirname}/google-services.json`)) {
    return "./google-services.json";
  }
  return undefined;
}

module.exports = ({ config }) => {
  const firebase = fichierFirebase();
  return {
    ...config,
    android: {
      ...config.android,
      ...(firebase ? { googleServicesFile: firebase } : {}),
    },
  };
};
