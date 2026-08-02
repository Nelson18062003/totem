import { cookies } from "next/headers";
import { COOKIE_SESSION } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Ferme la session : on efface le cookie signé. */
export async function POST() {
  const boite = await cookies();
  boite.delete(COOKIE_SESSION);
  return Response.json({ ok: true });
}
