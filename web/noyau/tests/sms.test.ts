// Les règles de lecture d'un SMS, mises à l'épreuve.
//
// LE SMS NE SE MODIFIE PAS. Le texte affiché est celui reçu, à l'octet près —
// codes compris. Ce sont les messages du propriétaire, sur sa carte ; un code
// de connexion reçu par SMS, il doit pouvoir le lire. On a un temps masqué
// ces codes ; c'était une faute, retirée. Ces tests gardent le contraire de
// jadis : le texte remonte ENTIER, quelle que soit la catégorie ou la nature.

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

test("un SMS à code s'affiche ENTIER — le code se lit", () => {
  // Jadis on masquait ; on ne touche plus au texte. Le propriétaire doit
  // lire son propre code de connexion, c'est à ça qu'il sert.
  const cas = [
    "Votre code est 123456. Ne le communiquez a personne.",
    "Your OTP: 45 67 89",
    "Code: 12-34-56 valable 5 minutes",
  ];
  for (const texte of cas) {
    const vu = texteSurEcran(sms({ categorie: "code", smsBrut: texte }));
    assert.equal(vu, texte, texte);           // à l'octet près
    assert.ok(!vu.includes("•"), `un point de masque subsiste : ${vu}`);
  }
});

test("une nature posée à la main ne change rien au texte non plus", () => {
  const p = sms({ categorie: "code", nature: "depot", smsBrut: "Code: 987654" });
  assert.equal(texteSurEcran(p), "Code: 987654");
});

test("un SMS ordinaire s'affiche tel quel", () => {
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
