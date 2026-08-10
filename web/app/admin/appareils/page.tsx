// A6 — LES APPAREILS : les voir, en retirer un, tout fermer.
//
// C'est l'écran où l'on vient après avoir lu une lettre qui dit « quelqu'un
// est entré chez vous ». Tout y est ordonné par cette lecture-là :
//
// 1. CE QU'IL MANQUE, EN PREMIER ET EN ROUGE. Un administrateur avec un seul
//    appareil est un administrateur à un accident de sa flotte. La bande du
//    haut RÉCLAME le second — elle ne le propose pas — et elle ne disparaît
//    que quand il est là.
// 2. CE QUI OUVRE CE COMPTE. Les appareils avant les sessions : une session se
//    ferme et revient, un appareil retiré ne revient pas.
// 3. CE QUI EST OUVERT EN CE MOMENT, avec « tout fermer » à portée de pouce.
// 4. CE QUI S'EST PASSÉ À LA PORTE, y compris les fois où rien ne s'est
//    ouvert. C'est ce journal qui permet de dire « cinq codes ont été essayés
//    hier soir, rien ne s'est ouvert » — et de le dire à la personne, plutôt
//    que de le laisser dans un fichier technique.
//
// LA GARDE EST APPELÉE AVANT TOUTE LECTURE, et c'est « administrer » : un
// propriétaire ou une opératrice qui devine cette adresse arrive sur son
// accueil, pas ici.

import Link from "next/link";
import { exigerPouvoir } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { momentLisible } from "@/lib/console";
import { sessionsOuvertes } from "@/lib/sessions";
import { textesAdminPorte } from "@/lib/textes/admin-porte";
import {
  appareilsDe, appareilsManquants, DUREE_CONSOLE_MS, entreesDe, manqueUnAppareil,
} from "@/lib/plateforme";
import { CadreDuCompte, Panneau, RienADire } from "../cadre";
import { FermerLaSession, RetirerCetAppareil, ToutFermer } from "../interactifs";

export const dynamic = "force-dynamic";

export default async function Appareils() {
  const moi = await exigerPouvoir("administrer");
  const langue = await langueServeur();
  const t = textesAdminPorte[langue];

  const [cles, sessions, journal] = await Promise.all([
    appareilsDe(moi.personne),
    sessionsOuvertes(moi.personne),
    entreesDe(moi.personne),
  ]);

  const manque = manqueUnAppareil(cles.length);
  const heures = Math.round(DUREE_CONSOLE_MS / 3600000);

  return (
    <CadreDuCompte
      langue={langue}
      ici="appareils"
      titre={t.appareils.titre}
      sous={t.appareils.sous}
      action={sessions.length > 0 ? <ToutFermer /> : undefined}
    >
      {/* — Ce qu'il manque. En tête, et à la voix. ——————————————————— */}
      {manque && (
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
          <Link
            href="/admin/appareils/ajouter"
            className="mt-3 inline-flex h-12 items-center justify-center rounded-btn
                       bg-accent px-4 text-body font-medium text-white transition
                       hover:bg-accent-hover"
          >
            {t.ajouter.titre}
          </Link>
        </section>
      )}

      {/* — Les appareils ——————————————————————————————————————————— */}
      <Panneau titre={t.appareils.clesTitre} note={t.appareils.clesNote(heures)}>
        {cles.length === 0 ? (
          <div className="p-4">
            <RienADire
              titre={t.appareils.aucuneCle}
              detail={t.appareils.aucuneCleDetail}
              ton="alerte"
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {cles.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium">
                    {c.appareil || t.appareils.moyen.cle}
                  </p>
                  <p className="mt-0.5 text-caption leading-relaxed text-ink-faint">
                    {/* Recopiée dans le compte du fabricant ou pas : cela change
                        ENTIÈREMENT ce qu'il faut faire le jour de la perte. */}
                    {c.sauvegardee ? t.appareils.sauvegardee : t.appareils.surCeTelephone}
                  </p>
                  <p className="mt-0.5 text-caption tabnums text-ink-faint">
                    {[c.lieu, momentLisible(c.vue_le, langue)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <RetirerCetAppareil id={c.id} appareil={c.appareil || t.appareils.moyen.cle} />
              </li>
            ))}
          </ul>
        )}
        {!manque && (
          <p className="border-t border-line px-4 py-2.5 text-caption leading-relaxed text-ink-faint">
            {t.ajouter.assez(cles.length)}
          </p>
        )}
      </Panneau>

      {/* — Ce qui est ouvert en ce moment ————————————————————————— */}
      <Panneau titre={t.appareils.sessionsTitre} note={t.appareils.sessionsNote}>
        {sessions.length === 0 ? (
          <div className="p-4"><RienADire titre={t.appareils.aucuneSession} /></div>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((s) => {
              const ici = s.id === moi.session.id;
              return (
                <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium">
                      {s.appareil || t.appareils.colonne.appareil}
                      {ici && (
                        <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-caption font-normal text-ink-soft">
                          {t.appareils.celleCi}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-caption tabnums text-ink-faint">
                      {[s.lieu, momentLisible(s.vue_le, langue)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <FermerLaSession session={s.id} ici={ici} />
                </li>
              );
            })}
          </ul>
        )}
      </Panneau>

      {/* — Ce qui s'est passé à la porte ——————————————————————————— */}
      <Panneau titre={t.appareils.journalTitre} note={t.appareils.journalNote}>
        {journal.length === 0 ? (
          <div className="p-4"><RienADire titre={t.appareils.aucunJournal} /></div>
        ) : (
          <ul className="divide-y divide-line">
            {journal.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                <span className="text-small font-medium">
                  {t.appareils.issue[e.issue as keyof typeof t.appareils.issue] ?? e.issue}
                </span>
                <span className="text-caption text-ink-soft">
                  {e.moyen
                    ? t.appareils.moyen[e.moyen as keyof typeof t.appareils.moyen] ?? e.moyen
                    : ""}
                </span>
                <span className="ml-auto text-caption tabnums text-ink-faint">
                  {[e.appareil, e.lieu, momentLisible(e.survenu_le, langue)]
                    .filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panneau>

      {/* — La dernière ligne : personne n'est au-dessus de lui ————————— */}
      <section className="rounded-card border border-line bg-surface-2 px-4 py-4">
        <h2 className="text-body font-medium">{t.appareils.laDerniereLigne}</h2>
        <p className="mt-1.5 text-small leading-relaxed text-ink-soft">
          {t.appareils.laDerniereLigneDit}
        </p>
        <Link
          href="/admin/application"
          className="mt-3 inline-flex min-h-11 items-center text-small font-medium
                     text-accent underline underline-offset-4"
        >
          {t.appareils.versApplication}
        </Link>
      </section>
    </CadreDuCompte>
  );
}
