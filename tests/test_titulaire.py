# -*- coding: utf-8 -*-
"""À qui est le menu d'une carte — la règle tenue par la carte elle-même.

Une carte ne tient qu'un menu USSD à la fois (règle du réseau). Plusieurs
mains peuvent le vouloir : Telegram, et chaque personne de la plateforme qui
tient la carte. La réponse de l'une ne doit JAMAIS partir dans le menu de
l'autre — c'est peut-être un code secret.

Le robot gardait cette réponse en trois registres qui se prévenaient. La
carte la tient maintenant seule, sous le verrou de son modem, au moment
d'écrire. On l'éprouve ici sur la vraie classe `Compte`, puis en rafale.
"""

import threading
import unittest

from totem.compte import TELEGRAM, WEB, Compte, SessionTenue
from totem.modem import USSD_FERMEE, USSD_OUVERTE

ALICE = (WEB, "c:1")
BRUNO = (WEB, "c:2")
ADMIN = (TELEGRAM, None)


class ModemQuiObserve:
    """Un modem qui note, À CHAQUE ÉCRITURE, qui tenait le menu.

    Il lit `titulaire` sur la carte au moment où l'octet part : c'est
    exactement ce qu'il faut garder. Chaque envoi porte le nom de celui qui
    l'a tapé (« c:1/7 ») ; s'il arrive alors que la carte appartient à un
    autre, la règle a cédé."""

    def __init__(self):
        self.compte = None
        self.ecrits = []          # (ce qui part, titulaire à cet instant)
        self.reponses = []        # les seules RÉPONSES, même forme

    def ussd_demarrer(self, code):
        self.ecrits.append((code, self.compte.titulaire))
        return USSD_OUVERTE, "Menu\n1) Solde\n2) Transfert"

    def ussd_repondre(self, texte):
        # Une OUVERTURE part légitimement pendant que la carte est encore à
        # un autre : c'est elle qui change le titulaire. Une RÉPONSE, jamais.
        self.ecrits.append((texte, self.compte.titulaire))
        self.reponses.append((texte, self.compte.titulaire))
        return USSD_OUVERTE, "Suite du menu"

    def ussd_annuler(self):
        pass


class ModemEnPanne(ModemQuiObserve):
    def ussd_repondre(self, texte):
        raise TimeoutError("le réseau ne répond plus")


def carte(modem=None):
    modem = modem or ModemQuiObserve()
    c = Compte(modem, libelle="MTN ·0011")
    modem.compte = c
    return c, modem


class TestLaCarteSaitQuiTientSonMenu(unittest.TestCase):

    def test_le_titulaire_est_celui_qui_a_ouvert(self):
        c, _ = carte()
        c.ussd_demarrer("*126#", qui=ALICE)
        self.assertTrue(c.tenue_par(ALICE))
        self.assertFalse(c.tenue_par(BRUNO))

    def test_une_reponse_d_un_autre_ne_part_pas(self):
        c, modem = carte()
        c.ussd_demarrer("*126#", qui=ALICE)
        with self.assertRaises(SessionTenue) as refus:
            c.ussd_repondre("1234", qui=BRUNO)
        self.assertEqual(refus.exception.titulaire, ALICE)
        self.assertNotIn("1234", [e for e, _ in modem.ecrits],
                         "le chiffre de Bruno est parti dans le menu d'Alice")

    def test_ouvrir_si_libre_refuse_le_menu_d_un_autre(self):
        """Le geste de la plateforme : on ne vole pas le menu d'une autre
        personne — même pas pour composer un simple solde."""
        c, modem = carte()
        c.ussd_demarrer("*126#", qui=ALICE)
        with self.assertRaises(SessionTenue):
            c.ussd_demarrer("#155#", qui=BRUNO, si_libre=True)
        self.assertEqual([e for e, _ in modem.ecrits], ["*126#"])
        self.assertTrue(c.tenue_par(ALICE))

    def test_ouvrir_si_libre_remplace_son_propre_menu(self):
        c, _ = carte()
        c.ussd_demarrer("*126#", qui=ALICE)
        c.ussd_demarrer("#155#", qui=ALICE, si_libre=True)
        self.assertTrue(c.tenue_par(ALICE))

    def test_telegram_reprend_la_main(self):
        """Un administrateur au bout du fil : il reprend la carte, et la
        réponse suivante d'Alice est refusée PAR LA CARTE."""
        c, modem = carte()
        c.ussd_demarrer("*126#", qui=ALICE)
        c.ussd_demarrer("#144#", qui=ADMIN)
        with self.assertRaises(SessionTenue):
            c.ussd_repondre("1234", qui=ALICE)
        self.assertNotIn("1234", [e for e, _ in modem.ecrits])

    def test_on_ne_raccroche_pas_le_menu_d_un_autre(self):
        c, _ = carte()
        c.ussd_demarrer("*126#", qui=ALICE)
        self.assertFalse(c.ussd_annuler(qui=BRUNO))
        self.assertTrue(c.tenue_par(ALICE))
        self.assertTrue(c.ussd_annuler(qui=ALICE))
        self.assertFalse(c.session_ouverte)

    def test_un_menu_ferme_n_a_plus_de_titulaire(self):
        c, modem = carte()
        modem.ussd_demarrer = lambda code: (USSD_FERMEE, "Solde : 1000 F")
        c.ussd_demarrer("#155#", qui=ALICE)
        self.assertIsNone(c.titulaire)
        with self.assertRaises(SessionTenue):
            c.ussd_repondre("1", qui=ALICE)

    def test_dans_le_doute_personne_ne_repond(self):
        """Le réseau ne répond plus : on ne sait pas où en est le menu. La
        réponse suivante — peut-être le code secret — ne doit pas partir
        dans un menu dont on ignore l'état."""
        c, _ = carte(ModemEnPanne())
        c.ussd_demarrer("*126#", qui=ALICE)
        with self.assertRaises(TimeoutError):
            c.ussd_repondre("1", qui=ALICE)
        self.assertIsNone(c.titulaire)
        with self.assertRaises(SessionTenue):
            c.ussd_repondre("1234", qui=ALICE)

    def test_sans_titulaire_nomme_le_geste_d_avant_marche(self):
        """Ce qui n'a pas encore appris à se nommer (un ancien appelant)
        écrit comme avant."""
        c, modem = carte()
        c.ussd_demarrer("*126#")
        c.ussd_repondre("1")
        self.assertEqual([e for e, _ in modem.ecrits], ["*126#", "1"])


class TestEnRafale(unittest.TestCase):
    """Une règle de concurrence ne se prouve pas en file. Huit personnes
    tapent ensemble sur la même carte — certaines ouvrent, d'autres
    répondent, Telegram reprend la main au milieu — pendant des centaines de
    tours. Le modem note qui tenait le menu à CHAQUE écriture : une seule
    réponse arrivée chez un autre, et la règle a cédé."""

    def test_aucune_reponse_ne_tombe_chez_un_autre(self):
        c, modem = carte()
        personnes = [(WEB, f"c:{i}") for i in range(1, 8)] + [ADMIN]
        depart = threading.Barrier(len(personnes))
        refus = []

        def taper(qui):
            depart.wait()
            for tour in range(300):
                try:
                    if tour % 7 == 0:
                        if qui == ADMIN:
                            c.ussd_demarrer(f"{qui[1]}/{tour}", qui=qui)
                        else:
                            c.ussd_demarrer(f"{qui[1]}/{tour}", qui=qui,
                                            si_libre=True)
                    else:
                        c.ussd_repondre(f"{qui[1]}/{tour}", qui=qui)
                except SessionTenue:
                    refus.append(qui)

        fils = [threading.Thread(target=taper, args=(q,)) for q in personnes]
        for f in fils:
            f.start()
        for f in fils:
            f.join(20)

        egares = [(envoi, titulaire) for envoi, titulaire in modem.reponses
                  if titulaire is None
                  or envoi.split("/")[0] != str(titulaire[1])]
        self.assertEqual(egares, [], "des réponses sont tombées chez un autre")
        # Le harnais a-t-il vraiment mis la règle sous pression ? Il faut des
        # écritures ET des refus — sinon on n'a rien éprouvé.
        self.assertGreater(len(modem.reponses), 50)
        self.assertGreater(len(refus), 50)

    def test_le_temoin_l_ancienne_facon_cede(self):
        """LE TÉMOIN. L'ancienne façon — vérifier à part, PUIS écrire —
        rejouée dans la même rafale. Si elle passe, la rafale ne met rien
        sous pression et le test d'au-dessus ne prouve rien."""
        c, modem = carte()
        registre = {"tient": None}       # le registre « d'à côté », d'avant
        personnes = [(WEB, f"c:{i}") for i in range(1, 8)]
        depart = threading.Barrier(len(personnes))

        def taper(qui):
            depart.wait()
            for tour in range(300):
                if tour % 7 == 0:
                    registre["tient"] = qui
                    c.ussd_demarrer(f"{qui[1]}/{tour}", qui=qui)
                elif registre["tient"] == qui:      # vérifié AVANT…
                    # … le fil peut céder la main ici, et un autre ouvrir.
                    threading.Event().wait(0.0001)
                    c.ussd_repondre(f"{qui[1]}/{tour}")   # … écrit sans règle

        fils = [threading.Thread(target=taper, args=(q,)) for q in personnes]
        for f in fils:
            f.start()
        for f in fils:
            f.join(20)
        egares = [e for e, titulaire in modem.reponses
                  if titulaire is not None and e.split("/")[0] != titulaire[1]]
        self.assertGreater(len(egares), 0,
                           "le témoin n'a rien fait céder : la rafale est "
                           "trop tranquille pour prouver quoi que ce soit")


if __name__ == "__main__":
    unittest.main()
