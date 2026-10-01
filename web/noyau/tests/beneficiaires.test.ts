import { test } from "node:test";
import assert from "node:assert/strict";
import { aQui, nomDuBeneficiaire, numeroPropre } from "../beneficiaires";

test("le nom se lit à côté du numéro, avant ou après", () => {
  assert.equal(nomDuBeneficiaire(
    "Vous allez transferer 5000 FCFA a JEAN DUPONT (677998877). Frais: 0 FCFA. Entrez votre code PIN",
    "677998877"), "JEAN DUPONT");
  assert.equal(nomDuBeneficiaire(
    "Confirmez le transfert de 5000F vers 677998877 JEAN DUPONT\nSaisir votre code secret",
    "677998877"), "JEAN DUPONT");
  assert.equal(nomDuBeneficiaire(
    "Transfer 5,000 XAF to JOHN DOE 237677998877. Enter PIN to confirm",
    "677998877"), "JOHN DOE");
  assert.equal(nomDuBeneficiaire(
    "Transfert vers NKENGAFAC MBOUNGOU JEANNE-CLAIRE EPSE TCHOUMI (237 677 99 88 77)",
    "677998877"), "NKENGAFAC MBOUNGOU JEANNE-CLAIRE EPSE TCHOUMI");
});

test("dans le doute, aucun nom", () => {
  assert.equal(nomDuBeneficiaire("Entrez votre code secret", "677998877"), null);
  assert.equal(nomDuBeneficiaire("Transfert vers 677998877. Entrez votre code PIN", "677998877"), null);
  assert.equal(nomDuBeneficiaire("JEAN DUPONT ... beaucoup plus loin 677998877", "677998877"), null);
  assert.equal(nomDuBeneficiaire("", "677998877"), null);
  assert.equal(nomDuBeneficiaire("a JEAN (677998877)", "12"), null);
});

test("le même numéro, écrit avec ou sans 237", () => {
  assert.equal(numeroPropre("237 677 99 88 77"), "677998877");
  assert.equal(numeroPropre("677998877"), "677998877");
});

test("le carnet passe devant les récents, sans doublon", () => {
  const liste = aQui(
    [{ id: 1, carte: "A", numero: "677998877", nom: "Maman" },
     { id: 2, carte: "B", numero: "699000000", nom: "Autre carte" }],
    [{ numero: "237677998877", nom: "NKENGAFAC" }, { numero: "670334455", nom: "TAILLEUR" }],
    "A");
  assert.deepEqual(liste.map((b) => [b.nom, b.enregistre]),
    [["Maman", true], ["TAILLEUR", false]]);
});
