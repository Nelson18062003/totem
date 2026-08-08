import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import type { Langue } from "@/lib/langue";
import { textesAnalyse } from "@/lib/textes/analyse";
import { fcfa, jourDouala, nombre, type Paiement } from "@/lib/types";
import { IconDoc } from "../icons";
import { Vide } from "../vide";
import { exigerPouvoir } from "@/lib/garde";

export const dynamic = "force-dynamic";

// L'argent vit à Douala : les jours se découpent dans SON fuseau, exactement
// comme la liste des SMS (lib/serveur.ts). Sans cela, un encaissement de
// minuit à Douala tombait, ici, dans le jour de la veille (fuseau du serveur
// de rendu) — et la liste et le graphe montraient deux jours différents.
const FUSEAU = "Africa/Douala";

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
  await exigerPouvoir("lire");
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
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-10">
      <header className="lg:col-span-2">
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {/* Chiffre principal */}
      <section className="lg:col-start-1">
        <p className="text-small text-ink-soft">{t.encaissementsSemaine}</p>
        <p className="mt-1 text-hero font-semibold tabnums tracking-tight">{fcfa(total, langue)}</p>
        {evolution != null && (
          <p className="mt-1.5 text-small text-ink-soft">
            <span className={`font-medium ${evolution >= 0 ? "text-positive" : "text-negative"}`}>
              {evolution >= 0 ? "+" : ""}{evolution} %
            </span>{" "}
            {t.parRapportSemainePrecedente}
          </p>
        )}
      </section>

      {/* Repères */}
      <section className="grid grid-cols-2 divide-x divide-line rounded-card border border-line bg-surface-raised lg:col-start-1">
        <div className="px-5 py-4">
          <p className="text-small text-ink-soft">{t.moyenneParJour}</p>
          <p className="mt-1 text-heading font-semibold tabnums">{fcfa(moyenne, langue)}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-small text-ink-soft">{t.meilleurJour}</p>
          <p className="mt-1 text-heading font-semibold tabnums">
            {meilleur.jour} · {nombre(meilleur.montant, langue)}
          </p>
        </div>
      </section>

      {/* Graphique — monochrome, montants complets */}
      <section className="lg:col-start-1">
        <h2 className="mb-4 text-heading font-semibold">{t.encaissementsParJour}</h2>
        <div className="flex items-end justify-between gap-1.5 sm:gap-2.5" style={{ height: 160 }}>
          {septJours.map((d, i) => {
            const h = Math.round((d.montant / max) * 118) + 6;
            const best = d.montant === meilleur.montant && d.montant > 0;
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className={`max-w-full truncate text-[0.625rem] tabnums sm:text-caption ${best ? "font-medium text-ink" : "text-ink-faint"}`}>
                  {d.montant > 0 ? nombre(d.montant, langue) : ""}
                </span>
                <div className={`w-full rounded-sm ${best ? "bg-ink" : "bg-surface-3"}`} style={{ height: h }} />
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
          <h2 className="mb-1 text-heading font-semibold">{t.principauxClients}</h2>
          <ul className="divide-hair">
            {topClients.map((c, i) => (
              <li key={c.nom} className="flex items-center gap-3.5 py-3.5">
                <span className="w-4 text-small tabnums text-ink-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">{c.nom}</p>
                  <p className="text-small text-ink-faint">{t.nbPaiements(c.nb)}</p>
                </div>
                <span className="text-body font-medium tabnums">{fcfa(c.total, langue)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className="flex items-center justify-center gap-2 rounded-btn border border-line-control bg-surface-raised py-3 text-small font-medium text-ink-soft transition hover:border-ink-faint hover:text-ink lg:col-start-1">
        <IconDoc size={16} /> {t.exporterBilan}
      </button>
    </div>
  );
}
