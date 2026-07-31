# -*- coding: utf-8 -*-
"""Un compte = un modem, une SIM, un opérateur, sa propre session USSD.

Le robot pilote plusieurs comptes en parallèle : chacun écoute son réseau en
permanence, donc aucun SMS n'est perdu quel que soit l'opérateur du client.

Le berceau du HAT n'accueille qu'une carte à la fois, mais rien n'empêche de
l'échanger : deux SIM MTN successives sont deux comptes distincts, avec deux
soldes et deux historiques. C'est l'**ICCID** de la carte qui les sépare, pas
l'opérateur. Un compte porte donc l'identité de la carte du moment, et sait
dire quand elle a été remplacée (`relire_carte`).
"""

import threading

from .carte import Carte
from .modem import USSD_OUVERTE, ErreurModem


class Compte:
    def __init__(self, modem, libelle=None, carte=None, imei=""):
        self.modem = modem
        self.carte = carte or Carte()   # identité de la SIM présente
        self.imei = imei                # le modem qui l'héberge
        # Le libellé vient de la carte ; on accepte qu'il soit forcé (tests,
        # simulation) et on le renomme tout seul si la carte change.
        self.libelle = libelle or self.carte.libelle
        self.session_ouverte = False    # une session USSD par compte
        self.dernier_menu = ""
        self.echecs = 0                 # compteur du chien de garde
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
        sim = "SIM présente" if self.sim_prete() else "SIM absente"
        s = self.signal()
        force = "signal inconnu" if s == 99 else f"signal {s}/31"
        etat = " · session ouverte" if self.session_ouverte else ""
        return f"{self.libelle} · {sim} · {force}{etat}"

    # ---- USSD -------------------------------------------------------------
    def ussd_demarrer(self, code):
        with self.verrou:
            etat, reponse = self.modem.ussd_demarrer(code)
        self._suite(etat, reponse)
        return reponse

    def ussd_repondre(self, reponse_utilisateur):
        with self.verrou:
            etat, reponse = self.modem.ussd_repondre(reponse_utilisateur)
        self._suite(etat, reponse)
        return reponse

    def ussd_annuler(self):
        with self.verrou:
            try:
                self.modem.ussd_annuler()
            except Exception:
                pass
        self.session_ouverte = False
        self.dernier_menu = ""

    def _suite(self, etat, reponse):
        self.session_ouverte = etat == USSD_OUVERTE
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


__all__ = ["Compte", "libelles_uniques", "ErreurModem"]
