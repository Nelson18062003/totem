import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { Coquille } from "./coquille";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "TOTEM — pilotage Mobile Money",
  description:
    "Pilotez vos SIM MTN Mobile Money et Orange Money à distance, depuis n'importe où dans le monde.",
  applicationName: "TOTEM",
  appleWebApp: { capable: true, title: "TOTEM", statusBarStyle: "default" },
  // Maquette : on ne veut pas la voir remonter dans les moteurs de recherche.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf9",
  width: "device-width",
  initialScale: 1,
  // Laisse l'utilisateur zoomer : c'est une question d'accessibilité.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={dmSans.variable}>
      <body className="min-h-dvh">
        <Coquille>{children}</Coquille>
      </body>
    </html>
  );
}
