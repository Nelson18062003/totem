# -*- coding: utf-8 -*-
"""Saisie libre au pavé : rien ne devient un message de la conversation.

Le raisonnement qui a mené là : un montant ou un numéro de bénéficiaire tapé
au clavier du téléphone **reste dans l'historique Telegram**. L'effacer après
coup ne répare rien — le message a existé, il a transité par les serveurs de
Telegram, et la suppression peut échouer sans qu'on le sache.

Composer sur des boutons évite le problème à la racine : un appui n'est pas
un message. La valeur ne vit que dans la carte de session, qui se réécrit en
place et disparaît avec elle.

Le clavier reste possible — certaines demandes veulent des lettres — mais le
message est alors effacé, et ce n'est plus le chemin par défaut.
"""

import unittest

from totem.app import Robot
from totem.carte import Carte
from totem.compte import Compte
from totem.entrant import Entrant
from totem.simulator import ModemSimule
from totem.storage import Journal

from tests.test_experience_telegram import TransportEspion, donnees

MTN = Carte(iccid="89237010000000000011", imsi="624010000000011")


def robot(**kw):
    transport = TransportEspion((1,))
    r = Robot([Compte(ModemSimule("MTN"), carte=MTN)], transport,
              Journal(":memory:"), nom="T", pause_sms=1, **kw)
    return r, transport


def tape(r, texte, message_id=7):
    r._traiter(Entrant(texte=texte, utilisateur=1, chat=1,
                       message_id=message_id))


def clic(r, donnee):
    r._traiter(Entrant(texte=donnee, bouton=True, callback_id="cb",
                       utilisateur=1, chat=1))


def composer(r, valeur):
    for touche in valeur:
        clic(r, f"s:{touche}")


class TestPaveDeSaisie(unittest.TestCase):

    def _aller_a_la_question(self, r):
        """Ouvre un transfert : l'opérateur réclame le bénéficiaire."""
        tape(r, "*126#")
        clic(r, "u:1")

    def test_une_saisie_libre_ouvre_le_pave(self):
        r, t = robot()
        self._aller_a_la_question(r)
        touches = donnees(t.derniers_boutons())
        for chiffre in "0123456789":
            self.assertIn(f"s:{chiffre}", touches)

    def test_les_touches_etoile_et_diese_sont_disponibles(self):
        """Certaines réponses en veulent : références, sous-codes."""
        r, t = robot()
        self._aller_a_la_question(r)
        touches = donnees(t.derniers_boutons())
        self.assertIn("s:*", touches)
        self.assertIn("s:#", touches)

    def test_ce_qui_se_compose_reste_lisible(self):
        """Contrairement au code secret : il faut relire un montant avant
        de l'envoyer."""
        r, t = robot()
        self._aller_a_la_question(r)
        composer(r, "677123456")
        self.assertIn("677123456", t.dernier_texte())

    def test_la_correction_marche(self):
        r, t = robot()
        self._aller_a_la_question(r)
        composer(r, "6771")
        clic(r, "s:eff")
        self.assertIn("677", t.dernier_texte())
        self.assertNotIn("6771", t.dernier_texte())

    def test_AUCUN_CHIFFRE_NE_DEVIENT_UN_MESSAGE(self):
        """La propriété qui justifie tout le module.

        Composer neuf chiffres ne doit produire aucun message entrant : ce
        sont des appuis sur des boutons, pas du texte envoyé.
        """
        r, t = robot()
        self._aller_a_la_question(r)
        avant = len(t.envois)
        composer(r, "677123456")
        clic(r, "s:ok")
        # Rien n'a été *envoyé* dans la conversation : tout s'est passé dans
        # la carte de session, réécrite en place.
        for texte, *_ in t.envois[avant:]:
            self.assertNotIn("677123456", texte)

    def test_valider_transmet_bien_la_valeur(self):
        r, _ = robot()
        self._aller_a_la_question(r)
        composer(r, "677123456")
        clic(r, "s:ok")
        journalise = [t for _, _, t, *_ in _lignes_ussd(r)]
        self.assertIn("677123456", journalise)

    def test_valider_a_vide_ne_fait_rien(self):
        r, _ = robot()
        self._aller_a_la_question(r)
        clic(r, "s:ok")
        self.assertEqual(r.saisie_tampon, "")
        self.assertTrue(r.session_ussd, "la session doit rester ouverte")

    def test_le_tampon_est_borne(self):
        """Un tampon sans limite serait une porte ouverte à l'accident."""
        r, _ = robot()
        self._aller_a_la_question(r)
        composer(r, "1" * 60)
        self.assertLessEqual(len(r.saisie_tampon), 32)

    def test_masquer_reste_accessible(self):
        """Si la demande s'avère sensible, un bouton bascule sur le pavé
        masqué — le robot ne peut pas toujours le deviner tout seul."""
        r, t = robot()
        self._aller_a_la_question(r)
        clic(r, "c:masquer")
        self.assertTrue(r.pin_actif)
        self.assertIn("p:ok", donnees(t.derniers_boutons()))

    def test_le_pave_ne_s_ouvre_pas_sur_un_menu(self):
        """Un menu numéroté se navigue par ses options, pas par un pavé."""
        r, t = robot()
        tape(r, "*126#")
        touches = donnees(t.derniers_boutons())
        self.assertNotIn("s:1", touches)
        self.assertIn("u:1", touches)


class TestClavierEnSecours(unittest.TestCase):
    """Répondre au clavier reste possible, mais ne laisse plus de trace."""

    def test_un_message_tape_est_efface(self):
        r, t = robot()
        tape(r, "*126#")
        clic(r, "u:1")
        tape(r, "677123456", message_id=42)
        self.assertIn(42, t.supprimes)

    def test_la_valeur_est_quand_meme_transmise(self):
        r, _ = robot()
        tape(r, "*126#")
        clic(r, "u:1")
        tape(r, "677123456")
        journalise = [t for _, _, t, *_ in _lignes_ussd(r)]
        self.assertIn("677123456", journalise)


class TestLangueDuPave(unittest.TestCase):
    """Le pavé parle anglais par défaut, français quand la langue le dit."""

    def _aller_a_la_question(self, r):
        tape(r, "*126#")
        clic(r, "u:1")

    def test_anglais_par_defaut(self):
        r, t = robot()
        self._aller_a_la_question(r)
        self.assertIn("Typed:", t.dernier_texte())

    def test_francais_sur_demande(self):
        from totem import textes
        textes.definir_langue("fr")
        self.addCleanup(textes.definir_langue, "en")
        r, t = robot()
        self._aller_a_la_question(r)
        self.assertIn("Saisi :", t.dernier_texte())
        libelles = [b[0] for ligne in t.derniers_boutons() for b in ligne]
        self.assertIn("✅ Valider", libelles)
        self.assertIn("🔐 Masquer", libelles)


def _lignes_ussd(r):
    return r.journal.conn.execute(
        "SELECT id, direction, texte FROM ussd").fetchall()


if __name__ == "__main__":
    unittest.main()
