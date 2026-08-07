import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesReglages } from "@/lib/textes/reglages";
import { textesCharpente } from "@/lib/textes/charpente";
import { forceReseau } from "@/lib/types";
import { IconHash, IconWallet } from "../icons";
import { Bouton } from "../ui/bouton";
import { Carte, EnTeteSection } from "../ui/carte";
import { Vide } from "../ui/etat";
import { Liste, Rangee } from "../ui/rangee";
import {
  Bascule,
  BoutonDeconnexion,
  ReglageNumero,
  SectionLangue,
  SectionSecurite,
} from "./interactifs";

/**
 * LES RÉGLAGES — l'écran le plus épais du dépôt, remis à sa taille.
 *
 * Mesuré avant : 221 objets DOM, 2637 px de haut sur un téléphone de 390 px,
 * soit 3,12 écrans à faire défiler pour six bascules et deux boutons. Ce qui a
 * disparu, et pourquoi (docs/REFONTE-V2.md §2 et §3) :
 *
 *   — LA SECTION « CODES USSD », 572 px, 21,7 % de la page, pour six lignes
 *     qu'on ne réglait pas : ce qu'elle appelait « modifier » n'écrivait nulle
 *     part. Les codes vivent où on les compose, `/ussd`, et une rangée y mène.
 *   — LA CARTE « NELSON », 106 px pour deux lignes non modifiables posées en
 *     tête d'écran : le mur commençait par ce qu'on ne peut pas toucher. Une
 *     ligne dans l'en-tête dit la même chose pour 20 px.
 *   — LES CINQ PARAGRAPHES GRIS, 289 px pour 197 mots en 12 px sur 16
 *     d'interligne, dont un de six lignes plus haut que la carte qu'il
 *     commentait. On lit au plus 28 % des mots d'une page.
 *   — « SE DÉCONNECTER » a quitté le bas de l'écran. Voir `interactifs.tsx`.
 *
 * ET DEUX RÉGLAGES DE MISE EN PAGE :
 *
 *   — DEUX COLONNES DÈS QUE LE TROU LES TIENT, et non plus « à partir de
 *     1024 px de fenêtre ». C'est une REQUÊTE DE CONTENEUR (§7) : la media
 *     query mesure la fenêtre, jamais la place où l'on pose le composant. En
 *     834 px, la fenêtre annonce « grand écran » alors que le rail en prend
 *     240 et les marges 64 : il reste 530 px. Deux colonnes de 249 y tronquent
 *     « Changer le mot de passe », « Double authentification » et « Orange ·
 *     puce en place » — mesuré. Le seuil est donc posé sur les 672 px du
 *     conteneur, pas sur la fenêtre : en 834 px, replier le rail (698 px de
 *     trou) donne les deux colonnes, le déplier les reprend. C'est la seule
 *     règle qui ne ment jamais, quel que soit l'appareil.
 *   — LES GOUTTIÈRES. Huit écarts de 32 px valaient 256 px, presque 10 % de la
 *     page en air. 24 entre deux sections d'un même groupe, 32 entre les
 *     groupes : l'en-tête et le corps des réglages.
 */

export const dynamic = "force-dynamic";

export default async function Reglages() {
  const langue = await langueServeur();
  const t = textesReglages[langue];
  const tc = textesCharpente[langue];
  // « 4/31 » ne se lit pas : le chiffre de `AT+CSQ` devient un mot.
  const motReseau = (signal: number | null) => {
    const force = forceReseau(signal);
    return force ? tc.reseau[force] : "—";
  };
  const { terminal, sims } = await chargerDonnees(langue, { sms: 0, recus: 0 });
  const carte = sims.find((s) => s.enPlace);
  const operateur = carte?.operateur ?? "Orange";

  return (
    // `@container` : la zone se DÉCLARE ici et se MESURE plus bas. Une requête
    // de conteneur interroge toujours un ancêtre — un élément ne peut pas se
    // mesurer lui-même, et poser les deux sur le même div ne fait rien du tout.
    <div className="@container flex flex-col gap-8">
      {/* L'EN-TÊTE PORTE LE PROPRIÉTAIRE ET LA SORTIE.
          La carte « Nelson » — disque, nom, qualité, 106 px et une gouttière —
          disait deux choses qu'on ne peut pas modifier, à l'endroit exact où
          l'écran commence. Elle tient sur la ligne qui servait de sous-titre :
          « Le terminal, les puces, la sécurité » ne faisait que réciter les
          titres des sections qui suivent. */}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title">{t.titre}</h1>
          <p className="mt-1 truncate text-small text-ink-soft">
            Nelson · {t.proprietaire}
          </p>
        </div>
        <div className="shrink-0">
          <BoutonDeconnexion />
        </div>
      </header>

      {/* LE TROU, PAS LA FENÊTRE. `@container` mesure la place réellement
          disponible ; `@2xl` vaut 672 px de conteneur, la largeur en dessous de
          laquelle deux colonnes tronquent leurs libellés. Les colonnes sont
          indépendantes (`items-start`) — sans quoi la plus courte s'étirerait à
          la hauteur de l'autre. */}
      <div className="flex flex-col gap-6 @2xl:grid @2xl:grid-cols-2 @2xl:items-start @2xl:gap-x-8">
        <div className="flex flex-col gap-6">
          {/* État du terminal */}
          <section>
            <EnTeteSection titre={t.terminal} />
            <Carte bordABord>
              {terminal ? (
                <Liste>
                  {/* Le point ne parle jamais seul : le mot « En ligne » ou
                      « Muet » est écrit à côté (WCAG 1.4.1). */}
                  <Rangee
                    icone={
                      <span
                        aria-hidden
                        className={`size-2 rounded-full ${
                          terminal.enLigne ? "bg-positive" : "bg-negative"
                        }`}
                      />
                    }
                    titre={terminal.enLigne ? t.enLigne : t.muet}
                    valeur={<span className="tabnums">{t.misAJour(terminal.majTexte)}</span>}
                  />
                  <Rangee titre={t.nom} valeur={terminal.nom} />
                  {terminal.version ? (
                    <Rangee titre={t.version} valeur={terminal.version} />
                  ) : null}
                </Liste>
              ) : (
                // Le seul texte long qui reste sur cet écran, et c'est un ÉTAT
                // VIDE : il ne commente pas ce qu'on voit, il dit ce qui manque
                // et ce qui va se passer. Il disparaît dès qu'un terminal parle.
                <p className="max-w-lecture px-4 text-small text-ink-soft">
                  {t.aucunTerminal}
                </p>
              )}
              <div className="mt-4 border-t border-line px-4 pt-4">
                <Bouton variante="secondaire" pleineLargeur>
                  {t.redemarrer}
                </Bouton>
              </div>
            </Carte>
          </section>

          {/* Comptes */}
          <section>
            <EnTeteSection
              titre={t.comptes}
              action={
                <Bouton variante="discret" href="/cartes">
                  {t.voirSoldes}
                </Bouton>
              }
            />
            {sims.length === 0 ? (
              <Vide titre={t.aucuneCarte} detail={t.aucuneCarteDetail} />
            ) : (
              <div className="flex flex-col gap-2">
                {sims.map((s) => (
                  <Carte key={s.iccid} bordABord>
                    <Liste>
                      <Rangee
                        lignes={2}
                        icone={<IconWallet size={24} />}
                        titre={s.nom || s.libelle}
                        sousTitre={
                          s.enPlace
                            ? `${s.libelle} · ${t.carte(s.iccid.slice(-8))}`
                            : t.retireeJournal(s.derniereVue)
                        }
                        valeur={s.enPlace ? motReseau(s.signal) : "—"}
                      />
                    </Liste>
                    {/* Le numéro se règle d'ici : au repos un bouton de 44, en
                        saisie un champ de 44 et son « OK » de 44 — d'aplomb. */}
                    {s.enPlace && (
                      // Le numéro est une donnée de la carte, pas une note en
                      // bas de rangée : il lui faut son étiquette et sa place
                      // sur la grille des rangées. Sans elle, il flottait seul
                      // et à droite, sans dire ce qu'il était. Le mot vient du
                      // dictionnaire (`noteNumeroMot`) : la majuscule est
                      // posée en CSS pour ne pas toucher à la chaîne traduite.
                      <div className="flex min-h-rangee items-center justify-between gap-3 px-4">
                        <span className="text-small text-ink-soft first-letter:uppercase">
                          {t.noteNumeroMot}
                        </span>
                        <ReglageNumero
                          iccid={s.iccid}
                          numeroInitial={s.numero}
                          libelle={s.libelle}
                        />
                      </div>
                    )}
                  </Carte>
                ))}
              </div>
            )}
            {/* Le paragraphe « ICCID » de 48 mots vivait ici, puis celui du
                numéro : 96 mots en tout, en 12 px, sous une carte qu'ils
                commentaient. Le premier n'expliquait que la différence entre
                « carte », « SIM », « puce » et « compte » — quatre mots pour un
                seul objet, et l'écran dit « puce » partout depuis. Le second
                expliquait pourquoi le numéro ne se lit pas sur la puce ; ce
                qu'il faut en retenir se voit sans phrase, puisque la ligne
                « numéro » affiche « numéro non inscrit » et se touche. */}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          {/* Notifications — LA ZONE DENSE. Quatre libellés courts, un contrôle
              par ligne, rien à lire : la rangée recule de 4 px (56 → 52) et la
              carte gagne 16 px sans que la cible de l'interrupteur bouge d'un
              pixel. C'est la zone qui le déclare, jamais l'appareil. */}
          <section>
            <EnTeteSection titre={t.notifications} />
            <Carte bordABord data-densite="dense">
              <Liste>
                <Bascule t={t.notifPaiement} defaut />
                <Bascule t={t.notifRapport} defaut />
                <Bascule t={t.notifCourant} defaut />
                <Bascule t={t.notifTelegram} defaut />
              </Liste>
            </Carte>
          </section>

          {/* La langue de la plateforme. La bascule vit aussi dans la
              navigation, sur chaque écran. */}
          <SectionLangue />

          {/* LES CODES USSD, RÉDUITS À LEUR CHEMIN.
              Six rangées en lecture seule et un formulaire d'ajout qui
              n'écrivait nulle part coûtaient 572 px. Le catalogue est dans
              `lib/codes.ts` ; il se compose sur `/ussd`, qui est aussi le seul
              écran où le pavé du code secret existe. La fonction n'a pas
              disparu : elle est à une rangée d'ici, et le rail la donne déjà
              sur grand écran. */}
          <section>
            <EnTeteSection titre={t.codesUssd} />
            <Carte bordABord>
              <Liste>
                <Rangee
                  icone={<IconHash size={24} />}
                  titre={t.carteEnPlace(operateur)}
                  chevron
                  href="/ussd"
                />
              </Liste>
            </Carte>
          </section>

          {/* Sécurité */}
          <SectionSecurite />
        </div>
      </div>
    </div>
  );
}
