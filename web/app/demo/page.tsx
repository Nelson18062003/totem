import { redirect } from "next/navigation";
import { langueServeur } from "@/lib/langue-serveur";
import { compteConnecte } from "@/lib/qui";
import { quiAdministre } from "@/lib/garde";
import { demoVivanteOuverte, mondeEnCours } from "@/lib/monde";
import { EcranDeLAdministrateur, NaissanceDeLaDemo } from "./ecran";

export const dynamic = "force-dynamic";

/**
 * LA DÉMO VIVANTE — deux faces, selon le monde de la session :
 *
 *   — dans la démo, l'écran de son administrateur (les cartes des testeurs,
 *     fabriquer des francs, les floats de Glisil) ;
 *   — dans la maison, pour le vrai propriétaire, la création de cet
 *     administrateur — et rien de la démo elle-même.
 *
 * Tout autre visiteur repart à l'accueil. La route `/api/demo` refait chaque
 * vérification : un écran caché n'est pas une porte fermée.
 */
export default async function Demo() {
  if (!demoVivanteOuverte()) redirect("/");
  const langue = await langueServeur();
  if ((await mondeEnCours()) === "demo") {
    const moi = await compteConnecte();
    if (moi?.role !== "proprietaire") redirect("/");
    return <EcranDeLAdministrateur langue={langue} />;
  }
  if (!(await quiAdministre())) redirect("/");
  return <NaissanceDeLaDemo langue={langue} />;
}
