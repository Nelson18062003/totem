// A3 — QUI A LE DROIT D'ADMINISTRER LA PLATEFORME.
//
// CE QUE CET ÉCRAN EST VRAIMENT
// Un registre, pas un formulaire. Il répond à une question qu'on ne se pose
// qu'une fois, tard, et toujours dans le mauvais sens : « qui a eu accès à
// cette console, et qui le lui a donné ? » Il montre donc TOUT — les demandes
// en attente, les droits en cours, les refus et les reprises. Une liste qui ne
// montrerait que les droits vivants ne répondrait pas à cette question-là.
//
// LA GARDE EST « PRÉSENCE », PAS « ADMINISTRER », ET C'EST DÉLIBÉRÉ
// Demander l'accès est le geste de quelqu'un qui ne l'a justement pas.
// Exiger d'être administrateur pour demander à le devenir serait un cercle.
// Ce que la page montre, en revanche, dépend entièrement de ce qu'on est : un
// non-administrateur voit un champ de texte et sa propre demande, jamais la
// liste des autres — cette liste dit qui tient les clés de la flotte, et c'est
// exactement ce qu'on ne publie pas.
//
// LE REFUS EST SERVEUR. Les boutons « accorder » et « reprendre » ne
// s'affichent que pour un administrateur, mais ce n'est pas ce qui protège :
// la route relit le droit en base à chaque appel. Un bouton absent se
// contourne depuis la console du navigateur ; une route qui refuse tient.

import { exigerPresence } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { momentLisible } from "@/lib/console";
import { lireUne } from "@/lib/base";
import { textesAdminPorte } from "@/lib/textes/admin-porte";
import {
  dossierDe, estAdministrateur, listerLesDossiers,
  MINIMUM_APPAREILS, type LignePersonne,
} from "@/lib/plateforme";
import { CadreDuCompte, Panneau, RienADire } from "../cadre";
import { DemanderLaPlateforme, GestesDuDossier } from "../interactifs";

export const dynamic = "force-dynamic";

/** Où en est un dossier. Quatre états, et l'ordre de lecture est le bon. */
function etatDuDossier(d: {
  accorde_le: string | null; refuse_le: string | null; retire_le: string | null;
}): "attente" | "accorde" | "refuse" | "retire" {
  if (d.retire_le) return "retire";
  if (d.refuse_le) return "refuse";
  if (d.accorde_le) return "accorde";
  return "attente";
}

export default async function Application() {
  const moi = await exigerPresence();
  const langue = await langueServeur();
  const t = textesAdminPorte[langue];

  const compte = await lireUne<LignePersonne>(
    `personnes?id=eq.${moi.personne}&select=id,nom,courriel,etat,langue&limit=1`);
  const admin = compte ? await estAdministrateur(compte) : false;

  // --- Ce que voit quelqu'un qui n'administre pas --------------------------
  if (!admin) {
    const mien = await dossierDe(moi.personne);
    const etat = mien ? etatDuDossier(mien) : null;
    return (
      <CadreDuCompte
        langue={langue}
        ici="application"
        titre={t.application.titre}
        sous={t.application.sous}
        nav={false}
      >
        <Panneau titre={t.application.demanderTitre}>
          <div className="p-4">
            {etat === "attente" ? (
              <p role="status" className="text-small leading-relaxed text-ink-soft">
                {t.application.deja}
              </p>
            ) : (
              <DemanderLaPlateforme />
            )}
          </div>
        </Panneau>
      </CadreDuCompte>
    );
  }

  // --- Le registre, pour qui administre ------------------------------------
  const dossiers = await listerLesDossiers();

  return (
    <CadreDuCompte
      langue={langue}
      ici="application"
      titre={t.application.titre}
      sous={t.application.sous}
    >
      <p role="status" className="text-small leading-relaxed text-ink-soft">
        {t.application.vous}
      </p>

      <Panneau titre={t.application.titre}>
        {dossiers.length === 0 ? (
          <div className="p-4">
            <RienADire titre={t.application.aucun} detail={t.application.aucunDetail} />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {dossiers.map(({ ligne, personne, appareils }) => {
              const etat = etatDuDossier(ligne);
              const soi = ligne.personne === moi.personne;
              return (
                <li key={ligne.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium">
                      {personne?.nom ?? `#${ligne.personne}`}
                    </p>
                    <p className="mt-0.5 text-caption text-ink-faint">
                      {personne?.courriel ?? ""}
                    </p>
                    <p className="mt-1 text-caption text-ink-soft">
                      {t.application.etat[etat]}
                      {" · "}
                      <span className="tabnums">
                        {momentLisible(ligne.demande_le, langue)}
                      </span>
                    </p>
                    {ligne.demande_motif && (
                      <p className="mt-1 text-small leading-relaxed text-ink-soft">
                        {ligne.demande_motif}
                      </p>
                    )}
                    {ligne.retire_motif && (
                      <p className="mt-1 text-small leading-relaxed text-ink-soft">
                        {ligne.retire_motif}
                      </p>
                    )}
                    {/* Un administrateur sans second appareil est le trou de
                        cette console, et il se voit ICI ou nulle part. */}
                    {etat === "accorde" && appareils < MINIMUM_APPAREILS && (
                      <p role="alert" className="mt-1 text-caption leading-relaxed text-negative">
                        {appareils === 0
                          ? t.application.sansAppareil
                          : t.application.unSeulAppareil}
                      </p>
                    )}
                  </div>
                  {/* Personne ne s'accorde rien à soi-même, et l'écran ne
                      propose donc pas le geste. La route le refuse aussi. */}
                  {!soi && (etat === "attente" || etat === "accorde") && (
                    <GestesDuDossier id={ligne.id} etat={etat} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panneau>
    </CadreDuCompte>
  );
}
