// Les gens du commerce — l'écran où une clé se donne et se reprend.
//
// C'est la première preuve visible que les rôles existent : sans lui, une
// invitation n'a rien changé pour personne, et « retirer l'accès de quelqu'un »
// voulait dire changer le mot de passe de tout le monde.
//
// CE QUE CET ÉCRAN DÉCIDE
//
// · RIEN NE DISPARAÎT. Une personne dont la clé a été reprise reste dans la
//   liste, datée, dans sa propre section. Elle a tenu le comptoir, ses reçus
//   portent son nom, et le jour où il faut relire cette période il faut
//   pouvoir la nommer.
//
// · LA LECTURE SE FAIT ICI, LE GESTE SE FAIT DANS `gestes.tsx`. La page lit,
//   met en forme les dates à l'heure de Douala, et passe des chaînes déjà
//   écrites. Un horodatage formaté dans le navigateur donnerait l'heure du
//   téléphone — et l'argent, lui, vit à Douala.
//
// · AUCUNE JOINTURE. On lit les accès, puis les personnes par leurs numéros.
//   La table « acces » pointe quatre fois vers « personnes » (la personne,
//   celle qui assiste, celle qui invite, celle qui retire) : une jointure
//   automatique n'y saurait pas laquelle prendre, et se casserait un jour sans
//   prévenir. Deux questions simples valent mieux qu'une savante.

import Link from "next/link";
import { lire } from "@/lib/base";
import { clesDe } from "@/lib/cles";
import { exigerPouvoir } from "@/lib/garde";
import { invitationsEnAttente } from "@/lib/invitations";
import { langueServeur } from "@/lib/langue-serveur";
import type { Langue } from "@/lib/langue";
import { sessionsOuvertes } from "@/lib/sessions";
import type { Role } from "@/lib/session";
import { textesGens } from "@/lib/textes/gens";
import { BasculeLangue } from "../langue";
import { Inviter, InvitationEnAttente, Personne, type Attente, type Fiche } from "./gestes";

export const dynamic = "force-dynamic";

const FUSEAU = "Africa/Douala";
const LOCALE: Record<Langue, string> = { en: "en-GB", fr: "fr-FR" };

/** « 4 mars 2026 » — une date qu'on lit, pas un horodatage. */
function jour(ts: string | null, langue: Langue): string {
  if (!ts) return "";
  return new Intl.DateTimeFormat(LOCALE[langue], {
    day: "numeric", month: "long", year: "numeric", timeZone: FUSEAU,
  }).format(new Date(ts));
}

/** « il y a 3 h ». Le même vocabulaire que le reste de la plateforme. */
function ecart(ts: string | null, langue: Langue): string | null {
  if (!ts) return null;
  const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  const forme = (n: number, unite: string) =>
    langue === "en" ? `${n} ${unite} ago` : `il y a ${n} ${unite}`;
  if (s < 60) return forme(s, "s");
  if (s < 3600) return forme(Math.round(s / 60), "min");
  if (s < 86_400) return forme(Math.round(s / 3600), "h");
  return forme(Math.round(s / 86_400), langue === "en" ? "d" : "j");
}

type LigneAcces = {
  personne: number;
  role: Role;
  cree_le: string;
  retire_le: string | null;
};
type LignePersonne = { id: number; nom: string; vue_le: string | null };

export default async function PageGens() {
  // Un opérateur n'invite personne, un lecteur ne fait rien : le pouvoir est
  // demandé ici, et la même demande est refaite par chacune des quatre routes.
  // L'écran qui ne propose pas ne protège rien tout seul — il suffit d'appeler
  // la route à la main depuis la console du navigateur.
  const moi = await exigerPouvoir("gerer_les_gens");
  const langue = await langueServeur();
  const t = textesGens[langue];

  // Une clé se donne POUR un commerce. Sans commerce nommé, la page ne peut
  // rien faire d'honnête — et elle le dit avec le geste suivant, pas avec un
  // formulaire qui échouera.
  if (!moi.commerce) {
    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
          <BasculeLangue />
        </header>
        <section className="rounded-card border border-line bg-surface-raised p-4">
          <h2 className="text-heading font-semibold">{t.sansCommerceTitre}</h2>
          <p className="mt-1.5 text-small leading-relaxed text-ink-soft">{t.sansCommerceDit}</p>
          <Link href="/reglages"
            className="mt-4 flex h-11 w-full items-center justify-center rounded-btn bg-accent px-4 text-body font-medium text-white transition hover:bg-accent-hover">
            {t.versReglages}
          </Link>
        </section>
      </div>
    );
  }

  const acces = await lire<LigneAcces>(
    `acces?commerce=eq.${encodeURIComponent(moi.commerce)}`
    + `&select=personne,role,cree_le,retire_le&order=cree_le.asc`);
  const numeros = [...new Set(acces.map((a) => a.personne))];
  const personnes = numeros.length
    ? await lire<LignePersonne>(
        `personnes?id=in.(${numeros.join(",")})&select=id,nom,vue_le`)
    : [];
  const nomDe = new Map(personnes.map((p) => [p.id, p]));

  // Les appareils et les clés, personne par personne. Une boutique compte
  // quelques personnes : autant de petites questions valent mieux qu'une
  // jointure qu'on ne saurait pas relire.
  const vivants = acces.filter((a) => !a.retire_le);
  const ouvertes = await Promise.all(vivants.map((a) => sessionsOuvertes(a.personne)));
  const cles = await Promise.all(vivants.map((a) => clesDe(a.personne)));

  const fiche = (a: LigneAcces, i: number): Fiche => {
    const p = nomDe.get(a.personne);
    return {
      personne: a.personne,
      nom: p?.nom ?? `#${a.personne}`,
      role: a.role,
      moi: a.personne === moi.personne,
      depuis: jour(a.cree_le, langue),
      retireLe: a.retire_le ? jour(a.retire_le, langue) : null,
      vue: p?.vue_le ? ecart(p.vue_le, langue) : null,
      appareils: a.retire_le ? [] : (ouvertes[i] ?? []).map((s) => ({
        id: s.id,
        nom: s.appareil ?? "—",
        lieu: s.lieu,
        vue: ecart(s.vue_le, langue) ?? "",
        partage: s.partage,
      })),
      cles: a.retire_le ? 0 : (cles[i] ?? []).length,
    };
  };

  const ici = vivants.map(fiche);
  // La propriétaire qui entre par le mot de passe fondateur n'a pas encore de
  // ligne dans « acces ». Sa clé existe pourtant, et une liste où elle ne
  // figure pas se lit comme une liste fausse.
  if (!ici.some((f) => f.moi)) {
    ici.unshift({
      personne: moi.personne, nom: moi.nom, role: moi.role, moi: true,
      depuis: "", retireLe: null, vue: null, appareils: [], cles: 0,
    });
  }
  const partis = acces.filter((a) => a.retire_le).map((a) => fiche(a, -1));

  const invitations = await invitationsEnAttente(moi.commerce);
  const attentes: Attente[] = invitations.map((i) => ({
    id: i.id,
    nom: i.nom,
    role: i.role,
    invitee: ecart(i.creee_le, langue) ?? "",
    ouvertAvant: Boolean(i.premiere_vue_le),
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
          <p className="mt-1 max-w-lg text-small leading-relaxed text-ink-soft">
            {t.sousTitre}
          </p>
        </div>
        <BasculeLangue />
      </header>

      <section className="rounded-card border border-line bg-surface-raised px-4">
        <ul className="divide-hair">
          {ici.map((f) => <Personne key={f.personne} fiche={f} />)}
        </ul>
      </section>

      {ici.length === 1 && attentes.length === 0 && (
        <p className="text-small text-ink-faint">{t.personne}</p>
      )}

      <Inviter />

      {attentes.length > 0 && (
        <section>
          <h2 className="mb-2 text-caption font-semibold uppercase tracking-wider text-ink-faint">
            {t.attenteTitre}
          </h2>
          <div className="rounded-card border border-line bg-surface-raised px-4">
            <ul className="divide-hair">
              {attentes.map((i) => <InvitationEnAttente key={i.id} inv={i} />)}
            </ul>
          </div>
        </section>
      )}

      {/* Rien ne s'efface : ceux qui n'ont plus de clé restent, datés. */}
      {partis.length > 0 && (
        <section>
          <h2 className="mb-2 text-caption font-semibold uppercase tracking-wider text-ink-faint">
            {t.partis}
          </h2>
          <div className="rounded-card border border-line bg-surface-raised px-4">
            <ul className="divide-hair">
              {partis.map((f) => <Personne key={f.personne} fiche={f} />)}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
