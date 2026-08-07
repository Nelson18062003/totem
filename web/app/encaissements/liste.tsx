"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesSms } from "@/lib/textes/sms";
import { type Categorie, fcfa, jourDouala, type Paiement } from "@/lib/types";
// La fiche d'un SMS et ses pastilles vivent dans un module partagé : la même
// fiche s'ouvre ici et depuis les derniers SMS de l'accueil.
import { catDe, FicheSms } from "../fiche-sms";
import { IconAlert, IconClose, IconDoc, IconSearch } from "../icons";
import { Bouton } from "../ui/bouton";
import { Carte } from "../ui/carte";
import { Recherche } from "../ui/champ";
import { Bandeau, Pastille, Vide } from "../ui/etat";
import {
  BarreFiltres,
  DeclencheurFiltre,
  FeuilleFiltres,
  type OptionFiltre,
} from "../ui/filtre";
import { Liste, Rangee, type SensMontant } from "../ui/rangee";

// L'ordre des filtres de catégorie : les mouvements d'argent d'abord.
const ORDRE_CAT: Categorie[] = [
  "encaissement", "envoi", "transfert", "depot", "retrait",
  "solde", "code", "publicite", "message", "inconnu",
];

// Les valeurs-sentinelles des filtres. Ce sont des états internes, jamais
// affichés tels quels : au repos, le déclencheur n'écrit QUE le nom du filtre.
const TOUS = "Tous";
const TOUTES = "Toutes";

/** Quelle feuille de filtres est ouverte. L'état appartient à l'écran. */
type FeuilleOuverte = "operateur" | "categorie" | null;

/** Le sens tel que la rangée l'attend. `neutre` quand le robot n'a pas tranché. */
const sensDe = (p: Paiement): SensMontant =>
  p.sens === "in" ? "credit" : p.sens === "out" ? "debit" : "neutre";

/**
 * Tous les SMS reçus par les cartes, tels quels — c'est par eux que tout
 * arrive. Ceux que le robot a compris portent leur montant ; ceux qui ont un
 * reçu PDF archivé se téléchargent d'un geste, directement sur la ligne.
 *
 * ─── v2 · CE QUI A ÉTÉ ENLEVÉ, ET CE QUE ÇA A RENDU ─────────────────────────
 *
 * Mesuré sur un téléphone de 390 × 844, avec les mêmes données avant et après.
 * Le premier paiement — la seule chose qu'on vient chercher ici — était à
 * 511 px du haut de la page : 61 % de la hauteur d'écran passait en décor
 * avant la première ligne d'argent. Quatre objets payaient ce retard, et
 * aucun ne se défendait :
 *
 *   1. LES SEPT PUCES DE FILTRE (208 px). Elles réclamaient 637 px pour 358
 *      disponibles : deux rangées obligatoires, « Retrait » seul sur la
 *      sienne avec 261 px de vide. Aucune forme de puce ne tiendra jamais,
 *      parce que le nombre de choix grandit avec les données et que la largeur
 *      de l'écran, elle, ne grandit pas. À la place : `BarreFiltres`, DEUX
 *      déclencheurs nommés par ce qu'ils filtrent, une seule rangée de 44 px,
 *      et les choix dans une feuille qui monte du bas.
 *   2. LA RECHERCHE PERMANENTE (44 px + son écart). Elle était à 2 122 px du
 *      bas de la page — le pire point d'atteinte de l'application. Un champ
 *      permanent ne se justifie que si chercher est la tâche dominante ; ici
 *      la tâche dominante est de LIRE ce qui vient d'arriver. Elle passe donc
 *      derrière une icône de l'en-tête, et ne coûte ses 44 px qu'à qui la
 *      demande. La refermer efface la recherche : un filtre invisible qui
 *      raccourcit la liste est un piège.
 *   3. LE PARAGRAPHE D'INTRODUCTION (54 px). Trois lignes qui décrivaient ce
 *      que la liste montre juste en dessous. On lit au plus 28 % des mots
 *      d'une page : celui-là était payé en hauteur, jamais en compréhension.
 *   4. LE DISQUE DÉCORATIF DE LA RANGÉE (44 px de largeur, sur chaque ligne).
 *      32 px de dessin, 12 de gouttière, `aria-hidden` — exactement les 44 px
 *      qui manquaient au titre pour ne pas se tronquer en 390. La rangée v2
 *      l'ignore déjà dans une liste d'argent ; on cesse de le lui passer.
 *
 * Reste, au-dessus du premier paiement : le titre et le total, puis la barre
 * de filtres. Rien d'autre.
 *
 * ─── CE QUI N'A PAS BOUGÉ ───────────────────────────────────────────────────
 *
 * Même état, mêmes appels, mêmes routes : opérateur, catégorie, recherche et
 * fiche sont les quatre mêmes variables qu'avant, filtrées par le même
 * `useMemo`. Le SMS brut s'affiche toujours mot pour mot, tronqué à deux
 * lignes ici (`Rangee lignes={3}`) et entier dans la fiche.
 */
export function ListeEncaissements({
  paiements,
  operateurs,
  enAttente = 0,
}: {
  paiements: Paiement[];
  operateurs: string[];
  enAttente?: number;
}) {
  const langue = useLangue();
  const t = textesSms[langue];
  const [filtre, setFiltre] = useState(TOUS);
  const [categorie, setCategorie] = useState<Categorie | typeof TOUTES>(TOUTES);
  const [recherche, setRecherche] = useState("");
  const [detail, setDetail] = useState<Paiement | null>(null);
  // La recherche est repliée par défaut ; la feuille de filtres est fermée.
  const [chercher, setChercher] = useState(false);
  const [feuille, setFeuille] = useState<FeuilleOuverte>(null);

  // Le champ qui vient de paraître prend le focus : on a demandé à chercher,
  // on n'a pas à viser ensuite le champ au doigt.
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (chercher) champ.current?.focus();
  }, [chercher]);

  // Les catégories réellement présentes, dans l'ordre voulu — on ne propose
  // pas un filtre pour une catégorie qu'on n'a jamais reçue.
  const categories = useMemo(() => {
    const vues = new Set(paiements.map(catDe));
    return ORDRE_CAT.filter((c) => vues.has(c));
  }, [paiements]);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase().replace(/\s/g, "");
    return paiements.filter((p) => {
      if (filtre !== TOUS && p.sim !== filtre) return false;
      if (categorie !== TOUTES && catDe(p) !== categorie) return false;
      if (!q) return true;
      return p.nom.toLowerCase().includes(q) || p.numero.replace(/\s/g, "").includes(q)
        || String(p.montant ?? "").includes(q) || p.reference.toLowerCase().includes(q)
        || p.smsBrut.toLowerCase().includes(q);
    });
  }, [paiements, filtre, categorie, recherche]);

  // « Aujourd'hui » se décide sur la clé stable du jour (`p.jour`, fuseau de
  // Douala) — jamais sur le libellé `p.date`, qui change avec la langue.
  const aujourdhui = jourDouala(new Date());
  const entrees = liste.filter((p) => p.sens === "in" && p.montant != null && p.jour === aujourdhui);
  const totalIn = entrees.reduce((s, p) => s + (p.montant ?? 0), 0);

  // Regroupement par la clé stable du jour ; le libellé traduit (`p.date`)
  // ne sert qu'à écrire l'en-tête du groupe.
  const parJour = liste.reduce<Record<string, Paiement[]>>((acc, p) => {
    (acc[p.jour] ||= []).push(p); return acc;
  }, {});

  // Les choix de chaque feuille. AUCUNE option « Tous » : l'absence de choix
  // EST « tous », et c'est « Effacer » — éteint tant qu'il n'y a rien à
  // effacer — qui le dit. Une option « Tous » cochée par défaut ferait dire à
  // la feuille qu'un filtre agit alors qu'aucun n'agit.
  const choixOperateur: OptionFiltre[] = operateurs.map((o) => ({ valeur: o, libelle: o }));
  const choixCategorie: OptionFiltre[] = categories.map((c) => ({
    valeur: c,
    libelle: t.cat[c],
  }));

  const filtresActifs = (filtre !== TOUS ? 1 : 0) + (categorie !== TOUTES ? 1 : 0);
  const rienNEstFiltre = !recherche && filtre === TOUS && categorie === TOUTES;

  const toutAfficher = () => {
    setRecherche("");
    setChercher(false);
    setFiltre(TOUS);
    setCategorie(TOUTES);
  };

  // Replier la recherche EFFACE ce qu'on cherchait : sinon la liste resterait
  // filtrée par un mot que plus rien à l'écran ne montre.
  const replierRecherche = () => {
    setRecherche("");
    setChercher(false);
  };

  return (
    // `gap-4` (16) et non `gap-6` : c'est la gouttière de la densité CONFORT
    // (`--confort-gouttiere`), l'écart que le système pose entre deux blocs
    // voisins. Les 8 px repris deux fois en tête de page sont 16 px de moins
    // avant le premier paiement, et 8 px de moins entre chaque journée — sur
    // sept journées, 56 px de page en moins, sans qu'aucun objet ne se touche.
    <div className="flex flex-col gap-4">
      {/* L'EN-TÊTE PORTE LE TOTAL, ET LA RECHERCHE EN ICÔNE. Le titre et la
          loupe partagent la première ligne ; le total tient sur deux lignes au
          lieu de trois — le nombre de paiements se pose sur la ligne de base
          du montant, il n'en réclame pas une de plus. */}
      <header>
        <div className="flex items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate text-title">{t.titre}</h1>
          <Bouton
            variante="discret"
            taille="compacte"
            icone={chercher ? <IconClose size={20} /> : <IconSearch size={20} />}
            aria-label={chercher ? t.fermerRecherche : t.ouvrirRecherche}
            aria-expanded={chercher}
            title={chercher ? t.fermerRecherche : t.ouvrirRecherche}
            onClick={() => (chercher ? replierRecherche() : setChercher(true))}
          />
        </div>

        {chercher && (
          <div className="mt-3">
            <Recherche
              ref={champ}
              libelle={t.recherchePlaceholder}
              libelleMasque
              placeholder={t.recherchePlaceholder}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              onEffacer={() => setRecherche("")}
              libelleEffacement={t.effacerRecherche}
            />
          </div>
        )}

        <p className="mt-4 text-small text-ink-soft">{t.recuAujourdhui}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-3">
          <span className="text-display">{fcfa(totalIn, langue)}</span>
          <span className="text-small text-ink-faint">{t.nbPaiements(entrees.length)}</span>
        </p>
      </header>

      {/* LA BARRE DE FILTRES — une rangée de 44, deux déclencheurs, le compte
          en pastille. Ce qu'elle remplace tenait sur deux rangées et 208 px. */}
      <BarreFiltres
        libelle={t.filtres}
        compte={filtresActifs}
        libelleCompte={t.filtresActifs}
      >
        <DeclencheurFiltre
          libelle={t.operateur}
          valeur={filtre === TOUS ? undefined : filtre}
          ouverte={feuille === "operateur"}
          eteint={choixOperateur.length === 0}
          surOuvrir={() => setFeuille("operateur")}
        />
        <DeclencheurFiltre
          libelle={t.categorie}
          valeur={categorie === TOUTES ? undefined : t.cat[categorie]}
          ouverte={feuille === "categorie"}
          eteint={choixCategorie.length < 2}
          surOuvrir={() => setFeuille("categorie")}
        />
      </BarreFiltres>

      {enAttente > 0 && (
        <Bandeau ton="alert" icone={<IconAlert size={20} />}>
          {t.enCoursDeTransmission(enAttente)}
        </Bandeau>
      )}

      {/* La liste des SMS */}
      {Object.keys(parJour).length === 0 ? (
        rienNEstFiltre ? (
          <Vide titre={t.aucunSmsTitre} detail={t.aucunSmsDetail} />
        ) : (
          <Vide
            titre={t.aucunResultatTitre}
            detail={t.aucunResultatDetail}
            action={<Bouton onClick={toutAfficher}>{t.toutAfficher}</Bouton>}
          />
        )
      ) : (
        Object.entries(parJour).map(([jour, items]) => (
          <section key={jour}>
            <p className="mb-3 text-caption uppercase text-ink-faint">{items[0].date}</p>
            {/* Une liste dans une carte va bord à bord : c'est la rangée qui
                porte le padding, et elle va jusqu'au bord parce que c'est elle
                qu'on touche. */}
            <Carte bordABord>
              <Liste queue>
                {items.map((p) => (
                  <Rangee
                    key={p.id}
                    lignes={3}
                    // AUCUN DISQUE. Il faisait 32 px de dessin et 12 de
                    // gouttière, il était `aria-hidden`, et il prenait
                    // exactement les 44 px qui manquaient au titre pour ne pas
                    // se tronquer. La rangée v2 l'ignore d'office dans une
                    // liste d'argent ; on ne le lui passe plus du tout.
                    //
                    // Qui, quand — la source du SMS, brève. Le point plein
                    // devant = pas encore ouvert.
                    titre={
                      p.nonLu ? (
                        <>
                          <Pastille etiquette={t.nonLu} /> {p.sim} · {p.heure}
                        </>
                      ) : (
                        `${p.sim} · ${p.heure}`
                      )
                    }
                    // Le SMS, tel que la carte l'a reçu — tronqué à deux
                    // lignes ici, entier dans la fiche.
                    sousTitre={p.smsBrut}
                    // Montant complet, jamais abrégé ; sans signe quand le
                    // sens n'est pas établi. C'est la rangée qui pose le
                    // signe : il ne peut plus être oublié.
                    montant={
                      p.montant != null
                        ? { texte: fcfa(p.montant, langue), sens: sensDe(p) }
                        : undefined
                    }
                    onClick={() => setDetail(p)}
                    // Le reçu PDF, à portée de main quand il existe.
                    action={
                      p.recu
                        ? {
                            icone: <IconDoc size={20} />,
                            libelle: t.telechargerRecu,
                            href: `/api/recu/${p.recu}`,
                            externe: true,
                          }
                        : undefined
                    }
                  />
                ))}
              </Liste>
            </Carte>
          </section>
        ))
      )}

      {/* LES DEUX FEUILLES. Elles montent du bas — c'est là qu'est le pouce —
          et ne vivent dans le DOM que le temps où on les regarde. */}
      {feuille === "operateur" && (
        <FeuilleFiltres
          titre={t.operateur}
          options={choixOperateur}
          valeurs={filtre === TOUS ? [] : [filtre]}
          surChangement={(v) => setFiltre(v[0] ?? TOUS)}
          etiquetteFermer={t.fermerFiltreOperateur}
          libelleEffacer={t.effacerFiltres}
          libelleValider={t.validerFiltres}
          onFermer={() => setFeuille(null)}
        />
      )}
      {feuille === "categorie" && (
        <FeuilleFiltres
          titre={t.categorie}
          options={choixCategorie}
          valeurs={categorie === TOUTES ? [] : [categorie]}
          surChangement={(v) => setCategorie((v[0] as Categorie) ?? TOUTES)}
          etiquetteFermer={t.fermerFiltreCategorie}
          libelleEffacer={t.effacerFiltres}
          libelleValider={t.validerFiltres}
          onFermer={() => setFeuille(null)}
        />
      )}

      {detail && <FicheSms p={detail} onFermer={() => setDetail(null)} />}
    </div>
  );
}
