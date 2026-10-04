// Le message se lit dans son ordre, une seule fois : chaque choix y a sa tuile.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lignesDuMessage, lireEcran, menuEnTuiles } from "../ussd";

const ORANGE = "Welcome to Orange Money. Please select :\n1:Merchant Payment\n2:Cash In\n"
  + "3:Cash Out\n4:Money transfer\n5:Balance Inquiry\n6:Last 5 transactions\n7:Options\n"
  + "8:Bank & Finance\n\n...\n9:Next";

test("le menu Orange : neuf lignes touchables, aucune répétée, rien en plus", () => {
  const e = lireEcran(ORANGE, "attend");
  assert.equal(e.choix.length, 9);
  const { lignes, restants } = lignesDuMessage(ORANGE, e.choix);
  assert.deepEqual(restants, []);
  // Le texte, recollé, est EXACTEMENT celui de l'opérateur.
  assert.equal(lignes.map((l) => l.texte).join("\n"), ORANGE);
  assert.deepEqual(lignes.filter((l) => l.numero).map((l) => l.numero),
    ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  assert.equal(lignes[0].numero, undefined);
  assert.equal(lignes[1].libelle, "Merchant Payment");
});

test("« 00. Next » seul sur sa ligne : le message reste entier, « Next » en tuile dessous", () => {
  const t = "Confirm: Float Transfer for FCFA 5000 To ETS ESSAI having mobile number 670000123.\n00. Next";
  const e = lireEcran(t, "attend");
  const { lignes, restants } = lignesDuMessage(t, e.choix);
  assert.equal(lignes.map((l) => l.texte).join("\n"), t);
  assert.ok(lignes.every((l) => !l.numero));
  assert.deepEqual(restants.map((c) => c.numero), ["00"]);
  assert.deepEqual(menuEnTuiles(lignes), { titre: t, suite: [] });
});

test("une navigation collée reste dans le texte et ressort en raccourci", () => {
  const t = "Confirm: transfer to ETS ESSAI having mobile number 670000123. 00. Next";
  const e = lireEcran(t, "attend");
  const { lignes, restants } = lignesDuMessage(t, e.choix);
  assert.equal(lignes.map((l) => l.texte).join("\n"), t);
  assert.ok(lignes.every((l) => !l.numero));
  assert.deepEqual(restants.map((c) => c.numero), ["00"]);
});

test("deux choix sur une ligne : texte intact, deux raccourcis", () => {
  const t = "Choisissez\n1. Envoyer\n2. Retirer\n00.Next 0.Back";
  const e = lireEcran(t, "attend");
  const { lignes, restants } = lignesDuMessage(t, e.choix);
  assert.equal(lignes.map((l) => l.texte).join("\n"), t);
  assert.deepEqual(lignes.filter((l) => l.numero).map((l) => l.numero), ["1", "2"]);
  assert.deepEqual(restants.map((c) => c.numero), ["00", "0"]);
});

test("un message sans choix : du texte, rien à toucher", () => {
  const { lignes, restants } = lignesDuMessage("Entrez le montant :", []);
  assert.deepEqual(lignes, [{ texte: "Entrez le montant :" }]);
  assert.deepEqual(restants, []);
});

test("le menu Orange en tuiles : le titre, huit tuiles, « … », la neuvième", () => {
  const { lignes } = lignesDuMessage(ORANGE, lireEcran(ORANGE, "attend").choix);
  const { titre, suite } = menuEnTuiles(lignes);
  assert.equal(titre, "Welcome to Orange Money. Please select :");
  assert.deepEqual(suite.map((m) => m.numero ?? m.texte),
    ["1", "2", "3", "4", "5", "6", "7", "8", "...", "9"]);
  assert.equal(suite[8].numero, undefined);
  // Chaque ligne de l'opérateur est quelque part, une seule fois.
  const vu = [titre, ...suite.map((m) => m.numero ? `${m.numero}:${m.libelle}` : m.texte)];
  for (const l of ORANGE.split("\n").filter((x) => x.trim())) {
    assert.equal(vu.filter((v) => v.includes(l)).length, 1, l);
  }
});

test("sans choix sur une ligne à lui, le titre est le message entier", () => {
  const t = "Confirm: transfer to ETS ESSAI. 00. Next";
  const { lignes } = lignesDuMessage(t, lireEcran(t, "attend").choix);
  assert.deepEqual(menuEnTuiles(lignes), { titre: t, suite: [] });
});
