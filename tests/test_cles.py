# -*- coding: utf-8 -*-
"""Le verrouillage du téléphone tient-il ses promesses ?

Ce mécanisme a une particularité désagréable : quand il est mal réglé, TOUT
MARCHE QUAND MÊME. Une clé posée sans demander l'empreinte ouvre parfaitement ;
une clé acceptée sur un combiné partagé ouvre parfaitement ; une signature
rejouée deux fois ouvre parfaitement. Rien ne se voit, ni à l'écran ni dans un
journal — sauf pour qui en profite.

Aucun de ces réglages ne peut donc rester une intention écrite dans un
commentaire. Ce fichier les vérifie, en deux temps :

  · les fonctions pures, compilées et exécutées pour de vrai ;
  · les décisions, relues dans le code source — parce qu'un « true » devenu
    « false » un jour de fatigue ne casserait aucun test d'exécution.
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
SOURCE = WEB / "lib" / "cles.ts"
TSC = WEB / "node_modules" / ".bin" / "tsc"

# Deux bouchons : la base, et la bibliothèque qui vérifie les signatures.
# Aucune des fonctions exercées ici ne les appelle — on les remplace pour
# pouvoir compiler le vrai fichier hors de Next.
BOUCHON_BASE = """
export const relie = false;
export async function lire<T>(_c: string): Promise<T[]> { return []; }
export async function lireUne<T>(_c: string): Promise<T | null> { return null; }
export async function inserer<T>(_t: string, _v: unknown): Promise<T | null> { return null; }
export async function modifier(_c: string, _v: unknown): Promise<boolean> { return false; }
export async function effacer(_c: string): Promise<boolean> { return false; }
"""

BOUCHON_LIB = """
export type RegistrationResponseJSON = { id: string; response: { clientDataJSON: string; transports?: string[] } };
export type AuthenticationResponseJSON = { id: string; response: { clientDataJSON: string } };
export async function generateRegistrationOptions(_o: unknown): Promise<unknown> { return {}; }
export async function generateAuthenticationOptions(_o: unknown): Promise<unknown> { return {}; }
export async function verifyRegistrationResponse(_o: unknown): Promise<unknown> { return {}; }
export async function verifyAuthenticationResponse(_o: unknown): Promise<unknown> { return {}; }
"""

SCENARIO = r"""
import {
  depuisBase64Url, enBase64Url, lieuDepuis, proposerUneCle, VIE_DEFI_MS,
} from "./cles.js";

const r: Record<string, unknown> = {};

// LA RÈGLE QUI COMPTE : pas de clé sur un combiné partagé.
r.refuseLePartage = proposerUneCle(true) === false;
r.acceptePersonnel = proposerUneCle(false) === true;

// L'adresse pour laquelle le téléphone accepte de signer.
r.lieuSimple = lieuDepuis("totem.example", "https");
r.lieuAvecPort = lieuDepuis("localhost:3000", "http");
// Un en-tête « Host » absurde ne doit pas produire un lieu de fantaisie.
r.lieuAbsurde = lieuDepuis("pas une adresse du tout ///", "https");
r.lieuVide = lieuDepuis(null, null);

// Le format : aller-retour sans perte, y compris sur des octets qui
// contiennent ce que la base 64 ordinaire remplacerait.
const octets = new Uint8Array(256);
for (let i = 0; i < 256; i++) octets[i] = i;
const texte = enBase64Url(octets);
r.sansCaracteresInterdits = !/[+/=]/.test(texte);
const retour = depuisBase64Url(texte);
r.allerRetour = retour.length === 256 && retour.every((o, i) => o === i);

// Cinq minutes.
r.cinqMinutes = VIE_DEFI_MS === 5 * 60 * 1000;

console.log(JSON.stringify(r));
"""


def _compilable():
    return TSC.exists() and shutil.which("node") is not None


@unittest.skipUnless(_compilable(),
                     "TypeScript du projet absent : ce test compile et exécute "
                     "le vrai fichier, il ne peut pas s'en passer")
class ClesCalculs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._dossier = tempfile.mkdtemp(prefix="totem-cles-")
        d = Path(cls._dossier)
        source = SOURCE.read_text(encoding="utf-8") \
            .replace('from "./base"', 'from "./base.js"') \
            .replace('from "@simplewebauthn/server"', 'from "./faux.js"')
        (d / "cles.ts").write_text(source, encoding="utf-8")
        (d / "base.ts").write_text(BOUCHON_BASE, encoding="utf-8")
        (d / "faux.ts").write_text(BOUCHON_LIB, encoding="utf-8")
        (d / "scenario.ts").write_text(SCENARIO, encoding="utf-8")
        (d / "package.json").write_text('{"type":"module"}', encoding="utf-8")
        # « process » vient de Node ; hors de Next, le compilateur ne le
        # connaît pas. On le déclare pour la COPIE seulement.
        (d / "global.d.ts").write_text(
            "declare const process: { env: Record<string, string | undefined> };",
            encoding="utf-8")
        compile = subprocess.run(
            [str(TSC), "--target", "es2022", "--module", "es2022",
             "--moduleResolution", "bundler", "--lib", "es2022,dom",
             "--outDir", str(d), str(d / "cles.ts"), str(d / "base.ts"),
             str(d / "faux.ts"), str(d / "scenario.ts"),
             str(d / "global.d.ts")],
            capture_output=True, text=True, cwd=cls._dossier)
        if compile.returncode != 0:
            raise AssertionError("web/lib/cles.ts ne compile pas :\n"
                                 + compile.stdout + compile.stderr)
        lance = subprocess.run(["node", str(d / "scenario.js")],
                               capture_output=True, text=True, timeout=60)
        if lance.returncode != 0:
            raise AssertionError("le scénario a échoué :\n" + lance.stderr)
        cls.r = json.loads(lance.stdout.strip().splitlines()[-1])

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._dossier, ignore_errors=True)

    def test_pas_de_cle_sur_un_combine_partage(self):
        """La règle qui gouverne tout le reste.

        Une clé reconnaît un APPAREIL. Posée sur le combiné du comptoir, elle
        ouvrirait le compte de la propriétaire à quiconque tient le combiné —
        et il n'y aurait plus aucun moyen de savoir qui a appuyé.
        """
        self.assertTrue(self.r["refuseLePartage"])
        self.assertTrue(self.r["acceptePersonnel"])

    def test_l_adresse_de_signature_se_deduit_proprement(self):
        self.assertEqual(self.r["lieuSimple"],
                         {"origine": "https://totem.example", "domaine": "totem.example"})
        # Le port fait partie de l'origine, jamais du domaine : le téléphone
        # lie sa clé au domaine seul.
        self.assertEqual(self.r["lieuAvecPort"],
                         {"origine": "http://localhost:3000", "domaine": "localhost"})

    def test_un_hote_absurde_ne_produit_pas_un_lieu_de_fantaisie(self):
        """Mieux vaut refuser de servir que signer pour n'importe quoi."""
        self.assertIsNone(self.r["lieuAbsurde"])
        self.assertIsNone(self.r["lieuVide"])

    def test_le_format_fait_l_aller_retour_sans_perte(self):
        """Une clé publique mal recodée, c'est une personne qui n'entre plus
        jamais — et le défaut ne se voit qu'à la deuxième connexion."""
        self.assertTrue(self.r["sansCaracteresInterdits"])
        self.assertTrue(self.r["allerRetour"])

    def test_la_phrase_a_signer_vit_cinq_minutes(self):
        self.assertTrue(self.r["cinqMinutes"])


class ClesDecisions(unittest.TestCase):
    """Les réglages qui n'échouent jamais bruyamment quand ils sont faux."""

    def setUp(self):
        self.cles = SOURCE.read_text(encoding="utf-8")
        self.enregistrer = (WEB / "app/api/cle/enregistrer/route.ts").read_text(encoding="utf-8")
        self.entrer = (WEB / "app/api/cle/entrer/route.ts").read_text(encoding="utf-8")
        self.middleware = (WEB / "middleware.ts").read_text(encoding="utf-8")
        self.base = (WEB / "lib/base.ts").read_text(encoding="utf-8")

    def test_le_telephone_doit_vraiment_demander_le_doigt(self):
        """Sans cela, un téléphone déverrouillé posé sur le comptoir ouvre le
        compte tout seul — et la porte est un couloir."""
        for appel in ("verifyRegistrationResponse", "verifyAuthenticationResponse"):
            bloc = self._bloc(self.cles, f"await {appel}({{")
            self.assertIn(
                "requireUserVerification: true", bloc,
                f"« {appel} » n'exige pas que le téléphone ait demandé le "
                "doigt : une clé qui ouvre sans rien demander n'est pas une "
                "porte")
        # Et on le demande aussi À LA FABRICATION, sinon le téléphone crée une
        # clé qui n'en sera jamais capable.
        self.assertEqual(
            self.cles.count('userVerification: "required"'), 2,
            "les deux demandes au navigateur doivent exiger la vérification "
            "de la personne — à l'enregistrement comme à l'entrée")

    def test_la_phrase_est_consommee_avant_d_etre_verifiee(self):
        """Sinon une phrase valable se réessaie cent fois avec des signatures
        différentes, et le ralentissement ne ralentit rien."""
        corps = self._bloc(self.cles, "export async function entrerParCle")
        self.assertLess(
            corps.index("consommerDefi(attendu, \"entrer\")"),
            corps.index("verifyAuthenticationResponse"),
            "la signature est vérifiée avant que la phrase soit consommée : "
            "une même phrase se réessaierait alors cent fois")
        # Et l'inverse est vrai pour l'enregistrement.
        pose = self._bloc(self.cles, "export async function enregistrerCle")
        self.assertLess(
            pose.index("consommerDefi(attendu, \"enregistrer\")"),
            pose.index("verifyRegistrationResponse"))

    def test_une_phrase_ne_sert_qu_une_fois(self):
        """Le filtre « pas encore utilisée » dans la modification : c'est la
        base qui arbitre, pas nous, et deux requêtes simultanées ne peuvent
        pas réussir toutes les deux."""
        self.assertIn("utilise_le=is.null", self.cles)
        self.assertRegex(
            self.cles, r"defis\?id=eq\.\$\{ligne\.id\}&utilise_le=is\.null")

    def test_la_phrase_d_enregistrement_appartient_a_la_personne(self):
        """Sans ce contrôle, une phrase obtenue sur son propre compte servirait
        à poser une clé sur celui de quelqu'un d'autre."""
        self.assertIn("defi.personne !== personne", self.cles)

    def test_un_compteur_qui_recule_ferme_la_porte(self):
        """Deux objets portent alors la même clé : quelqu'un l'a copiée."""
        self.assertIn("cle.compteur > 0 && neuf <= cle.compteur", self.cles)
        self.assertIn('raison: "copiee"', self.cles)

    def test_une_cle_retiree_ne_rouvre_rien(self):
        """C'est ce qui donne un sens au bouton « ce téléphone n'est plus à
        moi ». Sans ce contrôle, le retrait est une case cochée."""
        self.assertIn("if (cle.retiree_le) return", self.cles)

    def test_la_signature_ne_suffit_pas_a_entrer(self):
        """Une personne partie, suspendue, ou dont la clé a été reprise garde
        un téléphone qui signe parfaitement. Le droit se relit en base."""
        self.assertIn('etat !== "actif"', self.entrer)
        self.assertIn("accesDe(", self.entrer)

    def test_on_ne_pose_pas_de_cle_sur_un_appareil_partage(self):
        """Le contrôle doit être sur les DEUX temps : demander la phrase, et
        rapporter la signature. Ne garder que le premier laisserait la route
        ouverte à qui appelle directement le second."""
        for verbe in ("GET", "POST"):
            bloc = self._bloc(self.enregistrer, f"export async function {verbe}")
            self.assertIn(
                "proposerUneCle(p.session.partage)", bloc,
                f"« {verbe} » de l'enregistrement ne vérifie pas si l'appareil "
                "est partagé")

    def test_la_porte_est_ouverte_mais_pas_l_enregistrement(self):
        """« entrer » doit être joignable sans session — c'est la porte.
        « enregistrer » ne doit pas l'être : on ne pose une clé que sur un
        compte déjà ouvert."""
        liste = re.search(r"const OUVERT = \[(.*?)\];", self.middleware, re.S)
        self.assertIsNotNone(liste, "la liste des adresses ouvertes a changé de forme")
        ouvertes = liste.group(1)
        self.assertIn('"/api/cle/entrer"', ouvertes)
        self.assertNotIn("/api/cle/enregistrer", ouvertes,
                         "poser une clé ne demande plus d'être entré")
        self.assertNotIn("/api/cle/retirer", ouvertes)

    def test_une_session_ouverte_par_le_telephone_n_est_jamais_partagee(self):
        """C'est la condition à laquelle la clé a été posée : un appareil
        personnel. La session ne peut pas se déclarer partagée après coup."""
        self.assertIn("partage: false", self.entrer)

    def test_rien_ne_s_efface_sauf_les_phrases_perimees(self):
        """La seule exception de tout le dépôt, et elle porte sa liste."""
        self.assertIn('const EFFACABLES = ["defis"]', self.base)
        self.assertIn("EFFACABLES.includes(table)", self.base)
        # Et personne n'efface une clé : on la date.
        self.assertNotRegex(
            self.cles, r"effacer\(\s*[`\"']cles",
            "une clé s'efface quelque part : elle doit se dater, sinon "
            "l'entrée d'il y a trois mois n'a plus d'explication")
        self.assertIn("retiree_le: new Date()", self.cles)

    def test_le_code_par_mail_reste_un_chemin(self):
        """Une clé se perd avec le téléphone. Le jour où c'est arrivé, il faut
        un autre chemin — et les écrans doivent le dire, pas le cacher."""
        connexion = (WEB / "lib/textes/connexion.ts").read_text(encoding="utf-8")
        for langue in ("telephoneRate", "telephoneImpossible"):
            self.assertIn(langue, connexion)
        # Chaque message de refus doit renvoyer vers l'autre chemin.
        for phrase in ("ou entrez par mail", "or sign in by email"):
            self.assertIn(
                phrase,
                (WEB / "app/api/cle/entrer/route.ts").read_text(encoding="utf-8")
                + (WEB / "app/api/cle/enregistrer/route.ts").read_text(encoding="utf-8"),
                f"aucun refus ne propose « {phrase} » : un refus sans issue "
                "se vit comme une porte murée")

    @staticmethod
    def _bloc(texte, depart):
        """Du repère jusqu'à la fin de l'appel ou de la fonction."""
        i = texte.index(depart)
        j = texte.find("\n}", i)
        return texte[i:j if j > 0 else len(texte)]


class ClesSchema(unittest.TestCase):
    """Les deux fichiers SQL doivent dire la même chose, ici comme ailleurs."""

    def setUp(self):
        self.schema = (RACINE / "sql/schema.sql").read_text(encoding="utf-8")
        self.migration = (RACINE / "sql/migration-cles.sql").read_text(encoding="utf-8")

    def test_les_deux_fichiers_declarent_les_memes_tables(self):
        for table in ("cles", "defis"):
            for nom, texte in (("schema.sql", self.schema),
                               ("migration-cles.sql", self.migration)):
                self.assertIn(f"create table if not exists {table} (", texte,
                              f"« {table} » manque à {nom}")

    def test_la_base_ne_garde_que_la_moitie_publique(self):
        """Une clé privée en base, c'est une base qui peut se faire passer
        pour n'importe lequel de ses utilisateurs."""
        corps = re.search(r"create table if not exists cles \((.*?)\n\);",
                          self.migration, re.S).group(1)
        for interdit in ("cle_privee", "secret", "prive"):
            self.assertNotIn(
                interdit, corps,
                f"« cles » porte une colonne « {interdit} » : la table ne doit "
                "contenir que ce qui vérifie, jamais ce qui signe")
        self.assertIn("cle_publique", corps)

    def test_une_cle_se_retire_en_se_datant(self):
        corps = re.search(r"create table if not exists cles \((.*?)\n\);",
                          self.migration, re.S).group(1)
        self.assertIn("retiree_le", corps)
        self.assertNotIn("on delete cascade", corps,
                         "supprimer une personne emporterait ses clés, et avec "
                         "elles l'explication de ses entrées passées")

    def test_les_deux_tables_sont_fermees(self):
        for table in ("cles", "defis"):
            self.assertIn(f"alter table {table} enable row level security",
                          self.migration)
            self.assertIn(f"alter table {table} enable row level security",
                          self.schema)


if __name__ == "__main__":
    unittest.main()
