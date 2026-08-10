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

import importlib
import os
import shlex
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

SQL = Path(__file__).resolve().parent.parent / "sql"
BASE_NEUVE = "totem_test_neuve"
BASE_SERVICE = "totem_test_service"

from migrations import MIGRATIONS, presentes  # noqa: E402


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

    def _ancien_schema(self):
        """La base telle qu'elle était AVANT l'identité, reconstituée.

        On coupe « schema.sql » là où la section d'identité commence : c'est
        la seule façon d'obtenir une base « déjà en service » fidèle sans
        garder une copie figée qui vieillirait de son côté.
        """
        entier = (SQL / "schema.sql").read_text(encoding="utf-8")
        marque = "-- L'IDENTITÉ — commerces, personnes"
        self.assertIn(marque, entier,
                      "la section d'identité n'est plus repérable dans "
                      "schema.sql — ce test ne sait plus reconstituer l'avant")
        entiere = "-- " + "=" * 75 + "\n" + marque
        avant = entier[:entier.index(entiere)] if entiere in entier \
            else entier[:entier.index(marque)].rsplit("-- =", 1)[0]
        ancien = Path("/tmp/totem-schema-avant.sql")
        ancien.write_text(avant, encoding="utf-8")
        return ancien

    def test_aucune_migration_n_est_oubliee(self):
        """Une migration non inscrite n'est jouée nulle part, et rien ne le dit.

        C'est le pire des silences : le fichier existe, il a l'air appliqué,
        et la base de production ne l'a jamais vu. Le test compare la liste
        au dossier — dans les deux sens.
        """
        sur_le_disque = sorted(f.name for f in SQL.glob("migration-*.sql"))
        oubliees = [n for n in sur_le_disque if n not in MIGRATIONS]
        self.assertEqual(
            oubliees, [],
            "ces migrations existent mais ne sont jouées par aucun test : "
            f"{oubliees}. Inscrivez-les dans MIGRATIONS, en tête de ce "
            "fichier, À LA BONNE PLACE — l'ordre compte, une table ne peut "
            "pas référencer ce qui n'existe pas encore.")
        fantomes = [n for n in MIGRATIONS if n not in sur_le_disque]
        self.assertEqual(
            fantomes, [],
            f"MIGRATIONS cite des fichiers qui n'existent pas : {fantomes}")

    def test_le_fichier_unique_est_a_jour(self):
        """« sql/tout.sql » est assemblé ; s'il a dérivé, il ment.

        C'est le seul fichier que le propriétaire colle dans Supabase. S'il ne
        contient plus ce que contiennent ses sources, l'installation qu'il
        produit n'est celle de personne — et rien ne le dirait, puisqu'il
        s'exécuterait sans erreur.
        """
        # On assemble EN MÉMOIRE et on compare. Relancer l'assembleur avant
        # de comparer aurait réparé le défaut qu'on cherche : le test aurait
        # passé quoi qu'il arrive. C'est ce qu'a fait sa première version.
        sys.path.insert(0, str(SQL))
        import assembler
        importlib.reload(assembler)
        attendu = assembler.assembler()
        self.assertTrue((SQL / "tout.sql").exists(),
                        "« sql/tout.sql » n'existe pas : lancez "
                        "« python3 sql/assembler.py »")
        self.assertEqual(
            (SQL / "tout.sql").read_text(encoding="utf-8"), attendu,
            "« sql/tout.sql » n'est plus à jour avec ses sources — c'est "
            "pourtant le seul fichier collé dans Supabase. Relancez "
            "« python3 sql/assembler.py » et commitez le résultat.")

    def test_le_fichier_unique_s_execute_sur_une_base_neuve(self):
        """Le geste réel du propriétaire : coller, lancer, relancer."""
        _recreer(BASE_NEUVE)
        self._derouler(BASE_NEUVE, SQL / "tout.sql", 2)
        tables = self._valeur(
            BASE_NEUVE,
            "select count(*) from information_schema.tables "
            "where table_schema='public'")
        self.assertGreaterEqual(int(tables), 16)

    def test_le_fichier_unique_ne_perd_rien_sur_une_base_en_service(self):
        """Le cas qui compte vraiment : sa base à lui, avec de l'argent tracé.

        On reconstitue l'ancien schéma, on y met un terminal, une carte et une
        commande, puis on colle le fichier unique deux fois. Les trois lignes
        doivent être là au bout.
        """
        _recreer(BASE_SERVICE)
        ancien = self._ancien_schema()
        self._derouler(BASE_SERVICE, ancien, 1)
        _lancer(["-c",
                 "insert into terminaux(id,nom) values('essai','Essai');"
                 "insert into cartes(terminal,iccid,libelle) "
                 "values('essai','8923701234567890123','Orange ··7715');"
                 "insert into commandes(terminal,type) values('essai','solde');"],
                base=BASE_SERVICE)
        self._derouler(BASE_SERVICE, SQL / "tout.sql", 2)
        for table in ("terminaux", "cartes", "commandes"):
            self.assertEqual(
                self._valeur(BASE_SERVICE, f"select count(*) from {table}"), "1",
                f"le fichier unique a perdu une ligne de « {table} »")

    def test_une_base_neuve_supporte_trois_deroulements(self):
        """« Le script est rejouable : le relancer ne casse rien. »
        C'est écrit en tête de schema.sql ; ici on le prouve."""
        _recreer(BASE_NEUVE)
        self._derouler(BASE_NEUVE, SQL / "schema.sql", 3)
        tables = self._valeur(
            BASE_NEUVE,
            "select count(*) from information_schema.tables "
            "where table_schema='public'")
        self.assertGreaterEqual(int(tables), 16,
                                "des tables manquent après trois passages")

    def test_une_base_en_service_accepte_la_migration_sans_rien_perdre(self):
        """Le cas qui compte : une base qui contient déjà de l'argent tracé.

        On y met un terminal, une carte et une commande — puis on applique la
        migration deux fois. Les trois lignes doivent être exactement là au
        bout, et « commandes » doit avoir gagné la colonne qui dit qui a
        appuyé.
        """
        _recreer(BASE_SERVICE)
        self._derouler(BASE_SERVICE, self._ancien_schema(), 1)

        _lancer(["-c",
                 "insert into terminaux(id,nom) values('essai','Essai');"
                 "insert into cartes(terminal,iccid,libelle) "
                 "values('essai','8923701234567890123','Orange ··7715');"
                 "insert into commandes(terminal,type) values('essai','solde');"],
                base=BASE_SERVICE)

        # Les deux migrations, dans l'ordre où on les déroulera vraiment,
        # deux fois chacune : c'est la seule preuve qu'elles sont rejouables.
        for nom in presentes():
            self._derouler(BASE_SERVICE, SQL / nom, 2)

        self.assertEqual(self._valeur(BASE_SERVICE, "select count(*) from terminaux"), "1")
        self.assertEqual(self._valeur(BASE_SERVICE, "select count(*) from cartes"), "1")
        self.assertEqual(self._valeur(BASE_SERVICE, "select count(*) from commandes"), "1")

        colonnes = self._valeur(
            BASE_SERVICE,
            "select string_agg(column_name,',' order by column_name) "
            "from information_schema.columns where table_name='commandes' "
            "and column_name in ('demandee_par','commerce')")
        self.assertEqual(colonnes, "commerce,demandee_par")

    def test_une_base_qui_visait_le_numero_bascule_sur_l_adresse(self):
        """Le cas de la base déjà migrée une première fois.

        La première version de « migration-identite.sql » posait un numéro de
        téléphone sur les invitations ; on a basculé sur l'adresse mail. Une
        base qui a déroulé l'ancienne version doit se retrouver avec UNE
        colonne « courriel » portant les données de l'ancienne — pas avec deux
        colonnes dont l'une est vide, ce qui est la façon la plus discrète de
        perdre une invitation.
        """
        _recreer(BASE_SERVICE)
        self._derouler(BASE_SERVICE, SQL / "schema.sql", 1)
        # On remet la base dans l'état d'AVANT la bascule, tel qu'il existait :
        # les colonnes s'appelaient « telephone », et « personnes » ne savait
        # pas encore dater la preuve d'une adresse.
        _lancer(["-c",
                 "alter table invitations rename column courriel to telephone;"
                 "alter table codes_entree rename column courriel to telephone;"
                 "alter table personnes drop column courriel_prouve_le;"],
                base=BASE_SERVICE)
        _lancer(["-c",
                 "insert into commerces(id,nom) values('essai','Essai');"
                 "insert into invitations"
                 "(jeton_empreinte,commerce,role,nom,telephone,expire_le) "
                 "values('abc','essai','operateur','J. Eyenga',"
                 "'+237699424218',now()+interval '7 days');"],
                base=BASE_SERVICE)

        for nom in presentes():
            self._derouler(BASE_SERVICE, SQL / nom, 2)

        for table in ("invitations", "codes_entree"):
            colonnes = self._valeur(
                BASE_SERVICE,
                "select string_agg(column_name,',' order by column_name) "
                f"from information_schema.columns where table_name='{table}' "
                "and column_name in ('telephone','courriel')")
            self.assertEqual(
                colonnes, "courriel",
                f"« {table} » n'a pas basculé proprement : la migration a "
                "laissé les deux colonnes, ou n'a rien renommé du tout")

        self.assertEqual(
            self._valeur(BASE_SERVICE,
                         "select courriel from invitations where jeton_empreinte='abc'"),
            "+237699424218",
            "le renommage a perdu ce que la colonne contenait")

        # Et la colonne AJOUTÉE depuis doit être revenue. « create table if
        # not exists » ne l'aurait pas posée : sur une table déjà là, il ne
        # fait rien du tout.
        self.assertEqual(
            self._valeur(BASE_SERVICE,
                         "select count(*) from information_schema.columns "
                         "where table_name='personnes' "
                         "and column_name='courriel_prouve_le'"),
            "1",
            "« personnes.courriel_prouve_le » manque après la migration : "
            "une base déjà en service ne gagne pas les colonnes ajoutées "
            "depuis, et chaque écriture y échouera sans rien dire")

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
