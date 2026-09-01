// Écran 2 · UN TERMINAL — sa santé, ses cartes, son journal, ses commandes.
//
// CE QUE CET ÉCRAN NE DESSINE PAS
// Des jauges. Le robot n'envoie pas de chiffres : il envoie une phrase
// (« en marche depuis 31 j 4 h · 48 °C · disque 31 % (9.1 Go libres) »), écrite
// par « totem/sante.py ». Dessiner une barre de progression sur une phrase
// reviendrait à inventer la mesure. On affiche donc la phrase, telle quelle, et
// quand il n'y en a pas on écrit qu'il n'y en a pas.
//
// CE QU'IL MONTRE ET QUI N'EST PAS UN OUBLI
// Trois gestes barrés, en bas : consulter un solde, établir un reçu, faire
// sortir de l'argent. Un administrateur ne peut faire aucun des trois — pas
// même le premier, qui demande le pouvoir « operer » qu'il n'a pas. Les cacher
// pousserait à emprunter le compte du propriétaire ; les montrer désarmés dit à
// qui ils appartiennent (CAS-LIMITES B7).

import Link from "next/link";
import { exigerPouvoir } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerFicheTerminal, dateLisible } from "@/lib/console";
import { textesConsole } from "@noyau/textes/console";
import { fcfa } from "@noyau/types";
import {
  CadreConsole, Cellule, EnTete, Etiquette, EtatDeVie, GesteInterdit,
  NomDeCommerce, Panneau, Pastille, RienADire, TableauQuiDefile,
} from "../../gabarit";

export const dynamic = "force-dynamic";

export default async function UnTerminal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // La garde AVANT de lire l'identifiant comme avant de lire la base.
  await exigerPouvoir("administrer");
  const langue = await langueServeur();
  const t = textesConsole[langue];
  const { id } = await params;
  const fiche = await chargerFicheTerminal(id, langue);

  if (!fiche) {
    // Un cul-de-sac n'existe pas : la page d'erreur porte le chemin du retour.
    return (
      <CadreConsole actif="flotte" langue={langue} titre={t.terminal.introuvableTitre}>
        <RienADire
          titre={t.terminal.introuvableTitre}
          detail={t.terminal.introuvableDetail}
        />
        <Link
          href="/console"
          className="text-small text-ink-soft underline-offset-4 hover:underline"
        >
          {t.terminal.ariane}
        </Link>
      </CadreConsole>
    );
  }

  const b = fiche.terminal;
  const muet = b.vivacite === "muet" || b.vivacite === "jamais";

  return (
    <CadreConsole
      actif="flotte"
      langue={langue}
      titre={b.nom}
      ariane={[b.lieu, fiche.misEnServiceLe
        ? t.terminal.misEnService(dateLisible(fiche.misEnServiceLe, langue))
        : ""].filter(Boolean).join(" · ") || undefined}
    >
      <Link
        href="/console"
        className="-mt-2 w-fit text-small text-ink-soft underline-offset-4 hover:underline"
      >
        ← {t.terminal.ariane}
      </Link>

      {/* L'identité, et d'abord à qui ce boîtier appartient. */}
      <Panneau>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4 px-4 py-4">
          <div>
            <p className="text-caption text-ink-faint">{t.flotte.colonneEtat}</p>
            <div className="mt-1 text-small">
              <EtatDeVie vivacite={b.vivacite} depuis={b.depuis} langue={langue} />
            </div>
            <p className="mt-1 max-w-xs text-caption leading-relaxed text-ink-soft">
              {t.etatDetail[b.vivacite]}
            </p>
          </div>
          <div>
            <p className="text-caption text-ink-faint">{t.flotte.colonneCommerce}</p>
            <div className="mt-1 text-small">
              <NomDeCommerce noms={b.commerces} langue={langue}
                connu={fiche.proprietesConnues} />
            </div>
          </div>
          <div>
            <p className="text-caption text-ink-faint">{t.terminal.version}</p>
            <p className="mt-1 text-small">
              {b.version ? (
                <Etiquette>{b.version}</Etiquette>
              ) : (
                <span className="text-ink-faint">{t.flotte.versionMuette}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-caption text-ink-faint">{t.terminal.enAttenteTitre}</p>
            <p className="mt-1 text-small tabnums">
              {b.enAttente == null ? (
                <span className="text-ink-faint">{t.terminal.enAttenteInconnu}</span>
              ) : b.enAttente === 0 ? (
                <span className="text-positive">{t.terminal.enAttenteAucun}</span>
              ) : (
                <span className="text-alert">{t.flotte.enAttente(b.enAttente)}</span>
              )}
            </p>
          </div>
        </div>
      </Panneau>

      {b.alertes.length > 0 && (
        <Panneau titre={t.nav.alertes}>
          <ul className="divide-hair">
            {b.alertes.map((a) => (
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
                  <p className="mt-1 text-caption tabnums text-ink-faint">
                    {a.commerceNom
                      ? `${t.chez(a.commerceNom)} · `
                      : fiche.proprietesConnues ? `${t.sansCommerce} · ` : ""}
                    {a.depuis}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panneau>
      )}

      <Panneau titre={t.terminal.machineTitre} note={t.terminal.machineNote}>
        {/* « break-words » : un ICCID ou une adresse est un mot insécable, et
            le « overflow-hidden » du panneau le COUPE NET au lieu de le passer
            à la ligne. L'information disparaît sur l'écran même où on va la
            chercher. */}
        <p className="px-4 py-4 text-small leading-relaxed break-words tabnums">
          {b.sante || (
            <span className="text-ink-faint">{t.terminal.santeAbsente}</span>
          )}
        </p>
      </Panneau>

      <Panneau titre={t.terminal.cartesTitre}>
        {fiche.cartes.length === 0 ? (
          <div className="p-4">
            <RienADire titre={t.cartes.videTitre} detail={t.terminal.cartesVide} />
          </div>
        ) : (
          <TableauQuiDefile>
            <thead>
              <tr>
                <EnTete>{t.cartes.colonneCarte}</EnTete>
                <EnTete>{t.cartes.colonneCommerce}</EnTete>
                <EnTete>{t.cartes.colonneEtat}</EnTete>
                <EnTete nombre>{t.cartes.colonneSolde}</EnTete>
              </tr>
            </thead>
            <tbody>
              {fiche.cartes.map((c) => (
                <tr key={c.iccid}>
                  <Cellule>
                    <span className="font-medium">{c.libelle}</span>
                    <span className="block text-caption tabnums text-ink-faint">
                      {c.nom || t.cartes.nomAbsent}
                      {" · "}
                      {c.numero || t.cartes.numeroAbsent}
                    </span>
                  </Cellule>
                  <Cellule>
                    <NomDeCommerce
                      noms={c.commerceNom ? [c.commerceNom] : []}
                      langue={langue}
                      connu={fiche.proprietesConnues}
                    />
                  </Cellule>
                  <Cellule>
                    {c.etat === "inconnu" ? (
                      <span className="text-alert">{t.cartes.etatInconnu}</span>
                    ) : c.etat === "retiree" ? (
                      <span className="text-ink-soft">{t.cartes.etatRetiree}</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Pastille ton="positif" />
                        {t.cartes.etatEnPlace}
                      </span>
                    )}
                    {c.itinerance && c.etat === "en_place" && (
                      <span className="mt-0.5 block text-caption text-alert">
                        {t.cartes.itinerance(c.reseau || t.inconnu)}
                      </span>
                    )}
                  </Cellule>
                  <Cellule nombre>
                    {c.solde == null ? (
                      <span className="text-ink-faint">{t.cartes.soldeJamais}</span>
                    ) : (
                      <>
                        <span className="font-medium">{fcfa(c.solde, langue)}</span>
                        <span className="block text-caption text-ink-faint">
                          {t.cartes.soldeLe(
                            new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
                              hour: "2-digit", minute: "2-digit",
                              timeZone: "Africa/Douala",
                            }).format(new Date(c.soldeLe!)))}
                        </span>
                      </>
                    )}
                  </Cellule>
                </tr>
              ))}
            </tbody>
          </TableauQuiDefile>
        )}
      </Panneau>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panneau titre={t.terminal.journalTitre} note={t.terminal.journalNote}>
          {fiche.journal.length === 0 ? (
            <p className="px-4 py-6 text-center text-small text-ink-faint">
              {t.terminal.journalVide}
            </p>
          ) : (
            <ul className="divide-hair max-h-[26rem] overflow-y-auto">
              {fiche.journal.map((e) => (
                <li key={e.id} className="flex gap-3 px-4 py-2.5">
                  <span className="w-24 shrink-0 text-caption tabnums text-ink-faint">
                    {e.quand}
                  </span>
                  <span className="min-w-0 flex-1 text-small leading-relaxed break-words">
                    {e.texte}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panneau>

        <Panneau titre={t.terminal.commandesTitre}>
          {fiche.commandes.length === 0 ? (
            <p className="px-4 py-6 text-center text-small text-ink-faint">
              {t.terminal.commandesVide}
            </p>
          ) : (
            <ul className="divide-hair max-h-[26rem] overflow-y-auto">
              {fiche.commandes.map((c) => (
                <li key={c.id} className="px-4 py-2.5">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-small">
                    <span className="font-medium">{c.genre}</span>
                    <Etiquette
                      ton={
                        c.etat === "echouee" ? "negatif"
                          : c.etat === "faite" ? "positif" : "attention"
                      }
                    >
                      {t.terminal.commandeEtat[
                        c.etat as keyof typeof t.terminal.commandeEtat] ?? c.etat}
                    </Etiquette>
                    <span className="ml-auto text-caption tabnums text-ink-faint">
                      {c.quand}
                    </span>
                  </p>
                  {/* Qui a demandé, et pour quel commerce : sans ces deux mots,
                      le journal des commandes ne peut ni confondre ni
                      disculper personne. */}
                  <p className="mt-0.5 text-caption text-ink-faint">
                    {c.demandeeParNom
                      ? t.terminal.demandeePar(c.demandeeParNom)
                      : t.terminal.demandeeParInconnu}
                    {c.commerceNom ? ` · ${t.chez(c.commerceNom)}` : ` · ${t.sansCommerce}`}
                    {c.attenteDepuis ? ` · ${c.attenteDepuis}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panneau>
      </div>

      <Panneau titre={t.terminal.gestesTitre} pied={t.terminal.gestesDetail}>
        <div className="px-4 py-2">
          <GesteInterdit quoi={t.terminal.gesteSolde} qui={t.terminal.gesteSoldeQui} />
          <GesteInterdit quoi={t.terminal.gesteRecu} qui={t.terminal.gesteRecuQui} />
          <GesteInterdit quoi={t.terminal.gesteSortie} qui={t.terminal.gesteSortieQui} />
        </div>
      </Panneau>

      {muet && (
        <p className="text-caption leading-relaxed text-ink-soft">
          {t.etatDetail[b.vivacite]}
        </p>
      )}
    </CadreConsole>
  );
}
