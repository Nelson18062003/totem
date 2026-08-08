// L'invitation, telle qu'elle s'ouvre sur le téléphone du comptoir.
//
// C'est le seul écran de TOTEM vu par quelqu'un qui n'a encore aucun compte,
// aucune préférence de langue enregistrée, et aucune raison de nous faire
// confiance. Il doit donc tenir sans rien supposer.
//
// TROIS PARTIS PRIS
//
// · La bascule de langue est en haut, AVANT tout le reste. La personne qui
//   ouvre ce lien n'a rien choisi, et personne n'a choisi pour elle.
//
// · Ouvrir le lien ne crée RIEN. La page montre qui invite, quel commerce,
//   quel rôle — et attend. Le compte naîtra après le code. Quelqu'un qui ouvre
//   par curiosité, ou par erreur, ne doit rien déclencher.
//
// · Ce que le rôle permet et ce qu'il interdit est dit AVANT d'accepter. Un
//   rôle qu'on découvre plus tard, par un refus, se vit comme une panne — et
//   pousse à emprunter le compte du patron.

import Link from "next/link";
import { langueServeur } from "@/lib/langue-serveur";
import { textesInvitation } from "@/lib/textes/invitation";
import { numeroMasque, ouvrirInvitation, type LigneInvitation } from "@/lib/invitations";
import { lireUne } from "@/lib/base";
import { Logo } from "@/app/marque";
import { BasculeLangue } from "@/app/langue";
import { IconLock, IconClose, IconChevron } from "@/app/icons";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ jeton: string }> };

export default async function PageInvitation({ params }: Params) {
  const langue = await langueServeur();
  const t = textesInvitation[langue];
  const { jeton } = await params;

  const resultat = await ouvrirInvitation(jeton);

  if (typeof resultat === "string") {
    return <Refus texte={t.echec[resultat]} pourquoi={t.pourquoiUnLienNeSuffitPas} />;
  }

  const inv = resultat;
  const commerce = await lireUne<{ nom: string }>(
    `commerces?id=eq.${encodeURIComponent(inv.commerce)}&select=nom&limit=1`);
  const invitant = await lireUne<{ nom: string }>(
    inv.creee_par ? `personnes?id=eq.${inv.creee_par}&select=nom&limit=1` : "personnes?id=eq.0");

  const nomInvitant = invitant?.nom ?? "TOTEM";
  const peut = t.peut[inv.role];
  const peutPas = t.peutPas[inv.role];

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-5">
      <header className="flex items-center gap-3">
        <Logo className="h-7" />
        <div className="ml-auto"><BasculeLangue /></div>
      </header>

      {/* Le seuil. Le claustra est autorisé ici — c'est un écran qui parle de
          TOTEM, pas un écran qui porte un montant (docs/IDENTITE.md §3). */}
      <section className="claustra rounded-card px-5 py-6">
        <h1 className="text-title font-semibold tracking-tight text-balance">
          {t.titre(nomInvitant)}
        </h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.sousTitre}</p>
      </section>

      <section className="divide-hair overflow-hidden rounded-card bg-surface-raised shadow-sm">
        <Fait libelle={t.invitePar} valeur={nomInvitant} />
        <Fait libelle={t.leCommerce} valeur={commerce?.nom ?? inv.commerce} />
        <Fait libelle={t.vousSerez} valeur={t.role[inv.role]} />
      </section>

      <section>
        <h2 className="mb-3 text-caption font-semibold uppercase tracking-wider text-ink-faint">
          {t.ceQueCaVeutDire}
        </h2>
        <ul className="flex flex-col gap-2.5">
          {peut.map((ligne) => (
            <li key={ligne} className="flex items-start gap-3 text-small leading-relaxed">
              <IconChevron size={18} className="mt-0.5 shrink-0 text-positive" />
              <span>{ligne}</span>
            </li>
          ))}
          {peutPas.map((ligne) => (
            <li key={ligne}
                className="flex items-start gap-3 text-small leading-relaxed text-ink-faint">
              <IconClose size={18} className="mt-0.5 shrink-0" />
              <span>{ligne}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-1">
        {/* Un lien, pas un bouton : accepter mène à l'étape du code, et rien
            n'est encore créé. Un formulaire ferait croire à un engagement. */}
        <Link
          href={`/invitation/${jeton}/code`}
          className="flex h-12 w-full items-center justify-center rounded-btn bg-accent
                     px-4 text-body font-medium text-white transition hover:bg-accent-hover">
          {t.accepter}
        </Link>
        <p className="mt-3 text-center text-caption text-ink-faint">
          {t.apres(numeroMasque(inv.telephone))}
        </p>
      </section>

      <NoteePin titre={t.jamaisPinTitre} texte={t.jamaisPin} />
    </main>
  );
}

function Fait({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      <div>
        <div className="text-caption text-ink-faint">{libelle}</div>
        <div className="mt-0.5 text-body font-semibold">{valeur}</div>
      </div>
    </div>
  );
}

/* La phrase qui protège vraiment. Elle n'est pas là pour rassurer : elle est
   là parce que c'est la personne qu'on hameçonne, pas la machine. */
function NoteePin({ titre, texte }: { titre: string; texte: string }) {
  return (
    <section className="mt-auto flex gap-3 rounded-card border border-line
                        bg-surface-raised px-4 py-4">
      <IconLock size={20} className="mt-0.5 shrink-0 text-laterite" />
      <div>
        <div className="text-small font-semibold">{titre}</div>
        <p className="mt-1 text-caption leading-relaxed text-ink-faint">{texte}</p>
      </div>
    </section>
  );
}

/* Un lien qui n'ouvre pas n'est jamais un cul-de-sac : chaque refus porte le
   geste suivant, et aucun ne dit « lien invalide » — cette phrase-là pousse à
   réessayer, alors que dans trois cas sur quatre il faut prévenir quelqu'un. */
function Refus({ texte, pourquoi }:
                { texte: { titre: string; dit: string }; pourquoi: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-5">
      <header className="flex items-center gap-3">
        <Logo className="h-7" />
        <div className="ml-auto"><BasculeLangue /></div>
      </header>
      <section className="rounded-card bg-surface-raised px-5 py-6 shadow-sm">
        <h1 className="text-title font-semibold tracking-tight text-balance">{texte.titre}</h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{texte.dit}</p>
      </section>
      <p className="px-1 text-caption leading-relaxed text-ink-faint">{pourquoi}</p>
    </main>
  );
}
