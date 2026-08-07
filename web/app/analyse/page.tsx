import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import type { Langue } from "@/lib/langue";
import { textesAnalyse } from "@/lib/textes/analyse";
import { fcfa, jourDouala, nombre, type Paiement } from "@/lib/types";
import { IconDoc } from "../icons";
import { Bouton } from "../ui/bouton";
import { Carte, EnTeteSection } from "../ui/carte";
import { Liste, Rangee } from "../ui/rangee";
import { Vide } from "../vide";

export const dynamic = "force-dynamic";

// L'argent vit à Douala : les jours se découpent dans SON fuseau, exactement
// comme la liste des SMS (lib/serveur.ts). Sans cela, un encaissement de
// minuit à Douala tombait, ici, dans le jour de la veille (fuseau du serveur
// de rendu) — et la liste et le graphe montraient deux jours différents.
const FUSEAU = "Africa/Douala";

// L'ÉCHELLE DU GRAPHIQUE, en crans de 4 px.
//
// La hauteur d'une barre se calculait `Math.round(m / max * 118) + 6` : elle
// pouvait valoir 6, 7, 41, 93, 124 — n'importe quoi entre deux crans, sur un
// écran dont tout le reste est un multiple de 4. Une barre est une mesure ;
// elle se lit d'autant mieux qu'elle se pose sur la même grille que le reste.
//
// 28 crans de 4 px font 112 px pour la plus haute. Avec l'étiquette du montant
// (16), le nom du jour (16) et les deux écarts de 8, la colonne la plus haute
// mesure exactement 160 px — la hauteur que le graphique s'imposait en dur,
// désormais obtenue au lieu d'être écrite.
const CRANS_GRAPHIQUE = 28;
const CRAN = 4;

/** Un jour sans encaissement garde un cran : la colonne existe, à zéro. */
function hauteurBarre(montant: number, max: number) {
  return Math.max(1, Math.round((montant / max) * CRANS_GRAPHIQUE)) * CRAN;
}

// Les encaissements des 7 derniers jours, calculés sur les vrais paiements —
// aucun chiffre n'est écrit à la main. Les noms de jours suivent la langue.
function septDerniersJours(paiements: Paiement[], langue: Langue) {
  const jours: { jour: string; montant: number }[] = [];
  const present = Date.now();
  const locale = langue === "en" ? "en-GB" : "fr-FR";
  for (let i = 6; i >= 0; i--) {
    const d = new Date(present - i * 86_400_000);
    const cle = jourDouala(d);
    const montant = paiements
      .filter((p) => p.sens === "in" && p.montant != null && jourDouala(new Date(p.recuLe)) === cle)
      .reduce((s, p) => s + (p.montant ?? 0), 0);
    // « lun. » devient « Lun », « Mon » reste « Mon » : sans point, une
    // majuscule initiale dans les deux langues.
    const nom = new Intl.DateTimeFormat(locale, { timeZone: FUSEAU, weekday: "short" })
      .format(d).replace(".", "");
    jours.push({ jour: nom.charAt(0).toUpperCase() + nom.slice(1), montant });
  }
  return jours;
}

function semaine(paiements: Paiement[], debut: number, fin: number) {
  const present = Date.now();
  return paiements
    .filter((p) => {
      const t = new Date(p.recuLe).getTime();
      return p.sens === "in" && p.montant != null && t > present - debut * 86_400_000 && t <= present - fin * 86_400_000;
    })
    .reduce((s, p) => s + (p.montant ?? 0), 0);
}

export default async function Analyse() {
  const langue = await langueServeur();
  const t = textesAnalyse[langue];
  const { paiements } = await chargerDonnees(langue);

  if (paiements.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
          <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
        </header>
        <Vide titre={t.rienTitre} detail={t.rienDetail} />
      </div>
    );
  }

  const septJours = septDerniersJours(paiements, langue);
  const total = septJours.reduce((s, d) => s + d.montant, 0);
  const moyenne = Math.round(total / 7);
  const meilleur = septJours.reduce((a, b) => (b.montant > a.montant ? b : a));
  const max = Math.max(...septJours.map((d) => d.montant), 1);

  // La semaine précédente, pour situer celle-ci — calculée, pas décrétée.
  const precedente = semaine(paiements, 14, 7);
  const evolution = precedente > 0 ? Math.round(((total - precedente) / precedente) * 100) : null;

  // Les clients qui reviennent, sur tout l'historique chargé.
  const parClient = new Map<string, { nb: number; total: number }>();
  for (const p of paiements.filter((x) => x.sens === "in" && x.montant != null)) {
    const c = parClient.get(p.nom) ?? { nb: 0, total: 0 };
    c.nb += 1; c.total += p.montant ?? 0;
    parClient.set(p.nom, c);
  }
  const topClients = [...parClient.entries()]
    .map(([nom, v]) => ({ nom, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    // Grand écran : les chiffres et le graphique à gauche, les clients à droite.
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-8">
      <header className="lg:col-span-2">
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {/* Chiffre principal */}
      <section className="lg:col-start-1">
        <p className="text-small text-ink-soft">{t.encaissementsSemaine}</p>
        <p className="mt-1 text-hero font-semibold tabnums tracking-tight">{fcfa(total, langue)}</p>
        {evolution != null && (
          <p className="mt-1 text-small text-ink-soft">
            <span className={`font-medium ${evolution >= 0 ? "text-positive" : "text-negative"}`}>
              {evolution >= 0 ? "+" : ""}{evolution} %
            </span>{" "}
            {t.parRapportSemainePrecedente}
          </p>
        )}
      </section>

      {/* Repères. La carte porte le padding vertical, chaque colonne le sien à
          l'horizontale : un seul padding par côté, jamais deux. */}
      <section className="lg:col-start-1">
        <Carte bordABord className="grid grid-cols-2 divide-x divide-line">
          <div className="px-4">
            <p className="text-small text-ink-soft">{t.moyenneParJour}</p>
            <p className="mt-1 text-heading font-semibold tabnums">{fcfa(moyenne, langue)}</p>
          </div>
          <div className="px-4">
            <p className="text-small text-ink-soft">{t.meilleurJour}</p>
            <p className="mt-1 text-heading font-semibold tabnums">
              {meilleur.jour} · {nombre(meilleur.montant, langue)}
            </p>
          </div>
        </Carte>
      </section>

      {/* Graphique — monochrome, montants complets */}
      <section className="lg:col-start-1">
        <EnTeteSection titre={t.encaissementsParJour} />
        <div className="flex items-end justify-between gap-2 sm:gap-3">
          {septJours.map((d, i) => {
            const hauteur = hauteurBarre(d.montant, max);
            const best = d.montant === meilleur.montant && d.montant > 0;
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                {/* Le montant se lit au-dessus de sa barre. Il était à 10 px —
                    hors de l'échelle typographique, dont le plus petit cran est
                    `text-caption` (12/16). C'est un montant : il se lit. */}
                <span className={`max-w-full truncate text-caption tabnums ${best ? "font-medium text-ink" : "text-ink-faint"}`}>
                  {d.montant > 0 ? nombre(d.montant, langue) : ""}
                </span>
                {/* La barre PORTE la donnée : WCAG 1.4.11 lui impose 3:1. En
                    `surface-3` elle valait 1,22:1 sur le fond de page — la
                    mesure elle-même était invisible. `contour` est le neutre
                    du système garanti au-dessus du seuil : 3,8:1 ici. */}
                <div
                  className={`w-full rounded-sm ${best ? "bg-ink" : "bg-contour"}`}
                  style={{ height: `${hauteur}px` }}
                />
                <span className="text-caption text-ink-faint">{d.jour}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-caption text-ink-faint">{t.montantsEnFcfa}</p>
      </section>

      {/* Clients */}
      {topClients.length > 0 && (
        <section className="lg:col-start-2 lg:row-span-3 lg:row-start-2">
          <EnTeteSection titre={t.principauxClients} />
          <Liste>
            {topClients.map((c, i) => (
              <Rangee
                key={c.nom}
                lignes={2}
                icone={<span className="text-small tabnums text-ink-faint">{i + 1}</span>}
                titre={c.nom}
                sousTitre={t.nbPaiements(c.nb)}
                montant={{ texte: fcfa(c.total, langue), sens: "neutre" }}
              />
            ))}
          </Liste>
        </section>
      )}

      {/* L'export du bilan faisait 44 px par accident, en empilant `py-3` et un
          interligne. Le bouton du système les déclare. */}
      <Bouton
        variante="secondaire"
        pleineLargeur
        icone={<IconDoc size={20} />}
        className="lg:col-start-1"
      >
        {t.exporterBilan}
      </Bouton>
    </div>
  );
}
