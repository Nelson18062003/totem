// Les six chiffres, juste après l'acceptation de l'invitation.
//
// CETTE PAGE EST OUVERTE, ET C'EST LA SUITE DIRECTE DE LA PRÉCÉDENTE
// La personne n'a pas de compte : elle est en train d'en obtenir un. Elle
// n'appelle donc pas la garde, et l'exception doit être inscrite dans
// `tests/test_garde_partout.py` avec sa raison. Ce qui la garde à la place :
// le jeton d'invitation, qu'il faut connaître, et qui ne donne accès qu'à ce
// qu'on savait déjà en arrivant — l'adresse masquée d'une boîte mail.
//
// TROIS PARTIS PRIS
//
// · L'ADRESSE EST RELUE EN BASE, jamais reçue du navigateur. Le code part sur
//   l'adresse que la propriétaire a saisie, pas sur celle qu'on taperait ici.
//   C'est ce qui protège le lien qui a circulé dans un groupe WhatsApp.
//
// · ELLE EST MASQUÉE — « je·····@boutique.cm ». Assez pour reconnaître sa
//   boîte, pas assez pour l'apprendre à quarante personnes qui regardent
//   l'écran par-dessus l'épaule.
//
// · RIEN N'EST ENCORE CRÉÉ EN ARRIVANT ICI. Le compte naît à la seconde où
//   les six chiffres marchent, et pas avant : quelqu'un qui ouvre cette page
//   et s'en va n'a rien laissé derrière lui.

import Link from "next/link";
import { langueServeur } from "@/lib/langue-serveur";
import { courrielMasque, ouvrirInvitation } from "@/lib/invitations";
import { textesCode } from "@/lib/textes/code";
import { textesInvitation } from "@/lib/textes/invitation";
import { Logo } from "@/app/marque";
import { BasculeLangue } from "@/app/langue";
import { IconChevron } from "@/app/icons";
import { FormulaireCode } from "./formulaire";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ jeton: string }> };

export default async function PageCode({ params }: Params) {
  const langue = await langueServeur();
  const t = textesCode[langue];
  const { jeton } = await params;

  const resultat = await ouvrirInvitation(jeton);

  // L'invitation n'ouvre plus : on le dit ici plutôt que d'envoyer un code
  // qui ne servirait à rien. Les quatre phrases sont celles de l'écran
  // précédent — une seule source, et aucune divergence à surveiller.
  if (typeof resultat === "string") {
    const echec = textesInvitation[langue].echec[resultat];
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-5">
        <Tete />
        <section className="rounded-card bg-surface-raised px-5 py-6 shadow-sm">
          <h1 className="text-title font-semibold tracking-tight text-balance">
            {echec.titre}
          </h1>
          <p className="mt-2 text-small leading-relaxed text-ink-soft">{echec.dit}</p>
        </section>
        <p className="px-1 text-caption leading-relaxed text-ink-faint">
          {textesInvitation[langue].pourquoiUnLienNeSuffitPas}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-5">
      <Tete />

      {/* Revenir en arrière ne coûte rien et ne défait rien : la page
          précédente est encore là, avec le rôle et le commerce écrits. */}
      <Link href={`/invitation/${jeton}`}
            className="mt-4 -ml-1 flex h-11 w-fit items-center gap-2 pr-3 text-small text-ink-soft">
        <IconChevron size={18} className="rotate-180" />
        {t.retour}
      </Link>

      <h1 className="mt-2 text-title font-semibold tracking-tight text-balance">
        {t.titre}
      </h1>

      <FormulaireCode jeton={jeton} adresse={courrielMasque(resultat.courriel)} />
    </main>
  );
}

function Tete() {
  return (
    <header className="flex items-center gap-3">
      <Logo className="h-7" />
      <div className="ml-auto"><BasculeLangue /></div>
    </header>
  );
}
