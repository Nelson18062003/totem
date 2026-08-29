// Les règles de lecture d'un SMS, mises à l'épreuve.
//
// Le masquage des codes à usage unique est une DÉFENSE : ces tests-là
// gardent le fait qu'un code ne s'affiche jamais en clair, même si la base
// en renvoie un — et même si le propriétaire a posé une nature dessus.

import { test } from "node:test";
import assert from "node:assert/strict";
import { categorieDe, estArgent, texteSurEcran } from "../sms.ts";
import type { Paiement } from "../types.ts";

const sms = (p: Partial<Paiement>): Paiement => ({
  id: "1", sim: "MTN ·8901", carte: "89237", sens: "?", nom: "MTN", tiers: "",
  numero: "", montant: null, heure: "10:00", date: "Today", jour: "2026-08-29",
  recuLe: "", categorie: "message", nature: null, reference: "",
  soldeApres: null, smsBrut: "", recu: null, sourceId: null, terminal: null,
  nonLu: false, ...p,
});

test("un code à usage unique ne s'affiche JAMAIS en clair", () => {
  const cas = [
    "Votre code est 123456. Ne le communiquez a personne.",
    "Your OTP: 45 67 89",
    "Code: 12-34-56 valable 5 minutes",
  ];
  for (const texte of cas) {
    const vu = texteSurEcran(sms({ categorie: "code", smsBrut: texte }));
    assert.ok(vu.includes("••••••"), texte);
    assert.ok(!/\d{4,}/.test(vu.replace(/\d{1,3}(?!\d)/g, "")), `chiffres restants : ${vu}`);
  }
});

test("une nature posée à la main ne déshabille pas un code", () => {
  // Le piège : le propriétaire classe un code comme « depot ». La catégorie
  // devinée reste « code », et le masque doit tenir malgré tout.
  const p = sms({ categorie: "code", nature: "depot", smsBrut: "Code: 987654" });
  assert.ok(texteSurEcran(p).includes("••••••"));
});

test("un SMS ordinaire n'est pas masqué", () => {
  const texte = "Vous avez recu 20 000 FCFA de NKENGAFAC M. Solde: 412 500 FCFA.";
  assert.equal(texteSurEcran(sms({ categorie: "encaissement", smsBrut: texte })), texte);
});

test("la nature choisie l'emporte sur la catégorie devinée", () => {
  assert.equal(categorieDe(sms({ categorie: "message", nature: "depot" })), "depot");
  assert.equal(categorieDe(sms({ categorie: "encaissement", nature: null })), "encaissement");
});

test("seul un mouvement d'argent donne droit à un reçu", () => {
  assert.equal(estArgent(sms({ categorie: "encaissement" })), true);
  assert.equal(estArgent(sms({ categorie: "message", montant: 5000 })), true);
  assert.equal(estArgent(sms({ categorie: "depot", nature: "depot" })), true);
  // Ni une publicité, ni un code, ni un message : un reçu atteste d'argent.
  assert.equal(estArgent(sms({ categorie: "publicite" })), false);
  assert.equal(estArgent(sms({ categorie: "code" })), false);
  assert.equal(estArgent(sms({ categorie: "message" })), false);
});
