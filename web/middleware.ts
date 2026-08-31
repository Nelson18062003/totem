import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSION, compteDuSujet, sujetDeSession } from "@/lib/session";
import { compteEncoreOuvert } from "@/lib/session-vivante";
import { verifierLien } from "@/lib/lien-signe";
import { COOKIE_LANGUE, langueDe } from "@noyau/langue";
import { nonceNeuf, politiqueCsp } from "@/lib/csp";

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
  const { pathname } = req.nextUrl;

  // LE NONCE DE LA PAGE — un jeton tiré au hasard, valable pour cette requête
  // et pour elle seule. C'est lui qui distingue les scripts de la plateforme
  // de tous les autres : sans lui, un script en ligne ne s'exécute pas.
  //
  // Il se pose ICI parce que le middleware est le seul endroit traversé par
  // toutes les réponses, et parce qu'un nonce doit changer à chaque page — un
  // fichier de configuration, lui, est lu une fois au démarrage.
  //
  // Next le trouve dans la CSP portée par la REQUÊTE : c'est ainsi qu'il sait
  // quel nonce apposer sur ses propres balises de rendu. Sans cette
  // transmission, la politique serait juste et la page ne s'afficherait pas.
  const nonce = nonceNeuf();
  const csp = politiqueCsp(nonce, process.env.NODE_ENV !== "production");

  /** Laisser passer, en emportant le nonce dans les deux sens. */
  const passer = () => {
    const entetes = new Headers(req.headers);
    entetes.set("x-nonce", nonce);
    entetes.set("content-security-policy", csp);
    const reponse = NextResponse.next({ request: { headers: entetes } });
    reponse.headers.set("content-security-policy", csp);
    return reponse;
  };

  /** Une réponse qui ne traverse pas l'application porte la politique aussi :
   *  une page de refus ou une redirection reste une page. */
  const avecCsp = (reponse: NextResponse) => {
    reponse.headers.set("content-security-policy", csp);
    return reponse;
  };

  // SANS CLÉ, PAS DE VERROU — et c'est une commodité de DÉVELOPPEMENT, pas un
  // mode d'exploitation. En production, l'absence de `SESSION_SECRET` ouvrait
  // la plateforme entière : les SMS, les soldes, le bilan, et jusqu'à
  // « composer un code USSD sur une carte qui porte de l'argent » — car les
  // gardes des routes sensibles sont elles aussi écrites « si SESSION_SECRET
  // est posé, alors vérifier », donc elles se taisaient de concert.
  //
  // Rien ne distinguait le local de la production. Or les variables
  // d'environnement de Vercel se posent PAR ENVIRONNEMENT : la clé mise sur
  // « Production » seulement, et chaque déploiement de prévisualisation — une
  // URL publique par branche — devenait un TOTEM sans serrure, branché sur la
  // vraie base. `/api/plateforme` annonçait même l'état de la serrure à qui
  // demandait.
  //
  // Hors développement, on refuse donc tout : mieux vaut une plateforme
  // injoignable, qu'on répare en posant la clé, qu'une plateforme ouverte
  // dont personne ne sait qu'elle l'est.
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return passer();
    if (pathname.startsWith("/api/")) {
      return avecCsp(NextResponse.json(
        { erreur: "plateforme non configurée" }, { status: 503 }));
    }
    return avecCsp(new NextResponse(
      "TOTEM n'est pas configuré : la clé de session manque.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }));
  }

  if (OUVERT.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return passer();
  }

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
    return passer();
  }
  const coordonnees = pathname.match(/^\/api\/coordonnees\/(\w{1,32})$/);
  if (coordonnees && await verifierLien(
        secret, "coordonnees", coordonnees[1],
        req.nextUrl.searchParams.get("e"), req.nextUrl.searchParams.get("s"))) {
    return passer();
  }
  // Le bilan CSV : la signature couvre le NOMBRE DE JOURS demandé — un lien
  // signé pour la semaine n'ouvre pas le trimestre.
  const jours = req.nextUrl.searchParams.get("jours");
  if (pathname === "/api/bilan" && jours && /^\d{1,2}$/.test(jours)
      && await verifierLien(secret, "bilan", jours,
           req.nextUrl.searchParams.get("e"), req.nextUrl.searchParams.get("s"))) {
    return passer();
  }

  // Deux façons de présenter la MÊME session, selon qui frappe :
  //   — le navigateur l'a dans un cookie, posé par le serveur ;
  //   — l'application du téléphone la porte dans l'en-tête « Authorization »,
  //     parce qu'un téléphone n'a pas de cookie à offrir.
  // Le jeton est identique dans les deux cas, et vérifié par la même
  // signature : ajouter cette porte n'affaiblit rien, et le chemin du
  // navigateur n'est pas touché.
  const jeton = req.cookies.get(COOKIE_SESSION)?.value ?? jetonPorte(req);
  const sujet = await sujetDeSession(secret, jeton);
  if (sujet !== null) {
    // LE JETON NE SUFFIT PAS : le compte doit exister encore.
    //
    // Un jeton vit trente jours. Sans cette lecture, fermer ou supprimer un
    // compte ne fermait rien du tout — celui qui détenait déjà le sien
    // continuait de lire les SMS, les soldes et le bilan pendant un mois.
    // C'est ici, au seul endroit que TOUTES les routes traversent, plutôt
    // que route par route où l'oubli est certain.
    //
    // `compteDuSujet` rend null pour la clé de SECOURS et pour les jetons
    // d'avant les comptes : ceux-là ne désignent personne en base, il n'y a
    // donc rien à y relire — la clé de secours existe justement pour le jour
    // où la base des comptes est injoignable.
    const id = compteDuSujet(sujet);
    if (id === null || await compteEncoreOuvert(id)) return passer();
  }

  // Une API répond « connexion requise » (le navigateur gère) ; une page
  // renvoie vers l'écran de connexion.
  if (pathname.startsWith("/api/")) {
    const langue = langueDe(req.cookies.get(COOKIE_LANGUE)?.value);
    const erreur = langue === "en" ? "sign-in required" : "connexion requise";
    return avecCsp(NextResponse.json({ erreur }, { status: 401 }));
  }
  const versConnexion = req.nextUrl.clone();
  versConnexion.pathname = "/connexion";
  versConnexion.search = "";
  return avecCsp(NextResponse.redirect(versConnexion));
}

// On protège tout, sauf les fichiers statiques de Next et les icônes.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|apple-icon.png).*)",
  ],
};
