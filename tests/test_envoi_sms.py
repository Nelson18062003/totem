# -*- coding: utf-8 -*-
"""Le robot apprend à ENVOYER un SMS — pour XAFe, qui lui confie le code qui
prouve qu'un numéro est à son propriétaire.

Jusqu'ici, aucun `AT+CMGS` dans totem/ : le robot lisait, il n'écrivait pas.
Ce fichier garde les quatre maillons de l'aller, du texte aux octets :

  1. gsm   — l'alphabet GSM 7 bits se tasse et se détasse à l'identique sur
             l'alphabet ENTIER (extension comprise) ; ce qui part en PDU garde
             le guillemet et la barre (ils ne sont pas dans la commande AT) et
             refuse Ctrl-Z, qui terminerait la saisie ;
  2. pdu   — le SMS-SUBMIT se relit avec le lecteur qu'on a déjà (`_adresse`
             rend « +237677123456 »), la longueur est celle que `AT+CMGS=<n>`
             attend, un caractère hors alphabet fait partir TOUT le message en
             UCS2, et un message trop long est refusé — jamais coupé ;
  3. modem — le dialogue : commande, invite « > », charge + Ctrl-Z, accusé.
             Un refus AVANT l'invite n'écrit pas la charge (rien n'est parti,
             et on peut le dire) ; un port muet APRÈS le Ctrl-Z ne dit ni
             « parti » ni « échoué » (`EnvoiIncertain`) ; un « +CUSD: 2 »
             croisé ferme le menu pour la réponse USSD suivante et n'empêche
             pas l'envoi ; la sonde STK n'émet toujours pas CMGS ;
  4. compte — deux fils sur la même carte (un menu USSD lent, un SMS) ne
             s'entrelacent jamais sur le port, et une erreur d'envoi NE
             RACCROCHE PAS le menu que quelqu'un tient — avec, pour témoin,
             le même envoi passé par `_echanger`, qui raccroche.

Lancer :  python3 -m unittest tests.test_envoi_sms -v
"""

import threading
import time
import unittest

from totem.compte import Compte
from totem.gsm import (ALPHABET_GSM, EXTENSION_GSM, ChargeRefusee, decode_gsm7,
                       empaqueter_septets, encode_gsm7, texte_pour_sms)
from totem.modem import (USSD_OUVERTE, EnvoiIncertain, ErreurModem, MessageTropLong,
                         ModemSerie, ReponseRefusee)
from totem.pdu import (ChargeTropLongue, _adresse, encoder_submit, numero_international,
                       septets, texte_gsm7)

NUMERO = "677123456"
TEXTE = "XAFe Exchange : votre code est 123456."


# =============================================================================
# 1. gsm
# =============================================================================

class TestAlphabetGsm(unittest.TestCase):

    def test_aller_retour_sur_l_alphabet_entier(self):
        # 0x1B est la séquence d'échappement elle-même : il ne s'écrit pas.
        tout = (ALPHABET_GSM + "".join(EXTENSION_GSM.values())).replace("\x1b", "")
        sep = encode_gsm7(tout)
        octets = empaqueter_septets(sep)
        self.assertEqual(septets(octets, len(sep)), sep)
        self.assertEqual(decode_gsm7(octets.hex()), tout)

    def test_toutes_les_longueurs_se_detassent(self):
        """Le tassement se joue sur les bords : 1 à 24 septets, chaque
        longueur relue par le lecteur du module pdu."""
        for n in range(1, 25):
            sep = [(i * 37 + 5) % 128 for i in range(n)]
            relus = septets(empaqueter_septets(sep), n)
            self.assertEqual(relus, sep, f"{n} septets")

    def test_sept_bits_de_bourrage_sont_un_retour_chariot(self):
        # 7 septets = 49 bits = 6 octets + 1 bit : la norme met <CR> dans les
        # sept bits libres, et `decode_gsm7` le retire — sinon un « @ ».
        sep = encode_gsm7("ABCDEFG")
        self.assertEqual(decode_gsm7(empaqueter_septets(sep).hex()), "ABCDEFG")

    def test_hors_alphabet_est_refuse_pas_devine(self):
        with self.assertRaises(ChargeRefusee) as cm:
            encode_gsm7("fête ê")
        self.assertEqual(cm.exception.caracteres, "ê")

    def test_le_texte_d_un_sms_garde_guillemet_et_barre(self):
        self.assertEqual(texte_pour_sms('a"b\\c'), 'a"b\\c')
        self.assertEqual(texte_pour_sms("ligne 1\r\nligne 2"), "ligne 1\nligne 2")
        self.assertEqual(texte_pour_sms("code ٥٠٠٠"), "code 5000")

    def test_ctrl_z_et_echap_sont_refuses(self):
        for c in ("\x1a", "\x1b"):
            with self.assertRaises(ChargeRefusee):
                texte_pour_sms(f"code {c}1234")


# =============================================================================
# 2. pdu
# =============================================================================

class TestSmsSubmit(unittest.TestCase):

    def test_le_destinataire_se_relit_en_international(self):
        longueur, hexa = encoder_submit(NUMERO, TEXTE)
        octets = bytes.fromhex(hexa)
        self.assertEqual(octets[:3], b"\x00\x01\x00")
        numero, fin = _adresse(octets, 3)
        self.assertEqual(numero, "+237677123456")
        self.assertEqual(octets[fin], 0x00)      # TP-PID
        self.assertEqual(octets[fin + 1], 0x00)  # DCS : GSM 7 bits
        udl = octets[fin + 2]
        self.assertEqual(texte_gsm7(septets(octets[fin + 3:], udl)), TEXTE)

    def test_la_longueur_est_celle_que_cmgs_attend(self):
        longueur, hexa = encoder_submit(NUMERO, TEXTE)
        self.assertEqual(longueur, len(hexa) // 2 - 1)

    def test_un_numero_deja_international_part_tel_quel(self):
        _, hexa = encoder_submit("+237 677 12 34 56", "ok")
        self.assertEqual(_adresse(bytes.fromhex(hexa), 3)[0], "+237677123456")

    def test_un_caractere_hors_alphabet_fait_partir_le_tout_en_ucs2(self):
        _, hexa = encoder_submit(NUMERO, "fête ê")
        octets = bytes.fromhex(hexa)
        _, fin = _adresse(octets, 3)
        self.assertEqual(octets[fin + 1], 0x08)
        udl = octets[fin + 2]
        self.assertEqual(udl, len("fête ê") * 2)
        self.assertEqual(octets[fin + 3:].decode("utf-16-be"), "fête ê")

    def test_trop_long_est_refuse_jamais_coupe(self):
        with self.assertRaises(ChargeRefusee):
            encoder_submit(NUMERO, "a" * 161)
        encoder_submit(NUMERO, "a" * 160)      # la borne passe
        with self.assertRaises(ChargeRefusee):
            encoder_submit(NUMERO, "ê" * 71)
        encoder_submit(NUMERO, "ê" * 70)

    def test_trop_long_se_dit_comme_une_longueur(self):
        """Une `ChargeTropLongue`, pas la générique : la première version
        levait `ChargeRefusee("161 caractères, 160 au plus")`, et `Pilotage`
        racontait cette phrase LETTRE PAR LETTRE comme des caractères que le
        réseau refuse."""
        with self.assertRaises(ChargeTropLongue) as cm:
            encoder_submit(NUMERO, "a" * 161)
        self.assertEqual((cm.exception.combien, cm.exception.borne), (161, 160))
        with self.assertRaises(ChargeTropLongue) as cm:
            encoder_submit(NUMERO, "ê" * 71)
        self.assertEqual((cm.exception.combien, cm.exception.borne), (71, 70))

    def test_en_ucs2_la_longueur_annoncee_est_celle_des_octets(self):
        """Un emoji fait QUATRE octets en UTF-16 : compter les caractères
        annonçait un TP-UDL de 8 pour 10 octets de données — un PDU mal
        formé. La borne aussi se compte en octets : 35 emojis (140) passent,
        36 (144) sont refusés."""
        _, hexa = encoder_submit(NUMERO, "ok 😀")
        octets = bytes.fromhex(hexa)
        _, fin = _adresse(octets, 3)
        udl, donnees = octets[fin + 2], octets[fin + 3:]
        self.assertEqual(udl, len(donnees))
        self.assertEqual(udl, 10)
        self.assertEqual(donnees.decode("utf-16-be"), "ok 😀")
        encoder_submit(NUMERO, "😀" * 35)
        with self.assertRaises(ChargeTropLongue):
            encoder_submit(NUMERO, "😀" * 36)

    def test_un_numero_illisible_est_refuse(self):
        with self.assertRaises(ValueError):
            encoder_submit("12", "ok")

    def test_une_ligne_fixe_a_neuf_chiffres_est_refusee_pas_devinee(self):
        """« 222123456 » partait « international » SANS indicatif : le réseau
        l'aurait lu +222 12 34 56 — la Mauritanie. Un code de vérification
        chez un inconnu à l'étranger vaut moins qu'un refus."""
        with self.assertRaises(ValueError):
            encoder_submit("222123456", "ok")
        with self.assertRaises(ValueError):
            numero_international("222123456")
        self.assertEqual(numero_international("677123456"), "237677123456")
        self.assertEqual(numero_international("+237 677 12 34 56"), "237677123456")
        self.assertEqual(numero_international('677"123456\r'), "237677123456")


# =============================================================================
# 3. modem
# =============================================================================

class FauxPortSerie:
    """Un port série qui joue un script : à chaque écriture, la réponse que
    le modem ferait. `muet_apres_ctrl_z` : le modem ne répond plus une fois
    la charge écrite."""

    def __init__(self, reponses=None, en_attente=b"", muet_apres_ctrl_z=False,
                 invite_tardive=False):
        self.ecrit = []
        self.tampon = en_attente
        self.reponses = reponses or {
            b"AT+CMGS=": b"\r\n> ",
            b"\x1a": b"\r\n+CMGS: 17\r\n\r\nOK\r\n",
        }
        self.muet_apres_ctrl_z = muet_apres_ctrl_z
        # CE QUE LE VRAI MODEM FAIT APRÈS « AT+CMGS » : il passe en SAISIE, et
        # tout ce qu'on lui écrit ensuite est du texte de message jusqu'à un
        # Ctrl-Z ou un Échap. `invite_tardive` : il entre en saisie mais ne
        # montre « > » qu'après l'échéance de l'appelant — en pratique, jamais
        # à temps. Les commandes avalées se gardent dans `avale`.
        self.invite_tardive = invite_tardive
        self.saisie = False
        self.avale = []

    @property
    def in_waiting(self):
        return len(self.tampon)

    def read(self, n):
        donnee, self.tampon = self.tampon[:n], self.tampon[n:]
        return donnee

    def read_all(self):
        donnee, self.tampon = self.tampon, b""
        return donnee

    def reset_input_buffer(self):
        self.tampon = b""

    def write(self, octets):
        self.ecrit.append(octets)
        if self.saisie:
            if octets == b"\x1b":
                self.saisie = False           # Échap : la saisie est annulée
            elif octets.endswith(b"\x1a"):
                self.saisie = False
            else:
                self.avale.append(octets)     # du texte de message, pour le modem
            return
        if self.invite_tardive and octets.startswith(b"AT+CMGS="):
            self.saisie = True
            return
        for debut, reponse in self.reponses.items():
            if octets.startswith(debut) or (debut == b"\x1a" and octets.endswith(b"\x1a")):
                if debut == b"\x1a" and self.muet_apres_ctrl_z:
                    return
                self.tampon += reponse
                return


def modem_sur(port):
    """Un `ModemSerie` sans `__init__` (pas de pyserial), en mode PDU."""
    m = ModemSerie.__new__(ModemSerie)
    m.ser = port
    m.verrou = threading.Lock()
    m.ucs2 = False
    m.mode_pdu = True
    m._traine_urc = b""
    m._ferme_par_le_reseau = False
    return m


class TestDialogueCmgs(unittest.TestCase):

    def test_l_accuse_rend_la_reference_et_l_ordre_des_ecritures(self):
        port = FauxPortSerie()
        m = modem_sur(port)
        self.assertEqual(m.envoyer_sms(NUMERO, TEXTE), "17")
        longueur, hexa = encoder_submit(NUMERO, TEXTE)
        self.assertEqual(port.ecrit, [f"AT+CMGS={longueur}\r".encode(),
                                      hexa.encode() + b"\x1a"])

    def test_un_refus_avant_l_invite_n_ecrit_pas_la_charge(self):
        port = FauxPortSerie({b"AT+CMGS=": b"\r\n+CMS ERROR: 500\r\n"})
        m = modem_sur(port)
        with self.assertRaises(ErreurModem) as cm:
            m.envoyer_sms(NUMERO, TEXTE)
        self.assertNotIsInstance(cm.exception, EnvoiIncertain)
        self.assertEqual(len(port.ecrit), 1, "la charge a été écrite malgré le refus")
        self.assertIn("500", str(cm.exception))

    def test_pas_d_invite_n_ecrit_pas_la_charge(self):
        port = FauxPortSerie({b"AT+CMGS=": b""})
        m = modem_sur(port)
        with self.assertRaises(ErreurModem) as cm:
            m._attendre_invite(delai=0.2)
        self.assertNotIsInstance(cm.exception, EnvoiIncertain)
        self.assertNotIn(True, [e.endswith(b"\x1a") for e in port.ecrit],
                         "la charge a été écrite sans invite")

    def test_pas_d_invite_referme_la_saisie_et_l_ussd_suivant_passe(self):
        """Le modem n'avait que du retard : il est en saisie quand l'échéance
        tombe. Sans Échap, la commande suivante — l'USSD d'une demande
        Bonzini — serait avalée comme texte du message, et le menu de la
        carte mort jusqu'au redémarrage du modem. La faute d'un SMS XAFe ne
        tombe pas sur Bonzini."""
        port = FauxPortSerie({b"AT\r": b"\r\nOK\r\n"}, invite_tardive=True)
        m = modem_sur(port)
        port.write(b"AT+CMGS=42\r")           # ce que `envoyer_sms` écrit d'abord
        self.assertTrue(port.saisie, "le faux port n'est pas entré en saisie")
        with self.assertRaises(ErreurModem):
            m._attendre_invite(delai=0.1)
        self.assertEqual(port.ecrit[-1], b"\x1b", "pas d'Échap à l'échéance")
        self.assertFalse(port.saisie)
        self.assertIn("OK", m._envoyer("AT", delai=0.3))
        self.assertEqual(port.avale, [])

    def test_temoin_sans_echap_la_commande_suivante_est_avalee(self):
        """Le même port, l'Échap retenu : la commande suivante n'a pas de
        réponse, elle est dans le message. C'est ce que l'ancien code
        laissait faire, et ce que le faux port doit savoir imiter — sinon
        l'essai précédent ne mesure rien."""
        port = FauxPortSerie({b"AT\r": b"\r\nOK\r\n"}, invite_tardive=True)
        m = modem_sur(port)
        port.write(b"AT+CMGS=42\r")
        ecrire = port.write
        port.write = lambda octets: None if octets == b"\x1b" else ecrire(octets)
        with self.assertRaises(ErreurModem):
            m._attendre_invite(delai=0.1)
        self.assertTrue(port.saisie)
        self.assertEqual(m._envoyer("AT", delai=0.2), "",
                         "LE TÉMOIN PASSE : le faux port répond en saisie")
        self.assertEqual(port.avale, [b"AT\r"])

    def test_le_repli_texte_ecrit_les_chiffres_valides_jamais_le_numero_brut(self):
        """`mode_pdu` faux : la commande porte le numéro. Ce sont les chiffres
        que `encoder_submit` a validés, avec le 237 — jamais le numéro reçu
        tel quel, où un guillemet ou un retour chariot fermerait la commande
        (la défense de `_cusd`). Aucun test ne jouait ce repli."""
        port = FauxPortSerie({b"AT+CMGS=": b"\r\n> ",
                              b"\x1a": b"\r\n+CMGS: 9\r\n\r\nOK\r\n"})
        m = modem_sur(port)
        m.mode_pdu = False
        self.assertEqual(m.envoyer_sms('677"123456\r', TEXTE), "9")
        self.assertEqual(port.ecrit[0], b'AT+CMGS="+237677123456"\r')
        self.assertEqual(port.ecrit[1], TEXTE.encode("utf-8") + b"\x1a")
        # Et la ligne fixe est refusée AVANT d'écrire quoi que ce soit.
        port2 = FauxPortSerie()
        m2 = modem_sur(port2)
        m2.mode_pdu = False
        with self.assertRaises(ValueError):
            m2.envoyer_sms("222123456", TEXTE)
        self.assertEqual(port2.ecrit, [])

    def test_un_message_trop_long_se_dit_trop_long_rien_n_est_ecrit(self):
        port = FauxPortSerie()
        m = modem_sur(port)
        with self.assertRaises(MessageTropLong) as cm:
            m.envoyer_sms(NUMERO, "a" * 161)
        self.assertNotIsInstance(cm.exception, ReponseRefusee)
        self.assertIn("161", str(cm.exception))
        self.assertIn("160", str(cm.exception))
        self.assertEqual(port.ecrit, [])

    def test_un_refus_du_reseau_apres_la_charge_dit_rien_n_est_parti(self):
        port = FauxPortSerie({b"AT+CMGS=": b"\r\n> ",
                              b"\x1a": b"\r\n+CMS ERROR: 331\r\n"})
        m = modem_sur(port)
        with self.assertRaises(ErreurModem) as cm:
            m.envoyer_sms(NUMERO, TEXTE)
        self.assertNotIsInstance(cm.exception, EnvoiIncertain)

    def test_un_port_muet_apres_ctrl_z_est_incertain(self):
        port = FauxPortSerie(muet_apres_ctrl_z=True)
        m = modem_sur(port)
        debut = time.monotonic()
        with self.assertRaises(EnvoiIncertain):
            m.envoyer_sms(NUMERO, TEXTE, delai=0.3)
        self.assertLess(time.monotonic() - debut, 2)
        self.assertEqual(len(port.ecrit), 2)

    def test_un_menu_referme_en_attente_est_note_et_l_envoi_passe(self):
        port = FauxPortSerie(en_attente=b"\r\n+CUSD: 2\r\n")
        m = modem_sur(port)
        self.assertEqual(m.envoyer_sms(NUMERO, TEXTE), "17")
        self.assertTrue(m._ferme_par_le_reseau)

    def test_une_annonce_croisee_pendant_l_envoi_n_est_pas_perdue(self):
        port = FauxPortSerie({b"AT+CMGS=": b"\r\n> ",
                              b"\x1a": b"\r\n+CMTI: \"ME\",4\r\n+CMGS: 3\r\n\r\nOK\r\n"})
        m = modem_sur(port)
        self.assertEqual(m.envoyer_sms(NUMERO, TEXTE), "3")
        self.assertIn(b"+CMTI", m._traine_urc)

    def test_un_caractere_interdit_ne_touche_pas_le_port(self):
        port = FauxPortSerie()
        m = modem_sur(port)
        with self.assertRaises(ReponseRefusee):
            m.envoyer_sms(NUMERO, "code\x1a1234")
        self.assertEqual(port.ecrit, [])

    def test_la_sonde_stk_n_emet_toujours_pas_cmgs(self):
        """`tests/test_stk.py::test_lecture_seule` le garde ; on le relance
        d'ici pour que ce fichier dise la promesse en entier."""
        from tests.test_stk import SondeSimToolkit
        SondeSimToolkit("test_lecture_seule").test_lecture_seule()


# =============================================================================
# 4. compte
# =============================================================================

class ModemLentQuiNote:
    """Un modem dont l'USSD dort 0,2 s en plein échange : si un autre fil
    écrit pendant ce temps, les écritures s'entrelacent — et on le voit."""

    def __init__(self, panne_envoi=None):
        self.ecritures = []     # (nom, phase) dans l'ordre vu par le port
        self.raccroches = 0
        self.panne_envoi = panne_envoi

    def ussd_repondre(self, texte):
        self.ecritures.append(("ussd", "debut"))
        time.sleep(0.2)
        self.ecritures.append(("ussd", "fin"))
        return USSD_OUVERTE, "Suite"

    def ussd_demarrer(self, code):
        return self.ussd_repondre(code)

    def ussd_annuler(self):
        self.raccroches += 1

    def envoyer_sms(self, numero, texte):
        self.ecritures.append(("sms", "debut"))
        if self.panne_envoi:
            raise self.panne_envoi
        self.ecritures.append(("sms", "fin"))
        return "7"


class TestLaCarteEnvoie(unittest.TestCase):

    def test_deux_fils_ne_s_entrelacent_jamais(self):
        modem = ModemLentQuiNote()
        compte = Compte(modem, libelle="MTN ·0011")
        compte.ussd_demarrer("*126#", qui=("web", "c:1"))
        modem.ecritures.clear()
        fils = [threading.Thread(target=compte.ussd_repondre, args=("1",),
                                 kwargs={"qui": ("web", "c:1")}),
                threading.Thread(target=compte.envoyer_sms, args=(NUMERO, TEXTE))]
        fils[0].start()
        time.sleep(0.05)
        fils[1].start()
        for f in fils:
            f.join(5)
        self.assertEqual(modem.ecritures[:2], [("ussd", "debut"), ("ussd", "fin")])
        self.assertEqual(modem.ecritures[2:], [("sms", "debut"), ("sms", "fin")])
        # Le menu n'a pas bougé : la session est toujours à son titulaire.
        self.assertTrue(compte.tenue_par(("web", "c:1")))

    def test_une_erreur_d_envoi_ne_raccroche_pas_le_menu(self):
        modem = ModemLentQuiNote(panne_envoi=ErreurModem("+CMS ERROR: 500"))
        compte = Compte(modem, libelle="MTN ·0011")
        compte.ussd_demarrer("*126#", qui=("web", "c:1"))
        with self.assertRaises(ErreurModem):
            compte.envoyer_sms(NUMERO, TEXTE)
        self.assertEqual(modem.raccroches, 0)
        self.assertTrue(compte.session_ouverte)
        self.assertEqual(compte.titulaire, ("web", "c:1"))

    def test_temoin_le_meme_envoi_par_echanger_raccroche(self):
        """Ce que `Compte.envoyer_sms` évite, montré : passé par `_echanger`,
        une erreur d'envoi raccroche le menu que quelqu'un tient."""
        modem = ModemLentQuiNote(panne_envoi=ErreurModem("+CMS ERROR: 500"))
        compte = Compte(modem, libelle="MTN ·0011")
        compte.ussd_demarrer("*126#", qui=("web", "c:1"))
        with self.assertRaises(ErreurModem):
            with compte.verrou:
                compte._echanger(lambda charge: modem.envoyer_sms(NUMERO, charge),
                                 TEXTE)
        self.assertEqual(modem.raccroches, 1,
                         "LE TÉMOIN PASSE : _echanger ne raccroche plus, l'essai ne mesure rien")
        self.assertFalse(compte.session_ouverte)


if __name__ == "__main__":
    unittest.main()
