# -*- coding: utf-8 -*-
"""Tests du décodage des SMS et du recollage des messages longs.

Le défaut à l'origine de ce module : un SMS de plus de 160 caractères arrivait
COUPÉ dans Telegram. Le réseau le découpe en morceaux, et le mode texte du
modem les livrait séparément, sans rien pour les rattacher.

On vérifie ici que les morceaux sont reconnus, remis dans l'ordre, et recollés
— y compris quand ils arrivent à l'envers, ce qui est fréquent.
"""

import unittest
from datetime import datetime, timedelta, timezone

from totem.gsm import ALPHABET_GSM
from totem.pdu import ErreurPDU, Morceau, decoder, recoller


def _empaqueter_gsm7(texte, bits_de_bourrage=0):
    """Tasse des caractères GSM en septets, avec un décalage éventuel."""
    septets = [ALPHABET_GSM.index(c) for c in texte]
    tampon, bits, octets = 0, bits_de_bourrage, bytearray()
    for septet in septets:
        tampon |= septet << bits
        bits += 7
        while bits >= 8:
            octets.append(tampon & 0xFF)
            tampon >>= 8
            bits -= 8
    if bits:
        octets.append(tampon & 0xFF)
    return bytes(octets)


def _bcd(valeur):
    """Chiffres par paires inversées, comme dans un PDU."""
    return ((valeur % 10) << 4) | (valeur // 10)


def _horodatage_pdu(quand):
    return bytes([_bcd(quand.year % 100), _bcd(quand.month), _bcd(quand.day),
                  _bcd(quand.hour), _bcd(quand.minute), _bcd(quand.second), 0])


def fabriquer_pdu(texte, expediteur="MobileMoney", reference=None,
                  total=1, position=1, ucs2=False, quand=None):
    """Construit un PDU reçu (SMS-DELIVER), avec ou sans en-tête de découpe.

    L'horodatage vaut « maintenant » par défaut : un message daté d'hier
    serait considéré comme périmé par le recolleur, et livré incomplet."""
    quand = quand or datetime.now(timezone.utc)
    corps = bytearray()
    corps.append(0x00)                                   # centre SMS omis
    corps.append(0x40 if reference is not None else 0x00)  # bit 6 : en-tête

    # Expéditeur alphanumérique (« MobileMoney »), comme les services MoMo.
    paquet = _empaqueter_gsm7(expediteur)
    corps.append(len(paquet) * 2)
    corps.append(0xD0)
    corps += paquet

    corps.append(0x00)                                   # protocole
    corps.append(0x08 if ucs2 else 0x00)                 # codage
    corps += _horodatage_pdu(quand)                       # horodatage

    udh = b""
    if reference is not None:
        udh = bytes([0x05, 0x00, 0x03, reference, total, position])

    if ucs2:
        donnees = texte.encode("utf-16-be")
        corps.append(len(udh) + len(donnees))
        corps += udh + donnees
    else:
        bourrage = 0
        if udh:
            bourrage = (7 - (len(udh) * 8) % 7) % 7
        paquet = _empaqueter_gsm7(texte, bourrage)
        septets_udh = -(-len(udh) * 8 // 7)
        corps.append(septets_udh + len(texte))
        corps += udh + paquet
    return corps.hex().upper()


class DecodageDUnSms(unittest.TestCase):
    def test_vecteur_de_reference(self):
        """PDU documenté dans la norme : « How are you? »."""
        pdu = ("07911326040000F0040B911346610089F600002080629173140"
               "80CC8F71D14969741F977FD07")
        m = decoder(pdu)
        self.assertEqual(m.texte, "How are you?")
        self.assertEqual(m.expediteur, "+31641600986")
        self.assertTrue(m.entier)

    def test_expediteur_alphanumerique(self):
        m = decoder(fabriquer_pdu("Vous avez recu 25 000 FCFA de A."))
        self.assertEqual(m.expediteur, "MobileMoney")
        self.assertEqual(m.texte, "Vous avez recu 25 000 FCFA de A.")

    def test_alphabet_ucs2(self):
        m = decoder(fabriquer_pdu("Solde : 25 000 FCFA — reçu", ucs2=True))
        self.assertEqual(m.texte, "Solde : 25 000 FCFA — reçu")

    def test_pdu_illisible_signale(self):
        for mauvais in ("", "ZZZZ", "0710F"):
            with self.subTest(pdu=mauvais):
                with self.assertRaises(ErreurPDU):
                    decoder(mauvais)


class MessageLongCoupeEnMorceaux(unittest.TestCase):
    """Le cœur du sujet : un SMS long ne doit plus arriver tronqué."""

    DEBUT = "Releve de compte Orange Money du 31/07 : vous avez recu "
    MILIEU = "25 000 FCFA de NGONO Marie, 15 000 FCFA de TCHOUMI Paul, "
    FIN = "et 40 000 FCFA de FOTSO Jean. Solde : 415 000 FCFA."

    def _trois_morceaux(self):
        return [
            (1, decoder(fabriquer_pdu(self.DEBUT, reference=42, total=3, position=1))),
            (2, decoder(fabriquer_pdu(self.MILIEU, reference=42, total=3, position=2))),
            (3, decoder(fabriquer_pdu(self.FIN, reference=42, total=3, position=3))),
        ]

    def test_un_morceau_se_declare_comme_tel(self):
        m = decoder(fabriquer_pdu("bonjour", reference=42, total=3, position=2))
        self.assertFalse(m.entier)
        self.assertEqual((m.reference, m.total, m.position), (42, 3, 2))

    def test_recollage_dans_l_ordre(self):
        recolles = recoller(self._trois_morceaux())
        self.assertEqual(len(recolles), 1)
        indices, expediteur, texte, complet = recolles[0]
        self.assertTrue(complet)
        self.assertEqual(texte, self.DEBUT + self.MILIEU + self.FIN)
        self.assertEqual(expediteur, "MobileMoney")

    def test_recollage_quand_les_morceaux_arrivent_a_l_envers(self):
        desordre = list(reversed(self._trois_morceaux()))
        texte = recoller(desordre)[0][2]
        self.assertEqual(texte, self.DEBUT + self.MILIEU + self.FIN)

    def test_tous_les_emplacements_sont_a_effacer(self):
        """Sinon un morceau resterait seul dans le modem et reviendrait."""
        indices = recoller(self._trois_morceaux())[0][0]
        self.assertEqual(sorted(indices), [1, 2, 3])

    def test_message_incomplet_retenu_puis_livre(self):
        partiel = self._trois_morceaux()[:2]        # le 3e n'est pas arrivé
        self.assertEqual(recoller(partiel), [])     # on attend

        plus_tard = datetime.now(timezone.utc) + timedelta(days=400)
        livre = recoller(partiel, maintenant=plus_tard)
        self.assertEqual(len(livre), 1)
        indices, _, texte, complet = livre[0]
        self.assertFalse(complet)
        self.assertIn(self.DEBUT, texte)
        self.assertIn("message incomplet", texte)
        self.assertIn("3", texte)                   # le morceau manquant est nommé

    def test_un_morceau_sans_horodatage_ne_bloque_pas_son_emplacement(self):
        # Le défaut réel : un morceau au TP-SCTS corrompu (horodatage None),
        # dans un message incomplet, n'atteignait JAMAIS la limite de patience.
        # Son emplacement modem restait pris à chaque tour, et quelques-uns
        # saturaient la mémoire — le réseau ne pouvait plus déposer les
        # encaissements suivants. Avec la carte de première-vue, il vieillit.
        morceau = Morceau("MTN", "moitie", None, reference=9, total=2, position=1)
        vus = {}
        t0 = datetime(2026, 8, 31, 10, 0, tzinfo=timezone.utc)

        # Tour 1 et 2 : on attend encore la suite (elle peut arriver).
        self.assertEqual(recoller([(0, morceau)], t0, vus), [])
        self.assertEqual(
            recoller([(0, morceau)], t0 + timedelta(minutes=5), vus), [])

        # Passé la patience depuis la PREMIÈRE vue : livré incomplet et effacé.
        livre = recoller([(0, morceau)], t0 + timedelta(minutes=20), vus)
        self.assertEqual(len(livre), 1)
        indices, _, texte, complet = livre[0]
        self.assertEqual(indices, [0])              # l'emplacement se libère
        self.assertFalse(complet)
        self.assertIn("incomplet", texte)
        # La carte se vide après livraison : elle n'enfle pas sans fin.
        self.assertEqual(vus, {})

    def test_sans_carte_le_comportement_reste_celui_d_avant(self):
        # Les tests directs (sans carte persistée) ne changent pas : un morceau
        # sans date reste retenu, faute d'horloge.
        morceau = Morceau("MTN", "x", None, reference=3, total=2, position=1)
        tard = datetime.now(timezone.utc) + timedelta(days=400)
        self.assertEqual(recoller([(0, morceau)], maintenant=tard), [])

    def test_deux_messages_longs_ne_se_melangent_pas(self):
        morceaux = [
            (1, decoder(fabriquer_pdu("AAA", reference=1, total=2, position=1))),
            (2, decoder(fabriquer_pdu("BBB", reference=2, total=2, position=1))),
            (3, decoder(fabriquer_pdu("aaa", reference=1, total=2, position=2))),
            (4, decoder(fabriquer_pdu("bbb", reference=2, total=2, position=2))),
        ]
        textes = sorted(t for _, _, t, _ in recoller(morceaux))
        self.assertEqual(textes, ["AAAaaa", "BBBbbb"])

    def test_expediteurs_differents_ne_se_melangent_pas(self):
        morceaux = [
            (1, decoder(fabriquer_pdu("AAA", expediteur="MTN",
                                      reference=7, total=2, position=1))),
            (2, decoder(fabriquer_pdu("BBB", expediteur="Orange",
                                      reference=7, total=2, position=1))),
        ]
        self.assertEqual(recoller(morceaux), [])   # deux groupes, tous deux incomplets

    def test_un_message_court_reste_seul(self):
        morceaux = [(9, decoder(fabriquer_pdu("Vous avez recu 5 000 FCFA.")))]
        indices, _, texte, complet = recoller(morceaux)[0]
        self.assertEqual(indices, [9])
        self.assertEqual(texte, "Vous avez recu 5 000 FCFA.")
        self.assertTrue(complet)

    def test_message_long_en_ucs2(self):
        morceaux = [
            (1, decoder(fabriquer_pdu("Début accentué — ", reference=5,
                                      total=2, position=1, ucs2=True))),
            (2, decoder(fabriquer_pdu("suite et fin.", reference=5,
                                      total=2, position=2, ucs2=True))),
        ]
        self.assertEqual(recoller(morceaux)[0][2], "Début accentué — suite et fin.")


class LectureParLeModem(unittest.TestCase):
    """Le modem doit recoller avant de livrer, et rendre TOUS les indices."""

    def _modem(self, pdus, mode_pdu=True):
        import sys, types
        sys.modules.setdefault("serial", types.ModuleType("serial"))
        import serial
        from totem.modem import ModemSerie

        reponse = "".join(
            f"\r\n+CMGL: {i},1,,{len(p)//2}\r\n{p}" for i, p in enumerate(pdus, 1)
        ) + "\r\nOK\r\n"

        class Port:
            def __init__(self): self.tampon = b""
            def reset_input_buffer(self): self.tampon = b""
            def write(self, d):
                self.tampon = (reponse if b"CMGL" in d else "\r\nOK\r\n").encode()
            def read_all(self):
                s, self.tampon = self.tampon, b""
                return s

        serial.Serial = lambda *a, **k: Port()
        modem = ModemSerie()
        modem.mode_pdu = mode_pdu
        return modem

    def test_message_long_livre_entier(self):
        pdus = [fabriquer_pdu("Premiere partie. ", reference=9, total=2, position=1),
                fabriquer_pdu("Seconde partie.", reference=9, total=2, position=2)]
        messages = self._modem(pdus).lire_sms()
        self.assertEqual(len(messages), 1)
        indices, expediteur, texte, emis_le = messages[0]
        self.assertEqual(texte, "Premiere partie. Seconde partie.")
        self.assertEqual(sorted(indices), [1, 2])
        # G2 : l'heure réseau (TP-SCTS) est PROPAGÉE, plus jetée.
        self.assertIsNotNone(emis_le)

    def test_pdu_illisible_est_remonte_pour_effacement(self):
        # M8 : un PDU hexadécimal mais indécodable est remonté comme « non
        # décodable » avec son index — pour être journalisé PUIS effacé, sinon
        # il occupe la mémoire du modem à chaque tour et fait perdre les vrais
        # SMS. Il n'empêche pas les autres d'être lus.
        mauvais = "FF" * 12    # hexadécimal, ≥20 caractères, mais indécodable
        pdus = [mauvais, fabriquer_pdu("Message valable.")]
        messages = self._modem(pdus).lire_sms()
        self.assertTrue(any(t == "Message valable." for _, _, t, _ in messages))
        illisible = [(idx, t) for idx, _, t, _ in messages if "non décodable" in t]
        self.assertEqual(len(illisible), 1)
        self.assertEqual(illisible[0][0], [1])   # son index → effaçable


if __name__ == "__main__":
    unittest.main(verbosity=2)
