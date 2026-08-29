// Un crochet de résolution, pour les tests seulement.
//
// Node exige une extension dans un import ESM (« ./natures.ts ») ; le reste
// du dépôt écrit « ./natures », comme le font Next et Metro. Plutôt que de
// tordre le code de production pour plaire au lanceur de tests, on apprend
// au lanceur à faire ce que font déjà les deux empaqueteurs.
//
//     node --import ./noyau/tests/resolveur.mjs --test "noyau/tests/*.test.ts"

import { registerHooks } from "node:module";

registerHooks({
  resolve(specificateur, contexte, suivant) {
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
