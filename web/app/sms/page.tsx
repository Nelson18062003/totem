import { redirect } from "next/navigation";
import { exigerEcran } from "@/lib/ecran";

// La page des SMS reçus vit désormais avec les encaissements : un seul
// endroit pour tout ce que la carte reçoit.
//
// Elle ne montre rien et ne charge rien — mais elle passe quand même par le
// garde, et c'est délibéré. Le relevé de `verifier-le-verrou.mjs` exige que
// TOUTE porte fermée en ait un, sans exception : une liste d'exceptions,
// même justifiée, est l'endroit exact où la prochaine porte oubliée irait se
// ranger sans qu'on la voie. Une redirection gardée ne coûte rien.
export default async function AncienneAdresse() {
  await exigerEcran();
  redirect("/encaissements");
}
