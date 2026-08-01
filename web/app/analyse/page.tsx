import { chargerDonnees } from "@/lib/serveur";
import { fcfa, nombre, type Paiement } from "@/lib/types";
import { IconDoc } from "../icons";
import { Vide } from "../vide";

export const dynamic = "force-dynamic";

const JOURS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

// Les encaissements des 7 derniers jours, calculés sur les vrais paiements —
// aucun chiffre n'est écrit à la main.
function septDerniersJours(paiements: Paiement[]) {
  const jours: { jour: string; montant: number }[] = [];
  const present = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(present.getTime() - i * 86_400_000);
    const cle = d.toDateString();
    const montant = paiements
      .filter((p) => p.sens === "in" && p.montant != null && new Date(p.recuLe).toDateString() === cle)
      .reduce((s, p) => s + (p.montant ?? 0), 0);
    jours.push({ jour: JOURS[d.getDay()], montant });
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
  const { paiements } = await chargerDonnees();

  if (paiements.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-title font-semibold tracking-tight">Analyse</h1>
          <p className="mt-1 text-small text-ink-soft">Sept derniers jours.</p>
        </header>
        <Vide
          titre="Rien à analyser pour l’instant"
          detail="Dès que des paiements arriveront, cette page montrera la semaine, les meilleurs jours et les principaux clients."
        />
      </div>
    );
  }

  const septJours = septDerniersJours(paiements);
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
        <h1 className="text-title font-semibold tracking-tight">Analyse</h1>
        <p className="mt-1 text-small text-ink-soft">Sept derniers jours.</p>
      </header>

      {/* Chiffre principal */}
      <section className="lg:col-start-1">
        <p className="text-small text-ink-soft">Encaissements de la semaine</p>
        <p className="mt-1 text-hero font-semibold tabnums tracking-tight">{fcfa(total)}</p>
        {evolution != null && (
          <p className="mt-1.5 text-small text-ink-soft">
            <span className={`font-medium ${evolution >= 0 ? "text-positive" : "text-negative"}`}>
              {evolution >= 0 ? "+" : ""}{evolution} %
            </span>{" "}
            par rapport à la semaine précédente
          </p>
        )}
      </section>

      {/* Repères */}
      <section className="grid grid-cols-2 divide-x divide-line rounded-card border border-line bg-surface-raised lg:col-start-1">
        <div className="px-5 py-4">
          <p className="text-small text-ink-soft">Moyenne par jour</p>
          <p className="mt-1 text-heading font-semibold tabnums">{fcfa(moyenne)}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-small text-ink-soft">Meilleur jour</p>
          <p className="mt-1 text-heading font-semibold tabnums">
            {meilleur.jour} · {nombre(meilleur.montant)}
          </p>
        </div>
      </section>

      {/* Graphique — monochrome, montants complets */}
      <section className="lg:col-start-1">
        <h2 className="mb-4 text-heading font-semibold">Encaissements par jour</h2>
        <div className="flex items-end justify-between gap-1.5 sm:gap-2.5" style={{ height: 160 }}>
          {septJours.map((d, i) => {
            const h = Math.round((d.montant / max) * 118) + 6;
            const best = d.montant === meilleur.montant && d.montant > 0;
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className={`max-w-full truncate text-[0.625rem] tabnums sm:text-caption ${best ? "font-medium text-ink" : "text-ink-faint"}`}>
                  {d.montant > 0 ? nombre(d.montant) : ""}
                </span>
                <div className={`w-full rounded-sm ${best ? "bg-ink" : "bg-surface-3"}`} style={{ height: h }} />
                <span className="text-caption text-ink-faint">{d.jour}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-caption text-ink-faint">Montants en FCFA.</p>
      </section>

      {/* Clients */}
      {topClients.length > 0 && (
        <section className="lg:col-start-2 lg:row-span-3 lg:row-start-2">
          <h2 className="mb-1 text-heading font-semibold">Principaux clients</h2>
          <ul className="divide-hair">
            {topClients.map((c, i) => (
              <li key={c.nom} className="flex items-center gap-3.5 py-3.5">
                <span className="w-4 text-small tabnums text-ink-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">{c.nom}</p>
                  <p className="text-small text-ink-faint">{c.nb} paiements</p>
                </div>
                <span className="text-body font-medium tabnums">{fcfa(c.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className="flex items-center justify-center gap-2 rounded-btn border border-line bg-surface-raised py-3 text-small font-medium text-ink-soft transition hover:border-ink-faint hover:text-ink lg:col-start-1">
        <IconDoc size={16} /> Exporter le bilan
      </button>
    </div>
  );
}
