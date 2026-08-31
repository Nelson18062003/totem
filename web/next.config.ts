import type { NextConfig } from "next";

// LES EN-TÊTES DE SÉCURITÉ — ce que le navigateur doit savoir avant d'afficher
// quoi que ce soit d'ici.
//
// Ils ne dépendent de personne et ne changent jamais : leur place est ici. Le
// seul qui varie à chaque requête est la politique de contenu, qui porte un
// nonce — celui-là vit dans `middleware.ts`.
//
// Aucun de ces en-têtes ne répare un défaut. Ils font autre chose, et c'est
// ce qui les rend utiles : ils réduisent ce qu'un défaut PERMET, le jour où
// il y en a un.
const ENTETES = [
  // Le navigateur ne doit plus jamais revenir ici en clair, pendant deux ans.
  // Sans cela, la toute première visite d'une journée — celle qu'on tape sans
  // « https:// » — part en clair, avec le cookie de session dedans.
  //
  // « preload » n'est PAS posé : il engage le domaine sur une liste tenue par
  // les navigateurs, dont on ne se retire pas d'un geste. C'est au
  // propriétaire de le décider, pas à un fichier de configuration.
  { key: "strict-transport-security", value: "max-age=63072000; includeSubDomains" },

  // Un fichier servi comme du texte ne doit pas être exécuté comme un script
  // parce que le navigateur a « deviné » son type.
  { key: "x-content-type-options", value: "nosniff" },

  // Le détournement de clic. « frame-ancestors » (dans la politique de
  // contenu) fait le vrai travail ; celui-ci reste pour les navigateurs qui
  // ne lisent que lui.
  { key: "x-frame-options", value: "DENY" },

  // L'adresse d'une page d'ici ne part pas chez les autres. Elle peut porter
  // un numéro de reçu — et, sur un lien signé, sa signature.
  { key: "referrer-policy", value: "strict-origin-when-cross-origin" },

  // On ne demande ni caméra, ni micro, ni position, ni paiement du
  // navigateur. Autant le dire : ce qu'on n'autorise pas ne se vole pas.
  {
    key: "permissions-policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), " +
      "interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:chemin*", headers: ENTETES }];
  },
};

export default nextConfig;
