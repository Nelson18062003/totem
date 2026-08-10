// La page qu'ouvre le lien reçu par courriel.
//
// ELLE NE LIT RIEN, ET C'EST LE POINT.
// Elle ne va pas voir en base si le jeton vaut quelque chose, elle ne dit pas
// à qui il appartient, elle ne montre aucun nom. Deux raisons, et chacune
// suffirait :
//
// · Le jeton ne sert qu'une fois. Si l'ouverture du lien le consommait, le
//   premier antivirus de messagerie qui va voir où mènent les liens brûlerait
//   le seul lien de la personne, et elle trouverait « ce lien ne marche plus »
//   sans que rien n'ait été fermé. C'est le bouton qui ferme, pas le lien.
//
// · Une page ouverte qui ne lit rien n'a rien à laisser fuir. Le jeton est
//   assez long pour ne pas se deviner ; qui l'a vaut la preuve, et la route
//   qui l'échange est la seule à toucher la base.
//
// Comme /retour, elle est OUVERTE : quelqu'un dont le compte doit être fermé
// n'a par construction aucune session à présenter.

import { langueServeur } from "@/lib/langue-serveur";
import { textesRetour } from "@/lib/textes/retour";
import { Logo } from "@/app/marque";
import { BasculeLangue } from "@/app/langue";
import { IconLock } from "@/app/icons";
import { BoutonDeFermeture } from "../../interactifs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ jeton: string }> };

export default async function PageFermer({ params }: Params) {
  const langue = await langueServeur();
  const t = textesRetour[langue];
  const { jeton } = await params;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-5">
      <header className="flex items-center gap-3">
        <Logo className="h-7" />
        <div className="ml-auto"><BasculeLangue /></div>
      </header>

      <BoutonDeFermeture jeton={jeton} />

      <section className="mt-auto flex gap-3 rounded-card border border-line
                          bg-surface-raised px-4 py-4">
        <IconLock size={20} className="mt-0.5 shrink-0 text-laterite" />
        <div>
          <p className="text-small font-semibold">{t.pinTitre}</p>
          <p className="mt-1 text-caption leading-relaxed text-ink-faint">{t.pinDit}</p>
        </div>
      </section>
    </main>
  );
}
