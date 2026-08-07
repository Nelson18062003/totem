import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesGuichet } from "@/lib/textes/guichet";
import { IconCard } from "../icons";
import { Vide } from "../ui/etat";
import { Guichet } from "./guichet";

export const dynamic = "force-dynamic";

export default async function Operations() {
  const langue = await langueServeur();
  const t = textesGuichet[langue];
  const { sims } = await chargerDonnees(langue, { sms: 0, recus: 0 });
  const carte = sims.find((s) => s.enPlace);

  if (!carte) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-title">{t.titre}</h1>
          <p className="mt-1 text-small text-ink-soft">{t.sansCode}</p>
        </header>
        <Vide
          icone={<IconCard size={24} />}
          titre={t.aucuneCarte}
          detail={t.aucuneCarteDetail}
        />
      </div>
    );
  }

  return <Guichet carte={{ libelle: carte.libelle, operateur: carte.operateur }} />;
}
