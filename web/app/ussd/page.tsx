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
  const [{ sims }, { code }] = await Promise.all([
    chargerDonnees(langue, { sms: 0, recus: 0 }),
    searchParams,
  ]);
  const carte = sims.find((s) => s.enPlace);

  if (!carte) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-title">{t.titre}</h1>
          <p className="mt-1 text-small text-ink-soft">{t.sansCarteSousTitre}</p>
        </header>
        <Vide titre={t.aucuneCarte} detail={t.aucuneCarteDetail} />
      </div>
    );
  }

  return (
    <ConsoleUssd
      carte={{ libelle: carte.libelle, operateur: carte.operateur }}
      codeInitial={typeof code === "string" ? code.replace(/[^0-9#*]/g, "").slice(0, 32) : undefined}
    />
  );
}
