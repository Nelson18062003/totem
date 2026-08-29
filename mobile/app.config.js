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
//
// CE QUE CETTE CONDITION A DEJA COUTE, pour que personne ne la reintroduise
// ailleurs sans y penser. Elle rend cette configuration DIFFERENTE selon la
// machine qui la lit : le serveur d'Expo a le fichier, la machine de GitHub
// ne l'a pas. Tant que `runtimeVersion` etait calcule par empreinte
// (« fingerprint »), les deux machines calculaient deux empreintes, et la
// compilation s'arretait sur « Runtime version mismatch ».
//
// C'est reglé en ne calculant plus d'empreinte : `runtimeVersion` suit
// desormais le numero de version (voir app.json). Cette condition redevient
// donc sans danger — mais elle reste une configuration qui depend de son
// environnement, et ce genre de chose se paie toujours quelque part.

const { copyFileSync, existsSync } = require("fs");
const { isAbsolute, join, resolve } = require("path");

/** Le chemin du fichier Firebase, s'il y en a un a portee. */
function fichierFirebase() {
  // LE CHEMIN QUE DONNE EAS EST RELATIF.
  //
  // Le journal d'une compilation l'a montré : « ../../eas-environment-secrets/
  // f15d60d… ». Un chemin relatif ne veut rien dire tout seul — il dépend du
  // dossier depuis lequel on le lit. Si Expo évalue cette configuration
  // depuis un autre dossier, `existsSync` répond non, la ligne Firebase
  // disparaît, et la compilation RÉUSSIT quand même : on obtient une
  // application sans notifications, sans le moindre message.
  //
  // On résout donc le chemin contre le dossier de ce fichier, qui lui ne
  // bouge jamais. Et surtout : ON COPIE LE FICHIER DANS LE PROJET. Ainsi
  // tout ce qui suit — le plugin d'Expo, Gradle, l'empreinte — voit un
  // chemin stable, à l'intérieur du projet, identique à chaque lecture.
  // Pointer vers l'extérieur du projet, c'est dépendre d'un dossier
  // temporaire qu'on ne contrôle pas.
  const dansLeProjet = join(__dirname, "google-services.json");

  const depuisEas = process.env.GOOGLE_SERVICES_JSON;
  if (depuisEas) {
    // Un chemin relatif se lit depuis QUELQUE PART, et on ne sait pas d'où :
    // Expo peut évaluer cette configuration depuis le dossier du projet ou
    // depuis celui d'où la commande a été lancée. On essaie les deux plutôt
    // que de parier — se tromper de base ne donne pas une erreur, mais une
    // application silencieusement sans notifications.
    const pistes = isAbsolute(depuisEas)
      ? [depuisEas]
      : [resolve(process.cwd(), depuisEas), resolve(__dirname, depuisEas)];
    const absolu = pistes.find((p) => existsSync(p));
    if (absolu) {
      // Déjà à sa place ? On ne se recopie pas sur soi-même.
      if (resolve(absolu) !== resolve(dansLeProjet)) {
        copyFileSync(absolu, dansLeProjet);
      }
      console.log(`Firebase : google-services.json en place (depuis ${depuisEas}).`);
      return "./google-services.json";
    }
    // Le secret est déclaré mais introuvable : le DIRE. C'est exactement le
    // cas où l'on croit avoir configuré Firebase et où rien ne sonne.
    console.warn(
      `Firebase : GOOGLE_SERVICES_JSON vaut « ${depuisEas} », mais aucun `
      + `fichier n'est là. Cherché : ${pistes.join(" et ")}. Les `
      + `notifications seront MUETTES dans ce paquet.`);
  }

  // Sur la machine de quelqu'un qui compile a la main, le fichier peut etre
  // simplement pose a cote. Il est ignore par git (voir .gitignore).
  if (existsSync(dansLeProjet)) {
    console.log("Firebase : google-services.json trouvé dans le projet.");
    return "./google-services.json";
  }

  console.warn(
    "Firebase : aucun google-services.json. L'application se compilera et "
    + "fonctionnera, mais elle ne pourra pas recevoir de notifications.");
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
