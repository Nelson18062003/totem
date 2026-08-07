import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesCartes } from "@/lib/textes/cartes";
import { fcfa } from "@/lib/types";
import { IconArrowDown, IconArrowUp, IconList, IconLock, IconWallet } from "../icons";
import { Bouton } from "../ui/bouton";
import { Carte, EnTeteSection } from "../ui/carte";
import { Liste, Rangee } from "../ui/rangee";
import { Vide } from "../vide";

export const dynamic = "force-dynamic";

export default async function Comptes() {
  const langue = await langueServeur();
  const t = textesCartes[langue];
  const { sims, paiements } = await chargerDonnees(langue);
  const enPlace = sims.filter((s) => s.enPlace);
  const retirees = sims.filter((s) => !s.enPlace);
  const soldeTotal = enPlace.reduce((s, x) => s + (x.solde ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {/* Cartes en place — côte à côte dès que la largeur le permet.
          La carte de compte est une SURFACE DE MARQUE (`acct` / `acct-alt`),
          pas une carte du système : son aplat sombre vient de globals.css. Elle
          en reprend le rayon et le padding — `p-4`, jamais 20. */}
      {enPlace.length === 0 ? (
        <Vide titre={t.videTitre} detail={t.videDetail} />
      ) : (
        <section className="grid gap-3 sm:grid-cols-2">
          {enPlace.map((s, i) => (
            <div key={s.iccid} className={`rounded-card p-4 ${i === 0 ? "acct" : "acct-alt"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-caption uppercase tracking-wider ${i === 0 ? "text-white/60" : "text-ink-faint"}`}>
                    {s.operateur === "MTN" ? "MTN Mobile Money" : s.operateur === "Orange" ? "Orange Money" : s.libelle}
                  </p>
                  <p className="mt-3 text-display font-semibold tabnums tracking-tight">
                    {s.solde == null ? "—" : fcfa(s.solde, langue)}
                  </p>
                  {/* Sur l'aplat sombre, le texte secondaire descendait à 45 %
                      d'opacité : 4,49:1, sous le seuil de 4,5 de WCAG 1.4.3 —
                      et c'est de l'heure du relevé qu'il s'agit, pas d'un
                      ornement. Les deux lignes remontent au même 55 % que le
                      numéro voisin : 6,08:1. */}
                  {s.solde != null && s.soldeMaj && (
                    <p className={`mt-1 text-caption tabnums ${i === 0 ? "text-white/55" : "text-ink-faint"}`}>
                      {t.soldeLe(s.soldeMaj)}
                    </p>
                  )}
                  <p className={`mt-1 text-small tabnums ${i === 0 ? "text-white/55" : "text-ink-faint"}`}>
                    {s.numero || t.numeroAbsent}
                  </p>
                  {/* L'ICCID est ce qui distingue deux cartes du même opérateur. */}
                  <p className={`mt-2 text-caption tabnums ${i === 0 ? "text-white/55" : "text-ink-faint"}`}>
                    {t.carte(s.iccid.slice(-8))}
                    {s.itinerance && ` · ${t.itinerance(s.reseau)}`}
                  </p>
                </div>
                {/* La force du signal : une puce d'information, `h-puce` (28),
                    qui déclare sa hauteur au lieu de l'obtenir par addition.
                    Le point ne porte rien tout seul — c'est « 23/31 » qui le
                    dit —, donc il reste décoratif et se tait. */}
                {s.signal != null && (
                  <span className={`inline-flex h-puce shrink-0 items-center gap-2 rounded-full px-3 text-caption tabnums ${
                    i === 0 ? "bg-white/10 text-white/70" : "bg-surface-2 text-ink-soft"
                  }`}>
                    <span aria-hidden className="size-2 rounded-full bg-positive" /> {s.signal}/31
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Opérations sur comptes — de vrais boutons du système : 44 px déclarés,
          contour porteur, icône 20. Ils faisaient 76 px que personne n'avait
          choisis. Sur téléphone ils s'empilent : un libellé entier tient sur
          une ligne, on ne l'abrège pas. */}
      <section className="grid gap-2 sm:grid-cols-3">
        {[
          { l: t.consulterSolde, Icone: IconWallet },
          { l: t.historique, Icone: IconList },
          { l: t.verrouiller, Icone: IconLock },
        ].map(({ l, Icone }) => (
          <Bouton key={l} variante="secondaire" pleineLargeur icone={<Icone size={20} />}>
            {l}
          </Bouton>
        ))}
      </section>

      {/* Répartition — n'a de sens qu'avec plusieurs cartes en place */}
      {enPlace.length > 1 && soldeTotal > 0 && (
      <section>
        <EnTeteSection titre={t.repartition} />
        <Carte bordABord>
          {/* La barre et les pastilles de la légende PORTENT la donnée : elles
              disent quelle part du total revient à quelle carte. WCAG 1.4.11
              leur impose donc 3:1. En `surface-3` elles valaient 1,22:1 sur le
              blanc de la carte — invisibles. `contour` est le neutre du système
              garanti au-dessus du seuil : 3,87:1 sur blanc. */}
          <div className="mb-4 px-4">
            <div className="flex h-2 overflow-hidden rounded-sm">
              {enPlace.map((s, i) => (
                <div key={s.iccid} style={{ width: `${((s.solde ?? 0) / soldeTotal) * 100}%` }}
                  className={i === 0 ? "bg-ink" : "bg-contour"} />
              ))}
            </div>
          </div>
          <Liste>
            {enPlace.map((s, i) => (
              <Rangee
                key={s.iccid}
                icone={<span aria-hidden className={`size-4 rounded-sm ${i === 0 ? "bg-ink" : "bg-contour"}`} />}
                titre={s.libelle}
                montant={{
                  texte: `${fcfa(s.solde ?? 0, langue)} · ${Math.round(((s.solde ?? 0) / soldeTotal) * 100)}%`,
                  sens: "neutre",
                }}
              />
            ))}
          </Liste>
        </Carte>
      </section>
      )}

      {/* Cartes retirées — l'historique d'une puce absente reste consultable */}
      {retirees.length > 0 && (
        <section>
          <EnTeteSection titre={t.retireesTitre} detail={t.retireesDetail} />
          <Liste>
            {retirees.map((s) => (
              <Rangee
                key={s.iccid}
                lignes={2}
                pastille={<IconWallet size={16} />}
                titre={s.libelle}
                sousTitre={<span className="tabnums">{t.bilanRetiree(s.nbPaiements, s.derniereVue)}</span>}
                montant={{ texte: fcfa(s.totalRecu, langue), sens: "neutre" }}
              />
            ))}
          </Liste>
        </section>
      )}

      {/* Mouvements. Le signe est posé par la rangée, jamais par l'écran :
          crédit et débit sont à 1,21:1 l'un de l'autre, donc indiscernables en
          niveaux de gris — c'est le `+` ou le `−` qui porte le sens. */}
      {paiements.length > 0 && (
        <section>
          <EnTeteSection titre={t.mouvements} />
          <Liste>
            {paiements.filter((p) => p.montant != null).slice(0, 5).map((p) => (
              <Rangee
                key={p.id}
                lignes={2}
                pastille={p.sens === "in" ? <IconArrowDown size={16} /> : p.sens === "out" ? <IconArrowUp size={16} /> : "?"}
                titre={p.nom}
                sousTitre={`${p.sim} · ${p.date} · ${p.heure}`}
                montant={{
                  texte: fcfa(p.montant!, langue),
                  sens: p.sens === "in" ? "credit" : p.sens === "out" ? "debit" : "neutre",
                }}
              />
            ))}
          </Liste>
        </section>
      )}
    </div>
  );
}
