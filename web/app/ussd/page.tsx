import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesUssd } from "@/lib/textes/ussd";
import { IconCard } from "../icons";
import { Vide } from "../vide";
import { ConsoleUssd } from "./console";

export const dynamic = "force-dynamic";

/**
 * UN ÉTAT VIDE SE CENTRE — il ne se colle pas en haut.
 *
 * Mesuré sur 390 × 844 : la carte « Aucune puce » commençait à y = 112 et
 * finissait à 266, laissant **578 px de trou dessous — 68 % de l'écran**. Sur
 * 1440 × 900 elle s'étirait à 928 px de large pour 106 de haut, avec 686 px de
 * vide en dessous : un bandeau, pas un état.
 *
 * La colonne prend donc la HAUTEUR UTILE de la page et pousse son contenu au
 * milieu. Cette hauteur ne se choisit pas non plus :
 *
 *     hauteur utile = écran visible − ce que la charpente prend déjà
 *
 * Au téléphone, la charpente prend 16 px au-dessus, 16 en dessous et les 64 de
 * la barre flottante : c'est exactement `--garde-basse`, qui porte le même
 * compte. Au-dessus de `md` la barre n'existe plus et la charpente respire à
 * 32 px de haut en bas, soit seize crans — d'où la seconde mesure. Écrire
 * `min-h-dvh` aurait fait défiler la page de la hauteur du décor.
 */
const MESURES = {
  "--hauteur-utile": "calc(100dvh - var(--garde-basse))",
  "--hauteur-utile-large": "calc(100dvh - var(--spacing) * 16)",
} as React.CSSProperties;

export default async function CodeUssd({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const langue = await langueServeur();
  const t = textesUssd[langue];
  const [{ sims }, { code }] = await Promise.all([
    chargerDonnees(langue, { sms: 0, recus: 0 }),
    searchParams,
  ]);
  const carte = sims.find((s) => s.enPlace);

  if (!carte) {
    return (
      <div
        style={MESURES}
        className="flex min-h-[var(--hauteur-utile)] flex-col gap-6 md:min-h-[var(--hauteur-utile-large)]"
      >
        <header>
          <h1 className="text-title">{t.titre}</h1>
          <p className="mt-1 text-small text-ink-soft">{t.sansCarteSousTitre}</p>
        </header>
        {/* La carte se borne : sur un écran large, un état vide qui traverse
            928 px n'est plus un objet, c'est une frise. */}
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

  return (
    <ConsoleUssd
      carte={{ libelle: carte.libelle, operateur: carte.operateur }}
      codeInitial={typeof code === "string" ? code.replace(/[^0-9#*]/g, "").slice(0, 32) : undefined}
    />
  );
}
