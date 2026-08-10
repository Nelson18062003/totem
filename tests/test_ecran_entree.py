# -*- coding: utf-8 -*-
"""L'écran d'entrée de tous les jours (C5) tient-il ses promesses ?

C'est l'écran le plus vu de la plateforme, et le seul que voit quelqu'un qui
n'est pas encore entré. Quatre de ses règles ne se voient pas à la relecture,
parce qu'un écran qui les enfreint MARCHE PARFAITEMENT :

  · un écran qui répond « cette adresse n'a pas de compte » entre très bien —
    il est seulement devenu l'annuaire des clients de TOTEM, et il suffit de
    taper des adresses pour le lire ;
  · un mot de passe remonté en haut de l'écran entre très bien — il a
    seulement redonné à un chemin réservé à une personne l'apparence de la
    voie normale ;
  · la phrase sur le code PIN peut disparaître sans qu'aucun test d'exécution
    ne s'en aperçoive, et c'est elle qui protège contre l'hameçonnage, parce
    que c'est la personne qu'on hameçonne, pas la machine ;
  · « je n'arrive plus à entrer » peut sauter d'un coup de ciseaux, et l'écran
    devient un cul-de-sac le jour exact où quelqu'un est déjà en panique.

Aucune de ces règles ne peut donc rester une intention écrite dans un
commentaire. Ce fichier les relit dans le code source.
"""

import re
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
WEB = RACINE / "web"

ECRAN = WEB / "app" / "connexion" / "page.tsx"
SAISIE = WEB / "app" / "entrer" / "page.tsx"
RACCORD = WEB / "app" / "entrer" / "raccord.ts"
PAPIER = WEB / "app" / "api" / "entrer" / "papier" / "route.ts"
TEXTES = WEB / "lib" / "textes" / "connexion.ts"

# Les trois chemins, tels qu'ils se reconnaissent dans l'écran. On cherche
# l'USAGE et non le nom : une ligne d'import laissée derrière un chemin
# supprimé ferait passer le test sur un écran qui n'offre plus rien.
CHEMINS = {
    "le verrouillage du téléphone": "<EntrerAvecLeTelephone",
    "le code par mail": "await demanderUnCode(",
    "le papier de dix codes": "/api/entrer/papier",
}


def lire(fichier):
    return fichier.read_text(encoding="utf-8")


def corps_de(source, signature):
    """Le corps d'une fonction, de sa signature à son accolade de fin."""
    debut = source.index(signature)
    fin = source.index("\n}\n", debut)
    return source[debut:fin]


class EcranEntree(unittest.TestCase):

    # --- Rien ne dit si un compte existe -----------------------------------

    def test_la_demande_de_code_ne_lit_jamais_la_reponse(self):
        """Saisir une adresse inconnue doit produire EXACTEMENT ce que produit
        une adresse connue.

        Il suffit d'un « if (r.ok) » pour que l'écran devienne un annuaire :
        on tape une adresse, on lit la réponse, on sait qui est client de
        TOTEM. La seule façon de ne rien laisser filtrer est de ne pas
        regarder — d'où une demande qui ne rend rien et ne teste rien.
        """
        corps = corps_de(lire(RACCORD), "export async function demanderUnCode")
        self.assertIn("await fetch(", corps,
                      "la demande de code ne part plus")
        self.assertIsNone(
            re.search(r"(const|let|var)\s+\w+\s*=\s*await fetch", corps),
            "la réponse à la demande de code est retenue dans une variable — "
            "elle finira par être lue, et l'écran dira si le compte existe")
        for indice in (".ok", "status", ".json("):
            self.assertNotIn(
                indice, corps,
                f"la demande de code regarde « {indice} » : la réponse du "
                "serveur ne doit jamais changer ce que la personne voit")

    def test_la_route_du_papier_refuse_toujours_de_la_meme_facon(self):
        """Adresse inconnue, code faux, code déjà servi, compte suspendu,
        accès retiré : une seule phrase, un seul code de réponse.

        Distinguer ces cas apprend à qui essaie. « Ce code a déjà servi » dit
        que le code existait ; « compte fermé » dit que le compte existe.
        """
        route = lire(PAPIER)
        refus = [s for s in re.findall(r"status:\s*(\d{3})", route)
                 if s.startswith("4")]
        self.assertEqual(
            len(refus), 1,
            "la route du papier a plus d'une réponse de refus : "
            f"{refus}. Elles doivent toutes sortir par « refuser() »")
        self.assertGreaterEqual(
            route.count("return refuser(langue)"), 3,
            "les chemins de refus ne passent plus tous par la même sortie")

    def test_la_route_du_papier_travaille_meme_sur_une_adresse_inconnue(self):
        """La durée de la réponse ne doit pas dire ce que la phrase tait.

        Partir dès qu'on ne trouve pas la personne ferait répondre cette route
        deux fois plus vite pour une adresse sans compte. Le chronomètre lit
        aussi bien qu'un message d'erreur.
        """
        route = lire(PAPIER)
        self.assertIn("consommerCodePapier(code,", route,
                      "la route n'appelle plus le papier")
        entre = route[route.index("const personne = await lireUne"):
                      route.index("consommerCodePapier(code,")]
        self.assertNotIn(
            "return", entre,
            "la route s'arrête avant d'avoir fait le travail quand l'adresse "
            "est inconnue : sa durée de réponse trahit l'existence du compte")

    def test_aucun_texte_ne_parle_de_compte_inexistant(self):
        """Et la phrase qui suit l'envoi reste au conditionnel."""
        textes = lire(TEXTES)
        for interdit in ("no account", "unknown address", "not registered",
                         "pas de compte", "adresse inconnue", "n’existe pas"):
            self.assertNotIn(
                interdit.lower(), textes.lower(),
                f"un texte de l'écran d'entrée dit « {interdit} » — il "
                "renseigne alors sur l'existence des comptes")
        self.assertIn("If ${adresse} has an account", textes)
        self.assertIn("Si ${adresse} a un compte", textes)

    # --- Les trois chemins, présents et nommés ------------------------------

    def test_les_trois_chemins_sont_la(self):
        ecran = lire(ECRAN)
        for quoi, marque in CHEMINS.items():
            self.assertIn(marque, ecran, f"{quoi} a disparu de l'écran d'entrée")

    def test_les_trois_chemins_sont_nommes_dans_les_deux_langues(self):
        """Un chemin qu'on ne nomme pas est un chemin qu'on ne trouve pas le
        jour où on en a besoin — et ce jour-là, on est déjà en panique."""
        textes = lire(TEXTES)
        for cle in ("avecLeTelephone", "parMailTitre", "papierTitre"):
            trouves = re.findall(rf'\n  {cle}:\s*\n?\s*"([^"]+)"', textes)
            self.assertEqual(
                len(trouves), 2,
                f"« {cle} » n'est pas écrit dans les deux langues")
            self.assertTrue(all(t.strip() for t in trouves),
                            f"« {cle} » est vide dans une des deux langues")

    def test_le_papier_est_replie_mais_lisible_sans_rien_ouvrir(self):
        """Son nom se lit fermé ; un doigt suffit à le déplier."""
        ecran = lire(ECRAN)
        self.assertIn("t.papierTitre", ecran,
                      "le nom du papier ne s'affiche plus nulle part")
        avant = ecran[:ecran.index("t.papierTitre")]
        self.assertIn("<details", avant, "le papier n'est plus repliable")
        bloc = avant[avant.rindex("<details"):]
        self.assertNotIn("</details>", bloc,
                         "le nom du papier est tombé hors du bloc repliable")
        self.assertIn("<summary", bloc,
                      "le nom du papier ne se lit plus sans ouvrir le bloc")

    # --- Le mot de passe fondateur n'est plus la voie normale ---------------

    def test_le_mot_de_passe_vient_apres_les_trois_chemins(self):
        """Il reste — c'est la seule porte du propriétaire fondateur tant que
        son compte à son nom n'existe pas — mais il ne s'ouvre plus le
        premier, et il est nommé par son destinataire et non par sa forme."""
        ecran = lire(ECRAN)
        passe = ecran.index('type="password"')
        for quoi, marque in CHEMINS.items():
            self.assertLess(
                ecran.index(marque), passe,
                f"le mot de passe passe devant {quoi} : il redevient la voie "
                "normale alors qu'il ne sert qu'à une seule personne")
        self.assertLess(
            ecran.index("t.fondateurTitre"), passe,
            "le champ n'est plus annoncé par « je suis le propriétaire "
            "fondateur » : intitulé « mot de passe », il s'adresse de nouveau "
            "à tout le monde")

    # --- Ce qui doit rester en bas -----------------------------------------

    def test_la_phrase_sur_le_pin_est_la(self):
        """TOTEM ne demande jamais le code PIN Mobile Money pour entrer.

        Cette phrase ne rassure pas : elle protège. C'est la personne qu'on
        hameçonne, pas la machine.
        """
        ecran = lire(ECRAN)
        self.assertIn("t.notePin", ecran, "la phrase sur le code PIN a sauté")
        self.assertLess(
            ecran.index("/api/entrer/papier"), ecran.index("t.notePin"),
            "la phrase sur le code PIN n'est plus en bas de l'écran")
        textes = lire(TEXTES)
        self.assertIn("Mobile Money PIN is never asked for here", textes)
        self.assertIn("code PIN Mobile Money n’est jamais demandé ici", textes)

    def test_le_lien_pour_qui_n_arrive_plus_a_entrer_est_la(self):
        """Un écran d'entrée n'est jamais un cul-de-sac."""
        for fichier in (ECRAN, SAISIE):
            source = lire(fichier)
            self.assertIn(
                'href="/retour"', source,
                f"{fichier.name} ne porte plus le chemin de secours vers /retour")
            self.assertIn("t.plusEntrer", source,
                          f"{fichier.name} n'écrit plus « je n'arrive plus à entrer »")

    # --- Les deux règles d'écran -------------------------------------------

    def test_la_bascule_de_langue_vient_avant_tout_le_reste(self):
        """Quelqu'un qui n'est pas encore entré n'a jamais choisi sa langue."""
        for fichier in (ECRAN, SAISIE):
            source = lire(fichier)
            self.assertIn("<BasculeLangue", source,
                          f"{fichier.name} n'offre plus le choix de la langue")
            self.assertLess(
                source.index("<BasculeLangue"), source.index("<h1"),
                f"dans {fichier.name}, la bascule de langue passe après le "
                "titre : elle n'est plus le premier geste possible")

    def test_un_champ_de_code_ne_se_laisse_pas_couper(self):
        """On y colle « 408 913 » avec son espace, et « 4TR9 KMX2 » avec le
        sien. Une longueur maximale coupe le collage sans rien dire."""
        for fichier in (ECRAN, SAISIE):
            self.assertNotIn(
                "maxLength", lire(fichier),
                f"{fichier.name} borne un champ : un code collé avec ses "
                "espaces s'y ferait tronquer en silence")


if __name__ == "__main__":
    unittest.main()
