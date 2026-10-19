import { demoVivanteOuverte } from "@/lib/monde";
import { payerLesSortiesDeDemo, reveilSigne } from "@/lib/demo-vivante";

export const dynamic = "force-dynamic";

/**
 * LE RÉVEIL DE GLISIL : une sortie de démo attend d'être payée. L'appel ne
 * porte rien — il dit seulement « regarde » —, et il est signé avec la clé du
 * terminal de démo : un inconnu ne fait pas tourner la plateforme. Ce qu'il
 * y a à payer, la plateforme le relève elle-même par la porte signée.
 */
export async function POST(req: Request) {
  if (!demoVivanteOuverte()) return Response.json({ erreur: "démo fermée" }, { status: 404 });
  if (!(await reveilSigne(req.headers.get("x-glisil-horodatage"), req.headers.get("x-glisil-signature")))) {
    return Response.json({ erreur: "signature refusée" }, { status: 401 });
  }
  return Response.json({ payees: await payerLesSortiesDeDemo() });
}
