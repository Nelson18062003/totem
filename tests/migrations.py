# -*- coding: utf-8 -*-
"""L'ordre des migrations, écrit une seule fois.

POURQUOI CE FICHIER EXISTE
Deux tests ont besoin de cette liste : celui qui les EXÉCUTE sur un vrai
PostgreSQL, et celui qui vérifie que « schema.sql » et les migrations disent
la même chose. Elle était écrite dans les deux, et les deux ont divergé — une
migration inscrite ici, oubliée là.

POURQUOI ELLE EST ÉCRITE À LA MAIN, ET PAS DÉDUITE DU DOSSIER
L'ordre ne peut pas se deviner. « migration-cles.sql » référence la table
« personnes », posée par « migration-identite.sql » ; l'ordre alphabétique les
inverserait et la migration échouerait sur une base neuve. Seule une liste
écrite dit la vérité.

CE QUI EMPÊCHE DE L'OUBLIER
« test_sql_execute.test_aucune_migration_n_est_oubliee » compare cette liste
au contenu réel du dossier, dans les deux sens. Ajouter un fichier oblige donc
à décider de sa place ici — au lieu de le laisser dormir sans être joué nulle
part, ce qui est exactement arrivé à trois d'entre elles.
"""

from pathlib import Path

SQL = Path(__file__).resolve().parent.parent / "sql"

MIGRATIONS = (
    # Les deux plus anciennes, antérieures à l'identité. Elles n'étaient
    # inscrites nulle part et n'ont donc jamais été exécutées par la batterie
    # depuis leur écriture — c'est le contrôle d'oubli qui les a trouvées.
    "migration-refonte-sms-et-audit.sql",  # amener une base en service à niveau
    "migration-lus-et-badge.sql",          # la pastille « N nouveaux »
    # L'identité vient avant tout le reste : les personnes, les commerces et
    # les accès sont référencés par presque toutes les tables qui suivent.
    "migration-identite.sql",
    "migration-code-entree.sql",  # les six chiffres par courriel
    "migration-cles.sql",         # le verrouillage du téléphone
    "migration-courriels.sql",    # le journal des messages envoyés
    "migration-papier.sql",       # les dix codes imprimés
    "migration-preferences.sql",  # ce que la personne veut recevoir
    "migration-console.sql",      # la supervision de la flotte
    "migration-plateforme.sql",   # le super-administrateur
)


def presentes():
    """Celles de la liste qui existent — le dossier grandit encore."""
    return [n for n in MIGRATIONS if (SQL / n).exists()]


def chemins():
    return [SQL / n for n in presentes()]
