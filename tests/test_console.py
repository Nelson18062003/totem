# -*- coding: utf-8 -*-
"""La console de la plateforme tient-elle ses cinq promesses ?

La console est l'espace de Nelson : depuis la France, il voit TOUS les
commerces à la fois. C'est exactement ce qui la rend dangereuse, et chacune des
cinq règles vérifiées ici protège d'une faute qui ne se verrait pas à la
relecture.

1. LA GARDE AVANT LA LECTURE. Une page qui lit puis vérifie a déjà tout servi.
2. AUCUN MOUVEMENT D'ARGENT. La séparation est structurelle : le rôle « admin »
   n'a pas « sortir_argent », et rien de la console ne doit ouvrir un chemin
   détourné. Un fichier de lecture pure est vérifiable ; une intention ne l'est
   pas.
3. UN TERMINAL MUET REMONTE EN TÊTE. Un écran de supervision ment par omission :
   trié par nom, un boîtier silencieux depuis six heures est caché entre deux
   machines saines. Ce test-là ne relit pas le code, il EXÉCUTE le tri.
4. UNE BASE VIDE LE DIT. « Aucun paiement » et « je ne sais pas » ne doivent
   jamais avoir la même apparence (CAS-LIMITES C2) ; un zéro les confond.
5. CHAQUE ÉCRAN NOMME LE COMMERCE. Quatre boutiques dans le même tableau, et
   plus rien ne distingue la caisse de l'une de celle de l'autre.

Le test n° 3 a besoin de Node pour exécuter du TypeScript sans compilation
(`--experimental-strip-types`, Node ≥ 22.6). Là où il n'y en a pas, il se saute
en le disant — mieux vaut un test explicitement sauté qu'un test qui ne teste
rien.
"""

import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
WEB = RACINE / "web"
CONSOLE = WEB / "app" / "console"
API_CONSOLE = WEB / "app" / "api" / "console"
LECTURES = WEB / "lib" / "console.ts"
TEXTES = WEB / "lib" / "textes" / "console.ts"

GARDE_PAGE = re.compile(r'exigerPouvoir\(\s*"administrer"\s*\)')
GARDE_ROUTE = re.compile(r'garder\(\s*"administrer"\s*\)')

# Tout ce qui, dans une page ou une route de la console, ouvrirait un chemin
# vers un mouvement d'argent — ou vers une écriture tout court. La console
# regarde ; elle ne touche à rien.
ECRITURES = [
    ("creerCommande", "déposer une commande, c'est faire agir un terminal"),
    ("inserer(", "aucune écriture depuis la console"),
    ("modifier(", "aucune écriture depuis la console"),
    ("effacer(", "rien ne s'efface, et surtout pas depuis ici"),
    ("definirNature", "classer un SMS appartient au comptoir"),
    ("marquerLu", "lire un SMS appartient au commerce"),
    ('"use server"', "une action serveur est une écriture qui ne dit pas son nom"),
    ("method:", "aucune requête d'écriture ne part de la console"),
    ("<form", "un formulaire est un geste, et la console n'en a aucun"),
]


def pages_de_la_console():
    return sorted(CONSOLE.rglob("page.tsx")) if CONSOLE.exists() else []


def routes_de_la_console():
    return sorted(API_CONSOLE.rglob("route.ts")) if API_CONSOLE.exists() else []


def fichiers_de_la_console():
    tout = []
    for dossier in (CONSOLE, API_CONSOLE):
        if dossier.exists():
            tout += sorted(dossier.rglob("*.ts")) + sorted(dossier.rglob("*.tsx"))
    return tout


def _relatif(f):
    return str(f.relative_to(WEB))


# --- Exécuter le vrai tri, et pas sa description -----------------------------
# Node sait dérouler du TypeScript sans compilation depuis la 22.6. Il ne sait
# pas, en revanche, résoudre « ./base » vers « ./base.ts » : ce crochet le fait,
# et rien d'autre.
CROCHET = """
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && context.parentURL) {
    const cible = fileURLToPath(new URL(specifier, context.parentURL));
    if (!existsSync(cible) && existsSync(cible + ".ts")) {
      return next(specifier + ".ts", context);
    }
  }
  return next(specifier, context);
}
"""

LANCEUR = """
import { register } from "node:module";
register("./crochet.mjs", import.meta.url);
"""


def _node_sait_lire_du_typescript():
    if not shutil.which("node"):
        return False
    try:
        r = subprocess.run(
            ["node", "--experimental-strip-types", "-e", "const x: number = 1;"],
            capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return r.returncode == 0


NODE_OK = _node_sait_lire_du_typescript()


def executer(script):
    """Déroule un bout de JavaScript qui importe lib/console.ts, et rend sa sortie."""
    with tempfile.TemporaryDirectory() as dossier:
        d = Path(dossier)
        (d / "crochet.mjs").write_text(CROCHET, encoding="utf-8")
        (d / "lanceur.mjs").write_text(LANCEUR, encoding="utf-8")
        (d / "essai.mjs").write_text(script, encoding="utf-8")
        r = subprocess.run(
            ["node", "--experimental-strip-types", "--no-warnings",
             "--import", "./lanceur.mjs", "./essai.mjs"],
            cwd=d, capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            raise AssertionError(
                f"le script n'a pas tourné :\n{r.stdout}\n{r.stderr}")
        return r.stdout.strip()


class GardeDeLaConsole(unittest.TestCase):
    def test_il_y_a_bien_quatre_ecrans(self):
        """Un écran supprimé par mégarde ne doit pas rendre ce fichier muet."""
        attendues = {
            "app/console/page.tsx",
            "app/console/terminal/[id]/page.tsx",
            "app/console/cartes/page.tsx",
            "app/console/clients/page.tsx",
        }
        trouvees = {_relatif(f) for f in pages_de_la_console()}
        self.assertTrue(
            attendues <= trouvees,
            "il manque des écrans de la console : "
            + ", ".join(sorted(attendues - trouvees)))

    def test_chaque_page_exige_le_pouvoir_administrer(self):
        manquantes = [
            _relatif(f) for f in pages_de_la_console()
            if not GARDE_PAGE.search(f.read_text(encoding="utf-8"))
        ]
        self.assertEqual(
            manquantes, [],
            "ces pages de la console n'exigent pas « administrer » — elles "
            "servent donc la flotte entière à un lecteur :\n  "
            + "\n  ".join(manquantes))

    def test_chaque_route_exige_le_pouvoir_administrer(self):
        manquantes = [
            _relatif(f) for f in routes_de_la_console()
            if not GARDE_ROUTE.search(f.read_text(encoding="utf-8"))
        ]
        self.assertEqual(
            manquantes, [],
            "ces routes de la console n'exigent pas « administrer » :\n  "
            + "\n  ".join(manquantes))

    def test_la_garde_vient_avant_toute_lecture(self):
        """Une garde posée après la lecture a déjà laissé fuir la donnée."""
        tardives = []
        for f in pages_de_la_console() + routes_de_la_console():
            texte = f.read_text(encoding="utf-8")
            m = GARDE_PAGE.search(texte) or GARDE_ROUTE.search(texte)
            if not m:
                continue  # l'absence est le sujet des deux tests précédents
            avant = texte[:m.start()]
            # On ne compte pas les imports : ils ne lisent rien.
            corps = re.sub(r"^import[^\n]*$", "", avant, flags=re.M)
            if re.search(r"\bawait\s+(charger|lire|creer)", corps):
                tardives.append(_relatif(f))
        self.assertEqual(
            tardives, [],
            "la garde arrive après une lecture dans :\n  " + "\n  ".join(tardives))


class AucunMouvementDArgent(unittest.TestCase):
    """La séparation est structurelle, pas contractuelle.

    Nelson a le pouvoir technique ; Mme Ngo a l'argent. La console peut tout
    voir — c'est son rôle — et ne doit ouvrir AUCUN chemin vers une sortie, pas
    même indirect. Un fichier qui n'écrit nulle part se vérifie ; une bonne
    intention ne se vérifie pas.
    """

    def test_aucun_ecran_de_la_console_n_ecrit_quoi_que_ce_soit(self):
        fautes = []
        for f in fichiers_de_la_console():
            texte = f.read_text(encoding="utf-8")
            for motif, raison in ECRITURES:
                # Un motif cité dans un commentaire ne fait rien : on ne
                # regarde que les lignes de code.
                for i, ligne in enumerate(texte.split("\n"), 1):
                    nue = re.sub(r"^\s*(//|\*|/\*).*", "", ligne)
                    if motif in nue:
                        fautes.append(f"{_relatif(f)}:{i} « {motif} » — {raison}")
        self.assertEqual(
            fautes, [],
            "la console de l'administrateur écrit quelque part :\n  "
            + "\n  ".join(fautes))

    def test_les_lectures_de_la_console_ne_savent_pas_ecrire(self):
        """« lib/console.ts » n'importe que « lire ». C'est la promesse de son
        en-tête, et elle doit rester vraie."""
        texte = LECTURES.read_text(encoding="utf-8")
        imports = re.findall(r'^import\s*\{([^}]*)\}\s*from\s*"\./base";', texte, re.M)
        self.assertTrue(imports, "lib/console.ts n'importe plus rien de lib/base")
        noms = {n.strip() for n in imports[0].split(",")}
        interdits = noms & {"inserer", "modifier", "effacer", "lireObjet"}
        self.assertEqual(
            interdits, set(),
            f"lib/console.ts s'est mis à écrire : {sorted(interdits)}")

    def test_le_geste_interdit_est_montre_desarme_et_pas_cache(self):
        """Un bouton absent se contourne ; un bouton qui explique enseigne.

        C'est la règle B7 des cas limites : quelqu'un qui ne trouve pas le
        geste emprunte le compte du propriétaire. La fiche d'un terminal doit
        donc nommer les trois gestes qu'un administrateur n'a pas.
        """
        fiche = (CONSOLE / "terminal" / "[id]" / "page.tsx").read_text(encoding="utf-8")
        self.assertGreaterEqual(
            fiche.count("<GesteInterdit"), 3,
            "la fiche d'un terminal ne montre plus ce qu'un administrateur ne "
            "peut pas faire — celui qui le cherchera le cherchera ailleurs")
        textes = TEXTES.read_text(encoding="utf-8")
        for cle in ("gesteSortie", "gesteSolde", "gesteRecu"):
            self.assertIn(cle, textes, f"le geste « {cle} » n'est plus nommé")


class CeQuiVaMalRemonte(unittest.TestCase):
    """Un écran de supervision ment par omission."""

    def test_la_flotte_ne_retrie_pas_ce_que_les_lectures_ont_trie(self):
        """L'ordre est une règle, pas une préférence d'affichage : il vit dans
        « lib/console.ts » et l'écran ne le refait pas."""
        self.assertIn(
            ".sort(parUrgence)", LECTURES.read_text(encoding="utf-8"),
            "la flotte n'est plus triée par urgence dans lib/console.ts")
        page = (CONSOLE / "page.tsx").read_text(encoding="utf-8")
        self.assertNotIn(
            ".sort(", page,
            "l'écran de la flotte retrie la liste — s'il la trie par nom, un "
            "boîtier muet retombe au milieu et disparaît")

    @unittest.skipUnless(
        NODE_OK,
        "pas de Node qui sache lire du TypeScript (≥ 22.6) : ce test exécute le "
        "vrai tri, il ne peut pas se contenter d'une lecture")
    def test_un_terminal_muet_remonte_en_tete_de_la_flotte(self):
        script = f"""
import {{ parUrgence, vivacite }} from "{LECTURES.as_posix()}";

const maintenant = Date.now();
const ilYA = (minutes) => new Date(maintenant - minutes * 60000).toISOString();

// Quatre boîtiers, dans l'ordre exact qui piège : le muet porte la lettre Z,
// et l'actif la lettre A. Un tri par nom les mettrait à l'envers.
const flotte = [
  {{ id: "a-actif",   vuLe: ilYA(0.2), alertes: [] }},
  {{ id: "z-muet",    vuLe: ilYA(360), alertes: [] }},
  {{ id: "b-retard",  vuLe: ilYA(10),  alertes: [] }},
  {{ id: "c-grave",   vuLe: ilYA(0.2),
    alertes: [{{ gravite: "grave" }}] }},
  {{ id: "d-retire",  vuLe: ilYA(4000), retireLe: ilYA(4000), alertes: [] }},
  {{ id: "e-jamais",  vuLe: null,      alertes: [] }},
].map((x) => ({{ ...x, vivacite: vivacite(x.vuLe, x.retireLe) }}));

const trie = [...flotte].sort(parUrgence).map((x) => x.id);
console.log(JSON.stringify({{ trie, etats: flotte.map((x) => [x.id, x.vivacite]) }}));
"""
        sortie = json.loads(executer(script))
        etats = dict(sortie["etats"])
        self.assertEqual(etats["z-muet"], "muet")
        self.assertEqual(etats["a-actif"], "actif")
        self.assertEqual(etats["b-retard"], "en_retard")
        self.assertEqual(etats["e-jamais"], "jamais")
        self.assertEqual(etats["d-retire"], "retire")

        self.assertEqual(
            sortie["trie"],
            ["e-jamais", "z-muet", "c-grave", "b-retard", "a-actif", "d-retire"],
            "la flotte ne remonte plus ce qui va mal : un boîtier muet depuis "
            "six heures doit passer devant une machine qui parle")

    @unittest.skipUnless(NODE_OK, "pas de Node qui sache lire du TypeScript")
    def test_entre_deux_muets_le_plus_ancien_passe_devant(self):
        """Six heures de silence et trente minutes ne disent pas la même chose."""
        script = f"""
import {{ parUrgence, vivacite }} from "{LECTURES.as_posix()}";
const maintenant = Date.now();
const ilYA = (m) => new Date(maintenant - m * 60000).toISOString();
const flotte = [
  {{ id: "recent", vuLe: ilYA(40),  alertes: [] }},
  {{ id: "ancien", vuLe: ilYA(600), alertes: [] }},
].map((x) => ({{ ...x, vivacite: vivacite(x.vuLe, null) }}));
console.log(JSON.stringify([...flotte].sort(parUrgence).map((x) => x.id)));
"""
        self.assertEqual(
            json.loads(executer(script)), ["ancien", "recent"],
            "entre deux boîtiers muets, celui qui se tait depuis le plus "
            "longtemps doit passer devant")


class UneBaseVideLeDit(unittest.TestCase):
    """Un zéro se lit comme une mesure. Une absence doit s'écrire."""

    # « rien du tout » doit mener DIRECTEMENT à une phrase, pas à un tableau
    # sans lignes ni à une rangée de zéros. On cherche donc la liaison
    # elle-même : une liste vide qui rend « RienADire ».
    VIDE_DIT = re.compile(r"length === 0 \?[^?]{0,240}?<RienADire", re.S)

    def test_chaque_ecran_a_sa_branche_de_vide(self):
        fautes = []
        for f in pages_de_la_console():
            if not self.VIDE_DIT.search(f.read_text(encoding="utf-8")):
                fautes.append(_relatif(f))
        self.assertEqual(
            fautes, [],
            "ces écrans montreraient un tableau sans lignes, ou des zéros, là "
            "où la base n'a rien dit :\n  " + "\n  ".join(fautes))

    def test_chaque_ecran_distingue_la_base_absente_de_la_base_vide(self):
        """Deux choses différentes : « pas de base » et « base sans rien ».

        Confondre les deux fait chercher une panne de réseau là où il n'y a
        qu'un parc qui n'a pas encore démarré, et l'inverse.
        """
        fautes = []
        for f in pages_de_la_console():
            texte = f.read_text(encoding="utf-8")
            if "terminal/[id]" in _relatif(f):
                continue  # une fiche unique n'a pas de « vide » de parc
            if "pasDeBaseTitre" not in texte or "relie" not in texte:
                fautes.append(_relatif(f))
        self.assertEqual(
            fautes, [],
            "ces écrans ne disent pas quand la base n'est pas branchée :\n  "
            + "\n  ".join(fautes))

    def test_les_phrases_de_vide_existent_dans_les_deux_langues(self):
        texte = TEXTES.read_text(encoding="utf-8")
        for cle in ("videTitre", "videDetail", "pasDeBaseTitre", "pasDeBaseDetail"):
            self.assertGreaterEqual(
                texte.count(f"{cle}:"), 2,
                f"« {cle} » n'existe pas dans les deux langues")


class ChaqueEcranNommeLeCommerce(unittest.TestCase):
    """Un admin voit tout — c'est son rôle. Il ne doit jamais avoir à deviner
    de quelle boutique il parle."""

    def test_chaque_ecran_nomme_a_qui_appartient_ce_qu_il_montre(self):
        # Un écran nomme le commerce soit par le composant dédié, soit par la
        # tournure « chez X » — jamais autrement, pour qu'un seul contrôle
        # suffise.
        marques = ("<NomDeCommerce", "t.chez(")
        fautes = []
        for f in pages_de_la_console():
            texte = f.read_text(encoding="utf-8")
            if not any(m in texte for m in marques):
                fautes.append(_relatif(f))
        self.assertEqual(
            fautes, [],
            "ces écrans montrent des données sans dire à quel commerce elles "
            "appartiennent :\n  " + "\n  ".join(fautes))

    def test_une_donnee_sans_commerce_le_dit_au_lieu_de_se_taire(self):
        """Une case vide se lit « pas important ». Il faut une phrase."""
        gabarit = (CONSOLE / "gabarit.tsx").read_text(encoding="utf-8")
        self.assertIn(
            "t.sansCommerce", gabarit,
            "le composant qui nomme le commerce ne dit plus rien quand la base "
            "n'en rattache aucun")
        textes = TEXTES.read_text(encoding="utf-8")
        self.assertGreaterEqual(
            textes.count("sansCommerce:"), 2,
            "« sansCommerce » n'existe pas dans les deux langues")


class LeGabaritEstPartage(unittest.TestCase):
    """Les quatre écrans suivants (versions, journal, alertes, mobile) doivent
    trouver un cadre tout fait, pas quatre cadres à recopier."""

    def test_les_quatre_ecrans_passent_par_le_meme_cadre(self):
        fautes = [
            _relatif(f) for f in pages_de_la_console()
            if "<CadreConsole" not in f.read_text(encoding="utf-8")
        ]
        self.assertEqual(
            fautes, [],
            "ces écrans se dessinent un cadre à eux — deux menus qui ne disent "
            "pas la même chose, c'est ainsi qu'un écran d'exploitation devient "
            "faux :\n  " + "\n  ".join(fautes))

    def test_le_cadre_connait_deja_les_ecrans_a_venir(self):
        gabarit = (CONSOLE / "gabarit.tsx").read_text(encoding="utf-8")
        for onglet in ("versions", "journal", "alertes"):
            self.assertIn(
                f'cle: "{onglet}"', gabarit,
                f"l'onglet « {onglet} » a disparu du gabarit : l'équipe qui "
                "construit cet écran devra toucher au cadre commun")


if __name__ == "__main__":
    unittest.main()
