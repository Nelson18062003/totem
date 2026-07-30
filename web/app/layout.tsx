import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { BandeauDemo } from "./demo";
import { Nav } from "./nav";

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
  themeColor: "#fbfbfc",
  width: "device-width",
  initialScale: 1,
  // Laisse l'utilisateur zoomer : c'est une question d'accessibilité.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={dmSans.variable}>
      <body className="min-h-dvh pb-28 md:pb-0 md:pl-60">
        <Nav />
        <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-8 md:py-9">
          <BandeauDemo />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
