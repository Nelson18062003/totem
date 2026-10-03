// CE QUE LA FICHE DES COORDONNÉES COPIE — et ce qu'elle partage.
//
// Le propriétaire copie ses coordonnées pour les coller dans un message :
// « le nom et le numéro », a-t-il demandé, pas une troisième ligne à effacer
// à chaque fois. La plateforme et le téléphone lisent la même fonction ;
// c'est elle qu'on garde ici.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ceQueCopierEmporte, numeroACopier, serviceMobileMoney, texteACopier, texteAPartager,
} from "../coordonnees";

test("copier : le nom et le numéro, et rien d'autre", () => {
  assert.equal(texteACopier("JEAN DUPONT", "677998877"), "JEAN DUPONT\n677 99 88 77");
  assert.ok(!texteACopier("JEAN DUPONT", "677998877").includes("Mobile Money"));
});

test("copier : le numéro se lit par tranches, indicatif compris", () => {
  assert.equal(texteACopier("A", "237677998877"), "A\n+237 677 99 88 77");
});

test("le rond du numéro : les chiffres seuls, prêts pour un champ", () => {
  assert.equal(numeroACopier("677998877"), "677998877");
  assert.equal(numeroACopier("237677998877"), "677998877");
  assert.equal(numeroACopier("+237 677 99 88 77"), "677998877");
  assert.equal(numeroACopier("677 99 88 77"), "677998877");
  assert.equal(numeroACopier(""), "");
});

test("copier sans nom inscrit : le numéro seul, sans ligne vide devant", () => {
  assert.equal(texteACopier("", "677998877"), "677 99 88 77");
  assert.equal(texteACopier("   ", "677998877"), "677 99 88 77");
});

test("copier sans numéro : le nom seul — rien d'inventé", () => {
  assert.equal(texteACopier("JEAN DUPONT", ""), "JEAN DUPONT");
});

test("un nom de commerce passe en entier, espaces du bord ôtés", () => {
  const long = "STE. NOUVELLE BRASSERIE DU LITTORAL ET DES HAUTS PLATEAUX DE L'OUEST SARL";
  assert.equal(texteACopier(`  ${long} `, "690000000"), `${long}\n690 00 00 00`);
});

test("le bouton dit ce qu'il copie — et disparaît quand il n'a rien à copier", () => {
  assert.equal(ceQueCopierEmporte("JEAN DUPONT", "677998877"), "nom-et-numero");
  assert.equal(ceQueCopierEmporte("", "677998877"), "numero");
  assert.equal(ceQueCopierEmporte("  ", "677998877"), "numero");
  assert.equal(ceQueCopierEmporte("JEAN DUPONT", ""), "nom");
  assert.equal(ceQueCopierEmporte("", ""), null);
  // Il dit la même chose que ce que `texteACopier` rend : vide ⇔ rien.
  for (const [nom, numero] of [["A", "677998877"], ["", "677998877"], ["A", ""], ["", ""]]) {
    assert.equal(ceQueCopierEmporte(nom, numero) === null, texteACopier(nom, numero) === "");
  }
});

test("partager : le nom, le numéro, ET le réseau", () => {
  assert.equal(texteAPartager("JEAN DUPONT", "677998877", "MTN"),
               "JEAN DUPONT\n677 99 88 77\nMTN Mobile Money");
  assert.equal(texteAPartager("", "690000000", "Orange"), "690 00 00 00\nOrange Money");
});

test("le réseau porte le nom du service, jamais une case vide", () => {
  assert.equal(serviceMobileMoney("MTN"), "MTN Mobile Money");
  assert.equal(serviceMobileMoney("Orange"), "Orange Money");
  assert.equal(serviceMobileMoney(""), "Mobile Money");
  // La plateforme écrit « ? » pour un opérateur qu'elle ne connaît pas.
  assert.equal(serviceMobileMoney("?"), "Mobile Money");
  assert.ok(!texteAPartager("A", "677998877", "?").includes("?"));
  assert.equal(serviceMobileMoney("Nexttel"), "Nexttel");
});

// LE PDF DIT LE NUMÉRO COMME LA FICHE. Le web formatait le numéro avant
// d'appeler le générateur, la route du téléphone non : le même document
// disait « 677 12 34 56 » d'un côté et « 677123456 » de l'autre. C'est le
// générateur qui le met en forme, maintenant — brut ou déjà formaté, le
// document est le même.
test("le PDF des coordonnées : le numéro par tranches, quel que soit l'appelant", async () => {
  const { pdfCoordonnees } = await import("../../lib/pdf-rib");
  const fabriquer = (numero: string) => new TextDecoder("latin1").decode(pdfCoordonnees({
    nom: "JEAN DUPONT", numero, operateur: "MTN", service: "MTN Mobile Money",
    libelle: "MTN ·8877", titre: "Account details", etiquetteNom: "Name",
    etiquetteNumero: "Number", etiquetteReseau: "Network", pied: "",
  }));
  const brut = fabriquer("677998877");
  assert.ok(brut.includes("677 99 88 77"), "le numéro brut sort mis en forme");
  assert.ok(!brut.includes("677998877"), "plus jamais d'un seul bloc");
  // L'horodatage du document mis à part, les deux appels donnent le même.
  const sansDate = (s: string) => s.replace(/\/CreationDate \([^)]*\)/g, "");
  assert.equal(sansDate(fabriquer("677 99 88 77")), sansDate(brut));
});
