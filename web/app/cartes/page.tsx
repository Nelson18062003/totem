import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesCartes } from "@/lib/textes/cartes";
import { textesCharpente } from "@/lib/textes/charpente";
import { fcfa, forceReseau } from "@/lib/types";
import { IconList, IconLock, IconWallet } from "../icons";
import { Bouton } from "../ui/bouton";
import { Carte, EnTeteSection } from "../ui/carte";
import { Liste, Rangee } from "../ui/rangee";

export const dynamic = "force-dynamic";

// Le point qui accompagne le mot. Il ne porte rien tout seul, mais un point
// vert à côté de « Réseau faible » serait un mensonge.
const TON_RESEAU = { faible: "bg-negative", moyen: "bg-alert", bon: "bg-positive" } as const;

/**
 * L'ÉCRAN DES PUCES — v2. C'était le pire écran de l'application : 67 % de sa
 * hauteur en décor avant le premier vrai contenu.
 *
 * CE QUI EST PARTI :
 *
 *   — L'ENCADRÉ « AUCUNE PUCE » ET SES TROIS BOUTONS MORTS. 154 px de boîte
 *     pour 96 px de texte, et trois boutons — Consulter le solde, Historique,
 *     Verrouiller — qui prétendaient agir sur une puce INEXISTANTE. Le même
 *     état vide, mot pour mot, vit sur l'accueil : `videTitre` et
 *     `videDetail` disaient ici ce que `aucuneCarte` et `aucuneCarteDetail`
 *     disaient là-bas. Un état vide, un seul, et il est sur l'écran qu'on
 *     ouvre en premier.
 *
 *   — LES ACTIONS QUAND IL N'Y A RIEN À ACTIONNER. Elles ne se déplacent
 *     pas : elles n'existent que s'il y a une puce. Mesuré au pouce (pivot
 *     340/880) : « Consulter le solde » était à 558 px du bas, arc 611 —
 *     DIFFICILE, hors de portée. Suivant les puces au lieu de suivre un
 *     encadré vide, il tombe à 382 px du bas, arc 442.
 *
 * CE QUI A CHANGÉ DE FORME :
 *
 *   — UN SEUL CADRAGE POUR LES LISTES. `Liste` était encadrée sur l'accueil
 *     (`Carte bordABord`) et nue ici, sur deux écrans voisins, pour le même
 *     composant. Le cadre l'emporte : c'est ce que font les huit autres
 *     listes de l'application (encaissements, réglages, opérations). Les
 *     rangées de tous les écrans partagent enfin un seul bord gauche.
 *
 *   — LA PASTILLE TOMBE DES LISTES D'ARGENT. Ces trois listes déclarent un
 *     `montant` : la rangée v2 les traite comme des listes d'argent et ignore
 *     le disque de tête. On le retire plutôt que de laisser du code qui ne
 *     rend rien. Le sens du mouvement est porté par le signe du montant,
 *     jamais par une icône `aria-hidden`. La `Répartition`, elle, garde son
 *     `icone` : ce carré-là PORTE la donnée (il dit quelle part de la barre
 *     revient à quelle puce), et il est sur TOUTES les rangées de sa liste.
 */
export default async function Comptes() {
  const langue = await langueServeur();
  const t = textesCartes[langue];
  const tc = textesCharpente[langue];
  // « 23/31 » ne se lit pas : le chiffre de `AT+CSQ` devient un mot, et le
  // point suit ce mot au lieu d'être vert quoi qu'il arrive.
  const reseau = (signal: number | null) => {
    const force = forceReseau(signal);
    return force && { mot: tc.reseau[force], point: TON_RESEAU[force] };
  };
  const { sims, paiements } = await chargerDonnees(langue);
  const enPlace = sims.filter((s) => s.enPlace);
  const retirees = sims.filter((s) => !s.enPlace);
  const soldeTotal = enPlace.reduce((s, x) => s + (x.solde ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      {/* LE TITRE, SEUL. « Chaque puce garde son propre solde et son propre
          journal » décrivait ce que les cartes montrent 40 px plus bas, en
          plus gros et en chiffres. On lit au plus 28 % des mots d'une page :
          ce paragraphe-là se payait en hauteur, jamais en compréhension —
          c'est le même retrait qu'a fait la boîte de réception, et c'est le
          troisième bord gauche de l'écran qui disparaît avec lui. */}
      <header>
        <h1 className="text-title">{t.titre}</h1>
      </header>

      {/* Les puces en place, et ce qu'on fait avec. Les deux vont ensemble :
          sans puce, ni l'une ni l'autre section n'a de raison d'être — et
          surtout pas trois boutons qui agiraient sur rien. */}
      {enPlace.length > 0 && (
        <>
          {/* Côte à côte dès que la largeur le permet.
              La carte de compte est une SURFACE DE MARQUE (`acct` / `acct-alt`),
              pas une carte du système : son aplat sombre vient de globals.css.
              Elle en reprend le rayon et le padding — `p-4`, jamais 20. */}
          <section className="grid gap-3 sm:grid-cols-2">
            {enPlace.map((s, i) => (
              <div key={s.iccid} className={`rounded-card p-4 ${i === 0 ? "acct" : "acct-alt"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-caption uppercase tracking-wider ${i === 0 ? "text-white/60" : "text-ink-faint"}`}>
                      {s.operateur === "MTN" ? "MTN Mobile Money" : s.operateur === "Orange" ? "Orange Money" : s.libelle}
                    </p>
                    <p className="mt-3 text-display font-semibold tracking-tight">
                      {s.solde == null ? "—" : fcfa(s.solde, langue)}
                    </p>
                    {/* Sur l'aplat sombre, le texte secondaire descendait à 45 %
                        d'opacité : 4,49:1, sous le seuil de 4,5 de WCAG 1.4.3 —
                        et c'est de l'heure du relevé qu'il s'agit, pas d'un
                        ornement. Les deux lignes remontent au même 55 % que le
                        numéro voisin : 6,08:1. */}
                    {s.solde != null && s.soldeMaj && (
                      <p className={`mt-1 text-caption ${i === 0 ? "text-white/55" : "text-ink-faint"}`}>
                        {t.soldeLe(s.soldeMaj)}
                      </p>
                    )}
                    <p className={`mt-1 text-small ${i === 0 ? "text-white/55" : "text-ink-faint"}`}>
                      {s.numero || t.numeroAbsent}
                    </p>
                    {/* L'ICCID est ce qui distingue deux puces du même opérateur. */}
                    <p className={`mt-2 text-caption ${i === 0 ? "text-white/55" : "text-ink-faint"}`}>
                      {t.carte(s.iccid.slice(-8))}
                      {s.itinerance && ` · ${t.itinerance(s.reseau)}`}
                    </p>
                  </div>
                  {/* La force du réseau : une puce d'information, `h-puce` (28),
                      qui déclare sa hauteur au lieu de l'obtenir par addition.
                      Le point reste décoratif et se tait — c'est le MOT qui
                      porte l'information (WCAG 1.4.1). */}
                  {reseau(s.signal) && (
                    <span className={`inline-flex h-puce shrink-0 items-center gap-2 rounded-full px-3 text-caption ${
                      i === 0 ? "bg-white/10 text-white/70" : "bg-surface-2 text-ink-soft"
                    }`}>
                      <span aria-hidden className={`size-2 rounded-full ${reseau(s.signal)!.point}`} />
                      {reseau(s.signal)!.mot}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </section>

          {/* Opérations sur les puces — de vrais boutons du système. Sur
              téléphone ils s'empilent : un libellé entier tient sur une
              ligne, on ne l'abrège pas. */}
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
        </>
      )}

      {/* Répartition — n'a de sens qu'avec plusieurs puces en place */}
      {enPlace.length > 1 && soldeTotal > 0 && (
      <section>
        <EnTeteSection titre={t.repartition} />
        <Carte bordABord>
          {/* La barre et les pastilles de la légende PORTENT la donnée : elles
              disent quelle part du total revient à quelle puce. WCAG 1.4.11
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

      {/* Puces retirées — le journal d'une puce absente reste consultable */}
      {retirees.length > 0 && (
        <section>
          <EnTeteSection titre={t.retireesTitre} detail={t.retireesDetail} />
          <Carte bordABord>
            <Liste>
              {retirees.map((s) => (
                <Rangee
                  key={s.iccid}
                  lignes={2}
                  titre={s.libelle}
                  sousTitre={t.bilanRetiree(s.nbPaiements, s.derniereVue)}
                  montant={{ texte: fcfa(s.totalRecu, langue), sens: "neutre" }}
                />
              ))}
            </Liste>
          </Carte>
        </section>
      )}

      {/* Mouvements. Le signe est posé par la rangée, jamais par l'écran :
          crédit et débit sont à 1,21:1 l'un de l'autre, donc indiscernables en
          niveaux de gris — c'est le `+` ou le `−` qui porte le sens. */}
      {paiements.length > 0 && (
        <section>
          <EnTeteSection titre={t.mouvements} />
          <Carte bordABord>
            <Liste>
              {paiements.filter((p) => p.montant != null).slice(0, 5).map((p) => (
                <Rangee
                  key={p.id}
                  lignes={2}
                  titre={p.nom}
                  sousTitre={`${p.sim} · ${p.date} · ${p.heure}`}
                  montant={{
                    texte: fcfa(p.montant!, langue),
                    sens: p.sens === "in" ? "credit" : p.sens === "out" ? "debit" : "neutre",
                  }}
                />
              ))}
            </Liste>
          </Carte>
        </section>
      )}
    </div>
  );
}
