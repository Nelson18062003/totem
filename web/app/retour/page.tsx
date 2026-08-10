// « Je n'arrive plus à entrer » — l'écran qu'on ouvre en panique, souvent
// depuis le téléphone d'un proche.
//
// CET ÉCRAN EST OUVERT, ET IL NE PEUT PAS ÊTRE AUTRE CHOSE.
// Quelqu'un qui n'arrive pas à entrer n'a par définition pas de session.
// Exiger une présence ici reviendrait à demander d'être déjà entré pour
// signaler qu'on n'y arrive plus. La page ne lit RIEN : aucune donnée, aucun
// nom, aucun compte. Elle montre des chemins et un formulaire.
//
// FERMER VIENT AVANT RENTRER, ET C'EST TOUTE LA MISE EN PAGE.
// Quelqu'un dont le téléphone vient d'être arraché n'a pas besoin d'entrer :
// il a besoin que l'autre SORTE. Le geste « fermez tout, partout » est donc en
// haut, en premier, plus grand que le reste — et il ne demande ni mot de
// passe, ni code.
//
// LA TENSION, ET COMMENT ELLE EST TRANCHÉE
// Fermer n'exige aucune preuve, mais ne peut pas non plus être un bouton
// anonyme qui couperait n'importe qui à partir d'un nom. On demande donc
// l'adresse mail, le lien de fermeture part SUR cette adresse, et l'écran ne
// révèle jamais si le compte existe. Fermer par mail est acceptable là où
// entrer par mail ne le serait pas : une fermeture abusive ne coûte qu'une
// reconnexion. Le raisonnement complet est dans « lib/retour.ts ».
//
// ET QUAND PLUS RIEN NE MARCHE, ON LE DIT.
// Le dernier bloc ne fait pas semblant qu'une machine peut tout : il nomme la
// personne à prévenir, ce qu'il faut lui dire, et sous quel délai. Un
// « adressez-vous à l'assistance » sans nom ni phrase, c'est
// « débrouillez-vous » écrit poliment.

import Link from "next/link";
import { langueServeur } from "@/lib/langue-serveur";
import { textesRetour } from "@/lib/textes/retour";
import { Logo } from "@/app/marque";
import { BasculeLangue } from "@/app/langue";
import { IconChevron, IconDoc, IconHome, IconInbox, IconLock, IconPhone } from "@/app/icons";
import { DemandeDeFermeture } from "./interactifs";

export const dynamic = "force-dynamic";

export default async function PageRetour() {
  const langue = await langueServeur();
  const t = textesRetour[langue];

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-5">
      <header className="flex items-center gap-3">
        <Logo className="h-7" />
        <div className="ml-auto"><BasculeLangue /></div>
      </header>

      <section>
        <h1 className="text-title font-semibold tracking-tight text-balance">{t.titre}</h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.sousTitre}</p>
      </section>

      {/* 1 · FERMER. En premier, et le seul bloc cerclé de rouge de l'écran. */}
      <section className="rounded-card border-2 border-negative bg-surface-raised p-5">
        <p className="text-caption font-semibold uppercase tracking-wider text-negative">
          {t.fermerSurtitre}
        </p>
        <h2 className="mt-2 text-heading font-semibold">{t.fermerTitre}</h2>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.fermerQuoi}</p>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.fermerSansPreuve}</p>
        <DemandeDeFermeture />
      </section>

      {/* 2 · RENTRER, avec les trois chemins nommés et leur cas d'usage. */}
      <section>
        <h2 className="text-heading font-semibold">{t.rentrerTitre}</h2>
        <p className="mt-1 text-small leading-relaxed text-ink-soft">{t.rentrerSousTitre}</p>

        <ul className="mt-3 divide-hair overflow-hidden rounded-card bg-surface-raised shadow-sm">
          <Voie Icone={IconPhone} voie={t.voies.telephone} />
          <Voie Icone={IconInbox} voie={t.voies.courriel} />
          <Voie Icone={IconDoc} voie={t.voies.papier} />
        </ul>

        {/* Un refus n'est jamais un cul-de-sac : le geste suivant est là,
            même quand l'écran ne fait que décrire des chemins. */}
        <Link
          href="/connexion"
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-btn
                     bg-accent px-4 text-body font-medium text-white transition
                     hover:bg-accent-hover"
        >
          {t.allerEntrer}
          <IconChevron size={16} />
        </Link>
      </section>

      {/* 3 · LE RECOURS HUMAIN. Nommé, avec la phrase à dire et le délai. */}
      <section className="rounded-card bg-sable p-5">
        <div className="flex items-start gap-3">
          <IconHome size={20} className="mt-0.5 shrink-0 text-laterite" />
          <div>
            <h2 className="text-heading font-semibold">{t.humainTitre}</h2>
            <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.humainDit}</p>
          </div>
        </div>
        <div className="mt-4 rounded-btn bg-surface-raised px-4 py-3">
          <p className="text-small font-semibold">{t.humainQuoiDireTitre}</p>
          <p className="mt-1 text-small leading-relaxed text-ink-soft">{t.humainQuoiDire}</p>
        </div>
        <p className="mt-3 text-caption leading-relaxed text-ink-faint">{t.humainProprietaire}</p>
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">{t.humainDelai}</p>
      </section>

      {/* Ce qui continue de tourner pendant ce temps : dit ici parce que c'est
          la deuxième inquiétude, aussitôt après la première. */}
      <section className="rounded-card border border-line bg-surface-2 px-4 py-4">
        <p className="text-small font-semibold">{t.boutiqueTitre}</p>
        <p className="mt-1 text-caption leading-relaxed text-ink-soft">{t.boutiqueDit}</p>
      </section>

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

/* Une voie n'est pas un bouton : elle décrit, elle ne mène nulle part depuis
   ici — les trois chemins se prennent tous à l'écran d'entrée. La contraindre
   à une hauteur fixe obligerait à couper sa phrase, c'est-à-dire à cacher
   l'information qui sert à choisir. */
function Voie({
  Icone,
  voie,
}: {
  Icone: (p: { size?: number; className?: string }) => React.ReactElement;
  voie: { nom: string; quand: string; dit: string };
}) {
  return (
    <li className="flex min-h-14 items-start gap-3 px-4 py-4">
      <Icone size={20} className="mt-0.5 shrink-0 text-ink-soft" />
      <div>
        <p className="text-body font-semibold">{voie.nom}</p>
        <p className="mt-0.5 text-caption font-medium text-laterite">{voie.quand}</p>
        <p className="mt-1 text-small leading-relaxed text-ink-soft">{voie.dit}</p>
      </div>
    </li>
  );
}
