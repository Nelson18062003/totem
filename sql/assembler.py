#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Assembler « sql/tout.sql » — le fichier unique à coller dans Supabase.

POURQUOI IL EST ASSEMBLÉ ET NON ÉCRIT
Un onzième fichier écrit à la main aurait divergé des dix autres à la
migration suivante, et personne ne l'aurait vu : il n'est lu qu'une fois par
an, le jour d'une installation, quand il est trop tard pour s'en apercevoir.
Celui-ci est fabriqué à partir des sources, dans l'ordre qui fait foi
(« tests/migrations.py »), et « tests/test_sql_execute.py » échoue s'il n'est
plus à jour.

POURQUOI IL CONTIENT LE SCHÉMA *ET* LES MIGRATIONS
Ils ne servent pas au même moment, et on ne sait pas dans quel cas on est :

  · « schema.sql » crée tout sur une base NEUVE, et ne fait rien sur une base
    qui a déjà les tables — « create table if not exists » ne touche jamais
    une table existante, donc n'ajoute jamais une colonne ajoutée depuis.
  · Les migrations, elles, ajoutent ces colonnes, renomment ce qui a changé
    de nom, et ne créent rien qui existe déjà.

Les deux sont rejouables. Les enchaîner couvre donc les deux cas d'un seul
geste, et le prix est quelques instructions sans effet.

USAGE
    python3 sql/assembler.py
"""

import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SQL = RACINE / "sql"
SORTIE = SQL / "tout.sql"

sys.path.insert(0, str(RACINE / "tests"))
from migrations import MIGRATIONS  # noqa: E402

ENTETE = """-- ===========================================================================
-- TOTEM — TOUTE LA BASE, D'UN SEUL COUP
--
-- CE FICHIER NE S'ÉDITE PAS. Il est assemblé par « sql/assembler.py » à
-- partir de « sql/schema.sql » et des migrations, dans l'ordre qui fait foi.
-- Le modifier à la main serait perdu au prochain assemblage, et
-- « tests/test_sql_execute.py » le refuserait.
--
-- ---------------------------------------------------------------------------
-- COMMENT S'EN SERVIR
--
--   1. Supabase → votre projet → « SQL Editor » → « New query ».
--   2. Coller TOUT ce fichier.
--   3. « Run ».
--   4. Relancer une seconde fois. Il ne doit y avoir AUCUNE erreur rouge.
--      C'est cette seconde exécution qui prouve que le fichier est rejouable —
--      et donc qu'il pourra être relancé sans crainte le jour d'un doute.
--
-- Des lignes « NOTICE » jaunes apparaîtront (« column already exists,
-- skipping »). Ce ne sont pas des erreurs : c'est le fichier qui constate que
-- le travail est déjà fait et passe au suivant.
--
-- ---------------------------------------------------------------------------
-- CE QUE ÇA FAIT À VOS DONNÉES
--
-- RIEN NE S'EFFACE. Aucune ligne n'est supprimée, aucune table n'est vidée,
-- aucune colonne existante n'est retirée. Le fichier ajoute des tables et des
-- colonnes, et renomme deux colonnes qui visaient un numéro de téléphone là
-- où elles visent maintenant une adresse mail — un renommage garde ce qu'il y
-- avait dedans.
--
-- Vérifié, et pas à la main : « tests/test_sql_execute.py » monte un
-- PostgreSQL 16 jetable, y met un terminal, une carte et une commande, déroule
-- ce fichier deux fois par-dessus, et vérifie que les trois lignes sont
-- toujours là.
--
-- ---------------------------------------------------------------------------
-- SI VOUS PARTEZ D'UNE BASE NEUVE, c'est le seul fichier à lancer.
-- SI VOTRE BASE EST DÉJÀ EN SERVICE, c'est aussi le seul fichier à lancer.
-- ===========================================================================

"""

SEPARATEUR = """

-- ===========================================================================
-- ⟨ {titre} ⟩
-- ===========================================================================

"""


def assembler() -> str:
    morceaux = [ENTETE]

    morceaux.append(SEPARATEUR.format(
        titre="LA STRUCTURE COMPLÈTE — pour une base neuve"))
    morceaux.append((SQL / "schema.sql").read_text(encoding="utf-8"))

    morceaux.append(SEPARATEUR.format(
        titre="LES MIGRATIONS — pour une base déjà en service"))
    for nom in MIGRATIONS:
        fichier = SQL / nom
        if not fichier.exists():
            continue
        morceaux.append(SEPARATEUR.format(titre=nom))
        morceaux.append(fichier.read_text(encoding="utf-8"))

    morceaux.append("""

-- ===========================================================================
-- C'EST FINI.
--
-- Relancez ce fichier une seconde fois : aucune erreur ne doit apparaître.
-- Ensuite, posez les variables d'environnement — elles sont listées dans
-- « docs/CLOUD.md », et sans elles le site répond 503 en nommant celle qui
-- manque.
-- ===========================================================================
""")
    return "".join(morceaux)


if __name__ == "__main__":
    texte = assembler()
    SORTIE.write_text(texte, encoding="utf-8")
    lignes = texte.count("\n")
    print(f"sql/tout.sql assemblé : {lignes} lignes, "
          f"{len([n for n in MIGRATIONS if (SQL / n).exists()])} migrations "
          "+ le schéma complet")
