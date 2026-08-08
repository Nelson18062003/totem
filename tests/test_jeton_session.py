# -*- coding: utf-8 -*-
"""Le jeton de session tient-il ce qu'il promet ?

`web/lib/session.ts` est le seul fichier du dépôt dont une faute silencieuse
ouvrirait la plateforme à un inconnu. Le relire ne suffit pas : une signature
vérifiée sur les mauvais octets, une expiration comparée à l'envers, un rôle
lu depuis un jeton qu'on n'a pas authentifié — rien de tout cela ne se voit,
et tout se prouve à l'exécution.

Ce test compile réellement le fichier avec le TypeScript du projet, puis le
fait tourner sous Node avec Web Crypto — le même moteur que le runtime
« edge » de Vercel. On n'écrit pas une seconde version des fonctions pour les
tester : on exerce celles qui partiront en production.

Là où le compilateur n'est pas installé, le test se saute en le disant.
"""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "web" / "lib" / "session.ts"
TSC = RACINE / "web" / "node_modules" / ".bin" / "tsc"

# Le scénario, écrit une fois et déroulé sous Node. Il exerce ce qui doit
# marcher, puis chacune des façons dont un jeton peut être faux.
SCENARIO = r"""
import {
  DUREE_MS, egaliteConstante, lireSession, nouvelIdentifiant, signerSession,
} from "./session.js";

const secret = "une clé qui ne quitte pas le serveur";
const charge = { session: nouvelIdentifiant(), personne: 42, role: "operateur" as const };
const resultat: Record<string, unknown> = {};

const jeton = await signerSession(secret, charge);
const relu = await lireSession(secret, jeton);

resultat.allerRetour = relu !== null
  && relu.session === charge.session
  && relu.personne === 42
  && relu.role === "operateur";

// L'identifiant : 128 bits, en hexadécimal, et jamais deux fois le même.
const tirages = new Set(Array.from({ length: 500 }, () => nouvelIdentifiant()));
resultat.identifiantUnique = tirages.size === 500;
resultat.identifiantForme = [...tirages].every((i) => /^[0-9a-f]{32}$/.test(i));

// Une autre clé ne doit rien pouvoir relire.
resultat.autreCle = (await lireSession("une autre clé", jeton)) === null;

// Un rôle modifié dans le jeton : la signature ne correspond plus.
const morceaux = jeton.split(".");
const eleve = [morceaux[0], morceaux[1], "proprietaire", morceaux[3], morceaux[4]].join(".");
resultat.roleEleve = (await lireSession(secret, eleve)) === null;

// Une personne modifiée : idem.
const autrePersonne = [morceaux[0], "1", morceaux[2], morceaux[3], morceaux[4]].join(".");
resultat.personneChangee = (await lireSession(secret, autrePersonne)) === null;

// Une expiration repoussée à la main.
const prolonge = [morceaux[0], morceaux[1], morceaux[2],
                  String(Date.now() + 999999999), morceaux[4]].join(".");
resultat.prolonge = (await lireSession(secret, prolonge)) === null;

// Un jeton déjà périmé, signé pour de bon : authentique, mais mort.
const perime = await signerSession(secret, charge, -1000);
resultat.perime = (await lireSession(secret, perime)) === null;

// Un rôle qui n'existe pas.
const inventé = await signerSession(secret, { ...charge, role: "roi" as never });
resultat.roleInconnu = (await lireSession(secret, inventé)) === null;

// Les formes tordues : rien ne doit jeter, tout doit valoir null.
const tordus = ["", "a.b.c", "a.b.c.d.e", "....", "x".repeat(500),
                jeton.slice(0, -1), jeton + "x", "../../etc/passwd"];
resultat.tordus = (await Promise.all(
  tordus.map((t) => lireSession(secret, t)))).every((r) => r === null);

// Sans clé, rien ne se lit — même un jeton parfait.
resultat.sansCle = (await lireSession("", jeton)) === null;

// La durée par défaut vise les douze heures de l'AAL2 (SP 800-63B-4 §5.2).
resultat.douzeHeures = DUREE_MS === 12 * 3600 * 1000;
resultat.expireDansDouzeHeures =
  relu !== null && Math.abs(relu.expire - (Date.now() + DUREE_MS)) < 5000;

// La comparaison à temps constant ne doit plus sortir tôt sur les longueurs.
resultat.egaliteJuste = egaliteConstante("abc", "abc")
  && !egaliteConstante("abc", "abd")
  && !egaliteConstante("abc", "abcd")
  && !egaliteConstante("", "a")
  && egaliteConstante("", "");

console.log(JSON.stringify(resultat));
"""


def _compilable():
    return TSC.exists() and shutil.which("node") is not None


@unittest.skipUnless(_compilable(),
                     "TypeScript du projet absent : ce test compile et exécute "
                     "le vrai fichier, il ne peut pas s'en passer")
class JetonDeSession(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._dossier = tempfile.mkdtemp(prefix="totem-jeton-")
        d = Path(cls._dossier)
        (d / "session.ts").write_text(SOURCE.read_text(encoding="utf-8"), encoding="utf-8")
        (d / "scenario.ts").write_text(SCENARIO, encoding="utf-8")
        # Modules ES, cible récente : c'est ce que Next produit, et c'est ce
        # que Node exécute nativement.
        (d / "package.json").write_text('{"type":"module"}', encoding="utf-8")
        compile = subprocess.run(
            [str(TSC), "--target", "es2022", "--module", "es2022",
             "--moduleResolution", "bundler", "--lib", "es2022,dom",
             "--strict", "--outDir", str(d), str(d / "session.ts"), str(d / "scenario.ts")],
            capture_output=True, text=True, cwd=cls._dossier)
        if compile.returncode != 0:
            raise AssertionError(
                "web/lib/session.ts ne compile pas :\n" + compile.stdout + compile.stderr)
        lance = subprocess.run(["node", str(d / "scenario.js")],
                               capture_output=True, text=True, timeout=60)
        if lance.returncode != 0:
            raise AssertionError("le scénario a échoué :\n" + lance.stderr)
        cls.r = json.loads(lance.stdout.strip().splitlines()[-1])

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._dossier, ignore_errors=True)

    def test_un_jeton_signe_se_relit_entier(self):
        self.assertTrue(self.r["allerRetour"],
                        "le jeton ne rend pas la session, la personne et le rôle")

    def test_l_identifiant_de_session_est_imprevisible(self):
        """C'est lui qui rend une session révocable : le deviner, c'est
        pouvoir en fermer une qui n'est pas la sienne."""
        self.assertTrue(self.r["identifiantUnique"], "deux tirages identiques sur 500")
        self.assertTrue(self.r["identifiantForme"], "l'identifiant n'a pas la forme attendue")

    def test_une_autre_cle_ne_relit_rien(self):
        self.assertTrue(self.r["autreCle"])

    def test_on_ne_s_eleve_pas_en_reecrivant_son_role(self):
        """Le cas qui compte : un lecteur qui remplace « lecteur » par
        « proprietaire » dans son propre cookie."""
        self.assertTrue(self.r["roleEleve"], "un rôle réécrit à la main passe")

    def test_on_ne_devient_pas_quelqu_un_d_autre(self):
        self.assertTrue(self.r["personneChangee"], "un numéro de personne réécrit passe")

    def test_on_ne_prolonge_pas_sa_session_soi_meme(self):
        self.assertTrue(self.r["prolonge"], "une expiration repoussée à la main passe")

    def test_un_jeton_perime_ne_vaut_plus_rien(self):
        self.assertTrue(self.r["perime"])

    def test_un_role_inconnu_est_refuse(self):
        self.assertTrue(self.r["roleInconnu"])

    def test_les_formes_tordues_ne_jettent_pas_et_ne_passent_pas(self):
        """Une exception non rattrapée dans le middleware serait une panne de
        la plateforme entière, déclenchable par un cookie fabriqué."""
        self.assertTrue(self.r["tordus"])

    def test_sans_cle_rien_ne_se_lit(self):
        self.assertTrue(self.r["sansCle"])

    def test_la_session_dure_douze_heures(self):
        """AAL2 demande une nouvelle preuve au moins toutes les douze heures
        (SP 800-63B-4 §5.2). L'ancienne durée était d'un mois."""
        self.assertTrue(self.r["douzeHeures"], "la durée par défaut n'est plus de douze heures")
        self.assertTrue(self.r["expireDansDouzeHeures"])

    def test_la_comparaison_ne_sort_plus_tot_sur_la_longueur(self):
        """Le retour anticipé livrait la longueur du secret au chronomètre."""
        self.assertTrue(self.r["egaliteJuste"])


if __name__ == "__main__":
    unittest.main()
