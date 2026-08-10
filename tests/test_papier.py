# -*- coding: utf-8 -*-
"""Le papier de dix codes tient-il ce qu'il promet ?

Ce papier est le dernier chemin : celui du jour où la boîte mail et le
téléphone sont hors de portée en même temps. Tout ce qui le protège tient dans
des détails invisibles à la relecture — un modulo qui penche, une empreinte qui
laisse deviner son code, un code qui ressert une seconde fois, une lettre qui
se lit pour une autre au fond d'un tiroir mal éclairé.

Ce test compile le vrai `web/lib/papier.ts` avec le TypeScript du projet et
l'exécute sous Node. On n'écrit pas une seconde version des fonctions pour les
tester : on exerce celles qui partiront en production.

La base, elle, est remplacée par un registre en mémoire qui parle le même
dialecte que PostgREST (`eq.`, `lt.`, `is.null`, `order`, `limit`). Ce n'est
pas un décor : c'est ce qui permet d'exercer la fabrication d'une série, la
consommation d'un code et le remplacement d'un papier par le suivant — les
trois choses qu'une relecture ne sait pas vérifier.
"""

import json
import shutil
import subprocess
import re
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "web" / "lib" / "papier.ts"
# `papier.ts` emprunte sa comparaison à temps constant à `code-entree.ts` : on
# compile donc les deux, et casser la comparaison là-bas casse ce test ici.
VOISIN = RACINE / "web" / "lib" / "code-entree.ts"
TSC = RACINE / "web" / "node_modules" / ".bin" / "tsc"

# Un registre en mémoire qui répond comme PostgREST. Il n'invente rien : il
# applique les filtres du chemin, dans l'ordre, sur des lignes ordinaires.
BOUCHON = """
type Ligne = Record<string, unknown>;
const tables: Record<string, Ligne[]> = {};
let sequence = 0;

export const relie = true;

/** Pour le scénario : ce que la base contient VRAIMENT. */
export function _table(nom: string): Ligne[] { return tables[nom] ?? []; }

function decouper(chemin: string) {
  const [table, requete = ""] = chemin.split("?");
  const filtres: [string, string][] = [];
  let limite = Number.POSITIVE_INFINITY;
  let ordre: [string, boolean] | null = null;
  for (const morceau of requete.split("&")) {
    if (!morceau) continue;
    const i = morceau.indexOf("=");
    const cle = morceau.slice(0, i);
    const valeur = morceau.slice(i + 1);
    if (cle === "select") continue;
    if (cle === "limit") { limite = Number(valeur); continue; }
    if (cle === "order") {
      const [col, sens] = valeur.split(".");
      ordre = [col, sens === "desc"];
      continue;
    }
    filtres.push([cle, valeur]);
  }
  return { table, filtres, limite, ordre };
}

function retient(ligne: Ligne, filtres: [string, string][]): boolean {
  return filtres.every(([col, cond]) => {
    const v = ligne[col];
    if (cond === "is.null") return v === null || v === undefined;
    if (cond.startsWith("eq.")) return String(v) === decodeURIComponent(cond.slice(3));
    if (cond.startsWith("lt.")) return Number(v) < Number(cond.slice(3));
    throw new Error("filtre inconnu dans le bouchon : " + cond);
  });
}

function choisir(chemin: string): Ligne[] {
  const { table, filtres, limite, ordre } = decouper(chemin);
  let lignes = (tables[table] ?? []).filter((l) => retient(l, filtres));
  if (ordre) {
    const [col, desc] = ordre;
    lignes = [...lignes].sort((a, b) =>
      (Number(a[col]) - Number(b[col])) * (desc ? -1 : 1));
  }
  return lignes.slice(0, limite);
}

export async function lire<T>(chemin: string): Promise<T[]> {
  return choisir(chemin) as T[];
}
export async function lireUne<T>(chemin: string): Promise<T | null> {
  return (choisir(chemin)[0] ?? null) as T | null;
}
export async function inserer<T>(table: string, valeurs: unknown): Promise<T | null> {
  const brutes = Array.isArray(valeurs) ? valeurs : [valeurs];
  const posees: Ligne[] = [];
  for (const brute of brutes) {
    const ligne: Ligne = {
      utilise_le: null, annulee_le: null,
      cree_le: new Date().toISOString(),
      ...(brute as Ligne),
      id: ++sequence,
    };
    (tables[table] ??= []).push(ligne);
    posees.push(ligne);
  }
  return (posees[0] ?? null) as T | null;
}
export async function modifier(chemin: string, valeurs: unknown): Promise<boolean> {
  // Un temps d'arrêt AVANT de choisir les lignes. Ce n'est pas une lenteur
  // simulée pour le plaisir : c'est ce qui reproduit deux requêtes qui ont lu
  // la même ligne avant que l'une des deux n'écrive. Sans lui, un scénario à
  // un seul fil enchaîne lecture et écriture sans jamais laisser l'autre
  // passer, et le filtre « pas encore utilisé » ne serait jamais exercé.
  await new Promise((suite) => setTimeout(suite, 5));
  const touchees = choisir(chemin);
  for (const ligne of touchees) Object.assign(ligne, valeurs as Ligne);
  return touchees.length > 0;
}
export async function effacer(_c: string): Promise<boolean> { return false; }
export async function lireObjet(): Promise<ArrayBuffer | null> { return null; }
"""

SCENARIO = r"""
import {
  ALPHABET, LONGUEUR, PAR_SERIE, codesRestants, consommerCodePapier,
  ecrireCodePapier, empreintePapier, etatDuPapier, fabriquerSerie,
  normaliserCodePapier, tirerCodePapier,
} from "./papier.js";
import { memeEmpreinte } from "./code-entree.js";
import { _table } from "./base.js";

const r: Record<string, unknown> = {};

// --- L'alphabet : rien qui se lise pour autre chose -------------------------
r.alphabet = ALPHABET;
r.longueur = LONGUEUR;
r.parSerie = PAR_SERIE;

// --- Le tirage : forme, alphabet, distribution ------------------------------
const tirages = Array.from({ length: 60000 }, () => tirerCodePapier());
r.forme = tirages.every((c) => c.length === LONGUEUR);
const dehors = new Set<string>();
const compte: Record<string, number> = {};
for (const c of ALPHABET) compte[c] = 0;
for (const code of tirages) {
  for (const car of code) {
    if (!ALPHABET.includes(car)) dehors.add(car);
    else compte[car]++;
  }
}
r.horsAlphabet = [...dehors];
r.frequences = compte;

// --- L'empreinte : stable, salée par la personne, muette --------------------
const e1 = await empreintePapier("7K4M2VW9", 7);
const e2 = await empreintePapier("7K4M2VW9", 7);
const e3 = await empreintePapier("7K4M2VW9", 8);
r.empreinteStable = e1 === e2;
r.empreinteSalee = e1 !== e3;
r.empreinteForme = /^[0-9a-f]{64}$/.test(e1);
r.codeAbsent = !e1.includes("7K4M2VW9") && !e1.toUpperCase().includes("7K4M2VW9");

// --- La comparaison ne sort pas tôt -----------------------------------------
r.comparaison = memeEmpreinte(e1, e2)
  && !memeEmpreinte(e1, e3)
  && !memeEmpreinte(e1, e1.slice(0, -1))
  && !memeEmpreinte("", "a")
  && memeEmpreinte("", "");

// --- Ce qui se recopie à la main --------------------------------------------
r.ecriture = ecrireCodePapier("7K4M2VW9") === "7K4M 2VW9";
// Espaces, tirets et minuscules : ce qu'un carnet et un clavier de téléphone
// ajoutent tout seuls.
r.normalisationBruit = normaliserCodePapier(" 7k4m-2vw9 ") === "7K4M2VW9";
// Et le rattrapage des lettres qu'on n'imprime jamais : S lu pour 5, Z pour 2,
// G pour 6, B pour 8, U pour V.
r.normalisationConfusions = normaliserCodePapier("SZGBU") === "5268V";

// --- Une série : dix codes, tous différents ---------------------------------
const serie = await fabriquerSerie(7);
r.serieFaite = serie !== null;
const codes = serie ? serie.codes : [];
r.dix = codes.length === PAR_SERIE;
r.tousDifferents = new Set(codes).size === codes.length;
r.tousDansLAlphabet = codes.every(
  (c) => c.length === LONGUEUR && [...c].every((x) => ALPHABET.includes(x)));

// Ce que la base contient vraiment : dix lignes, des rangs de 1 à 10, et
// AUCUN des dix codes en clair, nulle part.
const enBase = _table("codes_papier");
r.lignesEnBase = enBase.length;
r.rangs = enBase.map((l) => l.rang);
const brut = JSON.stringify(enBase);
r.aucunCodeEnBase = codes.every((c) => !brut.includes(c));

// --- Un code sert une fois, et une seule ------------------------------------
r.restantsAvant = await codesRestants(7);
r.premierPasse = await consommerCodePapier(codes[0], 7);
r.premierNeRepassePas = await consommerCodePapier(codes[0], 7);
// Écrit comme sur le papier, avec l'espace : c'est ce que la personne tape.
r.deuxiemeAvecEspace = await consommerCodePapier(ecrireCodePapier(codes[1]), 7);
r.restantsApres = await codesRestants(7);

// Deux requêtes qui présentent le MÊME code au même instant. C'est la base qui
// arbitre, par le filtre « pas encore utilisé » posé sur la modification : une
// seule des deux doit ouvrir. Un contrôle fait en mémoire laisserait passer
// les deux — c'est exactement ce que ce scénario reproduit.
const course = await Promise.all([
  consommerCodePapier(codes[3], 7),
  consommerCodePapier(codes[3], 7),
]);
r.courseUneSeule = course.filter(Boolean).length === 1;
r.restantsApresCourse = await codesRestants(7);

// Le papier de quelqu'un d'autre n'ouvre rien.
r.pasCeluiDUnAutre = await consommerCodePapier(codes[2], 8);

// --- Une nouvelle série remplace l'ancienne ---------------------------------
const seconde = await fabriquerSerie(7);
r.secondeSerie = seconde ? seconde.serie : null;
r.ancienNOuvrePlus = await consommerCodePapier(codes[2], 7);
r.nouveauOuvre = await consommerCodePapier(seconde ? seconde.codes[0] : "", 7);
r.restantsApresRefonte = await codesRestants(7);
// Rien ne s'efface : les lignes de la première série sont toujours là, datées.
r.lignesTotales = _table("codes_papier").length;
r.annulees = _table("codes_papier").filter((l) => l.annulee_le !== null).length;

const etat = await etatDuPapier(7);
r.etatSerie = etat ? etat.serie : null;
r.etatRestants = etat ? etat.restants : null;

console.log(JSON.stringify(r));
"""

# Ce qu'aucun code ne doit jamais contenir : les couples qui se confondent à
# l'œil, sur un papier, dans un tiroir mal éclairé.
AMBIGUS = "01OILQUSZGB"


def _compilable():
    return TSC.exists() and shutil.which("node") is not None


@unittest.skipUnless(_compilable(),
                     "TypeScript du projet absent : ce test compile et exécute "
                     "le vrai fichier, il ne peut pas s'en passer")
class Papier(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._dossier = tempfile.mkdtemp(prefix="totem-papier-")
        d = Path(cls._dossier)
        # Node en modules ES exige l'extension sur un import relatif ; le
        # compilateur ne la réécrit pas. On l'ajoute sur les COPIES — les
        # fichiers du dépôt restent tels qu'ils partent en production.
        for source, nom in ((SOURCE, "papier.ts"), (VOISIN, "code-entree.ts")):
            texte = (source.read_text(encoding="utf-8")
                     .replace('from "./base"', 'from "./base.js"')
                     .replace('from "./code-entree"', 'from "./code-entree.js"'))
            (d / nom).write_text(texte, encoding="utf-8")
        (d / "base.ts").write_text(BOUCHON, encoding="utf-8")
        (d / "scenario.ts").write_text(SCENARIO, encoding="utf-8")
        (d / "package.json").write_text('{"type":"module"}', encoding="utf-8")
        compile = subprocess.run(
            [str(TSC), "--target", "es2022", "--module", "es2022",
             "--moduleResolution", "bundler", "--lib", "es2022,dom", "--strict",
             "--outDir", str(d), str(d / "papier.ts"), str(d / "code-entree.ts"),
             str(d / "base.ts"), str(d / "scenario.ts")],
            capture_output=True, text=True, cwd=cls._dossier)
        if compile.returncode != 0:
            raise AssertionError("web/lib/papier.ts ne compile pas :\n"
                                 + compile.stdout + compile.stderr)
        lance = subprocess.run(["node", str(d / "scenario.js")],
                               capture_output=True, text=True, timeout=180)
        if lance.returncode != 0:
            raise AssertionError("le scénario a échoué :\n" + lance.stderr)
        cls.r = json.loads(lance.stdout.strip().splitlines()[-1])

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._dossier, ignore_errors=True)

    def test_l_alphabet_ne_contient_rien_d_ambigu(self):
        """Un « 0 » lu pour un « O » au fond d'un tiroir, c'est une personne
        dehors le jour où elle n'a plus que ce papier."""
        for car in AMBIGUS:
            self.assertNotIn(
                car, self.r["alphabet"],
                f"« {car} » est dans l'alphabet : il se confond avec un autre "
                "caractère sur un papier écrit ou lu à la main")
        self.assertGreaterEqual(len(self.r["alphabet"]), 20,
                                "l'alphabet est devenu si court que huit "
                                "caractères ne suffisent plus")

    def test_les_codes_tirés_restent_dans_l_alphabet(self):
        self.assertTrue(self.r["forme"])
        self.assertEqual(
            self.r["horsAlphabet"], [],
            "des caractères hors alphabet sortent du tirage : "
            f"{self.r['horsAlphabet']}")

    def test_le_tirage_ne_favorise_aucun_caractere(self):
        """256 n'est pas un multiple de 25 : sans rejet, les six premiers
        caractères de l'alphabet sortent 10 % plus souvent que les autres.
        C'est invisible à l'œil et exploitable par qui devine « plutôt A »."""
        f = self.r["frequences"]
        total = sum(f.values())
        attendu = total / len(f)
        for car, n in f.items():
            ecart = abs(n - attendu) / attendu
            self.assertLess(
                ecart, 0.04,
                f"« {car} » sort {n} fois pour {attendu:.0f} attendues "
                f"({ecart:.1%} d'écart) — le tirage est biaisé")

    def test_l_empreinte_est_stable_salee_et_ne_rend_pas_le_code(self):
        self.assertTrue(self.r["empreinteStable"])
        self.assertTrue(
            self.r["empreinteSalee"],
            "le même code pour deux personnes donne la même empreinte : qui "
            "lit la base sait qu'elles partagent un secret")
        self.assertTrue(self.r["empreinteForme"])
        self.assertTrue(self.r["codeAbsent"])

    def test_la_base_ne_contient_aucun_code_en_clair(self):
        """La promesse écrite à l'écran — « nous ne pouvons pas vous les
        remontrer » — n'est vraie que si c'est vrai ici."""
        self.assertEqual(self.r["lignesEnBase"], 10)
        self.assertTrue(
            self.r["aucunCodeEnBase"],
            "un des dix codes se retrouve en clair dans la ligne écrite en "
            "base : l'écran ment quand il dit qu'on ne peut pas les remontrer")

    def test_la_comparaison_ne_sort_pas_tot(self):
        """Deux vérifications, et il faut les deux.

        La première porte sur les RÉPONSES : deux empreintes de longueurs
        différentes ne sont pas égales, et deux chaînes vides le sont. La
        seconde porte sur le CHEMIN, et c'est la seule qui attrape un « return »
        glissé au milieu — une sortie anticipée donne exactement les mêmes
        réponses, elle ne se voit qu'au chronomètre. On la lit donc dans le
        texte de la fonction plutôt que de mesurer un temps, ce qui rendrait ce
        test capricieux sur une machine chargée.
        """
        self.assertTrue(self.r["comparaison"])
        corps = re.search(r"export function memeEmpreinte\(.*?\n\}",
                          VOISIN.read_text(encoding="utf-8"), re.S)
        self.assertIsNotNone(corps, "« memeEmpreinte » a changé de forme")
        self.assertEqual(
            corps.group(0).count("return"), 1,
            "la comparaison sort avant la fin : le temps de réponse dit alors "
            "où les deux empreintes ont commencé à différer")

    def test_dix_codes_tous_differents(self):
        self.assertTrue(self.r["serieFaite"])
        self.assertTrue(self.r["dix"])
        self.assertTrue(
            self.r["tousDifferents"],
            "deux codes identiques sur la même feuille : le second n'ouvrirait "
            "rien, et personne ne saurait pourquoi")
        self.assertTrue(self.r["tousDansLAlphabet"])
        self.assertEqual(self.r["rangs"], list(range(1, 11)),
                         "les rangs imprimés en face des codes doivent aller "
                         "de 1 à 10, dans l'ordre")

    def test_un_code_ne_ressert_jamais(self):
        self.assertTrue(self.r["premierPasse"])
        self.assertFalse(
            self.r["premierNeRepassePas"],
            "un code déjà servi ouvre une seconde fois — le papier ramassé "
            "dans une poubelle ouvre le commerce")
        self.assertEqual(self.r["restantsAvant"], 10)
        self.assertEqual(self.r["restantsApres"], 8)
        # Et c'est la BASE qui arbitre, pas nous : deux requêtes qui présentent
        # le même code au même instant ne peuvent pas ouvrir toutes les deux.
        self.assertTrue(
            self.r["courseUneSeule"],
            "deux requêtes simultanées consomment le même code : le filtre "
            "« pas encore utilisé » manque sur la modification, et deux "
            "personnes entrent avec la même ligne du papier")
        self.assertEqual(self.r["restantsApresCourse"], 7)

    def test_le_code_se_tape_comme_il_est_imprime(self):
        """« 7K4M 2VW9 » avec l'espace, en minuscules, avec un tiret : c'est
        ce qu'une main recopie, et cela doit entrer."""
        self.assertTrue(self.r["ecriture"])
        self.assertTrue(self.r["normalisationBruit"])
        self.assertTrue(self.r["deuxiemeAvecEspace"])
        self.assertTrue(
            self.r["normalisationConfusions"],
            "un « S » lu pour un « 5 » referme la porte : ces lettres ne "
            "s'impriment jamais, les rattraper n'élargit rien")

    def test_le_papier_d_un_autre_n_ouvre_rien(self):
        """L'empreinte est salée par la personne : un papier ramassé par terre
        n'ouvre pas le compte de celui qui le trouve."""
        self.assertFalse(self.r["pasCeluiDUnAutre"])

    def test_une_nouvelle_serie_remplace_l_ancienne(self):
        self.assertEqual(self.r["secondeSerie"], 2)
        self.assertFalse(
            self.r["ancienNOuvrePlus"],
            "un code de l'ancienne feuille ouvre encore : deux papiers "
            "valables en circulation, c'est une feuille oubliée dans un tiroir "
            "qui ouvre le commerce trois ans plus tard")
        self.assertTrue(self.r["nouveauOuvre"])
        self.assertEqual(self.r["restantsApresRefonte"], 9)
        self.assertEqual(self.r["etatSerie"], 2)
        self.assertEqual(self.r["etatRestants"], 9)

    def test_rien_ne_s_efface(self):
        """L'ancienne série est datée, pas supprimée : c'est elle qui
        expliquera, plus tard, pourquoi un code recopié n'ouvre plus rien."""
        self.assertEqual(self.r["lignesTotales"], 20)
        self.assertEqual(self.r["annulees"], 10)


class PapierSchema(unittest.TestCase):
    """Les deux fichiers SQL doivent dire la même chose, ici comme ailleurs."""

    def setUp(self):
        self.schema = (RACINE / "sql/schema.sql").read_text(encoding="utf-8")
        self.migration = (RACINE / "sql/migration-papier.sql").read_text(encoding="utf-8")

    def test_les_deux_fichiers_declarent_la_table(self):
        for nom, texte in (("schema.sql", self.schema),
                           ("migration-papier.sql", self.migration)):
            self.assertIn("create table if not exists codes_papier (", texte,
                          f"« codes_papier » manque à {nom}")

    def test_la_base_ne_garde_qu_une_empreinte(self):
        """Une colonne qui porte le code en clair, c'est un papier de secours
        que n'importe quelle fuite de base recopie."""
        corps = re.search(r"create table if not exists codes_papier \((.*?)\n\);",
                          self.migration, re.S).group(1)
        colonnes = re.findall(r"^\s{2}(\w+)\s", corps, re.M)
        self.assertIn("empreinte", colonnes)
        for interdite in ("code", "codes", "clair", "secret"):
            self.assertNotIn(
                interdite, colonnes,
                f"« codes_papier » porte une colonne « {interdite} » : la table "
                "doit reconnaître un code, jamais pouvoir le dire")

    def test_une_serie_se_remplace_en_se_datant(self):
        corps = re.search(r"create table if not exists codes_papier \((.*?)\n\);",
                          self.migration, re.S).group(1)
        self.assertIn("annulee_le", corps)
        self.assertIn("utilise_le", corps)
        self.assertNotIn("on delete cascade", corps,
                         "supprimer une personne emporterait ses codes, et avec "
                         "eux l'explication de ses entrées passées")

    def test_la_table_est_fermee(self):
        for nom, texte in (("schema.sql", self.schema),
                           ("migration-papier.sql", self.migration)):
            self.assertIn("alter table codes_papier enable row level security",
                          texte, f"« codes_papier » reste ouverte dans {nom}")


if __name__ == "__main__":
    unittest.main()
