# -*- coding: utf-8 -*-
"""Les textes ne traversent pas la frontière serveur → navigateur.

CE QUE CE FICHIER GARDE, ET CE QUE ÇA A COÛTÉ DE L'APPRENDRE

L'écran du papier de dix codes recevait ses textes de la page serveur, par une
propriété. L'objet contenait des fonctions — « entete(nom) », « serie(n) »,
« deja(n) » — et React refuse de faire passer une fonction du serveur au
navigateur : elle ne se sérialise pas.

Résultat : l'écran ne s'affichait pas du tout. Pas dégradé, pas partiel — un
bouton « Reload » et rien d'autre. En production seulement.

Et RIEN ne le disait. Le fichier compilait. TypeScript était content : le type
des textes est parfaitement légal des deux côtés. Les 681 contrôles du dépôt
passaient tous. Il a fallu ouvrir la page dans un vrai navigateur.

Deux autres écrans étaient à un texte près du même sort : leurs textes
n'avaient pas encore de fonction, et il aurait suffi d'en ajouter une, un
jour, pour les casser de la même façon invisible.

LA RÈGLE, PLUS LARGE QUE LE DÉFAUT
On n'interdit pas « passer une fonction » — cette formulation demande de
savoir, à chaque modification d'un fichier de textes, quels écrans le
reçoivent. On interdit de passer les TEXTES tout court. Un composant de
navigateur lit les siens avec « useLangue() », comme partout ailleurs dans le
dépôt. La règle devient alors vérifiable d'un coup d'œil, et un texte qui
gagne une fonction ne casse plus rien.
"""

import re
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
APP = RACINE / "web" / "app"


def est_du_navigateur(source: str) -> bool:
    return '"use client"' in source[:300] or "'use client'" in source[:300]


def composants_du_navigateur() -> set:
    """Les noms exportés par les fichiers « use client »."""
    noms = set()
    for f in APP.rglob("*.tsx"):
        source = f.read_text(encoding="utf-8")
        if not est_du_navigateur(source):
            continue
        noms.update(re.findall(r"export (?:default )?function (\w+)", source))
    return noms


class LesTextesNeTraversentPas(unittest.TestCase):
    def test_aucune_page_serveur_ne_passe_ses_textes(self):
        """Un composant de navigateur lit ses textes, il ne les reçoit pas."""
        navigateur = composants_du_navigateur()
        fautes = []
        for f in APP.rglob("*.tsx"):
            source = f.read_text(encoding="utf-8")
            if est_du_navigateur(source):
                continue
            # ON REGARDE CE QUI EST PASSÉ, PAS COMMENT ÇA S'APPELLE.
            #
            # Les deux premiers jets de ce contrôle regardaient le NOM de la
            # propriété. Le premier attrapait « ton », une nuance de couleur.
            # Le second attrapait « <Bascule t={t.notifRapport} /> », qui ne
            # passe qu'une PHRASE — parfaitement sérialisable, parfaitement
            # innocente. Deux fausses alertes, et une fausse alerte finit
            # toujours par faire désactiver le contrôle.
            #
            # Ce qui est dangereux n'est pas le nom : c'est de passer l'OBJET
            # entier — « t », « textesMachin[langue] ». Une phrase tirée de
            # cet objet — « t.quelqueChose » — traverse sans problème.
            for m in re.finditer(r"<(\w+)[^>]*?\b(t|textes|t[A-Z]\w*)=\{([^}]*)\}",
                                 source):
                composant, propriete, valeur = m.groups()
                if composant not in navigateur:
                    continue
                entier = re.fullmatch(r"[A-Za-z_$][\w$]*(?:\[[^\]]*\])?", valeur.strip())
                if not entier:
                    continue
                fautes.append(
                    f"{f.relative_to(RACINE)} passe « {propriete}={{{valeur}}} » "
                    f"à <{composant}>, qui tourne dans le navigateur")
        self.assertEqual(
            fautes, [],
            "des textes traversent la frontière serveur → navigateur :\n  "
            + "\n  ".join(fautes)
            + "\n\nUn texte qui contient une fonction fait alors planter "
              "l'écran ENTIER, en production seulement, sans qu'aucun "
              "contrôle ne le dise. Faites lire ses textes au composant, "
              "avec « useLangue() ».")

    def test_les_composants_du_navigateur_lisent_bien_leurs_textes(self):
        """L'envers : celui qui affiche du texte doit savoir d'où il vient.

        Sans ce contrôle, on pourrait satisfaire le précédent en cessant
        d'afficher du texte — ce qui n'est pas le but.
        """
        sans_source = []
        for f in APP.rglob("*.tsx"):
            source = f.read_text(encoding="utf-8")
            if not est_du_navigateur(source):
                continue
            # Ceux qui se servent d'un objet « t » quelque part.
            if not re.search(r"\bt\.\w+", source):
                continue
            lit = ("useLangue()" in source
                   or re.search(r"\bt(?:Cles)?:\s*Textes", source)
                   or re.search(r"t\s*}:\s*\{", source))
            if not lit:
                sans_source.append(str(f.relative_to(RACINE)))
        self.assertEqual(
            sans_source, [],
            "ces composants du navigateur affichent des textes sans dire d'où "
            f"ils viennent : {sans_source}")


if __name__ == "__main__":
    unittest.main()
