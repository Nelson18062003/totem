// A7 — LES COURRIELS DE LA PORTE : ce qui part, quand, et ce qui est parti.
//
// DEUX MOITIÉS, ET ELLES NE RÉPONDENT PAS À LA MÊME QUESTION
//
// 1. CE QUI PART, ET QUAND. La promesse écrite. Elle existe pour qu'un vrai
//    message se reconnaisse : quelqu'un qui sait que TOTEM écrit à CHAQUE
//    entrée, et jamais avec un code dans l'objet, repère un faux au premier
//    coup d'œil. C'est la seule défense qui tienne contre l'hameçonnage, parce
//    que c'est la personne qu'on hameçonne, pas la machine.
//
// 2. CE QUI EST VRAIMENT PARTI. Le journal. Il n'existe que pour répondre à
//    une phrase qu'on entend tous les mois — « je n'ai rien reçu » — et sans
//    lui, elle n'a pas de réponse : on ne sait pas si le message est parti,
//    s'il a été refusé, ou si TOTEM n'était pas configuré ce jour-là. Ces
//    trois situations appellent trois gestes différents.
//
// CE JOURNAL NE CONTIENT PAS LE CONTENU, ET N'AURA JAMAIS DE COLONNE POUR LE
// METTRE. Ni les six chiffres, ni l'objet, ni le corps. La table est faite
// ainsi (`sql/schema.sql`), et cet écran le DIT en toutes lettres : c'est ce
// qui rend crédible la phrase « nous ne pouvons pas vous redonner ce code ».

import { exigerPouvoir } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { momentLisible } from "@/lib/console";
import { textesAdminPorte } from "@/lib/textes/admin-porte";
import { CODES_DE_SECOURS, courrielsDe } from "@/lib/plateforme";
import { CadreDuCompte, Panneau, RienADire } from "../cadre";

export const dynamic = "force-dynamic";

export default async function Courriels() {
  const moi = await exigerPouvoir("administrer");
  const langue = await langueServeur();
  const t = textesAdminPorte[langue];

  const journal = await courrielsDe(moi.personne);

  const quand = [
    { titre: t.courriels.quandCode, dit: t.courriels.quandCodeDit },
    { titre: t.courriels.quandEntree, dit: t.courriels.quandEntreeDit },
    { titre: t.courriels.quandRetrait, dit: t.courriels.quandRetraitDit },
    {
      titre: t.courriels.quandPapier(CODES_DE_SECOURS),
      dit: t.courriels.quandPapierDit,
    },
  ];

  const regles = [
    { titre: t.courriels.regle1, dit: t.courriels.regle1Dit },
    { titre: t.courriels.regle2, dit: t.courriels.regle2Dit },
    { titre: t.courriels.regle3, dit: t.courriels.regle3Dit },
    { titre: t.courriels.regle4, dit: t.courriels.regle4Dit },
  ];

  return (
    <CadreDuCompte
      langue={langue}
      ici="courriels"
      titre={t.courriels.titre}
      sous={t.courriels.sous}
    >
      {/* — Ce qui part, et quand ——————————————————————————————————— */}
      <Panneau titre={t.courriels.quoiTitre}>
        <ul className="divide-y divide-line">
          {quand.map((q) => (
            <li key={q.titre} className="px-4 py-3.5">
              <p className="text-body font-medium">{q.titre}</p>
              <p className="mt-1 text-small leading-relaxed text-ink-soft">{q.dit}</p>
            </li>
          ))}
        </ul>
      </Panneau>

      {/* — Ce que chaque lettre respecte ——————————————————————————— */}
      <Panneau titre={t.courriels.reglesTitre}>
        <ul className="divide-y divide-line">
          {regles.map((r) => (
            <li key={r.titre} className="px-4 py-3.5">
              <p className="text-body font-medium">{r.titre}</p>
              <p className="mt-1 text-small leading-relaxed text-ink-soft">{r.dit}</p>
            </li>
          ))}
        </ul>
      </Panneau>

      {/* — Ce qui est vraiment parti ————————————————————————————— */}
      <Panneau
        titre={t.courriels.journalTitre}
        note={t.courriels.journalNote}
        pied={t.courriels.riendedans}
      >
        {journal.length === 0 ? (
          <div className="p-4"><RienADire titre={t.courriels.aucunJournal} /></div>
        ) : (
          <ul className="divide-y divide-line">
            {journal.map((c) => {
              // Une issue qui n'est pas « partie » n'est pas un détail : c'est
              // la seule ligne de tout TOTEM qui explique pourquoi quelqu'un
              // attend un code qui n'arrivera jamais.
              const rate = c.issue !== "partie";
              return (
                <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                  <span className="text-small font-medium">
                    {t.courriels.genre[c.genre as keyof typeof t.courriels.genre] ?? c.genre}
                  </span>
                  <span className={`text-caption ${rate ? "text-negative" : "text-ink-soft"}`}>
                    {t.courriels.issue[c.issue as keyof typeof t.courriels.issue] ?? c.issue}
                  </span>
                  <span className="ml-auto text-caption tabnums text-ink-faint">
                    {[c.destinataire, momentLisible(c.cree_le, langue)]
                      .filter(Boolean).join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panneau>
    </CadreDuCompte>
  );
}
