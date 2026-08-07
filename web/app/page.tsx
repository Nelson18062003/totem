import Link from "next/link";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesAccueil } from "@/lib/textes/accueil";
import { AccueilGuichet } from "./accueil-client";
import { DerniersSms } from "./derniers-sms";
import { BasculeLangue } from "./langue";
import { IconChevron, IconSettings } from "./icons";
import { Bouton, BoutonIcone } from "./ui/bouton";
import { EnTeteSection } from "./ui/carte";
import { Vide } from "./ui/etat";

export const dynamic = "force-dynamic";

export default async function Accueil() {
  const langue = await langueServeur();
  const t = textesAccueil[langue];
  const { terminal, sims, paiements } = await chargerDonnees(langue, { sms: 30, recus: 60 });
  const carte = sims.find((s) => s.enPlace) ?? null;

  return (
    // Grand écran : le guichet à gauche, le terminal et ses détails à droite.
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-8">
      {/* En-tête */}
      {/* En toutes lettres, la bascule prend la place d'un titre : quand
          l'écran est étroit, elle passe sur sa propre ligne au lieu de
          serrer « Vue d'ensemble ». */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 lg:col-span-2">
        <div>
          <p className="text-small text-ink-soft">{t.bonjour}</p>
          <h1 className="mt-1 text-title">{t.titre}</h1>
        </div>
        {/* La langue, en évidence dès l'accueil — quelle que soit la taille
            d'écran. L'engrenage reste le chemin des réglages sur téléphone :
            c'est un bouton d'icône de 44×44, et non plus un dessin nu de 18. */}
        <div className="flex items-center gap-3">
          <BasculeLangue />
          <BoutonIcone
            href="/reglages"
            icone={<IconSettings size={20} />}
            aria-label={t.reglages}
            className="lg:hidden"
          />
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
        // L'état vide du système — un seul, un seul retrait.
        <section className="lg:col-start-1">
          <Vide titre={t.aucuneCarte} detail={t.aucuneCarteDetail} />
        </section>
      )}

      {/* Le terminal, avec ses détails techniques.
          La carte entière mène aux réglages : c'est donc un contrôle, et son
          filet est `contour` (3:1) — `line` vaut 1,26:1 et ne dirait à
          personne qu'on peut appuyer dessus. */}
      <aside className="lg:col-start-2 lg:row-span-3 lg:row-start-2">
        <EnTeteSection titre={t.terminal} />
        <Link href="/reglages"
          className="block rounded-card border border-contour bg-surface-raised transition-teintes hover:bg-surface-2">
          {terminal ? (
            <>
              <p className="flex h-rangee items-center gap-3 border-b border-line px-4 text-body">
                <span className={`size-2 shrink-0 rounded-full ${terminal.enLigne ? "bg-positive" : "bg-negative"}`} />
                {terminal.enLigne ? t.enLigne : t.muet}
                <span className="ml-auto text-small tabnums text-ink-faint">{terminal.majTexte}</span>
              </p>
              <dl className="divide-hair px-4 py-1">
                <div className="flex items-center justify-between py-3">
                  <dt className="text-small text-ink-soft">{t.emplacement}</dt>
                  <dd className="text-small font-medium">{terminal.nom}</dd>
                </div>
                {/* « Version 1.8.2 » ne répond à aucune question que se pose
                    le propriétaire d'un commerce, et l'accueil est l'écran
                    qu'il regarde le plus. Le numéro reste dans les réglages,
                    sous une étiquette qui dit de quoi il est le numéro. */}
                {terminal.sante && (
                  <div className="py-3">
                    <dt className="text-small text-ink-soft">{t.sante}</dt>
                    <dd className="mt-1 text-small font-medium tabnums">
                      {terminal.sante}
                    </dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <p className="px-4 py-4 text-small text-ink-soft">
              {t.aucunTerminal}
            </p>
          )}
        </Link>
      </aside>

      {/* Les derniers SMS — c'est par eux que tout arrive */}
      <section className="lg:col-start-1">
        {/* « Tout voir » était une ligne de texte de 18 px de haut, et elle se
            cliquait. C'est un bouton discret de 44, dans le rang d'action de
            l'en-tête de section. */}
        <EnTeteSection
          titre={t.derniersSms}
          action={
            <Bouton
              variante="discret"
              href="/encaissements"
              iconeFin={<IconChevron size={20} />}
            >
              {t.toutVoir}
            </Bouton>
          }
        />
        {paiements.length === 0 ? (
          <Vide titre={t.aucunSms} />
        ) : (
          // Cliquables : chaque ligne ouvre la même fiche que la boîte de
          // réception — le message en entier, sa nature, son reçu.
          <DerniersSms paiements={paiements.slice(0, 6)} />
        )}
      </section>
    </div>
  );
}
