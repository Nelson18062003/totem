// Le papier de dix codes — l'écran qui les montre une seule fois.
//
// CE QUE CET ÉCRAN PROMET, ET QU'IL PEUT TENIR
// « Nous ne pouvons pas vous les remontrer. » C'est vrai : la base ne garde
// qu'une empreinte de chaque code (voir lib/papier.ts). La phrase n'est pas
// une menace pour faire imprimer, c'est la description exacte de ce qui se
// passe — et c'est pour cela qu'on peut l'écrire sans mentir.
//
// CE QU'ON NE PROPOSERA JAMAIS ICI : L'ENVOI PAR MAIL.
// Envoyer le secours dans la boîte qu'il secourt n'a aucun sens — le jour où
// ce papier sert, c'est justement cette boîte-là qui est hors de portée. Ni
// bouton, ni « envoyez-vous une copie », ni pièce jointe. Imprimer,
// enregistrer, copier : trois gestes qui finissent hors ligne.
//
// AU RETOUR, PLUS TARD
// La page se rouvre sans rien remontrer : elle compte ce qui reste. C'est la
// seule chose qu'elle sache dire, et c'est celle dont la personne a besoin —
// « il vous en reste deux » se comprend, « votre papier est actif » ne veut
// rien dire.

import { exigerPresence } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { etatDuPapier, PAR_SERIE } from "@/lib/papier";
import { textesPapier } from "@/lib/textes/papier";
import { Logo } from "@/app/marque";
import { BasculeLangue } from "@/app/langue";
import { Feuille } from "./feuille";

export const dynamic = "force-dynamic";

export default async function PagePapier() {
  const moi = await exigerPresence();
  const langue = await langueServeur();
  const t = textesPapier[langue];

  const etat = await etatDuPapier(moi.personne);

  // Les dates sont mises en forme ICI, sur le serveur : formatée dans le
  // navigateur, la même date change de tête entre le premier rendu et le
  // second, et React signale une page qui a menti.
  const jour = (iso: string) =>
    new Date(iso).toLocaleDateString(langue === "en" ? "en-GB" : "fr-FR", {
      day: "numeric", month: "long", year: "numeric",
    });

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 py-5">
      <header className="flex items-center gap-3 print:hidden">
        <Logo className="h-7" />
        <div className="ml-auto"><BasculeLangue /></div>
      </header>

      <section className="print:hidden">
        <h1 className="text-title font-semibold tracking-tight text-balance">{t.titre}</h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.aQuoiCaSert}</p>
      </section>

      <Feuille
        t={t}
        nom={moi.nom}
        aujourdhui={jour(new Date().toISOString())}
        total={PAR_SERIE}
        etat={etat && {
          serie: etat.serie,
          restants: etat.restants,
          fabriqueLe: jour(etat.fabriqueLe),
        }}
      />
    </main>
  );
}
