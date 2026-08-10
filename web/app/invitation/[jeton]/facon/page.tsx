// « Comment voulez-vous entrer, désormais ? »
//
// L'instant exact : les six chiffres viennent de marcher, le compte existe, la
// session est ouverte. La personne est DÉJÀ dedans. Tout ce que cet écran
// propose est donc facultatif, et il doit se voir — un écran qui ressemble à
// une formalité obligatoire se traverse au galop, et le papier de secours ne
// se fabrique jamais.
//
// L'ORDRE, ET IL N'EST PAS ARBITRAIRE
// Le verrouillage du téléphone d'abord (c'est le chemin de tous les jours),
// le papier ensuite (c'est le chemin du jour où plus rien ne marche), la
// boutique en dernier. Le papier vient AVANT la première sortie, pas au
// dixième écran : un compte créé sans filet, c'est un commerçant coupé de son
// propre argent dans six mois.
//
// ---------------------------------------------------------------------------
// OÙ SE POSE LA QUESTION « CE TÉLÉPHONE EST-IL À VOUS, OU À LA BOUTIQUE ? »
//
// La maquette la posait ici. Elle est posée ici, mais elle ne DÉCIDE pas ici,
// et il faut savoir pourquoi.
//
// `partage` est une propriété de la SESSION, écrite une fois pour toutes par
// `ouvrirSession()` (web/lib/sessions.ts) : c'est elle qui fixe la durée —
// douze heures sur un téléphone personnel, dix sur un combiné de comptoir. La
// session dont nous héritons ici a donc DÉJÀ sa durée. Cocher une case sur cet
// écran ne peut plus la raccourcir : la seule chose qu'on obtiendrait serait
// un écran qui affirme quelque chose que la session ne tient pas.
//
// Alors on répartit, chacun à l'endroit où sa réponse a encore un effet :
//
//   · à la porte (l'écran des six chiffres, et /connexion), la question fixe
//     la durée de la session ET le droit de poser une clé. C'est là qu'elle
//     doit être posée en premier — voir le rapport de livraison ;
//   · ici, elle commande la seule chose qui reste ouverte : proposer une clé,
//     ou ne pas la proposer. Et elle la RETIRE, elle n'ajoute pas un
//     avertissement à côté d'un bouton qu'on peut quand même appuyer.
//
// Et quand la session est déjà déclarée partagée, on ne pose plus la question
// du tout : la réponse est connue, la redemander donnerait le sentiment qu'on
// peut la changer d'un clic. `proposerUneCle(partage)` tranche, dans
// « lib/cles.ts », et ce refus n'est pas une option de réglage.
//
// AUJOURD'HUI, PERSONNE NE LA POSE À LA PORTE. « /api/code/verifier » ouvre la
// session avec « partage: false » écrit en dur, et « /api/connexion » attend un
// champ qu'aucun écran ne lui envoie. Tant que cela dure, cet écran est le SEUL
// endroit où la question existe — et une clé ne se pose pas sur un combiné dont
// personne n'a demandé à qui il est. Le jour où la porte la posera, il suffira
// de remplacer « ChoixDuTelephone » par le bouton « PoserUneCle » seul, plus
// bas : une ligne, et l'écran ne garde que le refus.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { exigerPresence } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { proposerUneCle } from "@/lib/cles";
import { textesFacon } from "@/lib/textes/facon";
import { textesCles } from "@/lib/textes/cles";
import { Logo } from "@/app/marque";
import { BasculeLangue } from "@/app/langue";
import { IconDoc, IconLock } from "@/app/icons";
import { ChoixDuTelephone, SurLeComptoir } from "./choix-du-telephone";

export const dynamic = "force-dynamic";

export default async function PageFacon() {
  const moi = await exigerPresence();
  const langue = await langueServeur();
  const t = textesFacon[langue];

  // Le refus qui compte. Il tient dans une ligne, et il vient de la session
  // elle-même : personne ne le contourne depuis l'écran.
  const surLeComptoir = !proposerUneCle(moi.session.partage);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-4 py-5">
      <header className="flex items-center gap-3">
        <Logo className="h-7" />
        <div className="ml-auto"><BasculeLangue /></div>
      </header>

      {/* Le claustra est autorisé ici : cet écran parle de TOTEM, il ne porte
          aucun montant (docs/IDENTITE.md §3). */}
      <section className="claustra rounded-card px-5 py-6">
        <h1 className="text-title font-semibold tracking-tight text-balance">{t.titre}</h1>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.sousTitre}</p>
      </section>

      {surLeComptoir ? (
        <SurLeComptoir t={t} />
      ) : (
        <ChoixDuTelephone t={t} tCles={textesCles[langue]} />
      )}

      {/* Le papier. Bouton de second niveau : l'écran n'a qu'un seul bouton
          plein, et c'est celui qui parle au téléphone. */}
      <section className="rounded-card border border-line bg-surface-raised px-4 py-4">
        <div className="flex items-start gap-3">
          <IconDoc size={20} className="mt-0.5 shrink-0 text-ink-soft" />
          <div>
            <h2 className="text-body font-semibold">{t.papierTitre}</h2>
            <p className="mt-1 text-small leading-relaxed text-ink-soft">{t.papierDit}</p>
          </div>
        </div>
        <Link
          href="/papier"
          className="mt-4 flex h-12 w-full items-center justify-center rounded-btn
                     border border-line-control px-4 text-body font-medium
                     transition hover:border-ink-faint"
        >
          {t.papierGeste}
        </Link>
      </section>

      <Link
        href="/"
        className="flex min-h-14 items-center justify-center text-body text-ink-soft
                   underline-offset-4 hover:underline"
      >
        {t.application}
      </Link>

      {/* La phrase qui protège vraiment : c'est la personne qu'on hameçonne,
          pas la machine. Elle est répétée ici parce que cet écran est celui
          où l'on vient de taper des chiffres reçus par message — le moment
          exact où quelqu'un d'autre en demanderait six de plus. */}
      <section className="mt-auto flex gap-3 rounded-card border border-line
                          bg-surface-raised px-4 py-4">
        <IconLock size={20} className="mt-0.5 shrink-0 text-laterite" />
        <div>
          <div className="text-small font-semibold">{t.jamaisPinTitre}</div>
          <p className="mt-1 text-caption leading-relaxed text-ink-faint">{t.jamaisPin}</p>
        </div>
      </section>
    </main>
  );
}
