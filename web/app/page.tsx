import Link from "next/link";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesAccueil } from "@/lib/textes/accueil";
import { fcfa, jourDouala } from "@/lib/types";
import { AccueilGuichet } from "./accueil-client";
import { DerniersSms } from "./derniers-sms";
import { BasculeLangue } from "./langue";
import { IconChevron, IconSettings } from "./icons";

export const dynamic = "force-dynamic";

// Assez pour couvrir la journée la plus chargée ; la garde `journeeTronquee`
// prend le relais si un jour la dépasse quand même.
const BORNE_SMS = 200;

export default async function Accueil() {
  const langue = await langueServeur();
  const t = textesAccueil[langue];
  const { terminal, sims, paiements } = await chargerDonnees(langue, { sms: BORNE_SMS, recus: 60 });
  const carte = sims.find((s) => s.enPlace) ?? null;

  // La journée, calculée sur les vrais paiements — jamais un chiffre décrété.
  const jour = jourDouala(new Date());
  const encaissementsDuJour = paiements.filter(
    (p) => p.jour === jour && p.sens === "in" && p.montant != null,
  );
  const totalDuJour = encaissementsDuJour.reduce((s, p) => s + (p.montant ?? 0), 0);
  // Si les lignes chargées sont toutes d'aujourd'hui, la borne a pu couper la
  // journée : le total est alors un plancher, et on le dit.
  const journeeTronquee =
    paiements.length >= BORNE_SMS && paiements[paiements.length - 1]?.jour === jour;

  return (
    // Grand écran : le guichet à gauche, le terminal et ses détails à droite.
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-10">
      {/* En-tête */}
      {/* En toutes lettres, la bascule prend la place d'un titre : quand
          l'écran est étroit, elle passe sur sa propre ligne au lieu de
          serrer « Vue d'ensemble ». */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 lg:col-span-2">
        <div>
          <p className="text-small text-ink-soft">{t.bonjour}</p>
          <h1 className="mt-0.5 text-title font-semibold tracking-tight">{t.titre}</h1>
        </div>
        {/* La langue, en évidence dès l'accueil — quelle que soit la taille
            d'écran. L'engrenage reste le chemin des réglages sur téléphone. */}
        <div className="flex items-center gap-3">
          <BasculeLangue />
          <Link href="/reglages" className="text-ink-faint transition hover:text-ink lg:hidden" aria-label={t.reglages}>
            <IconSettings size={18} />
          </Link>
        </div>
      </header>

      {/* Le guichet : la carte (seul solde) et les cinq gestes */}
      {carte ? (
        <AccueilGuichet
          carte={{
            libelle: carte.libelle, operateur: carte.operateur,
            numero: carte.numero, solde: carte.solde,
            soldeMaj: carte.soldeMaj, signal: carte.signal,
            iccid: carte.iccid,
          }}
        />
      ) : (
        <section className="rounded-card border border-dashed border-line px-4 py-10 text-center lg:col-start-1">
          <p className="text-body font-medium">{t.aucuneCarte}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-small leading-relaxed text-ink-soft">
            {t.aucuneCarteDetail}
          </p>
        </section>
      )}

      {/* La journée en un coup d'œil : ce qui est entré aujourd'hui, dès la
          première page — le détail des sept jours vit dans l'Analyse. */}
      {carte && (
        <section className="lg:col-start-1">
          <Link
            href="/analyse"
            className="flex items-center gap-4 rounded-card border border-line bg-surface-raised px-4 py-3.5 transition hover:border-ink-faint"
          >
            <div className="min-w-0 flex-1">
              <p className="text-small text-ink-soft">{t.encaisseAujourdHui}</p>
              <p className="mt-0.5 text-heading font-semibold tabnums">
                {journeeTronquee
                  ? t.auMoins(fcfa(totalDuJour, langue))
                  : fcfa(totalDuJour, langue)}
              </p>
            </div>
            {encaissementsDuJour.length > 0 && (
              <span className="text-small tabnums text-ink-soft">
                {t.nbEncaissementsJour(encaissementsDuJour.length)}
              </span>
            )}
            <IconChevron size={16} className="shrink-0 text-ink-faint" />
          </Link>
        </section>
      )}

      {/* Le terminal, avec ses détails techniques */}
      <aside className="lg:col-start-2 lg:row-span-4 lg:row-start-2">
        <h2 className="mb-3 text-heading font-semibold">{t.terminal}</h2>
        <Link href="/reglages"
          className="block rounded-card border border-line bg-surface-raised transition hover:border-ink-faint">
          {terminal ? (
            <>
              <p className="flex items-center gap-2.5 border-b border-line px-4 py-3 text-body">
                <span className={`size-2 rounded-full ${terminal.enLigne ? "bg-positive" : "bg-negative"}`} />
                {terminal.enLigne ? t.enLigne : t.muet}
                <span className="ml-auto text-small tabnums text-ink-faint">{terminal.majTexte}</span>
              </p>
              <dl className="divide-hair px-4 pb-1">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-small text-ink-soft">{t.emplacement}</dt>
                  <dd className="text-small font-medium">{terminal.nom}</dd>
                </div>
                {terminal.version && (
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-small text-ink-soft">{t.version}</dt>
                    <dd className="text-small font-medium tabnums">{terminal.version}</dd>
                  </div>
                )}
                {terminal.sante && (
                  <div className="py-2.5">
                    <dt className="text-small text-ink-soft">{t.sante}</dt>
                    <dd className="mt-1 text-small font-medium leading-relaxed tabnums">
                      {terminal.sante}
                    </dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <p className="px-4 py-4 text-small leading-relaxed text-ink-soft">
              {t.aucunTerminal}
            </p>
          )}
        </Link>
      </aside>

      {/* Les derniers SMS — c'est par eux que tout arrive */}
      <section className="lg:col-start-1">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-heading font-semibold">{t.derniersSms}</h2>
          <Link href="/encaissements" className="flex items-center gap-0.5 text-small text-ink-soft transition hover:text-ink">
            {t.toutVoir} <IconChevron size={14} />
          </Link>
        </div>
        {paiements.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-small text-ink-faint">
            {t.aucunSms}
          </p>
        ) : (
          // Cliquables : chaque ligne ouvre la même fiche que la boîte de
          // réception — le message en entier, sa nature, son reçu.
          <DerniersSms paiements={paiements.slice(0, 6)} />
        )}
      </section>
    </div>
  );
}
