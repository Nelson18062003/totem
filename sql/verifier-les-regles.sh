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
# ---------------------------------------------------------------------------
# UNE BASE DÉJÀ EN SERVICE N'EST PAS UNE BASE NEUVE.
#
# Ce harnais partait toujours d'une base vierge — et c'est précisément ce qui
# lui a échappé. « create table if not exists » ne vérifie que le NOM d'une
# table, jamais sa FORME : une table homonyme déjà présente fait sauter la
# création EN SILENCE, et tout ce qui suit suppose des colonnes absentes.
#
# La migration est partie ainsi sur la base en service et s'est arrêtée sur
# « column "vu" does not exist ». On rejoue donc les migrations sur une table
# abîmée à dessein.
# ---------------------------------------------------------------------------
# LE COMPTE DES ÉCHECS COMMENCE ICI, AVANT LA PREMIÈRE VÉRIFICATION. Il était
# remis à zéro plus bas, APRÈS le rattrapage des migrations : un échec de
# rattrapage s'affichait « ✗ », puis s'effaçait du total, et le script
# concluait « les règles tiennent ». Un harnais qui oublie ses échecs ne
# garde rien.
echecs=0

echo ""
echo "Les migrations rattrapent une table déjà là, mal formée"
$P -d totem -c "drop table if exists freins cascade;
                create table freins (autre_chose text);" >/dev/null 2>&1
for m in migrations/*.sql; do
  if ! $P -d totem -f "$m" >/dev/null 2>&1; then
    echo "  ✗ $(basename "$m") échoue sur une table « freins » mal formée"
    echecs=$((echecs + 1))
  fi
done
formeRattrapee=$($P -d totem -tAc "
  select count(*) from information_schema.columns
   where table_name = 'freins' and column_name in ('cle', 'n', 'vu');")
if [ "$formeRattrapee" = "3" ]; then
  echo "  ✓ les trois colonnes sont rattrapées"
else
  echo "  ✗ seulement $formeRattrapee colonne(s) sur 3 après rattrapage"
  echecs=$((echecs + 1))
fi
# Et le comptage doit fonctionner : « on conflict (cle) » exige un index
# unique, qu'une table déjà présente n'a pas forcément.
if $P -d totem -tAc "select compter_un_essai('rattrapage', 900);" >/dev/null 2>&1; then
  echo "  ✓ le comptage fonctionne sur la table rattrapée"
else
  echo "  ✗ le comptage échoue sur la table rattrapée"
  echecs=$((echecs + 1))
fi

echo ""
echo "Ce que la base doit REFUSER"

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

# L'INSCRIPTION PUBLIQUE. N'importe qui crée son compte : c'est exactement
# ce qu'on écrirait pour s'emparer de la maison. Une inscription publique
# arrive « invite » ; la plateforme ne pose jamais « proprietaire » qu'au
# tout premier compte — et si deux inscriptions courent sur une plateforme
# neuve, c'est l'index qui tranche. On l'essaie ici avec un compte COMPLET,
# tel que l'application l'envoie.
refuser "une inscription publique complète qui se dit propriétaire" \
  "insert into utilisateurs(courriel, empreinte, role, approuve,
                            prenom, nom, adresse, telephone)
     values ('public@essai.cm', 'x', 'proprietaire', true,
             'Awa', 'Ngono', 'Bonapriso, Douala', '+237677123456');"
refuser "un téléphone qui n'en est pas un (lettres)" \
  "insert into utilisateurs(courriel, empreinte, telephone)
     values ('tel1@essai.cm', 'x', '06-ABC-12');"
refuser "un téléphone trop long pour exister (16 chiffres)" \
  "insert into utilisateurs(courriel, empreinte, telephone)
     values ('tel2@essai.cm', 'x', '+1234567890123456');"
refuser "une adresse faite d'espaces" \
  "insert into utilisateurs(courriel, empreinte, adresse)
     values ('adr1@essai.cm', 'x', '     ');"
refuser "une adresse de 201 caractères" \
  "insert into utilisateurs(courriel, empreinte, adresse)
     values ('adr2@essai.cm', 'x', repeat('a', 201));"
refuser "un prénom de 81 caractères" \
  "insert into utilisateurs(courriel, empreinte, prenom)
     values ('nom1@essai.cm', 'x', repeat('a', 81));"

echo ""
echo "Ce que la base doit ACCEPTER"

accepter "une inscription publique complète, en invitée approuvée" \
  "insert into utilisateurs(courriel, empreinte, role, approuve,
                            prenom, nom, adresse, telephone)
     values ('public@essai.cm', 'x', 'invite', true,
             'Awa', 'Ngono', 'Bonapriso, Douala', '+237677123456');"
accepter "un numéro sans indicatif (6 à 15 chiffres)" \
  "update utilisateurs set telephone = '677123456' where courriel = 'public@essai.cm';"
accepter "un compte d'avant, sans adresse ni téléphone" \
  "insert into utilisateurs(courriel, empreinte) values ('ancien@essai.cm', 'x');"
accepter "un compte public se supprime lui-même, et ses téléphones avec" \
  "insert into appareils(jeton, plateforme, utilisateur)
     select 'ExponentPushToken[public]', 'ios', id from utilisateurs
      where courriel = 'public@essai.cm';
   delete from utilisateurs where courriel = 'public@essai.cm';
   do \$\$ begin
     if exists (select 1 from appareils where jeton = 'ExponentPushToken[public]') then
       raise exception 'restes';
     end if;
   end \$\$;"

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
# ANNULER ET RÉCLAMER : DES DEUX, UN SEUL GAGNE.
#
# L'écran qui renonce annule sa demande (« en attente » → « échouée ») ; le
# robot qui la relève la réclame (« en attente » → « en cours »). Les deux
# écritures portent la MÊME condition — « et elle est encore en attente » —
# et c'est la base qui tranche, sous le verrou de la ligne.
#
# CE BLOC ÉPROUVE LA BASE, PAS LE CODE — et il le dit. Il rejoue à la main
# les deux écritures, avec leur condition, et vérifie que PostgreSQL les
# sérialise : la seconde attend que la première ait fini, relit la ligne, et
# ne la touche pas. C'est la promesse sur laquelle reposent le faux nuage
# (qui l'imite) et les deux côtés du code. Retirer la condition du CODE ne
# le fait PAS échouer ; ce qui garde le code est ailleurs :
#   — la plateforme (`annulerCommande`, web/lib/serveur.ts) : le harnais
#     verifier-le-boitier-muet, allure « lent », exige qu'une annulation
#     arrivée pendant la composition ne prenne pas ;
#   — le robot (`reclamer`, totem/nuage.py) : ses propres tests.
#
# L'ORDRE NE TIENT PAS À UNE DURÉE. La première écriture part en arrière-
# plan et garde sa transaction ouverte (pg_sleep) ; on n'envoie la seconde
# qu'une fois la première VUE en train d'attendre dans pg_stat_activity —
# donc sa ligne déjà prise. Un « sleep 0.3 » supposait que la connexion
# s'ouvre en moins de trois dixièmes : sur une machine chargée, l'ordre
# s'inversait et le premier cas sortait ✗ à tort.
#
# LE TÉMOIN : une écriture sans la condition écrase l'annulation — c'est la
# condition qui protège, pas l'ordre des écritures.
# ---------------------------------------------------------------------------
echo ""
echo "Annuler et réclamer : des deux, un seul gagne (la base, pas le code)"
nouvelle() {
  $P -d totem -tAc "insert into commandes(terminal, type, parametres, etat)
    values ('douala', 'ussd', '{\"code\": \"*126*1*677998877*5000#\"}'::jsonb,
            'en_attente') returning id;" | head -1
}
# Attend que la transaction d'arrière-plan soit DANS son pg_sleep : son
# écriture est faite, la ligne est à elle. Rend 0 si elle y est.
attendreLaPremiere() {
  for _ in $(seq 1 100); do
    n=$($P -d totem -tAc "select count(*) from pg_stat_activity
                          where wait_event = 'PgSleep';")
    [ "$n" = "1" ] && return 0
    sleep 0.05
  done
  return 1
}
# Le robot réclame le premier, et garde la ligne ; l'annulation arrive
# pendant ce temps.
ID=$(nouvelle)
psql -h /tmp -p "$PORT" -U totem -d totem -q -c "begin;
  update commandes set etat = 'en_cours' where id = $ID and etat = 'en_attente';
  select pg_sleep(1); commit;" >/dev/null 2>&1 &
if attendreLaPremiere; then
  annulee=$($P -d totem -tAc "update commandes set etat = 'echouee'
    where id = $ID and etat = 'en_attente' returning id;" | grep -c . || true)
else
  annulee="?"
fi
wait
etat=$($P -d totem -tAc "select etat from commandes where id = $ID;")
if [ "$annulee" = "0" ] && [ "$etat" = "en_cours" ]; then
  echo "  ✓ le robot l'a prise : l'annulation arrivée pendant ne prend pas"
else
  echo "  ✗ annulation arrivée pendant la réclamation : $annulee ligne(s) annulée(s), état « $etat »"
  echecs=$((echecs + 1))
fi
# L'annulation passe la première, et garde la ligne ; le robot arrive pendant.
ID=$(nouvelle)
psql -h /tmp -p "$PORT" -U totem -d totem -q -c "begin;
  update commandes set etat = 'echouee' where id = $ID and etat = 'en_attente';
  select pg_sleep(1); commit;" >/dev/null 2>&1 &
if attendreLaPremiere; then
  reclamee=$($P -d totem -tAc "update commandes set etat = 'en_cours'
    where id = $ID and etat = 'en_attente' returning id;" | grep -c . || true)
else
  reclamee="?"
fi
wait
etat=$($P -d totem -tAc "select etat from commandes where id = $ID;")
if [ "$reclamee" = "0" ] && [ "$etat" = "echouee" ]; then
  echo "  ✓ annulée la première : le robot ne la réclame plus, rien ne part"
else
  echo "  ✗ réclamation arrivée pendant l'annulation : $reclamee ligne(s) prise(s), état « $etat »"
  echecs=$((echecs + 1))
fi
# LE TÉMOIN : sans la condition, la réclamation écrase l'annulation.
$P -d totem -c "update commandes set etat = 'en_cours' where id = $ID;" >/dev/null
etat=$($P -d totem -tAc "select etat from commandes where id = $ID;")
if [ "$etat" = "en_cours" ]; then
  echo "  ✓ le témoin : sans la condition, l'annulée repart « en cours »"
else
  echo "  ✗ le témoin n'a rien écrasé (« $etat ») : ces deux essais ne prouvent rien"
  echecs=$((echecs + 1))
fi

# ---------------------------------------------------------------------------
# LE CODE SECRET NE SURVIT PAS À UNE DEMANDE CLOSE.
#
# Une réponse « secrète » attend le robot avec le code en clair ; c'est lui
# qui l'efface en la traitant. Annulée depuis l'écran, elle n'était jamais
# traitée — et si la plateforme ne parvenait pas à relire la demande pour
# masquer le code, l'annulation l'y laissait pour toujours. La base le
# retire maintenant dans la MÊME écriture que la fermeture (déclencheur
# « commandes_code_efface »), quel que soit l'auteur de l'écriture.
#
# Il ne doit RIEN retirer d'autre : ni le code d'une demande encore « en
# cours » (le robot vient de la réclamer et doit le composer), ni les
# paramètres d'une demande qui n'a rien de secret, ni la carte et la
# personne, qui disent à qui est la demande.
#
# LE TÉMOIN : déclencheur débranché, la même annulation garde le code.
# ---------------------------------------------------------------------------
echo ""
echo "Le code secret ne survit pas à une demande close"
CARTE_ESSAI=89237010000000008901
reponse() {
  $P -d totem -tAc "insert into commandes(terminal, type, parametres, etat)
    values ('douala', 'ussd_reponse',
            '{\"texte\": \"4821\", \"secret\": true, \"carte\": \"$CARTE_ESSAI\",
              \"par\": \"c:1\", \"langue\": \"fr\"}'::jsonb,
            'en_attente') returning id;" | head -1
}
parametres() { $P -d totem -tAc "select parametres::text from commandes where id = $1;"; }
garde() {   # garde <id> : la carte, la personne et le drapeau sont-ils là ?
  $P -d totem -tAc "select parametres->>'carte' = '$CARTE_ESSAI'
                       and parametres->>'par' = 'c:1'
                       and parametres->>'secret' = 'true'
                     from commandes where id = $1;"
}
# L'annulation de la plateforme quand sa relecture a échoué : elle écrit
# l'état, sans paramètres.
ID=$(reponse)
$P -d totem -c "update commandes set etat = 'echouee', resultat = 'Annulée'
                 where id = $ID and etat = 'en_attente';" >/dev/null
if parametres "$ID" | grep -q 4821; then
  echo "  ✗ annulée sans relecture, la demande garde le code : $(parametres "$ID")"
  echecs=$((echecs + 1))
elif [ "$(garde "$ID")" = "t" ]; then
  echo "  ✓ annulée, même sans relecture : le code s'en va ; restent la carte et la personne"
else
  echo "  ✗ le code est parti, mais la carte ou la personne avec : $(parametres "$ID")"
  echecs=$((echecs + 1))
fi
# Le robot la réclame : il doit encore lire le code. Puis il la finit.
ID=$(reponse)
$P -d totem -c "update commandes set etat = 'en_cours' where id = $ID;" >/dev/null
if parametres "$ID" | grep -q 4821; then
  echo "  ✓ « en cours » : le code reste lisible pour le robot qui le compose"
else
  echo "  ✗ « en cours » : le code a disparu avant d'être composé : $(parametres "$ID")"
  echecs=$((echecs + 1))
fi
$P -d totem -c "update commandes set etat = 'faite', resultat = 'Operation reussie'
                 where id = $ID;" >/dev/null
if parametres "$ID" | grep -q 4821; then
  echo "  ✗ « faite » sans que le robot ait masqué : le code est resté"
  echecs=$((echecs + 1))
else
  echo "  ✓ « faite » : le code s'en va aussi, même si le robot a oublié"
fi
# Une demande qui n'a rien de secret garde ses paramètres en se fermant.
ID=$(nouvelle)
$P -d totem -c "update commandes set etat = 'echouee' where id = $ID;" >/dev/null
if parametres "$ID" | grep -q '677998877'; then
  echo "  ✓ une demande sans secret, close, garde ses paramètres"
else
  echo "  ✗ une demande sans secret a perdu ses paramètres : $(parametres "$ID")"
  echecs=$((echecs + 1))
fi
# LE TÉMOIN : sans le déclencheur, la même annulation garde le code.
ID=$(reponse)
$P -d totem -c "alter table commandes disable trigger commandes_code_efface;
  update commandes set etat = 'echouee' where id = $ID and etat = 'en_attente';
  alter table commandes enable trigger commandes_code_efface;" >/dev/null
if parametres "$ID" | grep -q 4821; then
  echo "  ✓ le témoin : sans le déclencheur, l'annulée garde le code en clair"
else
  echo "  ✗ le témoin a perdu le code sans le déclencheur : ces essais ne prouvent rien"
  echecs=$((echecs + 1))
fi

# ---------------------------------------------------------------------------
# L'OREILLE DE LA BASE : QUAND ELLE A ENTENDU CHAQUE BOÎTIER.
#
# « entendu_le » et « revenu_le » sont tenus par un déclencheur (voir
# schema.sql) : c'est d'eux que la plateforme mesure le silence d'un boîtier
# et attend qu'il ait relu ses cartes. On les éprouve comme le robot les
# touche — une annonce PostgREST, insertion qui devient mise à jour — et
# comme la console les touche — un renommage, une mise hors service.
#
# Pour simuler une coupure sans attendre dix minutes, on recule les heures
# d'une ligne déclencheur DÉBRANCHÉ (seul le propriétaire de la table le
# peut), puis on le rebranche avant l'essai.
# ---------------------------------------------------------------------------
echo ""
echo "L'oreille de la base : quand elle a entendu chaque boîtier"
# annonce <id> <écart de SON horloge, en secondes> — comme le robot.
annonce() {
  $P -d totem -c "insert into terminaux (id, nom, vu_le, version)
      values ('$1', '$1', now() + interval '$2 seconds', 'essai')
    on conflict (id) do update
      set nom = excluded.nom, vu_le = excluded.vu_le, version = excluded.version;" >/dev/null
}
# reculer <id> <entendu il y a (s)> <son horloge en retard de (s)> <revenu il y a (s)>
reculer() {
  $P -d totem -c "alter table terminaux disable trigger terminaux_entendu;
    update terminaux set entendu_le = now() - interval '$2 seconds',
                         vu_le = now() - interval '$2 seconds' - interval '$3 seconds',
                         revenu_le = now() - interval '$4 seconds'
     where id = '$1';
    alter table terminaux enable trigger terminaux_entendu;" >/dev/null
}
age() { $P -d totem -tAc "select round(extract(epoch from now() - $2))::int
                           from terminaux where id = '$1';"; }
ouiNon() { # ouiNon <condition vraie ?> <libellé> <détail si faux>
  if [ "$1" = "t" ]; then echo "  ✓ $2"; else echo "  ✗ $2 — $3"; echecs=$((echecs + 1)); fi
}

# Un Pi qui redémarre une heure en retard.
annonce oreille -3600
ouiNon "$($P -d totem -tAc "select entendu_le is not null and now() - entendu_le < interval '5 seconds'
                            from terminaux where id = 'oreille';")" \
  "le silence se mesure sur l'heure de la BASE : entendu à l'instant" \
  "entendu il y a $(age oreille entendu_le) s"
ouiNon "$($P -d totem -tAc "select now() - vu_le > interval '3000 seconds'
                            from terminaux where id = 'oreille';")" \
  "le témoin : compté sur la date du Pi, ce boîtier bien vivant paraîtrait muet" \
  "la date du Pi n'est pas en retard : l'essai ne prouve rien"

# Ce qui n'est pas un signe de vie ne fait pas bouger l'oreille.
reculer oreille 600 0 7200
$P -d totem -c "update terminaux set nom = 'Akwa', lieu = 'Douala · Akwa',
                retire_motif = 'essai' where id = 'oreille';" >/dev/null
ouiNon "$($P -d totem -tAc "select now() - entendu_le > interval '590 seconds'
                            from terminaux where id = 'oreille';")" \
  "un renommage n'est pas un signe de vie : l'oreille ne bouge pas" \
  "entendu il y a $(age oreille entendu_le) s"
$P -d totem -c "update terminaux set entendu_le = now(), revenu_le = now()
                where id = 'oreille';" >/dev/null
ouiNon "$($P -d totem -tAc "select now() - entendu_le > interval '590 seconds'
                              and now() - revenu_le > interval '7000 seconds'
                            from terminaux where id = 'oreille';")" \
  "on ne règle pas l'oreille à la main : la valeur d'avant reste" \
  "entendu il y a $(age oreille entendu_le) s, revenu il y a $(age oreille revenu_le) s"

# Dix minutes de silence, puis il revient : c'est un retour.
annonce oreille 0
ouiNon "$($P -d totem -tAc "select now() - revenu_le < interval '5 seconds'
                            from terminaux where id = 'oreille';")" \
  "dix minutes de silence, puis un signe de vie : la base note son retour" \
  "revenu il y a $(age oreille revenu_le) s"

# Un battement ordinaire (30 s) ne remet pas le retour à zéro.
reculer oreille 30 0 7200
annonce oreille 0
ouiNon "$($P -d totem -tAc "select now() - revenu_le > interval '7000 seconds'
                              and now() - entendu_le < interval '5 seconds'
                            from terminaux where id = 'oreille';")" \
  "un battement ordinaire : entendu à l'instant, mais pas « revenu »" \
  "revenu il y a $(age oreille revenu_le) s — chaque battement passerait pour un retour"

# Son horloge remise à l'heure (une heure de bond) compte comme un retour :
# ce qu'il avait dit de ses cartes est daté de l'ancienne heure.
reculer oreille 30 3600 7200
annonce oreille 0
ouiNon "$($P -d totem -tAc "select now() - revenu_le < interval '5 seconds'
                            from terminaux where id = 'oreille';")" \
  "une horloge remise à l'heure compte comme un retour" \
  "revenu il y a $(age oreille revenu_le) s"

# Inscrit sans avoir jamais parlé : la base ne l'a pas entendu.
$P -d totem -c "insert into terminaux (id, nom) values ('jamais-vu', 'neuf');" >/dev/null
ouiNon "$($P -d totem -tAc "select entendu_le is null and revenu_le is null
                            from terminaux where id = 'jamais-vu';")" \
  "un boîtier inscrit qui n'a jamais parlé n'est pas « entendu »" \
  "il passerait pour vivant sans avoir jamais rien dit"
$P -d totem -c "delete from terminaux where id in ('oreille', 'jamais-vu');" >/dev/null

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
# LES CARTES DE CHACUN.
#
# Un invité ne voit que les cartes qu'on lui a confiées : c'est la base qui
# porte la liste, et elle doit refuser ce qui la rendrait fausse.
# ---------------------------------------------------------------------------
echo ""
echo "Les cartes de chacun"
$P -d totem -c "
  insert into utilisateurs(courriel, empreinte, role, approuve, prenom, nom)
    values ('vendeur@essai.cm', 'x', 'invite', true, 'Jean', 'Vendeur');"
VENDEUR=$($P -d totem -tAc "select id from utilisateurs where courriel = 'vendeur@essai.cm';")
accepter "confier une carte à une personne" \
  "insert into attributions(utilisateur, iccid) values ($VENDEUR, '89237010000000008901');"
refuser "la même carte confiée deux fois à la même personne" \
  "insert into attributions(utilisateur, iccid) values ($VENDEUR, '89237010000000008901');"
refuser "un ICCID qui porte autre chose que des lettres et des chiffres" \
  "insert into attributions(utilisateur, iccid) values ($VENDEUR, '8923'')--');"
refuser "une carte confiée à un compte qui n'existe pas" \
  "insert into attributions(utilisateur, iccid) values (999999, '89237020000000004432');"

# LES MOTS DE PASSE SURVIVENT À LA MIGRATION. Une version de travail de ce
# fichier effaçait toutes les empreintes (on devait entrer par un code) :
# rejouée sur la base en service, elle aurait mis tout le monde dehors.
$P -d totem -f migrations/20261001_consolidation.sql >/dev/null 2>&1 || true
garde=$($P -d totem -tAc "select empreinte from utilisateurs where courriel = 'vendeur@essai.cm';")
if [ "$garde" = "x" ]; then
  echo "  ✓ rejouer la migration garde les mots de passe"
else
  echo "  ✗ rejouer la migration a touché un mot de passe ($garde)"
  echecs=$((echecs + 1))
fi
accepter "inscrire un téléphone au nom de celui qui tient la carte" \
  "insert into appareils(jeton, plateforme, utilisateur)
     values ('ExponentPushToken[vendeur]', 'ios', $VENDEUR);"
refuser "un téléphone inscrit au nom d'un compte qui n'existe pas" \
  "insert into appareils(jeton, utilisateur) values ('ExponentPushToken[fantome]', 999999);"
accepter "enregistrer un bénéficiaire sur une carte" \
  "insert into beneficiaires(carte, numero, nom, cree_par)
     values ('89237010000000008901', '677998877', 'Jean Dupont', $VENDEUR);"
refuser "le même numéro deux fois sur la même carte" \
  "insert into beneficiaires(carte, numero, nom) values ('89237010000000008901', '677998877', 'Autre');"
accepter "le même numéro sur une AUTRE carte" \
  "insert into beneficiaires(carte, numero, nom) values ('89237020000000004432', '677998877', 'Jean');"
refuser "un numéro qui n'en est pas un" \
  "insert into beneficiaires(carte, numero, nom) values ('89237010000000008901', '677-99', 'X');"
refuser "un bénéficiaire sans nom" \
  "insert into beneficiaires(carte, numero, nom) values ('89237010000000008901', '699000000', '   ');"
accepter "effacer un compte efface ses cartes" \
  "delete from utilisateurs where id = $VENDEUR;
   do \$\$ begin
     if exists (select 1 from attributions where utilisateur = $VENDEUR)
        or exists (select 1 from appareils where utilisateur = $VENDEUR) then
       raise exception 'restes';
     end if;
   end \$\$;"

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
