# -*- coding: utf-8 -*-
"""Le schéma et sa migration disent-ils la même chose ?

Le dépôt tient deux fichiers SQL qui décrivent la même base : « schema.sql »
pour une base neuve, « migration-*.sql » pour une base déjà en service. Ils
sont censés dire la même chose — mais rien ne les y oblige, et une colonne
ajoutée d'un côté seulement produit exactement le bogue le plus coûteux qu'on
puisse avoir : une base de production à qui il manque une colonne, qui refuse
chaque insertion sans le dire clairement. C'est déjà arrivé une fois, avec
« expediteur », et les SMS avaient cessé de remonter.

Ce test relit les deux fichiers et compare. Il vérifie aussi les promesses
que le fichier d'identité écrit noir sur blanc dans son en-tête : aucun secret
en clair, et rien qui s'efface.
"""

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from migrations import chemins  # noqa: E402

SQL = Path(__file__).resolve().parent.parent / "sql"
SCHEMA = SQL / "schema.sql"
# La liste vit dans « tests/migrations.py » : deux tests en avaient chacun une
# copie, et les deux ont divergé.
MIGRATIONS = chemins()

# Les objets que la migration d'identité introduit. Écrits à la main, parce
# qu'une liste déduite des fichiers ne prouverait rien : elle serait juste par
# construction, même si les deux fichiers oubliaient la même table.
TABLES_IDENTITE = ["commerces", "personnes", "acces", "invitations",
                   "sessions", "preuves", "entrees", "codes_entree",
                   "cles", "defis"]


def tables_declarees(texte):
    """Les tables créées par un fichier, avec leur corps."""
    trouve = {}
    for m in re.finditer(
            r"create table if not exists (\w+)\s*\((.*?)\n\);", texte, re.S):
        trouve[m.group(1)] = m.group(2)
    return trouve


def colonnes(corps):
    """Les noms de colonnes d'un corps de table, commentaires exclus."""
    noms = []
    for ligne in corps.split("\n"):
        ligne = re.sub(r"--.*$", "", ligne).strip()
        if not ligne or ligne.startswith(("unique", "primary key", "check",
                                          "foreign key", "constraint")):
            continue
        m = re.match(r"(\w+)\s+\S", ligne)
        if m:
            noms.append(m.group(1))
    return noms


class SchemaEtMigration(unittest.TestCase):
    def setUp(self):
        self.schema = SCHEMA.read_text(encoding="utf-8")
        self.migration = "\n".join(m.read_text(encoding="utf-8") for m in MIGRATIONS)

    def test_les_deux_fichiers_declarent_les_memes_tables(self):
        ds, dm = tables_declarees(self.schema), tables_declarees(self.migration)
        for table in TABLES_IDENTITE:
            self.assertIn(table, dm, f"« {table} » manque à la migration")
            self.assertIn(table, ds, f"« {table} » manque à schema.sql")

    def test_les_deux_fichiers_declarent_les_memes_colonnes(self):
        ds, dm = tables_declarees(self.schema), tables_declarees(self.migration)
        for table in TABLES_IDENTITE:
            self.assertEqual(
                colonnes(ds[table]), colonnes(dm[table]),
                f"« {table} » n'a pas les mêmes colonnes des deux côtés — "
                "c'est ainsi qu'une base de production se retrouve sans une "
                "colonne et refuse chaque insertion en silence")

    def test_la_colonne_qui_dit_qui_a_appuye_existe(self):
        """Sans elle, le contrôle d'accès est un décor : on ne peut ni
        confondre quelqu'un, ni le disculper."""
        for nom, texte in (("schema.sql", self.schema),
                           ("migration", self.migration)):
            self.assertRegex(
                texte,
                r"alter table commandes add column if not exists demandee_par",
                f"« commandes.demandee_par » manque à {nom}")

    def test_aucun_secret_n_est_stocke_en_clair(self):
        """La base garde des empreintes : elle vérifie, elle ne révèle pas.

        Une copie de la base — une sauvegarde qui traîne, un accès de trop —
        ne doit rouvrir aucune porte.
        """
        dm = tables_declarees(self.migration)
        interdits = re.compile(
            r"^(jeton|secret|mot_de_passe|code|cle_privee|pin)$")
        for table, corps in dm.items():
            for col in colonnes(corps):
                self.assertIsNone(
                    interdits.match(col),
                    f"« {table}.{col} » a le nom d'un secret en clair ; "
                    "la base ne doit garder qu'une empreinte")

    def test_les_tables_d_identite_sont_fermees(self):
        """Sans politique, une clé publique ne lit rien. C'est le bon défaut
        pour des tables qui portent des empreintes et des numéros."""
        for table in TABLES_IDENTITE:
            # Deux façons d'activer la sécurité, et elles se valent : la table
            # citée dans la boucle « foreach », ou son propre « alter table ».
            # Le test vérifie l'EFFET, pas la syntaxe — sans quoi il refuserait
            # un fichier parfaitement correct écrit dans l'autre style.
            dans_la_boucle = f"'{table}'" in self.migration
            en_direct = re.search(
                rf"alter table {table} enable row level security", self.migration)
            self.assertTrue(
                dans_la_boucle or en_direct,
                f"« {table} » n'a pas la sécurité par ligne activée")
        self.assertIn("enable row level security", self.migration)

    def test_retirer_un_acces_se_date_au_lieu_de_supprimer(self):
        """Un employé qui part fâché est exactement le moment où l'historique
        doit rester entier."""
        dm = tables_declarees(self.migration)
        self.assertIn("retire_le", colonnes(dm["acces"]))
        self.assertIn("revoquee_le", colonnes(dm["sessions"]))
        # Et les clés étrangères des tables d'identité ne cascadent pas :
        # supprimer une personne ne doit pas emporter ce qu'elle a fait.
        for table in ("acces", "sessions", "preuves"):
            self.assertNotIn(
                "on delete cascade", dm[table],
                f"« {table} » efface en cascade — l'historique doit survivre "
                "au départ d'une personne")

    def test_les_quatre_roles_sont_les_memes_partout(self):
        """Un rôle ajouté d'un côté seulement passerait la contrainte ici et
        échouerait là-bas."""
        roles = set()
        for m in re.finditer(r"role\s+text not null check \(role in \(([^)]+)\)\)",
                             self.migration):
            roles.add(tuple(sorted(re.findall(r"'(\w+)'", m.group(1)))))
        self.assertEqual(
            len(roles), 1,
            f"les listes de rôles diffèrent d'une table à l'autre : {roles}")
        self.assertEqual(
            roles.pop(),
            ("admin", "lecteur", "operateur", "proprietaire"))


if __name__ == "__main__":
    unittest.main()
