import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSION, verifierSession } from "@/lib/session";
import { COOKIE_LANGUE, langueDe } from "@noyau/langue";

// Le verrou de la plateforme. Tant que `SESSION_SECRET` n'est pas défini, il
// n'y a AUCUN verrou (utile en développement local) — mais dès qu'on le pose
// dans les variables d'environnement (Vercel), tout est protégé : plus rien
// ne se lit ni ne s'appelle sans une session valide.
//
// Ce qui reste toujours ouvert : la page de connexion et sa route.
const OUVERT = ["/connexion", "/api/connexion", "/api/deconnexion"];

export async function middleware(req: NextRequest) {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return NextResponse.next();          // verrou non activé

  const { pathname } = req.nextUrl;
  if (OUVERT.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const jeton = req.cookies.get(COOKIE_SESSION)?.value;
  if (await verifierSession(secret, jeton)) return NextResponse.next();

  // Une API répond « connexion requise » (le navigateur gère) ; une page
  // renvoie vers l'écran de connexion.
  if (pathname.startsWith("/api/")) {
    const langue = langueDe(req.cookies.get(COOKIE_LANGUE)?.value);
    const erreur = langue === "en" ? "sign-in required" : "connexion requise";
    return NextResponse.json({ erreur }, { status: 401 });
  }
  const versConnexion = req.nextUrl.clone();
  versConnexion.pathname = "/connexion";
  versConnexion.search = "";
  return NextResponse.redirect(versConnexion);
}

// On protège tout, sauf les fichiers statiques de Next et les icônes.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|apple-icon.png).*)",
  ],
};
