#!/bin/sh
# LES RÈGLES DE LA BASE, ÉPROUVÉES CONTRE UN VRAI POSTGRESQL.
#
#     sh sql/verifier-les-regles.sh
#
# POURQUOI CE FICHIER EXISTE. Les règles les plus importantes de TOTEM ne sont
# pas dans le code : elles sont dans la BASE. « Il n'y a qu'un propriétaire »,
# « le propriétaire ne s'efface pas », « personne ne lit la base en direct » —
# ce sont des index, des déclencheurs, des règles de ligne. Elles ont été
# écrites, relues, et jamais EXÉCUTÉES : tous les harnais de la plateforme
# parlent à `faux-nuage.mjs`, une imitation de Supabase écrite ici même. Une
# imitation ne peut pas prendre en défaut le SQL qu'elle n'exécute pas.
#
# Ce script monte un PostgreSQL neuf, y joue le schéma et toutes les
# migrations, puis ATTAQUE les règles : il essaie vraiment de créer un second
# propriétaire, de supprimer le premier, de promouvoir un invité. Il exige un
# refus à chaque fois — et il exige que ce qui doit marcher marche encore
# (supprimer un invité, transmettre la maison).
#
# « Le déclencheur est créé » ne dit rien de ce qu'il fait.
#
# Il ne touche à AUCUNE base réelle : il fabrique la sienne dans un dossier
# temporaire, sur un port à lui, et la détruit en partant.

set -eu

PORT=5455
GRAPPE=/var/lib/postgresql/totem-verification
JOURNAL=/tmp/totem-verification.log

# Postgres refuse de s'exécuter en root. Selon qui lance ce script, on passe
# ou non par l'utilisateur « postgres ».
if [ "$(id -u)" = "0" ]; then
  COMME="su postgres -c"
else
  COMME="sh -c"
fi

for chemin in /usr/lib/postgresql/*/bin /usr/local/pgsql/bin; do
  [ -x "$chemin/initdb" ] && PATH="$chemin:$PATH" && break
done
export PATH

if ! command -v initdb >/dev/null 2>&1; then
  echo "✗ PostgreSQL n'est pas installé ici : rien ne peut être éprouvé."
  echo "  Sur Debian ou Ubuntu : apt-get install postgresql"
  exit 1
fi

# UNE GRAPPE RESTÉE OUVERTE FERAIT PASSER CES VÉRIFICATIONS CONTRE UN VIEUX
# SCHÉMA. Le même piège que pour les harnais de la plateforme.
if pg_isready -h /tmp -p "$PORT" >/dev/null 2>&1; then
  echo "✗ Un PostgreSQL écoute déjà sur le port $PORT."
  echo "  Ces vérifications porteraient sur SA base, pas sur le schéma d'ici."
  exit 1
fi

# LE PATH DOIT VOYAGER JUSQU'ICI. Sans lui, `su postgres` ne trouve pas
# pg_ctl, l'arrêt échoue en silence, et la grappe SURVIT au script — le
# prochain essai mesurerait alors un vieux schéma. C'est arrivé en écrivant
# ce fichier : la garde du port l'a rattrapé, et c'est à cela qu'elle sert.
nettoyer() {
  $COMME "PATH='$PATH' pg_ctl -D $GRAPPE stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$GRAPPE"
}
trap nettoyer EXIT

echo ""
echo "Une base neuve, sur le port $PORT…"
rm -rf "$GRAPPE"
mkdir -p "$GRAPPE"
[ "$(id -u)" = "0" ] && chown postgres:postgres "$GRAPPE"
chmod 700 "$GRAPPE"
$COMME "PATH='$PATH' initdb -D $GRAPPE -U totem --auth=trust" >/dev/null 2>&1
$COMME "PATH='$PATH' pg_ctl -D $GRAPPE -o '-p $PORT -k /tmp' -l $JOURNAL start" >/dev/null 2>&1

for _ in 1 2 3 4 5 6 7 8 9 10; do
  pg_isready -h /tmp -p "$PORT" >/dev/null 2>&1 && break
  sleep 1
done

P="psql -h /tmp -p $PORT -U totem -v ON_ERROR_STOP=1 -q"
# Un schéma idempotent annonce chaque colonne déjà là. Ces avis noient
# la seule chose qu'on veut lire ici : ce qui a été refusé, et ce qui ne
# l'a pas été.
PGOPTIONS="-c client_min_messages=warning"; export PGOPTIONS
$P -d postgres -c "create database totem;"

# Les rôles que Supabase gère lui-même. Sans eux, les migrations d'origine
# s'arrêtent sur « role "authenticated" does not exist » — et l'on n'éprouve
# alors qu'une partie du chemin. Une imitation utile imite AUSSI le décor.
$P -d totem -c "
  do \$\$ begin
    create role anon nologin;          exception when duplicate_object then null; end \$\$;
  do \$\$ begin
    create role authenticated nologin; exception when duplicate_object then null; end \$\$;
  do \$\$ begin
    create role service_role nologin;  exception when duplicate_object then null; end \$\$;"

echo "Le schéma, puis les migrations, dans l'ordre…"
$P -d totem -f sql/schema.sql >/dev/null
for m in migrations/*.sql; do
  $P -d totem -f "$m" >/dev/null
  echo "  ✓ $(basename "$m")"
done

# ---------------------------------------------------------------------------
# L'ATTAQUE. Chaque essai doit être refusé — ou réussir, quand c'est écrit.
# ---------------------------------------------------------------------------
echo ""
echo "Ce que la base doit REFUSER"

echecs=0
# refuser « ce que ça fait » « le SQL »
refuser() {
  if $P -d totem -c "$2" >/dev/null 2>&1; then
    echo "  ✗ $1 — LA BASE A ACCEPTÉ"
    echecs=$((echecs + 1))
  else
    echo "  ✓ $1"
  fi
}
accepter() {
  if $P -d totem -c "$2" >/dev/null 2>&1; then
    echo "  ✓ $1"
  else
    echo "  ✗ $1 — LA BASE A REFUSÉ"
    echecs=$((echecs + 1))
  fi
}

$P -d totem -c "
  insert into utilisateurs(courriel, empreinte, role, approuve)
    values ('proprio@essai.cm', 'pbkdf2\$…', 'proprietaire', true),
           ('invite@essai.cm',  'pbkdf2\$…', 'invite', true);"

refuser "un second propriétaire à l'inscription" \
  "insert into utilisateurs(courriel, empreinte, role, approuve)
     values ('intrus@essai.cm', 'x', 'proprietaire', true);"

refuser "un invité promu en second propriétaire" \
  "update utilisateurs set role = 'proprietaire' where courriel = 'invite@essai.cm';"

refuser "la suppression du propriétaire" \
  "delete from utilisateurs where role = 'proprietaire';"

refuser "deux comptes pour le même courriel" \
  "insert into utilisateurs(courriel, empreinte, role, approuve)
     values ('proprio@essai.cm', 'x', 'invite', true);"

echo ""
echo "Ce que la base doit ACCEPTER"

accepter "supprimer un invité" \
  "delete from utilisateurs where courriel = 'invite@essai.cm';"

# Transmettre la maison : on rétrograde, puis on promeut. Le déclencheur ne
# parle que des SUPPRESSIONS — une transmission ne supprime rien.
accepter "transmettre la maison à quelqu'un d'autre" \
  "insert into utilisateurs(courriel, empreinte, role, approuve)
     values ('successeur@essai.cm', 'x', 'invite', true);
   update utilisateurs set role = 'invite'       where courriel = 'proprio@essai.cm';
   update utilisateurs set role = 'proprietaire' where courriel = 'successeur@essai.cm';"

# ---------------------------------------------------------------------------
# LA CLÉ D'INTENTION : une opération d'argent ne part pas deux fois.
# ---------------------------------------------------------------------------
echo ""
echo "L'argent ne part pas deux fois"
$P -d totem -c "insert into terminaux(id, nom) values ('douala', 'Douala (essai)');"
$P -d totem -c "
  insert into commandes(terminal, type, parametres, etat, cle)
    values ('douala', 'ussd', '{}'::jsonb, 'en_attente', 'intention-42');"
refuser "la même intention déposée deux fois" \
  "insert into commandes(terminal, type, parametres, etat, cle)
     values ('douala', 'ussd', '{}'::jsonb, 'en_attente', 'intention-42');"
accepter "une intention différente passe" \
  "insert into commandes(terminal, type, parametres, etat, cle)
     values ('douala', 'ussd', '{}'::jsonb, 'en_attente', 'intention-43');"
accepter "une demande sans intention passe (le robot, les vieux écrans)" \
  "insert into commandes(terminal, type, parametres, etat, cle)
     values ('douala', 'ussd', '{}'::jsonb, 'en_attente', null),
           ('douala', 'ussd', '{}'::jsonb, 'en_attente', null);"

# ---------------------------------------------------------------------------
# LE FREIN COMPTE JUSTE, MÊME QUAND TOUT ARRIVE EN MÊME TEMPS.
#
# C'est la seule chose qui compte ici. Un compteur qui se LIT puis s'ÉCRIT
# reproduirait un cran plus bas la faute corrigée un cran plus haut : entre la
# lecture et l'écriture, les autres essais passent. On lance donc quarante
# comptages VRAIMENT EN MÊME TEMPS, depuis quarante connexions distinctes, et
# on exige quarante.
# ---------------------------------------------------------------------------
echo ""
echo "Le frein compte juste sous une rafale"
$P -d totem -c "delete from freins where cle = 'rafale';" >/dev/null 2>&1
i=0
while [ $i -lt 40 ]; do
  psql -h /tmp -p "$PORT" -U totem -d totem -q -tAc \
    "select compter_un_essai('rafale', 900);" >/dev/null 2>&1 &
  i=$((i + 1))
done
wait
compte=$($P -d totem -tAc "select n from freins where cle = 'rafale';")
if [ "$compte" = "40" ]; then
  echo "  ✓ quarante essais lancés ensemble comptent quarante"
else
  echo "  ✗ quarante essais lancés ensemble ont compté $compte"
  echecs=$((echecs + 1))
fi

# Hors fenêtre, on repart de un : on ne traîne pas les fautes d'hier.
horsFenetre=$($P -d totem -tAc "select compter_un_essai('rafale', 0);")
if [ "$horsFenetre" = "1" ]; then
  echo "  ✓ passé la fenêtre, le compteur repart de un"
else
  echo "  ✗ passé la fenêtre, le compteur rend $horsFenetre au lieu de 1"
  echecs=$((echecs + 1))
fi

# ---------------------------------------------------------------------------
# PERSONNE NE LIT LA BASE EN DIRECT.
# ---------------------------------------------------------------------------
echo ""
echo "Personne ne lit la base en direct"
sansRegles=$($P -d totem -tAc "
  select count(*) from pg_tables t
   where t.schemaname = 'public'
     and not exists (select 1 from pg_class c
                      where c.relname = t.tablename and c.relrowsecurity);")
if [ "$sansRegles" = "0" ]; then
  echo "  ✓ toutes les tables sont sous règle de ligne"
else
  echo "  ✗ $sansRegles table(s) SANS règle de ligne — lisibles par la clé publique"
  echecs=$((echecs + 1))
fi

politiques=$($P -d totem -tAc "
  select count(*) from pg_policies where schemaname = 'public';")
if [ "$politiques" = "0" ]; then
  echo "  ✓ aucune politique n'ouvre quoi que ce soit à un rôle public"
else
  echo "  ✗ $politiques politique(s) restante(s) : quelqu'un peut lire sans la clé de service"
  $P -d totem -c "select tablename, policyname, roles from pg_policies where schemaname='public';"
  echecs=$((echecs + 1))
fi

echo ""
if [ "$echecs" = "0" ]; then
  echo "✓ Les règles de la base tiennent — éprouvées, pas seulement écrites."
  exit 0
fi
echo "✗ $echecs vérification(s) en échec."
exit 1
