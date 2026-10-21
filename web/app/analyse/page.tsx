import { redirect } from "next/navigation";

// L'Analyse est devenue les VOLUMES (`app/volumes`) : toute la période, les
// entrées ET les sorties, par carte et par correspondant. L'ancienne adresse
// y mène — un favori ou un lien gardé ne tombe pas dans le vide.
export default function Analyse() {
  redirect("/volumes");
}
