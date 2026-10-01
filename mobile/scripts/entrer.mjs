// ENTRER PAR CODE, comme une personne le fait — pour les harnais du téléphone.
//
// On n'entre plus par mot de passe : on tape son courriel, un code part dans
// une boîte, on tape le code. Les harnais font EXACTEMENT ce chemin, à
// l'écran : ils remplissent le courriel, appuient sur « Recevoir un code »,
// vont lire la lettre dans la boîte du faux nuage (qui joue aussi le service
// de courrier, voir web/scripts/faux-nuage.mjs) et tapent le code. Aucune
// porte dérobée : un harnais qui entrerait par là prouverait seulement que la
// porte dérobée marche.
//
// LA CHAÎNE (voir l'en-tête de verifier-l-attente.mjs) lance la plateforme
// avec le courrier branché sur le faux nuage :
//
//   COURRIER_CLE=re_essai COURRIER_URL=http://127.0.0.1:4999
//
// Sans ces deux réglages, la plateforme refuse d'envoyer un code — c'est
// voulu — et ces fonctions le disent au lieu d'attendre une lettre qui ne
// viendra jamais.

import { setTimeout as attendre } from "node:timers/promises";

export const PLATEFORME = "http://127.0.0.1:3120";
export const NUAGE = "http://127.0.0.1:4999";

async function lettres(courriel, nuage) {
  const r = await fetch(`${nuage}/essai/courrier?a=${encodeURIComponent(courriel)}`);
  return r.json();
}

/** Attend une lettre de PLUS que `avant` : elle part APRÈS la réponse de la
 *  plateforme (qui ne doit rien dire de qui a un compte). On attend un ÉTAT,
 *  jamais une durée. */
async function attendreLeCode(courriel, avant, nuage) {
  for (let i = 0; i < 80; i++) {
    const b = await lettres(courriel, nuage);
    if (b.nombre > avant && b.code) return b.code;
    await attendre(100);
  }
  return null;
}

/** Un code frais pour ce courriel, demandé par la porte ordinaire. */
export async function codePour(courriel, { base = PLATEFORME, nuage = NUAGE } = {}) {
  // Comme si le code précédent avait une heure : sans cela, la base refuse à
  // bon droit un second code dans la minute.
  await fetch(`${nuage}/essai/vieillir-les-codes`, { method: "POST" });
  const avant = (await lettres(courriel, nuage)).nombre;
  const r = await fetch(`${base}/api/code`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel }),
  });
  if (!r.ok) throw new Error(`la demande de code a répondu ${r.status} : ${await r.text()}`);
  const code = await attendreLeCode(courriel, avant, nuage);
  if (!code) throw new Error(`aucune lettre n'est arrivée pour ${courriel}`);
  return code;
}

/** Entre par la porte du NAVIGATEUR et rend la réponse (son cookie). */
export async function connexionPour(courriel, options = {}) {
  const code = await codePour(courriel, options);
  return fetch(`${options.base ?? PLATEFORME}/api/connexion`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel, code }),
  });
}

/**
 * Le compte du propriétaire existe-t-il, et est-ce bien CE courriel ?
 *
 * Sur un faux nuage neuf, l'inscription le crée. Si les inscriptions sont
 * fermées, il faut prouver que c'est par CE compte — sinon le harnais
 * annoncerait « l'écran ne montre rien » alors qu'on est simplement resté
 * devant la porte. On le prouve en entrant pour de bon.
 */
export async function preparerLeProprietaire(courriel, options = {}) {
  const base = options.base ?? PLATEFORME;
  const r = await fetch(`${base}/api/inscription`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel }),
  });
  if (r.ok) return;
  if (r.status === 503) {
    throw new Error("la plateforme ne peut pas envoyer de code : lancez-la avec "
      + "COURRIER_CLE et COURRIER_URL (voir l'en-tête de entrer.mjs)");
  }
  const porte = await connexionPour(courriel, options).catch(() => null);
  if (!porte?.ok) {
    throw new Error("les inscriptions sont fermées par un AUTRE compte : un autre "
      + "harnais a déjà utilisé ce faux nuage. Redémarrez-le, puis relancez.");
  }
}

/** Le bouton qui envoie le code, et celui qui entre — dans les deux langues. */
export const BOUTON_CODE = /^Receive a code$|^Recevoir un code$/;
export const BOUTON_ENTRER = /^Sign in$|^Se connecter$/;

/** Le champ du code, tel que l'écran le pose. */
export const champDuCode = (page) => page.locator('input[inputmode="numeric"]').first();

/**
 * Remplit l'écran de connexion de l'application jusqu'au code, SANS appuyer
 * sur « Se connecter » — pour qui veut sonder ce bouton avant de le presser.
 */
export async function remplirJusquAuCode(page, courriel, { nuage = NUAGE } = {}) {
  await fetch(`${nuage}/essai/vieillir-les-codes`, { method: "POST" });
  const avant = (await lettres(courriel, nuage)).nombre;
  await page.locator('input[type="email"]').first().fill(courriel);
  await page.getByText(BOUTON_CODE).last().click();
  const code = await attendreLeCode(courriel, avant, nuage);
  if (!code) throw new Error(`aucune lettre n'est arrivée pour ${courriel}`);
  await champDuCode(page).waitFor({ state: "visible", timeout: 15000 });
  await champDuCode(page).fill(code);
}

/** Entre dans l'application, à l'écran, comme une personne. */
export async function entrerDansLApercu(page, courriel, options = {}) {
  await remplirJusquAuCode(page, courriel, options);
  await page.getByText(BOUTON_ENTRER).last().click();
}
