# -*- coding: utf-8 -*-
"""Un compte = un modem, une SIM, un opérateur, sa propre session USSD.

Le robot pilote plusieurs comptes en parallèle : chacun écoute son réseau en
permanence, donc aucun SMS n'est perdu quel que soit l'opérateur du client.

Le berceau du HAT n'accueille qu'une carte à la fois, mais rien n'empêche de
l'échanger : deux SIM MTN successives sont deux comptes distincts, avec deux
soldes et deux historiques. C'est l'**ICCID** de la carte qui les sépare, pas
l'opérateur. Un compte porte donc l'identité de la carte du moment, et sait
dire quand elle a été remplacée (`relire_carte`).

À QUI EST LA SESSION
--------------------
Une carte ne tient qu'un menu USSD à la fois : c'est une règle du réseau, pas
du robot. Plusieurs mains peuvent pourtant vouloir ce menu — Telegram, et sur
la plateforme chaque personne qui tient la carte. Le robot gardait cette
réponse en TROIS endroits (le guichet web, Telegram, le modem) qui se
prévenaient par des appels croisés. Entre deux avertissements, une réponse
pouvait partir dans le menu de quelqu'un d'autre — et cette réponse peut être
un code secret.

Une vérification faite AVANT d'écrire ne garantit rien : entre les deux,
quelqu'un a pu écrire. La règle est donc tenue ICI, sous le verrou du modem,
au moment même où l'on écrit : la carte sait qui tient sa session
(`titulaire`), et elle refuse d'écrire la réponse de quelqu'un d'autre
(`SessionTenue`). Aucun registre ailleurs ne peut plus la contredire.
"""

import threading

from .carte import Carte
from .modem import USSD_OUVERTE, ErreurModem
from .textes import t

# Les deux canaux qui composent. Un titulaire est un couple (canal, personne) :
# (TELEGRAM, None) pour les administrateurs du robot, (WEB, "c:12") pour le
# compte n° 12 de la plateforme. Deux personnes sur la plateforme ne sont pas
# « le web » : ce sont deux titulaires.
WEB = "web"
TELEGRAM = "telegram"


class SessionTenue(Exception):
    """La session USSD de cette carte n'est pas (ou plus) à celui qui écrit.

    `titulaire` dit qui la tient — ou None si elle s'est refermée."""

    def __init__(self, titulaire):
        super().__init__(t("the card's USSD session belongs to someone else",
                           "la session USSD de la carte est à quelqu'un d'autre"))
        self.titulaire = titulaire


class Compte:
    def __init__(self, modem, libelle=None, carte=None, imei=""):
        self.modem = modem
        self.carte = carte or Carte()   # identité de la SIM présente
        self.imei = imei                # le modem qui l'héberge
        # Le libellé vient de la carte ; on accepte qu'il soit forcé (tests,
        # simulation) et on le renomme tout seul si la carte change.
        self.libelle = libelle or self.carte.libelle
        self.session_ouverte = False    # une session USSD par compte
        # QUI tient cette session : (canal, personne), ou None. Ne se lit et
        # ne s'écrit que sous `verrou` — voir l'en-tête du module.
        self.titulaire = None
        self.dernier_menu = ""
        self.echecs = 0                 # compteur du chien de garde
        # Une panne de modem s'annonce une fois, pas à chaque tour de
        # surveillance. `panne_signalee` retient qu'on l'a déjà dite ;
        # `prochaine_tentative` espace les essais au lieu de marteler un
        # modem qui vient de refuser trois fois de suite.
        self.panne_signalee = False
        self.prochaine_tentative = 0.0
        self.attente_modem = 0          # l'écart courant entre deux essais
        self.verrou = threading.Lock()  # une seule opération USSD à la fois

    # ---- état -------------------------------------------------------------
    def signal(self):
        try:
            return self.modem.signal()
        except Exception:
            return 99

    def sim_prete(self):
        try:
            return self.modem.sim_presente()
        except Exception:
            return False

    def resume(self):
        """Ligne d'état lisible : « MTN · SIM présente · signal 26/31 »."""
        sim = (t("SIM present", "SIM présente") if self.sim_prete()
               else t("SIM missing", "SIM absente"))
        s = self.signal()
        force = (t("signal unknown", "signal inconnu") if s == 99
                 else f"signal {s}/31")
        etat = (t(" · session open", " · session ouverte")
                if self.session_ouverte else "")
        return f"{self.libelle} · {sim} · {force}{etat}"

    # ---- USSD -------------------------------------------------------------
    #
    # `qui` est le titulaire qui écrit. Absent (None), la carte se comporte
    # comme avant : l'écriture passe, et la session n'a pas de titulaire
    # nommé. Présent, il est VÉRIFIÉ sous le verrou du modem.

    def ussd_demarrer(self, code, qui=None, si_libre=False):
        """Ouvre une session. `si_libre` : refuser (`SessionTenue`) si un
        AUTRE titulaire tient un menu ouvert sur cette carte, au lieu de le
        remplacer. C'est le geste de la plateforme ; Telegram, lui, reprend
        la main (un administrateur est au bout du fil)."""
        with self.verrou:
            if (si_libre and self.session_ouverte
                    and self.titulaire != qui):
                raise SessionTenue(self.titulaire)
            etat, reponse = self._echanger(self.modem.ussd_demarrer, code)
            self._suite(etat, reponse, qui)
        return reponse

    def ussd_repondre(self, reponse_utilisateur, qui=None):
        """Répond au menu ouvert — seulement s'il est à `qui`. Sinon rien ne
        part au réseau : la réponse (peut-être un code secret) ne tombe
        jamais dans le menu d'un autre."""
        with self.verrou:
            if qui is not None and not (self.session_ouverte
                                        and self.titulaire == qui):
                raise SessionTenue(self.titulaire if self.session_ouverte
                                   else None)
            etat, reponse = self._echanger(self.modem.ussd_repondre,
                                           reponse_utilisateur)
            self._suite(etat, reponse, qui)
        return reponse

    def ussd_annuler(self, qui=None):
        """Raccroche. Avec `qui`, seulement sa propre session (ou une session
        sans titulaire) : on ne coupe pas l'opération d'un autre. Rend True
        si la ligne a été raccrochée."""
        with self.verrou:
            if (qui is not None and self.session_ouverte
                    and self.titulaire not in (None, qui)):
                return False
            try:
                self.modem.ussd_annuler()
            except Exception:
                pass
            self.session_ouverte = False
            self.titulaire = None
            self.dernier_menu = ""
        return True

    def tenue_par(self, qui):
        """Cette carte a-t-elle un menu ouvert, tenu par `qui` ?"""
        with self.verrou:
            return self.session_ouverte and self.titulaire == qui

    def _echanger(self, envoi, charge):
        """Un échange avec le réseau. S'il échoue, on ne sait plus où en est
        le menu : DANS LE DOUTE, PERSONNE N'Y RÉPOND. La session est
        considérée close et sans titulaire ; la suivante se recompose."""
        try:
            return envoi(charge)
        except Exception:
            self.session_ouverte = False
            self.titulaire = None
            self.dernier_menu = ""
            raise

    def _suite(self, etat, reponse, qui=None):
        self.session_ouverte = etat == USSD_OUVERTE
        self.titulaire = qui if self.session_ouverte else None
        self.dernier_menu = reponse if self.session_ouverte else ""

    def iccid(self):
        """Numéro de série de la carte présente dans CE modem. Deux SIM du
        même opérateur qui se succèdent dans le même berceau ne portent pas
        le même ICCID : c'est lui qui les distingue, pas l'opérateur."""
        try:
            return self.modem.iccid()
        except Exception:
            return ""

    def _lire(self, nom, defaut=""):
        """Appelle une méthode du modem sans jamais laisser filer d'exception :
        un modem qui bafouille ne doit pas interrompre la surveillance."""
        try:
            return getattr(self.modem, nom)() or defaut
        except Exception:
            return defaut

    def relire_carte(self):
        """Relit l'identité de la carte insérée.

        Renvoie l'**ancienne** carte si la puce a été remplacée depuis la
        dernière lecture, `None` sinon. C'est ce qui permet au robot d'annoncer
        « nouvelle carte » et de basculer l'historique sur le bon compte.

        Un ICCID illisible ne conclut à rien : on garde ce qu'on avait. Répondre
        « la carte a changé » sur une lecture ratée déclencherait une fausse
        alerte à chaque hoquet du modem, et pire, ferait basculer le journal
        vers un compte fantôme.
        """
        iccid = self.iccid()
        if not iccid or iccid == self.carte.iccid:
            return None

        ancienne = self.carte
        # L'IMSI est mémorisé cinq minutes par le modem : sans ce vidage, la
        # nouvelle puce hériterait de l'identité de la précédente, donc du
        # mauvais opérateur — dans le journal comme dans le cloud.
        self._lire("oublier_cache")
        self.carte = Carte(
            iccid=iccid,
            imsi=self._lire("imsi"),
            numero=self._lire("numero"),
            reseau=self._lire("operateur"),
            itinerance=bool(self._lire("itinerance", False)),
        )
        self.libelle = self.carte.libelle
        # Une nouvelle carte, c'est une nouvelle session réseau : le compteur
        # d'échecs du chien de garde repart de zéro.
        self.echecs = 0
        return ancienne if ancienne.identifiee else None

    def memoire_sms(self):
        try:
            return self.modem.memoire_sms()
        except Exception:
            return (0, 0)

    # ---- SMS --------------------------------------------------------------
    def sms_annonce(self):
        """Le modem a-t-il signalé un SMS entrant (+CMTI) ? Non bloquant.

        Sert à relever tout de suite, sans attendre le prochain tour. Un modem
        simulé (démo, tests) n'a pas cette annonce : on répond simplement non,
        et la relève périodique fait le travail comme avant."""
        annonce = getattr(self.modem, "sms_annonce", None)
        if annonce is None:
            return False
        try:
            return annonce()
        except Exception:
            return False

    def lire_sms(self):
        """[(index, expéditeur, texte)] sans effacer : l'appelant n'efface
        qu'une fois le message en sécurité au journal."""
        with self.verrou:
            return self.modem.lire_sms()

    def effacer_sms(self, indices):
        """`indices` : un emplacement, ou la liste des morceaux d'un long SMS."""
        with self.verrou:
            try:
                return self.modem.effacer_sms(indices)
            except Exception:
                return False

    def redemarrer(self):
        with self.verrou:
            self.modem.redemarrer()
            self.session_ouverte = False
            self.titulaire = None
        self.echecs = 0


def libelles_uniques(comptes):
    """Deux SIM du même opérateur ? On numérote pour les distinguer."""
    vus = {}
    for c in comptes:
        vus.setdefault(c.libelle, []).append(c)
    for libelle, groupe in vus.items():
        if len(groupe) > 1:
            for i, c in enumerate(groupe, 1):
                c.libelle = f"{libelle} {i}"
    return comptes


__all__ = ["Compte", "libelles_uniques", "ErreurModem", "SessionTenue",
           "WEB", "TELEGRAM"]
