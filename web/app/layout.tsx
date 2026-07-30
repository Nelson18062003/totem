import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { Nav } from "./nav";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "TOTEM — pilotage Mobile Money",
  description: "Pilotez vos SIM MTN MoMo & Orange Money à distance, depuis partout.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={dmSans.variable}>
      <body className="min-h-dvh pb-28 md:pb-0 md:pl-60">
        <Nav />
        <main className="mx-auto w-full max-w-4xl px-4 py-5 md:px-8 md:py-9">{children}</main>
      </body>
    </html>
  );
}
