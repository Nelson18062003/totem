import Link from "next/link";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesAccueil } from "@noyau/textes/accueil";
import { AccueilGuichet } from "./accueil-client";
import { DerniersSms } from "./derniers-sms";
import { BasculeLangue } from "./langue";
import { IconChevron, IconSettings } from "./icons";
import { salutation } from "@noyau/salutation";
import { compteConnecte } from "@/lib/qui";

export const dynamic = "force-dynamic";

export default async function Accueil() {
  const langue = await langueServeur();
  // Uniquement pour la salutation : on lit qui est connecté.
  const moi = await compteConnecte();
  const t = textesAccueil[langue];
  const { terminal, sims, paiements, raccourcis } = await chargerDonnees(langue, { sms: 30, recus: 60 });
  // TOUTES les cartes en place — Orange ET MTN, chacune avec son solde. Si
  // plus aucune n'est « en place » (terminal muet, cloud en retard), on
  // montre quand même les cartes connues, avec leur état dit franchement :
  // un accueil vide alors que la page Comptes les liste faisait chercher le
  // propriétaire au mauvais endroit.
  const enPlace = sims.filter((s) => s.enPlace);
  const cartes = enPlace.length ? enPlace : sims;

  return (
    // Grand écran : le guichet à gauche, le terminal et ses détails à droite.
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-10">
      {/* En-tête */}
      {/* En toutes lettres, la bascule prend la place d'un titre : quand
          l'écran est étroit, elle passe sur sa propre ligne au lieu de
          serrer « Vue d'ensemble ». */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 lg:col-span-2">
        <div>
          <p className="text-small text-ink-soft">{salutation(langue, moi?.courriel)}</p>
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

      {/* Le guichet : une carte par SIM, et les cinq gestes sur la carte
          choisie */}
      {cartes.length ? (
        <AccueilGuichet
          cartes={cartes.map((c) => ({
            libelle: c.libelle, operateur: c.operateur,
            numero: c.numero, nom: c.nom, solde: c.solde,
            soldeMaj: c.soldeMaj, signal: c.signal,
            iccid: c.iccid, enPlace: c.enPlace, derniereVue: c.derniereVue,
          }))}
          raccourcis={raccourcis}
        />
      ) : (
        <section className="rounded-card border border-dashed border-line px-4 py-10 text-center lg:col-start-1">
          <p className="text-body font-medium">{t.aucuneCarte}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-small leading-relaxed text-ink-soft">
            {t.aucuneCarteDetail}
          </p>
        </section>
      )}

      {/* Le terminal, avec ses détails techniques */}
      <aside className="lg:col-start-2 lg:row-span-3 lg:row-start-2">
        <h2 className="mb-3 text-heading font-semibold">{t.terminal}</h2>
        <Link href="/reglages"
          className="block rounded-card border border-line bg-surface-raised transition hover:border-ink-faint">
          {terminal ? (
            <>
              <p className="flex items-center gap-2.5 border-b border-line px-4 py-3 text-body">
                <span className={`size-2 rounded-full ${terminal.enLigne ? "bg-positive-vif" : "bg-negative"}`} />
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
