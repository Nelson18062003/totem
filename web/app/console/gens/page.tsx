// Écran 4 · LES GENS ET LES APPAREILS — qui peut ouvrir, qui est prévenu, qui
// martèle la porte.
//
// POURQUOI CET ÉCRAN EXISTE
// Trois registres vivaient dans la base sans qu'aucun écran ne les montre :
// les comptes (« utilisateurs »), les téléphones inscrits aux notifications
// (« appareils »), et le frein des essais de mot de passe (« freins »). Un
// registre que personne ne lit ne protège personne — un téléphone inscrit en
// douce, une adresse qui essaie des mots de passe toute la nuit, rien de tout
// cela ne se voyait.
//
// CE QUE CET ÉCRAN NE FAIT PAS
// Il ne crée, ne ferme et n'approuve aucun compte : ces gestes vivent dans
// Réglages → « Qui peut se connecter », et un seul endroit doit savoir les
// faire. Ici on REGARDE — c'est le métier de la console.
//
// CE QU'IL NE MONTRE JAMAIS
// Le jeton de notification d'un téléphone. Un jeton suffit à faire sonner
// l'appareil : il reste dans la base, et la lecture ne le demande même pas
// (voir chargerGens — ce qui n'est pas demandé ne peut pas fuir).

import { exigerPouvoir } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerGens, dateLisible } from "@/lib/console";
import { textesConsole } from "@noyau/textes/console";
import {
  CadreConsole, Cellule, EnTete, Etiquette, Mesure, Panneau, Pastille,
  RienADire, TableauQuiDefile,
} from "../gabarit";

export const dynamic = "force-dynamic";

export default async function GensEtAppareils() {
  // La garde AVANT toute lecture. Une lecture faite d'abord a déjà fui.
  const moi = await exigerPouvoir("administrer");
  const langue = await langueServeur();
  const t = textesConsole[langue];
  const gens = await chargerGens(langue);

  const compteOuPhrase = (n: number) => (n > 0 ? String(n) : "—");

  return (
    <CadreConsole
      actif="gens"
      langue={langue}
      titre={t.gens.titre}
      nom={moi.nom || undefined}
      ariane={
        gens.comptes.length > 0
          ? t.gens.ariane(gens.comptes.length, gens.telephones.length)
          : undefined
      }
    >
      {!gens.relie ? (
        <RienADire titre={t.pasDeBaseTitre} detail={t.pasDeBaseDetail} ton="alerte" />
      ) : gens.comptes.length === 0 ? (
        <RienADire titre={t.gens.videTitre} detail={t.gens.videDetail} ton="alerte" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Mesure libelle={t.gens.mesureComptes} valeur={String(gens.comptes.length)} />
            <Mesure
              libelle={t.gens.mesureEnAttente}
              valeur={compteOuPhrase(gens.enAttente)}
              note={gens.enAttente === 0 ? t.gens.mesureEnAttenteCalme : undefined}
              ton={gens.enAttente > 0 ? "attention" : "neutre"}
            />
            <Mesure
              libelle={t.gens.mesureTelephones}
              valeur={String(gens.telephones.length)}
            />
            <Mesure
              libelle={t.gens.mesureFreins}
              valeur={compteOuPhrase(gens.freines.length)}
              note={gens.freines.length === 0 ? t.gens.mesureFreinsCalme : undefined}
              ton={gens.freines.length > 0 ? "attention" : "neutre"}
            />
          </div>

          <Panneau titre={t.gens.comptesTitre} note={t.gens.comptesNote}>
            <TableauQuiDefile>
              <thead>
                <tr>
                  <EnTete>{t.gens.colonneCourriel}</EnTete>
                  <EnTete>{t.gens.colonneRole}</EnTete>
                  <EnTete>{t.gens.colonneEtat}</EnTete>
                  <EnTete nombre>{t.gens.colonneEntree}</EnTete>
                </tr>
              </thead>
              <tbody>
                {gens.comptes.map((c) => (
                  <tr key={c.id} className="transition hover:bg-surface-2">
                    <Cellule>
                      <span className="font-medium break-all">{c.courriel}</span>
                      {c.creeLe && (
                        <span className="block text-caption tabnums text-ink-faint">
                          {t.gens.creeLe(dateLisible(c.creeLe, langue))}
                        </span>
                      )}
                    </Cellule>
                    <Cellule>
                      <Etiquette ton={c.role === "proprietaire" ? "positif" : "neutre"}>
                        {t.gens.role[c.role as "proprietaire" | "invite"]}
                      </Etiquette>
                    </Cellule>
                    <Cellule>
                      {c.approuve ? (
                        <span className="flex items-center gap-2">
                          <Pastille ton="positif" /> {t.gens.porteOuverte}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 text-alert">
                          <Pastille ton="attention" /> {t.gens.porteFermee}
                        </span>
                      )}
                    </Cellule>
                    <Cellule nombre pale>
                      {c.vuLe ? c.depuis : t.gens.jamaisEntre}
                    </Cellule>
                  </tr>
                ))}
              </tbody>
            </TableauQuiDefile>
          </Panneau>

          <Panneau titre={t.gens.telephonesTitre} note={t.gens.telephonesNote}>
            {gens.telephones.length === 0 ? (
              <div className="p-4">
                <RienADire
                  titre={t.gens.telephonesVideTitre}
                  detail={t.gens.telephonesVideDetail}
                />
              </div>
            ) : (
              <TableauQuiDefile>
                <thead>
                  <tr>
                    <EnTete>{t.gens.colonneAppareil}</EnTete>
                    <EnTete>{t.gens.colonnePlateforme}</EnTete>
                    <EnTete nombre>{t.gens.colonneVu}</EnTete>
                  </tr>
                </thead>
                <tbody>
                  {gens.telephones.map((a, i) => (
                    <tr key={i}>
                      <Cellule>
                        {a.nom ? (
                          <span className="font-medium">{a.nom}</span>
                        ) : (
                          <span className="text-ink-faint">{t.gens.sansNom}</span>
                        )}
                        {a.creeLe && (
                          <span className="block text-caption tabnums text-ink-faint">
                            {t.gens.creeLe(dateLisible(a.creeLe, langue))}
                          </span>
                        )}
                      </Cellule>
                      <Cellule>
                        {a.plateforme && <Etiquette>{a.plateforme}</Etiquette>}
                      </Cellule>
                      <Cellule nombre pale>{a.depuis}</Cellule>
                    </tr>
                  ))}
                </tbody>
              </TableauQuiDefile>
            )}
          </Panneau>

          <Panneau
            titre={t.gens.freinsTitre}
            note={t.gens.freinsNote}
            pied={t.gens.freinExplique}
          >
            {gens.freines.length === 0 ? (
              <div className="p-4">
                <RienADire
                  titre={t.gens.freinsVideTitre}
                  detail={t.gens.freinsVideDetail}
                />
              </div>
            ) : (
              <TableauQuiDefile>
                <thead>
                  <tr>
                    <EnTete>{t.gens.colonneAdresse}</EnTete>
                    <EnTete nombre>{t.gens.colonneEssais}</EnTete>
                    <EnTete nombre>{t.gens.colonneVu}</EnTete>
                  </tr>
                </thead>
                <tbody>
                  {gens.freines.map((f) => (
                    <tr key={f.cle}>
                      <Cellule>
                        <span className="tabnums break-all">{f.cle}</span>
                      </Cellule>
                      <Cellule nombre>
                        <span className={f.n >= 60 ? "font-medium text-negative" : ""}>
                          {t.gens.essais(f.n)}
                        </span>
                      </Cellule>
                      <Cellule nombre pale>{f.depuis}</Cellule>
                    </tr>
                  ))}
                </tbody>
              </TableauQuiDefile>
            )}
          </Panneau>
        </>
      )}
    </CadreConsole>
  );
}
