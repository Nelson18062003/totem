# -*- coding: utf-8 -*-
"""Le compte qui existe vraiment aujourd'hui peut-il encore travailler ?

Une matrice de droits juste sur le papier peut rendre l'application
inutilisable. C'est arrivé ici : en donnant au compte fondateur le rôle
« admin » — au motif, correct en soi, qu'un administrateur ne doit pas
déplacer d'argent — le guichet, la console USSD et les six genres de commande
lui devenaient interdits. La plateforme était verrouillée pour la seule
personne qui s'en sert.

Ce test relit les droits tels qu'ils sont écrits dans le code et vérifie que
le compte ouvert par `TOTEM_MOT_DE_PASSE` atteint chaque écran et chaque
commande. Il vérifie aussi l'inverse : qu'un lecteur ne peut rien écrire, et
qu'aucun rôle ne peut tout faire.
"""

import re
import unittest
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"
APP = WEB / "app"


def pouvoirs_par_role():
    """La table des droits, relue depuis lib/roles.ts."""
    s = (WEB / "lib" / "roles.ts").read_text(encoding="utf-8")
    bloc = re.search(r"const POUVOIRS: Record<Role, readonly Pouvoir\[\]> = \{(.*?)\n\};",
                     s, re.S)
    assert bloc, "la table des pouvoirs a changé de forme"
    table = {}
    for role, liste in re.findall(r"^\s*(\w+): \[([^\]]*)\]", bloc.group(1), re.M):
        table[role] = set(re.findall(r'"(\w+)"', liste))
    return table


def pouvoir_du_repli():
    """Le rôle donné au compte fondateur quand aucun accès n'est en base."""
    s = (WEB / "lib" / "comptes.ts").read_text(encoding="utf-8")
    m = re.search(r'role: acces\?\.role \?\? "(\w+)"', s)
    assert m, "le rôle de repli n'est plus repérable dans comptes.ts"
    return m.group(1)


def pouvoirs_exiges_par_page():
    """Ce que chaque page réclame, relu dans les pages elles-mêmes."""
    exiges = {}
    for f in sorted(APP.rglob("page.tsx")):
        m = re.search(r'exigerPouvoir\("(\w+)"\)', f.read_text(encoding="utf-8"))
        if m:
            exiges[str(f.relative_to(APP))] = m.group(1)
    return exiges


def pouvoirs_par_commande():
    s = (WEB / "lib" / "roles.ts").read_text(encoding="utf-8")
    bloc = re.search(r"POUVOIR_PAR_COMMANDE: Record<string, Pouvoir> = \{(.*?)\n\};",
                     s, re.S)
    assert bloc
    return dict(re.findall(r"^\s*(\w+): \"(\w+)\"", bloc.group(1), re.M))


class AccesReel(unittest.TestCase):
    def setUp(self):
        self.roles = pouvoirs_par_role()
        self.repli = pouvoir_du_repli()

    def test_le_compte_fondateur_atteint_chaque_ecran(self):
        """Celui qui entre avec le mot de passe tient son comptoir : aucun
        écran ne doit lui être fermé tant qu'il est seul sur la plateforme."""
        siens = self.roles[self.repli]
        fermes = {p: v for p, v in pouvoirs_exiges_par_page().items() if v not in siens}
        self.assertEqual(
            fermes, {},
            f"le compte fondateur (« {self.repli} ») n'atteint pas ces écrans : "
            f"{fermes} — l'application serait verrouillée pour la seule personne "
            "qui s'en sert")

    def test_le_compte_fondateur_peut_demander_chaque_commande(self):
        siens = self.roles[self.repli]
        refusees = {c: v for c, v in pouvoirs_par_commande().items() if v not in siens}
        self.assertEqual(
            refusees, {},
            f"le compte fondateur (« {self.repli} ») ne peut pas demander : {refusees}")

    def test_un_lecteur_n_ecrit_rien(self):
        """Il lit, il télécharge, et rien d'autre."""
        siens = self.roles["lecteur"]
        self.assertEqual(siens, {"lire"},
                         "le rôle « lecteur » a gagné un pouvoir d'écriture")
        for commande, pouvoir in pouvoirs_par_commande().items():
            self.assertNotIn(
                pouvoir, siens,
                f"un lecteur peut demander « {commande} »")

    def test_un_operateur_ne_fait_pas_sortir_d_argent(self):
        """La promesse portée à l'écran par C7 : « envoyer de l'argent
        appartient à Mme Fotso »."""
        self.assertNotIn("sortir_argent", self.roles["operateur"])
        self.assertNotIn("gerer_les_gens", self.roles["operateur"],
                         "un opérateur peut distribuer des clés")

    def test_aucun_role_ne_peut_tout_faire(self):
        """Un rôle qui a tous les pouvoirs annule la raison d'avoir des rôles."""
        tous = set().union(*self.roles.values())
        for role, siens in self.roles.items():
            self.assertNotEqual(
                siens, tous, f"le rôle « {role} » a tous les pouvoirs")

    def test_seul_le_proprietaire_distribue_les_cles(self):
        porteurs = [r for r, p in self.roles.items() if "gerer_les_gens" in p]
        self.assertEqual(
            porteurs, ["proprietaire"],
            "distribuer et reprendre les clés d'un commerce n'appartient qu'à "
            f"son propriétaire — or : {porteurs}")


if __name__ == "__main__":
    unittest.main()
