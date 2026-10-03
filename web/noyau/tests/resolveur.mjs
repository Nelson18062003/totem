// Un crochet de résolution, pour les tests seulement.
//
// Node exige une extension dans un import ESM (« ./natures.ts ») ; le reste
// du dépôt écrit « ./natures », comme le font Next et Metro. Plutôt que de
// tordre le code de production pour plaire au lanceur de tests, on apprend
// au lanceur à faire ce que font déjà les deux empaqueteurs.
//
//     node --import ./noyau/tests/resolveur.mjs --test "noyau/tests/*.test.ts"

import { registerHooks } from "node:module";

const NOYAU = new URL("../", import.meta.url);

registerHooks({
  resolve(specificateur, contexte, suivant) {
    // « @noyau/numero » : l'alias que Next et Metro connaissent. Un fichier
    // de `lib/` qui lit le noyau (le PDF des coordonnées) peut ainsi être
    // éprouvé ici sans changer sa façon d'importer.
    if (specificateur.startsWith("@noyau/")) {
      return suivant(new URL(`${specificateur.slice(7)}.ts`, NOYAU).href, contexte);
    }
    // Un chemin relatif SANS extension : on tente le « .ts ».
    if (specificateur.startsWith(".") && !/\.[a-z]+$/i.test(specificateur)) {
      try {
        return suivant(`${specificateur}.ts`, contexte);
      } catch {
        /* pas un .ts : on laisse Node décider comme d'habitude */
      }
    }
    return suivant(specificateur, contexte);
  },
});
