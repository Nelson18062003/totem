# -*- coding: utf-8 -*-
"""Raccourcis appris : faire l'opération une fois, en garder un bouton.

Les codes USSD n'ont rien d'universel — le solde est « *126# puis 5 puis 1 »
chez l'un, « #148*5# » chez l'autre. Les deviner serait irresponsable : une
erreur de chiffre envoie de l'argent ailleurs. Le robot les apprend donc en
regardant l'utilisateur faire.

Deux propriétés comptent plus que le reste, et sont testées ici en priorité :

  1. **Le code secret n'entre jamais dans un raccourci.** Un bouton qui
     rejouerait le PIN serait un transfert en un clic, sans confirmation.
  2. **Les données propres à une opération non plus** — un montant, un
     bénéficiaire. Rejouer le montant d'hier serait au mieux faux, au pire
     coûteux. Un raccourci mène jusqu'à la question ; l'utilisateur répond.
"""

import unittest

from totem.app import Robot
from totem.carte import Carte
from totem.compte import Compte
from totem.entrant import Entrant
from totem.simulator import ModemSimule
from totem.storage import Journal

from tests.test_experience_telegram import TransportEspion, donnees, libelles

MTN = Carte(iccid="89237010000000000011", imsi="624010000000011")
ORANGE = Carte(iccid="89237020000000000022", imsi="624020000000022")


def robot(carte=MTN, **kw):
    """Un robot dont la carte est identifiée — sans quoi le robot ne saurait
    pas à quel opérateur rattacher un raccourci."""
    operateur = "MTN" if carte is MTN else "Orange"
    modem = ModemSimule(operateur=operateur)
    transport = TransportEspion((1,))
    r = Robot([Compte(modem, carte=carte)], transport, Journal(":memory:"),
              nom="T", pause_sms=1, **kw)
    return r, transport, modem


def dernier_envoi(t):
    """Le dernier message *envoyé*, pas la carte de session réécrite en place.

    Le harnais commun privilégie la dernière édition ; après une session USSD
    celle-ci reste figée sur le menu, et masquerait les messages qui suivent.
    """
    return t.envois[-1][0] if t.envois else ""


def boutons_envoi(t):
    return t.envois[-1][1] if t.envois else []


def tape(r, texte, utilisateur=1):
    r._traiter(Entrant(texte=texte, utilisateur=utilisateur,
                       chat=utilisateur, message_id=7))


def clic(r, donnee, utilisateur=1):
    r._traiter(Entrant(texte=donnee, bouton=True, callback_id="cb",
                       utilisateur=utilisateur, chat=utilisateur))


class TestRegistre(unittest.TestCase):
    """Le rangement : par opérateur, jamais par carte."""

    def setUp(self):
        self.journal = Journal(":memory:")

    def test_ajouter_puis_relire(self):
        self.journal.ajouter_raccourci("MTN", "solde", "💰 Solde",
                                       ["*126#", "5", "1"])
        appris = self.journal.raccourcis("MTN")
        self.assertEqual(appris["solde"]["etapes"], ["*126#", "5", "1"])
        self.assertEqual(appris["solde"]["libelle"], "💰 Solde")

    def test_les_operateurs_ne_se_melangent_pas(self):
        self.journal.ajouter_raccourci("MTN", "solde", "Solde", ["*126#", "5", "1"])
        self.journal.ajouter_raccourci("Orange", "solde", "Solde", ["#148*5#"])
        self.assertEqual(self.journal.raccourcis("MTN")["solde"]["etapes"],
                         ["*126#", "5", "1"])
        self.assertEqual(self.journal.raccourcis("Orange")["solde"]["etapes"],
                         ["#148*5#"])

    def test_deux_cartes_du_meme_operateur_partagent_les_boutons(self):
        """Les codes appartiennent au réseau, pas à la puce : changer de SIM
        MTN pour une autre SIM MTN ne doit rien faire disparaître."""
        self.journal.ajouter_raccourci("MTN", "solde", "Solde", ["*126#", "5"])
        self.assertIn("solde", self.journal.raccourcis("MTN"))

    def test_reenregistrer_remplace(self):
        self.journal.ajouter_raccourci("MTN", "solde", "Solde", ["*126#", "5"])
        self.journal.ajouter_raccourci("MTN", "solde", "Solde", ["*126*5#"])
        self.assertEqual(len(self.journal.raccourcis("MTN")), 1)
        self.assertEqual(self.journal.raccourcis("MTN")["solde"]["etapes"],
                         ["*126*5#"])

    def test_supprimer(self):
        self.journal.ajouter_raccourci("MTN", "solde", "Solde", ["*126#"])
        self.assertTrue(self.journal.supprimer_raccourci("MTN", "solde"))
        self.assertEqual(self.journal.raccourcis("MTN"), {})
        self.assertFalse(self.journal.supprimer_raccourci("MTN", "solde"))

    def test_refus_des_enregistrements_vides(self):
        self.assertFalse(self.journal.ajouter_raccourci("MTN", "x", "X", []))
        self.assertFalse(self.journal.ajouter_raccourci("", "x", "X", ["*1#"]))


class TestCeQuiEstRetenu(unittest.TestCase):
    """La trace : la navigation, et rien d'autre."""

    def test_le_parcours_du_solde_est_retenu(self):
        r, _, _ = robot()
        tape(r, "*126#")
        clic(r, "u:5")
        clic(r, "u:1")          # le solde s'affiche, la session se referme
        self.assertEqual(r.trace_a_enregistrer, ["*126#", "5", "1"])

    def test_un_chiffre_tape_a_la_main_compte_comme_une_navigation(self):
        """Répondre « 5 » au clavier ou appuyer sur le bouton « 5 », c'est
        le même geste."""
        r, _, _ = robot()
        tape(r, "*126#")
        tape(r, "5")
        tape(r, "1")
        self.assertEqual(r.trace_a_enregistrer, ["*126#", "5", "1"])

    def test_LE_CODE_SECRET_N_ENTRE_JAMAIS_DANS_UN_RACCOURCI(self):
        """La propriété la plus importante du module.

        Un bouton qui rejouerait le PIN serait un transfert en un clic.
        """
        r, _, _ = robot()
        tape(r, "*126#")
        tape(r, "1")            # transfert
        tape(r, "677123456")    # bénéficiaire
        tape(r, "50000")        # montant
        clic(r, "p:1"); clic(r, "p:2"); clic(r, "p:3"); clic(r, "p:4")
        clic(r, "p:ok")         # PIN validé
        etapes = r.trace_a_enregistrer
        self.assertNotIn("1234", etapes)
        for interdit in ("1234", "677123456", "50000"):
            self.assertNotIn(interdit, etapes,
                             f"« {interdit} » ne doit pas être rejouable")

    def test_la_trace_s_arrete_a_la_premiere_donnee_personnelle(self):
        """Le bouton doit mener jusqu'à la question, pas au-delà."""
        r, _, _ = robot()
        tape(r, "*126#")
        tape(r, "1")            # transfert
        tape(r, "677123456")    # bénéficiaire : la trace se ferme ici
        tape(r, "50000")
        self.assertEqual(r.trace, ["*126#", "1"])

    def test_un_nouveau_code_repart_de_zero(self):
        r, _, _ = robot()
        tape(r, "*126#")
        tape(r, "5")
        tape(r, "*126#")        # on recommence
        self.assertEqual(r.trace, ["*126#"])


class TestEnregistrementDepuisTelegram(unittest.TestCase):
    """Le parcours complet, sans jamais toucher au fichier de configuration."""

    def _aller_au_solde(self, r):
        tape(r, "*126#")
        clic(r, "u:5")
        clic(r, "u:1")

    def test_le_bouton_est_propose_a_la_fin(self):
        r, t, _ = robot()
        self._aller_au_solde(r)
        self.assertIn("r:enr", donnees(t.derniers_boutons()))

    def test_nommer_cree_le_bouton(self):
        r, t, _ = robot()
        self._aller_au_solde(r)
        clic(r, "r:enr")
        tape(r, "Solde")
        appris = r.journal.raccourcis("MTN")
        self.assertEqual(appris["solde"]["etapes"], ["*126#", "5", "1"])
        self.assertIn("Solde", dernier_envoi(t))

    def test_le_bouton_apparait_sur_l_accueil(self):
        r, t, _ = robot()
        self._aller_au_solde(r)
        clic(r, "r:enr")
        tape(r, "Solde")
        tape(r, "/menu")
        self.assertIn("m:solde", donnees(boutons_envoi(t)))

    def test_le_bouton_rejoue_le_parcours(self):
        r, t, _ = robot()
        self._aller_au_solde(r)
        clic(r, "r:enr")
        tape(r, "Solde")
        clic(r, "m:solde")
        # La preuve du rejeu : le parcours est allé jusqu'au bout tout seul.
        self.assertIn("solde est de", t.dernier_texte())

    def test_rejouer_un_raccourci_ne_le_reenregistre_pas(self):
        """Sinon on proposerait indéfiniment d'enregistrer ce qui existe."""
        r, t, _ = robot()
        self._aller_au_solde(r)
        clic(r, "r:enr")
        tape(r, "Solde")
        clic(r, "m:solde")
        self.assertNotIn("r:enr", donnees(t.derniers_boutons()))

    def test_un_nom_sans_lettre_est_refuse(self):
        r, t, _ = robot()
        self._aller_au_solde(r)
        clic(r, "r:enr")
        tape(r, "***")
        self.assertEqual(r.journal.raccourcis("MTN"), {})
        self.assertIn("Try again", dernier_envoi(t))

    def test_supprimer_depuis_telegram(self):
        r, t, _ = robot()
        self._aller_au_solde(r)
        clic(r, "r:enr")
        tape(r, "Solde")
        clic(r, "r:sup:solde")
        self.assertEqual(r.journal.raccourcis("MTN"), {})


class TestSuiviDeLOperateur(unittest.TestCase):
    """Les boutons suivent la carte : ceux d'Orange n'apparaissent pas avec
    une puce MTN, et réciproquement."""

    def test_un_bouton_orange_reste_invisible_sur_une_carte_mtn(self):
        r, t, _ = robot(carte=MTN)
        r.journal.ajouter_raccourci("Orange", "solde", "Solde OM", ["#148*5#"])
        r.journal.ajouter_raccourci("MTN", "solde", "Solde MoMo", ["*126#", "5"])
        tape(r, "/menu")
        self.assertIn("Solde MoMo", libelles(boutons_envoi(t)))
        self.assertNotIn("Solde OM", libelles(boutons_envoi(t)))

    def test_carte_non_identifiee_ne_propose_pas_d_enregistrer(self):
        """Sans opérateur connu, on ne saurait pas où ranger le bouton."""
        r, t, _ = robot(carte=Carte())
        tape(r, "*126#")
        clic(r, "u:5")
        clic(r, "u:1")
        self.assertNotIn("r:enr", donnees(t.derniers_boutons()))


if __name__ == "__main__":
    unittest.main()


class TestCatalogueDeDepart(unittest.TestCase):
    """Les codes relevés sur le terrain, proposés en un bouton.

    Rien n'est deviné ici : ces codes ont été composés sur un vrai téléphone.
    Et tous sont des portes d'entrée — aucun ne mène seul au bout d'une
    opération, chacun redemande un montant, un numéro ou le code secret. Un
    code erroné échoue donc sans qu'un franc ait bougé.
    """

    def test_le_catalogue_orange_est_propose(self):
        r, t, _ = robot(carte=ORANGE)
        tape(r, "/raccourcis")
        self.assertIn("r:cat", donnees(boutons_envoi(t)))
        self.assertIn("#148*5#", dernier_envoi(t))

    def test_installer_pose_tous_les_boutons(self):
        r, _, _ = robot(carte=ORANGE)
        clic(r, "r:cat")
        appris = r.journal.raccourcis("Orange")
        self.assertEqual(appris["solde"]["etapes"], ["#148*5#"])
        self.assertEqual(appris["transfert"]["etapes"], ["#148*4#"])
        self.assertEqual(appris["mon_numero"]["etapes"], ["#148*7*6#"])
        self.assertEqual(len(appris), 5)

    def test_les_boutons_installes_apparaissent_sur_l_accueil(self):
        r, t, _ = robot(carte=ORANGE)
        clic(r, "r:cat")
        tape(r, "/menu")
        self.assertIn("m:solde", donnees(boutons_envoi(t)))

    def test_ne_propose_plus_ce_qui_est_deja_pose(self):
        r, t, _ = robot(carte=ORANGE)
        clic(r, "r:cat")
        tape(r, "/raccourcis")
        self.assertNotIn("r:cat", donnees(boutons_envoi(t)))

    def test_un_operateur_sans_catalogue_ne_propose_rien(self):
        """Un opérateur jamais relevé : on ne va pas inventer ses codes."""
        from unittest.mock import patch
        from totem import codes
        sans_mtn = {op: v for op, v in codes.CATALOGUE.items() if op != "MTN"}
        with patch.dict(codes.CATALOGUE, sans_mtn, clear=True):
            r, t, _ = robot(carte=MTN)
            tape(r, "/raccourcis")
            self.assertNotIn("r:cat", donnees(boutons_envoi(t)))

    def test_mtn_propose_sa_porte_d_entree(self):
        """MTN a désormais SA porte relevée — *126#, celle que le fichier de
        configuration cite en exemple — et rien de plus : les codes profonds
        restent à apprendre sur le terrain."""
        from totem.codes import catalogue
        entrees = catalogue("MTN")
        self.assertEqual([code for _l, code, _a in entrees], ["*126#"])
        r, t, _ = robot(carte=MTN)
        tape(r, "/raccourcis")
        self.assertIn("r:cat", donnees(boutons_envoi(t)))

    def test_aucun_code_du_catalogue_ne_va_jusqu_au_bout(self):
        """La propriété qui rend l'installation sans danger : chaque code
        s'arrête à une question, il ne conclut jamais une opération."""
        from totem.codes import CATALOGUE
        for operateur, entrees in CATALOGUE.items():
            for libelles, code, suites in entrees:
                for suite in suites:    # l'aide existe dans les deux langues
                    self.assertTrue(suite.strip(),
                                    f"{libelles} doit dire ce qui est demandé ensuite")
                self.assertTrue(code.endswith("#"), f"{code} mal formé")


class TestClesStablesEntreLangues(unittest.TestCase):
    """La clé d'un bouton ne dépend jamais de la langue affichée.

    Un raccourci appris avant un changement de langue doit répondre après :
    « 💰 Balance » comme « 💰 Solde » mènent à la même clé « solde ». Sans
    quoi les boutons appris mourraient au premier passage d'une langue à
    l'autre."""

    def test_le_catalogue_installe_garde_ses_cles_francaises_en_anglais(self):
        r, _, _ = robot(carte=ORANGE)
        clic(r, "r:cat")          # installé avec les libellés anglais
        appris = r.journal.raccourcis("Orange")
        for cle in ("solde", "depot", "retrait", "transfert", "mon_numero"):
            self.assertIn(cle, appris)

    def test_les_boutons_survivent_au_changement_de_langue(self):
        from totem import textes
        r, t, _ = robot(carte=ORANGE)
        clic(r, "r:cat")                       # posés en anglais
        textes.definir_langue("fr")
        self.addCleanup(textes.definir_langue, "en")
        tape(r, "/menu")
        self.assertIn("m:solde", donnees(boutons_envoi(t)))

    def test_un_bouton_a_trous_ne_se_compose_pas_ici(self):
        """Un code à trous (« *126*1*{numero}*{montant}# ») attend des valeurs
        que ce canal ne demande pas. Plutôt que de composer un code amputé —
        qui partirait au réseau avec les accolades — le robot dit où le
        lancer : la plateforme, elle, ouvre un formulaire d'abord."""
        r, t, _ = robot()
        r.journal.ajouter_raccourci("MTN", "transfert", "Transfert",
                                    ["*126*1*{numero}*{montant}#"])
        tape(r, "/menu")
        clic(r, "m:transfert")
        message = dernier_envoi(t)
        self.assertIn("numero", message)
        self.assertIn("montant", message)
        self.assertIsNone(r.session_compte,
                          "aucune session ne doit s'ouvrir sur un code amputé")

    def test_un_bouton_sans_trou_se_compose_toujours(self):
        """L'autre façon reste entière : c'est un choix, pas un remplacement."""
        r, t, _ = robot()
        r.journal.ajouter_raccourci("MTN", "solde", "Solde", ["*126#", "5", "1"])
        clic(r, "m:solde")
        self.assertIn("solde est de", t.dernier_texte())

    def test_la_liste_parle_francais_sur_demande(self):
        from totem import textes
        textes.definir_langue("fr")
        self.addCleanup(textes.definir_langue, "en")
        r, t, _ = robot()
        tape(r, "/raccourcis")
        self.assertIn("Vos boutons", dernier_envoi(t))
