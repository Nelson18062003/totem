import type { MetadataRoute } from "next";

/**
 * Permet d'ajouter TOTEM à l'écran d'accueil du téléphone : l'interface
 * s'ouvre alors en plein écran, sans barre de navigateur, comme une vraie
 * application.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TOTEM — pilotage Mobile Money",
    short_name: "TOTEM",
    description:
      "Pilotez vos SIM MTN Mobile Money et Orange Money à distance, depuis n'importe où dans le monde.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfbfc",
    theme_color: "#fbfbfc",
    lang: "fr",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
