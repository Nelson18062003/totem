# -*- coding: utf-8 -*-
"""Le SQL s'exécute-t-il vraiment, et deux fois de suite ?

Relire un fichier SQL ne prouve rien. « Rejouable » est une promesse que seul
PostgreSQL peut tenir ou démentir : une contrainte déjà posée, un index dont
la colonne n'existe pas encore, un « do $$ » mal fermé — rien de tout cela ne
se voit à l'œil, et tout se voit à l'exécution.

Ce test monte une base jetable, y déroule les deux chemins réels :

  · une base NEUVE, avec « schema.sql », trois fois de suite ;
  · une base DÉJÀ EN SERVICE avec des données, à qui l'on applique
    « migration-identite.sql », deux fois de suite.

et vérifie qu'aucune donnée n'a disparu au passage.

Il a besoin d'un PostgreSQL local. Là où il n'y en a pas, il se saute en le
disant — mieux vaut un test explicitement sauté qu'un test qui ne teste rien.

NOTE SUR LE RÔLE « authenticated » : c'est une construction de Supabase, pas
de PostgreSQL. Les politiques de sécurité du schéma le visent. On le crée donc
avant de dérouler les fichiers, exactement comme Supabase le fournit.
"""

import os
import shlex
import shutil
import subprocess
import unittest
from pathlib import Path

SQL = Path(__file__).resolve().parent.parent / "sql"
BASE_NEUVE = "totem_test_neuve"
BASE_SERVICE = "totem_test_service"


def _env():
    e = dict(os.environ)
    e.setdefault("PGUSER", "postgres")
    e.setdefault("PGDATABASE", "postgres")
    return e


def _essayer(prefixe):
    """Ce préfixe permet-il d'atteindre le serveur ?"""
    cmd = prefixe + ["psql", "-tAc", "select 1"] if not prefixe else \
        prefixe + [shlex.join(["psql", "-tAc", "select 1"])]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                           env=_env(), timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return r.returncode == 0 and r.stdout.strip() == "1"


def _trouver_prefixe():
    """Comment joindre PostgreSQL ici.

    En conteneur on est souvent root, et le serveur n'écoute que par socket
    avec l'authentification « peer » : root n'est alors pas « postgres » et se
    fait refouler. Il faut passer par « su postgres -c ». On essaie donc les
    deux, dans l'ordre du moins intrusif.
    """
    if not shutil.which("psql"):
        return None
    for prefixe in ([], ["su", "postgres", "-c"]):
        if _essayer(prefixe):
            return prefixe
    return None


PREFIXE = _trouver_prefixe()


def _lancer(args, base=None, fichier=None):
    cmd = ["psql", "-q", "-v", "ON_ERROR_STOP=1"]
    if base:
        cmd += ["-d", base]
    cmd += args
    if fichier:
        cmd += ["-f", str(fichier)]
    entier = cmd if not PREFIXE else PREFIXE + [shlex.join(cmd)]
    return subprocess.run(entier, capture_output=True, text=True, env=_env())


def _recreer(base):
    _lancer(["-c", f'drop database if exists "{base}"'])
    r = _lancer(["-c", f'create database "{base}"'])
    assert r.returncode == 0, r.stderr
    _lancer(["-c", "do $$ begin if not exists "
                   "(select 1 from pg_roles where rolname='authenticated') "
                   "then create role authenticated; end if; end $$;"], base=base)


@unittest.skipUnless(PREFIXE is not None,
                     "pas de PostgreSQL local : ce test vérifie l'exécution "
                     "réelle du SQL, il ne peut pas se contenter d'une lecture")
class SqlExecutable(unittest.TestCase):
    def _derouler(self, base, fichier, fois):
        for n in range(1, fois + 1):
            r = _lancer([], base=base, fichier=fichier)
            self.assertEqual(
                r.returncode, 0,
                f"« {fichier.name} », exécution {n} sur {fois} :\n{r.stderr}")

    def _valeur(self, base, requete):
        r = _lancer(["-tA", "-c", requete], base=base)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.strip()

    def test_une_base_neuve_supporte_trois_deroulements(self):
        """« Le script est rejouable : le relancer ne casse rien. »
        C'est écrit en tête de schema.sql ; ici on le prouve."""
        _recreer(BASE_NEUVE)
        self._derouler(BASE_NEUVE, SQL / "schema.sql", 3)
        tables = self._valeur(
            BASE_NEUVE,
            "select count(*) from information_schema.tables "
            "where table_schema='public'")
        self.assertGreaterEqual(int(tables), 14,
                                "des tables manquent après trois passages")

    def test_une_base_en_service_accepte_la_migration_sans_rien_perdre(self):
        """Le cas qui compte : une base qui contient déjà de l'argent tracé.

        On y met un terminal, une carte et une commande — puis on applique la
        migration deux fois. Les trois lignes doivent être exactement là au
        bout, et « commandes » doit avoir gagné la colonne qui dit qui a
        appuyé.
        """
        _recreer(BASE_SERVICE)
        # L'ancien schéma, sans les tables d'identité : on le reconstitue en
        # coupant schema.sql à l'endroit où cette section commence.
        entier = (SQL / "schema.sql").read_text(encoding="utf-8")
        marque = "-- L'IDENTITÉ — commerces, personnes"
        self.assertIn(marque, entier,
                      "la section d'identité n'est plus repérable dans "
                      "schema.sql — ce test ne sait plus reconstituer l'avant")
        avant = entier[:entier.index("-- " + "=" * 75 + "\n" + marque)] \
            if ("-- " + "=" * 75 + "\n" + marque) in entier \
            else entier[:entier.index(marque)].rsplit("-- =", 1)[0]
        ancien = Path("/tmp/totem-schema-avant.sql")
        ancien.write_text(avant, encoding="utf-8")
        self._derouler(BASE_SERVICE, ancien, 1)

        _lancer(["-c",
                 "insert into terminaux(id,nom) values('essai','Essai');"
                 "insert into cartes(terminal,iccid,libelle) "
                 "values('essai','8923701234567890123','Orange ··7715');"
                 "insert into commandes(terminal,type) values('essai','solde');"],
                base=BASE_SERVICE)

        self._derouler(BASE_SERVICE, SQL / "migration-identite.sql", 2)

        self.assertEqual(self._valeur(BASE_SERVICE, "select count(*) from terminaux"), "1")
        self.assertEqual(self._valeur(BASE_SERVICE, "select count(*) from cartes"), "1")
        self.assertEqual(self._valeur(BASE_SERVICE, "select count(*) from commandes"), "1")

        colonnes = self._valeur(
            BASE_SERVICE,
            "select string_agg(column_name,',' order by column_name) "
            "from information_schema.columns where table_name='commandes' "
            "and column_name in ('demandee_par','commerce')")
        self.assertEqual(colonnes, "commerce,demandee_par")

    def test_un_acces_retire_ne_disparait_pas(self):
        """La promesse « rien ne s'efface », vérifiée sur la vraie base."""
        _recreer(BASE_NEUVE)
        self._derouler(BASE_NEUVE, SQL / "schema.sql", 1)
        _lancer(["-c",
                 "insert into commerces(id,nom) values('essai','Essai');"
                 "insert into personnes(nom) values('J. Eyenga');"
                 "insert into acces(personne,commerce,role) "
                 "select id,'essai','operateur' from personnes limit 1;"
                 "update acces set retire_le=now();"], base=BASE_NEUVE)
        self.assertEqual(self._valeur(BASE_NEUVE, "select count(*) from acces"), "1",
                         "retirer un accès l'a supprimé au lieu de le dater")

    def test_supprimer_une_personne_est_refuse_tant_qu_elle_a_agi(self):
        """Un employé qui part fâché est le moment où l'historique doit
        rester entier — la base doit le refuser, pas nous."""
        _recreer(BASE_NEUVE)
        self._derouler(BASE_NEUVE, SQL / "schema.sql", 1)
        _lancer(["-c",
                 "insert into commerces(id,nom) values('essai','Essai');"
                 "insert into personnes(nom) values('J. Eyenga');"
                 "insert into acces(personne,commerce,role) "
                 "select id,'essai','operateur' from personnes limit 1;"],
                base=BASE_NEUVE)
        r = _lancer(["-c", "delete from personnes"], base=BASE_NEUVE)
        self.assertNotEqual(
            r.returncode, 0,
            "la base a laissé supprimer une personne qui a un accès — "
            "son passage au comptoir se serait effacé avec elle")


if __name__ == "__main__":
    unittest.main()
