import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { chargerTerminal, relie } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { Coquille } from "./coquille";
import { FournisseurLangue } from "./langue";

// L'état du terminal change à chaque instant : rien ne se fige à la
// compilation, chaque visite relit la base.
export const dynamic = "force-dynamic";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export async function generateMetadata(): Promise<Metadata> {
  const langue = await langueServeur();
  const titre =
    langue === "en" ? "TOTEM — Mobile Money control" : "TOTEM — pilotage Mobile Money";
  return {
    title: titre,
    description:
      langue === "en"
        ? "Run your MTN Mobile Money and Orange Money SIMs remotely, from anywhere in the world."
        : "Pilotez vos SIM MTN Mobile Money et Orange Money à distance, depuis n'importe où dans le monde.",
    applicationName: "TOTEM",
    appleWebApp: { capable: true, title: "TOTEM", statusBarStyle: "default" },
    // Maquette : on ne veut pas la voir remonter dans les moteurs de recherche.
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#fbfaf9",
  width: "device-width",
  initialScale: 1,
  // Laisse l'utilisateur zoomer : c'est une question d'accessibilité.
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const langue = await langueServeur();
  // Le terminal seul : la coquille n'affiche que lui. Recharger les 1000 SMS
  // et les 1000 reçus ici doublait le coût de CHAQUE page.
  const terminal = relie ? await chargerTerminal(langue) : null;
  return (
    <html lang={langue} className={dmSans.variable}>
      <body className="min-h-dvh">
        <FournisseurLangue langue={langue}>
          <Coquille relie={relie} terminal={terminal}>{children}</Coquille>
        </FournisseurLangue>
      </body>
    </html>
  );
}
