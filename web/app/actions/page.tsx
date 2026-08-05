import { chargerDonnees } from "@/lib/serveur";
import { Vide } from "../vide";
import { Guichet } from "./guichet";

export const dynamic = "force-dynamic";

export default async function Operations() {
  const { sims } = await chargerDonnees({ sms: 0, recus: 0 });
  const carte = sims.find((s) => s.enPlace);

  if (!carte) {
    return (
      <div className="flex flex-col gap-7">
        <header>
          <h1 className="text-title font-semibold tracking-tight">Opérations</h1>
          <p className="mt-1 text-small text-ink-soft">Sans composer de code USSD.</p>
        </header>
        <Vide
          titre="Aucune carte dans le terminal"
          detail="Les opérations s'ouvriront dès qu'une SIM sera en place : c'est elle qui porte le guichet."
        />
      </div>
    );
  }

  return <Guichet carte={{ libelle: carte.libelle, operateur: carte.operateur }} />;
}
