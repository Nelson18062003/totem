import type { MetadataRoute } from "next";

/**
 * Permet d'ajouter TOTEM à l'écran d'accueil du téléphone : l'interface
 * s'ouvre alors en plein écran, sans barre de navigateur, comme une vraie
 * application.
 */
// Le manifeste est un fichier figé, servi hors session : il parle la langue
// principale de la plateforme, l'anglais. Les écrans, eux, suivent le réglage.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TOTEM — Mobile Money control",
    short_name: "TOTEM",
    description:
      "Run your MTN Mobile Money and Orange Money SIMs remotely, from anywhere in the world.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf9",
    theme_color: "#fbfaf9",
    lang: "en",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      // Les tuiles masquables : le symbole n'occupe que 66 % du carré, elles
      // survivent donc au rognage rond ou en goutte des lanceurs Android.
      // (Android ignore le SVG pour les icônes de manifeste : il faut du PNG.)
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
