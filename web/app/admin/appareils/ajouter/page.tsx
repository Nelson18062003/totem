// A5 — AJOUTER UN APPAREIL : le deuxième, celui qui sauve.
//
// CE QUE CET ÉCRAN FAIT, ET QUI LE DISTINGUE DE SON ÉQUIVALENT CLIENT
// Il RÉCLAME. La maquette proposait quatre étapes et un bouton ; l'écran
// commence maintenant par dire ce qui manque, avec la voix (`role="alert"`),
// et il continue de le dire tant que le compte n'y est pas. La différence
// n'est pas cosmétique : un super-administrateur qui n'a qu'un appareil est à
// un accident d'un compte que seul le courriel ouvre — c'est-à-dire le facteur
// que le NIST refuse pour l'authentification hors bande (SP 800-63B-4
// §3.1.3.1). « Vous pouvez ajouter un appareil » laisse ce compte-là exister.
// « Il en manque un » ne le laisse pas.
//
// CE QUE LA MAQUETTE DISAIT ET QUI EST PÉRIMÉ
// Elle décrivait une application d'authentification, un carré à scanner et une
// clé à recopier. TOTEM n'entre ni par une application tierce ni par un SMS :
// le verrouillage du téléphone, le courriel en secours, et le papier
// (`docs/COMMENT-ON-ENTRE.md`). Les quatre étapes restent — elles décrivaient
// bien un escalier — mais elles décrivent maintenant le bon escalier.
//
// RIEN N'EST ENREGISTRÉ AVANT QUE L'APPAREIL AIT CONFIRMÉ. Le bouton vient de
// `app/cle-boutons.tsx` et ne se réécrit pas : il se tait quand le navigateur
// ne sait pas faire, et il ne prend pas un renoncement pour une erreur.

import Link from "next/link";
import { exigerPouvoir } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { proposerUneCle } from "@/lib/cles";
import { textesAdminPorte } from "@/lib/textes/admin-porte";
import {
  appareilsDe, appareilsManquants, CODES_DE_SECOURS, manqueUnAppareil,
} from "@/lib/plateforme";
import { CadreDuCompte, Panneau } from "../../cadre";
import { PoserCetAppareil } from "../../interactifs";

export const dynamic = "force-dynamic";

export default async function AjouterUnAppareil() {
  const moi = await exigerPouvoir("administrer");
  const langue = await langueServeur();
  const t = textesAdminPorte[langue];

  const cles = await appareilsDe(moi.personne);
  const manque = manqueUnAppareil(cles.length);
  // Le refus qui n'est pas négociable : sur un combiné que plusieurs personnes
  // tiennent, une clé n'identifie plus personne. Il est déjà porté par la
  // route ; l'écran le DIT, au lieu de laisser appuyer sur un bouton qui
  // refusera.
  const ici = proposerUneCle(moi.session.partage);

  const etapes = [
    { titre: t.ajouter.pas1, dit: t.ajouter.pas1Dit },
    { titre: t.ajouter.pas2, dit: t.ajouter.pas2Dit },
    { titre: t.ajouter.pas3, dit: t.ajouter.pas3Dit },
    {
      titre: t.ajouter.pas4(CODES_DE_SECOURS),
      dit: t.ajouter.pas4Dit(CODES_DE_SECOURS),
    },
  ];

  return (
    <CadreDuCompte
      langue={langue}
      ici="appareils"
      titre={t.ajouter.titre}
      sous={t.ajouter.sous}
    >
      {/* — La réclamation. Elle passe avant l'escalier. ————————————— */}
      {manque ? (
        <section
          role="alert"
          className="rounded-card border border-negative bg-surface-raised px-4 py-4"
        >
          <p className="text-body font-medium">
            {t.ajouter.manqueTitre(appareilsManquants(cles.length))}
          </p>
          <p className="mt-1.5 text-small leading-relaxed text-ink-soft">
            {cles.length === 0 ? t.ajouter.manqueAucun : t.ajouter.manqueDit}
          </p>
        </section>
      ) : (
        <p role="status" className="text-small leading-relaxed text-ink-soft">
          {t.ajouter.assez(cles.length)}
        </p>
      )}

      {/* — Le geste, tout de suite après. On ne fait pas lire quatre cartes
          à quelqu'un avant de lui donner le bouton. ————————————————— */}
      <Panneau>
        <div className="p-4">
          {ici ? (
            <PoserCetAppareil />
          ) : (
            <p role="alert" className="text-small leading-relaxed text-negative">
              {t.ajouter.partage}
            </p>
          )}
        </div>
      </Panneau>

      {/* — L'escalier, pour qui veut savoir ce qui se passe ————————— */}
      <ol className="flex flex-col gap-3">
        {etapes.map((e, rang) => (
          <li
            key={e.titre}
            className="flex gap-3 rounded-card border border-line bg-surface-raised px-4 py-3.5"
          >
            <span
              aria-hidden
              className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full
                         bg-ink text-caption font-medium text-white tabnums"
            >
              {rang + 1}
            </span>
            <div className="min-w-0">
              <p className="text-body font-medium">{e.titre}</p>
              <p className="mt-1 text-small leading-relaxed text-ink-soft">{e.dit}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/papier"
          className="flex min-h-12 items-center rounded-btn border border-line-control
                     bg-surface-raised px-4 text-body font-medium transition hover:bg-surface-2"
        >
          {t.ajouter.versPapier}
        </Link>
        <Link
          href="/admin/appareils"
          className="flex min-h-12 items-center text-small font-medium text-accent
                     underline underline-offset-4"
        >
          {t.ajouter.versAppareils}
        </Link>
      </div>
    </CadreDuCompte>
  );
}
