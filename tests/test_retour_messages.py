# -*- coding: utf-8 -*-
"""Les deux écrans du retour et du courrier tiennent-ils leurs promesses ?

Deux écrans, et six promesses qui peuvent toutes se casser en silence — sans
qu'aucune page cesse de s'afficher, sans qu'aucune compilation échoue.

`C8` (« je n'arrive plus à entrer ») promet :
  · fermer ne demande aucun mot de passe — quelqu'un dont le téléphone vient
    d'être arraché n'a rien à retrouver, et fermer une porte n'a jamais nui à
    personne ;
  · la demande de fermeture ne dit jamais si le compte existe — sinon ce
    formulaire devient l'outil le plus commode du marché pour savoir qui, dans
    la rue, tient un TOTEM ;
  · le jeton du lien ne touche la base que sous forme d'empreinte, et il ne
    sert qu'une fois ;
  · les trois chemins de retour sont nommés, ET le recours humain aussi —
    parce qu'aucune machine ne rattrape un téléphone perdu avec le papier.

`C10` (« ce qui arrive sur votre téléphone ») promet :
  · ce qui protège ne se débraye pas — vérifié sur la STRUCTURE, pas sur un
    commentaire : un commentaire ne retient rien le jour où quelqu'un ajoute
    un interrupteur « juste pour les tests » ;
  · la phrase sur le code PIN est là, dans les deux langues. C'est cette
    page-là qu'on ira relire en recevant un faux message.
"""

import re
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
WEB = RACINE / "web"
APP = WEB / "app"
LIB = WEB / "lib"
SQL = RACINE / "sql"

RETOUR = APP / "retour"
API_RETOUR = APP / "api" / "retour"
MESSAGES = APP / "messages"

LIB_RETOUR = LIB / "retour.ts"
LIB_PREFERENCES = LIB / "preferences.ts"
TEXTES_RETOUR = LIB / "textes" / "retour.ts"
TEXTES_MESSAGES = LIB / "textes" / "messages.ts"

MIGRATION = SQL / "migration-preferences.sql"
SCHEMA = SQL / "schema.sql"

# Les quatre genres qui protègent. Ils n'ont pas d'interrupteur, nulle part.
PROTEGES = ["code", "invitation", "alerte_appareil", "cle_retiree"]
DEBRAYABLES = ["bienvenue", "encaissement", "rapport", "terminal"]


def lu(chemin):
    return chemin.read_text(encoding="utf-8")


def blocs_langue(texte):
    """Les deux dictionnaires d'un fichier de textes, séparés."""
    apres_en = texte.split("const en = {", 1)[1]
    return {
        "en": apres_en.split("const fr: typeof en = {")[0],
        "fr": texte.split("const fr: typeof en = {", 1)[1],
    }


def tables_sql(texte):
    """Les tables créées par un fichier SQL, avec leur corps."""
    return {m.group(1): m.group(2) for m in re.finditer(
        r"create table if not exists (\w+)\s*\((.*?)\n\);", texte, re.S)}


def colonnes_sql(corps):
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


class FermerNeDemandeRien(unittest.TestCase):
    """« Fermez tout » ne réclame aucune preuve que la personne n'a plus."""

    def fichiers(self):
        return (sorted(RETOUR.rglob("*.tsx"))
                + sorted(API_RETOUR.rglob("*.ts"))
                + [LIB_RETOUR])

    def test_aucun_mot_de_passe_nulle_part(self):
        """Un champ de mot de passe sur cet écran serait un cul-de-sac : la
        personne qui l'ouvre vient de perdre l'appareil où il était noté."""
        for f in self.fichiers():
            texte = lu(f)
            self.assertNotIn(
                'type="password"', texte,
                f"{f.name} demande un mot de passe pour fermer")
            for interdit in ("motDePasse", "verifierCode", "TOTEM_MOT_DE_PASSE"):
                self.assertNotIn(
                    interdit, texte,
                    f"{f.name} exige un secret ({interdit}) pour un geste qui "
                    "n'a jamais nui à personne")

    def test_le_seul_champ_de_l_ecran_est_une_adresse(self):
        inter = lu(RETOUR / "interactifs.tsx")
        self.assertEqual(
            inter.count("<input"), 1,
            "l'écran de retour a plus d'un champ ; il n'en demande qu'un, "
            "l'adresse mail")
        self.assertIn('type="email"', inter,
                      "le champ de l'écran de retour n'est pas une adresse")

    def test_fermer_n_exige_aucune_session(self):
        """Exiger une session pour signaler qu'on n'arrive plus à entrer
        reviendrait à demander d'être déjà entré."""
        for f in self.fichiers():
            texte = lu(f)
            for garde in ("exigerPresence(", "exigerPouvoir(", "garder("):
                self.assertNotIn(
                    garde, texte,
                    f"{f.name} appelle {garde} : la porte de secours est "
                    "fermée à clé de l'intérieur")


class LaDemandeNeRevelePersonne(unittest.TestCase):
    """La même réponse, que le compte existe ou non."""

    def test_la_route_n_a_qu_une_seule_reponse(self):
        route = lu(API_RETOUR / "fermeture" / "route.ts")
        self.assertEqual(
            route.count("Response.json("), 1,
            "la route de demande a plusieurs réponses : l'une d'elles finira "
            "par dire si le compte existe")
        for code in ("401", "403", "404", "409", "429"):
            self.assertNotIn(
                f"status: {code}", route,
                f"la route répond {code} dans un cas et pas dans l'autre — "
                "un code d'état suffit à énumérer les comptes")

    def test_la_fonction_appelee_ne_rend_rien(self):
        """La meilleure garantie n'est pas la discipline : c'est qu'il n'y ait
        rien à raconter. Une fonction qui ne rend rien ne donne aucune branche
        à écrire."""
        self.assertRegex(
            lu(LIB_RETOUR),
            r"export async function demanderLaFermeture\([^)]*\)"
            r":\s*Promise<void>",
            "« demanderLaFermeture » rend quelque chose : un jour, quelqu'un "
            "s'en servira pour « améliorer le message »")

    def test_l_ecran_n_a_qu_une_phrase_a_montrer(self):
        inter = lu(RETOUR / "interactifs.tsx")
        self.assertEqual(
            inter.count("t.fermerEnvoye"), 1,
            "l'écran connaît plusieurs réponses à la demande de fermeture")
        for cle in ("inconnue", "introuvable", "pasDeCompte"):
            self.assertNotIn(
                cle, inter, f"l'écran sait dire « {cle} » : il révèle donc")


class LeJetonDeFermeture(unittest.TestCase):
    """Jamais en clair, et une seule fois."""

    def test_la_base_ne_recoit_que_l_empreinte(self):
        bloc = re.search(
            r'inserer<LigneDemande>\("demandes_fermeture",\s*\{(.*?)\n  \}\)',
            lu(LIB_RETOUR), re.S)
        self.assertIsNotNone(
            bloc, "l'écriture de la demande de fermeture a changé de forme")
        champs = re.findall(r"^\s*(\w+):", bloc.group(1), re.M)
        self.assertIn("jeton_empreinte", champs)
        self.assertNotIn(
            "jeton", champs,
            "le jeton part en clair dans la base : une sauvegarde qui traîne "
            "permettrait alors de fermer n'importe quel compte")

    def test_la_colonne_en_clair_n_existe_pas(self):
        for fichier in (MIGRATION, SCHEMA):
            corps = tables_sql(lu(fichier)).get("demandes_fermeture")
            self.assertIsNotNone(
                corps, f"« demandes_fermeture » manque à {fichier.name}")
            cols = colonnes_sql(corps)
            self.assertIn("jeton_empreinte", cols)
            self.assertNotIn(
                "jeton", cols,
                f"{fichier.name} garde le jeton en clair")

    def test_il_ne_sert_qu_une_fois(self):
        """L'usage unique est porté par la BASE, pas par une intention : le
        filtre « pas encore utilisé » est dans la lecture ET dans l'écriture,
        sinon deux onglets ouverts ensemble le consomment deux fois."""
        texte = lu(LIB_RETOUR)
        self.assertRegex(
            texte, r"demandes_fermeture\?jeton_empreinte=eq\.\$\{e\}"
                   r"&utilise_le=is\.null",
            "on relit un jeton déjà utilisé")
        self.assertRegex(
            texte, r"demandes_fermeture\?id=eq\.\$\{ligne\.id\}"
                   r"&utilise_le=is\.null",
            "la consommation ne filtre pas sur « pas encore utilisé » : deux "
            "onglets ouverts au même instant fermeraient deux fois")
        for fichier in (MIGRATION, SCHEMA):
            self.assertIn(
                "utilise_le", colonnes_sql(
                    tables_sql(lu(fichier))["demandes_fermeture"]),
                f"{fichier.name} n'a pas de quoi marquer un jeton comme servi")

    def test_le_lien_ne_s_ouvre_pas_tout_seul(self):
        """La page du lien ne consomme rien : c'est un bouton qui ferme.

        Sinon le premier antivirus de messagerie qui va voir où mènent les
        liens brûlerait le seul lien de la personne, et elle trouverait « ce
        lien ne marche plus » sans que rien n'ait été fermé.
        """
        page = lu(RETOUR / "fermer" / "[jeton]" / "page.tsx")
        self.assertNotIn(
            "fermerAvecLeJeton", page,
            "la page du lien ferme à l'ouverture ; un robot de messagerie "
            "consommerait le jeton avant la personne")
        route = lu(API_RETOUR / "fermeture" / "[jeton]" / "route.ts")
        self.assertIn("export async function POST", route)
        self.assertNotIn(
            "export async function GET", route,
            "le jeton se consomme en GET : il sera brûlé en chemin")


class C8NommeLesQuatreIssues(unittest.TestCase):
    """Trois chemins, et la personne à prévenir quand aucun ne marche."""

    def voies(self, bloc):
        m = re.search(r"voies:\s*\{(.*?)\n  \},", bloc, re.S)
        self.assertIsNotNone(m, "le bloc des trois chemins a disparu")
        return m.group(1)

    def test_les_trois_chemins_sont_nommes_dans_les_deux_langues(self):
        blocs = blocs_langue(lu(TEXTES_RETOUR))
        attendu = {
            "en": ("lock", "email", "paper"),
            "fr": ("verrouillage", "mail", "papier"),
        }
        for langue, mots in attendu.items():
            voies = self.voies(blocs[langue]).lower()
            for cle in ("telephone:", "courriel:", "papier:"):
                self.assertIn(cle, voies,
                              f"le chemin « {cle} » manque en {langue}")
            for mot in mots:
                self.assertIn(
                    mot, voies,
                    f"le chemin n'est pas NOMMÉ en {langue} : « {mot} » "
                    "n'apparaît nulle part")

    def test_le_recours_humain_est_dit_franchement(self):
        """Un « appelez quelqu'un » sans nom, sans phrase à dire et sans délai
        n'est pas un chemin : c'est un abandon écrit en petit."""
        blocs = blocs_langue(lu(TEXTES_RETOUR))
        for langue, bloc in blocs.items():
            for cle in ("humainTitre:", "humainDit:", "humainQuoiDire:",
                        "humainDelai:"):
                self.assertIn(
                    cle, bloc,
                    f"« {cle} » manque en {langue} — le dernier recours n'est "
                    "pas porté jusqu'au bout")

    def test_l_ecran_montre_les_quatre(self):
        page = lu(RETOUR / "page.tsx")
        for morceau in ("t.voies.telephone", "t.voies.courriel",
                        "t.voies.papier", "t.humainDit", "t.humainQuoiDire"):
            self.assertIn(
                morceau, page,
                f"l'écran C8 n'affiche pas {morceau} : le chemin existe dans "
                "le dictionnaire et nulle part sur l'écran")


class CeQuiProtegeNeSeDebrayePas(unittest.TestCase):
    """La règle de C10, vérifiée sur la structure réelle — pas sur une phrase."""

    def genres(self):
        bloc = re.search(r"export const GENRES = \{(.*?)\n\} as const",
                         lu(LIB_PREFERENCES), re.S)
        self.assertIsNotNone(bloc, "la table des genres a changé de forme")
        return dict(re.findall(
            r"^\s*(\w+):\s*\{\s*debrayable:\s*(true|false)\s*\}",
            bloc.group(1), re.M))

    def test_les_huit_genres_sont_declares(self):
        self.assertEqual(set(self.genres()), set(PROTEGES) | set(DEBRAYABLES))

    def test_les_quatre_qui_protegent_n_ont_pas_d_interrupteur(self):
        genres = self.genres()
        for g in PROTEGES:
            self.assertEqual(
                genres[g], "false",
                f"« {g} » est devenu débrayable. Un message qu'on peut "
                "éteindre est un message qui n'aurait pas prévenu le jour où "
                "il fallait")
        for g in DEBRAYABLES:
            self.assertEqual(
                genres[g], "true",
                f"« {g} » ne se débraye plus : on impose un message qui ne "
                "protège de rien")

    def test_la_route_le_reverifie(self):
        """L'écran ne décide de rien. Un appel à la main depuis la console du
        navigateur doit se heurter au même refus."""
        self.assertIn(
            'if (!recevoir && !estDebrayable(genre)) return "protege";',
            lu(LIB_PREFERENCES),
            "rien ne refuse d'éteindre un message qui protège : le contrôle "
            "n'existe que dans l'écran, donc il se contourne")
        self.assertIn(
            "estGenre", lu(APP / "api" / "messages" / "route.ts"),
            "la route accepte n'importe quel genre")

    def test_la_base_le_refuse_aussi(self):
        """Le troisième barrage. Une ligne écrite à la main dans l'éditeur SQL
        doit être refusée elle aussi."""
        for fichier in (MIGRATION, SCHEMA):
            texte = lu(fichier)
            contrainte = re.search(
                r"check \(recevoir or genre not in\s*\((.*?)\)\)", texte, re.S)
            self.assertIsNotNone(
                contrainte,
                f"{fichier.name} laisse la base accepter l'extinction d'un "
                "message qui protège")
            listes = set(re.findall(r"'(\w+)'", contrainte.group(1)))
            self.assertEqual(
                listes, set(PROTEGES),
                f"{fichier.name} ne protège pas les mêmes quatre genres que "
                "lib/preferences.ts")

    def test_l_ecran_ne_montre_pas_d_interrupteur_grise(self):
        """Un interrupteur grisé se lit comme une permission qui manque, et
        pousse à chercher qui pourrait la donner. Une absence expliquée se lit
        comme une décision."""
        inter = lu(MESSAGES / "interactifs.tsx")
        self.assertIn("debrayable ? (", inter,
                      "l'interrupteur n'est plus conditionné au genre")
        self.assertIn("t.toujours", inter,
                      "rien ne dit à l'écran que ce message part toujours")

    def test_le_defaut_est_de_recevoir(self):
        """Fabriquer un silence par oubli serait la pire façon de se taire."""
        self.assertIn("for (const genre of ORDRE) choix[genre] = true;",
                      lu(LIB_PREFERENCES),
                      "le défaut n'est plus « on reçoit »")
        for fichier in (MIGRATION, SCHEMA):
            corps = tables_sql(lu(fichier))["preferences_messages"]
            self.assertRegex(
                corps, r"recevoir\s+boolean not null default true",
                f"{fichier.name} n'a plus « on reçoit » comme défaut")


class LaPhraseSurLePin(unittest.TestCase):
    """Aucun message de TOTEM ne demande le PIN — dit dans les deux langues."""

    def test_les_deux_ecrans_la_portent(self):
        attendu = {
            "en": ("PIN", "password", "call a number back"),
            "fr": ("PIN", "mot de passe", "rappeler un numéro"),
        }
        for fichier in (TEXTES_RETOUR, TEXTES_MESSAGES):
            blocs = blocs_langue(lu(fichier))
            for langue, mots in attendu.items():
                for mot in mots:
                    self.assertIn(
                        mot, blocs[langue],
                        f"{fichier.name} : « {mot} » manque en {langue}. "
                        "C'est cette phrase qu'on relit en recevant un faux "
                        "message")

    def test_les_ecrans_l_affichent(self):
        self.assertIn("t.pinDit", lu(RETOUR / "page.tsx"),
                      "C8 range la phrase sur le PIN dans le dictionnaire "
                      "sans jamais l'afficher")
        page = lu(MESSAGES / "page.tsx")
        for morceau in ("t.jamaisDit", "t.jamaisQuoiFaire"):
            self.assertIn(morceau, page,
                          f"C10 n'affiche pas {morceau}")


class LesDeuxFichiersSqlDisentLaMemeChose(unittest.TestCase):
    """Une colonne ajoutée d'un seul côté produit une base de production qui
    refuse chaque insertion sans le dire clairement."""

    def test_memes_tables_memes_colonnes(self):
        ds = tables_sql(lu(SCHEMA))
        dm = tables_sql(lu(MIGRATION))
        for table in ("preferences_messages", "demandes_fermeture"):
            self.assertIn(table, ds, f"« {table} » manque à schema.sql")
            self.assertIn(table, dm, f"« {table} » manque à la migration")
            self.assertEqual(
                colonnes_sql(ds[table]), colonnes_sql(dm[table]),
                f"« {table} » n'a pas les mêmes colonnes des deux côtés")

    def test_les_deux_tables_sont_fermees(self):
        for fichier in (MIGRATION, SCHEMA):
            texte = lu(fichier)
            for table in ("preferences_messages", "demandes_fermeture"):
                self.assertIn(
                    f"alter table {table} enable row level security", texte,
                    f"{fichier.name} : « {table} » n'a pas la sécurité par "
                    "ligne activée")


if __name__ == "__main__":
    unittest.main()
