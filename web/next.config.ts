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
// Ce que la plateforme demande VRAIMENT au navigateur, vérifié : rien. Les
// seules adresses extérieures du dépôt (Supabase, le guichet d'Expo) sont
// appelées depuis le SERVEUR ; le navigateur, lui, ne parle qu'à sa propre
// origine. Les polices sont rapatriées à la compilation par `next/font`. La
// politique peut donc être fermée : tout vient de « self ».
//
// SUR « unsafe-inline » DANS script-src, et il faut être honnête : Next
// diffuse le rendu par des balises <script> EN LIGNE (le flux RSC). Sans
// cette permission, la page ne s'hydrate pas. La parade propre est un
// « nonce » par requête, posé dans le middleware — un chantier à part, sur un
// fichier déjà critique. En attendant, ce qui est acquis n'est pas rien : plus
// aucun script d'une AUTRE origine ne se charge, aucune donnée ne part vers
// une autre origine (connect-src), aucun formulaire ne se soumet ailleurs
// (form-action), et l'audit du code n'a trouvé AUCUN point d'injection HTML
// (pas un seul `dangerouslySetInnerHTML` dans tout le dépôt).
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",        // le cadre : la parade au clic détourné
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
].join("; ");

const enProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/:chemin*",
      headers: [
        { key: "Content-Security-Policy", value: CSP },
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
