import Link from "next/link";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { lire, lireUne } from "@/lib/base";
import { peut } from "@/lib/roles";
import { textesAccueil } from "@/lib/textes/accueil";
import { textesGens } from "@/lib/textes/gens";
import { AccueilGuichet, ListeLecture } from "./accueil-client";
import { DerniersSms } from "./derniers-sms";
import { BasculeLangue } from "./langue";
import { IconChevron, IconLock, IconPhone, IconSettings, IconWallet } from "./icons";
import { exigerPouvoir } from "@/lib/garde";

export const dynamic = "force-dynamic";

/**
 * L'accueil montre ce que la personne peut faire, et rien de plus.
 *
 * CE QUI A CHANGÉ, ET POURQUOI
 * Cette page montrait la même chose à tout le monde : le guichet complet, les
 * cinq gestes, la fiche de travail sur chaque SMS. Un opérateur y voyait donc
 * six boutons qui refuseraient — et un bouton qui refuse après coup pousse à
 * emprunter le compte du patron, c'est-à-dire exactement l'inverse de ce que
 * les rôles servent à obtenir.
 *
 * LA RÈGLE DE CET ÉCRAN : UNE ABSENCE SE COMPREND, ELLE NE SE DEVINE PAS.
 * Là où un geste manque, une carte dit à qui il appartient et comment le lui
 * demander — avec un numéro, pas avec « adressez-vous à l'administrateur ».
 * Le refus serveur reste le seul qui protège (`lib/roles.ts`) ; ce qui se
 * joue ici, c'est que personne n'ait à le rencontrer pour comprendre.
 */
export default async function Accueil() {
  const moi = await exigerPouvoir("lire");
  const langue = await langueServeur();
  const t = textesAccueil[langue];
  const tg = textesGens[langue];

  // Composer un code sur la puce, c'est le genre « ussd » : `lib/roles.ts` le
  // réserve au propriétaire, même pour un solde. Tout le guichet en dépend.
  const peutComposer = peut(moi.role, "sortir_argent");
  const tientLeComptoir = peut(moi.role, "operer");
  const distribueLesCles = peut(moi.role, "gerer_les_gens");
  const estPlateforme = peut(moi.role, "administrer");

  const { terminal, sims, paiements } = await chargerDonnees(langue, { sms: 30, recus: 60 });
  const carte = sims.find((s) => s.enPlace) ?? null;

  // À qui demander, quand on ne peut pas. On ne le cherche que dans ce cas :
  // le propriétaire n'a pas besoin qu'on aille lire son propre nom.
  const proprietaire = !peutComposer ? await leProprietaire(moi.commerce) : null;
  // Combien de gens ont une clé — le chiffre que la propriétaire regarde.
  const combien = distribueLesCles && moi.commerce
    ? (await lire<{ personne: number }>(
        `acces?commerce=eq.${encodeURIComponent(moi.commerce)}`
        + `&retire_le=is.null&select=personne`)).length
    : 0;

  return (
    // Grand écran : le guichet à gauche, le terminal et ses détails à droite.
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-10">
      {/* En-tête */}
      {/* En toutes lettres, la bascule prend la place d'un titre : quand
          l'écran est étroit, elle passe sur sa propre ligne au lieu de
          serrer « Vue d'ensemble ». */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 lg:col-span-2">
        <div>
          {/* Le nom ET le rôle, en permanence. Sur un comptoir où le téléphone
              circule, ce n'est pas une décoration : c'est ce qui empêche
              d'agir sous le nom d'un autre sans s'en apercevoir. */}
          <p className="text-small text-ink-soft">
            {t.bonjour(moi.nom)} · {tg.role[moi.role]}
          </p>
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

      {/* Le guichet : la carte (seul solde) et les gestes que le rôle permet */}
      {carte ? (
        <AccueilGuichet
          peutComposer={peutComposer}
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

      {/* Ce que ce rôle ne fera pas ici, dit AVANT qu'on essaie — et avec le
          chemin honnête : un nom, un numéro, et la phrase à dire. */}
      {!peutComposer && !estPlateforme && (
        <section className="rounded-card bg-sable p-4 lg:col-start-1">
          <div className="flex gap-3">
            <span aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-card bg-surface-raised">
              <IconWallet size={20} className="text-laterite" />
            </span>
            <div className="min-w-0">
              <h2 className="text-heading font-semibold text-balance">
                {proprietaire ? tg.reserveTitre(proprietaire.nom) : tg.reserveTitreSansNom}
              </h2>
              <p className="mt-1.5 text-small leading-relaxed text-ink-soft">
                {tientLeComptoir ? tg.reserveDit : tg.lectureSeuleDit}
              </p>
            </div>
          </div>
          {proprietaire?.telephone ? (
            <a href={`tel:${proprietaire.telephone.replace(/\s/g, "")}`}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-btn border border-line-control bg-surface-raised px-4 text-small font-medium transition hover:border-ink-faint">
              <IconPhone size={16} />
              {tg.appeler(proprietaire.nom)} · <span className="tabnums">{proprietaire.telephone}</span>
            </a>
          ) : (
            <p className="mt-3 text-caption leading-relaxed text-ink-faint">{tg.sansNumero}</p>
          )}
          <p className="mt-2 text-caption leading-relaxed text-ink-faint">{tg.quoiDire}</p>
        </section>
      )}

      {/* La plateforme : elle voit, elle administre, elle ne déplace rien. La
          séparation est structurelle — autant l'écrire là où elle se vit. */}
      {estPlateforme && (
        <section className="rounded-card border border-line bg-surface-raised p-4 lg:col-start-1">
          <div className="flex gap-3">
            <IconLock size={20} className="mt-0.5 shrink-0 text-laterite" />
            <div>
              <h2 className="text-heading font-semibold">{tg.plateformeTitre}</h2>
              <p className="mt-1.5 text-small leading-relaxed text-ink-soft">
                {tg.plateformeDit}
              </p>
            </div>
          </div>
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

        {/* Les gens du commerce : le chemin n'existe que pour qui distribue
            les clés. Le montrer aux autres serait promettre un refus. */}
        {distribueLesCles && (
          <Link href="/gens"
            className="mt-4 flex items-center gap-3 rounded-card border border-line bg-surface-raised px-4 py-3.5 transition hover:border-ink-faint">
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium">{tg.lesGens}</p>
              <p className="mt-0.5 text-small text-ink-faint">{tg.lesGensAide(combien)}</p>
            </div>
            <IconChevron size={16} className="shrink-0 text-ink-faint" />
          </Link>
        )}
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
        ) : tientLeComptoir ? (
          // Cliquables : chaque ligne ouvre la même fiche que la boîte de
          // réception — le message en entier, sa nature, son reçu.
          <DerniersSms paiements={paiements.slice(0, 6)} />
        ) : (
          // Sans le comptoir, la fiche n'aurait que des gestes refusés : on
          // montre la même information, et le seul geste permis — le reçu.
          <ListeLecture paiements={paiements.slice(0, 6)} />
        )}
      </section>
    </div>
  );
}

/**
 * Le propriétaire du commerce : son nom, et son numéro s'il en a laissé un.
 *
 * Deux questions plutôt qu'une jointure : la table « acces » pointe quatre
 * fois vers « personnes », et une jointure automatique ne saurait pas laquelle
 * suivre.
 */
async function leProprietaire(commerce: string | null) {
  if (!commerce) return null;
  const acces = await lireUne<{ personne: number }>(
    `acces?commerce=eq.${encodeURIComponent(commerce)}&role=eq.proprietaire`
    + `&retire_le=is.null&select=personne&limit=1`);
  if (!acces) return null;
  return lireUne<{ nom: string; telephone: string | null }>(
    `personnes?id=eq.${acces.personne}&select=nom,telephone&limit=1`);
}
