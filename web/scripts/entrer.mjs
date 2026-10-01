// ENTRER PAR CODE, comme une personne le fait — pour les harnais.
//
// On n'entre plus par mot de passe : on demande un code, il part dans une
// boîte, on le tape. Les harnais font EXACTEMENT ce chemin : ils demandent le
// code à la plateforme, vont lire la lettre dans la boîte du faux nuage (qui
// se fait passer pour le service de courrier, voir faux-nuage.mjs), et tapent
// le code. Aucun raccourci : un harnais qui entrerait par une porte dérobée
// prouverait que la porte dérobée marche.
//
// LA PLATEFORME DOIT ÊTRE LANCÉE AVEC LE COURRIER (voir `envCourrier`) : sans
// clé, elle refuse d'envoyer un code — et c'est voulu.

import { setTimeout as attendre } from "node:timers/promises";

/** Les variables qui branchent le courrier de la plateforme sur le faux nuage. */
export const envCourrier = (portNuage) => ({
  COURRIER_CLE: "re_essai",
  COURRIER_URL: `http://127.0.0.1:${portNuage}`,
});

let adresseSuivante = 1;
/** Une adresse d'origine neuve, pour que le frein de la porte ne mélange pas
 *  les entrées légitimes d'un harnais avec celles qu'il veut freiner. Un
 *  harnais qui VEUT être freiné passe la sienne. */
export const adresseNeuve = () => `10.77.${(adresseSuivante >> 8) & 255}.${adresseSuivante++ & 255}`;

/** Combien de lettres cette adresse a déjà reçues, et la dernière. */
export async function boite(portNuage, courriel) {
  const r = await fetch(
    `http://127.0.0.1:${portNuage}/essai/courrier?a=${encodeURIComponent(courriel)}`);
  return r.json();
}

/**
 * Attend une lettre de PLUS que `avant` — la lettre part APRÈS la réponse de
 * la plateforme (elle ne doit rien dire de qui a un compte), il faut donc
 * l'attendre. On attend un ÉTAT, jamais une durée fixe.
 */
export async function attendreUneLettre(portNuage, courriel, avant, delaiMs = 8000) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    const b = await boite(portNuage, courriel);
    if (b.nombre > avant) return b;
    await attendre(100);
  }
  return null;
}

/** Demande un code. Rend la réponse de la plateforme. */
export async function demanderUnCode(base, courriel, { adresse = adresseNeuve() } = {}) {
  return fetch(`${base}/api/code`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": adresse },
    body: JSON.stringify({ courriel }),
  });
}

/**
 * Entre avec ce courriel, par code, et rend le JETON (porte du téléphone) —
 * ou `null`, avec la raison sur la sortie d'erreur.
 *
 * `inscrire: true` crée d'abord le compte du propriétaire (une plateforme
 * neuve) : l'inscription envoie elle-même le premier code.
 */
export async function entrerParCode(base, portNuage, courriel, { inscrire = false } = {}) {
  // On fait comme si le code précédent avait une heure : sans cela, la base
  // refuserait à bon droit un second code dans la minute.
  await fetch(`http://127.0.0.1:${portNuage}/essai/vieillir-les-codes`, { method: "POST" });
  const avant = (await boite(portNuage, courriel)).nombre;
  const r = inscrire
    ? await fetch(`${base}/api/inscription`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": adresseNeuve() },
        body: JSON.stringify({ courriel }),
      })
    : await demanderUnCode(base, courriel);
  if (!r.ok) {
    console.error(`  (entrer : la demande de code a répondu ${r.status} ${await r.text()})`);
    return null;
  }
  const lettre = await attendreUneLettre(portNuage, courriel, avant);
  if (!lettre?.code) {
    console.error(`  (entrer : aucune lettre n'est arrivée pour ${courriel})`);
    return null;
  }
  const s = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": adresseNeuve() },
    body: JSON.stringify({ courriel, code: lettre.code }),
  });
  if (!s.ok) {
    console.error(`  (entrer : le code a été refusé — ${s.status} ${await s.text()})`);
    return null;
  }
  return (await s.json()).jeton ?? null;
}
