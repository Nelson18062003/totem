import { redirect } from "next/navigation";

// La page des SMS reçus vit désormais avec les encaissements : un seul
// endroit pour tout ce que la carte reçoit.
export default function AncienneAdresse() {
  redirect("/encaissements");
}
