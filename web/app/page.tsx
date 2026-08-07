import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesAccueil } from "@/lib/textes/accueil";
import { textesCharpente } from "@/lib/textes/charpente";
import { textesSms } from "@/lib/textes/sms";
import { fcfa, jourDouala } from "@/lib/types";
import { AccueilGuichet } from "./accueil-client";
import { DerniersSms } from "./derniers-sms";
import { IconAlert, IconChevron, IconSettings } from "./icons";
import { Bouton, BoutonIcone } from "./ui/bouton";
import { EnTeteSection } from "./ui/carte";
import { Bandeau, Vide } from "./ui/etat";

export const dynamic = "force-dynamic";

/**
 * L'ACCUEIL — v2. Trois objets sont partis, un chiffre est arrivé.
 *
 * CE QUI EST PARTI :
 *
 *   — LA BASCULE DE LANGUE DE L'EN-TÊTE. Elle occupait 7 216 px² contre 4 704
 *     au titre de la page — 53 % de plus — et c'était le seul aplat saturé
 *     au-dessus de la ligne de flottaison. Or c'était un DOUBLON : le rail
 *     porte « English » sur le même écran, et les réglages portent la même
 *     bascule (`SectionLangue`) pour le téléphone, où le rail n'existe pas.
 *     Le chemin du téléphone reste ouvert : l'engrenage de cet en-tête mène
 *     aux réglages, et il est le SEUL — la barre flottante n'a que cinq
 *     onglets, réglages n'en fait pas partie. C'est pour ça qu'il reste, et
 *     c'est pour ça qu'il passe à `md:hidden` : au-dessus de 768 px le rail
 *     est là, avec sa ligne « Réglages ». Deux chemins pour le même endroit
 *     sur le même écran, c'était le même doublon, en plus petit.
 *
 *   — LA CARTE « TERMINAL » (emplacement, version, santé). 260 px de haut,
 *     21,5 % du document, pour trois lignes que le propriétaire ne touche
 *     jamais — et 136 800 px² de colonne vide en 1440, puisqu'elle réservait
 *     à elle seule une deuxième colonne de 300 px. Le rail porte déjà l'état
 *     du terminal en bas, sur chaque page.
 *     CE QUI RESTE : le SIGNAL. Un terminal muet, c'est un commerce qui
 *     n'encaisse plus sans le savoir — ça, ça compte. Une ligne, quand ça
 *     arrive ; rien du tout le reste du temps.
 *
 *   — LA DEUXIÈME COLONNE. Elle n'existait que pour la carte du terminal.
 *     Le contenu récupère les 332 px qu'elle prenait en 1440.
 *
 * CE QUI EST ARRIVÉ : LE TOTAL DU JOUR. Une application d'argent dont
 * l'accueil ne dit nulle part combien on a reçu aujourd'hui donnait son
 * premier bloc au matériel. Le chiffre existait déjà — sur `/encaissements`,
 * à un onglet de là. Il se lit ici, en tête, dans la même forme et avec les
 * mêmes mots (`recuAujourdhui`, `nbPaiements`) : un seul calcul, un seul
 * vocabulaire, deux écrans.
 */
export default async function Accueil() {
  const langue = await langueServeur();
  const t = textesAccueil[langue];
  const tc = textesCharpente[langue];
  const ts = textesSms[langue];
  const { terminal, sims, paiements } = await chargerDonnees(langue, { sms: 30, recus: 60 });
  const carte = sims.find((s) => s.enPlace) ?? null;

  // « Aujourd'hui » se décide sur la clé stable du jour (`p.jour`, fuseau de
  // Douala) — jamais sur le libellé `p.date`, qui change avec la langue.
  // C'est exactement le calcul de `/encaissements` : le même total, au même
  // mot près, pour qu'aucun des deux écrans ne puisse démentir l'autre.
  const aujourdhui = jourDouala(new Date());
  const entrees = paiements.filter(
    (p) => p.sens === "in" && p.montant != null && p.jour === aujourdhui,
  );
  const totalJour = entrees.reduce((s, p) => s + (p.montant ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      {/* En-tête. Le titre, et le seul chemin des réglages sur téléphone. */}
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-small text-ink-soft">{t.bonjour}</p>
          <h1 className="mt-1 text-title">{t.titre}</h1>
        </div>
        <BoutonIcone
          href="/reglages"
          icone={<IconSettings size={20} />}
          aria-label={t.reglages}
          className="md:hidden"
        />
      </header>

      {/* LE TERMINAL NE SE RACONTE PLUS : IL SE SIGNALE. Rien tant qu'il
          répond ; une ligne dès qu'il se tait, parce qu'un terminal muet est
          un commerce qui n'encaisse plus sans le savoir. Les mots sont ceux
          du rail (`terminalMuet`) — le même état ne se dit pas de deux
          façons selon l'endroit où on le lit. */}
      {(!terminal || !terminal.enLigne) && (
        <Bandeau ton="alert" icone={<IconAlert size={20} />}>
          {terminal
            ? `${tc.terminalMuet} · ${terminal.nom} · ${terminal.majTexte}`
            : t.aucunTerminal}
        </Bandeau>
      )}

      {/* LE TOTAL DU JOUR — la question qu'on se pose en ouvrant. */}
      <section>
        <p className="text-small text-ink-soft">{ts.recuAujourdhui}</p>
        <p className="mt-1 text-display">{fcfa(totalJour, langue)}</p>
        <p className="mt-1 text-small text-ink-faint">{ts.nbPaiements(entrees.length)}</p>
      </section>

      {/* Le guichet : la puce (seul solde) et les cinq gestes */}
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
        // L'état vide du système — un seul, un seul retrait. C'est ICI qu'il
        // vit : l'écran des puces le répétait mot pour mot, et son exemplaire
        // est parti avec ses trois boutons morts.
        <section>
          <Vide titre={t.aucuneCarte} detail={t.aucuneCarteDetail} />
        </section>
      )}

      {/* Les derniers SMS — c'est par eux que tout arrive */}
      <section>
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
