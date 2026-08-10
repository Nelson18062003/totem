import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesGuichet } from "@/lib/textes/guichet";
import { Vide } from "../vide";
import { Guichet } from "./guichet";
import { exigerPouvoir } from "@/lib/garde";

export const dynamic = "force-dynamic";

/**
 * Le guichet — et le pouvoir qu'il exige a été corrigé.
 *
 * Il demandait « operer », le pouvoir du comptoir. Or tout ce qu'il propose
 * envoie le genre « ussd », que `roles.ts` réserve au propriétaire : un
 * opérateur y entrait, voyait tous les boutons, et se faisait refuser à
 * chaque appui. Six refus successifs ne se lisent pas comme une règle, ils se
 * lisent comme une panne — et poussent à emprunter le compte du patron, ce
 * qui est exactement ce que les rôles servent à éviter.
 *
 * L'écran exige donc désormais ce qu'il fait réellement. Un opérateur ne le
 * voit plus dans son menu (voir `nav.tsx`) et arrive sur son accueil, où ce
 * qu'il peut faire est écrit.
 */
export default async function Operations() {
  await exigerPouvoir("sortir_argent");
  const langue = await langueServeur();
  const t = textesGuichet[langue];
  const { sims } = await chargerDonnees(langue, { sms: 0, recus: 0 });
  const carte = sims.find((s) => s.enPlace);

  if (!carte) {
    return (
      <div className="flex flex-col gap-7">
        <header>
          <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
          <p className="mt-1 text-small text-ink-soft">{t.sansCode}</p>
        </header>
        <Vide titre={t.aucuneCarte} detail={t.aucuneCarteDetail} />
      </div>
    );
  }

  return <Guichet carte={{ libelle: carte.libelle, operateur: carte.operateur }} />;
}
