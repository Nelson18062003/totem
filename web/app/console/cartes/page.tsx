// Écran 3 · LES CARTES SIM — toutes, présentes ou retirées, et où elles sont.
//
// LA DÉCISION QUI GOUVERNE CET ÉCRAN
// Trois états, jamais deux. Une puce est « en place », « retirée », ou bien
// « on ne sait pas » — et le troisième est le plus important. On ne conclut à
// un retrait QUE si le boîtier qui portait la carte parle encore et ne la voit
// plus. Si le boîtier s'est tu, personne ne sait où est la puce, et l'écrire
// « retirée » enverrait chercher un vol qui n'a pas eu lieu (CAS-LIMITES C2).
//
// L'AUTRE DÉCISION
// La colonne « l'argent de qui » vient en deuxième position, avant l'état et
// avant le solde. Un administrateur lit quatre boutiques dans le même tableau ;
// le nom du commerce n'est pas une décoration de fin de ligne, c'est ce qui
// empêche de rapprocher un solde du mauvais commerçant.

import { exigerPouvoir } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerRegistreDesCartes, dateLisible } from "@/lib/console";
import { textesConsole } from "@/lib/textes/console";
import { fcfa } from "@/lib/types";
import {
  CadreConsole, Cellule, EnTete, Etiquette, Mesure, NomDeCommerce, Panneau,
  Pastille, RienADire, TableauQuiDefile,
} from "../gabarit";

export const dynamic = "force-dynamic";

export default async function Cartes() {
  await exigerPouvoir("administrer");
  const langue = await langueServeur();
  const t = textesConsole[langue];
  const registre = await chargerRegistreDesCartes(langue);

  const heure = (ts: string) =>
    new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
      hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala",
    }).format(new Date(ts));

  const compteOuPhrase = (n: number) => (n > 0 ? String(n) : "—");
  const orphelines = registre.cartes.filter((c) => !c.commerce);

  return (
    <CadreConsole
      actif="cartes"
      langue={langue}
      titre={t.cartes.titre}
      ariane={
        registre.cartes.length > 0 ? t.cartes.ariane(registre.cartes.length) : undefined
      }
    >
      {!registre.relie ? (
        <RienADire titre={t.pasDeBaseTitre} detail={t.pasDeBaseDetail} ton="alerte" />
      ) : registre.cartes.length === 0 ? (
        <RienADire titre={t.cartes.videTitre} detail={t.cartes.videDetail} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Mesure libelle={t.cartes.mesureEnPlace} valeur={String(registre.enPlace)} />
            <Mesure
              libelle={t.cartes.mesureInconnues}
              valeur={compteOuPhrase(registre.inconnues)}
              ton={registre.inconnues > 0 ? "negatif" : "neutre"}
              note={registre.inconnues === 0 ? undefined : t.cartes.etatInconnu}
            />
            <Mesure
              libelle={t.cartes.mesureItinerantes}
              valeur={compteOuPhrase(registre.itinerantes)}
              ton={registre.itinerantes > 0 ? "attention" : "neutre"}
            />
            <Mesure
              libelle={t.cartes.mesureSansCommerce}
              valeur={compteOuPhrase(registre.sansCommerce)}
              ton={registre.sansCommerce > 0 ? "negatif" : "neutre"}
            />
          </div>

          {orphelines.length > 0 && (
            <RienADire
              titre={t.cartes.orphelinesTitre}
              detail={t.cartes.orphelinesDetail}
              ton="alerte"
            />
          )}

          <Panneau titre={t.cartes.titre} pied={t.cartes.note}>
            <TableauQuiDefile>
              <thead>
                <tr>
                  <EnTete>{t.cartes.colonneCarte}</EnTete>
                  <EnTete>{t.cartes.colonneCommerce}</EnTete>
                  <EnTete>{t.cartes.colonneTerminal}</EnTete>
                  <EnTete>{t.cartes.colonneEtat}</EnTete>
                  <EnTete nombre>{t.cartes.colonneSolde}</EnTete>
                  <EnTete nombre>{t.cartes.colonneVue}</EnTete>
                </tr>
              </thead>
              <tbody>
                {registre.cartes.map((c) => (
                  <tr key={`${c.terminal}-${c.iccid}`} className="transition hover:bg-surface-2">
                    <Cellule>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{c.libelle}</span>
                        {c.operateur && <Etiquette>{c.operateur}</Etiquette>}
                      </span>
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
                      />
                    </Cellule>
                    <Cellule>
                      <span className="tabnums">{c.terminalNom}</span>
                    </Cellule>
                    <Cellule>
                      {c.etat === "inconnu" ? (
                        <>
                          <span className="flex items-center gap-2 text-alert">
                            <Pastille ton="attention" />
                            {t.cartes.etatInconnu}
                          </span>
                          <span className="mt-0.5 block text-caption leading-snug text-ink-soft">
                            {t.cartes.etatInconnuDetail(c.terminalNom)}
                          </span>
                        </>
                      ) : c.etat === "retiree" ? (
                        <span className="flex items-center gap-2 text-ink-soft">
                          <Pastille ton="neutre" />
                          {t.cartes.etatRetiree}
                        </span>
                      ) : (
                        <>
                          <span className="flex items-center gap-2">
                            <Pastille ton="positif" />
                            {t.cartes.etatEnPlace}
                          </span>
                          {c.itinerance && (
                            <span className="mt-0.5 block text-caption text-alert">
                              {t.cartes.itinerance(c.reseau || t.inconnu)}
                            </span>
                          )}
                          {c.signal != null && (
                            <span className="mt-0.5 block text-caption tabnums text-ink-faint">
                              {c.signal}/31
                            </span>
                          )}
                        </>
                      )}
                    </Cellule>
                    <Cellule nombre>
                      {c.solde == null ? (
                        <span className="text-ink-faint">{t.cartes.soldeJamais}</span>
                      ) : (
                        <>
                          <span className="font-medium">{fcfa(c.solde, langue)}</span>
                          {c.soldeLe && (
                            <span className="block text-caption text-ink-faint">
                              {t.cartes.soldeLe(heure(c.soldeLe))}
                            </span>
                          )}
                        </>
                      )}
                    </Cellule>
                    <Cellule nombre pale>
                      {dateLisible(c.derniereVue, langue)}
                    </Cellule>
                  </tr>
                ))}
              </tbody>
            </TableauQuiDefile>
          </Panneau>
        </>
      )}
    </CadreConsole>
  );
}
