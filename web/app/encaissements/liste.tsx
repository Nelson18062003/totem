"use client";

import { useMemo, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesSms } from "@/lib/textes/sms";
import { type Categorie, fcfa, jourDouala, type Paiement } from "@/lib/types";
// La fiche d'un SMS et ses pastilles vivent dans un module partagé : la même
// fiche s'ouvre ici et depuis les derniers SMS de l'accueil.
import { CAT, catDe, FicheSms } from "../fiche-sms";
import { IconAlert, IconDoc } from "../icons";
import { Bouton } from "../ui/bouton";
import { Carte } from "../ui/carte";
import { Recherche } from "../ui/champ";
import { Bandeau, Pastille, Vide } from "../ui/etat";
import { Liste, Rangee, type SensMontant } from "../ui/rangee";
import { PuceFiltre } from "../ui/selecteurs";

// L'ordre des filtres de catégorie : les mouvements d'argent d'abord.
const ORDRE_CAT: Categorie[] = [
  "encaissement", "envoi", "transfert", "depot", "retrait",
  "solde", "code", "publicite", "message", "inconnu",
];

// Les valeurs-sentinelles des filtres. Ce sont des états internes, jamais
// affichés tels quels : leur libellé vient du dictionnaire.
const TOUS = "Tous";
const TOUTES = "Toutes";

/** Le sens tel que la rangée l'attend. `neutre` quand le robot n'a pas tranché. */
const sensDe = (p: Paiement): SensMontant =>
  p.sens === "in" ? "credit" : p.sens === "out" ? "debit" : "neutre";

/**
 * Tous les SMS reçus par les cartes, tels quels — c'est par eux que tout
 * arrive. Ceux que le robot a compris portent leur montant ; ceux qui ont un
 * reçu PDF archivé se téléchargent d'un geste, directement sur la ligne.
 *
 * Trois choses que le système répare ici :
 *
 *   — LA RANGÉE A UN PLAFOND. Elle rendait le SMS ENTIER en
 *     `whitespace-pre-wrap` : 76 px au minimum, sans borne, et jusqu'à 142 px
 *     pour un message de quatre lignes — la colonne n'avait plus de rythme.
 *     `Rangee lignes={3}` tient 88 px et tronque ; le texte entier s'ouvre
 *     dans la fiche, c'est là qu'on vient le lire.
 *   — LES FILTRES SONT UN SEUL OBJET. Opérateur et catégorie étaient trois
 *     implémentations manuscrites du même contrôle, à trois hauteurs (28, 32,
 *     40) et deux rayons. C'est `PuceFiltre`, à 44 px, comme tout ce sur quoi
 *     on appuie.
 *   — LA RECHERCHE EST UN CHAMP DU SYSTÈME. Son bouton d'effacement faisait
 *     15 × 15 : la plus petite cible du dépôt. Il fait 44 × 44.
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

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-title">{t.titre}</h1>
        <p className="mt-1 max-w-lecture text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {enAttente > 0 && (
        <Bandeau ton="alert" icone={<IconAlert size={20} />}>
          {t.enCoursDeTransmission(enAttente)}
        </Bandeau>
      )}

      <section>
        <p className="text-small text-ink-soft">{t.recuAujourdhui}</p>
        <p className="mt-1 text-display tabnums">{fcfa(totalIn, langue)}</p>
        <p className="mt-1 text-small text-ink-faint">{t.nbPaiements(entrees.length)}</p>
      </section>

      {/* Recherche et filtres — un seul bloc, pour qu'aucune marge négative
          n'ait à rattraper l'écart de la colonne. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Recherche
            libelle={t.recherchePlaceholder}
            libelleMasque
            placeholder={t.recherchePlaceholder}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            onEffacer={() => setRecherche("")}
            libelleEffacement={t.effacerRecherche}
            className="sm:flex-1"
          />
          <div className="flex flex-wrap gap-2">
            {[TOUS, ...operateurs].map((f) => (
              <PuceFiltre
                key={f}
                libelle={f === TOUS ? t.tousLesOperateurs : f}
                selectionnee={filtre === f}
                surChangement={() => setFiltre(f)}
              />
            ))}
          </div>
        </div>

        {/* Filtre par catégorie — seulement celles réellement reçues */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <PuceFiltre
              libelle={t.toutesLesCategories}
              selectionnee={categorie === TOUTES}
              surChangement={() => setCategorie(TOUTES)}
            />
            {categories.map((c) => (
              <PuceFiltre
                key={c}
                libelle={`${CAT[c]} ${t.cat[c]}`}
                selectionnee={categorie === c}
                surChangement={() => setCategorie(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* La liste des SMS */}
      {Object.keys(parJour).length === 0 ? (
        recherche || filtre !== TOUS || categorie !== TOUTES ? (
          <Vide
            titre={t.aucunResultatTitre}
            detail={t.aucunResultatDetail}
            action={
              <Bouton
                onClick={() => { setRecherche(""); setFiltre(TOUS); setCategorie(TOUTES); }}
              >
                {t.toutAfficher}
              </Bouton>
            }
          />
        ) : (
          <Vide titre={t.aucunSmsTitre} detail={t.aucunSmsDetail} />
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
                    // Le disque décoratif fait 32 et ne se clique pas ; le
                    // bouton de reçu fait 44 et se clique. Ils faisaient tous
                    // deux 36 px, et rien ne disait lequel était lequel.
                    pastille={CAT[catDe(p)]}
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

      {detail && <FicheSms p={detail} onFermer={() => setDetail(null)} />}
    </div>
  );
}
