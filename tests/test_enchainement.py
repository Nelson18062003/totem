# -*- coding: utf-8 -*-
"""Le boîtier enchaîne seul les écrans prévus — et s'arrête comme l'écran.

LE 18 OCTOBRE. Le bouton Transfert de la ·6414 passe maintenant par le menu,
« *126#, 5, 1 » : MTN refuse son raccourci direct à cette carte. Ça marche,
« mais c'est trop lent », dit le propriétaire. Mesuré sur trente-cinq
transferts d'octobre : cinquante et une secondes, dont treize chez MTN. Le
reste, c'était l'aller-retour entier — le téléphone dépose sa réponse sur
la plateforme, le boîtier la relève, compose, rend l'écran, que le téléphone
relit — refait pour le menu, pour « 5 », pour « 1 », pour le numéro, pour le
montant.

L'écran dépose maintenant le chemin en UNE demande (`suite`) ; le boîtier le
parcourt sans repasser par Internet et ne rend que le dernier écran — la
confirmation de MTN, au-dessus du pavé du code secret.

Chaque pas se décide comme l'écran du téléphone l'aurait décidé : même
lecture (totem/ecran.py, jumelle du noyau, éprouvée sur trois mille écrans
par tests/test_ecran.py). Ces essais-ci gardent le reste : ce qui part au
réseau est le même qu'avant, écran pour écran ; on s'arrête au code secret,
à une confirmation, à un menu renuméroté, à un réseau qui ferme ou se tait ;
rien ne se rejoue ; et le journal ne dit ni le numéro ni le montant.

LE TÉMOIN : le parcours d'avant, une demande par écran. Il doit envoyer au
réseau EXACTEMENT la même chose — en cinq demandes au lieu d'une.
Écrans aux formes de MTN, textes inventés.
"""

import unittest
from unittest import mock

from totem import pilotage as module
from totem.modem import ReponseNonRecue

try:
    from test_pilotage import FauxCompte, FausseCarte, ModemScripte, pilote
except ImportError:
    from tests.test_pilotage import FauxCompte, FausseCarte, ModemScripte, pilote

MENU = ("MTN MoMo\n1. Transfer money\n2. Withdraw\n3. Pay bills\n"
        "4. My account\n5. Agent services")
AGENT = "Agent services\n1. Float Transfer\n2. Float Purchase\n0. Back"
NUMERO = "Enter receiver mobile number\n0. Back"
MONTANT = "Enter amount\n0. Back"
CONFIRMATION = ("Confirm: Float Transfer for FCFA 250000 To -ETS ESSAI DU "
                "LITTORAL having mobile number 237677998877.\n00. Next")

SUITE = {"trajet": [["5", "5"], ["1", "1"]],
         "champs": [{"cle": "numero", "type": "numero", "valeur": "677998877"},
                    {"cle": "montant", "type": "montant", "valeur": "250000"}]}


def transfert():
    """MTN, de bout en bout jusqu'à la confirmation."""
    return FauxCompte([("ouverte", MENU), ("ouverte", AGENT), ("ouverte", NUMERO),
                       ("ouverte", MONTANT), ("ouverte", CONFIRMATION)],
                      libelle="MTN ·6414")


def final(nuage, identifiant):
    return [c for i, c in nuage.maj if i == identifiant and "etat" in c][-1]


def ouvrir(compte, suite=SUITE, code="*126#"):
    p, nuage = pilote(compte)
    parametres = {"code": code, "carte": FausseCarte.iccid}
    if suite is not None:
        parametres["suite"] = suite
    p._traiter({"id": 1, "type": "ussd", "parametres": parametres})
    return p, nuage, final(nuage, 1)


class LeTransfertParLeMenuPartEnUneDemande(unittest.TestCase):

    def test_le_boitier_parcourt_seul_jusqu_a_la_confirmation(self):
        compte = transfert()
        _, _, f = ouvrir(compte)
        self.assertEqual(compte.recu, ["*126#", "5", "1", "677998877", "250000"])
        self.assertEqual(f["etat"], "faite")
        self.assertEqual(f["resultat"], CONFIRMATION)
        self.assertEqual(f["parametres"]["reseau"], "attend")
        self.assertEqual(f["parametres"]["enchaine"],
                         {"trajet": 2, "servis": ["numero", "montant"]})

    def test_le_temoin_envoie_la_meme_chose_en_cinq_demandes(self):
        """L'ancien parcours : l'écran décide, une demande par écran."""
        from totem import ecran
        temoin = transfert()
        p, nuage = pilote(temoin)
        p._traiter({"id": 1, "type": "ussd",
                    "parametres": {"code": "*126#", "carte": FausseCarte.iccid}})
        demandes, texte = 1, final(nuage, 1)["resultat"]
        reseau = final(nuage, 1)["parametres"]["reseau"]
        for gabarit, valeur in SUITE["trajet"]:
            self.assertTrue(ecran.etape_peut_partir(gabarit, texte, reseau))
            demandes += 1
            p._traiter({"id": demandes, "type": "ussd_reponse",
                        "parametres": {"texte": valeur, "carte": FausseCarte.iccid}})
            texte = final(nuage, demandes)["resultat"]
            reseau = final(nuage, demandes)["parametres"]["reseau"]
        restants = [{"cle": c["cle"], "type": c["type"]} for c in SUITE["champs"]]
        propres = {c["cle"]: c["valeur"] for c in SUITE["champs"]}
        while True:
            champ = ecran.champ_a_servir(texte, reseau, restants, propres)
            if not champ:
                break
            restants = [c for c in restants if c is not champ]
            demandes += 1
            p._traiter({"id": demandes, "type": "ussd_reponse",
                        "parametres": {"texte": propres[champ["cle"]],
                                       "carte": FausseCarte.iccid}})
            texte = final(nuage, demandes)["resultat"]
            reseau = final(nuage, demandes)["parametres"]["reseau"]

        enchaine = transfert()
        _, _, f = ouvrir(enchaine)
        self.assertEqual(enchaine.recu, temoin.recu)
        self.assertEqual(f["resultat"], texte)
        self.assertEqual((demandes, 1), (5, 1))

    def test_sans_chemin_on_compose_comme_avant(self):
        compte = transfert()
        _, _, f = ouvrir(compte, suite=None)
        self.assertEqual(compte.recu, ["*126#"])
        self.assertEqual(f["resultat"], MENU)
        self.assertNotIn("enchaine", f["parametres"])

    def test_le_journal_compte_les_ecrans_sans_dire_quoi(self):
        compte = transfert()
        p, _, _ = ouvrir(compte)
        evenements = " ".join(p.journal.evenements)
        self.assertRegex(evenements,
                         r"4 (?:screen\(s\) chained|écran\(s\) enchaîné\(s\))")
        for interdit in ("677998877", "250000"):
            self.assertNotIn(interdit, evenements)


class OnSArreteCommeLEcran(unittest.TestCase):

    def test_jamais_le_code_secret(self):
        """MTN réclame le code plus tôt que prévu : le numéro ne part pas."""
        compte = FauxCompte([("ouverte", MENU), ("ouverte", AGENT),
                             ("ouverte", "Enter MoMo PIN to confirm transfer "
                                         "to mobile number 677998877")])
        _, _, f = ouvrir(compte)
        self.assertEqual(compte.recu, ["*126#", "5", "1"])
        self.assertEqual(f["parametres"]["enchaine"], {"trajet": 2, "servis": []})

    def test_une_confirmation_qui_nomme_le_montant_n_est_pas_servie(self):
        compte = FauxCompte([("ouverte", MENU), ("ouverte", AGENT),
                             ("ouverte", "Transfer 250000 FCFA to JEAN. Amount "
                                         "correct? Reply 1 to confirm")])
        _, _, f = ouvrir(compte)
        self.assertEqual(compte.recu, ["*126#", "5", "1"])

    def test_un_menu_renumerote_arrete_le_chemin(self):
        compte = FauxCompte([("ouverte", "MTN MoMo\n1. Transfer money\n"
                                         "2. Withdraw\n3. Agent services")])
        _, _, f = ouvrir(compte)
        self.assertEqual(compte.recu, ["*126#"])
        self.assertEqual(f["parametres"]["enchaine"], {"trajet": 0, "servis": []})

    def test_un_chemin_arrete_ne_sert_pas_les_champs(self):
        """Comme l'écran : un trajet interrompu rend la main, il ne saute
        pas aux questions d'après."""
        compte = FauxCompte([("ouverte", MENU),
                             ("ouverte", "Agent services\n2. Float Purchase\n0. Back")])
        _, _, f = ouvrir(compte)
        self.assertEqual(compte.recu, ["*126#", "5"])
        self.assertEqual(f["parametres"]["enchaine"], {"trajet": 1, "servis": []})

    def test_le_reseau_qui_ferme_arrete_tout(self):
        compte = FauxCompte([("ouverte", MENU),
                             ("fermee", "Service temporarily unavailable")])
        _, _, f = ouvrir(compte)
        self.assertEqual(compte.recu, ["*126#", "5"])
        self.assertEqual(f["parametres"]["reseau"], "fini")
        self.assertEqual(f["resultat"], "Service temporarily unavailable")

    def test_un_ecran_douteux_rend_la_main(self):
        compte = FauxCompte([("ouverte", MENU.replace("\n5.", " \n5."))])
        _, _, f = ouvrir(compte)
        self.assertEqual(compte.recu, ["*126#"])

    def test_la_duree_borne_la_chaine(self):
        compte = transfert()
        with mock.patch.object(module, "ENCHAINEMENT_S", 0):
            _, _, f = ouvrir(compte)
        self.assertEqual(compte.recu, ["*126#"])
        self.assertEqual(f["parametres"]["enchaine"], {"trajet": 0, "servis": []})


class UnReseauMuetEnRoute(unittest.TestCase):
    """« 1 » est parti, MTN ne répond pas à temps : on ne sait pas où en est
    le menu. On le dit — et rien d'autre ne part."""

    def test_rien_ne_se_rejoue(self):
        compte = transfert()

        def repondre(texte, _original=ModemScripte.ussd_repondre,
                     modem=compte.modem):
            if texte == "1":
                compte.recu.append(texte)
                raise ReponseNonRecue("muet")
            return _original(modem, texte)
        compte.modem.ussd_repondre = repondre
        _, _, f = ouvrir(compte)
        self.assertEqual(compte.recu, ["*126#", "5", "1"])
        self.assertEqual(f["etat"], "faite")
        self.assertRegex(f["resultat"], "may have gone through|a pu aboutir")
        self.assertEqual(f["parametres"]["reseau"], "fini")
        self.assertNotIn("enchaine", f["parametres"])


class UnCheminMalFormeNeSEnchainePas(unittest.TestCase):
    """Ce qui part au modem n'est fait que de chiffres. Un chemin douteux
    n'est pas refusé : on compose comme avant, une demande par écran."""

    def _essayer(self, suite):
        compte = transfert()
        _, _, f = ouvrir(compte, suite=suite)
        self.assertEqual(compte.recu, ["*126#"], suite)
        self.assertEqual(f["etat"], "faite")
        self.assertNotIn("enchaine", f["parametres"])

    def test_des_lettres_dans_une_valeur(self):
        self._essayer({"trajet": [["5", "5"]], "champs": [
            {"cle": "numero", "type": "numero", "valeur": "677\r\nAT+CMGS"}]})

    def test_une_etape_qui_n_est_pas_ce_qu_elle_dit(self):
        self._essayer({"trajet": [["5", "6"]], "champs": []})

    def test_un_trou_inconnu(self):
        self._essayer({"trajet": [["{pin}", "1234"]], "champs": []})

    def test_un_champ_de_type_inconnu(self):
        self._essayer({"trajet": [], "champs": [
            {"cle": "numero", "type": "secret", "valeur": "1234"}]})

    def test_un_chemin_trop_long(self):
        self._essayer({"trajet": [["1", "1"]] * 9, "champs": []})

    def test_deux_fois_le_meme_champ(self):
        self._essayer({"trajet": [], "champs": [
            {"cle": "numero", "type": "numero", "valeur": "677998877"},
            {"cle": "numero", "type": "numero", "valeur": "699000000"}]})

    def test_pas_un_objet(self):
        self._essayer(["5", "1"])


class LaPlateformeEtLeBoitierRefusentLesMemesChemins(unittest.TestCase):
    """`web/noyau/tests/chemins-partages.json` est jugé des deux côtés : la
    plateforme ne laisse passer que ce que le boîtier accepte, et
    inversement. Sinon un chemin passerait la porte et serait ignoré, ou
    l'inverse, sans que rien ne le dise."""

    def test_meme_verdict(self):
        import json
        import os
        chemin = os.path.join(os.path.dirname(__file__), "..", "web", "noyau",
                              "tests", "chemins-partages.json")
        with open(chemin, encoding="utf-8") as f:
            cas = json.load(f)
        self.assertGreaterEqual(len(cas), 15)
        for c in cas:
            accepte = module.Pilotage._suite_demandee({"suite": c["suite"]})
            self.assertEqual(accepte is not None, c["ok"],
                             c.get("pourquoi") or c["suite"])


if __name__ == "__main__":
    unittest.main()
