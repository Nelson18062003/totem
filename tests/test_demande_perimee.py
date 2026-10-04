# -*- coding: utf-8 -*-
"""Une demande qui compose ne se compose pas en retard.

CE QUE LE PROPRIÉTAIRE VIVAIT. Le boîtier vient de tomber ; l'écran, pas
encore rechargé, montre toujours les gestes. Il lance un dépôt. Au bout de
trente secondes : « le terminal n'a pas répondu ». Il croit l'opération
abandonnée — et au retour du boîtier, une heure plus tard, le robot compose
le code, numéro et montant compris, sur la carte.

Rien ne périmait une demande « en attente » : le robot la lisait sans
regarder son âge, la réclamait, la composait. C'est de l'argent : un
transfert composé des heures plus tard est grave.

L'ÂGE SE MESURE SUR L'HORLOGE DE LA BASE. Celle du Pi peut avoir des heures
de retard après une coupure de courant (il n'a pas de pile) : c'est l'heure
que la base donne dans sa réponse qui fait foi, comparée à l'heure de dépôt
qu'elle a elle-même écrite.

LE TÉMOIN. Chaque exigence est rejouée sur le guichet SANS la garde : il
compose le transfert de trois heures, et l'essai doit le voir.
"""

import json
import threading
import time
import unittest
from email.utils import formatdate
from http.server import BaseHTTPRequestHandler, HTTPServer

from totem.nuage import Nuage, Prise, lire_instant
from totem.pilotage import DEMANDE_PERIMEE_S, Pilotage

from tests.test_pilotage import FauxCompte, pilote

TRANSFERT = "*126*1*696000000*50000#"


def exigences_du_transfert_vieux(sans_garde=False):
    """Un transfert déposé il y a trois heures est réclamé maintenant. Rend
    ce qui manque : vide si le guichet se conduit comme il faut."""
    compte = FauxCompte([("ouverte", "Confirmez le transfert de 50000 FCFA")])
    p, nuage = pilote(compte)
    if sans_garde:
        p._refuser_si_perimee = lambda *args, **kw: None
    nuage.age_des_demandes = 3 * 3600
    p._traiter({"id": 9, "type": "ussd", "parametres": {"code": TRANSFERT}})
    manques = []
    if compte.recu:
        manques.append(f"composé sur la carte : {compte.recu}")
    final = [c for i, c in nuage.maj if i == 9][-1]
    if final.get("etat") != "echouee":
        manques.append(f"la demande finit « {final.get('etat')} »")
    elif "Nothing was sent" not in (final.get("resultat") or ""):
        manques.append(f"la raison ne dit pas que rien n'est parti : {final.get('resultat')!r}")
    return manques


class LeGuichetNeComposePasEnRetard(unittest.TestCase):

    def test_un_transfert_vieux_de_trois_heures_n_est_pas_compose(self):
        self.assertEqual(exigences_du_transfert_vieux(), [])

    def test_temoin_sans_la_garde_le_transfert_part(self):
        self.assertNotEqual(
            exigences_du_transfert_vieux(sans_garde=True), [],
            "LE TÉMOIN PASSE : sans la garde, l'essai ne voit pas le transfert composé")

    def test_la_raison_dit_combien_de_temps_elle_a_attendu(self):
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        nuage.age_des_demandes = 3 * 3600
        p._traiter({"id": 9, "type": "ussd", "parametres": {
            "code": TRANSFERT, "langue": "fr"}})
        resultat = nuage.maj[-1][1]["resultat"]
        self.assertIn("3 h", resultat)
        self.assertIn("Rien n'est parti", resultat)
        self.assertTrue(any("too old" in e and "3 h" in e for e in p.journal.evenements))

    def test_une_demande_fraiche_part(self):
        for age in (0.0, 20.0, DEMANDE_PERIMEE_S):
            with self.subTest(age=age):
                compte = FauxCompte([("ouverte", "Orange Money\n1) Transfert")])
                p, nuage = pilote(compte)
                nuage.age_des_demandes = age
                p._traiter({"id": 7, "type": "ussd", "parametres": {"code": "#148#"}})
                self.assertEqual(compte.recu, ["#148#"])
                self.assertEqual(nuage.maj[-1][1]["etat"], "faite")

    def test_une_seconde_de_trop_suffit(self):
        compte = FauxCompte([("ouverte", "Orange Money\n1) Transfert")])
        p, nuage = pilote(compte)
        nuage.age_des_demandes = DEMANDE_PERIMEE_S + 1
        p._traiter({"id": 7, "type": "ussd", "parametres": {"code": "#148#"}})
        self.assertEqual(compte.recu, [])
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")

    def test_un_age_inconnu_ne_se_compose_pas(self):
        """Dans le doute, on ne compose pas : une demande refusée se refait
        d'un geste, un transfert parti trop tard ne se reprend pas."""
        compte = FauxCompte([("ouverte", "Orange Money\n1) Transfert")])
        p, nuage = pilote(compte)
        nuage.age_des_demandes = None
        p._traiter({"id": 7, "type": "ussd", "parametres": {"code": TRANSFERT}})
        self.assertEqual(compte.recu, [])
        self.assertEqual(nuage.maj[-1][1]["etat"], "echouee")

    def test_un_code_secret_en_retard_n_est_pas_compose_et_s_efface(self):
        """La réponse « code secret » a attendu deux minutes : elle ne part
        pas — et le code ne reste pas dans la base pour autant."""
        compte = FauxCompte([("ouverte", "Entrez votre code secret")])
        p, nuage = pilote(compte)
        p._traiter({"id": 1, "type": "ussd", "parametres": {"code": "#150*1#"}})
        nuage.age_des_demandes = 120
        p._traiter({"id": 2, "type": "ussd_reponse",
                    "parametres": {"texte": "1234", "secret": True}})
        self.assertEqual(compte.recu, ["#150*1#"])      # le code n'est pas parti
        self.assertNotIn("1234", str(nuage.maj))        # ni resté dans la base
        final = nuage.maj[-1][1]
        self.assertEqual(final["etat"], "echouee")
        self.assertEqual(final.get("parametres"), {"secret": True})

    def test_ce_qui_ne_compose_pas_passe_meme_en_retard(self):
        """Actualiser, raccrocher : rien ne bouge sur le réseau de
        l'opérateur, aucune raison de refuser."""
        compte = FauxCompte([])
        p, nuage = pilote(compte)
        nuage.age_des_demandes = 3 * 3600
        p._traiter({"id": 5, "type": "solde", "parametres": {}})
        self.assertEqual(nuage.republies, 1)
        p._traiter({"id": 6, "type": "ussd_fin", "parametres": {}})
        etats = [c.get("etat") for _, c in nuage.maj if "etat" in c]
        self.assertEqual(etats, ["en_cours", "faite", "en_cours", "faite"])


class BaseEnCarton:
    """Une base qui rend la demande prise, avec son heure de dépôt, et dont
    l'horloge peut différer de celle de la machine."""

    def __init__(self):
        self.decalage = 0.0         # horloge de la base − horloge de la machine
        self.depose_il_y_a = 0.0    # âge de la demande, sur l'horloge de la base
        self.ligne = True
        banc = self

        class Gestion(BaseHTTPRequestHandler):
            def date_time_string(soi, timestamp=None):
                return formatdate(time.time() + banc.decalage, usegmt=True)

            def do_PATCH(soi):
                soi.rfile.read(int(soi.headers.get("Content-Length", 0)))
                maintenant = time.time() + banc.decalage
                depose = time.strftime(
                    "%Y-%m-%dT%H:%M:%S",
                    time.gmtime(maintenant - banc.depose_il_y_a)) + ".1234+00:00"
                lignes = ([{"id": 42, "etat": "en_cours", "demandee_le": depose}]
                          if banc.ligne else [])
                corps = json.dumps(lignes).encode()
                soi.send_response(200)
                soi.send_header("Content-Type", "application/json")
                soi.send_header("Content-Length", str(len(corps)))
                soi.end_headers()
                soi.wfile.write(corps)

            def log_message(soi, *args):
                pass

        self.serveur = HTTPServer(("127.0.0.1", 0), Gestion)
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()
        self.nuage = Nuage(f"http://127.0.0.1:{self.serveur.server_port}",
                           "cle", "douala", None)

    def fermer(self):
        self.serveur.shutdown()
        self.serveur.server_close()


class LAgeSeMesureSurLHorlogeDeLaBase(unittest.TestCase):

    def setUp(self):
        self.base = BaseEnCarton()

    def tearDown(self):
        self.base.fermer()

    def test_la_prise_dit_l_age_de_la_demande(self):
        self.base.depose_il_y_a = 3 * 3600
        prise = self.base.nuage.reclamer(42)
        self.assertTrue(prise)
        self.assertAlmostEqual(prise.age, 3 * 3600, delta=3)

    def test_l_horloge_du_pi_ne_compte_pas(self):
        """Le Pi redémarre après une coupure de courant avec cinq heures de
        retard ; la base, elle, est à l'heure. Une demande déposée il y a dix
        secondes a dix secondes — pas cinq heures."""
        for decalage in (5 * 3600, -5 * 3600):
            with self.subTest(decalage=decalage):
                self.base.decalage = decalage
                self.base.depose_il_y_a = 10
                prise = self.base.nuage.reclamer(42)
                self.assertAlmostEqual(prise.age, 10, delta=3)

    def test_une_demande_deja_prise_reste_un_refus(self):
        self.base.ligne = False
        self.assertFalse(self.base.nuage.reclamer(42))

    def test_le_guichet_entier_refuse_une_demande_trop_vieille(self):
        """De la réponse de la base jusqu'à la carte : rien n'est composé."""
        self.base.depose_il_y_a = 2 * 3600
        compte = FauxCompte([("ouverte", "Confirmez le transfert")])
        ecrit = []
        self.base.nuage.commande_maj = lambda i, champs: ecrit.append(champs) or True
        p = Pilotage(self.base.nuage, [compte], _Journal())
        p._traiter({"id": 42, "type": "ussd", "parametres": {"code": TRANSFERT}})
        self.assertEqual(compte.recu, [])
        self.assertEqual(ecrit[-1]["etat"], "echouee")


class _Journal:
    def __init__(self):
        self.evenements = []

    def evenement(self, texte):
        self.evenements.append(texte)


class HeuresDeLaBase(unittest.TestCase):
    """Ce que PostgreSQL écrit vraiment — fractions tronquées, « +00 » sans
    minutes — et ce qui ne dit pas de quel instant il parle."""

    def test_les_formes_de_la_base_se_lisent(self):
        for texte in ("2026-10-04T09:12:33.1234+00:00", "2026-10-04 09:12:33+00",
                      "2026-10-04T09:12:33Z", "2026-10-04T10:12:33+01:00",
                      "2026-10-04T09:12:33.123456+00:00"):
            with self.subTest(texte=texte):
                instant = lire_instant(texte)
                self.assertIsNotNone(instant)
                self.assertEqual(instant.utcoffset() is not None, True)
                self.assertEqual((instant.hour - instant.utcoffset().seconds // 3600), 9)

    def test_ce_qui_ne_dit_pas_son_fuseau_ne_se_croit_pas(self):
        for texte in ("2026-10-04T09:12:33", "hier", "", None, 1728032000):
            with self.subTest(texte=texte):
                self.assertIsNone(lire_instant(texte))

    def test_une_prise_reste_vraie(self):
        """`if not nuage.reclamer(…)` se lit comme avant."""
        self.assertTrue(Prise(None))
        self.assertTrue(Prise(0.0))


if __name__ == "__main__":
    unittest.main()
