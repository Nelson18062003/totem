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

/* ────────────────────────────────────────────────────────────────────────────
 * v2 · LE GRAPHIQUE EST MORT, ET IL NE REVIENT PAS SOUS UNE AUTRE FORME
 *
 * Il occupait 224 px mesurés — 25 % de la page — pour dire DEUX chiffres qui
 * étaient déjà écrits vingt pixels plus haut : « Moyenne par jour · 134 072 »
 * et « Meilleur jour · Jeu · 493 000 ». Trois défauts, tous mesurés sur les
 * données réelles :
 *
 *   — CINQ COLONNES SUR SEPT ÉTAIENT UN TIRET DE 4 PX. L'échelle était
 *     linéaire et rapportée au maximum : avec un jour à 493 000 et les autres
 *     entre 1 et 17 000, six jours sur sept tombaient sous le premier cran et
 *     recevaient donc le même trait. 1 FCFA et 17 000 FCFA se dessinaient
 *     IDENTIQUES. Un graphique qui rend deux mesures indiscernables ne mesure
 *     plus rien.
 *   — L'ENCRE NE FAISAIT QUE 16 % DU RECTANGLE TRACÉ. Les 84 % restants
 *     étaient du blanc qu'on faisait défiler.
 *   — L'ÉTIQUETTE DU CHIFFRE LE PLUS IMPORTANT ÉTAIT TRONQUÉE en « 493 0… » :
 *     sept colonnes dans 358 px laissent 47 px par étiquette, et « 493 000 »
 *     en fait 52.
 *
 * ON A ENVISAGÉ DE LE REFAIRE, et on y a renoncé pour une raison qui n'est pas
 * graphique. Un graphique honnête aurait demandé quatre choses : une règle à
 * zéro, un repère de moyenne, une échelle qui sépare 1 de 17 000 — donc non
 * linéaire, c'est-à-dire illisible pour qui n'est pas statisticien — et des
 * COLONNES CLIQUABLES, qui ouvriraient le jour choisi. Or la liste des SMS ne
 * se filtre pas par date : rendre les colonnes cliquables voulait dire
 * inventer une route et un comportement. Un graphique qui ne mène nulle part
 * n'a pas gagné sa place ; on ne le garde pas au prétexte qu'une page
 * d'analyse « doit » avoir une courbe.
 *
 * Les sept jours restent CALCULÉS — ils donnent le total, la moyenne et le
 * meilleur jour. C'est leur dessin qu'on a retiré, pas leur mesure.
 * ──────────────────────────────────────────────────────────────────────────── */

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
    // DEUX COLONNES ÉGALES, ET C'EST UNE CORRECTION MESURÉE. La colonne de
    // droite était figée à 300 px : la rangée d'un client y disposait de
    // 268 px, dont 144 pris par la colonne des montants et 36 par le rang —
    // il restait 76 px au nom, et « MTNMobileMoney » devenait « MTNMobi… ».
    // En 1440, cette colonne s'arrêtait par ailleurs à y=280 quand la gauche
    // descendait à 634 : 354 px de vide sous un nom tronqué. Le graphique
    // parti, la gauche raccourcit et les deux colonnes se rejoignent.
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
      <header className="lg:col-span-2">
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {/* Chiffre principal */}
      <section className="lg:col-start-1 lg:row-start-2">
        <p className="text-small text-ink-soft">{t.encaissementsSemaine}</p>
        <p className="mt-1 text-hero font-semibold tracking-tight">{fcfa(total, langue)}</p>
        {evolution != null && (
          <p className="mt-1 text-small text-ink-soft">
            <span className={`font-medium ${evolution >= 0 ? "text-positive" : "text-negative"}`}>
              {evolution >= 0 ? "+" : "−"}{nombre(Math.abs(evolution), langue)} %
            </span>{" "}
            {t.parRapportSemainePrecedente}
          </p>
        )}
      </section>

      {/* Repères. La carte porte le padding vertical, chaque colonne le sien à
          l'horizontale : un seul padding par côté, jamais deux.

          LES DEUX REPÈRES PORTENT LEUR UNITÉ. « Jeu · 493 000 » s'écrivait
          sans « FCFA » parce que la note du graphique la donnait pour tout le
          bloc ; le graphique parti, un nombre nu à côté d'un montant complet
          se lit comme autre chose qu'un montant. Le montant passe donc devant,
          et le jour le qualifie — même ordre que sur une rangée d'argent. */}
      <section className="lg:col-start-1 lg:row-start-3">
        <Carte bordABord className="grid grid-cols-2 divide-x divide-line">
          <div className="px-4">
            <p className="text-small text-ink-soft">{t.moyenneParJour}</p>
            <p className="mt-1 text-heading font-semibold">{fcfa(moyenne, langue)}</p>
          </div>
          <div className="px-4">
            <p className="text-small text-ink-soft">{t.meilleurJour}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2 text-heading font-semibold">
              {fcfa(meilleur.montant, langue)}
              <span className="text-small font-normal text-ink-faint">{meilleur.jour}</span>
            </p>
          </div>
        </Carte>
      </section>

      {/* L'export du bilan faisait 44 px par accident, en empilant `py-3` et un
          interligne. Le bouton du système les déclare. */}
      <Bouton
        variante="secondaire"
        pleineLargeur
        icone={<IconDoc size={20} />}
        className="lg:col-start-1 lg:row-start-4"
      >
        {t.exporterBilan}
      </Bouton>

      {/* Clients */}
      {topClients.length > 0 && (
        <section className="lg:col-start-2 lg:row-span-3 lg:row-start-2">
          <EnTeteSection titre={t.principauxClients} />
          <Liste>
            {topClients.map((c, i) => (
              <Rangee
                key={c.nom}
                lignes={2}
                icone={<span className="text-small text-ink-faint">{nombre(i + 1, langue)}</span>}
                titre={c.nom}
                sousTitre={t.nbPaiements(c.nb)}
                montant={{ texte: fcfa(c.total, langue), sens: "neutre" }}
              />
            ))}
          </Liste>
        </section>
      )}
    </div>
  );
}
