// Fabrique, avec le code de la PLATEFORME (lib/recu-pdf.ts), les reçus décrits
// dans un fichier JSON — pour que tests/test_recu_de_la_plateforme.py les
// compare, pixel par pixel, à ceux du boîtier (totem/recu.py).
//
//     node --import ./noyau/tests/resolveur.mjs scripts/recu-de-la-plateforme.mjs cas.json dossier/
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { recuSolde, recuTransfert } = await import("../lib/recu-pdf.ts");
const [, , fichier, dossier] = process.argv;
for (const cas of JSON.parse(readFileSync(fichier, "utf8"))) {
  const r = cas.genre === "solde"
    ? recuSolde(cas.solde, cas.compte, cas.numero_ligne, cas.numero, cas.quand, cas.operateur, cas.langue)
    : recuTransfert(cas.paiement, cas.numero, cas.quand, cas.operateur, cas.titre, cas.langue, cas.compte);
  writeFileSync(join(dossier, `${cas.nom}.pdf`), r.pdf);
  if (r.debordements) console.log(`${cas.nom}: ${r.debordements} débordement(s)`);
}
