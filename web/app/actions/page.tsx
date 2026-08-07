import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesGuichet } from "@/lib/textes/guichet";
import { IconCard } from "../icons";
import { Vide } from "../ui/etat";
import { Guichet } from "./guichet";

export const dynamic = "force-dynamic";

/**
 * UN ÉTAT VIDE SE CENTRE — il ne se colle pas en haut. Même mesure et même
 * calcul que sur `/ussd` (voir le commentaire de `app/ussd/page.tsx`) : la
 * carte « Aucune puce » commençait ici à y = 92 et laissait **534 px de trou
 * dessous** sur 390 × 844, et 622 px sur 1440 × 900 pour 928 px de large.
 *
 *     hauteur utile = écran visible − ce que la charpente prend déjà
 *
 * `--garde-basse` au téléphone (16 + 16 + la barre flottante), seize crans
 * au-dessus de `md`, où la barre n'existe plus.
 */
const MESURES = {
  "--hauteur-utile": "calc(100dvh - var(--garde-basse))",
  "--hauteur-utile-large": "calc(100dvh - var(--spacing) * 16)",
} as React.CSSProperties;

export default async function Operations() {
  const langue = await langueServeur();
  const t = textesGuichet[langue];
  const { sims } = await chargerDonnees(langue, { sms: 0, recus: 0 });
  const carte = sims.find((s) => s.enPlace);

  if (!carte) {
    return (
      <div
        style={MESURES}
        className="flex min-h-[var(--hauteur-utile)] flex-col gap-6 md:min-h-[var(--hauteur-utile-large)]"
      >
        <header>
          <h1 className="text-title">{t.titre}</h1>
          <p className="mt-1 text-small text-ink-soft">{t.sansCode}</p>
        </header>
        <div className="flex grow items-center justify-center">
          <div className="w-full max-w-md">
            <Vide
              icone={<IconCard size={24} />}
              titre={t.aucuneCarte}
              detail={t.aucuneCarteDetail}
            />
          </div>
        </div>
      </div>
    );
  }

  return <Guichet carte={{ libelle: carte.libelle, operateur: carte.operateur }} />;
}
