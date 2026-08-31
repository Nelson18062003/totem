import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter } from "next/font/google";
import "./globals.css";
import { chargerTerminal, relie } from "@/lib/serveur";
import { exigerSession } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { Coquille } from "./coquille";
import { FournisseurLangue } from "./langue";

// L'état du terminal change à chaque instant : rien ne se fige à la
// compilation, chaque visite relit la base.
export const dynamic = "force-dynamic";

// La police du Simple Design System. Les reçus PDF, eux, gardent DM Sans —
// la police y est embarquée côté terminal (totem/polices/).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// DM Sans ne subsiste à l'écran que pour le MOT « TOTEM » (charte : le
// logotype ne se recompose pas dans une autre police). Une seule graisse.
const dmSans = DM_Sans({ subsets: ["latin"], weight: "700", variable: "--font-dm-sans" });

export async function generateMetadata(): Promise<Metadata> {
  const langue = await langueServeur();
  const titre =
    langue === "en" ? "TOTEM — Mobile Money control" : "TOTEM — pilotage Mobile Money";
  return {
    title: titre,
    description:
      langue === "en"
        ? "Manage your MTN Mobile Money and Orange Money SIM cards from anywhere. No more USSD menus."
        : "Gérez vos cartes SIM MTN Mobile Money et Orange Money d'où que vous soyez. Fini les menus USSD.",
    applicationName: "TOTEM",
    appleWebApp: { capable: true, title: "TOTEM", statusBarStyle: "default" },
    // Maquette : on ne veut pas la voir remonter dans les moteurs de recherche.
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#f5f5f5",
  width: "device-width",
  initialScale: 1,
  // Laisse l'utilisateur zoomer : c'est une question d'accessibilité.
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const langue = await langueServeur();
  // Le terminal seul : la coquille n'affiche que lui. Recharger les 1000 SMS
  // et les 1000 reçus ici doublait le coût de CHAQUE page.
  //
  // MAIS PAS POUR TOUT LE MONDE. Cette coquille enveloppe AUSSI les écrans
  // ouverts — la connexion, l'inscription, la page de confidentialité que
  // Google exige publique. Le nom du terminal, sa version et son état de
  // santé s'affichaient donc à qui ouvrait simplement l'écran de connexion.
  // Ce n'est pas de l'argent, mais ce n'est pas à un inconnu. On ne le
  // charge que pour qui a le droit d'être là ; on ne renvoie personne
  // d'ici, en revanche : c'est le rôle de chaque écran, et les écrans
  // ouverts doivent le rester.
  const entrant = await exigerSession();
  const terminal = relie && entrant.ok ? await chargerTerminal(langue) : null;
  return (
    <html lang={langue} className={`${inter.variable} ${dmSans.variable}`}>
      <body className="min-h-dvh">
        <FournisseurLangue langue={langue}>
          <Coquille relie={relie} terminal={terminal}>{children}</Coquille>
        </FournisseurLangue>
      </body>
    </html>
  );
}
