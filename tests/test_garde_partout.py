# -*- coding: utf-8 -*-
"""Aucune porte dérobée : chaque page et chaque route passent par la garde.

Le contrôle d'accès est réparti à deux étages. Le middleware est le portail :
il tourne en « edge », ne fait aucun appel réseau, et refoule ce qui est
manifestement faux. La garde (`web/lib/garde.ts`) est la serrure : elle
interroge la base pour savoir si la session vit ENCORE — la seule question qui
compte le jour où une propriétaire reprend la clé de son opérateur, puisque le
jeton de celui-ci reste parfaitement signé.

Ce découpage a un défaut connu, et il est grave : une garde qu'il faut penser
à appeler est une garde qu'on oubliera. Un écran ajouté un vendredi soir, une
route de plus, et le trou est là — silencieux, invisible à la relecture.

D'où ce test. Il énumère les pages et les routes du dossier `web/app` et
vérifie que chacune passe par la garde. La discipline devient un contrôle.

Une nouvelle page ouverte à tous — il y en aura : l'invitation — s'ajoute
explicitement à la liste `OUVERTES` ci-dessous, avec sa raison écrite. Une
exception qu'on doit justifier par écrit n'est pas un oubli.
"""

import re
import unittest
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"
APP = WEB / "app"

# Ce qui n'a pas de garde, et pourquoi. Chaque ligne est une décision.
OUVERTES = {
    # La porte elle-même : on ne peut pas exiger d'être entré pour entrer.
    "app/connexion/page.tsx":
        "l'écran de connexion — exiger une session pour y accéder fermerait la porte à clé de l'intérieur",
    "app/api/connexion/route.ts":
        "la route qui ouvre la session ; elle a son propre contrôle, le mot de passe",
    "app/api/deconnexion/route.ts":
        "fermer une porte n'a jamais nui à personne : ce geste n'exige aucune preuve, "
        "et l'exiger reviendrait à refuser le seul geste utile à qui vient de se faire "
        "arracher son téléphone",
    # L'invitation : la personne qui l'ouvre n'a par définition pas de compte.
    # Exiger une session pour accepter une invitation reviendrait à demander
    # d'être déjà entré pour recevoir la clé. La page ne lit qu'une invitation,
    # par une empreinte qu'il faut connaître, et ne crée RIEN — le compte naît
    # après le code, à l'étape suivante.
    "app/invitation/[jeton]/page.tsx":
        "l'acceptation d'une invitation, ouverte par construction : elle ne "
        "crée rien, et le lien seul n'ouvre aucun compte sans le code envoyé "
        "sur l'adresse mail",
    # L'autre porte : entrer avec le verrouillage de son téléphone. Elle ne
    # peut pas exiger d'être entré, pour la même raison que /api/connexion.
    # Ce qui la garde n'est pas une session mais une SIGNATURE que seul le
    # téléphone de la personne sait produire, sur une phrase que nous venons
    # d'inventer et qui ne resservira pas. Et la signature ne suffit pas : la
    # route relit ensuite l'état de la personne et son accès EN BASE avant
    # d'ouvrir quoi que ce soit — un téléphone parfaitement valable dont la
    # clé a été reprise n'entre plus.
    "app/api/cle/entrer/route.ts":
        "la route qui ouvre la session par le téléphone ; son contrôle est la "
        "signature, puis la relecture du droit d'entrer en base",
    # Une redirection permanente, sans donnée.
    "app/sms/page.tsx":
        "ancienne adresse : elle ne fait que rediriger vers /encaissements, "
        "et la page d'arrivée est gardée",
    # Servi hors session par le navigateur lui-même.
    "app/manifest.ts":
        "le manifeste de l'application, réclamé par le navigateur avant toute session",
    # La coque : elle n'affiche aucune donnée par elle-même, et chaque page
    # qu'elle enveloppe est gardée pour son propre compte.
    "app/layout.tsx":
        "la coque HTML ; toutes les pages qu'elle enveloppe portent leur propre garde",
    "app/loading.tsx":
        "un squelette gris, sans aucune donnée",
}

APPELS_GARDE = re.compile(r"\b(exigerPresence|exigerPouvoir|garder)\s*\(")


def _relatif(f):
    return str(f.relative_to(WEB))


def pages():
    """Les pages rendues, hors composants."""
    trouve = []
    for f in sorted(APP.rglob("page.tsx")):
        trouve.append(f)
    for nom in ("layout.tsx", "loading.tsx", "manifest.ts"):
        p = APP / nom
        if p.exists():
            trouve.append(p)
    return trouve


def routes():
    return sorted(APP.rglob("route.ts"))


class GardePartout(unittest.TestCase):
    def test_chaque_page_passe_par_la_garde(self):
        manquantes = []
        for f in pages():
            rel = _relatif(f)
            if rel in OUVERTES:
                continue
            if not APPELS_GARDE.search(f.read_text(encoding="utf-8")):
                manquantes.append(rel)
        self.assertEqual(
            manquantes, [],
            "ces pages n'appellent pas la garde. Soit elles doivent le faire, "
            "soit elles rejoignent OUVERTES avec la raison écrite :\n  "
            + "\n  ".join(manquantes))

    def test_chaque_route_passe_par_la_garde(self):
        manquantes = []
        for f in routes():
            rel = _relatif(f)
            if rel in OUVERTES:
                continue
            if not APPELS_GARDE.search(f.read_text(encoding="utf-8")):
                manquantes.append(rel)
        self.assertEqual(
            manquantes, [],
            "ces routes n'appellent pas la garde — elles répondent donc à "
            "quiconque devine leur adresse :\n  " + "\n  ".join(manquantes))

    def test_la_garde_vient_avant_le_travail(self):
        """Une garde appelée après une lecture a déjà laissé fuir la donnée."""
        tardives = []
        for f in routes():
            rel = _relatif(f)
            if rel in OUVERTES:
                continue
            texte = f.read_text(encoding="utf-8")
            m = APPELS_GARDE.search(texte)
            if not m:
                continue
            avant = texte[:m.start()]
            # On tolère la lecture du corps de la requête et de la langue :
            # ni l'une ni l'autre ne révèle quoi que ce soit de la base.
            corps = re.sub(
                r"(await req\.json\(\)[^;]*;|await langueServeur\(\);"
                r"|const corps[^;]*;|const langue[^;]*;)", "", avant)
            if re.search(r"\bawait\s+(charger|lire|creer|definir|marquer)", corps):
                tardives.append(rel)
        self.assertEqual(
            tardives, [],
            "la garde arrive après une lecture ou une écriture dans :\n  "
            + "\n  ".join(tardives))

    def test_chaque_genre_de_commande_a_son_pouvoir(self):
        """Un genre oublié retomberait sur la valeur par défaut, en silence.

        La retombée est volontairement la plus stricte (« sortir_argent »),
        donc un oubli ferme au lieu d'ouvrir. Mais il bloquerait un opérateur
        qui a le droit — et personne ne comprendrait pourquoi.
        """
        route = (APP / "api" / "commande" / "route.ts").read_text(encoding="utf-8")
        bloc = re.search(r"const GENRES = new Set\(\[(.*?)\]\)", route, re.S)
        self.assertIsNotNone(bloc, "la liste des genres a changé de forme")
        genres = set(re.findall(r'"(\w+)"', bloc.group(1)))

        roles = (WEB / "lib" / "roles.ts").read_text(encoding="utf-8")
        table = re.search(
            r"POUVOIR_PAR_COMMANDE: Record<string, Pouvoir> = \{(.*?)\n\};",
            roles, re.S)
        self.assertIsNotNone(table, "la table des pouvoirs a changé de forme")
        declares = set(re.findall(r"^\s*(\w+):", table.group(1), re.M))

        self.assertEqual(
            genres - declares, set(),
            "ces genres de commande n'ont pas de pouvoir déclaré dans "
            "lib/roles.ts — ils retomberaient sur la règle la plus stricte "
            "et refuseraient quelqu'un qui a pourtant le droit")

    def test_le_verrou_est_ferme_par_defaut(self):
        """Sans clé, on ne sert rien.

        Le middleware faisait l'inverse : pas de `SESSION_SECRET`, pas de
        verrou. Un aperçu Vercel sans cette variable servait donc la
        comptabilité complète à qui devinait l'adresse. Un défaut qui s'ouvre
        n'est pas un défaut, c'est une porte.
        """
        m = (WEB / "middleware.ts").read_text(encoding="utf-8")
        self.assertNotRegex(
            m, r"if \(!secret\) return NextResponse\.next\(\)",
            "le middleware laisse tout passer quand SESSION_SECRET manque")
        self.assertIn("503", m,
                      "sans clé, le middleware doit refuser de servir (503)")

    def test_le_super_admin_ne_peut_pas_faire_sortir_d_argent(self):
        """La séparation est structurelle, pas contractuelle.

        Nelson en France a le pouvoir technique ; Mme Ngo à Douala a l'argent.
        Que l'administration puisse déplacer les fonds ferait de la console une
        porte dérobée du point de vue de qui les possède.
        """
        roles = (WEB / "lib" / "roles.ts").read_text(encoding="utf-8")
        bloc = re.search(r"admin: \[(.*?)\]", roles, re.S)
        self.assertIsNotNone(bloc, "le rôle « admin » a disparu de la table")
        self.assertNotIn("sortir_argent", bloc.group(1),
                         "le super-admin peut faire sortir de l'argent")

    def test_la_deconnexion_ferme_vraiment(self):
        """Tant qu'elle n'efface qu'un cookie, l'écran n'a pas le droit
        d'écrire « déconnecté » : ce serait mentir."""
        r = (APP / "api" / "deconnexion" / "route.ts").read_text(encoding="utf-8")
        self.assertRegex(
            r, r"fermerSession|fermerToutesLesSessions",
            "la déconnexion n'efface qu'un cookie ; un jeton recopié ailleurs "
            "resterait valable jusqu'à son expiration")


if __name__ == "__main__":
    unittest.main()
