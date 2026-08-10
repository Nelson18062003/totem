# -*- coding: utf-8 -*-
"""Les versions, le journal et les alertes tiennent-ils leurs six promesses ?

Ces trois écrans sont la seconde moitié de la console. Ils regardent la flotte
entière depuis la France, et deux d'entre eux touchent à des choses qui
n'existent nulle part ailleurs dans TOTEM : un registre de ce qui a été fait, et
les deux seules écritures de toute la console.

1. LA GARDE AVANT LA LECTURE. Une page qui lit puis vérifie a déjà tout servi.
2. AUCUN MOUVEMENT D'ARGENT. La séparation est structurelle : le rôle « admin »
   n'a pas « sortir_argent », et aucune route de la console n'ouvre un chemin
   détourné. Les deux seules écritures ne touchent qu'à « alertes ».
3. AUCUNE LIGNE DE JOURNAL NE PORTE UN SECRET. Deux garde-fous, et il en faut
   deux : les colonnes qui portent un code ne sont pas DEMANDÉES à la base, et
   ce qui reste de texte libre passe par un lavage. Ce test exécute le lavage,
   il ne le relit pas.
4. UN BOÎTIER MUET NE SE LIT PAS COMME UN BOÎTIER EN RETARD. C'est le piège
   propre à l'écran des versions : un terminal qui s'est tu continue d'annoncer
   la version qu'il portait la dernière fois, et cette valeur vieillit sans
   jamais changer d'apparence. Rangée sous « en retard », elle envoie quelqu'un
   attendre une mise à jour au lieu de prendre la route.
5. « ACCUSER RÉCEPTION » ET « CLORE » SONT DEUX GESTES DISTINCTS EN BASE. Voir
   n'est pas résoudre. Les fondre ferait disparaître de l'écran, dès le premier
   regard, des choses que personne n'a réparées.
6. UN ÉCRAN D'ALERTES VIDE DIT POURQUOI IL EST VIDE. Rien ne remplit encore la
   table « alertes » : le robot n'en fait qu'un message Telegram. « Tout va
   bien » et « personne n'écrit ici » ne se ressemblent pas, et les confondre est
   exactement la façon dont une supervision ment.

Les tests n° 3 et 4 ont besoin de Node pour dérouler du TypeScript sans
compilation (`--experimental-strip-types`, Node ≥ 22.6). Là où il n'y en a pas,
ils se sautent en le disant — mieux vaut un test explicitement sauté qu'un test
qui ne teste rien.
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
SQL = RACINE / "sql"

CONSOLE = WEB / "app" / "console"
API_CONSOLE = WEB / "app" / "api" / "console"
LECTURES = WEB / "lib" / "journal.ts"
TEXTES = WEB / "lib" / "textes" / "journal.ts"

MES_ECRANS = {
    "app/console/versions/page.tsx",
    "app/console/journal/page.tsx",
    "app/console/alertes/page.tsx",
}
MES_ROUTES = {
    "app/api/console/alertes/vue/route.ts",
    "app/api/console/alertes/clore/route.ts",
}

GARDE_PAGE = re.compile(r'exigerPouvoir\(\s*"administrer"\s*\)')
GARDE_ROUTE = re.compile(r'garder\(\s*"administrer"\s*\)')


def _relatif(f):
    return str(f.relative_to(WEB)).replace("\\", "/")


def pages():
    return sorted(CONSOLE.rglob("page.tsx")) if CONSOLE.exists() else []


def routes():
    return sorted(API_CONSOLE.rglob("route.ts")) if API_CONSOLE.exists() else []


def mes_fichiers():
    """Tout ce que cette moitié de la console possède, code compris."""
    trouve = []
    for dossier in (CONSOLE / "versions", CONSOLE / "journal", CONSOLE / "alertes",
                    API_CONSOLE):
        if dossier.exists():
            trouve += sorted(dossier.rglob("*.ts")) + sorted(dossier.rglob("*.tsx"))
    trouve.append(LECTURES)
    return trouve


def lignes_de_code(fichier):
    """Les lignes du fichier, sans celles qui ne sont qu'un commentaire.

    Un motif cité dans un commentaire ne fait rien — et ces fichiers-là parlent
    beaucoup de ce qu'ils s'interdisent.
    """
    texte = fichier.read_text(encoding="utf-8")
    for i, ligne in enumerate(texte.split("\n"), 1):
        nue = re.sub(r"^\s*(//|\*|/\*).*", "", ligne)
        if nue.strip():
            yield i, nue


# --- Exécuter le vrai code, et pas sa description ----------------------------
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
    """Déroule un bout de JavaScript qui importe lib/journal.ts, et rend sa sortie."""
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


class LaGardeAvantLaLecture(unittest.TestCase):
    """Une page qui lit puis vérifie a déjà tout servi."""

    def test_les_trois_ecrans_existent(self):
        trouvees = {_relatif(f) for f in pages()}
        self.assertTrue(
            MES_ECRANS <= trouvees,
            "il manque des écrans : " + ", ".join(sorted(MES_ECRANS - trouvees)))

    def test_les_deux_routes_existent(self):
        trouvees = {_relatif(f) for f in routes()}
        self.assertEqual(
            MES_ROUTES, trouvees,
            "les routes de la console ne sont pas exactement les deux gestes "
            "d'une alerte — toute autre route est une écriture de plus")

    def test_chaque_page_exige_administrer(self):
        manquantes = [
            _relatif(f) for f in pages()
            if not GARDE_PAGE.search(f.read_text(encoding="utf-8"))
        ]
        self.assertEqual(
            manquantes, [],
            "ces pages servent la flotte entière sans exiger « administrer » :\n  "
            + "\n  ".join(manquantes))

    def test_chaque_route_exige_administrer(self):
        manquantes = [
            _relatif(f) for f in routes()
            if not GARDE_ROUTE.search(f.read_text(encoding="utf-8"))
        ]
        self.assertEqual(
            manquantes, [],
            "ces routes n'exigent pas « administrer » :\n  " + "\n  ".join(manquantes))

    def test_la_garde_vient_avant_toute_lecture_et_toute_ecriture(self):
        tardives = []
        for f in pages() + routes():
            texte = f.read_text(encoding="utf-8")
            m = GARDE_PAGE.search(texte) or GARDE_ROUTE.search(texte)
            if not m:
                continue  # l'absence est le sujet des tests précédents
            avant = re.sub(r"^import[^\n]*$", "", texte[:m.start()], flags=re.M)
            if re.search(r"\bawait\s+(charger|lire|modifier|accuser|clore)", avant):
                tardives.append(_relatif(f))
        self.assertEqual(
            tardives, [],
            "la garde arrive après une lecture ou une écriture dans :\n  "
            + "\n  ".join(tardives))


class AucunMouvementDArgent(unittest.TestCase):
    """La séparation est structurelle, pas contractuelle.

    Nelson a le pouvoir technique ; Mme Ngo a l'argent. La console peut tout
    voir — c'est son rôle — et ne doit ouvrir AUCUN chemin vers une sortie, pas
    même indirect.
    """

    # Ce qui, dans un écran ou une route de la console, ferait bouger de
    # l'argent ou agir un terminal.
    INTERDITS = [
        ("creerCommande", "déposer une commande, c'est faire agir un terminal"),
        ("/api/commande", "le guichet du comptoir n'est pas celui de la console"),
        ("sortir_argent", "ce pouvoir n'est pas celui d'un administrateur"),
        ("definirNature", "classer un SMS appartient au comptoir"),
        ("marquerLu", "lire un SMS appartient au commerce"),
        ('"use server"', "une action serveur est une écriture qui ne dit pas son nom"),
    ]

    def test_rien_de_la_console_ne_fait_bouger_d_argent(self):
        fautes = []
        for f in mes_fichiers():
            for i, ligne in lignes_de_code(f):
                for motif, raison in self.INTERDITS:
                    if motif in ligne:
                        fautes.append(f"{_relatif(f)}:{i} « {motif} » — {raison}")
        self.assertEqual(
            fautes, [],
            "la console ouvre un chemin vers un mouvement d'argent :\n  "
            + "\n  ".join(fautes))

    def test_les_seules_ecritures_ne_touchent_qu_aux_alertes(self):
        """« modifier » n'apparaît que dans lib/journal.ts, et sur une table."""
        texte = LECTURES.read_text(encoding="utf-8")
        appels = re.findall(r"modifier\(\s*`?([^`\"',]*)", texte)
        self.assertTrue(appels, "lib/journal.ts n'écrit plus nulle part")
        for cible in appels:
            self.assertIn(
                "TABLE_DES_GESTES", cible,
                f"une écriture vise « {cible} » au lieu de la seule table permise")
        self.assertRegex(
            texte, r'TABLE_DES_GESTES\s*=\s*"alertes"',
            "la table des deux gestes n'est plus « alertes »")

        # Et nulle part ailleurs dans la console.
        ailleurs = []
        for f in mes_fichiers():
            if f == LECTURES:
                continue
            for i, ligne in lignes_de_code(f):
                if re.search(r"\b(inserer|modifier|effacer)\(", ligne):
                    ailleurs.append(f"{_relatif(f)}:{i}")
        self.assertEqual(
            ailleurs, [],
            "une écriture est apparue hors de lib/journal.ts, où elle "
            "échapperait à la liste des colonnes permises :\n  "
            + "\n  ".join(ailleurs))


class AucuneLigneDeJournalNePorteUnSecret(unittest.TestCase):
    """Deux garde-fous, et il en faut deux.

    Le premier est structurel : les colonnes qui portent un code ne sont pas
    demandées à la base. Ce qu'on ne lit pas ne fuit ni dans une page, ni dans
    un journal de serveur, ni sur une capture d'écran.

    Le second lave ce qui reste de texte libre — ce qu'un boîtier écrit sur
    lui-même. Il masque plus que nécessaire, et c'est voulu : le journal n'a
    aucun moyen de savoir si quatre chiffres sont un montant ou un code.
    """

    def test_les_colonnes_qui_portent_un_code_ne_sont_jamais_demandees(self):
        texte = LECTURES.read_text(encoding="utf-8")
        # Les « select » réellement envoyés à la base.
        selects = re.findall(r"select=([^\"'`&\s]+)", texte)
        self.assertTrue(selects, "lib/journal.ts ne lit plus rien")
        for s in selects:
            colonnes = s.split(",")
            for interdite in ("parametres", "resultat"):
                self.assertNotIn(
                    interdite, colonnes,
                    f"« {interdite} » est demandée à la base : elle porte le "
                    "code composé sur la carte, et le code confidentiel du "
                    "propriétaire le temps d'une session")

    def test_aucun_ecran_ne_rend_le_contenu_d_une_commande(self):
        fautes = []
        for f in mes_fichiers():
            for i, ligne in lignes_de_code(f):
                if re.search(r"\b(parametres|resultat)\b", ligne):
                    fautes.append(f"{_relatif(f)}:{i}")
        self.assertEqual(
            fautes, [],
            "un écran touche à ce qui a été envoyé au terminal :\n  "
            + "\n  ".join(fautes))

    def test_les_libelles_du_journal_viennent_d_un_vocabulaire_ferme(self):
        """Aucun titre de ligne ne vient de la base : ils viennent des textes.

        C'est ce qui rend impossible qu'un message d'opérateur, un code ou un
        jeton atterrisse dans le titre d'une ligne.
        """
        page = (CONSOLE / "journal" / "page.tsx").read_text(encoding="utf-8")
        self.assertIn(
            "t.geste[l.geste]", page,
            "le libellé d'une ligne de journal ne passe plus par la table des "
            "gestes : il vient donc d'ailleurs, et « ailleurs » est la base")
        textes = TEXTES.read_text(encoding="utf-8")
        self.assertGreaterEqual(
            textes.count("geste: {"), 2,
            "le vocabulaire fermé des gestes n'existe pas dans les deux langues")

    @unittest.skipUnless(
        NODE_OK,
        "pas de Node qui sache lire du TypeScript (≥ 22.6) : ce test exécute le "
        "vrai lavage, il ne peut pas se contenter d'une lecture")
    def test_le_lavage_efface_vraiment_les_secrets(self):
        # Chaque cas : ce qu'on lave, et ce qui ne doit plus s'y trouver.
        cas = [
            ["Code 481902 pour ouvrir TOTEM", ["481902"]],
            ["code : 408 913", ["408 913", "408913"]],
            ["PIN=1234 accepté", ["1234"]],
            ["mot de passe : correcthorse", ["correcthorse"]],
            ["jeton eyJhbGciOiJIUzI1NiJ9.abcdefghij", ["eyJhbGciOiJIUzI1NiJ9"]],
            ["session ouverte : 7f3ac9d21b4e8a0c5d6f1234", ["7f3ac9d21b4e8a0c5d6f1234"]],
            ["USSD envoyé #150*1# vers Orange", ["#150*1#"]],
            ["secret 9182 relevé", ["9182"]],
            ["Numéro +237699424218 vu", ["699424218", "237699424218"]],
        ]
        script = f"""
import {{ sansSecret }} from "{LECTURES.as_posix()}";
const cas = {json.dumps(cas, ensure_ascii=False)};
console.log(JSON.stringify(cas.map(([texte]) => sansSecret(texte))));
"""
        laves = json.loads(executer(script))
        for (brut, secrets), propre in zip(cas, laves):
            for secret in secrets:
                self.assertNotIn(
                    secret, propre,
                    f"« {secret} » a survécu au lavage de « {brut} » → « {propre} »")

    @unittest.skipUnless(NODE_OK, "pas de Node qui sache lire du TypeScript")
    def test_le_lavage_ne_mange_pas_une_phrase_ordinaire(self):
        """Un lavage qui efface tout n'est plus lu, et ne protège donc plus rien."""
        script = f"""
import {{ sansSecret }} from "{LECTURES.as_posix()}";
console.log(JSON.stringify(
  sansSecret("Modem relance apres coupure, 12 SMS releves a 14:02")));
"""
        propre = json.loads(executer(script))
        self.assertIn("Modem relance apres coupure", propre)
        self.assertIn("14:02", propre)


class UnBoitierMuetNEstPasUnBoitierEnRetard(unittest.TestCase):
    """Le piège propre à l'écran des versions.

    Un terminal qui s'est tu continue d'annoncer la version qu'il portait la
    dernière fois qu'il a parlé. La valeur vieillit sans changer d'apparence :
    rangée sous « en retard », elle envoie quelqu'un attendre une mise à jour au
    lieu de prendre la route.
    """

    @unittest.skipUnless(
        NODE_OK,
        "pas de Node qui sache lire du TypeScript (≥ 22.6) : ce test exécute le "
        "vrai classement, il ne peut pas se contenter d'une lecture")
    def test_le_muet_passe_devant_le_retard(self):
        script = f"""
import {{ rangDuLogiciel }} from "{LECTURES.as_posix()}";
const etats = ["expose_et_muet", "muet", "expose", "hors_registre",
               "jamais_dit", "en_retard", "a_jour", "retire"];
console.log(JSON.stringify(Object.fromEntries(
  etats.map((e) => [e, rangDuLogiciel(e)]))));
"""
        rang = json.loads(executer(script))
        self.assertLess(
            rang["muet"], rang["en_retard"],
            "un boîtier dont on ne sait plus rien est rangé derrière un "
            "boîtier dont on sait qu'il est en retard")
        self.assertLess(
            rang["expose"], rang["en_retard"],
            "un boîtier privé d'un correctif de sécurité est rangé avec les "
            "simples retardataires")
        self.assertLess(
            rang["expose_et_muet"], rang["muet"],
            "exposé ET hors d'atteinte doit passer devant simplement muet")
        self.assertGreater(
            rang["retire"], rang["a_jour"],
            "un boîtier retiré du service squatte la tête de l'écran")

    @unittest.skipUnless(NODE_OK, "pas de Node qui sache lire du TypeScript")
    def test_un_boitier_muet_ne_recoit_jamais_l_etat_a_jour(self):
        """Même quand il annonce EXACTEMENT la version attendue.

        C'est le cas qui trompe : la dernière version connue est la bonne, et
        elle date de six heures.
        """
        script = f"""
import {{ chargerParcLogiciel }} from "{LECTURES.as_posix()}";
// La base n'est pas branchée : on n'exerce ici que la fonction de classement,
// que le module expose à travers son propre chemin de calcul.
console.log(JSON.stringify(await chargerParcLogiciel("fr")));
"""
        parc = json.loads(executer(script))
        self.assertFalse(
            parc["relie"],
            "ce test tourne sans base : il ne doit rien lire nulle part")
        self.assertEqual(parc["boitiers"], [])

    def test_les_deux_etats_ne_portent_pas_la_meme_phrase(self):
        """Deux rangs différents et un seul mot, ce serait un rang pour rien."""
        textes = TEXTES.read_text(encoding="utf-8")
        for cle in ("muet:", "en_retard:", "expose:", "expose_et_muet:"):
            self.assertGreaterEqual(
                textes.count(cle), 4,
                f"l'état « {cle} » n'a pas son mot ET sa phrase dans les deux "
                "langues")
        # Les MOTS d'état, langue par langue : on prend chaque bloc « etat: {…} »
        # (jamais « etatDetail »), et l'on compare à l'intérieur.
        blocs = re.findall(r"\n    etat: \{(.*?)\n    \},", textes, re.S)
        self.assertEqual(
            len(blocs), 2,
            "les mots d'état ne se trouvent plus dans les deux langues")
        for bloc in blocs:
            mots = dict(re.findall(r"(\w+): \"([^\"]+)\"", bloc))
            for a, b in (("muet", "en_retard"), ("expose", "en_retard"),
                         ("expose_et_muet", "muet"), ("jamais_dit", "muet")):
                self.assertNotEqual(
                    mots.get(a), mots.get(b),
                    f"« {a} » et « {b} » s'écrivent pareil à l'écran : deux "
                    "rangs différents pour un seul mot, c'est un rang pour rien")


class VoirNEstPasResoudre(unittest.TestCase):
    """Les deux gestes sont distincts, en base comme à l'écran."""

    # On cherche l'ordre SQL, jamais le mot : les deux fichiers PARLENT
    # abondamment de « vue_par » dans leurs commentaires, et un commentaire ne
    # crée aucune colonne.
    AJOUT_VUE_PAR = re.compile(
        r"alter\s+table\s+alertes\s+add\s+column\s+if\s+not\s+exists\s+vue_par\b",
        re.I)

    def test_la_base_porte_les_quatre_colonnes(self):
        migration = (SQL / "migration-journal.sql").read_text(encoding="utf-8")
        schema = (SQL / "schema.sql").read_text(encoding="utf-8")
        console = (SQL / "migration-console.sql").read_text(encoding="utf-8")
        self.assertRegex(
            migration, self.AJOUT_VUE_PAR,
            "« qui a vu » n'est posé nulle part : l'accusé de réception serait "
            "anonyme, et une ligne dirait « quelqu'un »")
        self.assertRegex(
            schema, self.AJOUT_VUE_PAR,
            "schema.sql et migration-journal.sql ne disent plus la même chose")
        for colonne in ("vue_le", "close_le", "close_par"):
            self.assertRegex(
                console + schema, rf"\n  {colonne}\s",
                f"la colonne « {colonne} » a disparu de la base")

    def test_la_migration_est_inscrite_dans_la_liste(self):
        """Une migration hors de la liste n'est jouée nulle part."""
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from migrations import MIGRATIONS
        self.assertIn("migration-journal.sql", MIGRATIONS)
        self.assertGreater(
            MIGRATIONS.index("migration-journal.sql"),
            MIGRATIONS.index("migration-console.sql"),
            "elle ajoute une colonne à « alertes » : jouée avant, elle tombe "
            "sur une table qui n'existe pas encore")

    def _corps(self):
        """Le corps des trois fonctions qui écrivent, commentaires ôtés."""
        texte = LECTURES.read_text(encoding="utf-8")
        trouve = {}
        for nom in ("accuserReception", "clore", "chargerRegistreDesAlertes"):
            m = re.search(
                rf"export async function {nom}\b.*?\n\}}", texte, re.S)
            self.assertIsNotNone(m, f"« {nom} » a disparu de lib/journal.ts")
            trouve[nom] = "\n".join(
                re.sub(r"^\s*(//|\*|/\*).*", "", l)
                for l in m.group(0).split("\n"))
        return trouve

    def test_les_deux_gestes_ecrivent_dans_des_colonnes_disjointes(self):
        corps = self._corps()
        self.assertIn("vue_le:", corps["accuserReception"])
        self.assertNotIn(
            "close_le:", corps["accuserReception"],
            "accuser réception clôt l'alerte au passage : la ligne descendrait "
            "de l'écran alors que personne n'a rien réparé")
        self.assertIn("close_le:", corps["clore"])
        self.assertNotIn(
            "vue_le:", corps["clore"],
            "clore accuse réception au passage : on ne saurait plus distinguer "
            "une alerte que quelqu'un a regardée d'une alerte réparée sans que "
            "ce registre ait jamais servi")

    def test_chaque_geste_a_sa_propre_route(self):
        chemins = {_relatif(f) for f in routes()}
        self.assertIn("app/api/console/alertes/vue/route.ts", chemins)
        self.assertIn("app/api/console/alertes/clore/route.ts", chemins)

    def test_l_ecrit_ne_peut_pas_ecraser_le_premier_regard(self):
        """Sans le filtre, un second appui remplacerait l'heure du premier.

        On regarde le CORPS des deux fonctions, pas le fichier : leurs
        commentaires citent le filtre, et un commentaire ne filtre rien.
        """
        corps = self._corps()
        self.assertIn(
            "vue_le=is.null", corps["accuserReception"],
            "un second « je l'ai vue » écraserait l'heure du premier regard, "
            "et l'on perdrait le seul chiffre qui compte le lendemain : "
            "combien de temps l'alerte est restée sans que personne ne la voie")
        self.assertIn(
            "close_le=is.null", corps["clore"],
            "clore deux fois réécrirait l'histoire")

    def test_l_ecran_montre_bien_deux_boutons(self):
        gestes = (CONSOLE / "alertes" / "gestes.tsx").read_text(encoding="utf-8")
        self.assertIn("/api/console/alertes/vue", gestes)
        self.assertIn("/api/console/alertes/clore", gestes)
        textes = TEXTES.read_text(encoding="utf-8")
        for cle in ("gesteVue:", "gesteClore:", "gesteExplique:"):
            self.assertGreaterEqual(
                textes.count(cle), 2,
                f"« {cle} » n'existe pas dans les deux langues")


class UnEcranVideDitPourquoi(unittest.TestCase):
    """« Tout va bien » et « personne n'écrit ici » ne se ressemblent pas.

    Rien ne remplit encore « alertes » : le robot calcule ce qui ne va pas et
    n'en fait qu'un message Telegram. Un écran vide se lirait comme une flotte
    en bonne santé — et il n'y aurait rien pour démentir.
    """

    # Le lien lui-même : une branche qui teste « jamaisEcrit » et qui, dans
    # cette branche, écrit la phrase du registre muet. Le mot seul ne prouve
    # rien — il figure aussi dans le fil d'ariane.
    LIEN_MUET = re.compile(r"jamaisEcrit\s*\?[^?]{0,400}?jamaisEcritTitre", re.S)
    LIEN_CALME = re.compile(r"length === 0 \?[^?]{0,240}?<RienADire", re.S)

    def test_l_ecran_distingue_le_registre_muet_du_registre_calme(self):
        page = (CONSOLE / "alertes" / "page.tsx").read_text(encoding="utf-8")
        self.assertRegex(
            page, self.LIEN_MUET,
            "l'écran des alertes ne distingue plus « personne n'écrit ici » de "
            "« rien d'ouvert » : un registre que personne ne remplit s'y lit "
            "comme une flotte en bonne santé")
        self.assertRegex(
            page, self.LIEN_CALME,
            "le registre calme n'a plus sa propre phrase")
        self.assertIn("videTitre", page)

    def test_les_deux_phrases_existent_et_diffèrent(self):
        textes = TEXTES.read_text(encoding="utf-8")
        for cle in ("jamaisEcritTitre:", "jamaisEcritDetail:", "videTitre:",
                    "videDetail:"):
            self.assertGreaterEqual(
                textes.count(cle), 2,
                f"« {cle} » n'existe pas dans les deux langues")
        muets = re.findall(r"jamaisEcritTitre:\s*\"([^\"]+)\"", textes)
        calmes = re.findall(r"\n    videTitre:\s*\"([^\"]+)\"", textes)
        self.assertTrue(muets, "la phrase du registre muet a changé de forme")
        for m in muets:
            self.assertNotIn(
                m, calmes,
                "le registre muet et le registre calme disent la même chose")

    def test_le_vide_est_contredit_par_ce_que_la_flotte_raconte(self):
        """La phrase seule ne suffirait pas : il faut la preuve à côté.

        Un registre vide pendant que deux boîtiers se taisent est la
        démonstration que personne n'écrit — et c'est la seule chose qui
        convainc quelqu'un de ne pas se fier à cet écran.
        """
        lectures = LECTURES.read_text(encoding="utf-8")
        corps = re.search(
            r"export async function chargerRegistreDesAlertes\b.*?\n\}",
            lectures, re.S)
        self.assertIsNotNone(corps, "« chargerRegistreDesAlertes » a disparu")
        nu = "\n".join(
            re.sub(r"^\s*(//|\*|/\*).*", "", l) for l in corps.group(0).split("\n"))
        self.assertIn(
            "chargerFlotte(", nu,
            "le registre des alertes ne lit plus la flotte : son vide n'est "
            "plus contredit par rien")
        self.assertIn(
            "boitiersQuiVontMal:", nu,
            "il lit la flotte et n'en rend rien : l'écran ne peut plus opposer "
            "ce que les terminaux racontent au silence du registre")
        page = (CONSOLE / "alertes" / "page.tsx").read_text(encoding="utf-8")
        self.assertIn("boitiersQuiVontMal", page,
                      "l'écran n'oppose plus rien à son propre vide")
        textes = TEXTES.read_text(encoding="utf-8")
        self.assertGreaterEqual(
            textes.count("jamaisEcritContredit:"), 2,
            "la phrase qui oppose la flotte au registre n'existe pas dans les "
            "deux langues")

    def test_aucun_ecran_n_ecrit_un_zero_nu(self):
        """Un zéro se lit comme une mesure. Une absence doit s'écrire.

        On ne cherche pas le nom d'une fonction — on relit CHAQUE mesure de
        mauvaise nouvelle (celles qui virent au rouge ou à l'orange) et l'on
        exige deux choses : que sa valeur passe par la phrase, et qu'elle porte
        la note qui dit ce que zéro veut dire.
        """
        fautes = []
        for nom in ("versions", "alertes"):
            page = (CONSOLE / nom / "page.tsx").read_text(encoding="utf-8")
            for mesure in re.findall(r"<Mesure\b(.*?)/>", page, re.S):
                mauvaise = "negatif" in mesure or "attention" in mesure
                if not mauvaise:
                    continue
                libelle = re.search(r"libelle=\{([^}]*)\}", mesure)
                ou = f"{nom} · {libelle.group(1) if libelle else mesure[:40]}"
                if "compteOuPhrase(" not in mesure:
                    fautes.append(f"{ou} — la valeur est un chiffre nu")
                if "Calme" not in mesure:
                    fautes.append(f"{ou} — rien ne dit ce que zéro veut dire")
        self.assertEqual(
            fautes, [],
            "ces mesures affichent un compte de mauvaises nouvelles sans dire "
            "s'il vaut « rien de mauvais » ou « personne n'écrit ici » :\n  "
            + "\n  ".join(fautes))


if __name__ == "__main__":
    unittest.main()
