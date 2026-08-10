// Écran 6 · LE JOURNAL — qui a fait quoi, quand, depuis où.
//
// LA SEULE QUESTION QUE CET ÉCRAN SERT À POSER
// « Qui a fait sortir cet argent mardi ? » Elle se pose un jour précis, sous
// pression, par quelqu'un qui n'a pas le temps d'apprendre un écran. Tout le
// reste découle de là : trois filtres qui se cumulent — une personne, un
// commerce, un jour — et rien d'autre. Pas de recherche en texte libre : sur un
// registre où les libellés sont fermés, une recherche promet de retrouver un
// mot qui n'y est jamais écrit.
//
// CE QUE CET ÉCRAN NE LIT PAS, ET C'EST LA DÉCISION QUI COMPTE
// « commandes.parametres » et « commandes.resultat ». Le premier porte le code
// composé sur la carte — et, le temps d'une session USSD, le code confidentiel
// du propriétaire. Le second recopie ce que le réseau a répondu, c'est-à-dire
// souvent un menu qui demande justement un code. Ces deux colonnes ne sont pas
// masquées ici : elles ne sont pas demandées à la base (voir lib/journal.ts).
// Une colonne qu'on ne lit pas ne fuit nulle part — ni dans une page, ni dans
// un journal de serveur, ni sur une capture d'écran envoyée par messagerie.
//
// CE QUI RESTE DE TEXTE LIBRE
// Ce qu'un boîtier écrit sur lui-même, et le titre d'une alerte. Les deux
// passent par « sansSecret », qui masque plus que nécessaire — quatre chiffres
// d'affilée deviennent des points. Un montant perdu ici ne coûte rien ; un code
// gardé une seule fois coûte une caisse.

import Link from "next/link";
import { exigerPouvoir } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerJournal } from "@/lib/journal";
import { textesConsole } from "@/lib/textes/console";
import { textesJournal } from "@/lib/textes/journal";
import {
  CadreConsole, Cellule, EnTete, Etiquette, NomDeCommerce, Panneau,
  RienADire, TableauQuiDefile,
} from "../gabarit";

export const dynamic = "force-dynamic";

type Recherche = { qui?: string; commerce?: string; jour?: string };

const TON_ISSUE = {
  faite: "positif",
  refusee: "negatif",
  attente: "attention",
  neutre: "neutre",
} as const;

/**
 * Une rangée de choix. Ce sont des liens, pas un formulaire : la question
 * posée reste dans l'adresse, et une adresse se recopie dans un message à
 * quelqu'un d'autre — c'est exactement ce qu'on fait d'un journal.
 */
function Choix({
  titre,
  options,
  actif,
}: {
  titre: string;
  options: { cle: string; libelle: string; href: string }[];
  actif: string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-caption text-ink-faint">{titre}</p>
      {/* La rangée défile DANS son cadre : sur 390 px, huit noms de personnes
          feraient glisser la page entière. */}
      <div className="-mx-1 mt-1.5 flex gap-2 overflow-x-auto px-1 pb-1">
        {options.map((o) => {
          const ici = o.cle === actif;
          return (
            <Link
              key={o.cle}
              href={o.href}
              aria-current={ici ? "true" : undefined}
              className={`flex min-h-11 shrink-0 items-center rounded-btn border px-3 text-small transition ${
                ici
                  ? "border-line-control bg-surface-2 font-medium text-ink"
                  : "border-line-control text-ink-soft hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {o.libelle}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function JournalDeLaConsole({
  searchParams,
}: {
  searchParams: Promise<Recherche>;
}) {
  // La garde AVANT toute lecture. Une lecture faite d'abord a déjà servi.
  await exigerPouvoir("administrer");
  const langue = await langueServeur();
  const params = await searchParams;
  const tc = textesConsole[langue];
  const t = textesJournal[langue].journal;

  const journal = await chargerJournal(
    {
      personne: params.qui ? Number(params.qui) : null,
      commerce: params.commerce ?? null,
      jour: params.jour ?? null,
    },
    langue,
  );

  // L'adresse porte la question : changer un filtre garde les deux autres.
  const lien = (change: Recherche) => {
    const q = new URLSearchParams();
    const qui = "qui" in change ? change.qui : params.qui;
    const commerce = "commerce" in change ? change.commerce : params.commerce;
    const jour = "jour" in change ? change.jour : params.jour;
    if (qui) q.set("qui", qui);
    if (commerce) q.set("commerce", commerce);
    if (jour) q.set("jour", jour);
    const suite = q.toString();
    return suite ? `/console/journal?${suite}` : "/console/journal";
  };

  const titreVide = journal.filtreActif ? t.filtreVideTitre : t.videTitre;
  const detailVide = journal.filtreActif ? t.filtreVideDetail : t.videDetail;

  return (
    <CadreConsole
      actif="journal"
      langue={langue}
      titre={t.titre}
      ariane={
        journal.lignes.length > 0
          ? [t.ariane(journal.lignes.length), journal.jourLisible]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
    >
      {!journal.relie ? (
        <RienADire titre={tc.pasDeBaseTitre} detail={tc.pasDeBaseDetail} ton="alerte" />
      ) : (
        <>
          <Panneau
            titre={t.quiTitre}
            note={journal.filtreActif ? undefined : t.filtreExplique}
            pied={journal.filtreActif ? t.filtreExplique : undefined}
          >
            <div className="divide-hair">
              <Choix
                titre={t.quiTitre}
                actif={journal.filtre.personne ? String(journal.filtre.personne) : ""}
                options={[
                  { cle: "", libelle: t.quiTous, href: lien({ qui: undefined }) },
                  ...journal.gens.slice(0, 12).map((p) => ({
                    cle: String(p.id),
                    libelle: p.nom,
                    href: lien({ qui: String(p.id) }),
                  })),
                ]}
              />
              <Choix
                titre={t.commerceTitre}
                actif={journal.filtre.commerce ?? ""}
                options={[
                  { cle: "", libelle: t.commerceTous, href: lien({ commerce: undefined }) },
                  ...journal.commerces.map((c) => ({
                    cle: c.id,
                    libelle: c.nom,
                    href: lien({ commerce: c.id }),
                  })),
                ]}
              />
              <Choix
                titre={t.jourTitre}
                actif={journal.filtre.jour ?? ""}
                options={[
                  { cle: "", libelle: t.jourTous, href: lien({ jour: undefined }) },
                  ...journal.jours.map((j) => ({
                    cle: j,
                    libelle: j,
                    href: lien({ jour: j }),
                  })),
                ]}
              />
              {journal.filtreActif && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <Link
                    href="/console/journal"
                    className="flex min-h-11 items-center rounded-btn border border-line-control px-3 text-small text-ink-soft transition hover:bg-surface-2 hover:text-ink"
                  >
                    {t.effacerFiltres}
                  </Link>
                  {journal.boitiersEcartes && (
                    <span className="min-w-0 flex-1 text-caption leading-relaxed text-ink-faint">
                      {t.boitiersEcartes}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Panneau>

          {journal.lignes.length === 0 ? (
            <RienADire titre={titreVide} detail={detailVide} />
          ) : (
            <Panneau titre={t.titre} pied={t.plafond(journal.plafond)}>
              {/* Grand écran : un tableau, parce que la question se lit en
                  colonnes. Téléphone : les mêmes quatre choses empilées — un
                  tableau de cinq colonnes ne tient pas sur 390 px, et c'est
                  toujours la première qu'on perd en glissant. */}
              <div className="hidden md:block">
                <TableauQuiDefile>
                  <thead>
                    <tr>
                      <EnTete>{t.colonneQuand}</EnTete>
                      <EnTete>{t.colonneQui}</EnTete>
                      <EnTete>{t.colonneQuoi}</EnTete>
                      <EnTete>{t.colonneCommerce}</EnTete>
                      <EnTete nombre>{t.colonneIssue}</EnTete>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.lignes.map((l) => (
                      <tr key={l.cle}>
                        <Cellule pale>
                          <span className="whitespace-nowrap tabnums">{l.quand}</span>
                          <span className="block text-caption text-ink-faint">
                            {t.source[l.source]}
                          </span>
                        </Cellule>
                        <Cellule>
                          {l.quiNom ? (
                            <span className="font-medium">{l.quiNom}</span>
                          ) : (
                            <span className="text-ink-faint">{t.sansPersonne}</span>
                          )}
                        </Cellule>
                        <Cellule>
                          <span className="font-medium">{t.geste[l.geste]}</span>
                          {(l.terminal || l.precision) && (
                            <span className="mt-0.5 block text-caption leading-relaxed text-ink-soft">
                              {[l.terminal, l.precision].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </Cellule>
                        <Cellule>
                          <NomDeCommerce
                            noms={l.commerceNom ? [l.commerceNom] : []}
                            langue={langue}
                          />
                        </Cellule>
                        <Cellule nombre>
                          {l.issue === "neutre" ? (
                            <span className="text-ink-faint">{t.issue.neutre}</span>
                          ) : (
                            <Etiquette ton={TON_ISSUE[l.issue]}>
                              {t.issue[l.issue]}
                            </Etiquette>
                          )}
                        </Cellule>
                      </tr>
                    ))}
                  </tbody>
                </TableauQuiDefile>
              </div>

              <ul className="divide-hair md:hidden">
                {journal.lignes.map((l) => (
                  <li key={l.cle} className="flex flex-col gap-1.5 px-4 py-3.5">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-small font-medium">{t.geste[l.geste]}</span>
                      <span className="text-caption tabnums text-ink-faint">{l.quand}</span>
                    </span>
                    <span className="text-caption text-ink-soft">
                      {l.quiNom || t.sansPersonne}
                      {l.terminal && ` · ${l.terminal}`}
                    </span>
                    {l.precision && (
                      <span className="text-caption leading-relaxed text-ink-soft">
                        {l.precision}
                      </span>
                    )}
                    <span className="flex flex-wrap items-center gap-2 text-caption">
                      <NomDeCommerce
                        noms={l.commerceNom ? [l.commerceNom] : []}
                        langue={langue}
                      />
                      {l.issue !== "neutre" && (
                        <Etiquette ton={TON_ISSUE[l.issue]}>{t.issue[l.issue]}</Etiquette>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Panneau>
          )}

          {/* La promesse est ici en toutes lettres, sous le tableau : celui qui
              cherche un code dans ce journal doit lire pourquoi il n'en
              trouvera jamais. */}
          <Panneau>
            <p className="px-4 py-3 text-caption leading-relaxed text-ink-soft">
              {t.sansSecret}
            </p>
          </Panneau>
        </>
      )}
    </CadreConsole>
  );
}
