import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSION, verifierSession } from "@/lib/session";
import { verifierLienRecu } from "@/lib/lien-signe";
import { COOKIE_LANGUE, langueDe } from "@noyau/langue";

// Le verrou de la plateforme. Tant que `SESSION_SECRET` n'est pas défini, il
// n'y a AUCUN verrou (utile en développement local) — mais dès qu'on le pose
// dans les variables d'environnement (Vercel), tout est protégé : plus rien
// ne se lit ni ne s'appelle sans une session valide.
//
// Ce qui reste toujours ouvert : la page de connexion et sa route.
// `/api/session` est la porte de l'application du téléphone : comme l'écran
// de connexion, elle doit rester ouverte — on ne peut pas exiger une session
// de celui qui vient justement en demander une.
// « /api/plateforme » est ouverte pour la même raison que « /connexion » : il
// faut pouvoir frapper à la porte avant d'avoir la clé. Elle ne rend qu'un
// « oui, un TOTEM habite ici » — c'est ce qui empêche l'application du
// téléphone d'envoyer le mot de passe du propriétaire à un serveur inconnu.
// « /inscription » et « /api/inscription » sont ouvertes pour la même raison
// que la connexion : on ne peut pas exiger un compte de celui qui vient
// justement en demander un. Ce qui les rend sûres n'est pas une porte fermée,
// c'est qu'un compte neuf n'ouvre RIEN tant que le propriétaire ne l'a pas
// approuvé (voir lib/porte.ts).
// « /confidentialite » est ouverte parce que Google Play l'exige à une
// adresse publique : un examinateur l'ouvre sans compte, depuis un lien collé
// dans un formulaire. Derrière le verrou, l'application serait refusée sans
// plus d'explication. La page ne contient aucune donnée — elle décrit ce que
// le logiciel fait. « /suppression » l'accompagne : le formulaire
// « Sécurité des données » du magasin exige une adresse publique où lire
// comment faire effacer son compte, et l'ouvre lui aussi sans compte.
const OUVERT = ["/connexion", "/inscription", "/confidentialite",
                "/suppression",
                "/api/connexion", "/api/deconnexion", "/api/inscription",
                "/api/session", "/api/plateforme"];

/** Le jeton porté par l'en-tête « Authorization: Bearer … », s'il y en a un. */
function jetonPorte(req: NextRequest): string | undefined {
  const porte = req.headers.get("authorization");
  if (!porte) return undefined;
  const [schema, valeur] = porte.split(" ");
  return schema?.toLowerCase() === "bearer" && valeur ? valeur : undefined;
}

export async function middleware(req: NextRequest) {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return NextResponse.next();          // verrou non activé

  const { pathname } = req.nextUrl;
  if (OUVERT.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // UN REÇU AU PORTEUR D'UN LIEN SIGNÉ. Le navigateur du téléphone n'a ni
  // cookie ni en-tête : l'application (elle, authentifiée) lui demande un
  // lien signé par la plateforme — dix minutes, CE reçu, rien d'autre. La
  // signature couvre le numéro ET l'échéance ; falsifiée ou périmée, on
  // retombe sur le verrou ordinaire, qui refusera. Le PDF seul est
  // concerné : « /lien » et « /fiche » restent derrière la porte.
  const recu = pathname.match(/^\/api\/recu\/([\w.-]{1,64})$/);
  if (recu && await verifierLienRecu(
        secret, recu[1],
        req.nextUrl.searchParams.get("e"), req.nextUrl.searchParams.get("s"))) {
    return NextResponse.next();
  }

  // Deux façons de présenter la MÊME session, selon qui frappe :
  //   — le navigateur l'a dans un cookie, posé par le serveur ;
  //   — l'application du téléphone la porte dans l'en-tête « Authorization »,
  //     parce qu'un téléphone n'a pas de cookie à offrir.
  // Le jeton est identique dans les deux cas, et vérifié par la même
  // signature : ajouter cette porte n'affaiblit rien, et le chemin du
  // navigateur n'est pas touché.
  const jeton = req.cookies.get(COOKIE_SESSION)?.value ?? jetonPorte(req);
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
