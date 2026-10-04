# -*- coding: utf-8 -*-
"""Ce que le modem livre, ce que le robot en fait — attaqué octet par octet.

Les menus de l'opérateur traversent trois couches avant l'écran : le port
série (des OCTETS, en morceaux), le découpage de la ligne « +CUSD: », puis le
décodage. Chaque couche avait ses tests ; aucun ne présentait au robot ce
qu'un vrai modem en mode GSM livre : un nom entre guillemets, un « é » en
0x05, un message coupé en deux lectures, un « +CUSD: 2 » qui traîne, un
réseau qui répond en trente-cinq secondes après le code secret.

Chaque classe porte son TÉMOIN : l'ancienne façon de faire, réécrite en
quelques lignes, doit échouer sur la même entrée — sans quoi l'essai ne
prouverait rien.
"""

import re
import threading
import time
import unittest

from totem.compte import Compte
from totem.gsm import (ALPHABET_GSM, ChargeRefusee, charge_pour_le_reseau,
                       decode_auto, decode_gsm7, decode_ucs2, encode_ucs2)
from totem.modem import (USSD_OUVERTE, ErreurModem, MenuReferme, ModemSerie,
                         ReponseNonRecue, ReponseRefusee, lire_cusd,
                         octets_en_texte)
from totem.pilotage import (Pilotage, code_pour_le_journal, solde_douteux)
from tests.test_pilotage import FausseCarte, FauxJournal, FauxNuage


# ---- un port série qui livre ses octets à l'heure dite ----------------------
class PortHorloge:
    """`morceaux` : [(secondes, octets)] — chaque morceau devient lisible à
    son heure, comme sur un port USB chargé."""

    def __init__(self, morceaux=(), en_attente=b""):
        self.morceaux = list(morceaux)
        self.depart = None
        self.ecrit = []
        self.en_attente = en_attente      # ce qui traîne AVANT l'écriture

    @property
    def in_waiting(self):
        return len(self.en_attente)

    def read(self, n):
        morceau, self.en_attente = self.en_attente[:n], self.en_attente[n:]
        return morceau

    def read_all(self):
        if self.depart is None:
            self.depart = time.time()
        sortie = b""
        while self.morceaux and time.time() - self.depart >= self.morceaux[0][0]:
            sortie += self.morceaux.pop(0)[1]
        return sortie

    def reset_input_buffer(self):
        self.en_attente = b""

    def write(self, octets):
        self.ecrit.append(octets)
        self.depart = time.time()


def modem_sur(port, ucs2=False):
    m = ModemSerie.__new__(ModemSerie)        # sans matériel
    m.ser = port
    m.verrou = threading.Lock()
    m.ucs2 = ucs2
    m._traine_urc = b""
    m._ferme_par_le_reseau = False
    return m


def attendre(octets_ou_morceaux, delai=4, ucs2=False):
    morceaux = (octets_ou_morceaux if isinstance(octets_ou_morceaux, list)
                else [(0, octets_ou_morceaux)])
    return modem_sur(PortHorloge(morceaux), ucs2=ucs2)._attendre_cusd(delai)


# ---- les anciennes façons, pour les témoins ---------------------------------
ANCIEN_RE_CUSD = re.compile(r'\+CUSD:\s*(\d)(?:\s*,\s*"(.*?)"\s*(?:,\s*(\d+))?)?', re.S)
ANCIEN_RE_PLAUSIBLE = re.compile(
    r"[\w \n\r\t.,;:!?'\"()\[\]{}<>/\\@#%&*+=~^$£€¥°|-]", re.UNICODE)


def ancien_decoupage(octets):
    m = ANCIEN_RE_CUSD.search(octets.decode(errors="replace"))
    return int(m.group(1)), (m.group(2) or "").strip()


def ancienne_plausibilite(texte):
    return len(ANCIEN_RE_PLAUSIBLE.findall(texte)) / len(texte) if texte else 0.0


def ancien_decode(brut, dcs):
    """L'arbitrage d'avant : la lecture la plus plausible, le DCS en simple
    départage, aucun égard pour le mode texte du modem."""
    lectures = []
    if len(brut) % 4 == 0:
        lectures.append(("ucs2", decode_ucs2(brut)))
    lectures.append(("gsm7", decode_gsm7(brut)))
    lectures = [p for p in lectures if p[1]]
    annonce = "ucs2" if dcs == 72 else "gsm7"
    return max(lectures, key=lambda p: (round(ancienne_plausibilite(p[1]), 3),
                                         p[0] == annonce))[1]


# =============================================================================
class TestLesGuillemetsNeCoupentPas(unittest.TestCase):
    """Indices 9, 16, 36 — en mode GSM, un nom entre guillemets coupait le
    message au premier « " » : ni bénéficiaire, ni montant, ni choix."""

    CAS = [
        (b'+CUSD: 1,"Confirmez le transfert de 5000 FCFA a STE "LA PAIX" SARL '
         b'(677123456).\n1. Confirmer\n2. Annuler",15\r\n',
         'Confirmez le transfert de 5000 FCFA a STE "LA PAIX" SARL (677123456).'
         '\n1. Confirmer\n2. Annuler'),
        (b'+CUSD: 1,"Tapez "1" pour confirmer le retrait de 5000F\n2. Annuler",15\r\n',
         'Tapez "1" pour confirmer le retrait de 5000F\n2. Annuler'),
        (b'\r\nOK\r\n+CUSD: 1,"Transfert vers "ETS KAMDEM" 5000F\n1. Confirm\n'
         b'00. Next",15\r\n',
         'Transfert vers "ETS KAMDEM" 5000F\n1. Confirm\n00. Next'),
    ]

    def test_le_message_arrive_entier(self):
        for octets, attendu in self.CAS:
            self.assertEqual(attendre(octets), (USSD_OUVERTE, attendu))

    def test_temoin_l_ancien_decoupage_coupait(self):
        for octets, attendu in self.CAS:
            self.assertNotEqual(ancien_decoupage(octets)[1], attendu)


class TestUnNombreResteUnNombre(unittest.TestCase):
    """Indices 10, 17, 42 — en AT+CSCS="GSM", le texte arrive lisible ; une
    suite de chiffres de longueur paire était « décodée » en symboles."""

    NOMBRES = ["5000", "237677123456", "483921", "150000", "1234", "00", "CAFE"]

    def test_au_modem_en_mode_texte(self):
        for n in self.NOMBRES:
            octets = f'+CUSD: 1,"{n}",15\r\n'.encode()
            self.assertEqual(attendre(octets), (USSD_OUVERTE, n), n)

    def test_le_brut_du_reseau_se_decode_encore(self):
        """Ce qu'un firmware laisse passer tel quel (GSM 7 bits tassé, ou
        UCS2 annoncé) se lit toujours — la garde ne vise que les nombres."""
        menu = "Orange Money\n1) Transfert\n2) Retrait"
        self.assertEqual(decode_auto(encode_ucs2(menu), 72, mode_texte=True), menu)
        self.assertEqual(decode_auto(encode_ucs2("1234"), 72, mode_texte=True), "1234")

    def test_temoin_l_ancien_decodage_les_massacrait(self):
        for n in self.NOMBRES:
            self.assertNotEqual(decode_auto(n, 15), n, n)   # sans le mode : l'ancien chemin


class TestLeDcsUcs2EstCru(unittest.TestCase):
    """Indice 12 — une demande de code en UCS2 avec « … » ou « ’ » perdait
    contre son charabia GSM 7 bits : le pavé du code ne s'ouvrait pas, et le
    code partait dans un champ ordinaire, sans le drapeau « secret »."""

    PHRASES = ["Entrez votre PIN…", "PIN’", "Mot de passe’", "Saisir le NIP ‘MoMo’",
               "Tapez le PIN – 4 chiffres", "Code secret »", "Code PIN →",
               "«Oui»", "Bienvenue 😀"]

    def test_lu_tel_qu_ecrit(self):
        for phrase in self.PHRASES:
            for mode in (True, False, None):
                self.assertEqual(decode_auto(encode_ucs2(phrase), 72, mode_texte=mode),
                                 phrase, (phrase, mode))

    def test_au_modem(self):
        octets = f'+CUSD: 1,"{encode_ucs2("Entrez votre PIN…")}",72\r\n'.encode()
        self.assertEqual(attendre(octets), (USSD_OUVERTE, "Entrez votre PIN…"))

    def test_temoin_l_ancien_arbitrage_perdait(self):
        perdues = [p for p in self.PHRASES
                   if ancien_decode(encode_ucs2(p), 72) != p]
        self.assertGreaterEqual(len(perdues), 5, perdues)


class TestLesOctetsDuModem(unittest.TestCase):
    """Indices 18, 41 — chaque morceau était décodé à part, et l'alphabet GSM
    n'était jamais appliqué : « Num\\x05ro », « Num��ro », et un 0x00 que la
    base refusait, laissant la demande en suspens pour toujours."""

    def test_l_alphabet_gsm_brut(self):
        self.assertEqual(attendre(b'+CUSD: 1,"Num\x05ro du b\x05n\x05ficiaire:",15\r\n'),
                         (USSD_OUVERTE, "Numéro du bénéficiaire:"))
        self.assertEqual(attendre(b'+CUSD: 1,"Ecrire a support\x00orange.cm",15\r\n'),
                         (USSD_OUVERTE, "Ecrire a support@orange.cm"))

    def test_un_caractere_coupe_entre_deux_lectures(self):
        self.assertEqual(attendre([(0, b'+CUSD: 1,"Num\xc3'), (0.2, b'\xa9ro:",15\r\n')]),
                         (USSD_OUVERTE, "Numéro:"))

    def test_le_latin_1(self):
        self.assertEqual(attendre(b'+CUSD: 1,"Num\xe9ro",15\r\n'), (USSD_OUVERTE, "Numéro"))

    def test_jamais_de_zero_dans_ce_qui_monte(self):
        for octets in (b'+CUSD: 1,"a\x00b",15\r\n',):
            self.assertNotIn("\x00", attendre(octets)[1])

    def test_temoin_l_ancienne_lecture(self):
        def ancienne(morceaux):
            return "".join(m.decode(errors="replace") for m in morceaux)
        self.assertIn("\x05", ancienne([b'Num\x05ro']))
        self.assertIn("�", ancienne([b'Num\xc3', b'\xa9ro']))
        self.assertEqual(octets_en_texte(b'Num\xc3\xa9ro'), "Numéro")


class TestLesFinsDeLigne(unittest.TestCase):
    """Indice 19 — un retour chariot seul séparait les lignes du menu ; il
    était supprimé plus loin, et le menu se recollait en une phrase."""

    def test_un_retour_chariot_seul_est_une_ligne(self):
        self.assertEqual(attendre(b'+CUSD: 1,"Menu\r1. Send\r2. Cash out",15\r\n'),
                         (USSD_OUVERTE, "Menu\n1. Send\n2. Cash out"))

    def test_temoin(self):
        self.assertEqual(ancien_decoupage(b'+CUSD: 1,"Menu\r1. Send\r2. Cash out",15\r\n')[1]
                         .replace("\r", ""), "Menu1. Send2. Cash out")


class TestLaReponseQuiPart(unittest.TestCase):
    """Indice 20 — une réponse libre partait en UTF-8 dans une commande AT
    déclarée en alphabet GSM ; « \\22 » franchissait les deux filtres."""

    def test_les_chiffres_d_une_autre_ecriture_deviennent_des_chiffres(self):
        self.assertEqual(charge_pour_le_reseau("٥٠٠٠"), "5000")
        self.assertEqual(charge_pour_le_reseau("５０００"), "5000")
        port = PortHorloge([(0, b'+CUSD: 1,"Merci",15\r\n')])
        modem_sur(port).ussd_repondre("٥٠٠٠")
        self.assertEqual(port.ecrit, [b'AT+CUSD=1,"5000",15\r'])

    def test_l_echappement_est_refuse_et_rien_ne_part(self):
        for texte in ('5000\\22,15\\0D', 'a"b', "Hélène"):
            port = PortHorloge()
            with self.assertRaises(ReponseRefusee):
                modem_sur(port).ussd_repondre(texte)
            self.assertEqual(port.ecrit, [], texte)

    def test_un_refus_ne_ferme_pas_le_menu(self):
        """Rien n'a été écrit : le menu est toujours au même titulaire."""
        port = PortHorloge([(0, b'+CUSD: 1,"Montant ?",15\r\n')])
        compte = Compte(modem_sur(port), libelle="MTN", carte=FausseCarte())
        compte.ussd_demarrer("*126#", qui=("web", "c:1"))
        with self.assertRaises(ReponseRefusee):
            compte.ussd_repondre("5\\22", qui=("web", "c:1"))
        self.assertTrue(compte.tenue_par(("web", "c:1")))

    def test_temoin_l_ancien_filtre(self):
        ancien = re.sub(r'["\r\n\x00-\x1f]', "", '5000\\22,15\\0D')
        self.assertIn("\\", ancien)
        self.assertEqual(f'AT+CUSD=1,"{re.sub(chr(34), "", "٥٠٠٠")}",15\r'.encode()[11:13],
                         "٥".encode())


class ModemQuiSeTait:
    """Écrit la demande, puis le réseau ne dit rien à temps (ou dit ce qu'on
    lui fait dire). Tient l'état du menu CÔTÉ RÉSEAU."""

    def __init__(self, script):
        self.script = list(script)
        self.recu = []
        self.raccroches = 0
        self.menu_reseau_ouvert = False

    def _echange(self, charge):
        self.recu.append(charge)
        suite = self.script.pop(0)
        if suite == "silence":
            self.menu_reseau_ouvert = True      # le réseau, lui, attend toujours
            raise ReponseNonRecue("Pas de réponse USSD du réseau (délai dépassé).")
        etat, texte = suite
        self.menu_reseau_ouvert = etat == USSD_OUVERTE
        return etat, texte

    ussd_demarrer = _echange
    ussd_repondre = _echange

    def ussd_annuler(self):
        self.raccroches += 1
        self.menu_reseau_ouvert = False


class TestUnDelaiDepasseRaccroche(unittest.TestCase):
    """Indices 30, 35 — la carte oubliait sa session sans raccrocher ; le
    code composé ensuite tombait comme RÉPONSE dans le menu resté ouvert."""

    def test_la_ligne_est_raccrochee(self):
        modem = ModemQuiSeTait([(USSD_OUVERTE, "Montant ?"), "silence",
                                (USSD_OUVERTE, "Menu")])
        compte = Compte(modem, libelle="MTN", carte=FausseCarte())
        compte.ussd_demarrer("*126#")
        with self.assertRaises(ReponseNonRecue):
            compte.ussd_repondre("5000")
        self.assertEqual(modem.raccroches, 1)
        self.assertFalse(modem.menu_reseau_ouvert)
        self.assertFalse(compte.session_ouverte)

    def test_temoin_sans_raccrocher_le_menu_reste_ouvert(self):
        modem = ModemQuiSeTait([(USSD_OUVERTE, "Montant ?"), "silence"])

        class CompteDAvant(Compte):
            def _echanger(self, envoi, charge):
                try:
                    return envoi(charge)
                except Exception:
                    self.session_ouverte = False
                    self.titulaire = None
                    raise

        compte = CompteDAvant(modem, libelle="MTN", carte=FausseCarte())
        compte.ussd_demarrer("*126#")
        with self.assertRaises(ReponseNonRecue):
            compte.ussd_repondre("5000")
        self.assertTrue(modem.menu_reseau_ouvert)


class CompteQuiSeTait(Compte):
    def __init__(self, script):
        self.modem_ = ModemQuiSeTait(script)
        super().__init__(self.modem_, libelle="Orange ·4432", carte=FausseCarte())


class TestLeCodeEstPeutEtrePasse(unittest.TestCase):
    """Indice 34 — le code secret écrit au modem, le réseau qui répond en
    trente-cinq secondes : le robot annonçait « n'a pas pu faire », et le
    propriétaire refaisait un transfert déjà parti."""

    def _jouer(self):
        compte = CompteQuiSeTait([(USSD_OUVERTE, "Transfert de 50000 FCFA a JEAN\n"
                                   "Entrez votre code secret"), "silence"])
        nuage = FauxNuage()
        p = Pilotage(nuage, [compte], FauxJournal())
        p._traiter({"id": 1, "type": "ussd", "parametres": {"code": "*126#"}})
        p._traiter({"id": 2, "type": "ussd_reponse",
                    "parametres": {"texte": "1234", "secret": True}})
        return compte, nuage

    def test_l_ecran_apprend_que_la_demande_a_pu_aboutir(self):
        compte, nuage = self._jouer()
        final = nuage.maj[-1][1]
        self.assertEqual(final["etat"], "faite")
        self.assertIn("SMS", final["resultat"])
        self.assertNotIn("could not", final["resultat"])
        self.assertNotIn("pas pu faire", final["resultat"])
        self.assertEqual(final["parametres"], {"secret": True, "reseau": "fini"})
        self.assertNotIn("1234", str(nuage.maj))
        self.assertEqual(compte.modem_.recu, ["*126#", "1234"])

    def test_aucun_mot_d_echec_dans_la_phrase(self):
        """Les écrans lisent « échec », « erreur », « réussi » dans le texte :
        la phrase ne doit ni conclure à l'échec ni à la réussite."""
        _, nuage = self._jouer()
        texte = nuage.maj[-1][1]["resultat"]
        self.assertIsNone(re.search(
            r"[ée]chec|[ée]chou|erreur|error|fail|r[ée]ussi|success|effectu", texte, re.I))

    def test_temoin_l_ancienne_issue(self):
        """Avant : toute exception devenait « echouee ». On rejoue la règle."""
        def ancienne_issue(e):
            return "echouee", f"The terminal could not do it: {e}"
        etat, _ = ancienne_issue(ReponseNonRecue("délai"))
        self.assertEqual(etat, "echouee")
        _, nuage = self._jouer()
        self.assertNotEqual(nuage.maj[-1][1]["etat"], etat)


class TestLeMenuRefermeParLeReseau(unittest.TestCase):
    """Indice 37 — un « +CUSD: 2 » non sollicité était jeté sans être lu ;
    le code secret partait alors dans un AT+CUSD=1 qui OUVRAIT une session."""

    def test_rien_ne_part_apres_un_cusd_2_en_attente(self):
        port = PortHorloge(en_attente=b"\r\n+CUSD: 2\r\n")
        with self.assertRaises(MenuReferme):
            modem_sur(port).ussd_repondre("1234")
        self.assertEqual(port.ecrit, [])

    def test_rien_ne_part_apres_un_cusd_2_vu_par_la_veille_des_sms(self):
        port = PortHorloge(en_attente=b"\r\n+CUSD: 2\r\n")
        modem = modem_sur(port)
        self.assertFalse(modem.sms_annonce())
        with self.assertRaises(MenuReferme):
            modem.ussd_repondre("1234")
        self.assertEqual(port.ecrit, [])

    def test_une_composition_n_est_pas_genee(self):
        port = PortHorloge([(0, b'+CUSD: 1,"Menu",15\r\n')], en_attente=b"+CUSD: 2\r\n")
        self.assertEqual(modem_sur(port).ussd_demarrer("*126#"), (USSD_OUVERTE, "Menu"))

    def test_le_guichet_dit_que_rien_n_est_parti(self):
        port = PortHorloge([(0, b'+CUSD: 1,"Entrez votre code secret",15\r\n')])
        compte = Compte(modem_sur(port), libelle="Orange ·4432", carte=FausseCarte())
        nuage = FauxNuage()
        p = Pilotage(nuage, [compte], FauxJournal())
        p._traiter({"id": 1, "type": "ussd", "parametres": {"code": "*126#"}})
        port.en_attente = b"\r\n+CUSD: 2\r\n"
        p._traiter({"id": 2, "type": "ussd_reponse",
                    "parametres": {"texte": "1234", "secret": True}})
        final = nuage.maj[-1][1]
        self.assertEqual(final["etat"], "echouee")
        self.assertIn("nothing was sent", final["resultat"])
        self.assertFalse(any(b"1234" in e for e in port.ecrit))
        self.assertFalse(compte.session_ouverte)

    def test_temoin_l_ancien_envoi(self):
        port = PortHorloge(en_attente=b"\r\n+CUSD: 2\r\n")
        port.reset_input_buffer()                 # ce que faisait l'ancien `_cusd`
        port.write(b'AT+CUSD=1,"1234",15\r')
        self.assertIn(b"1234", port.ecrit[0])


class TestLeSoldeDuPorteMonnaie(unittest.TestCase):
    """Indice 39 — tout « solde » d'un écran USSD devenait le solde de la
    carte : commission, prêt, crédit d'appel."""

    DOUTEUX = ["Solde commission: 2500 FCFA\n0. Retour",
               "Votre solde commission est de 2500 FCFA",
               "Pret MoMo: montant du credit 20000 FCFA, solde a rembourser 25000 FCFA",
               "Solde: 500F. Internet: 2Go. Expire le 12/10",
               "Your main balance is 500 FCFA, valid until 12/12/2026.",
               "Votre solde epargne MoMo est de 50000 FCFA"]

    def _publies(self, texte):
        compte = CompteQuiSeTait([(0, texte)])
        nuage = FauxNuage()
        Pilotage(nuage, [compte], FauxJournal())._traiter(
            {"id": 1, "type": "ussd", "parametres": {"code": "*126#"}})
        return nuage.soldes

    def test_un_autre_solde_n_est_pas_publie(self):
        for texte in self.DOUTEUX:
            self.assertTrue(solde_douteux(texte), texte)
            self.assertEqual(self._publies(texte), [], texte)

    def test_le_vrai_solde_l_est(self):
        self.assertEqual(self._publies("Le solde de votre compte est de 2784137.6FCFA."),
                         [(FausseCarte.iccid, 2784137.6)])

    def test_temoin_le_lecteur_seul_les_prenait(self):
        from totem.analyse_sms import solde_annonce
        pris = [t for t in self.DOUTEUX if solde_annonce(t) is not None]
        self.assertGreaterEqual(len(pris), 5, pris)


class TestLeJournalNeGardePasLeNumero(unittest.TestCase):
    """Indice 40 — « guichet à distance : *126*9*677123456*50000# » montait
    au journal « Ce qui s'est passé », numéro et montant compris."""

    def test_le_code_est_masque(self):
        self.assertEqual(code_pour_le_journal("*126*9*677123456*50000#"), "*126*9*…*…#")
        self.assertEqual(code_pour_le_journal("*126#"), "*126#")
        self.assertEqual(code_pour_le_journal("*8001#"), "*8001#")
        self.assertEqual(code_pour_le_journal("#148*5#"), "#148*5#")

    def test_au_guichet(self):
        compte = CompteQuiSeTait([(0, "Transfert effectue")])
        journal = FauxJournal()
        Pilotage(FauxNuage(), [compte], journal)._traiter(
            {"id": 1, "type": "ussd", "parametres": {"code": "*126*9*677123456*50000#"}})
        tout = " ".join(journal.evenements)
        self.assertNotIn("677123456", tout)
        self.assertNotIn("50000", tout)
        self.assertIn("*126*9*", tout)

    def test_temoin(self):
        self.assertIn("677123456", f"remote desk: {'*126*9*677123456*50000#'} (MTN)")


class TestDeuxReponsesDansLeTampon(unittest.TestCase):
    """Indice 43 — un « +CUSD: 2 » traînant devant la vraie réponse la
    masquait : le premier écran s'affichait vide et « fini »."""

    def test_la_queue_de_la_session_d_avant_est_ignoree(self):
        self.assertEqual(attendre(b'\r\n+CUSD: 2\r\nOK\r\n+CUSD: 1,"Enter PIN",15\r\n'),
                         (USSD_OUVERTE, "Enter PIN"))
        self.assertEqual(attendre([(0, b'\r\n+CUSD: 2\r\n'),
                                   (0.5, b'OK\r\n+CUSD: 1,"Enter PIN",15\r\n')]),
                         (USSD_OUVERTE, "Enter PIN"))

    def test_un_cusd_2_seul_reste_cru(self):
        self.assertEqual(attendre(b'\r\n+CUSD: 2\r\n'), (2, ""))

    def test_temoin(self):
        self.assertEqual(ancien_decoupage(b'\r\n+CUSD: 2\r\nOK\r\n+CUSD: 1,"Enter PIN",15\r\n'),
                         (2, ""))


class TestUneErreurDuModemSeDitToutDeSuite(unittest.TestCase):
    """Indice 44 — un « +CME ERROR » immédiat gardait la carte trente
    secondes, puis annonçait un « délai dépassé » qui cachait la cause."""

    def test_tout_de_suite_et_avec_sa_cause(self):
        depart = time.time()
        with self.assertRaises(ErreurModem) as e:
            attendre(b'\r\n+CME ERROR: unknown\r\n', delai=3)
        self.assertLess(time.time() - depart, 1)
        self.assertIn("unknown", str(e.exception))
        self.assertNotIsInstance(e.exception, ReponseNonRecue)

    def test_temoin(self):
        self.assertIsNone(ANCIEN_RE_CUSD.search("\r\n+CME ERROR: unknown\r\n"))


class TestUnMessageEnDeuxMorceaux(unittest.TestCase):
    """Indice 45 — la suite d'un message arrivée après le sursis : l'écran
    recevait un texte VIDE sur une session ouverte."""

    def test_la_suite_est_attendue(self):
        self.assertEqual(
            attendre([(0.1, b'\r\nOK\r\n+CUSD: 1,"Confirm: Float Transfer\r\nTo: 677123456 JEAN'),
                      (1.6, b' MBA\r\n00. Next",15\r\n')]),
            (USSD_OUVERTE, "Confirm: Float Transfer\nTo: 677123456 JEAN MBA\n00. Next"))

    def test_a_l_echeance_le_debut_plutot_que_rien(self):
        etat, texte = attendre([(0.1, b'OK\r\n+CUSD: 1,"Confirm: Float Transfer\r\nTo: JEAN')],
                               delai=2)
        self.assertEqual((etat, texte), (USSD_OUVERTE, "Confirm: Float Transfer\nTo: JEAN"))

    def test_le_decoupage_seul(self):
        self.assertIsNone(lire_cusd('+CUSD: 1,"Confirm\r\nTo: JEAN'))
        self.assertIsNone(lire_cusd('+CUSD: 1,"Confirm\r\nTo: JEAN', sursis_ecoule=True))

    def test_temoin(self):
        m = ANCIEN_RE_CUSD.search('OK\r\n+CUSD: 1,"Confirm: Float Transfer\r\nTo: JEAN')
        self.assertIsNone(m.group(2))     # l'ancien rendait donc ""


class TestLaTableGsm(unittest.TestCase):
    def test_chaque_position_de_controle_est_traduite(self):
        for code in range(0x20):
            if chr(code) in "\r\n" or code == 0x1B:
                continue
            self.assertEqual(octets_en_texte(bytes([code])), ALPHABET_GSM[code])

    def test_l_echappement(self):
        self.assertEqual(octets_en_texte(b"5\x1be"), "5€")

    def test_en_ucs2_rien_n_est_traduit(self):
        self.assertEqual(octets_en_texte(b"00410042", alphabet_gsm=False), "00410042")


class TestChargeRefuseeEstUneValeur(unittest.TestCase):
    def test(self):
        with self.assertRaises(ChargeRefusee):
            charge_pour_le_reseau("\\")


if __name__ == "__main__":
    unittest.main()
