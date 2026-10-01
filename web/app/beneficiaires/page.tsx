import Link from "next/link";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { RIEN, porteeDe } from "@/lib/portee";
import { textesBeneficiaires } from "@noyau/textes/beneficiaires";
import { textesGuichet } from "@noyau/textes/guichet";
import { clientsRecents } from "@noyau/recents";
import { numeroPropre } from "@noyau/beneficiaires";
import { IconChevron } from "../icons";
import { Vide } from "../vide";
import { Carnet } from "./carnet";

export const dynamic = "force-dynamic";

/**
 * Le carnet des bénéficiaires — les gens à qui l'on envoie de l'argent.
 *
 * Deux listes, et elles disent d'où elles viennent : le carnet (ce qu'on a
 * enregistré, avec les noms qu'on a choisis), puis ce que les SMS de la
 * carte ont montré. Un carnet par carte : il suit la carte, pas la personne.
 */
export default async function Beneficiaires() {
  const langue = await langueServeur();
  const t = textesBeneficiaires[langue];
  const { sims, paiements, beneficiaires = [] } =
    await chargerDonnees(langue, (await porteeDe()) ?? RIEN, { sms: 200, recus: 0 });

  return (
    <div className="flex flex-col gap-7">
      <header>
        <Link href="/actions" className="mb-2 inline-flex items-center gap-1 text-small text-ink-soft hover:text-ink">
          <IconChevron size={14} className="rotate-180" /> {textesGuichet[langue].titre}
        </Link>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sous}</p>
      </header>
      {sims.length === 0 ? (
        <Vide titre={t.aucunVu} detail={t.origine} />
      ) : (
        <Carnet
          cartes={sims.map((c) => ({ iccid: c.iccid, libelle: c.libelle, operateur: c.operateur }))}
          carnet={beneficiaires}
          vus={Object.fromEntries(sims.map((c) => [c.iccid,
            clientsRecents(paiements, c.iccid, 20).map((r) => ({ ...r, numero: numeroPropre(r.numero) }))]))}
        />
      )}
    </div>
  );
}
