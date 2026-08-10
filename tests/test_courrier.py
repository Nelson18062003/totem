# -*- coding: utf-8 -*-
"""Les courriels de TOTEM tiennent-ils leurs promesses ?

Ce que garde ce test se casse en SILENCE. Un objet de message qui gagne les six
chiffres continue d'arriver, d'être joli et d'ouvrir la porte — il livre
seulement le compte à qui regarde l'écran verrouillé par-dessus l'épaule. Une
fonction d'envoi qui renvoie « c'est parti » alors qu'aucune clé n'est
configurée laisse une propriétaire attendre un message qui n'existe pas. Rien
de tout cela ne se voit en relisant.

Cinq règles, et une sixième qui vient de la maquette :

  1. le code n'apparaît dans AUCUN objet — tous les messages sont fabriqués et
     tous les objets sont lus ;
  2. sans clé, la fonction ne prétend jamais avoir envoyé ;
  3. le code en clair n'est journalisé nulle part, et n'apparaît en console que
     dans le cas expressément prévu : pas de clé ET pas en production ;
  4. les deux langues ont exactement les mêmes clés, et les mêmes arguments ;
  5. chaque message porte « si ce n'était pas vous » et le rappel sur le PIN ;
  6. jamais un code et un lien dans le même message.

Comme « test_code_entree.py », on compile les VRAIS fichiers avec le TypeScript
du projet et on les exécute sous Node. Aucune deuxième version des fonctions
n'est écrite ici : ce qui est exercé est ce qui partira en production. Seul
« lib/base.ts » est remplacé par un bouchon — il parle à Supabase, et il sert
ici de mouchard sur ce qui s'écrit dans le journal.
"""

import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
LIB = RACINE / "web" / "lib"
TSC = RACINE / "web" / "node_modules" / ".bin" / "tsc"

# Les fichiers réels, tels qu'ils partiront. « base.ts » est le seul absent :
# il est remplacé plus bas.
SOURCES = {
    "courrier.ts": LIB / "courrier.ts",
    "envois.ts": LIB / "envois.ts",
    "code-entree.ts": LIB / "code-entree.ts",
    "invitations.ts": LIB / "invitations.ts",
    "session.ts": LIB / "session.ts",
    "langue.ts": LIB / "langue.ts",
    "textes/courrier.ts": LIB / "textes" / "courrier.ts",
}

# Node en modules ES exige l'extension sur un import relatif, et le compilateur
# ne la réécrit pas. On l'ajoute sur les COPIES — les fichiers du dépôt restent
# tels qu'ils partent en production, où Next s'en charge.
EXTENSION = re.compile(r'from "(\.\.?/[^"]+)"')

# `process` n'existe pas dans les bibliothèques standard du compilateur, et
# tout ce fichier tourne autour de deux variables d'environnement.
AMBIANT = """
declare const process: { env: Record<string, string | undefined> };
"""

# Le bouchon de la base : il n'écrit rien, il RETIENT. C'est lui qui permet de
# regarder, après coup, ce que le journal a vraiment reçu.
BOUCHON = """
export const relie = true;
export const journal: { table: string; valeurs: unknown }[] = [];
export function oublier(): void { journal.length = 0; }

export async function lire<T>(_chemin: string): Promise<T[]> { return []; }
export async function lireUne<T>(_chemin: string): Promise<T | null> { return null; }
export async function inserer<T>(table: string, valeurs: unknown): Promise<T | null> {
  journal.push({ table, valeurs });
  return { id: journal.length, ...(valeurs as object) } as T;
}
export async function modifier(_chemin: string, _valeurs: unknown): Promise<boolean> {
  return true;
}
export async function effacer(_chemin: string): Promise<boolean> { return true; }
export async function lireObjet(): Promise<ArrayBuffer | null> { return null; }
"""

SCENARIO = r"""
import { composer, textesCourrier, type Contenu, type Motif } from "./textes/courrier.js";
import { adresseCredible, envoyerCourriel } from "./courrier.js";
import { envoyerCode, envoyerInvitation } from "./envois.js";
import { journal, oublier } from "./base.js";
import type { Langue } from "./langue.js";

const r: Record<string, unknown> = {};

// Aucun chiffre dans les données de départ : ce qui apparaîtra dans un objet
// de message sous forme de chiffres ne pourra venir que du code.
const COMMERCE = "Marché · Bafoussam";
const CODE = "408 913";
const MOTIFS: Motif[] = ["invitation", "entree", "appareil", "adresse", "geste"];

const contenus: Contenu[] = [
  ...MOTIFS.map((motif) => ({
    genre: "code" as const, motif, commerce: COMMERCE, code: CODE,
    minutes: 10, appareil: "Chrome sur Android", lieu: "Douala",
  })),
  {
    genre: "invitation", invitant: "Mme Fotso", commerce: COMMERCE,
    nom: "J. Eyenga", lien: "https://totem.example/invitation/abcdef",
    jours: 7,
  },
  { genre: "bienvenue", commerce: COMMERCE, nom: "J. Eyenga",
    lien: "https://totem.example/" },
  { genre: "alerte_appareil", commerce: COMMERCE, quand: "neuf heures douze",
    appareil: "Chrome sur Android", lieu: "Douala" },
  { genre: "cle_retiree", commerce: COMMERCE, quand: "neuf heures douze",
    appareil: "Chrome sur Android" },
];

const langues: Langue[] = ["en", "fr"];
r.messages = langues.flatMap((langue) =>
  contenus.map((c) => {
    const m = composer(langue, c);
    return {
      langue, genre: c.genre,
      motif: c.genre === "code" ? c.motif : null,
      objet: m.objet, texte: m.texte, html: m.html,
    };
  }));

// --- Les deux langues portent-elles exactement les mêmes clés ? ------------
// On compare la FORME : les clés, leur imbrication, et le nombre d'arguments
// de chaque fonction. Une traduction qui oublie un paramètre casse la phrase
// sans casser la compilation.
function forme(v: unknown): unknown {
  if (typeof v === "function") return `fonction/${(v as (...a: unknown[]) => unknown).length}`;
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      o[k] = forme((v as Record<string, unknown>)[k]);
    }
    return o;
  }
  return typeof v;
}
r.formeEn = forme(textesCourrier.en);
r.formeFr = forme(textesCourrier.fr);

// --- La console, mise sous surveillance -----------------------------------
const vraiInfo = console.info, vraiErreur = console.error, vraiLog = console.log;
let dit: string[] = [];
function ecouter() {
  dit = [];
  const prendre = (...a: unknown[]) => { dit.push(a.map(String).join(" ")); };
  console.info = prendre; console.error = prendre; console.log = prendre;
  console.warn = prendre;
}
function rendreLaConsole() {
  console.info = vraiInfo; console.error = vraiErreur; console.log = vraiLog;
  console.warn = vraiErreur;
}

const msg = composer("fr", contenus[1]);   // un message de code, motif « entree »

// --- Sans clé, en production : rien ne part, et rien ne s'écrit ------------
process.env.COURRIER_EXPEDITEUR = "TOTEM <bonjour@totem.example>";
delete process.env.COURRIER_CLE;
process.env.NODE_ENV = "production";
oublier(); ecouter();
const sansCle = await envoyerCourriel({
  destinataire: "jeanne@boutique.cm", genre: "code", message: msg,
});
rendreLaConsole();
r.sansCle = sansCle;
r.sansCleConsole = dit.join("\n");
r.sansCleJournal = journal.map((l) => ({ table: l.table, valeurs: l.valeurs }));

// --- Sans clé, hors production : le message s'écrit, pour que ça avance ----
process.env.NODE_ENV = "development";
oublier(); ecouter();
await envoyerCourriel({ destinataire: "jeanne@boutique.cm", genre: "code", message: msg });
rendreLaConsole();
r.devConsole = dit.join("\n");

// --- Le parcours complet : envoyerCode, en développement ------------------
// Le code est tiré au sort ; on ne peut le connaître que par l'échappatoire de
// développement. C'est justement ce qui permet de vérifier ensuite qu'il n'est
// nulle part ailleurs.
process.env.NODE_ENV = "development";
oublier(); ecouter();
const parcours = await envoyerCode({
  courriel: "jeanne@boutique.cm", motif: "entree", commerce: COMMERCE,
  langue: "fr", appareil: "Chrome sur Android", lieu: "Douala",
});
rendreLaConsole();
const echo = dit.join("\n");
const trouve = echo.match(/(\d{3} \d{3})/);
r.codeVu = trouve ? trouve[1] : null;
r.parcours = parcours;
r.parcoursJson = JSON.stringify(parcours);
r.parcoursJournal = JSON.stringify(journal);

// --- Le parcours complet, en production : la console reste muette ---------
process.env.NODE_ENV = "production";
oublier(); ecouter();
const parcoursProd = await envoyerCode({
  courriel: "jeanne@boutique.cm", motif: "entree", commerce: COMMERCE,
  langue: "en",
});
rendreLaConsole();
r.prodConsole = dit.join("\n");
r.prodJournal = JSON.stringify(journal.filter((l) => l.table === "courriels"));
r.prodParcours = parcoursProd;

// --- L'invitation : le jeton en clair ne survit pas au message -------------
process.env.NODE_ENV = "development";
oublier(); ecouter();
const inv = await envoyerInvitation({
  commerce: "marche-bafoussam", commerceNom: COMMERCE, role: "lecteur",
  nom: "J. Eyenga", courriel: "jeanne@boutique.cm", langue: "fr",
  invitant: "Mme Fotso", creeePar: 1, origine: "https://totem.example",
});
rendreLaConsole();
const lien = dit.join("\n").match(/invitation\/([a-z0-9]+)/);
r.jetonVu = lien ? lien[1] : null;
r.invitationJson = JSON.stringify(inv);
r.invitationJournal = JSON.stringify(journal);

// --- Un fournisseur qui refuse, un fournisseur injoignable ----------------
// Ni l'un ni l'autre ne doit jeter : une page qui casse au lieu d'afficher
// « réessayez » est pire que le message manquant.
process.env.COURRIER_CLE = "cle-de-test";
const vraiFetch = globalThis.fetch;

globalThis.fetch = (async () => new Response(
  JSON.stringify({ name: "validation_error" }), { status: 422 })) as typeof fetch;
oublier();
r.refusee = await envoyerCourriel({
  destinataire: "jeanne@boutique.cm", genre: "code", message: msg });
r.refuseeJournal = JSON.stringify(journal);

globalThis.fetch = (async () => { throw new Error("ECONNRESET"); }) as typeof fetch;
oublier();
r.injoignable = await envoyerCourriel({
  destinataire: "jeanne@boutique.cm", genre: "code", message: msg });

let envoye: Record<string, unknown> | null = null;
globalThis.fetch = (async (_u: unknown, o: { body: string }) => {
  envoye = JSON.parse(o.body);
  return new Response(JSON.stringify({ id: "ref-123" }), { status: 200 });
}) as unknown as typeof fetch;
oublier();
r.partie = await envoyerCourriel({
  destinataire: "  Jeanne@Boutique.CM ", genre: "code", message: msg });
r.partieEnvoye = envoye;
r.partieJournal = JSON.stringify(journal);

globalThis.fetch = vraiFetch;

// Une adresse qui n'en est pas une n'appelle même pas le fournisseur.
r.adresses = {
  bonne: adresseCredible("jeanne@boutique.cm"),
  sansArobase: adresseCredible("jeanne.boutique.cm"),
  sansPoint: adresseCredible("jeanne@boutique"),
  avecEspace: adresseCredible("jeanne @boutique.cm"),
  vide: adresseCredible(""),
};

console.log(JSON.stringify(r));
"""

# Les deux phrases obligatoires, écrites ici en toutes lettres : c'est le seul
# endroit où elles ne sont pas fournies par le code qu'on teste.
PAS_VOUS = {"en": "If this was not you", "fr": "Si ce n'était pas vous"}
PIN = {"en": "never asks for your Mobile Money PIN",
       "fr": "ne demande jamais votre code PIN Mobile Money"}


def _compilable():
    return TSC.exists() and shutil.which("node") is not None


@unittest.skipUnless(_compilable(),
                     "TypeScript du projet absent : ce test compile et exécute "
                     "les vrais fichiers, il ne peut pas s'en passer")
class Courrier(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._dossier = tempfile.mkdtemp(prefix="totem-courrier-")
        d = Path(cls._dossier)
        (d / "textes").mkdir()
        fichiers = []
        for nom, source in SOURCES.items():
            cible = d / nom
            cible.write_text(
                EXTENSION.sub(r'from "\1.js"', source.read_text(encoding="utf-8")),
                encoding="utf-8")
            fichiers.append(str(cible))
        (d / "base.ts").write_text(BOUCHON, encoding="utf-8")
        (d / "ambiant.d.ts").write_text(AMBIANT, encoding="utf-8")
        (d / "scenario.ts").write_text(SCENARIO, encoding="utf-8")
        (d / "package.json").write_text('{"type":"module"}', encoding="utf-8")
        fichiers += [str(d / "base.ts"), str(d / "ambiant.d.ts"),
                     str(d / "scenario.ts")]

        compile = subprocess.run(
            [str(TSC), "--target", "es2022", "--module", "es2022",
             "--moduleResolution", "bundler", "--lib", "es2022,dom",
             "--strict", "--skipLibCheck", "--outDir", str(d)] + fichiers,
            capture_output=True, text=True, cwd=cls._dossier)
        if compile.returncode != 0:
            raise AssertionError("les fichiers du courriel ne compilent pas :\n"
                                 + compile.stdout + compile.stderr)
        lance = subprocess.run(["node", str(d / "scenario.js")],
                               capture_output=True, text=True, timeout=120)
        if lance.returncode != 0:
            raise AssertionError("le scénario a échoué :\n" + lance.stderr)
        cls.r = json.loads(lance.stdout.strip().splitlines()[-1])

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._dossier, ignore_errors=True)

    # --- 1. le code n'est jamais dans l'objet ------------------------------

    def test_aucun_objet_ne_porte_le_code(self):
        """L'objet s'affiche sur un écran verrouillé, au comptoir.

        « TOTEM : votre code 408 913 » a l'air serviable et livre la boutique à
        qui regarde par-dessus l'épaule. Aucune donnée de ce scénario ne
        contient de chiffres : un objet qui en porte trois d'affilée ne peut
        les tenir que du code.
        """
        self.assertTrue(self.r["messages"], "aucun message n'a été fabriqué")
        for m in self.r["messages"]:
            ou = f'{m["langue"]}/{m["genre"]}/{m["motif"]}'
            self.assertNotIn("408 913", m["objet"], f"le code est dans l'objet ({ou})")
            self.assertNotIn("408913", m["objet"], f"le code est dans l'objet ({ou})")
            self.assertIsNone(
                re.search(r"\d{3}", m["objet"]),
                f"l'objet porte des chiffres, donc peut-être le code ({ou}) : "
                f'« {m["objet"]} »')

    def test_chaque_objet_dit_quelque_chose(self):
        """Un objet vide, ou identique pour tout, ne se distingue pas d'un faux."""
        vus = set()
        for m in self.r["messages"]:
            self.assertTrue(m["objet"].strip(), "un objet est vide")
            vus.add((m["langue"], m["objet"]))
        # Cinq motifs de code + quatre autres genres, dans deux langues. Les
        # objets ne sont pas tous distincts par nature, mais la variété doit
        # exister : un seul objet pour tout signifierait qu'on ne nomme rien.
        self.assertGreater(len(vus), 10,
                           "les objets se ressemblent tous : ils ne nomment "
                           "ni l'appareil ni la raison")

    # --- 2. sans clé, on ne prétend pas ------------------------------------

    def test_sans_cle_la_fonction_ne_pretend_pas_avoir_envoye(self):
        """Le pire des cas serait de répondre « c'est parti » : la personne
        attendrait devant sa boîte un message qui n'a jamais existé."""
        self.assertFalse(self.r["sansCle"]["partie"])
        self.assertEqual(self.r["sansCle"]["issue"], "sans_cle")
        self.assertTrue(self.r["sansCle"]["dit"].strip(),
                        "l'échec ne dit rien à l'appelant")

    def test_l_echec_est_note_dans_le_journal(self):
        """Un déploiement sans clé se voit dans le journal, pas au téléphone."""
        lignes = [l for l in self.r["sansCleJournal"] if l["table"] == "courriels"]
        self.assertEqual(len(lignes), 1)
        self.assertEqual(lignes[0]["valeurs"]["issue"], "sans_cle")
        self.assertEqual(lignes[0]["valeurs"]["genre"], "code")

    def test_le_parcours_complet_remonte_l_echec(self):
        """« envoyerCode » ne doit pas jeter, ni annoncer un envoi."""
        self.assertFalse(self.r["prodParcours"]["envoye"])
        self.assertEqual(self.r["prodParcours"]["raison"], "courrier")
        self.assertEqual(self.r["prodParcours"]["issue"], "sans_cle")

    def test_un_fournisseur_qui_refuse_ou_qui_tombe_ne_casse_rien(self):
        """Une page qui casse au lieu d'afficher « réessayez » est pire que le
        message manquant."""
        self.assertFalse(self.r["refusee"]["partie"])
        self.assertEqual(self.r["refusee"]["issue"], "refusee")
        self.assertFalse(self.r["injoignable"]["partie"])
        self.assertEqual(self.r["injoignable"]["issue"], "injoignable")
        self.assertTrue(self.r["partie"]["partie"])
        self.assertEqual(self.r["partie"]["reference"], "ref-123")

    def test_ce_qui_part_chez_le_fournisseur_est_bien_le_message(self):
        envoye = self.r["partieEnvoye"]
        # L'espace du clavier et la majuscule du domaine partent ; ce qui
        # précède l'arobase est laissé intact, parce que certains hébergeurs y
        # distinguent vraiment les majuscules et que « corriger » enverrait le
        # message dans une boîte qui n'existe pas.
        self.assertEqual(envoye["to"], ["Jeanne@boutique.cm"],
                         "l'adresse n'est pas normalisée avant l'envoi")
        self.assertTrue(envoye["subject"])
        self.assertTrue(envoye["text"])
        self.assertTrue(envoye["html"])

    def test_une_adresse_qui_n_en_est_pas_une_n_appelle_pas_le_fournisseur(self):
        a = self.r["adresses"]
        self.assertTrue(a["bonne"])
        self.assertFalse(a["sansArobase"])
        self.assertFalse(a["sansPoint"])
        self.assertFalse(a["avecEspace"])
        self.assertFalse(a["vide"])

    # --- 3. le code en clair ne se journalise pas -------------------------

    def test_le_code_en_clair_n_est_ni_rendu_ni_journalise(self):
        """Le code n'est connu ici que par l'échappatoire de développement.

        C'est ce qui rend la vérification possible : on sait exactement quels
        six chiffres ont été tirés, et on peut affirmer qu'ils ne sont ni dans
        ce que la fonction rend, ni dans ce que la base a reçu.
        """
        code = self.r["codeVu"]
        self.assertIsNotNone(
            code, "sans clé et hors production, le message doit s'écrire en "
                  "console — sinon le développement est bloqué")
        nu = code.replace(" ", "")
        for ou, contenu in (("ce que rend envoyerCode", self.r["parcoursJson"]),
                            ("le journal", self.r["parcoursJournal"])):
            self.assertNotIn(code, contenu, f"le code en clair est dans {ou}")
            self.assertNotIn(nu, contenu, f"le code en clair est dans {ou}")

    def test_en_production_la_console_ne_dit_jamais_le_code(self):
        """Le journal d'un hébergeur se lit par bien plus de monde qu'on ne
        l'imagine, et six chiffres qui y traînent ouvrent une boutique."""
        console = self.r["prodConsole"]
        self.assertIsNone(
            re.search(r"\d{3}\s?\d{3}", console),
            f"six chiffres sont apparus dans la console en production : {console!r}")
        self.assertNotIn("Six chiffres", console)
        self.assertNotIn("Six digits", console)

    def test_en_production_le_journal_ne_porte_aucun_chiffre(self):
        """La table « courriels » n'a aucune colonne pour le contenu. Elle ne
        doit donc jamais en recevoir par une autre porte."""
        self.assertIsNone(re.search(r"\d{3}\s?\d{3}", self.r["prodJournal"]),
                          "le journal des courriels porte six chiffres")

    def test_le_jeton_d_invitation_ne_survit_pas_au_message(self):
        """Même règle que le code : il naît, il entre dans le lien, il meurt.

        Une page qui le récupérerait finirait par l'afficher, le journaliser ou
        le renvoyer dans une réponse JSON — et le lien seul ouvre la porte du
        compte à créer.
        """
        jeton = self.r["jetonVu"]
        self.assertIsNotNone(jeton, "le lien d'invitation n'a pas été écrit")
        self.assertGreater(len(jeton), 20)
        self.assertNotIn(jeton, self.r["invitationJson"],
                         "le jeton en clair est rendu à l'appelant")
        self.assertNotIn(jeton, self.r["invitationJournal"],
                         "le jeton en clair est dans le journal")

    def test_le_message_parti_ne_laisse_aucun_contenu_dans_le_journal(self):
        for nom in ("refuseeJournal", "partieJournal"):
            self.assertNotIn("408 913", self.r[nom])
            self.assertNotIn("Six chiffres", self.r[nom])

    # --- 4. les deux langues ---------------------------------------------

    def test_les_deux_langues_ont_exactement_les_memes_cles(self):
        """Une clé oubliée en français rend « undefined » au milieu d'une
        phrase, dans la boîte mail de quelqu'un. Les arguments comptent aussi :
        une traduction qui en perd un casse la phrase sans casser la
        compilation."""
        self.assertEqual(self.r["formeEn"], self.r["formeFr"])

    # --- 5. les deux phrases obligatoires ---------------------------------

    def test_chaque_message_dit_quoi_faire_si_ce_n_etait_pas_vous(self):
        """Sans elle, un message d'alerte n'alerte de rien : il inquiète."""
        for m in self.r["messages"]:
            ou = f'{m["langue"]}/{m["genre"]}/{m["motif"]}'
            phrase = PAS_VOUS[m["langue"]]
            self.assertIn(phrase, m["texte"], f"phrase absente du texte ({ou})")
            self.assertIn(phrase, m["html"], f"phrase absente du HTML ({ou})")

    def test_chaque_message_rappelle_que_totem_ne_demande_jamais_le_pin(self):
        """C'est la personne qu'on hameçonne, pas la machine. Cette phrase est
        la seule protection qui tienne quand elle, s'est fait avoir."""
        for m in self.r["messages"]:
            ou = f'{m["langue"]}/{m["genre"]}/{m["motif"]}'
            phrase = PIN[m["langue"]]
            self.assertIn(phrase, m["texte"], f"le rappel du PIN manque ({ou})")
            self.assertIn(phrase, m["html"], f"le rappel du PIN manque ({ou})")

    # --- 6. jamais un code et un lien ensemble ----------------------------

    def test_le_message_qui_porte_le_code_ne_porte_aucun_lien(self):
        """Cette paire est la forme même de l'hameçonnage. La tenir séparée est
        ce qui rend le vrai message reconnaissable d'un faux."""
        for m in self.r["messages"]:
            if m["genre"] != "code":
                continue
            ou = f'{m["langue"]}/code/{m["motif"]}'
            self.assertNotIn("http", m["texte"], f"un lien dans le texte ({ou})")
            self.assertNotIn("<a ", m["html"], f"un lien dans le HTML ({ou})")
            self.assertNotIn("http", m["html"], f"un lien dans le HTML ({ou})")

    def test_le_message_qui_porte_un_lien_ne_porte_aucun_code(self):
        for m in self.r["messages"]:
            if m["genre"] == "code":
                continue
            ou = f'{m["langue"]}/{m["genre"]}'
            self.assertIsNone(re.search(r"\d{3}\s\d{3}", m["texte"]),
                              f"six chiffres dans un message à lien ({ou})")

    # --- Ce que le HTML n'a pas le droit d'avoir --------------------------

    def test_le_html_ne_suit_personne_et_se_lit_degrade(self):
        """Pas de pixel de suivi, pas d'image, pas de mise en page qui repose
        sur des images : le message doit rester entier une fois dégradé."""
        for m in self.r["messages"]:
            ou = f'{m["langue"]}/{m["genre"]}/{m["motif"]}'
            self.assertNotIn("<img", m["html"], f"une image dans le HTML ({ou})")
            self.assertNotIn("<table", m["html"], f"un tableau de mise en page ({ou})")
            self.assertNotIn("<script", m["html"], f"du script dans un courriel ({ou})")
            # Tout ce qui est écrit en texte doit se retrouver dans le HTML.
            for phrase in m["texte"].split("\n\n"):
                if "<" in phrase or "&" in phrase or '"' in phrase:
                    continue
                self.assertIn(phrase, m["html"],
                              f"le HTML a perdu une phrase du texte ({ou})")


if __name__ == "__main__":
    unittest.main()
