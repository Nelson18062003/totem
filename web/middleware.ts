import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSION, verifierSession } from "@/lib/session";
import { COOKIE_LANGUE, langueDe } from "@/lib/langue";

// Le portail de la plateforme.
//
// CE QUI A CHANGÉ, ET POURQUOI C'EST L'INVERSE D'AVANT
// Ce fichier faisait `return NextResponse.next()` quand `SESSION_SECRET`
// n'était pas défini : le verrou était FACULTATIF, et son absence ouvrait
// tout. Un déploiement de préproduction sans cette variable — un aperçu
// Vercel, une branche poussée — servait donc la comptabilité complète à qui
// devinait l'adresse. Un défaut qui s'ouvre n'est pas un défaut, c'est une
// porte.
//
// Désormais : pas de clé, pas de service. 503, et un message qui dit quoi
// faire plutôt que « erreur interne ».
//
// CE QUE CE FICHIER NE SAIT PAS FAIRE
// Il tourne en « edge » et ne fait aucun appel réseau : il vérifie que le
// jeton est authentique, pas que la session vit encore. Un jeton parfaitement
// signé peut appartenir à une session fermée il y a dix secondes. C'est
// `lib/garde.ts` qui tranche cela, sur le chemin de chaque page et de chaque
// route — ici on refoule seulement ce qui est manifestement faux.
//
// Ce qui reste ouvert : la porte elle-même, et l'invitation — une personne
// invitée n'a par définition pas encore de compte.
const OUVERT = ["/connexion", "/api/connexion", "/api/deconnexion", "/invitation", "/api/invitation"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const langue = langueDe(req.cookies.get(COOKIE_LANGUE)?.value);
  const secret = process.env.SESSION_SECRET || "";

  if (!secret) {
    // Sans clé, on ne sait rien vérifier — donc on ne sert rien. Le message
    // nomme la variable manquante : c'est une erreur d'installation, et celui
    // qui la lit est celui qui peut la corriger.
    const texte = langue === "en"
      ? "TOTEM is not configured: SESSION_SECRET is missing."
      : "TOTEM n'est pas configuré : la clé SESSION_SECRET manque.";
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erreur: texte }, { status: 503 });
    }
    return new NextResponse(texte, {
      status: 503, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  if (OUVERT.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const jeton = req.cookies.get(COOKIE_SESSION)?.value;
  if (await verifierSession(secret, jeton)) return NextResponse.next();

  // Une API répond « connexion requise » (le navigateur gère) ; une page
  // renvoie vers l'écran de connexion.
  if (pathname.startsWith("/api/")) {
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
