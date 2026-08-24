import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesUssd } from "@/lib/textes/ussd";
import { Vide } from "../vide";
import { ConsoleUssd } from "./console";

export const dynamic = "force-dynamic";

export default async function CodeUssd({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const langue = await langueServeur();
  const t = textesUssd[langue];
  const [{ sims, raccourcis }, { code }] = await Promise.all([
    chargerDonnees(langue, { sms: 0, recus: 0 }),
    searchParams,
  ]);
  // TOUTES les cartes en place : le cadran compose sur la carte choisie —
  // avec Orange et MTN côte à côte, « composer » ne veut rien dire sans dire
  // sur quelle puce.
  const cartes = sims.filter((s) => s.enPlace);

  if (cartes.length === 0) {
    return (
      <div className="flex flex-col gap-7">
        <header>
          <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
          <p className="mt-1 text-small text-ink-soft">{t.sansCarteSousTitre}</p>
        </header>
        <Vide titre={t.aucuneCarte} detail={t.aucuneCarteDetail} />
      </div>
    );
  }

  return (
    <ConsoleUssd
      cartes={cartes.map((c) => ({
        libelle: c.libelle, operateur: c.operateur, iccid: c.iccid,
      }))}
      raccourcis={raccourcis}
      codeInitial={typeof code === "string" ? code.replace(/[^0-9#*]/g, "").slice(0, 32) : undefined}
    />
  );
}
