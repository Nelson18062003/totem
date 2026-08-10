# -*- coding: utf-8 -*-
"""Les gens du commerce : ce qui doit rester vrai quand l'écran changera.

Cinq règles vivent dans cet écran, et elles ont toutes la même vilaine
propriété : quand on les casse, RIEN NE SE VOIT. Une route dont le pouvoir
exigé glisse de « gerer_les_gens » à « lire » continue de répondre — mieux
qu'avant, même. Un retrait de clé qui oublie de fermer les sessions coche
parfaitement sa case : la personne apparaît « sans accès » dans la liste, et
son onglet reste ouvert jusqu'au soir. Un « delete » à la place d'un
« update » nettoie la table sans un message d'erreur.

D'où ces contrôles. Ils lisent le code source, parce que c'est là que ces
décisions se prennent — et qu'un test d'exécution ne verrait pas la
différence entre les deux versions.
"""

import re
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
WEB = RACINE / "web"
GENS = WEB / "app" / "gens"
API = WEB / "app" / "api" / "gens"
ROLES = WEB / "lib" / "roles.ts"
TEXTES = WEB / "lib" / "textes" / "gens.ts"
ACCUEIL = WEB / "app" / "page.tsx"
GUICHET = WEB / "app" / "accueil-client.tsx"

# Les quatre gestes qui touchent aux clés. Chacun a sa route.
ROUTES = ["inviter", "annuler", "retirer", "appareil"]

# Le pouvoir qu'il faut pour distribuer et reprendre les clés.
POUVOIR = "gerer_les_gens"


def lu(chemin):
    return chemin.read_text(encoding="utf-8")


def pouvoirs_du_role(role):
    """Les pouvoirs d'un rôle, lus dans la table de lib/roles.ts."""
    bloc = re.search(rf"^\s*{role}: \[(.*?)\],\s*$", lu(ROLES), re.S | re.M)
    assert bloc, f"le rôle « {role} » a disparu de lib/roles.ts"
    return set(re.findall(r'"(\w+)"', bloc.group(1)))


class LesGens(unittest.TestCase):

    # --- 1. Un opérateur n'invite personne ---------------------------------

    def test_un_operateur_ne_peut_pas_inviter(self):
        """Le refus est SERVEUR. Un écran qui ne propose pas ne protège rien :
        il suffit d'appeler la route à la main depuis la console du
        navigateur."""
        for role in ("operateur", "lecteur", "admin"):
            self.assertNotIn(
                POUVOIR, pouvoirs_du_role(role),
                f"le rôle « {role} » peut distribuer les clés du commerce")
        self.assertIn(
            POUVOIR, pouvoirs_du_role("proprietaire"),
            "le propriétaire ne peut plus distribuer les clés de son commerce")

        for nom in ROUTES:
            route = API / nom / "route.ts"
            self.assertTrue(route.exists(), f"la route « {nom} » a disparu")
            self.assertIn(
                f'garder("{POUVOIR}")', lu(route),
                f"la route « {nom} » n'exige pas « {POUVOIR} » : un opérateur "
                "qui l'appelle à la main obtiendrait ce que l'écran lui refuse")

    def test_la_page_des_gens_exige_le_meme_pouvoir(self):
        self.assertIn(
            f'exigerPouvoir("{POUVOIR}")', lu(GENS / "page.tsx"),
            "la page des gens s'ouvre à qui n'a pas à distribuer de clés")

    def test_la_plateforme_ne_se_donne_pas_depuis_une_boutique(self):
        """Fabriquer un administrateur de la plateforme depuis le formulaire
        d'une boutique serait une porte dérobée dans l'autre sens."""
        bloc = re.search(r"DONNABLES: readonly Role\[\] = \[(.*?)\]",
                         lu(API / "inviter" / "route.ts"), re.S)
        self.assertIsNotNone(bloc, "la liste des rôles donnables a changé de forme")
        self.assertNotIn('"admin"', bloc.group(1),
                         "une propriétaire peut créer un administrateur de la plateforme")

    # --- 2. Reprendre une clé ferme les sessions, dans le même geste -------

    def test_retirer_un_acces_ferme_les_sessions(self):
        """Dater « retire_le » empêche la PROCHAINE entrée. Ça ne ferme pas
        l'onglet resté ouvert sur le téléphone de quelqu'un qui vient de
        partir à 18 h — et c'est ce cas-là qui a fait construire la table des
        sessions. L'écran promet « dans la seconde »."""
        texte = lu(API / "retirer" / "route.ts")
        self.assertIn("fermerToutesLesSessions(", texte,
                      "reprendre une clé ne ferme aucune session en cours : "
                      "le téléphone reste ouvert jusqu'à ce soir")
        self.assertIn("retire_le", texte,
                      "reprendre une clé ne date rien dans « acces »")
        # L'ordre compte : on date d'abord, on ferme ensuite. Fermer sans
        # dater rouvrirait à la prochaine entrée.
        self.assertLess(
            texte.index("retire_le:"), texte.index("fermerToutesLesSessions("),
            "les sessions se ferment avant que l'accès ne soit daté")

    def test_l_ecran_dit_que_c_est_immediat(self):
        """« C'est immédiat » ne se devine pas. Si l'écran ne l'écrit pas,
        personne ne sait que le téléphone se ferme dans la seconde — et la
        propriétaire appellera quelqu'un au lieu d'appuyer."""
        textes = lu(TEXTES)
        bloc = re.search(r"consequences: \[(.*?)\],\s*$", textes, re.S | re.M)
        self.assertIsNotNone(bloc, "les suites du retrait ont disparu des textes")
        self.assertRegex(
            bloc.group(1), r"within the second",
            "l'anglais ne dit plus que la fermeture est immédiate")
        self.assertRegex(
            textes, r"dans la seconde",
            "le français ne dit plus que la fermeture est immédiate")

    # --- 3. Rien ne s'efface -----------------------------------------------

    def test_rien_ne_s_efface(self):
        """On date : « retire_le », « annulee_le », « revoquee_le ». Un employé
        qui part fâché est exactement le moment où l'historique doit rester
        entier."""
        fautes = []
        for fichier in sorted(list(API.rglob("*.ts")) + list(GENS.rglob("*.tsx"))):
            texte = lu(fichier)
            if "effacer(" in texte or '"DELETE"' in texte or "delete(" in texte:
                fautes.append(fichier.name)
        self.assertEqual(
            fautes, [],
            "ces fichiers effacent au lieu de dater :\n  " + "\n  ".join(fautes))

    def test_une_personne_dont_la_cle_est_reprise_reste_dans_la_liste(self):
        """Elle a tenu le comptoir, ses reçus portent son nom. Une liste qui
        l'oublie est une liste qui ment le jour où il faut relire cette
        période."""
        texte = lu(GENS / "page.tsx")
        requete = re.search(r"`acces\?commerce=eq\.[^`]*`", texte, re.S)
        self.assertIsNotNone(requete, "la lecture des accès a changé de forme")
        self.assertNotIn(
            "retire_le=is.null", requete.group(0),
            "la liste des gens ne lit que les accès vivants : ceux dont la clé "
            "a été reprise disparaissent de l'écran")
        self.assertIn("partis", texte,
                      "l'écran n'a plus de section pour ceux qui n'ont plus de clé")

    # --- 4. Les quatre rôles, en toutes lettres, dans les deux langues -----

    def test_les_quatre_roles_ont_un_libelle_dans_les_deux_langues(self):
        """« operateur » ne sort pas de la base. Le propriétaire n'est pas
        informaticien : il lit « au comptoir »."""
        techniques = ["proprietaire", "operateur", "lecteur", "admin"]
        blocs = re.findall(r"\n  role: \{(.*?)\n  \},", lu(TEXTES), re.S)
        self.assertEqual(
            len(blocs), 2,
            "les rôles ne sont plus nommés dans exactement deux langues")
        for bloc in blocs:
            noms = dict(re.findall(r"(\w+): \"([^\"]*)\"", bloc))
            self.assertEqual(
                sorted(noms), sorted(techniques),
                "les quatre rôles ne sont pas tous nommés")
            for cle, libelle in noms.items():
                self.assertTrue(libelle.strip(), f"le rôle « {cle} » n'a pas de nom")
                self.assertNotIn(
                    cle, libelle.lower(),
                    f"le rôle « {cle} » s'affiche avec son mot technique "
                    f"(« {libelle} ») au lieu d'être écrit en toutes lettres")

    def test_chaque_role_dit_ce_qu_il_permet_et_ce_qu_il_interdit(self):
        """Un rôle qu'on découvre par un refus se vit comme une panne."""
        textes = lu(TEXTES)
        for table in ("permet", "interdit"):
            blocs = re.findall(rf"\n  {table}: \{{(.*?)\n  \}},", textes, re.S)
            self.assertEqual(len(blocs), 2,
                             f"« {table} » n'existe plus dans les deux langues")
            for bloc in blocs:
                for role in ("proprietaire", "operateur", "lecteur", "admin"):
                    self.assertRegex(
                        bloc, rf"{role}: \[\s*\"",
                        f"« {table} » ne dit rien du rôle « {role} »")

    # --- 5. L'accueil ne montre pas ce que le rôle refuse ------------------

    def test_l_accueil_ne_montre_aucun_geste_de_guichet_sans_le_pouvoir(self):
        """Composer un code sur la puce est le genre « ussd », réservé au
        propriétaire — même pour un solde. Montrer ces boutons au comptoir,
        c'est promettre six refus."""
        self.assertEqual(
            "sortir_argent", re.search(
                r"peutComposer = peut\(moi\.role, \"(\w+)\"\)", lu(ACCUEIL)).group(1),
            "le guichet de l'accueil ne s'adosse plus au pouvoir de sortir l'argent")
        self.assertIn(
            "peutComposer={peutComposer}", lu(ACCUEIL),
            "l'accueil n'indique plus au guichet ce que le rôle permet")

        guichet = lu(GUICHET)
        self.assertRegex(
            guichet, r"\.filter\(\([^)]*\) => peutComposer",
            "les gestes du guichet ne dépendent plus du pouvoir : ils "
            "s'afficheraient pour tout le monde")
        self.assertIn(
            "{peutComposer && (", guichet,
            "la flèche du solde et la grille des gestes ne sont plus conditionnées")

    def test_l_accueil_n_ouvre_la_fiche_de_travail_qu_au_comptoir(self):
        """La fiche d'un SMS choisit sa nature, établit le reçu et le marque
        lu : trois gestes que « lire » refuse. Les offrir à un lecteur est une
        panne déguisée."""
        texte = lu(ACCUEIL)
        self.assertLess(
            texte.index("tientLeComptoir ? ("), texte.index("<DerniersSms"),
            "la fiche de travail des SMS s'ouvre sans le pouvoir du comptoir")
        self.assertIn("<ListeLecture", texte,
                      "sans le comptoir, l'accueil n'a plus de liste en lecture seule")

    def test_le_chemin_des_gens_n_apparait_qu_a_qui_distribue_les_cles(self):
        """Montrer un menu qui refusera est une panne déguisée."""
        texte = lu(ACCUEIL)
        self.assertEqual(
            "gerer_les_gens", re.search(
                r"distribueLesCles = peut\(moi\.role, \"(\w+)\"\)", texte).group(1),
            "le lien vers les gens ne s'adosse plus au bon pouvoir")
        self.assertLess(
            texte.index("{distribueLesCles && ("), texte.index('href="/gens"'),
            "le lien vers les gens s'affiche sans condition de rôle")

    def test_l_absence_d_un_geste_est_expliquee(self):
        """Un bouton absent se contourne, un refus expliqué enseigne. Là où le
        guichet manque, l'écran dit à qui il appartient — et comment le
        joindre, avec un numéro."""
        texte = lu(ACCUEIL)
        self.assertIn("{!peutComposer && !estPlateforme && (", texte,
                      "l'accueil ne dit plus à qui appartient l'envoi d'argent")
        self.assertIn("tel:", texte,
                      "« demandez au propriétaire » sans numéro n'est pas un chemin")


if __name__ == "__main__":
    unittest.main()
