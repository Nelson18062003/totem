import { langueServeur } from "@/lib/langue-serveur";
import { exigerEcran } from "@/lib/ecran";
import { chargerDonnees } from "@/lib/serveur";
import { textesGuichet } from "@noyau/textes/guichet";
import { Vide } from "../vide";
import { Guichet } from "./guichet";

export const dynamic = "force-dynamic";

export default async function Operations() {
  // Le garde d'abord : cet écran sert les mêmes chiffres qu'une API.
  await exigerEcran();
  const langue = await langueServeur();
  const t = textesGuichet[langue];
  const { sims, raccourcis } = await chargerDonnees(langue, { sms: 0, recus: 0 });
  // TOUTES les cartes en place : le guichet montre un sélecteur dès qu'il y
  // en a deux — chaque opération part sur la carte choisie, jamais sur « la
  // première venue ».
  const cartes = sims.filter((s) => s.enPlace);

  if (cartes.length === 0) {
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

  return (
    <Guichet
      cartes={cartes.map((c) => ({
        libelle: c.libelle, operateur: c.operateur, iccid: c.iccid,
      }))}
      raccourcis={raccourcis}
    />
  );
}
