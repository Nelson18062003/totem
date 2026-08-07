// PAGE DE MESURE — TEMPORAIRE, supprimée après relevé.
"use client";

import { useState } from "react";
import {
  BarreFiltres,
  DeclencheurFiltre,
  FeuilleFiltres,
  type OptionFiltre,
} from "@/app/ui/filtre";

const OPERATEURS: OptionFiltre[] = [
  { valeur: "mtn", libelle: "MTN MoMo" },
  { valeur: "orange", libelle: "Orange Money" },
  { valeur: "express", libelle: "Express Union" },
];
const CATEGORIES: OptionFiltre[] = [
  { valeur: "encaissement", libelle: "Encaissement" },
  { valeur: "envoi", libelle: "Envoi" },
  { valeur: "depot", libelle: "Dépôt" },
  { valeur: "retrait", libelle: "Retrait" },
];

export default function Mesure() {
  const [feuille, setFeuille] = useState<null | "op" | "cat">(null);
  const [op, setOp] = useState<string[]>([]);
  const [cat, setCat] = useState<string[]>([]);

  return (
    <main className="py-8">
      <div id="cas-repos" className="mb-8">
        <BarreFiltres libelle="Filtres">
          <DeclencheurFiltre libelle="Opérateur" surOuvrir={() => {}} />
          <DeclencheurFiltre libelle="Catégorie" surOuvrir={() => {}} />
        </BarreFiltres>
      </div>

      <div id="cas-pire" className="mb-8">
        <BarreFiltres
          libelle="Filtres"
          compte={2}
          libelleCompte={(n) => `${n} filtres`}
        >
          <DeclencheurFiltre
            libelle="Opérateur"
            valeur="Orange Money"
            surOuvrir={() => {}}
          />
          <DeclencheurFiltre
            libelle="Catégorie"
            valeur="Encaissement"
            surOuvrir={() => {}}
          />
        </BarreFiltres>
      </div>

      <div id="cas-trois" className="mb-8">
        <BarreFiltres
          libelle="Filtres"
          compte={3}
          libelleCompte={(n) => `${n} filtres`}
        >
          <DeclencheurFiltre libelle="Opérateur" valeur="MTN" surOuvrir={() => {}} />
          <DeclencheurFiltre libelle="Catégorie" valeur="2 choisis" surOuvrir={() => {}} />
          <DeclencheurFiltre libelle="Période" valeur="7 jours" surOuvrir={() => {}} />
        </BarreFiltres>
      </div>

      <div id="cas-vivant">
        <BarreFiltres
          libelle="Filtres"
          compte={(op.length > 0 ? 1 : 0) + (cat.length > 0 ? 1 : 0)}
          libelleCompte={(n) => `${n} filtres`}
        >
          <DeclencheurFiltre
            libelle="Opérateur"
            valeur={op.length === 1 ? "MTN MoMo" : undefined}
            ouverte={feuille === "op"}
            surOuvrir={() => setFeuille("op")}
          />
          <DeclencheurFiltre
            libelle="Catégorie"
            valeur={cat.length > 0 ? `${cat.length} choisis` : undefined}
            ouverte={feuille === "cat"}
            surOuvrir={() => setFeuille("cat")}
          />
        </BarreFiltres>
      </div>

      {feuille === "op" && (
        <FeuilleFiltres
          titre="Opérateur"
          options={OPERATEURS}
          valeurs={op}
          surChangement={setOp}
          etiquetteFermer="Fermer les filtres d'opérateur"
          libelleEffacer="Effacer"
          libelleValider="Voir les résultats"
          onFermer={() => setFeuille(null)}
        />
      )}
      {feuille === "cat" && (
        <FeuilleFiltres
          titre="Catégorie"
          options={CATEGORIES}
          valeurs={cat}
          surChangement={setCat}
          multiple
          etiquetteFermer="Fermer les filtres de catégorie"
          libelleEffacer="Effacer"
          libelleValider="Voir les résultats"
          onFermer={() => setFeuille(null)}
        />
      )}
    </main>
  );
}
