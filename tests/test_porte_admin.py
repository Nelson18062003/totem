# -*- coding: utf-8 -*-
"""La porte du super-administrateur tient ses six promesses.

Cette porte n'ouvre pas une boutique : elle ouvre la flotte entière. Six règles
la distinguent de celle du client, et chacune peut se casser en silence — un
nombre recopié, une longueur maximale ajoutée « pour aider », un refus rendu
plus bavard un vendredi soir. Ce fichier les vérifie à la machine.

Chaque test est écrit pour ÉCHOUER quand on casse la chose : ils ont tous été
cassés une fois, volontairement, avant d'être remis.
"""

import re
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
WEB = RACINE / "web"
ADMIN = WEB / "app" / "admin"
API = WEB / "app" / "api" / "admin"
TEXTES = WEB / "lib" / "textes" / "admin-porte.ts"
PLATEFORME = WEB / "lib" / "plateforme.ts"
PAPIER = WEB / "lib" / "papier.ts"
RACCORD = ADMIN / "entree" / "raccord.ts"
ROLES = WEB / "lib" / "roles.ts"


def lire(chemin):
    return chemin.read_text(encoding="utf-8")


def sans_commentaires(source):
    """Ce que la page affiche vraiment, sans ce qu'elle raconte sur elle-même.

    Les en-têtes de ce dépôt expliquent le POURQUOI, et citent donc parfois le
    code qu'ils justifient. Une citation dans un commentaire n'annonce rien à
    personne : la chercher ferait passer un test qui devrait échouer.
    """
    return re.sub(r"(?m)^\s*(//|\*|/\*).*$", "", source)


def fichiers_de_la_porte():
    """Tout ce que cette équipe a écrit et qui s'affiche ou répond."""
    trouves = sorted(ADMIN.rglob("*.tsx")) + sorted(ADMIN.rglob("*.ts"))
    trouves += sorted(API.rglob("*.ts"))
    trouves += [TEXTES, PLATEFORME]
    return trouves


# ---------------------------------------------------------------------------
# 1. Le nombre de codes de secours, le même partout
# ---------------------------------------------------------------------------

# Ce qu'une phrase peut écrire à la place d'un chiffre. On les traduit pour
# pouvoir comparer « dix codes de secours » à `PAR_SERIE`.
MOTS = {
    "un": 1, "one": 1, "deux": 2, "two": 2, "trois": 3, "three": 3,
    "quatre": 4, "four": 4, "cinq": 5, "five": 5, "six": 6, "sept": 7,
    "seven": 7, "huit": 8, "eight": 8, "neuf": 9, "nine": 9, "dix": 10,
    "ten": 10, "onze": 11, "eleven": 11, "douze": 12, "twelve": 12,
}

# Ce qui, dans une phrase, désigne le papier de secours. AU PLURIEL seulement :
# « un code de secours » parle d'un code qu'on utilise, pas du nombre imprimé
# sur la feuille, et compter l'article « un » ferait échouer le test sur une
# phrase parfaitement juste.
CE_PAPIER = (
    r"(?:codes de secours|codes sur papier|codes papier|codes imprimés"
    r"|backup codes|codes on paper|printed codes)"
)

# Le mot juste avant. Un `${…}` est la bonne réponse : le nombre vient alors du
# code et non de la plume.
AVANT_LE_PAPIER = re.compile(r"(\$\{[^}]*\}|[\w'’]+)\s+" + CE_PAPIER, re.I)


def nombre_par_serie():
    m = re.search(r"export const PAR_SERIE = (\d+)", lire(PAPIER))
    assert m, "PAR_SERIE a disparu de lib/papier.ts"
    return int(m.group(1))


class CodesDeSecours(unittest.TestCase):
    """Dix, et le même dix sur tous les écrans qui le mentionnent."""

    def test_le_raccord_de_la_porte_annonce_le_bon_nombre(self):
        """L'écran de la porte est un composant client : il ne peut pas lire
        `lib/papier.ts`, donc il recopie le nombre. C'est ici que la recopie
        se surveille."""
        dix = nombre_par_serie()
        m = re.search(r"export const CODES_DE_SECOURS = (\d+)", lire(RACCORD))
        self.assertIsNotNone(m, "CODES_DE_SECOURS a disparu du raccord de la porte")
        self.assertEqual(
            int(m.group(1)), dix,
            "le raccord de la porte annonce un nombre de codes de secours "
            "différent de PAR_SERIE : un écran dira « huit » là où la feuille "
            "en imprime dix")

    def test_la_plateforme_ne_recopie_pas_le_nombre(self):
        """Côté serveur, rien n'oblige à recopier : on prend PAR_SERIE."""
        m = re.search(r"export const CODES_DE_SECOURS = (.+);", lire(PLATEFORME))
        self.assertIsNotNone(m, "CODES_DE_SECOURS a disparu de lib/plateforme.ts")
        self.assertEqual(
            m.group(1).strip(), "PAR_SERIE",
            "lib/plateforme.ts écrit le nombre à la main au lieu de le prendre "
            "de lib/papier.ts, qui fabrique les codes")

    def test_aucune_phrase_n_annonce_un_autre_nombre(self):
        """« huit codes de secours » se découvre le soir où quelqu'un compte."""
        dix = nombre_par_serie()
        fautes = []
        mentions = 0
        for f in fichiers_de_la_porte():
            for m in AVANT_LE_PAPIER.finditer(lire(f)):
                mentions += 1
                mot = m.group(1)
                if mot.startswith("${"):
                    continue          # le nombre vient du code : c'est le bon cas
                if mot.isdigit():
                    valeur = int(mot)
                elif mot.lower() in MOTS:
                    valeur = MOTS[mot.lower()]
                else:
                    continue          # « vos codes de secours » : aucun nombre
                if valeur != dix:
                    fautes.append(f"{f.relative_to(RACINE)} : « {m.group(0)} »")
        self.assertGreater(
            mentions, 3,
            "plus aucune phrase ne parle du papier de secours : le test ne "
            "vérifie plus rien")
        self.assertEqual(
            fautes, [],
            f"ces phrases annoncent un nombre de codes différent de {dix} :\n  "
            + "\n  ".join(fautes))


# ---------------------------------------------------------------------------
# 2. Un champ de code se colle
# ---------------------------------------------------------------------------

class LeChampSeColle(unittest.TestCase):
    """Pas de longueur maximale, pas de masquage, pas de cases séparées.

    Une longueur maximale tronque un collage EN SILENCE (WCAG 2.2 §3.3.8) : on
    colle « 408 913 » avec son espace, le champ garde « 408 91 », et la
    personne relit trois fois un code juste en croyant s'être trompée.
    """

    def test_aucun_champ_ne_tronque_un_collage(self):
        fautes = [
            str(f.relative_to(RACINE))
            for f in fichiers_de_la_porte()
            if re.search(r"maxLength|maxlength", lire(f))
        ]
        self.assertEqual(
            fautes, [],
            "ces fichiers posent une longueur maximale : un collage y sera "
            "tronqué sans que personne ne le voie :\n  " + "\n  ".join(fautes))

    def test_aucun_champ_de_code_n_est_masque(self):
        """Un code masqué ne se relit pas, et on le retape à l'aveugle."""
        fautes = [
            str(f.relative_to(RACINE))
            for f in fichiers_de_la_porte()
            if re.search(r'type=("password"|\{"password"\})', lire(f))
        ]
        self.assertEqual(
            fautes, [],
            "ces fichiers masquent un champ. Rien ne se masque sur cette "
            "porte : il n'y a pas de mot de passe, et un code se relit :\n  "
            + "\n  ".join(fautes))

    def test_le_champ_des_six_chiffres_existe_et_se_colle(self):
        """Le test précédent passerait aussi si le champ avait disparu."""
        porte = lire(ADMIN / "entree" / "page.tsx")
        champ = re.search(r'id="code"(.*?)/>', porte, re.S)
        self.assertIsNotNone(champ, "le champ des six chiffres a disparu de la porte")
        self.assertIn('autoComplete="one-time-code"', champ.group(1),
                      "le champ des six chiffres ne se laisse plus remplir par "
                      "le téléphone")
        self.assertIn('inputMode="numeric"', champ.group(1))


# ---------------------------------------------------------------------------
# 3. Aucun objet de message ne contient de code
# ---------------------------------------------------------------------------

class LObjetNePorteAucunCode(unittest.TestCase):
    """L'objet s'affiche sur un écran verrouillé, dans un train.

    « TOTEM : votre code 408 913 » a l'air serviable et livre la console à qui
    regarde par-dessus l'épaule. L'objet nomme l'appareil qui demande.
    """

    def test_aucun_objet_n_interpole_un_code(self):
        fautes = []
        for f in (TEXTES, WEB / "lib" / "textes" / "courrier.ts"):
            for ligne in lire(f).splitlines():
                if not re.search(r"\bobjet:", ligne):
                    continue
                if re.search(r"\$\{[^}]*\bcode\b", ligne) or re.search(r"\d{3}\s?\d{3}", ligne):
                    fautes.append(f"{f.relative_to(RACINE)} : {ligne.strip()}")
        self.assertEqual(
            fautes, [],
            "ces objets de message portent un code :\n  " + "\n  ".join(fautes))

    def test_l_objet_des_lettres_de_la_porte_nomme_l_appareil(self):
        """Ne rien mettre du tout serait conforme et inutile : l'objet doit
        dire QUI a demandé, sinon on ne sait pas s'il faut l'ouvrir."""
        textes = lire(TEXTES)
        objets = re.findall(r"objet: \(appareil: string\) =>", textes)
        self.assertGreaterEqual(
            len(objets), 4,
            "les objets des lettres de la porte ne nomment plus l'appareil qui "
            "a demandé (deux lettres, deux langues)")

    def test_les_deux_phrases_obligatoires_sont_dans_les_lettres(self):
        """Ces lettres ne passent pas par `composer`, qui les ajoutait pour
        tout le monde. Elles doivent donc les reprendre explicitement."""
        textes = lire(TEXTES)
        for fonction in ("lettreDuneEntree", "lettreDunSecours"):
            corps = re.search(
                r"export function " + fonction + r"\(.*?\n\}", textes, re.S)
            self.assertIsNotNone(corps, f"{fonction} a disparu")
            self.assertIn(
                "commun.pasVous(", corps.group(0),
                f"{fonction} n'écrit plus ce qu'il faut faire si ce n'était "
                "pas vous")
            self.assertIn(
                "commun.jamaisPin", corps.group(0),
                f"{fonction} n'écrit plus que TOTEM ne demande jamais le code "
                "PIN — c'est la personne qu'on hameçonne, pas la machine")


# ---------------------------------------------------------------------------
# 4. Un refus ne révèle jamais l'existence d'un compte
# ---------------------------------------------------------------------------

class LaPorteNEstPasUnAnnuaire(unittest.TestCase):
    """Une adresse inconnue reçoit la même page qu'une adresse connue.

    Sinon il suffit d'essayer des adresses et de lire laquelle répond
    autrement pour savoir qui administre TOTEM.
    """

    def test_la_demande_de_code_repond_toujours_pareil(self):
        route = lire(API / "code" / "demander" / "route.ts")
        corps = route[route.index("export async function POST"):]
        retours = re.findall(r"return ([^;]+);", corps)
        self.assertGreater(len(retours), 3, "la route a changé de forme")
        fautes = [r.strip() for r in retours if r.strip() != "pareil()"]
        self.assertEqual(
            fautes, [],
            "cette route ne répond plus la même chose dans tous les cas — il "
            "suffira d'essayer des adresses pour savoir qui administre :\n  "
            + "\n  ".join(fautes))

    def test_un_code_juste_sur_un_compte_qui_n_administre_pas_est_un_code_faux(self):
        """Sinon la porte dit « bonne adresse, mauvais compte », c'est-à-dire
        tout ce qu'un attaquant cherchait à savoir."""
        route = lire(API / "code" / "verifier" / "route.ts")
        bloc = re.search(
            r"if \(!personne \|\| !\(await estAdministrateur\(personne\)\)\) \{(.*?)\n  \}",
            route, re.S)
        self.assertIsNotNone(
            bloc, "le contrôle du droit d'administrer a changé de forme")
        self.assertIn(
            "t.refus.faux", bloc.group(1),
            "un code juste sur une adresse qui n'administre pas ne repart plus "
            "avec le refus d'un code faux")
        self.assertIn("401", bloc.group(1),
                      "le refus n'a plus le même code de réponse qu'un code faux")

    def test_l_ecran_ne_lit_pas_la_reponse_de_la_demande(self):
        """Même si le serveur se mettait à parler, l'écran ne l'écoute pas."""
        porte = lire(ADMIN / "entree" / "page.tsx")
        bloc = re.search(r"async function demanderLeCode\(.*?\n  \}", porte, re.S)
        self.assertIsNotNone(bloc, "la demande de code a changé de forme")
        self.assertNotRegex(
            bloc.group(0), r"const \w+ = await fetch|\.json\(\)|\.ok\b",
            "l'écran lit la réponse de la demande de code : une adresse "
            "inconnue ne produira plus la même chose qu'une adresse connue")


# ---------------------------------------------------------------------------
# 5. L'administrateur ne déplace aucun argent
# ---------------------------------------------------------------------------

class AucunMouvementDArgent(unittest.TestCase):
    """La séparation est structurelle, pas contractuelle.

    Nelson en France a le pouvoir technique ; Mme Ngo à Douala a l'argent. Que
    l'administration puisse déplacer les fonds ferait de la console une porte
    dérobée du point de vue de qui les possède.
    """

    def test_le_role_admin_n_a_que_lire_et_administrer(self):
        bloc = re.search(r"admin: \[(.*?)\]", lire(ROLES), re.S)
        self.assertIsNotNone(bloc, "le rôle « admin » a disparu de la table")
        pouvoirs = set(re.findall(r'"(\w+)"', bloc.group(1)))
        self.assertEqual(
            pouvoirs, {"lire", "administrer"},
            "le rôle « admin » a gagné ou perdu un pouvoir. Il n'en a que "
            "deux, et « sortir_argent » n'en fera jamais partie")

    def test_aucune_route_de_la_porte_ne_demande_un_pouvoir_d_argent(self):
        fautes = []
        for f in sorted(API.rglob("route.ts")):
            for pouvoir in re.findall(r'garder\("(\w+)"\)', lire(f)):
                if pouvoir not in ("lire", "administrer"):
                    fautes.append(f"{f.relative_to(RACINE)} : {pouvoir}")
        self.assertEqual(
            fautes, [],
            "ces routes de la porte réclament un pouvoir que l'administrateur "
            "n'a pas — donc elles ne servent personne, ou elles servent "
            "quelqu'un d'autre :\n  " + "\n  ".join(fautes))

    def test_aucun_ecran_de_la_porte_n_appelle_une_route_d_argent(self):
        """Un bouton qui appelle une route interdite est un bouton qui échoue
        devant quelqu'un — et qui lui apprend à emprunter le compte du
        propriétaire."""
        interdites = ("/api/commande", "/api/ussd", "/api/recu")
        fautes = []
        for f in fichiers_de_la_porte():
            texte = lire(f)
            for adresse in interdites:
                if adresse in texte:
                    fautes.append(f"{f.relative_to(RACINE)} : {adresse}")
        self.assertEqual(
            fautes, [],
            "ces écrans appellent une route qui touche à l'argent :\n  "
            + "\n  ".join(fautes))

    def test_composer_un_code_reste_le_pouvoir_du_proprietaire(self):
        """C'est par là que l'argent sort, même quand le code composé est
        innocent."""
        table = re.search(
            r"POUVOIR_PAR_COMMANDE: Record<string, Pouvoir> = \{(.*?)\n\};",
            lire(ROLES), re.S)
        self.assertIsNotNone(table, "la table des pouvoirs a changé de forme")
        for genre in ("ussd", "ussd_reponse"):
            self.assertRegex(
                table.group(1), genre + r':\s*"sortir_argent"',
                f"« {genre} » n'exige plus le pouvoir du propriétaire : "
                "l'administrateur pourrait composer un code au comptoir")


# ---------------------------------------------------------------------------
# 6. L'écran d'ajout RÉCLAME le second appareil
# ---------------------------------------------------------------------------

class LeSecondAppareilSeReclame(unittest.TestCase):
    """Un super-administrateur avec une seule clé est un super-administrateur
    à un accident de sa flotte.

    « Vous pouvez ajouter un appareil » laisse ce compte-là exister. « Il en
    manque un » ne le laisse pas.
    """

    def test_le_minimum_est_de_deux(self):
        m = re.search(r"export const MINIMUM_APPAREILS = (\d+)", lire(PLATEFORME))
        self.assertIsNotNone(m, "MINIMUM_APPAREILS a disparu")
        self.assertEqual(
            int(m.group(1)), 2,
            "le minimum d'appareils n'est plus deux. Un seul appareil est un "
            "compte que seul le courriel rouvrira le jour de l'accident")

    def test_le_manque_se_calcule_a_partir_du_minimum(self):
        corps = re.search(
            r"export function manqueUnAppareil\(combien: number\): boolean \{(.*?)\}",
            lire(PLATEFORME), re.S)
        self.assertIsNotNone(corps, "manqueUnAppareil a disparu")
        self.assertIn(
            "MINIMUM_APPAREILS", corps.group(1),
            "manqueUnAppareil compare à un nombre écrit à la main : le jour où "
            "le minimum change, l'écran continuera de réclamer l'ancien")

    def test_l_ecran_d_ajout_reclame_avant_de_proposer(self):
        page = lire(ADMIN / "appareils" / "ajouter" / "page.tsx")
        self.assertIn(
            "manqueUnAppareil(", page,
            "l'écran d'ajout ne demande plus s'il manque un appareil")
        # Sans les commentaires : les en-têtes de ces fichiers CITENT
        # `role="alert"` pour expliquer pourquoi il est là, et une citation
        # n'annonce rien à personne.
        rendu = sans_commentaires(page)
        self.assertIn(
            'role="alert"', rendu,
            "la réclamation n'est plus annoncée à la voix : quelqu'un qui ne "
            "voit pas l'écran ne saura pas qu'il lui manque un appareil")
        self.assertLess(
            rendu.index('role="alert"'), rendu.index("<PoserCetAppareil />"),
            "l'écran propose le geste avant de dire ce qui manque : la "
            "réclamation passe en premier, sinon ce n'en est plus une")

    def test_la_liste_des_appareils_reclame_aussi(self):
        """C'est l'écran où l'on arrive après être entré : c'est là que le
        manque doit sauter aux yeux, pas seulement sur la page d'ajout."""
        page = lire(ADMIN / "appareils" / "page.tsx")
        self.assertIn("manqueUnAppareil(", page)
        self.assertIn('role="alert"', sans_commentaires(page))

    def test_la_reclamation_est_ecrite_comme_un_manque(self):
        textes = lire(TEXTES)
        for mot in ("Il manque un appareil", "device is missing"):
            self.assertIn(
                mot, textes,
                "la phrase de réclamation ne dit plus qu'il MANQUE quelque "
                f"chose (« {mot} » a disparu)")


# ---------------------------------------------------------------------------
# 7. Chaque entrée est notifiée
# ---------------------------------------------------------------------------

class ChaqueEntreeEstNotifiee(unittest.TestCase):
    """Une entrée qu'il n'a pas faite doit lui sauter aux yeux le jour même.

    C'est la différence avec la porte du client, où l'on ne prévient que depuis
    un appareil jamais vu.
    """

    def test_les_trois_chemins_annoncent_l_entree(self):
        porte = lire(ADMIN / "entree" / "page.tsx")
        bloc = re.search(r"async function entre\(\) \{(.*?)\n  \}", porte, re.S)
        self.assertIsNotNone(bloc, "la sortie commune des trois chemins a disparu")
        self.assertIn(
            "ROUTE_ANNONCER", bloc.group(1),
            "l'entrée n'est plus annoncée à l'intéressé")
        # Les trois chemins passent bien par là, et aucun ne se faufile.
        for chemin in ("EntrerAvecLeTelephone", "ROUTE_VERIFIER", "ROUTE_PAPIER"):
            self.assertIn(chemin, porte)
        self.assertEqual(
            porte.count("await entre()") + porte.count("void entre()"), 3,
            "un des trois chemins d'entrée ne passe plus par la sortie "
            "commune, donc il n'annonce plus rien")

    def test_la_route_ne_croit_pas_l_ecran_sur_parole(self):
        route = lire(API / "entree" / "annoncer" / "route.ts")
        self.assertIn(
            "entreesDe(", route,
            "le chemin emprunté n'est plus relu dans le journal : une lettre "
            "pourrait annoncer « par le verrouillage de votre téléphone » une "
            "entrée faite par mail")
        self.assertNotRegex(
            route, r"corps\?\.moyen|body.*moyen",
            "le chemin est repris du corps de la requête, donc il se ment")


if __name__ == "__main__":
    unittest.main()
