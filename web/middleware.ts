import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSION, verifierSession } from "@/lib/session";
import { verifierLien } from "@/lib/lien-signe";
import { COOKIE_LANGUE, langueDe } from "@noyau/langue";
import { erreurApi } from "@noyau/textes/api";

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

/**
 * LES EN-TÊTES QUI NE DÉPENDENT DE PERSONNE, posés sur toute réponse.
 *
 * Le seul qui demande une explication est la POLITIQUE DE CONTENU. Elle dit
 * au navigateur d'où il a le droit de charger quelque chose — et « nulle part
 * ailleurs qu'ici ». Sans elle, le moindre défaut d'échappement, un jour,
 * permettrait à un script étranger de lire l'écran et d'emporter le jeton.
 *
 * Le NONCE (un numéro tiré au hasard à chaque requête) évite le
 * « unsafe-inline » habituel : Next.js signe ses propres scripts d'amorçage
 * avec ce numéro, et le navigateur refuse tous les autres. Un script injecté
 * ne connaît pas le numéro du jour — il ne s'exécute donc pas. Les STYLES,
 * eux, gardent « unsafe-inline » : Next et Tailwind en posent en ligne, et
 * un style ne fait pas partir de données.
 *
 * « frame-ancestors 'none' » ferme le détournement de clic : plus personne ne
 * met cette plateforme dans un cadre invisible sous ses propres boutons. Les
 * écrans d'ici font bouger de l'argent en un appui.
 */
function habiller(reponse: NextResponse, nonce: string): NextResponse {
  reponse.headers.set("content-security-policy", [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Aucun greffon, aucun <object>, aucun <embed>. Les PDF de la plateforme
    // ne passent pas par là : ils s'ouvrent en NAVIGATION (un « blob » dans
    // un onglet, voir app/coordonnees.tsx), ce que cette ligne ne touche
    // pas — vérifié dans un vrai navigateur, sans un refus.
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self'",
    "upgrade-insecure-requests",
  ].join("; "));
  return reponse;
}

/** Une réponse ordinaire, habillée, qui transporte le nonce jusqu'au rendu. */
function passer(req: NextRequest, nonce: string): NextResponse {
  const entetes = new Headers(req.headers);
  // Next.js lit ce nonce et le recopie sur ses propres balises <script>.
  entetes.set("x-nonce", nonce);
  return habiller(
    NextResponse.next({ request: { headers: entetes } }), nonce);
}

export async function middleware(req: NextRequest) {
  const secret = process.env.SESSION_SECRET || "";
  const { pathname } = req.nextUrl;
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const ouvert = OUVERT.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!secret) {
    // SANS SECRET, IL N'Y A AUCUN VERROU. En développement local c'est une
    // commodité assumée. EN PRODUCTION, c'est une plateforme grande ouverte :
    // 302 paiements et 203 reçus servis à qui passe, en silence, parce qu'une
    // variable a sauté d'un réglage d'hébergement.
    //
    // On ne s'ouvre donc pas : on se tait. Les écrans OUVERTS restent
    // atteignables — la connexion doit pouvoir dire « cette plateforme n'est
    // pas configurée », et « /api/plateforme » doit pouvoir le répondre à
    // l'application du téléphone, qui sait alors le nommer au lieu d'afficher
    // « connexion impossible ». Aucun d'eux ne sert de données, et la porte
    // elle-même refuse déjà (voir lib/porte.ts). Tout le reste : rien.
    if (process.env.NODE_ENV === "production" && !ouvert) {
      const langue = langueDe(req.cookies.get(COOKIE_LANGUE)?.value);
      // Le texte existe déjà, en deux langues : « connexion non configurée
      // sur ce déploiement ». C'est exactement ce dont il s'agit, et la
      // porte le dit déjà à qui essaie de se connecter (lib/porte.ts).
      return habiller(
        pathname.startsWith("/api/")
          ? NextResponse.json(
              { erreur: erreurApi(langue, "connexionNonConfiguree") },
              { status: 503 })
          : NextResponse.redirect(new URL("/connexion", req.nextUrl)),
        nonce);
    }
    return passer(req, nonce);                      // verrou non activé
  }

  if (ouvert) return passer(req, nonce);

  // UN DOCUMENT AU PORTEUR D'UN LIEN SIGNÉ. Le navigateur du téléphone n'a
  // ni cookie ni en-tête : l'application (elle, authentifiée) lui demande un
  // lien signé par la plateforme — dix minutes, CE document, rien d'autre.
  // La signature couvre le genre, l'identifiant ET l'échéance ; falsifiée,
  // périmée ou présentée à la mauvaise porte (un lien de reçu sur des
  // coordonnées), on retombe sur le verrou ordinaire, qui refusera. Les PDF
  // seuls sont concernés : « /lien » et « /fiche » restent derrière la porte.
  const recu = pathname.match(/^\/api\/recu\/([\w.-]{1,64})$/);
  if (recu && await verifierLien(
        secret, "recu", recu[1],
        req.nextUrl.searchParams.get("e"), req.nextUrl.searchParams.get("s"))) {
    return passer(req, nonce);
  }
  const coordonnees = pathname.match(/^\/api\/coordonnees\/(\w{1,32})$/);
  if (coordonnees && await verifierLien(
        secret, "coordonnees", coordonnees[1],
        req.nextUrl.searchParams.get("e"), req.nextUrl.searchParams.get("s"))) {
    return passer(req, nonce);
  }
  // Le bilan CSV : la signature couvre le NOMBRE DE JOURS demandé — un lien
  // signé pour la semaine n'ouvre pas le trimestre.
  const jours = req.nextUrl.searchParams.get("jours");
  if (pathname === "/api/bilan" && jours && /^\d{1,2}$/.test(jours)
      && await verifierLien(secret, "bilan", jours,
           req.nextUrl.searchParams.get("e"), req.nextUrl.searchParams.get("s"))) {
    return passer(req, nonce);
  }

  // Deux façons de présenter la MÊME session, selon qui frappe :
  //   — le navigateur l'a dans un cookie, posé par le serveur ;
  //   — l'application du téléphone la porte dans l'en-tête « Authorization »,
  //     parce qu'un téléphone n'a pas de cookie à offrir.
  // Le jeton est identique dans les deux cas, et vérifié par la même
  // signature : ajouter cette porte n'affaiblit rien, et le chemin du
  // navigateur n'est pas touché.
  const jeton = req.cookies.get(COOKIE_SESSION)?.value ?? jetonPorte(req);
  if (await verifierSession(secret, jeton)) return passer(req, nonce);

  // Une API répond « connexion requise » (le navigateur gère) ; une page
  // renvoie vers l'écran de connexion.
  if (pathname.startsWith("/api/")) {
    const langue = langueDe(req.cookies.get(COOKIE_LANGUE)?.value);
    return habiller(NextResponse.json(
      { erreur: erreurApi(langue, "connexionRequise") }, { status: 401 }), nonce);
  }
  const versConnexion = req.nextUrl.clone();
  versConnexion.pathname = "/connexion";
  versConnexion.search = "";
  return habiller(NextResponse.redirect(versConnexion), nonce);
}

// On protège tout, sauf les fichiers statiques de Next et les icônes.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|apple-icon.png).*)",
  ],
};
