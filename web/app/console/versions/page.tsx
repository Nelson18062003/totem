// Écran 5 · LES VERSIONS — quel boîtier porte quel logiciel, et qui est resté
// en arrière.
//
// CE QUE CET ÉCRAN DÉCIDE
// L'ordre, et il n'est pas alphabétique. Un boîtier privé d'un correctif de
// sécurité passe devant tout ; juste derrière vient celui dont on ne sait plus
// rien. Cette seconde place est le vrai sujet de l'écran : un terminal muet
// continue d'annoncer la version qu'il portait la dernière fois qu'il a parlé,
// et cette valeur vieillit sans jamais changer d'apparence. Rangée sous « à
// jour », elle enverrait quelqu'un se coucher tranquille.
//
// CE QU'IL REFUSE DE FAIRE
// Deviner ce que la flotte devrait porter. Tant que la table « versions » est
// vide, cet écran regroupe les boîtiers par ce qu'ils portent et le dit — il
// n'appelle personne « à jour », parce que comparer les retardataires entre eux
// laisse passer une flotte entière restée deux mois en arrière.
//
// CE QU'IL NE FAIT PAS, ET CE N'EST PAS UN OUBLI
// Il n'envoie rien. La maquette montrait « envoyer la version à la flotte » en
// bouton plein ; sept comptoirs en un appui n'ont pas de deuxième chance, et
// une console qui regarde ne doit pas pouvoir pousser du logiciel. Le geste est
// montré désarmé, avec l'endroit où il se fait vraiment.

import Link from "next/link";
import { exigerPouvoir } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerParcLogiciel, type BoitierEtSonLogiciel } from "@/lib/journal";
import { textesConsole } from "@noyau/textes/console";
import { textesRegistre } from "@noyau/textes/console-registre";
import {
  CadreConsole, Cellule, EnTete, Etiquette, GesteInterdit, Mesure, NomDeCommerce,
  Panneau, Pastille, RienADire, TableauQuiDefile, VersLaFiche,
} from "../gabarit";
import type { Langue } from "@noyau/langue";

export const dynamic = "force-dynamic";

type Ton = "positif" | "attention" | "negatif" | "neutre";

const TON: Record<BoitierEtSonLogiciel["etat"], Ton> = {
  expose_et_muet: "negatif",
  muet: "negatif",
  expose: "negatif",
  hors_registre: "attention",
  jamais_dit: "attention",
  en_retard: "attention",
  a_jour: "positif",
  retire: "neutre",
};

/** Où en est ce boîtier : la pastille, le mot, et la phrase. Les trois. */
function OuIlEnEst({ b, langue }: { b: BoitierEtSonLogiciel; langue: Langue }) {
  const t = textesRegistre[langue].versions;
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2 font-medium">
        <Pastille ton={TON[b.etat]} />
        {t.etat[b.etat]}
      </span>
      <span className="max-w-xs text-caption leading-relaxed text-ink-soft">
        {t.etatDetail[b.etat]}
      </span>
      {b.correctifsManques.length > 0 && (
        <span className="text-caption tabnums text-negative">
          {t.manque(b.correctifsManques.join(" · "))}
        </span>
      )}
    </span>
  );
}

/** Le logiciel annoncé, et ce qu'il change. Vide quand le boîtier s'est tu. */
function LogicielPorte({ b, langue }: { b: BoitierEtSonLogiciel; langue: Langue }) {
  const t = textesRegistre[langue].versions;
  if (!b.version) {
    return <span className="text-ink-faint">{t.versionMuette}</span>;
  }
  return (
    <span className="flex flex-col items-start gap-1">
      <Etiquette ton={TON[b.etat] === "positif" ? "positif" : "neutre"}>
        {b.version}
      </Etiquette>
      {b.resume && (
        <span className="max-w-xs text-caption leading-relaxed text-ink-faint">
          {b.resume}
        </span>
      )}
    </span>
  );
}

export default async function Versions() {
  // La garde AVANT toute lecture. Une lecture faite d'abord a déjà servi.
  await exigerPouvoir("administrer");
  const langue = await langueServeur();
  const tc = textesConsole[langue];
  const t = textesRegistre[langue].versions;
  const parc = await chargerParcLogiciel(langue);

  const enService = parc.boitiers.filter((b) => b.etat !== "retire");

  // Un compte de mauvaises nouvelles vaut zéro de deux façons : « rien de
  // mauvais » et « personne n'écrit ici ». On n'affiche donc jamais le zéro nu.
  const compteOuPhrase = (n: number) => (n > 0 ? String(n) : "—");
  const fiche = (id: string) => `/console/terminal/${encodeURIComponent(id)}`;

  return (
    <CadreConsole
      actif="versions"
      langue={langue}
      titre={t.titre}
      ariane={
        parc.boitiers.length > 0
          ? t.ariane(enService.length, parc.portees.length)
          : undefined
      }
    >
      {!parc.relie ? (
        <RienADire titre={tc.pasDeBaseTitre} detail={tc.pasDeBaseDetail} ton="alerte" />
      ) : parc.boitiers.length === 0 ? (
        <RienADire titre={t.videTitre} detail={t.videDetail} />
      ) : (
        <>
          {/* Le registre vide n'est pas un détail de mise en page : sans lui,
              rien de ce qui suit ne peut être appelé « en retard ». */}
          {parc.registreVide ? (
            <RienADire
              titre={t.registreVideTitre}
              detail={t.registreVideDetail}
              ton="alerte"
            />
          ) : (
            <Panneau titre={t.attendueTitre}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                {parc.attendue ? (
                  <>
                    <Etiquette ton="positif">{parc.attendue}</Etiquette>
                    <span className="text-caption tabnums text-ink-faint">
                      {t.attendueDepuis(parc.attendueDepuis)}
                    </span>
                    {parc.attendueResume && (
                      <span className="w-full text-small leading-relaxed text-ink-soft">
                        {parc.attendueResume}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-small text-alert">{t.attendueAucune}</span>
                )}
              </div>
            </Panneau>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Mesure
              libelle={t.mesureExposes}
              valeur={compteOuPhrase(parc.exposes)}
              note={parc.exposes === 0 ? t.mesureExposesCalme : undefined}
              ton={parc.exposes > 0 ? "negatif" : "neutre"}
            />
            <Mesure
              libelle={t.mesureMuets}
              valeur={compteOuPhrase(parc.muets)}
              note={parc.muets === 0 ? t.mesureMuetsCalme : undefined}
              ton={parc.muets > 0 ? "negatif" : "neutre"}
            />
            <Mesure
              libelle={t.mesureRetard}
              valeur={compteOuPhrase(parc.enRetard)}
              note={parc.enRetard === 0 ? t.mesureRetardCalme : undefined}
              ton={parc.enRetard > 0 ? "attention" : "neutre"}
            />
            <Mesure libelle={t.mesureAJour} valeur={String(parc.aJour)} />
          </div>

          {parc.aLEssai.length > 0 && (
            <Panneau titre={t.essaiTitre} pied={t.essaiDetail}>
              <ul className="divide-hair">
                {parc.aLEssai.map((v) => (
                  <li
                    key={v.version}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
                  >
                    <Etiquette>{v.version}</Etiquette>
                    {v.correctif && (
                      <Etiquette ton="negatif">{t.correctifPastille}</Etiquette>
                    )}
                    <span className="text-caption tabnums text-ink-faint">
                      {t.essaiPubliee(v.publiee)}
                    </span>
                    {v.resume && (
                      <span className="w-full text-caption leading-relaxed text-ink-soft">
                        {v.resume}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Panneau>
          )}

          <Panneau
            titre={t.colonneLogiciel}
            note={parc.registreVide ? t.registreVideNote : undefined}
            pied={t.triExplique}
          >
            {/* Sur grand écran, un tableau. Sur un téléphone de 390 px, la même
                chose en cartes : un tableau de cinq colonnes n'y tient qu'en
                défilant, et la première colonne — le nom du boîtier — est
                justement celle qu'on perd en glissant. */}
            <div className="hidden md:block">
              <TableauQuiDefile>
                <thead>
                  <tr>
                    <EnTete>{t.colonneTerminal}</EnTete>
                    <EnTete>{t.colonneCommerce}</EnTete>
                    <EnTete>{t.colonneLogiciel}</EnTete>
                    <EnTete>{t.colonneEtat}</EnTete>
                    <EnTete nombre>{t.colonneNouvelle}</EnTete>
                    <EnTete nombre><span className="sr-only">{tc.voir}</span></EnTete>
                  </tr>
                </thead>
                <tbody>
                  {parc.boitiers.map((b) => (
                    <tr key={b.id} className="transition hover:bg-surface-2">
                      <Cellule>
                        <Link
                          href={fiche(b.id)}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {b.nom}
                        </Link>
                        {b.lieu && (
                          <span className="block text-caption text-ink-faint">{b.lieu}</span>
                        )}
                      </Cellule>
                      <Cellule>
                        <NomDeCommerce noms={b.commerces} langue={langue}
                          connu={parc.proprietesConnues} />
                      </Cellule>
                      <Cellule>
                        <LogicielPorte b={b} langue={langue} />
                      </Cellule>
                      <Cellule>
                        <OuIlEnEst b={b} langue={langue} />
                      </Cellule>
                      <Cellule nombre pale>{b.depuis}</Cellule>
                      <Cellule nombre>
                        <VersLaFiche href={fiche(b.id)} libelle={`${tc.voir} — ${b.nom}`} />
                      </Cellule>
                    </tr>
                  ))}
                </tbody>
              </TableauQuiDefile>
            </div>

            <ul className="divide-hair md:hidden">
              {parc.boitiers.map((b) => (
                <li key={b.id}>
                  {/* La rangée entière est la cible, et elle dépasse largement
                      les 44 px exigés au doigt. */}
                  <Link
                    href={fiche(b.id)}
                    className="flex flex-col gap-2 px-4 py-3.5 transition hover:bg-surface-2"
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-small font-medium">{b.nom}</span>
                      <span className="text-caption tabnums text-ink-faint">{b.depuis}</span>
                    </span>
                    <span className="text-caption text-ink-soft">
                      <NomDeCommerce noms={b.commerces} langue={langue}
                        connu={parc.proprietesConnues} />
                    </span>
                    <span className="text-small"><LogicielPorte b={b} langue={langue} /></span>
                    <span className="text-small"><OuIlEnEst b={b} langue={langue} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panneau>

          <Panneau titre={t.portees} pied={t.porteesDetail}>
            <ul className="divide-hair">
              {parc.portees.length === 0 ? (
                <li className="px-4 py-3 text-small text-ink-faint">
                  {tc.flotte.versionAucune}
                </li>
              ) : (
                parc.portees.map((v) => (
                  <li
                    key={v.version}
                    className="flex items-baseline justify-between gap-3 px-4 py-3"
                  >
                    <Etiquette>{v.version}</Etiquette>
                    <span className="text-caption tabnums text-ink-soft">
                      {t.porteesCombien(v.combien)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </Panneau>

          {/* Montrés désarmés, pas cachés : celui qui ne trouve pas le geste
              ici le cherchera ailleurs, et l'ailleurs est toujours pire. */}
          <Panneau titre={t.gestesTitre} pied={t.gestesDetail}>
            <div className="px-4 py-2">
              <GesteInterdit quoi={t.gesteEnvoyer} qui={t.gesteEnvoyerQui} />
              <GesteInterdit quoi={t.gesteRevenir} qui={t.gesteRevenirQui} />
            </div>
          </Panneau>
        </>
      )}
    </CadreConsole>
  );
}
