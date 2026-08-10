// Écran 4 · LES CLIENTS — les commerces, leur état, qui les tient.
//
// L'ORDRE, ENCORE, EST LA DÉCISION
// Un litige d'abord, une succession ensuite, puis les boutiques que plus aucun
// propriétaire vivant ne tient. Cette dernière situation n'alerte personne
// aujourd'hui et ne se voit nulle part : plus rien ne peut sortir, plus aucune
// clé ne peut être remise, et le commerçant s'en aperçoit le jour où il en a
// besoin. Elle remonte donc en tête, comme un boîtier muet.
//
// CE QUE CET ÉCRAN NE MONTRE PAS
// Aucun solde, aucun montant. Ce n'est pas une page de comptabilité : c'est la
// page des gens et de leurs clés. Mêler l'argent de quatre commerces sur un
// même écran de gestion des accès, c'est exactement la confusion qu'on veut
// éviter — les soldes vivent sur l'écran des cartes, une caisse à la fois.

import { exigerPouvoir } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerClients, dateLisible } from "@/lib/console";
import { textesConsole } from "@/lib/textes/console";
import {
  CadreConsole, Cellule, EnTete, Etiquette, Mesure, Panneau, Pastille,
  RienADire, TableauQuiDefile,
} from "../gabarit";

export const dynamic = "force-dynamic";

const TON_ETAT = {
  ouvert: "positif",
  succession: "attention",
  litige: "negatif",
  ferme: "neutre",
} as const;

export default async function Clients() {
  await exigerPouvoir("administrer");
  const langue = await langueServeur();
  const t = textesConsole[langue];
  const clients = await chargerClients(langue);

  const gens = new Set<number>();
  for (const c of clients.commerces) {
    for (const g of c.gens) if (!g.retireLe) gens.add(g.personne);
  }
  const compteOuPhrase = (n: number) => (n > 0 ? String(n) : "—");

  return (
    <CadreConsole
      actif="clients"
      langue={langue}
      titre={t.clients.titre}
      ariane={
        clients.commerces.length > 0
          ? t.clients.ariane(clients.commerces.length, gens.size)
          : undefined
      }
    >
      {!clients.relie ? (
        <RienADire titre={t.pasDeBaseTitre} detail={t.pasDeBaseDetail} ton="alerte" />
      ) : clients.commerces.length === 0 ? (
        <RienADire titre={t.clients.videTitre} detail={t.clients.videDetail} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Mesure
              libelle={t.clients.mesureCommerces}
              valeur={String(clients.commerces.length)}
            />
            <Mesure
              libelle={t.clients.mesureGeles}
              valeur={compteOuPhrase(clients.gele)}
              note={clients.gele === 0 ? t.clients.mesureGelesCalme : undefined}
              ton={clients.gele > 0 ? "attention" : "neutre"}
            />
            <Mesure
              libelle={t.clients.mesureSansProprietaire}
              valeur={compteOuPhrase(clients.sansProprietaire)}
              ton={clients.sansProprietaire > 0 ? "negatif" : "neutre"}
            />
            <Mesure libelle={t.clients.mesureGens} valeur={String(gens.size)} />
          </div>

          {clients.commerces.map((c) => {
            const etat = (c.etat in TON_ETAT ? c.etat : "ouvert") as keyof typeof TON_ETAT;
            return (
              <Panneau
                key={c.id}
                titre={c.nom}
                note={
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {c.ville && <span>{c.ville}</span>}
                    <Etiquette ton={TON_ETAT[etat]}>{t.clients.etatCommerce[etat]}</Etiquette>
                    {c.etatDepuis && etat !== "ouvert" && (
                      <span className="tabnums">
                        {t.clients.depuis(dateLisible(c.etatDepuis, langue))}
                      </span>
                    )}
                  </span>
                }
                pied={
                  <>
                    {t.clients.etatDetail[etat]}
                    {c.etatMotif ? ` — ${c.etatMotif}` : ""}
                    {" · "}
                    {t.clients.terminaux}
                    {" : "}
                    <span className="tabnums">
                      {c.terminaux.length > 0
                        ? c.terminaux.join(", ")
                        : t.clients.aucunTerminal}
                    </span>
                    {" · "}
                    {t.clients.cartes}
                    {" : "}
                    <span className="tabnums">
                      {c.cartes > 0 ? c.cartes : t.clients.aucuneCarte}
                    </span>
                    {" · "}
                    {c.contactSecours
                      ? t.clients.contactSecours(c.contactSecours)
                      : t.clients.contactSecoursAbsent}
                  </>
                }
              >
                {/* Une boutique que plus aucun propriétaire vivant ne tient :
                    rien ne peut en sortir, aucune clé ne peut être remise, et
                    personne ne s'en apercevra tout seul. */}
                {c.etat === "ouvert" && c.proprietaires === 0 && (
                  <div className="border-b border-line p-4">
                    <RienADire
                      titre={t.clients.sansProprietaireTitre}
                      detail={t.clients.sansProprietaireDetail}
                      ton="alerte"
                    />
                  </div>
                )}

                {c.gens.length === 0 ? (
                  <p className="px-4 py-6 text-center text-small text-ink-faint">
                    {t.clients.personneVide}
                  </p>
                ) : (
                  <TableauQuiDefile>
                    <thead>
                      <tr>
                        <EnTete>{t.clients.colonnePersonne}</EnTete>
                        <EnTete>{t.clients.colonneRole}</EnTete>
                        <EnTete>{t.clients.colonneEtat}</EnTete>
                        <EnTete nombre>{t.clients.colonneEntree}</EnTete>
                      </tr>
                    </thead>
                    <tbody>
                      {c.gens.map((g) => (
                        <tr key={`${c.id}-${g.personne}`}>
                          <Cellule pale={Boolean(g.retireLe)}>
                            <span className="font-medium">{g.nom}</span>
                            {/* Le commerce est répété sur la ligne : ce tableau
                                se lit aussi bien à travers quatre panneaux, et
                                une ligne isolée doit rester attribuable. */}
                            <span className="block text-caption text-ink-faint">
                              {t.chez(c.nom)}
                            </span>
                          </Cellule>
                          <Cellule>
                            <Etiquette>
                              {t.clients.role[
                                g.role as keyof typeof t.clients.role] ?? g.role}
                            </Etiquette>
                            {g.retireLe && (
                              <span className="mt-0.5 block text-caption text-ink-faint">
                                {t.clients.accesRetire(dateLisible(g.retireLe, langue))}
                              </span>
                            )}
                          </Cellule>
                          <Cellule>
                            <span className="flex items-center gap-2">
                              <Pastille
                                ton={
                                  g.etat === "actif" && !g.retireLe ? "positif"
                                    : g.etat === "suspendu" ? "attention" : "neutre"
                                }
                              />
                              {t.clients.etatPersonne[
                                g.etat as keyof typeof t.clients.etatPersonne] ?? g.etat}
                            </span>
                          </Cellule>
                          <Cellule nombre pale>
                            {g.vueLe ? g.depuis : t.clients.jamaisEntre}
                          </Cellule>
                        </tr>
                      ))}
                    </tbody>
                  </TableauQuiDefile>
                )}
              </Panneau>
            );
          })}

          {clients.sansAcces.length > 0 && (
            <Panneau titre={t.clients.sansAccesTitre} pied={t.clients.sansAccesDetail}>
              <ul className="divide-hair">
                {clients.sansAcces.map((g) => (
                  <li
                    key={g.personne}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
                  >
                    <span className="text-small font-medium">{g.nom}</span>
                    <span className="text-caption text-ink-faint">
                      {t.clients.etatPersonne[
                        g.etat as keyof typeof t.clients.etatPersonne] ?? g.etat}
                    </span>
                    <span className="ml-auto text-caption tabnums text-ink-faint">
                      {g.vueLe ? g.depuis : t.clients.jamaisEntre}
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
