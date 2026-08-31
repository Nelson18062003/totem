import type { NextConfig } from "next";

// LES EN-TÊTES DE SÉCURITÉ. Il n'y en avait AUCUN.
//
// Mesuré contre le serveur : ni CSP, ni protection contre l'encadrement, ni
// « nosniff », ni politique de référent. Pour une plateforme qui porte des
// boutons à un seul clic — lancer un geste USSD sur une carte qui contient de
// l'argent, fermer l'accès de quelqu'un — c'est le cadre (« clickjacking »)
// qui manquait le plus : une page pirate affiche TOTEM dans un cadre
// invisible, place son propre bouton par-dessus, et le propriétaire clique
// sans le savoir sur « Lancer ». Rien ne l'empêchait.
//
// LA POLITIQUE DE CONTENU N'EST PLUS ICI : elle est passée dans le middleware
// (voir `lib/csp.ts`). Elle porte maintenant un NONCE, tiré au hasard à
// chaque requête, et un fichier de configuration est lu une fois pour toutes
// au démarrage. Les en-têtes ci-dessous ne changent jamais : ils restent.
const enProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/:chemin*",
      headers: [
        // Redondant avec `frame-ancestors` pour les navigateurs anciens, qui
        // ignorent la CSP mais respectent celui-ci.
        { key: "X-Frame-Options", value: "DENY" },
        // Un PDF ou un CSV ne doit jamais être réinterprété en HTML.
        { key: "X-Content-Type-Options", value: "nosniff" },
        // LES LIENS SIGNÉS PORTENT LEUR SIGNATURE DANS L'ADRESSE. Sans cette
        // règle, ouvrir un reçu puis suivre un lien extérieur enverrait
        // l'adresse ENTIÈRE — signature comprise — au site visité.
        { key: "Referrer-Policy", value: "no-referrer" },
        // La plateforme n'a besoin d'aucun de ces appareils : on les refuse
        // plutôt que de compter sur le navigateur pour demander.
        { key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
        // En clair, HSTS est ignoré ; on ne le pose donc qu'en production, où
        // la plateforme est servie en https.
        ...(enProduction
          ? [{ key: "Strict-Transport-Security",
               value: "max-age=63072000; includeSubDomains; preload" }]
          : []),
      ],
    }];
  },
};

export default nextConfig;
