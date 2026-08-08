# -*- coding: utf-8 -*-
"""Les couleurs de la charte tiennent-elles vraiment ce qu'elles annoncent ?

Une couleur ne se choisit pas à l'œil. `--color-ink-faint` a longtemps porté
le commentaire « 4,6:1, passe AA » : c'était vrai sur le fond de page, et faux
partout ailleurs — posée sur `--color-surface-3`, l'encre tombait à 3,91:1,
sous le seuil de WCAG 2.2 §1.4.3. Personne ne l'avait vu, parce que personne
ne l'avait calculé.

Ce test lit `web/app/globals.css`, en extrait les jetons, et recalcule chaque
rapport sur le PIRE fond où l'encre se pose réellement. Il distingue aussi les
deux traits, parce que la différence n'est pas décorative : celui qui SÉPARE
deux lignes peut être discret, celui qui DÉLIMITE un champ vide ne peut pas —
s'il s'efface, le champ n'existe plus (WCAG 2.2 §1.4.11, 3:1).
"""

import re
import unittest
from pathlib import Path

CHARTE = Path(__file__).resolve().parent.parent / "web" / "app" / "globals.css"

# Les fonds sur lesquels une encre se pose vraiment dans l'application.
FONDS = ["--color-surface", "--color-surface-raised", "--color-surface-2",
         "--color-sable", "--color-surface-3"]

# Les encres de texte, et le seuil qu'elles doivent tenir sur le pire fond.
# 4,5:1 : texte courant (WCAG 2.2 §1.4.3). Aucune exception « grand texte » ici,
# parce qu'un jeton ne sait pas à quelle taille il servira.
ENCRES = ["--color-ink", "--color-ink-soft", "--color-ink-faint",
          "--color-laterite", "--color-accent", "--color-positive",
          "--color-negative", "--color-alert"]

# Les fonds où un CONTRÔLE se pose. Pas surface-3 : c'est une barre pleine,
# pas une surface de formulaire.
FONDS_CONTROLE = ["--color-surface-raised", "--color-surface",
                  "--color-surface-2", "--color-sable"]


def jetons():
    """Les couleurs déclarées dans la charte, en #rrggbb."""
    css = CHARTE.read_text(encoding="utf-8")
    trouves = {}
    for nom, valeur in re.findall(r"(--color-[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;", css):
        trouves[nom] = valeur.lower()
    return trouves


def _canal(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def luminance(couleur):
    c = couleur.lstrip("#")
    r, v, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _canal(r) + 0.7152 * _canal(v) + 0.0722 * _canal(b)


def rapport(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


class CharteContraste(unittest.TestCase):
    def setUp(self):
        self.j = jetons()

    def test_tous_les_jetons_attendus_existent(self):
        """Un jeton renommé ou supprimé doit casser ce test, pas passer inaperçu."""
        for nom in FONDS + ENCRES + ["--color-line", "--color-line-control"]:
            self.assertIn(nom, self.j, f"jeton absent de la charte : {nom}")

    def test_chaque_encre_tient_sur_le_pire_fond(self):
        for encre in ENCRES:
            pire_fond, pire = None, 99.0
            for fond in FONDS:
                r = rapport(self.j[encre], self.j[fond])
                if r < pire:
                    pire, pire_fond = r, fond
            self.assertGreaterEqual(
                pire, 4.5,
                f"{encre} ({self.j[encre]}) ne tient que {pire:.2f}:1 sur "
                f"{pire_fond} ({self.j[pire_fond]}) — il en faut 4,5")

    def test_le_bord_d_un_controle_se_voit(self):
        """Un champ vide doit exister à l'œil avant qu'on clique dedans."""
        trait = self.j["--color-line-control"]
        for fond in FONDS_CONTROLE:
            r = rapport(trait, self.j[fond])
            self.assertGreaterEqual(
                r, 3.0,
                f"--color-line-control ({trait}) ne tient que {r:.2f}:1 sur "
                f"{fond} — WCAG 2.2 §1.4.11 en exige 3")

    def test_le_trait_qui_separe_reste_discret(self):
        """L'inverse est vrai aussi : un filet de liste à 3:1 ferait une grille.

        Ce test protège la calmerie de l'écran. Si un jour quelqu'un « corrige »
        --color-line pour lui faire passer le seuil des contrôles, il aura en
        réalité rendu chaque liste bruyante — et ce n'est pas ce que la norme
        demande : un séparateur n'est pas un composant.
        """
        r = rapport(self.j["--color-line"], self.j["--color-surface-raised"])
        self.assertLess(r, 2.0,
                        "--color-line est devenu un trait de contrôle ; "
                        "utiliser --color-line-control là où il faut du 3:1")

    def test_aucun_controle_ne_se_borde_avec_le_trait_de_separation(self):
        """La règle, appliquée au code : un <button>, un <input>, un <select>
        ou un <textarea> ne porte jamais « border-line » tout court."""
        racine = CHARTE.parent
        fautes = []
        ouvrante = re.compile(r"<([a-zA-Z][\w.]*)")
        for fichier in sorted(racine.rglob("*.tsx")):
            lignes = fichier.read_text(encoding="utf-8").split("\n")
            for i, ligne in enumerate(lignes):
                if not re.search(r"border-line(?![\w-])", ligne):
                    continue
                balise = None
                for j in range(i, max(-1, i - 12), -1):
                    trouve = ouvrante.findall(lignes[j])
                    if trouve:
                        balise = trouve[-1]
                        break
                if balise and balise.lower() in ("button", "input", "select", "textarea"):
                    fautes.append(f"{fichier.name}:{i + 1} <{balise}>")
        self.assertEqual(
            fautes, [],
            "ces contrôles se bordent avec le trait de séparation "
            "(1,26:1) au lieu de --color-line-control :\n  " + "\n  ".join(fautes))


if __name__ == "__main__":
    unittest.main()
