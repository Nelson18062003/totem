// « Ce qui arrive sur votre téléphone » — le catalogue complet de ce que
// TOTEM envoie, et le choix de ce qu'on veut recevoir.
//
// CE N'EST PAS UNE PAGE DE RÉGLAGES. C'est une page qui rassure : elle montre
// qu'il n'y a pas de surprise possible, parce que tout ce qui peut arriver est
// écrit là, avec quand ça part. Les interrupteurs sont la conséquence du
// catalogue, pas l'inverse — et c'est pour cela que chaque genre dit d'abord
// ce qu'il est, ensuite s'il se débraye.
//
// L'ORDRE N'EST PAS ALPHABÉTIQUE. Ce qui protège vient d'abord, sans
// interrupteur, pour que la promesse de la page se voie avant qu'on ait
// touché à quoi que ce soit. Le reste suit.
//
// LA PHRASE SUR LE PIN EST EN HAUT, avant le catalogue. C'est cette page qu'on
// ira relire en recevant un faux message, et cette phrase-là est la seule
// chose qu'on doit y trouver sans chercher.

import { exigerPresence } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { textesMessages } from "@/lib/textes/messages";
import { GENRES, ORDRE, preferencesDe } from "@/lib/preferences";
import { IconLock } from "@/app/icons";
import { Genre } from "./interactifs";

export const dynamic = "force-dynamic";

export default async function PageMessages() {
  const moi = await exigerPresence();
  const langue = await langueServeur();
  const t = textesMessages[langue];
  const choix = await preferencesDe(moi.personne);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small leading-relaxed text-ink-soft">{t.sousTitre}</p>
      </header>

      {/* La phrase qui protège vraiment. Elle n'est pas là pour rassurer :
          elle est là parce que c'est la personne qu'on hameçonne, pas la
          machine. */}
      <section className="flex gap-3.5 rounded-card bg-sable px-4 py-4">
        <IconLock size={22} className="mt-0.5 shrink-0 text-laterite" />
        <div>
          <h2 className="text-heading font-semibold">{t.jamaisTitre}</h2>
          <p className="mt-1.5 text-small leading-relaxed text-ink-soft">{t.jamaisDit}</p>
          <p className="mt-2 text-small leading-relaxed text-ink-soft">{t.jamaisQuoiFaire}</p>
        </div>
      </section>

      {/* La règle de la page, écrite à l'écran et pas seulement dans le code :
          quelqu'un qui cherche l'interrupteur manquant doit trouver la raison
          au même endroit que l'absence. */}
      <section className="rounded-card border border-line bg-surface-raised px-4 py-4">
        <h2 className="text-heading font-semibold">{t.regleTitre}</h2>
        <p className="mt-1.5 text-small leading-relaxed text-ink-soft">{t.regleDit}</p>
      </section>

      <section>
        <h2 className="mb-3 text-caption font-semibold uppercase tracking-wider text-ink-faint">
          {t.catalogue}
        </h2>
        <ul className="divide-hair overflow-hidden rounded-card border border-line
                       bg-surface-raised">
          {ORDRE.map((genre) => (
            <Genre
              key={genre}
              genre={genre}
              debrayable={GENRES[genre].debrayable}
              recevoir={choix[genre]}
            />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-caption font-semibold uppercase tracking-wider text-ink-faint">
          {t.formeTitre}
        </h2>
        <ul className="flex flex-col gap-3">
          {t.forme.map((regle) => (
            <li key={regle.titre}
                className="rounded-card border border-line bg-surface-raised px-4 py-3.5">
              <p className="text-small font-semibold">{regle.titre}</p>
              <p className="mt-1 text-caption leading-relaxed text-ink-soft">{regle.dit}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
