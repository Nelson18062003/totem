import { chargerDonnees } from "@/lib/serveur";
import { Vide } from "../vide";
import { ConsoleUssd } from "./console";

export const dynamic = "force-dynamic";

export default async function CodeUssd({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const [{ sims }, { code }] = await Promise.all([chargerDonnees(), searchParams]);
  const carte = sims.find((s) => s.enPlace);

  if (!carte) {
    return (
      <div className="flex flex-col gap-7">
        <header>
          <h1 className="text-title font-semibold tracking-tight">Code USSD</h1>
          <p className="mt-1 text-small text-ink-soft">
            Composer un code exige une carte en place : le terminal n’en voit
            aucune pour l’instant.
          </p>
        </header>
        <Vide
          titre="Aucune carte dans le terminal"
          detail="Dès qu'une SIM sera vue, vous pourrez composer ses codes ici, comme sur un téléphone."
        />
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
