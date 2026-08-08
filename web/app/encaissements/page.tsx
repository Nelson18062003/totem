import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { ListeEncaissements } from "./liste";
import { exigerPouvoir } from "@/lib/garde";

export const dynamic = "force-dynamic";

export default async function Encaissements() {
  await exigerPouvoir("lire");
  const langue = await langueServeur();
  const { paiements, terminal } = await chargerDonnees(langue);
  // Les filtres proposés sont les opérateurs réellement vus dans les données.
  const operateurs = [...new Set(paiements.map((p) => p.sim))].filter((o) => o !== "—");
  return (
    <ListeEncaissements
      paiements={paiements}
      operateurs={operateurs}
      enAttente={terminal?.enAttente ?? 0}
    />
  );
}
