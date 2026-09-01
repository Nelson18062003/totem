// Écran 1 · LA FLOTTE — tous les boîtiers d'un coup d'œil, et lesquels vont mal.
//
// CE QUE CET ÉCRAN DÉCIDE
// L'ordre. Il ne se trie ni par nom, ni par ville, ni par date d'installation :
// il se trie par ce qui va mal (`parUrgence`, dans lib/console.ts). Un boîtier
// muet depuis six heures rangé alphabétiquement entre deux machines saines
// n'est pas affiché — il est caché, et un écran de supervision qui cache ment.
//
// CE QU'IL REFUSE D'AFFICHER
// Un zéro à la place d'une absence. Quand il n'y a aucune alerte au registre,
// la mesure écrit la phrase et pas « 0 » : la table des alertes peut être vide
// parce que tout va bien, ou parce que personne n'y écrit encore. Les deux ne
// se ressemblent pas, et un chiffre les confondrait.

import Link from "next/link";
import { exigerPouvoir } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerFlotte } from "@/lib/console";
import { textesConsole } from "@noyau/textes/console";
import {
  CadreConsole, Cellule, EnTete, Etiquette, EtatDeVie, Mesure, NomDeCommerce,
  Panneau, Pastille, RienADire, TableauQuiDefile, VersLaFiche,
} from "./gabarit";

export const dynamic = "force-dynamic";

export default async function Flotte() {
  // La garde AVANT toute lecture. Une lecture faite d'abord a déjà fuité.
  await exigerPouvoir("administrer");
  const langue = await langueServeur();
  const t = textesConsole[langue];
  const flotte = await chargerFlotte(langue);

  const enService = flotte.terminaux.filter((x) => x.vivacite !== "retire");
  const retires = flotte.terminaux.filter((x) => x.vivacite === "retire");
  const inquiets = flotte.muets + flotte.jamaisVus;

  // Un compte de mauvaises nouvelles vaut zéro de deux façons : « rien de
  // mauvais » et « personne n'écrit ici ». On n'affiche donc jamais le zéro,
  // seulement la phrase qui dit laquelle des deux.
  const compteOuPhrase = (n: number) => (n > 0 ? String(n) : "—");

  return (
    <CadreConsole
      actif="flotte"
      langue={langue}
      titre={t.flotte.titre}
      ariane={
        flotte.terminaux.length > 0
          ? t.flotte.ariane(flotte.enService, flotte.commercesServis)
          : undefined
      }
    >
      {!flotte.relie ? (
        <RienADire titre={t.pasDeBaseTitre} detail={t.pasDeBaseDetail} ton="alerte" />
      ) : flotte.terminaux.length === 0 ? (
        <RienADire titre={t.flotte.videTitre} detail={t.flotte.videDetail} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Mesure
              libelle={t.flotte.mesureEnService}
              valeur={String(flotte.enService)}
            />
            <Mesure
              libelle={t.flotte.mesureMuets}
              valeur={compteOuPhrase(inquiets)}
              note={inquiets === 0 ? t.flotte.mesureMuetsCalme : undefined}
              ton={inquiets > 0 ? "negatif" : "neutre"}
            />
            <Mesure
              libelle={t.flotte.mesureAlertes}
              valeur={compteOuPhrase(flotte.alertesOuvertes)}
              note={flotte.alertesOuvertes === 0 ? t.flotte.mesureAlertesCalme : undefined}
              ton={flotte.alertesOuvertes > 0 ? "attention" : "neutre"}
            />
            <Mesure
              libelle={t.flotte.mesureVersions}
              valeur={
                flotte.versions.length === 1
                  ? flotte.versions[0].version
                  : compteOuPhrase(flotte.versions.length)
              }
              note={
                flotte.versions.length === 0
                  ? t.flotte.versionAucune
                  : flotte.versions.length === 1
                    ? t.flotte.versionUnique(
                        `${flotte.versions[0].combien}/${flotte.enService}`)
                    : t.flotte.versionMelange(flotte.versions.length)
              }
              ton={flotte.versions.length > 1 ? "attention" : "neutre"}
            />
          </div>

          {flotte.alertesOuvertes > 0 && (
            <Panneau titre={t.nav.alertes}>
              <ul className="divide-hair">
                {flotte.terminaux
                  .flatMap((x) => x.alertes.map((a) => ({ a, boitier: x })))
                  .map(({ a, boitier }) => (
                    <li key={a.id} className="flex gap-3 px-4 py-3">
                      <span className="mt-1.5">
                        <Pastille ton={a.gravite === "grave" ? "negatif" : "attention"} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-small font-medium">{a.titre}</p>
                        {a.detail && (
                          <p className="mt-0.5 text-caption leading-relaxed text-ink-soft">
                            {a.detail}
                          </p>
                        )}
                        {/* À qui c'est. Une alerte sans propriétaire nommé
                            oblige à ouvrir une autre page pour savoir qui
                            appeler — et c'est le moment où on n'a pas le
                            temps. */}
                        <p className="mt-1 text-caption tabnums text-ink-faint">
                          {a.commerceNom
                            ? `${t.chez(a.commerceNom)} · `
                            : boitier.commerces.length > 0
                              ? `${t.chez(boitier.commerces.join(" · "))} · `
                              : flotte.proprietesConnues
                                ? `${t.sansCommerce} · `
                                : ""}
                          {boitier.nom} · {a.depuis}
                        </p>
                      </div>
                      <Etiquette ton={a.gravite === "grave" ? "negatif" : "attention"}>
                        {t.gravite[a.gravite]}
                      </Etiquette>
                    </li>
                  ))}
              </ul>
            </Panneau>
          )}

          <Panneau titre={t.flotte.titre} pied={t.flotte.triExplique}>
            <TableauQuiDefile>
              <thead>
                <tr>
                  <EnTete>{t.flotte.colonneTerminal}</EnTete>
                  <EnTete>{t.flotte.colonneCommerce}</EnTete>
                  <EnTete>{t.flotte.colonneEtat}</EnTete>
                  <EnTete>{t.flotte.colonneCartes}</EnTete>
                  <EnTete>{t.flotte.colonneVersion}</EnTete>
                  <EnTete nombre>{t.flotte.colonneNouvelle}</EnTete>
                  <EnTete nombre><span className="sr-only">{t.voir}</span></EnTete>
                </tr>
              </thead>
              <tbody>
                {enService.map((x) => (
                  <tr key={x.id} className="transition hover:bg-surface-2">
                    <Cellule>
                      <Link
                        href={`/console/terminal/${encodeURIComponent(x.id)}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {x.nom}
                      </Link>
                      {x.lieu && (
                        <span className="block text-caption text-ink-faint">{x.lieu}</span>
                      )}
                    </Cellule>
                    <Cellule>
                      <NomDeCommerce noms={x.commerces} langue={langue}
                        connu={flotte.proprietesConnues} />
                    </Cellule>
                    <Cellule>
                      <EtatDeVie vivacite={x.vivacite} depuis={x.depuis} langue={langue} />
                    </Cellule>
                    <Cellule>
                      {x.cartesConnues === 0 ? (
                        <span className="text-ink-faint">{t.flotte.aucuneCarte}</span>
                      ) : x.vivacite === "muet" || x.vivacite === "jamais" ? (
                        // On ne sait pas : c'est le boîtier qui voit les puces.
                        <span className="text-alert">{t.flotte.cartesInconnues}</span>
                      ) : (
                        <span className="tabnums">
                          {t.flotte.cartesPosees(x.cartesEnPlace, x.cartesConnues)}
                        </span>
                      )}
                    </Cellule>
                    <Cellule>
                      {x.version ? (
                        <Etiquette>{x.version}</Etiquette>
                      ) : (
                        <span className="text-ink-faint">{t.flotte.versionMuette}</span>
                      )}
                    </Cellule>
                    <Cellule nombre pale>{x.depuis}</Cellule>
                    <Cellule nombre>
                      <VersLaFiche
                        href={`/console/terminal/${encodeURIComponent(x.id)}`}
                        libelle={`${t.voir} — ${x.nom}`}
                      />
                    </Cellule>
                  </tr>
                ))}
              </tbody>
            </TableauQuiDefile>
          </Panneau>

          {/* Ce que les boîtiers disent d'eux-mêmes, en toutes lettres. Aucune
              jauge, aucun pourcentage : le robot n'envoie qu'une phrase, et
              dessiner une barre sur une phrase serait la fabriquer. */}
          <Panneau titre={t.flotte.santeTitre}>
            <ul className="divide-hair">
              {enService.map((x) => (
                <li key={x.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                  <span className="text-small font-medium">{x.nom}</span>
                  <span className="min-w-0 flex-1 text-caption leading-relaxed tabnums text-ink-soft">
                    {x.sante || (
                      <span className="text-ink-faint">{t.flotte.santeMuette}</span>
                    )}
                  </span>
                  {x.enAttente != null && x.enAttente > 0 && (
                    <Etiquette ton="attention">{t.flotte.enAttente(x.enAttente)}</Etiquette>
                  )}
                </li>
              ))}
            </ul>
          </Panneau>

          {retires.length > 0 && (
            <Panneau titre={t.flotte.retiresTitre} pied={t.flotte.retiresDetail}>
              <ul className="divide-hair">
                {retires.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                    <Link
                      href={`/console/terminal/${encodeURIComponent(x.id)}`}
                      className="text-small font-medium underline-offset-4 hover:underline"
                    >
                      {x.nom}
                    </Link>
                    <span className="text-caption text-ink-faint">
                      <NomDeCommerce noms={x.commerces} langue={langue}
                        connu={flotte.proprietesConnues} />
                    </span>
                    <span className="ml-auto text-caption tabnums text-ink-faint">
                      {x.retireMotif || t.etatDetail.retire}
                    </span>
                  </li>
                ))}
              </ul>
            </Panneau>
          )}
        </>
      )}
    </CadreConsole>
  );
}
