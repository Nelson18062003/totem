import { donneesMontrees } from "@/lib/ce-qu-on-montre";
import Link from "next/link";
import { langueServeur } from "@/lib/langue-serveur";
import { RIEN } from "@/lib/portee";
import { compteConnecte } from "@/lib/qui";
import { quiAdministre } from "@/lib/garde";
import { textesReglages } from "@noyau/textes/reglages";
import { journalPour } from "@noyau/textes/journal";
import { IconWallet } from "../icons";
import {
  BoutonDeconnexion,
  ReglageNom,
  ReglageNumero,
  SectionCodes,
  SectionEssaiNotification,
  SectionLangue,
  SectionMotDePasse,
  SectionQui,
} from "./interactifs";

export const dynamic = "force-dynamic";

export default async function Reglages() {
  const langue = await langueServeur();
  const t = textesReglages[langue];
  const tj = journalPour(langue);
  // Qui est là, et administre-t-il ? Le compte nomme la carte d'en-tête ;
  // le droit d'administrer décide si la carte de la console s'affiche.
  const [moi, admin, donnees] = await Promise.all([
    compteConnecte(),
    quiAdministre(),
    donneesMontrees(langue, { sms: 0, recus: 0 }),
  ]);
  const { terminal, sims, raccourcis } = donnees;
  // Sans verrou (développement local), tout est ouvert : on est le
  // propriétaire. Sinon, celui qui n'administre pas TIENT des cartes — il
  // les manie, mais le carnet des boutons d'un opérateur, qui sert à toutes
  // ses cartes, reste au propriétaire.
  const proprietaire = !process.env.SESSION_SECRET || admin != null;
  // Une section de codes PAR OPÉRATEUR présent — les cartes en place
  // d'abord. Le repli « Orange » d'autrefois mentait dès qu'une MTN était
  // dans le berceau.
  const enPlaceOps = sims.filter((s) => s.enPlace).map((s) => s.operateur);
  const operateurs = [...new Set([...enPlaceOps, ...sims.map((s) => s.operateur)])]
    .filter((op) => op && op !== "?");

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {/* Le compte connecté — tel qu'il est en base, jamais un nom inventé.
          Une session de secours ou un vieux jeton ne désigne personne : la
          carte montre alors le rôle seul. */}
      <section className="flex items-center gap-3.5 rounded-card border border-line bg-surface-raised p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-body font-medium uppercase">
          {(moi?.courriel || t.proprietaire).slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          {moi?.courriel && (
            <p className="truncate text-body font-medium">{moi.courriel}</p>
          )}
          <p className="truncate text-small text-ink-faint">
            {proprietaire ? t.proprietaire : t.titulaire}
          </p>
        </div>
      </section>

      {/* LA CONSOLE — pour celui qui administre, et lui seul. Les autres ne
          voient même pas la carte : un lien qui mène à un refus enseigne
          seulement qu'il existe une porte. */}
      {admin && (
        <section>
          <Link
            href="/console"
            className="flex items-center gap-3.5 rounded-card border border-line bg-surface-raised p-4 transition hover:border-ink-faint"
          >
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium">{t.console}</p>
              <p className="mt-0.5 text-small text-ink-faint">{t.consoleSous}</p>
            </div>
            <span aria-hidden className="text-ink-faint">›</span>
          </Link>
        </section>
      )}

      {/* Grand écran : deux colonnes de réglages, pas une pile sans fin. */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10">
      <div className="flex flex-col gap-8">
      {/* État du terminal */}
      <section>
        <h2 className="mb-3 text-heading font-semibold">{t.terminal}</h2>
        <div className="rounded-card border border-line bg-surface-raised">
          {terminal ? (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="flex items-center gap-2.5 text-body">
                  <span className={`size-2 rounded-full ${terminal.enLigne ? "bg-positive-vif" : "bg-negative"}`} />
                  {terminal.enLigne ? t.enLigne : t.muet}
                </span>
                <span className="text-small tabnums text-ink-faint">
                  {t.misAJour(terminal.majTexte)}
                </span>
              </div>
              <dl className="divide-hair px-4">
                <Ligne t={t.nom} v={terminal.nom} />
                {terminal.version && <Ligne t={t.version} v={terminal.version} />}
              </dl>
            </>
          ) : (
            <p className="px-4 py-4 text-small leading-relaxed text-ink-soft">
              {t.aucunTerminal}
            </p>
          )}
        </div>
      </section>

      {/* Comptes */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-heading font-semibold">{t.comptes}</h2>
          <Link href="/cartes" className="text-small text-ink-soft underline-offset-4 hover:underline">
            {t.voirSoldes}
          </Link>
        </div>
        {sims.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-small text-ink-faint">
            {t.aucuneCarte}
          </p>
        ) : (
          <ul className="divide-hair rounded-card border border-line bg-surface-raised px-4">
            {sims.map((s) => (
              <li key={s.iccid} className="flex items-center gap-3 py-3.5">
                <IconWallet size={18}
                  className={`shrink-0 ${s.enPlace ? "text-ink-soft" : "text-ink-faint"}`} />
                <div className="min-w-0 flex-1">
                  {s.enPlace ? (
                    <ReglageNom
                      iccid={s.iccid}
                      nomInitial={s.nom}
                      libelle={s.libelle}
                    />
                  ) : (
                    <p className="text-body font-medium text-ink-soft">
                      {s.nom || s.libelle}
                    </p>
                  )}
                  {s.enPlace ? (
                    <p className="flex flex-wrap items-center gap-x-1.5 text-small tabnums text-ink-faint">
                      <ReglageNumero
                        iccid={s.iccid}
                        numeroInitial={s.numero}
                        libelle={s.libelle}
                      />
                      <span>· {s.libelle} · {t.carte(s.iccid.slice(-8))}</span>
                    </p>
                  ) : (
                    <p className="text-small tabnums text-ink-faint">
                      {t.retireeJournal(s.derniereVue)}
                    </p>
                  )}
                </div>
                {/* Le signal : 0 à 31, ou « inconnu » quand le modem ne sait
                    pas le dire (il répond 99) ou que le boîtier se tait. */}
                <span className="shrink-0 self-start pt-0.5 text-small tabnums text-ink-faint">
                  {!s.enPlace ? "—"
                    : s.presence === "inconnue" ? t.presenceInconnue
                      : s.signal != null ? `${s.signal}/31` : t.signalInconnu}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">
          {t.noteIccid}
        </p>
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">
          {t.noteNumeroAvant}
          <strong className="font-medium text-ink-soft">{t.noteNumeroMot}</strong>
          {t.noteNumeroMilieu}
          {t.noteNumeroFin}
        </p>
      </section>

      {/* Notifications */}
      <section>
        <h2 className="mb-3 text-heading font-semibold">{t.notifications}</h2>
        {/* Trois interrupteurs vivaient ici : ils ne commandaient RIEN — un
            état local qui se remettait à zéro au rechargement. Un contrôle qui
            rassure sans agir est pire que pas de contrôle. À la place, ce qui
            est vrai : le terminal notifie chaque mouvement, et l'affichage se
            règle sur le téléphone. L'essai, juste dessous, le prouve. */}
        <div className="rounded-card border border-line bg-surface-raised px-4 py-3.5">
          <p className="text-small leading-relaxed text-ink-soft">
            {t.notifExplique}
          </p>
        </div>
      </section>

      {/* L'essai, juste sous les réglages de notification : c'est là qu'on se
          demande si elles marchent vraiment. */}
      <SectionEssaiNotification />
      </div>

      <div className="flex flex-col gap-8">
      {/* La langue de la plateforme — en tête de colonne : c'est le premier
          réglage qu'un nouvel arrivant cherche. La bascule vit aussi dans la
          navigation, sur chaque écran. */}
      <SectionLangue />

      {/* Codes USSD — une section par opérateur vu par le terminal, avec les
          boutons appris par le robot (💾 sur Telegram) en regard */}
      {proprietaire && operateurs.map((op) => (
        <SectionCodes
          key={op}
          operateur={op}
          enPlace={enPlaceOps.includes(op)}
          appris={raccourcis[op] ?? []}
        />
      ))}

      {/* Qui peut se connecter — la section ne s'affiche que pour le
          propriétaire ; elle se tait d'elle-même pour les autres. */}
      <SectionQui />

      {/* CE QUI S'EST PASSÉ. Le terminal tenait son journal depuis toujours
          et personne ne le lisait : aucun écran ne l'affichait. Il est ici,
          là où l'on va quand quelque chose ne va pas. Réservé au
          propriétaire : c'est le journal de TOTEM, pas celui d'un compte. */}
      {proprietaire && (
      <section>
        <Link
          href="/journal"
          className="flex items-center gap-3.5 rounded-card border border-line bg-surface-raised p-4 transition hover:border-ink-faint"
        >
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium">{tj.voirLeJournal}</p>
            <p className="mt-0.5 text-small text-ink-faint">{tj.voirLeJournalSous}</p>
          </div>
          <span aria-hidden className="text-ink-faint">›</span>
        </Link>
      </section>
      )}

      {/* Sécurité */}
      <section>
        <h2 className="mb-3 text-heading font-semibold">{t.securite}</h2>
        {/* Deux rangées vivaient ici : « Mot de passe » (sans action) et
            « Double auth · Activée » — qui AFFIRMAIT une double
            authentification INEXISTANTE. Annoncer une protection qu'on n'a
            pas est le pire des mensonges de sécurité. Retirées. Reste ce qui
            est vrai, et qui compte : le code secret ne se garde nulle part. */}
        <div className="rounded-card border border-line bg-surface-raised px-4 py-3.5">
          <p className="text-small leading-relaxed text-ink-soft">
            {t.notePin}
          </p>
        </div>
        {/* Le mot de passe se change ici — pour un COMPTE. La clé de secours
            n'en a pas à changer : elle vit dans les variables du serveur. */}
        {moi && (
          <div className="mt-3">
            <SectionMotDePasse />
          </div>
        )}
        {/* SUPPRIMER MON COMPTE — le même geste que dans l'application, sur
            la page publique qui le fait (mot de passe redemandé). Pas pour
            le propriétaire de la plateforme : c'est lui qui attribue les
            cartes, la plateforme le refuserait. */}
        {moi && moi.role !== "proprietaire" && (
          <Link
            href="/suppression"
            className="mt-3 flex items-center gap-3.5 rounded-card border border-line bg-surface-raised p-4 text-body font-medium text-negative transition hover:border-ink-faint"
          >
            <span className="flex-1">{t.supprimerCompte}</span>
            <span aria-hidden className="text-ink-faint">›</span>
          </Link>
        )}
      </section>
      </div>
      </div>

      <BoutonDeconnexion />
    </div>
  );
}

function Ligne({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-small text-ink-soft">{t}</dt>
      <dd className="text-small font-medium">{v}</dd>
    </div>
  );
}

