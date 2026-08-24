# -*- coding: utf-8 -*-
"""Plusieurs cartes dans le terminal : le robot demande, il ne devine pas.

Trois propriétés éprouvées ici :

  1. « /mtn » avec DEUX cartes MTN ne vise plus la première en silence —
     le robot pose la question, en boutons. Une caisse se choisit.
  2. Les boutons de compte ne s'arrêtent plus à quatre : ils se replient
     en rangées. Huit cartes tiennent.
  3. Le bilan des 24 h donne une ligne PAR caisse : additionner deux
     caisses donnait un chiffre qui ne correspond à aucun solde réel.
"""

import unittest

from totem.app import Robot
from totem.carte import Carte
from totem.compte import Compte
from totem.entrant import Entrant
from totem.simulator import ModemSimule
from totem.storage import Journal

from tests.test_experience_telegram import TransportEspion, donnees

MTN_A = Carte(iccid="89237010000000000011", imsi="624010000000011")
MTN_B = Carte(iccid="89237010000000000099", imsi="624010000000099")
ORANGE = Carte(iccid="89237020000000000022", imsi="624020000000022")


def robot(cartes, **kw):
    comptes = [Compte(ModemSimule(operateur=c.operateur), carte=c)
               for c in cartes]
    transport = TransportEspion((1,))
    r = Robot(comptes, transport, Journal(":memory:"),
              nom="T", pause_sms=1, **kw)
    return r, transport


def tape(r, texte, utilisateur=1):
    r._traiter(Entrant(texte=texte, utilisateur=utilisateur,
                       chat=utilisateur, message_id=7))


def dernier_envoi(t):
    return t.envois[-1][0] if t.envois else ""


def boutons_envoi(t):
    return t.envois[-1][1] if t.envois else []


class TestDeuxCartesDuMemeReseau(unittest.TestCase):

    def test_mtn_ambigu_pose_la_question(self):
        r, t = robot([MTN_A, MTN_B, ORANGE])
        avant = r.courant
        tape(r, "/mtn")
        self.assertIs(r.courant, avant, "le robot ne doit pas choisir seul")
        self.assertIn("which one", dernier_envoi(t))
        # La question porte les DEUX cartes MTN en boutons, et rien d'autre.
        cibles = [d for d in donnees(boutons_envoi(t)) if d.startswith("a:")]
        self.assertEqual(cibles, ["a:1", "a:2"])

    def test_le_rang_reste_sans_ambiguite(self):
        r, t = robot([MTN_A, MTN_B])
        tape(r, "/2")
        self.assertIs(r.courant, r.comptes[1])
        self.assertIn(r.comptes[1].libelle, dernier_envoi(t))

    def test_orange_sans_jumelle_bascule_directement(self):
        r, t = robot([MTN_A, MTN_B, ORANGE])
        tape(r, "/orange")
        self.assertIs(r.courant, r.comptes[2])

    def test_viser_par_nom_ambigu_conseille_le_rang(self):
        """« mtn *126# » avec deux MTN : pas de session, un conseil."""
        r, t = robot([MTN_A, MTN_B])
        tape(r, "mtn *126#")
        self.assertIn("rank", dernier_envoi(t))
        self.assertIn("*126#", dernier_envoi(t))
        self.assertIsNone(r.session_compte, "aucune session ne doit s'ouvrir")

    def test_viser_par_rang_ouvre_la_session_sur_la_bonne_carte(self):
        r, t = robot([MTN_A, MTN_B])
        tape(r, "2 *126#")
        self.assertIs(r.session_compte, r.comptes[1])


class TestLesBoutonsNeSArretentPlusAQuatre(unittest.TestCase):

    def test_cinq_cartes_donnent_deux_rangees(self):
        cartes = [Carte(iccid=f"8923701000000000001{i}", imsi="624010000000011")
                  for i in range(5)]
        r, _t = robot(cartes)
        rangees = r._rangees_comptes()
        self.assertEqual([len(x) for x in rangees], [4, 1])
        # Chaque carte garde son bouton — la cinquième n'est plus orpheline.
        self.assertEqual([d for _l, d in rangees[0]] + [rangees[1][0][1]],
                         ["a:1", "a:2", "a:3", "a:4", "a:5"])


class TestLeBilanParCaisse(unittest.TestCase):
    """L'accueil et le rapport de 21 h : une ligne par caisse."""

    def test_l_accueil_ventile_par_caisse(self):
        r, t = robot([MTN_A, ORANGE])
        r.journal.sms("MobileMoney",
                      "Vous avez recu 25 000 FCFA de NGONO Marie (677123456).",
                      r.comptes[0].libelle, iccid=MTN_A.iccid)
        r.journal.sms("OrangeMoney",
                      "Vous avez recu 5 000 FCFA de TCHOUMI Paul (699887766).",
                      r.comptes[1].libelle, iccid=ORANGE.iccid)
        tape(r, "/menu")
        corps = dernier_envoi(t)
        # Chaque caisse a sa ligne, avec SON montant — jamais la somme.
        self.assertIn("25,000", corps)
        self.assertIn("5,000", corps)
        self.assertNotIn("30,000", corps)

    def test_le_rapport_nomme_l_ensemble_pour_ce_qu_il_est(self):
        r, t = robot([MTN_A, ORANGE])
        r.journal.sms("MobileMoney",
                      "Vous avez recu 25 000 FCFA de NGONO Marie (677123456).",
                      r.comptes[0].libelle, iccid=MTN_A.iccid)
        tape(r, "/rapport")
        corps = dernier_envoi(t)
        self.assertIn(r.comptes[0].libelle, corps)
        self.assertIn(r.comptes[1].libelle, corps)
        self.assertIn("All boxes together", corps)

    def test_une_seule_carte_garde_le_bilan_simple(self):
        """Le terminal à une carte ne voit aucune différence."""
        r, t = robot([ORANGE])
        tape(r, "/menu")
        self.assertIn("Last 24 hours:", dernier_envoi(t))
        self.assertNotIn("All boxes together", dernier_envoi(t))


if __name__ == "__main__":
    unittest.main()
