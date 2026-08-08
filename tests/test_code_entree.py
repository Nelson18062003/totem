# -*- coding: utf-8 -*-
"""Le code à six chiffres se comporte-t-il comme on le promet ?

Six chiffres, c'est un million de possibilités : peu. Tout ce qui protège ce
mécanisme tient donc dans des détails qu'on ne voit pas en relisant — un
modulo qui biaise le tirage, une comparaison qui sort tôt, un compteur d'essais
qu'il suffit de contourner en redemandant un code.

Ce test compile le vrai `web/lib/code-entree.ts` avec le TypeScript du projet
et l'exécute sous Node avec Web Crypto. On n'écrit pas une seconde version des
fonctions pour les tester : on exerce celles qui partiront en production.

Les fonctions qui touchent la base ne sont pas exercées ici — elles le seront
par le parcours complet. Ce test porte sur ce qui se calcule : le tirage,
l'empreinte, la comparaison, et la courbe d'attente.
"""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "web" / "lib" / "code-entree.ts"
TSC = RACINE / "web" / "node_modules" / ".bin" / "tsc"

# On isole les fonctions pures : le fichier importe « ./base », qui parle à
# Supabase. Un module bouchon suffit — aucune des fonctions exercées ici ne
# l'appelle.
BOUCHON = """
export const relie = false;
export async function lire<T>(_c: string): Promise<T[]> { return []; }
export async function lireUne<T>(_c: string): Promise<T | null> { return null; }
export async function inserer<T>(_t: string, _v: unknown): Promise<T | null> { return null; }
export async function modifier(_c: string, _v: unknown): Promise<boolean> { return false; }
export async function lireObjet(): Promise<ArrayBuffer | null> { return null; }
"""

SCENARIO = r"""
import {
  adresseNormalisee, attenteApres, ecrireCode, empreinteCode, memeEmpreinte,
  tirerCode, VIE_MS,
} from "./code-entree.js";

const r: Record<string, unknown> = {};

// Le tirage : forme, et distribution.
const tirages = Array.from({ length: 60000 }, () => tirerCode());
r.forme = tirages.every((c) => /^\d{6}$/.test(c));
// Les six chiffres sont conservés, y compris les zéros de tête.
r.zerosDeTete = tirages.some((c) => c.startsWith("0"));
// Chaque tranche de 100 000 doit recevoir à peu près un dixième des tirages.
// Un modulo naïf sur 2^32 gonflerait les premières ; on vérifie l'écart.
const tranches = new Array(10).fill(0);
for (const c of tirages) tranches[Math.floor(Number(c) / 100000)]++;
r.tranches = tranches;

// L'empreinte : stable, et salée par l'adresse.
const e1 = await empreinteCode("408913", "jeanne@boutique.cm");
const e2 = await empreinteCode("408913", "jeanne@boutique.cm");
const e3 = await empreinteCode("408913", "paul@boutique.cm");
r.empreinteStable = e1 === e2;
r.empreinteSalee = e1 !== e3;
r.empreinteForme = /^[0-9a-f]{64}$/.test(e1);
// La casse du domaine et les espaces du clavier ne changent pas la boîte :
// « Jeanne@Boutique.CM » et « jeanne@boutique.cm » sont la même adresse.
r.adresseNormalisee =
  e1 === await empreinteCode("408913", "  jeanne@Boutique.CM ");
// Mais la partie AVANT l'arobase n'est pas touchée : chez certains
// hébergeurs elle distingue vraiment les majuscules, et « corriger »
// enverrait le code dans une boîte qui n'existe pas.
r.avantArobaseIntacte =
  e1 !== await empreinteCode("408913", "Jeanne@boutique.cm");
r.normalisationSansArobase = adresseNormalisee("  BIZARRE ") === "bizarre";
// Et le code ne se retrouve pas dans l'empreinte.
r.codeAbsent = !e1.includes("408913");

// La comparaison ne sort pas tôt sur la longueur.
r.comparaison = memeEmpreinte(e1, e2)
  && !memeEmpreinte(e1, e3)
  && !memeEmpreinte(e1, e1.slice(0, -1))
  && !memeEmpreinte("", "a")
  && memeEmpreinte("", "");

// La courbe d'attente : douce d'abord, ferme ensuite, JAMAIS infinie.
r.attentes = [0, 1, 2, 3, 4, 5, 7, 8, 20, 500].map(attenteApres);

// La durée de vie annoncée.
r.dixMinutes = VIE_MS === 10 * 60 * 1000;

// L'écriture lisible.
r.ecriture = ecrireCode("408913") === "408 913";

console.log(JSON.stringify(r));
"""


def _compilable():
    return TSC.exists() and shutil.which("node") is not None


@unittest.skipUnless(_compilable(),
                     "TypeScript du projet absent : ce test compile et exécute "
                     "le vrai fichier, il ne peut pas s'en passer")
class CodeEntree(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._dossier = tempfile.mkdtemp(prefix="totem-code-")
        d = Path(cls._dossier)
        # Node en modules ES exige l'extension sur un import relatif ; le
        # compilateur ne la réécrit pas. On l'ajoute sur la COPIE — le fichier
        # du dépôt reste tel qu'il part en production, où Next s'en charge.
        source = SOURCE.read_text(encoding="utf-8").replace(
            'from "./base"', 'from "./base.js"')
        (d / "code-entree.ts").write_text(source, encoding="utf-8")
        (d / "base.ts").write_text(BOUCHON, encoding="utf-8")
        (d / "scenario.ts").write_text(SCENARIO, encoding="utf-8")
        (d / "package.json").write_text('{"type":"module"}', encoding="utf-8")
        compile = subprocess.run(
            [str(TSC), "--target", "es2022", "--module", "es2022",
             "--moduleResolution", "bundler", "--lib", "es2022,dom", "--strict",
             "--outDir", str(d), str(d / "code-entree.ts"), str(d / "base.ts"),
             str(d / "scenario.ts")],
            capture_output=True, text=True, cwd=cls._dossier)
        if compile.returncode != 0:
            raise AssertionError("web/lib/code-entree.ts ne compile pas :\n"
                                 + compile.stdout + compile.stderr)
        lance = subprocess.run(["node", str(d / "scenario.js")],
                               capture_output=True, text=True, timeout=120)
        if lance.returncode != 0:
            raise AssertionError("le scénario a échoué :\n" + lance.stderr)
        cls.r = json.loads(lance.stdout.strip().splitlines()[-1])

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._dossier, ignore_errors=True)

    def test_le_code_a_six_chiffres_zeros_de_tete_compris(self):
        """« 042 917 » est un code valable, et il doit rester à six chiffres."""
        self.assertTrue(self.r["forme"])
        self.assertTrue(self.r["zerosDeTete"],
                        "aucun tirage ne commence par zéro sur 60 000 : "
                        "les zéros de tête sont perdus quelque part")

    def test_le_tirage_ne_favorise_pas_les_petits_nombres(self):
        """Un « % 1000000 » naïf sur 2^32 gonfle les premières tranches.

        2^32 n'est pas un multiple d'un million : sans rejet, les 967 296
        premières valeurs sortent une fois de plus que les autres. C'est
        invisible à l'œil et exploitable par qui devine « plutôt petit ».
        """
        tranches = self.r["tranches"]
        attendu = sum(tranches) / 10
        for i, n in enumerate(tranches):
            ecart = abs(n - attendu) / attendu
            self.assertLess(
                ecart, 0.06,
                f"la tranche {i} reçoit {n} tirages pour {attendu:.0f} attendus "
                f"({ecart:.1%} d'écart) — le tirage est biaisé")

    def test_l_empreinte_est_stable_salee_et_ne_rend_pas_le_code(self):
        self.assertTrue(self.r["empreinteStable"])
        self.assertTrue(self.r["empreinteSalee"],
                        "le même code pour deux adresses donne la même "
                        "empreinte : qui lit la base sait qu'elles sont égales")
        self.assertTrue(self.r["empreinteForme"])
        self.assertTrue(self.r["codeAbsent"])

    def test_la_casse_du_domaine_et_les_espaces_ne_changent_rien(self):
        """« Jeanne@Boutique.CM » et « jeanne@boutique.cm » sont la même boîte.

        Sans normalisation, une adresse saisie avec la majuscule automatique
        du clavier ne serait jamais reconnue le lendemain.
        """
        self.assertTrue(self.r["adresseNormalisee"])
        self.assertTrue(self.r["normalisationSansArobase"])

    def test_ce_qui_precede_l_arobase_n_est_pas_touche(self):
        """La norme laisse chaque hébergeur décider si « Jeanne » et
        « jeanne » sont la même boîte. Certains disent non. « Corriger »
        l'adresse enverrait alors le code là où personne ne le lira."""
        self.assertTrue(self.r["avantArobaseIntacte"])

    def test_la_comparaison_ne_sort_pas_tot(self):
        self.assertTrue(self.r["comparaison"])

    def test_on_ralentit_et_on_n_enferme_jamais(self):
        """La règle qui compte : verrouiller le propriétaire, c'est le couper
        de son propre argent."""
        a = self.r["attentes"]
        self.assertEqual(a[0], 0, "le premier essai ne doit rien coûter")
        self.assertEqual(a[1], 0)
        self.assertEqual(a[2], 0, "se tromper deux fois n'est pas une attaque")
        self.assertGreater(a[3], 0, "le troisième essai doit ralentir la porte")
        # La courbe monte…
        for i in range(len(a) - 1):
            self.assertLessEqual(a[i], a[i + 1], "l'attente redescend")
        # …et elle plafonne. Un quart d'heure, jamais l'infini.
        self.assertLessEqual(
            max(a), 15 * 60 * 1000,
            "l'attente dépasse le quart d'heure — c'est un verrou déguisé")
        self.assertEqual(a[-1], a[-2],
                         "l'attente continue de croître : elle doit plafonner")

    def test_le_code_vit_dix_minutes(self):
        """Assez pour changer d'application et revenir ; trop court pour qu'un
        code resté dans une boîte ouverte serve encore le lendemain."""
        self.assertTrue(self.r["dixMinutes"])

    def test_le_code_s_ecrit_en_deux_groupes(self):
        """Six chiffres d'affilée se perdent entre la boîte mail et le champ."""
        self.assertTrue(self.r["ecriture"])


if __name__ == "__main__":
    unittest.main()
