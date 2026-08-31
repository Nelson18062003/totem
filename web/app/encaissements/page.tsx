import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { ListeEncaissements } from "./liste";

export const dynamic = "force-dynamic";

export default async function Encaissements({
  searchParams,
}: {
  searchParams: Promise<{ recherche?: string | string[] }>;
}) {
  const langue = await langueServeur();
  const [{ paiements, terminal }, { recherche }] = await Promise.all([
    chargerDonnees(langue),
    searchParams,
  ]);
  // Les filtres proposés sont les CARTES réellement vues dans les données —
  // par libellé complet (« MTN ·8901 ») : deux SIM du même opérateur sont
  // deux caisses, elles ne se fondent plus en un seul filtre « MTN ».
  const operateurs = [...new Set(paiements.map((p) => p.sim))].filter((o) => o !== "—");
  return (
    <ListeEncaissements
      // La clé fait repartir l'écran à neuf quand on arrive avec une AUTRE
      // recherche (client A puis client B) ; taper ou effacer ne la change
      // pas, l'écran garde alors son état.
      key={typeof recherche === "string" ? recherche : ""}
      paiements={paiements}
      operateurs={operateurs}
      enAttente={terminal?.enAttente ?? 0}
      // La page peut s'ouvrir sur une recherche déjà posée — c'est ainsi que
      // l'Analyse envoie vers les paiements d'un client précis.
      rechercheInitiale={typeof recherche === "string" ? recherche : ""}
    />
  );
}
