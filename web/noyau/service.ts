// LE SERVICE D'UNE CARTE — a-t-elle son réseau ? Miroir de totem/service.py.
//
// « Check balance » répondait « no network service » pendant que l'écran
// montrait des BARRES : la force du signal mesure l'antenne, pas
// l'inscription. Le boîtier lit maintenant l'inscription de chaque carte et
// la porte dans son signe de vie (`terminaux.sante.cartes[iccid]`) ; ce
// fichier la lit, et décide ce que l'écran en dit — le même pour le
// téléphone et pour le site.
//
// « Pas de réseau » veut déjà dire « le TÉLÉPHONE n'a pas Internet »
// (`textes/charpente.ts`). La carte dit donc « Aucun service », comme la
// barre d'état d'un téléphone : un objet, un nom.

export type EtatService =
  | "inscrite" | "itinerance" | "sms_seulement"
  | "limitee" | "recherche" | "refusee" | "aucun";

const ETATS: ReadonlySet<string> = new Set([
  "inscrite", "itinerance", "sms_seulement", "limitee", "recherche", "refusee", "aucun",
]);

/** Ni opération, ni SMS d'encaissement. « SMS seulement » n'en est pas :
 *  les encaissements arrivent, et dire le contraire serait faux. */
export const SANS_SERVICE: ReadonlySet<EtatService> = new Set<EtatService>([
  "limitee", "recherche", "refusee", "aucun",
]);

/** Ce que la plateforme montre d'une carte. `depuisLe` est daté sur
 *  l'horloge de la BASE (le Pi n'a pas d'horloge fiable) ; `fige` : le
 *  boîtier de la carte se tait, ce qu'on sait est le dernier état connu. */
export type ServiceDeLaCarte = {
  etat: EtatService;
  depuisLe: string | null;
  coupures24h: number;
  sansService24hS: number;
  fige: boolean;
};

const nombre = (x: unknown): number | null =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;

/** Lit ce que le boîtier a publié pour une carte. Tout ce qui n'a pas la
 *  forme attendue rend `null` — et l'écran garde ses barres, comme avant. */
export function serviceLu(brut: unknown): {
  etat: EtatService; depuis_s: number | null; coupures_24h: number; sans_service_24h_s: number;
} | null {
  if (!brut || typeof brut !== "object") return null;
  const b = brut as Record<string, unknown>;
  if (typeof b.etat !== "string" || !ETATS.has(b.etat)) return null;
  return {
    etat: b.etat as EtatService,
    depuis_s: nombre(b.depuis_s),
    coupures_24h: Math.round(nombre(b.coupures_24h) ?? 0),
    sans_service_24h_s: Math.round(nombre(b.sans_service_24h_s) ?? 0),
  };
}

/** L'instant `iso` moins `secondes`, ou null si l'un manque. */
export function instantMoins(iso: string | null | undefined, secondes: number | null): string | null {
  if (!iso || secondes == null) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t - secondes * 1000).toISOString() : null;
}

/** Ce que la plateforme attache à une carte, ou `undefined` quand il n'y a
 *  rien à dire (une carte inscrite qui ne s'est pas coupée de la journée) :
 *  la réponse ne grossit pas pour rien. */
export function serviceDeLaCarte(brut: unknown, entenduLe: string | null, fige: boolean): ServiceDeLaCarte | undefined {
  const lu = serviceLu(brut);
  if (!lu) return undefined;
  const aDire = SANS_SERVICE.has(lu.etat) || lu.etat === "sms_seulement" || lu.coupures_24h > 0;
  if (!aDire) return undefined;
  return {
    etat: lu.etat,
    depuisLe: instantMoins(entenduLe, lu.depuis_s),
    coupures24h: lu.coupures_24h,
    sansService24hS: lu.sans_service_24h_s,
    fige,
  };
}

/** La carte est-elle sans service, à DIRE sur sa face ? Pas quand son
 *  boîtier se tait : c'est le boîtier qu'on signale alors (« Terminal hors
 *  ligne »), une alarme par écran — le boîtier avant la carte. */
export function carteSansService(sim: { service?: ServiceDeLaCarte }): boolean {
  const s = sim.service;
  return !!s && !s.fige && SANS_SERVICE.has(s.etat);
}

/** Une carte qui se coupe souvent : trois coupures ou plus en 24 h. Elle a
 *  peut-être son réseau à cet instant — c'est le motif qu'on veut voir. */
export function carteInstable(sim: { service?: ServiceDeLaCarte }): boolean {
  return (sim.service?.coupures24h ?? 0) >= 3;
}
