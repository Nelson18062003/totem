# -*- coding: utf-8 -*-
"""Les sonneries qu'une coupure d'Internet empêchait de partir.

CE QUE LE PROPRIÉTAIRE VOYAIT. Le boîtier perd Internet deux minutes —
Starlink, le routeur — et un client paie pendant ce temps. Le téléphone ne
sonne pas, ni pendant la coupure, ni APRÈS. Telegram, lui, reçoit bien le
message plus tard. Le propriétaire qui attend « le petit son » conclut que
le client n'a pas payé.

LE MÉCANISME. Le robot fait sonner au moment où il LIT le SMS. Il demande
d'abord la liste des téléphones au nuage ; pendant la coupure, l'échec était
avalé et une liste VIDE en tenait lieu. « Personne à prévenir » : rien ne
partait, rien ne se disait au journal, et rien ne rejouait la sonnerie une
fois le SMS monté au nuage.

CE QUI EST EXIGÉ. Une sonnerie qui n'a pas pu partir est RETENUE, et repart
au retour du réseau — APRÈS que son SMS est monté dans la base, regroupée
en une notification qui dit qu'elle est en retard, seulement si elle a
moins d'une demi-heure (mesurée sans l'heure murale du Pi), code à usage
unique toujours masqué, chacun n'entendant que ses cartes, et chacun n'étant
prévenu qu'une fois. Le journal dit combien n'ont pas pu partir, au lieu de
rien.

LES TÉMOINS. `faire_sonner_d_avant` est l'ancienne sonnerie, réécrite en
quinze lignes ; `NuageDHier` est le premier rattrapage, qui partait du signe
de vie sans attendre les SMS. Chaque exigence ajoutée depuis se rejoue sur
la faute qu'elle garde, et l'essai s'arrête si elle PASSE sur elle : un
essai qui ne voit pas l'ancienne faute ne garde rien.
"""

import json
import re
import threading
import time
import types
import unittest
import urllib.error
from datetime import datetime as vraie_datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import totem.app
import totem.notification as module_notification
import totem.nuage as module_nuage
import totem.storage
from totem import textes
from totem.analyse_sms import masquer_le_code
from totem.app import Robot
from totem.carte import Carte
from totem.compte import Compte
from totem.notification import composer, envoyer
from totem.nuage import Nuage
from totem.recu import heure_en_lettres
from totem.simulator import ModemSimule
from totem.storage import Journal

from tests.test_experience_telegram import TransportEspion

MTN = Carte(iccid="89237010000000000011", imsi="624010000000011")
ORANGE = Carte(iccid="89237020000000000022", imsi="624020000000022")

PROPRIO = "ExponentPushToken[proprio]"
VENDEUR = "ExponentPushToken[vendeur]"

PAIEMENTS = [
    "Vous avez recu 25 000 FCFA de NGONO Marie (677123456). Nouveau solde : 100 000 FCFA.",
    "Vous avez recu 12 500 FCFA de ETS KAMDEM (699887766).",
    "Vous avez recu 4 231 500 FCFA de STE NOUVELLE BRASSERIE (650112233).",
]
CODE = "Votre code de confirmation est 483921. Ne le communiquez a personne."


class FauxExpo:
    """Le guichet des notifications, en carton. Il note ce qu'il REMET ; coupé,
    il ne remet rien et le dit comme le vrai (`injoignables`)."""

    def __init__(self):
        self.coupe = False
        self.remises = []           # (instant, jetons, titre, corps)
        self.verrou = threading.Lock()

    def __call__(self, jetons, titre, corps, ouvrir=None, acceptes=None,
                 injoignables=None):
        jetons = list(jetons)
        if not jetons:
            return 0, []
        if self.coupe:
            if injoignables is not None:
                injoignables.extend(jetons)
            return 0, ["le guichet n'a pas répondu"]
        with self.verrou:
            self.remises.append((time.monotonic(), jetons, titre, corps))
        return len(jetons), []

    def apres(self, instant):
        with self.verrou:
            return [r for r in self.remises if r[0] >= instant]


def faire_sonner_d_avant(self, expediteur, libelle, texte, iccid=None,
                         paiement=False):
    """LE TÉMOIN : la sonnerie telle qu'elle partait. `appareils()` rendait
    une liste vide pendant une coupure, `envoyer([])` ne faisait rien, et
    rien ne la rejouait ensuite."""
    if not self.nuage:
        return
    titre, corps = composer(expediteur, libelle, texte)

    def porter():
        try:
            appareils = self.nuage.appareils(iccid)
            servis, soucis = totem.app.envoyer(appareils, titre, corps)
            self._dire_si_les_telephones_se_taisent(len(appareils), servis, soucis)
        except Exception:
            pass

    threading.Thread(target=porter, daemon=True).start()


def attendre(condition, delai=3.0):
    fin = time.monotonic() + delai
    while time.monotonic() < fin:
        if condition():
            return True
        time.sleep(0.02)
    return condition()


class AvecFauxExpo(unittest.TestCase):

    def setUp(self):
        self.expo = FauxExpo()
        self.vrais = (totem.app.envoyer, totem.app.lire_les_accuses,
                      totem.app.ATTENTE_DES_ACCUSES, module_nuage.DEBOUNCE,
                      module_nuage.SIGNE_DE_VIE_REPRISE)
        totem.app.envoyer = self.expo
        totem.app.lire_les_accuses = lambda billets: []
        totem.app.ATTENTE_DES_ACCUSES = 0
        module_nuage.DEBOUNCE = 0.0
        module_nuage.SIGNE_DE_VIE_REPRISE = 0.1
        textes.definir_langue("fr")
        self.a_fermer = []

    def tearDown(self):
        for fermer in self.a_fermer:
            fermer()
        # Un rattrapage encore en route appellerait le VRAI guichet d'Expo
        # une fois le faux retiré : on le laisse finir d'abord.
        for robot in getattr(self, "robots", []):
            attendre(lambda: not robot._rattrapage.locked(), delai=3.0)
        (totem.app.envoyer, totem.app.lire_les_accuses,
         totem.app.ATTENTE_DES_ACCUSES, module_nuage.DEBOUNCE,
         module_nuage.SIGNE_DE_VIE_REPRISE) = self.vrais
        textes.definir_langue("en")

    @staticmethod
    def evenements(journal):
        """Tout le journal — transmis au nuage ou pas : le pont de bout en
        bout les y envoie, et les marque partis."""
        with journal.verrou:
            return [t for (t,) in journal.conn.execute(
                "SELECT texte FROM evenements ORDER BY id")]


# --- de bout en bout : un vrai pont, un faux Supabase, le vrai signe de vie ---

class FauxSupabase:
    """Une base qui connaît UN téléphone (celui du propriétaire), et qui sait
    disparaître : en panne, elle répond 503 à tout — signe de vie compris.

    Elle note QUAND les paiements y entrent : c'est l'instant où
    l'application, ouverte par une notification, peut les trouver. Et elle
    peut être lente à les accepter, comme une base au bout d'une liaison
    Starlink qui revient."""

    def __init__(self):
        self.panne = False
        self.lectures_appareils = 0
        self.paiements = []             # (instant où ils sont DANS la base, n)
        self.lenteur_paiements = 0.0
        banc = self

        class Gestion(BaseHTTPRequestHandler):
            def repondre(soi, statut, corps=b""):
                soi.send_response(statut)
                soi.send_header("Content-Type", "application/json")
                soi.send_header("Content-Length", str(len(corps)))
                soi.end_headers()
                soi.wfile.write(corps)

            def do_GET(soi):
                if soi.path.startswith("/rest/v1/appareils"):
                    banc.lectures_appareils += 1
                if banc.panne:
                    return soi.repondre(503)
                if soi.path.startswith("/rest/v1/appareils"):
                    return soi.repondre(200, json.dumps(
                        [{"jeton": PROPRIO, "utilisateur": None}]).encode())
                soi.repondre(200, b"[]")

            def do_POST(soi):
                corps = json.loads(
                    soi.rfile.read(int(soi.headers.get("Content-Length", 0))) or b"[]")
                if banc.panne:
                    return soi.repondre(503)
                if soi.path.startswith("/rest/v1/paiements"):
                    time.sleep(banc.lenteur_paiements)
                    banc.paiements.append((time.monotonic(), len(corps)))
                soi.repondre(201)

            def do_PATCH(soi):
                soi.rfile.read(int(soi.headers.get("Content-Length", 0)))
                soi.repondre(503) if banc.panne else soi.repondre(200, b"[]")

            def do_DELETE(soi):
                soi.repondre(503 if banc.panne else 204)

            def log_message(soi, *args):
                pass

        self.serveur = ThreadingHTTPServer(("127.0.0.1", 0), Gestion)
        self.serveur.daemon_threads = True
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.serveur.server_port}"

    def fermer(self):
        self.serveur.shutdown()
        self.serveur.server_close()


class NuageDHier(Nuage):
    """LE TÉMOIN DE L'ORDRE : le premier rattrapage. Il partait du signe de
    vie qui passait — sans réveiller la transmission, qui ne retentait qu'à
    son échéance — et ne regardait pas si les SMS étaient montés. Le
    téléphone sonnait « 3 paiements reçus pendant la coupure », on ouvrait
    l'application, et ils n'y étaient pas encore."""

    def _battre(self):
        prochain = time.monotonic()
        while self._marche:
            reste = prochain - time.monotonic()
            if reste > 0 and self._arret.wait(reste):
                break
            depart = time.monotonic()
            try:
                vivant = self.enregistrer_terminal(
                    delai=module_nuage.SIGNE_DE_VIE_DELAI)
            except Exception:
                vivant = False
            if vivant:
                prochain = depart + self.pause
                if self.apres_transmission:
                    self.apres_transmission()
            else:
                prochain = time.monotonic() + min(
                    module_nuage.SIGNE_DE_VIE_REPRISE, self.pause)

    def _apres_la_transmission(self):
        pass


def sans_regarder_si_les_sms_sont_montes(journal):
    """Le rattrapage d'hier ne savait pas si le SMS était dans la base."""
    vraies = journal.sonneries_retenues
    journal.sonneries_retenues = lambda: [s._replace(transmise=True)
                                          for s in vraies()]


class DeBoutEnBout(AvecFauxExpo):

    def monter(self, ancienne=False, hier=False, pause=0.3):
        base = FauxSupabase()
        journal = Journal(":memory:")
        nuage = (NuageDHier if hier else Nuage)(base.url, "cle", "douala",
                                                journal, pause=pause)
        modem = ModemSimule(operateur="MTN")
        compte = Compte(modem, carte=MTN)
        robot = Robot([compte], TransportEspion((1,)), journal, nom="T",
                      pause_sms=1, nuage=nuage)
        self.robots = getattr(self, "robots", []) + [robot]
        if ancienne:
            robot._faire_sonner = types.MethodType(faire_sonner_d_avant, robot)
            nuage.apres_transmission = None
        if hier:
            sans_regarder_si_les_sms_sont_montes(journal)
        self.a_fermer += [nuage.arreter, base.fermer]
        nuage.demarrer(comptes=[compte])
        return base, journal, nuage, robot, compte, modem

    def recevoir(self, robot, compte, modem, base, textes_sms):
        avant = base.lectures_appareils
        for i, texte in enumerate(textes_sms):
            modem.sms_en_attente.append((i + 1, "MobileMoney", texte))
        robot._relever_sms(compte)
        attendre(lambda: base.lectures_appareils >= avant + len(textes_sms)
                 or not base.panne)
        time.sleep(0.3)     # le temps, pour chaque sonnerie, d'être retenue

    def coupure_d_internet(self, ancienne=False, hier=False):
        """Le boîtier perd Internet, trois clients paient, Internet revient.

        La transmission a une échéance LONGUE (1,2 s) et le signe de vie une
        reprise COURTE (0,1 s), comme en vrai (60 s et 10 s) ; et la base met
        0,3 s à accepter les paiements. Le téléphone ne doit sonner qu'une
        fois les paiements DANS la base — et sans attendre l'échéance."""
        base, journal, nuage, robot, compte, modem = self.monter(
            ancienne, hier, pause=1.2)
        time.sleep(0.4)                 # le boîtier vit, tout va bien
        base.panne = True
        time.sleep(0.4)                 # la coupure est là
        debut = time.monotonic()
        self.recevoir(robot, compte, modem, base, PAIEMENTS)
        pendant = self.expo.apres(debut)
        base.lenteur_paiements = 0.3
        retour = time.monotonic()
        base.panne = False
        attendre(lambda: self.expo.apres(retour), delai=3.0)
        time.sleep(0.3)
        apres = self.expo.apres(retour)

        manques = []
        if pendant:
            manques.append("une sonnerie est partie PENDANT la coupure")
        if len(apres) != 1:
            manques.append(f"{len(apres)} notification(s) au retour du "
                           "réseau, au lieu d'une")
        else:
            sonne, jetons, titre, corps = apres[0]
            if jetons != [PROPRIO]:
                manques.append(f"notification adressée à {jetons}")
            if "3 paiements reçus pendant la coupure" not in corps:
                manques.append(f"la notification ne dit pas les trois paiements : {corps!r}")
            montes = [i for i, n in base.paiements if i >= retour]
            if not montes or sonne < min(montes):
                manques.append(
                    "le téléphone a sonné AVANT que les paiements soient dans "
                    "la base : l'application ouverte par la notification ne "
                    "les montre pas")
            if sonne - retour > 1.0:
                manques.append(f"la sonnerie a attendu {sonne - retour:.2f} s "
                               "après le retour du réseau")
        if not any("3 sonneries n'ont pas pu partir" in e
                   for e in self.evenements(journal)):
            manques.append("le journal ne dit pas que 3 sonneries n'ont pas pu partir")
        return manques

    def test_les_paiements_recus_pendant_une_coupure_finissent_par_sonner(self):
        self.assertEqual(self.coupure_d_internet(), [])

    def test_temoin_l_ancienne_sonnerie_se_taisait(self):
        manques = self.coupure_d_internet(ancienne=True)
        self.assertIn("0 notification(s) au retour du réseau, au lieu d'une", manques,
                      "LE TÉMOIN PASSE : l'essai ne voit pas la sonnerie perdue")
        self.assertTrue(any("journal" in m for m in manques))

    def test_temoin_le_premier_rattrapage_sonnait_avant_la_base(self):
        manques = self.coupure_d_internet(hier=True)
        self.assertTrue(any("AVANT que les paiements soient dans la base" in m
                            for m in manques),
                        "LE TÉMOIN PASSE : l'essai ne voit pas la sonnerie "
                        f"partie avant les paiements ({manques})")

    def guichet_injoignable(self, ancienne):
        """Le nuage répond, mais le guichet des notifications non : la
        liste des téléphones se lit, rien ne part. Le réseau qui refuse
        l'envoi est l'autre moitié de la même coupure."""
        base, journal, nuage, robot, compte, modem = self.monter(ancienne)
        time.sleep(0.4)
        self.expo.coupe = True
        debut = time.monotonic()
        self.recevoir(robot, compte, modem, base, PAIEMENTS[:2])
        time.sleep(0.7)                 # deux signes de vie passent : toujours coupé
        pendant = self.expo.apres(debut)
        retour = time.monotonic()
        self.expo.coupe = False
        attendre(lambda: self.expo.apres(retour), delai=3.0)
        time.sleep(0.3)
        apres = self.expo.apres(retour)
        manques = []
        if pendant:
            manques.append("une notification est passée pendant que le guichet était coupé")
        if len(apres) != 1 or "2 paiements reçus pendant la coupure" not in apres[0][3]:
            manques.append(f"au retour du guichet : {[r[3] for r in apres]}")
        return manques

    def test_un_guichet_injoignable_retient_aussi_la_sonnerie(self):
        self.assertEqual(self.guichet_injoignable(ancienne=False), [])

    def test_temoin_un_guichet_injoignable_perdait_la_sonnerie(self):
        self.assertNotEqual(self.guichet_injoignable(ancienne=True), [],
                            "LE TÉMOIN PASSE : l'essai ne voit pas la sonnerie perdue")


# --- les règles du rattrapage, sans réseau ------------------------------------

class FauxNuage:
    """Le nuage réduit à ce que la sonnerie lui demande : qui entend quelle
    carte. Le vendeur a reçu la carte MTN ; le propriétaire entend tout."""
    actif = True

    def __init__(self):
        self.panne = False
        self.lectures = 0
        self.telephones = {MTN.iccid: [PROPRIO, VENDEUR], ORANGE.iccid: [PROPRIO]}

    def appareils(self, iccid=None, lever=False):
        self.lectures += 1
        if self.panne:
            if lever:
                raise urllib.error.URLError("réseau coupé")
            return []
        return list(self.telephones.get(iccid, [PROPRIO]))

    def heure_de_la_base(self):
        """L'heure de la base : la vraie, quoi que dise l'horloge du Pi."""
        return vraie_datetime.now(timezone.utc)

    def reveiller(self):
        pass

    def publier_solde(self, iccid, solde, moment=None):
        return True


class BancDeRattrapage(AvecFauxExpo):
    """Deux cartes, un faux nuage, un faux guichet — et les gestes communs."""

    def setUp(self):
        super().setUp()
        self.robots = []
        self.boitier_neuf()

    def boitier_neuf(self):
        """Un boîtier neuf — journal vide, nuage rétabli — pour rejouer un
        scénario sur le témoin sans hériter du premier passage."""
        self.expo.remises.clear()
        self.nuage = FauxNuage()
        self.modems = {MTN.iccid: ModemSimule("MTN"), ORANGE.iccid: ModemSimule("Orange")}
        self.comptes = {c.iccid: Compte(self.modems[c.iccid], carte=c)
                        for c in (MTN, ORANGE)}
        self.journal = Journal(":memory:")
        self.robot = Robot(list(self.comptes.values()), TransportEspion((1,)),
                           self.journal, nom="TOTEM", pause_sms=1, nuage=self.nuage)
        self.robots.append(self.robot)

    def pendant_la_coupure(self, carte, *textes_sms):
        self.nuage.panne = True
        avant = len(self.journal.sonneries_retenues())
        modem = self.modems[carte.iccid]
        for i, texte in enumerate(textes_sms):
            modem.sms_en_attente.append((100 + avant + i, "MobileMoney", texte))
        self.robot._relever_sms(self.comptes[carte.iccid])
        self.assertTrue(attendre(lambda: len(self.journal.sonneries_retenues())
                                 == avant + len(textes_sms)),
                        "la sonnerie n'a pas été retenue")

    def monter_les_sms(self):
        """Le tour de transmission : les SMS du journal entrent dans la base."""
        with self.journal.verrou:
            ids = [i for (i,) in self.journal.conn.execute("SELECT id FROM sms")]
        self.journal.marquer_sms_envoyes(ids)

    def au_retour(self):
        """Internet revient : les SMS montent, PUIS le rattrapage passe."""
        self.nuage.panne = False
        self.monter_les_sms()
        self.robot._rattraper_les_sonneries()
        return [(jetons, titre, corps) for _, jetons, titre, corps in self.expo.remises]

    def vieillir(self, minutes, *morceaux):
        """Fait vieillir les sonneries des SMS désignés par leur TEXTE — pas
        par leur numéro de sonnerie, qui suit l'ordre où les fils ont
        échoué."""
        with self.journal.verrou:
            for morceau in morceaux:
                self.journal.conn.execute(
                    "UPDATE sonneries SET monotone = monotone - ? "
                    "WHERE texte LIKE ?", (minutes * 60, f"%{morceau}%"))
            self.journal.conn.commit()



class RattrapageDesSonneries(BancDeRattrapage):

    def test_le_code_reste_masque_pour_l_ecran_verrouille(self):
        self.pendant_la_coupure(MTN, PAIEMENTS[0], CODE)
        remises = self.au_retour()
        self.assertTrue(remises)
        for _, _, corps in remises:
            self.assertNotIn("483921", corps)
            self.assertIn("1 paiement et 1 message reçus pendant la coupure", corps)
            self.assertIn("••••••", corps)       # le dernier message, masqué

    def test_chacun_n_entend_que_ses_cartes(self):
        """Le vendeur tient la carte MTN : au rattrapage comme à l'heure, il
        n'entend RIEN de la carte Orange. Le propriétaire entend tout, en
        une seule notification."""
        self.pendant_la_coupure(MTN, PAIEMENTS[0], PAIEMENTS[1])
        self.pendant_la_coupure(ORANGE, PAIEMENTS[2])
        remises = {tuple(j): (titre, corps) for j, titre, corps in self.au_retour()}
        self.assertEqual(set(remises), {(PROPRIO,), (VENDEUR,)})
        titre, corps = remises[(PROPRIO,)]
        self.assertEqual(titre, "TOTEM")         # deux cartes : le nom du boîtier
        self.assertIn("3 paiements reçus pendant la coupure", corps)
        titre, corps = remises[(VENDEUR,)]
        self.assertEqual(titre, self.comptes[MTN.iccid].libelle)
        self.assertIn("2 paiements reçus pendant la coupure", corps)
        self.assertNotIn("BRASSERIE", corps)     # le SMS de la carte Orange

    def test_une_sonnerie_rattrapee_dit_qu_elle_est_en_retard(self):
        """Seule, elle disait exactement ce qu'elle aurait dit à l'heure : un
        paiement retenu vingt-cinq minutes ressemblait à un paiement qui
        vient d'arriver. Elle dit maintenant quand il est arrivé."""
        avant = heure_en_lettres(vraie_datetime.now().astimezone())
        self.pendant_la_coupure(MTN, PAIEMENTS[0])
        (jetons, titre, corps), = [r for r in self.au_retour() if PROPRIO in r[0]]
        apres = heure_en_lettres(vraie_datetime.now().astimezone())
        a_l_heure = composer("MobileMoney", self.comptes[MTN.iccid].libelle,
                             PAIEMENTS[0])
        self.assertNotEqual((titre, corps), a_l_heure,
                            "la sonnerie rattrapée se fait passer pour neuve")
        self.assertEqual(titre, self.comptes[MTN.iccid].libelle)
        self.assertIn(corps, {f"Reçu à {h}, pendant la coupure : {a_l_heure[1]}"
                              for h in (avant, apres)})

    def test_une_sonnerie_de_plus_d_une_demi_heure_ne_sonne_plus(self):
        self.pendant_la_coupure(MTN, PAIEMENTS[0], PAIEMENTS[1], PAIEMENTS[2])
        self.vieillir(40, "NGONO", "KAMDEM")
        remises = self.au_retour()
        self.assertTrue(remises)
        for _, _, corps in remises:
            self.assertTrue(corps.startswith("Reçu à "), corps)
            self.assertIn(masquer(PAIEMENTS[2]), corps)
            self.assertNotIn("NGONO", corps)
            self.assertNotIn("KAMDEM", corps)
        self.assertEqual(self.journal.sonneries_retenues(), [])
        self.assertTrue(any(
            "2 sonneries n'ont pas pu partir" in e and "trop anciennes" in e
            for e in self.evenements(self.journal)))

    def test_le_dernier_annonce_est_le_dernier_sms(self):
        """Chaque SMS sonne dans son propre fil, et les fils échouent dans
        n'importe quel ordre : la sonnerie du troisième SMS peut être retenue
        la première. « Dernier : » doit montrer le dernier SMS reçu."""
        def scenario():
            journal = Journal(":memory:")
            robot = Robot(list(self.comptes.values()), TransportEspion((1,)),
                          journal, nom="TOTEM", pause_sms=1, nuage=self.nuage)
            self.robots.append(robot)
            ids = [journal.sms("MobileMoney", texte, "MTN", MTN.iccid)
                   for texte in PAIEMENTS]
            for i in (2, 0, 1):         # l'ordre où les fils ont échoué
                journal.retenir_sonnerie(ids[i], MTN.iccid, "MTN", "MobileMoney",
                                         PAIEMENTS[i], True)
            journal.marquer_sms_envoyes(ids)
            yield journal
            avant = len(self.expo.remises)
            robot._rattraper_les_sonneries()
            yield [corps for _, j, _, corps in self.expo.remises[avant:]
                   if PROPRIO in j]

        def dernier(corps):
            return corps[0].split(" : ", 1)[1] if corps else None

        etapes = scenario()
        next(etapes)
        self.assertEqual(dernier(next(etapes)), masquer(PAIEMENTS[2]))

        # LE TÉMOIN : rangées par ordre d'échec, comme avant.
        etapes = scenario()
        journal = next(etapes)
        vraies = journal.sonneries_retenues
        journal.sonneries_retenues = lambda: sorted(vraies(), key=lambda s: s.id)
        self.assertNotEqual(dernier(next(etapes)), masquer(PAIEMENTS[2]),
                            "LE TÉMOIN PASSE : l'essai ne voit pas l'ordre perdu")

    def test_le_sms_pas_encore_monte_ne_fait_pas_sonner(self):
        """Le réseau est revenu, la liste des téléphones se lit — mais le SMS
        n'est pas encore dans la base : la sonnerie attend son tour."""
        def scenario(temoin):
            self.boitier_neuf()
            self.pendant_la_coupure(MTN, PAIEMENTS[0])
            if temoin:
                sans_regarder_si_les_sms_sont_montes(self.journal)
            self.nuage.panne = False
            self.robot._rattraper_les_sonneries()
            trop_tot = list(self.expo.remises)
            self.monter_les_sms()
            self.robot._rattraper_les_sonneries()
            return trop_tot, list(self.expo.remises)

        trop_tot, a_temps = scenario(temoin=False)
        self.assertEqual(trop_tot, [])
        self.assertTrue(a_temps)
        trop_tot, _ = scenario(temoin=True)
        self.assertTrue(trop_tot, "LE TÉMOIN PASSE : l'essai ne voit pas la "
                                  "sonnerie partie avant son SMS")

    def test_un_rattrapage_coupe_a_moitie_ne_previent_pas_deux_fois(self):
        """La notification du propriétaire part ; celle du vendeur tombe dans
        un nouveau hoquet. Au tour suivant, le vendeur reçoit la sienne — et
        le propriétaire, déjà prévenu, rien."""
        def scenario(temoin):
            self.boitier_neuf()
            if temoin:
                # Ce qui est servi se retenait par sonnerie, pas par téléphone.
                self.journal.noter_sonneries_servies = lambda *a: None
            self.pendant_la_coupure(MTN, PAIEMENTS[0])
            self.pendant_la_coupure(ORANGE, PAIEMENTS[2])
            vrai, expo = self.expo.__class__.__call__, self.expo

            def hoquet(jetons, titre, corps, **reste):
                expo.coupe = VENDEUR in jetons
                try:
                    return vrai(expo, jetons, titre, corps, **reste)
                finally:
                    expo.coupe = False

            totem.app.envoyer = hoquet
            premier = self.au_retour()
            totem.app.envoyer = expo
            self.robot._rattraper_les_sonneries()
            second = [(j, c) for _, j, _, c in expo.remises][len(premier):]
            return premier, second

        premier, second = scenario(temoin=False)
        self.assertEqual([j for j, _, _ in premier], [[PROPRIO]])
        self.assertIn("2 paiements reçus pendant la coupure", premier[0][2])
        self.assertEqual([j for j, _ in second], [[VENDEUR]])
        self.assertIn("NGONO", second[0][1])
        self.assertEqual(self.journal.sonneries_retenues(), [])
        _, second = scenario(temoin=True)
        self.assertTrue(any(PROPRIO in j for j, _ in second),
                        "LE TÉMOIN PASSE : l'essai ne voit pas le propriétaire "
                        "prévenu deux fois")

    def test_toujours_coupe_rien_n_est_oublie(self):
        self.pendant_la_coupure(MTN, PAIEMENTS[0], PAIEMENTS[1])
        self.nuage.panne = True
        self.robot._rattraper_les_sonneries()
        self.assertEqual(self.expo.remises, [])
        self.assertEqual(len(self.journal.sonneries_retenues()), 2)

    def test_le_journal_compte_sans_rien_dire_des_clients(self):
        """Un journal se garde longtemps et se lit à plusieurs : des nombres,
        une cause — ni nom, ni numéro, ni montant."""
        self.pendant_la_coupure(MTN, PAIEMENTS[0], PAIEMENTS[1])
        self.au_retour()
        lignes = [e for e in self.evenements(self.journal) if "sonnerie" in e]
        self.assertTrue(lignes)
        for ligne in lignes:
            for interdit in ("NGONO", "KAMDEM", "677123456", "25 000", "MobileMoney"):
                self.assertNotIn(interdit, ligne)

    def test_le_rejeu_ne_retient_pas_la_transmission(self):
        """Le rappel de fin de transmission rend la main tout de suite : le
        rattrapage vit dans son propre fil."""
        self.pendant_la_coupure(MTN, PAIEMENTS[0])
        self.nuage.panne = False
        self.monter_les_sms()
        lent = threading.Event()
        vrai = self.robot._rattraper_les_sonneries

        def rattrapage_lent():
            lent.wait(2)
            vrai()

        self.robot._rattraper_les_sonneries = rattrapage_lent
        debut = time.monotonic()
        self.robot._rejouer_les_sonneries()
        self.assertLess(time.monotonic() - debut, 0.2)
        lent.set()
        self.assertTrue(attendre(lambda: self.expo.remises))


def masquer(texte):
    return masquer_le_code(texte)


# --- l'âge d'une sonnerie, sans l'heure murale du Pi ---------------------------

class HorlogeDuPi(vraie_datetime):
    """L'heure murale du Pi. Après une coupure de COURANT, il redémarre avec
    l'heure de sa dernière sauvegarde, et ne la corrige qu'au retour
    d'Internet."""
    decalage = timedelta(0)

    @classmethod
    def now(cls, tz=None):
        return vraie_datetime.now(tz) + cls.decalage


def age_d_hier(sonnerie, heure_base):
    """LE TÉMOIN : l'âge lu sur l'heure murale du Pi, comme avant."""
    return (HorlogeDuPi.now()
            - vraie_datetime.fromisoformat(sonnerie.date)).total_seconds()


class AgeDesSonneries(BancDeRattrapage):

    def setUp(self):
        super().setUp()
        self.vraies_horloges = (totem.app.datetime, totem.storage.datetime,
                                totem.app.age_de_la_sonnerie)
        totem.app.datetime = totem.storage.datetime = HorlogeDuPi

    def tearDown(self):
        (totem.app.datetime, totem.storage.datetime,
         totem.app.age_de_la_sonnerie) = self.vraies_horloges
        HorlogeDuPi.decalage = timedelta(0)
        super().tearDown()

    def coupure_de_courant(self):
        """Le Pi redémarre deux heures en retard ; Starlink met quelques
        minutes à revenir, un client paie pendant ce temps ; Internet
        revient, l'heure se corrige, le rattrapage passe."""
        HorlogeDuPi.decalage = timedelta(hours=-2)
        self.pendant_la_coupure(MTN, PAIEMENTS[0])
        HorlogeDuPi.decalage = timedelta(0)
        return self.au_retour()

    def test_une_coupure_de_courant_ne_vieillit_pas_la_sonnerie(self):
        maintenant = heure_en_lettres(vraie_datetime.now().astimezone())
        remises = self.coupure_de_courant()
        self.assertTrue(remises, "la sonnerie a été jetée comme trop ancienne")
        for _, _, corps in remises:
            # L'heure écrite est la vraie, pas celle du Pi au redémarrage.
            ecrite = re.match(r"Reçu à (\d+ h \d\d), pendant la coupure : ", corps)
            self.assertTrue(ecrite, corps)
            self.assertIn(ecrite.group(1), {maintenant, heure_en_lettres(
                vraie_datetime.now().astimezone())})
        self.assertFalse(any("trop ancienne" in e
                             for e in self.evenements(self.journal)))

    def test_temoin_l_heure_du_pi_jetait_la_sonnerie(self):
        totem.app.age_de_la_sonnerie = age_d_hier
        self.assertEqual(self.coupure_de_courant(), [],
                         "LE TÉMOIN PASSE : l'essai ne voit pas l'horloge du Pi")
        self.assertTrue(any("trop ancienne" in e
                            for e in self.evenements(self.journal)))

    def apres_un_redemarrage(self, emis_le):
        """La sonnerie a été retenue AVANT un redémarrage du Pi : l'horloge
        monotone d'alors ne veut plus rien dire. L'heure réseau du SMS,
        comparée à celle de la base, prend le relais."""
        self.pendant_la_coupure(MTN, PAIEMENTS[0])
        with self.journal.verrou:
            self.journal.conn.execute(
                "UPDATE sonneries SET demarrage = 'un démarrage d''avant', "
                "monotone = 12.0")
            self.journal.conn.execute("UPDATE sms SET emis_le = ?",
                                      (emis_le.isoformat() if emis_le else None,))
            self.journal.conn.commit()
        return self.au_retour()

    def test_apres_un_redemarrage_l_heure_reseau_du_sms_fait_foi(self):
        douala = timezone(timedelta(hours=1))
        emis = (vraie_datetime.now(timezone.utc) - timedelta(minutes=4)).astimezone(douala)
        remises = self.apres_un_redemarrage(emis)
        self.assertTrue(remises)
        for _, _, corps in remises:
            self.assertTrue(corps.startswith(f"Reçu à {heure_en_lettres(emis)},"), corps)

    def test_apres_un_redemarrage_un_vieux_sms_ne_sonne_plus(self):
        emis = vraie_datetime.now(timezone.utc) - timedelta(minutes=40)
        self.assertEqual(self.apres_un_redemarrage(emis), [])
        self.assertTrue(any("trop ancienne" in e
                            for e in self.evenements(self.journal)))

    def test_apres_un_redemarrage_sans_heure_reseau_on_ne_devine_pas(self):
        self.assertEqual(self.apres_un_redemarrage(None), [])
        self.assertEqual(self.journal.sonneries_retenues(), [])
        self.assertTrue(any("ne se laisse plus établir" in e
                            for e in self.evenements(self.journal)))


# --- une réponse perdue n'est pas une sonnerie perdue ------------------------

class GuichetQuiSertPuisSeTait:
    """Un vrai guichet HTTP, en local. Il SERT chaque notification qu'il
    reçoit (le téléphone sonne), mais laisse expirer sa réponse à la
    première : la liaison est lente, la réponse se perd en route."""

    def __init__(self):
        self.servies = []           # (jeton, corps) : ce qui a fait sonner
        self.premiere = True
        banc = self

        class Gestion(BaseHTTPRequestHandler):
            def do_POST(soi):
                lot = json.loads(soi.rfile.read(int(soi.headers["Content-Length"])))
                banc.servies += [(m["to"], m["body"]) for m in lot]
                if banc.premiere:
                    banc.premiere = False
                    time.sleep(0.6)     # au-delà du délai du robot
                corps = json.dumps({"data": [{"status": "ok", "id": f"b{i}"}
                                             for i, _ in enumerate(lot)]}).encode()
                try:
                    soi.send_response(200)
                    soi.send_header("Content-Length", str(len(corps)))
                    soi.end_headers()
                    soi.wfile.write(corps)
                except OSError:
                    pass                # le robot a raccroché : c'est le scénario

            def log_message(soi, *args):
                pass

        self.serveur = ThreadingHTTPServer(("127.0.0.1", 0), Gestion)
        self.serveur.daemon_threads = True
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.serveur.server_port}/push/send"

    def fermer(self):
        self.serveur.shutdown()
        self.serveur.server_close()


def a_renvoyer_d_hier(erreur):
    """LE TÉMOIN : tout ce qui n'était pas un refus 4xx se renvoyait —
    y compris une réponse perdue APRÈS l'envoi."""
    code = getattr(erreur, "code", None)
    return not isinstance(code, int) or code >= 500 or code == 429


class ReponsePerdue(BancDeRattrapage):

    def setUp(self):
        super().setUp()
        self.guichet = GuichetQuiSertPuisSeTait()
        self.vrais_guichet = (module_notification.GUICHET_EXPO,
                              module_notification.DELAI,
                              module_notification._a_renvoyer_plus_tard)
        module_notification.GUICHET_EXPO = self.guichet.url
        module_notification.DELAI = 0.2
        totem.app.envoyer = module_notification.envoyer     # le VRAI envoi

    def tearDown(self):
        super().tearDown()
        (module_notification.GUICHET_EXPO, module_notification.DELAI,
         module_notification._a_renvoyer_plus_tard) = self.vrais_guichet
        self.guichet.fermer()

    def un_paiement(self):
        self.nuage.panne = False
        self.modems[MTN.iccid].sms_en_attente.append((1, "MobileMoney", PAIEMENTS[0]))
        self.robot._relever_sms(self.comptes[MTN.iccid])
        self.assertTrue(attendre(lambda: any(
            "sonnerie retenue" in e or e.startswith("téléphones")
            for e in self.evenements(self.journal)), delai=3.0))
        self.au_retour()                # le tour suivant : rattrapage éventuel
        return [corps for jeton, corps in self.guichet.servies if jeton == PROPRIO]

    def test_un_paiement_ne_sonne_qu_une_fois(self):
        servies = self.un_paiement()
        self.assertEqual(len(servies), 1, servies)
        self.assertEqual(self.journal.sonneries_retenues(), [])
        self.assertTrue(any("peut-être prévenus" in e
                            for e in self.evenements(self.journal)))

    def test_temoin_la_reponse_perdue_faisait_sonner_deux_fois(self):
        module_notification._a_renvoyer_plus_tard = a_renvoyer_d_hier
        self.assertEqual(len(self.un_paiement()), 2,
                         "LE TÉMOIN PASSE : l'essai ne voit pas la double sonnerie")


# --- les deux pièces : la liste des téléphones, le guichet ------------------

class LaPanneSeDit(unittest.TestCase):

    def setUp(self):
        class Panne(BaseHTTPRequestHandler):
            def do_GET(soi):
                soi.send_error(503)

            def log_message(soi, *args):
                pass

        self.serveur = ThreadingHTTPServer(("127.0.0.1", 0), Panne)
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()
        self.nuage = Nuage(f"http://127.0.0.1:{self.serveur.server_port}",
                           "cle", "douala", None)

    def tearDown(self):
        self.serveur.shutdown()
        self.serveur.server_close()

    def test_appareils_dit_la_panne_quand_on_le_lui_demande(self):
        self.assertEqual(self.nuage.appareils(MTN.iccid), [])
        with self.assertRaises(Exception):
            self.nuage.appareils(MTN.iccid, lever=True)

    def test_le_guichet_dit_quels_telephones_n_ont_rien_recu(self):
        """Seul ce qui n'est SÛREMENT pas parti se renvoie : ce qui échoue
        avant la fin de l'envoi (urllib le range dans URLError), ou ce que le
        guichet dit ne pas avoir servi (5xx, 429). Une réponse qui tarde ou
        une connexion coupée APRÈS l'envoi laisse la notification peut-être
        partie : la renvoyer ferait sonner deux fois."""
        cas = (
            (urllib.error.URLError("réseau coupé"), True),
            (urllib.error.URLError(ConnectionRefusedError()), True),
            (urllib.error.URLError(TimeoutError("connexion trop longue")), True),
            (TimeoutError("réponse trop longue"), False),
            (ConnectionResetError("coupée en lisant la réponse"), False),
            (urllib.error.HTTPError("u", 503, "panne", {}, None), True),
            (urllib.error.HTTPError("u", 429, "trop", {}, None), True),
            (urllib.error.HTTPError("u", 400, "refus", {}, None), False),
        )
        vrai = module_notification.urllib.request.urlopen
        try:
            for erreur, retenue in cas:
                with self.subTest(erreur=repr(erreur)):
                    def faux(requete, timeout=None, erreur=erreur):
                        raise erreur
                    module_notification.urllib.request.urlopen = faux
                    injoignables = []
                    servis, _ = envoyer([PROPRIO], "T", "C", injoignables=injoignables)
                    self.assertEqual(servis, 0)
                    self.assertEqual(injoignables, [PROPRIO] if retenue else [])
        finally:
            module_notification.urllib.request.urlopen = vrai

    def test_un_guichet_ferme_se_renvoie_plus_tard(self):
        """Le vrai `urlopen`, sur un port où personne n'écoute : la
        connexion est refusée avant l'envoi, rien n'est parti."""
        vrai = module_notification.GUICHET_EXPO
        module_notification.GUICHET_EXPO = "http://127.0.0.1:9/push/send"
        try:
            injoignables = []
            servis, soucis = envoyer([PROPRIO], "T", "C", injoignables=injoignables)
        finally:
            module_notification.GUICHET_EXPO = vrai
        self.assertEqual((servis, injoignables), (0, [PROPRIO]))
        self.assertEqual(soucis, ["le guichet n'a pas répondu"])


if __name__ == "__main__":
    unittest.main()
