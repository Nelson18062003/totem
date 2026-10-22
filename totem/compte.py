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
import time
from contextlib import contextmanager

from .carte import Carte
from .modem import (USSD_OUVERTE, EnvoiIncertain, ErreurModem, MenuReferme,
                    MessageTropLong, PasDeReseau, RefusDuModem,
                    ReponseNonRecue, ReponseRefusee, phrase_de_la_puce,
                    phrase_du_silence)
from .service import (INCONNU, ITINERANCE, SANS_SERVICE, EtatDuService,
                      etat_du_service)
from .textes import t

# Les deux canaux qui composent. Un titulaire est un couple (canal, personne) :
# (TELEGRAM, None) pour les administrateurs du robot, (WEB, "c:12") pour le
# compte n° 12 de la plateforme. Deux personnes sur la plateforme ne sont pas
# « le web » : ce sont deux titulaires.
WEB = "web"
TELEGRAM = "telegram"

# Un code refusé par le modem AVANT d'être envoyé (« no network service »)
# se retente : rien n'est parti, et en itinérance la carte change de réseau
# plusieurs fois par jour — quelques secondes sans service suffisent à faire
# refuser un code tapé à cet instant. Deux reprises, cinq secondes d'écart.
REPRISES_SUR_REFUS = 2
PAUSE_SUR_REFUS = 5.0


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
        # Codes qui n'ont PAS atteint le réseau, de suite : partis sans
        # réponse, ou refusés par le modem pour une autre raison que « pas de
        # réseau » (celle-là, la veille du service s'en charge : relancer le
        # modem n'inscrit pas une carte que personne ne reçoit). Remis à zéro
        # par toute réponse reçue. Trois de suite, sans réglage à réparer :
        # le modem se relance (voir `Pilotage.relanceur`) — ce que le
        # propriétaire faisait à la main en relançant tout le robot.
        self.codes_sans_reseau = 0
        self.dernier_silence = None     # ce que la sonde a lu la dernière fois
        # Une panne de modem s'annonce une fois, pas à chaque tour de
        # surveillance. `panne_signalee` retient qu'on l'a déjà dite ;
        # `prochaine_tentative` espace les essais au lieu de marteler un
        # modem qui vient de refuser trois fois de suite.
        self.panne_signalee = False
        self.prochaine_tentative = 0.0
        self.attente_modem = 0          # l'écart courant entre deux essais
        self.verrou = threading.Lock()  # une seule opération USSD à la fois
        # Le service de la carte : a-t-elle son réseau ? (voir service.py)
        self.service = EtatDuService()
        # LA PUCE EST-ELLE VUE PAR SON MODEM ? « SIM missing · signal
        # unknown » au /statut d'Orange ·4177, le 22 octobre au soir : le
        # modem répondait, la puce avait disparu pour lui, et le service la
        # rangeait « inconnu » — rien ne la relançait, rien ne le disait.
        # Voir `Robot._veiller_la_puce`.
        self.sim_vue = None             # dernière lecture : True, False, None
        self.puce_absente_depuis = None
        self.puce_prochaine_relance = 0.0
        self.puce_relances = 0
        self.puce_absence_dite = False
        # Les relances en cours (radio, modem) : tant qu'il y en a une, la
        # carte refuse toute demande, tout de suite et en le disant, au lieu
        # de la faire attendre derrière son verrou et de la composer en
        # retard. Un COMPTE et non un drapeau : deux relances qui se
        # chevauchent (la veille et le chien de garde), la première finie ne
        # doit pas lever la garde de la seconde.
        self._reglages = 0
        self._garde_des_reglages = threading.Lock()

    # ---- état -------------------------------------------------------------
    @property
    def en_reglage(self):
        """Une relance de la radio ou du modem est-elle en cours ?"""
        return self._reglages > 0

    @contextmanager
    def _reglage(self):
        with self._garde_des_reglages:
            self._reglages += 1
        try:
            yield
        finally:
            with self._garde_des_reglages:
                self._reglages -= 1

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
        """Ligne d'état lisible : « MTN · SIM présente · signal 26/31 ».

        Sans service, pas de « signal 22/31 » : c'est exactement la ligne
        qui faisait croire que la carte avait son réseau."""
        sim = (t("SIM present", "SIM présente") if self.sim_prete()
               else phrase_de_la_puce(self.etat_de_la_puce()))
        service = getattr(self, "service", None)
        if service is not None and service.sans_service():
            force = t("no service", "aucun service")
        else:
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
        self._refuser_si_en_reglage()
        with self.verrou:
            self._refuser_si_en_reglage()
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

    def _refuser_si_en_reglage(self):
        if getattr(self, "en_reglage", False):
            raise PasDeReseau(reconnexion=True)

    def tenue_par(self, qui):
        """Cette carte a-t-elle un menu ouvert, tenu par `qui` ?"""
        with self.verrou:
            return self.session_ouverte and self.titulaire == qui

    def _echanger(self, envoi, charge):
        """Un échange avec le réseau. S'il échoue, on ne sait plus où en est
        le menu : DANS LE DOUTE, PERSONNE N'Y RÉPOND. La session est
        considérée close et sans titulaire ; la suivante se recompose.

        ET LE DOUTE SE RÉSOUT EN RACCROCHANT, PAS EN OUBLIANT. La carte
        oubliait sa session sans rien dire au réseau : un réseau lent qui
        n'avait pas répondu en trente secondes gardait son menu ouvert, et
        le code composé ensuite — même commande AT pour ouvrir et pour
        répondre — y tombait comme une RÉPONSE, dans un écran de montant
        ou de numéro. On raccroche donc la ligne (AT+CUSD=2).

        Deux exceptions, où l'on sait exactement où l'on en est :
        une réponse REFUSÉE avant d'être écrite (`ReponseRefusee`) ne change
        rien au menu, qui reste à son titulaire ; un menu que le réseau
        avait déjà refermé (`MenuReferme`) n'a rien à raccrocher."""
        try:
            resultat = self._envoyer_avec_reprises(envoi, charge)
        except ReponseRefusee:
            raise
        except (ReponseNonRecue, RefusDuModem) as e:
            if getattr(e, "sans_reseau", False):
                # « Pas de réseau » : la carte n'est inscrite nulle part, et
                # relancer le modem n'y change rien — c'est le travail de la
                # veille du service (relire l'inscription au prochain
                # passage, relancer la radio). Ce refus ne compte donc pas
                # pour la relance du modem.
                service = getattr(self, "service", None)
                if service is not None:
                    service.signaler_refus()
            else:
                self.codes_sans_reseau += 1
            try:
                self.modem.ussd_annuler()
            except Exception:
                pass
            self.session_ouverte = False
            self.titulaire = None
            self.dernier_menu = ""
            raise
        except MenuReferme:
            self.session_ouverte = False
            self.titulaire = None
            self.dernier_menu = ""
            raise
        except Exception:
            try:
                self.modem.ussd_annuler()
            except Exception:
                pass    # le raccrochage est un geste de prudence, pas une condition
            self.session_ouverte = False
            self.titulaire = None
            self.dernier_menu = ""
            raise
        self.codes_sans_reseau = 0  # le réseau a répondu : on repart de zéro
        return resultat

    @staticmethod
    def _envoyer_avec_reprises(envoi, charge):
        """Un refus du modem avant l'envoi se retente (`REPRISES_SUR_REFUS`),
        le verrou du modem rendu entre deux essais : la relève des SMS
        continue. Le dernier refus remonte tel quel."""
        for essai in range(REPRISES_SUR_REFUS + 1):
            try:
                return envoi(charge)
            except RefusDuModem:
                if essai >= REPRISES_SUR_REFUS:
                    raise
                time.sleep(PAUSE_SUR_REFUS)

    def _suite(self, etat, reponse, qui=None):
        self.session_ouverte = etat == USSD_OUVERTE
        self.titulaire = qui if self.session_ouverte else None
        self.dernier_menu = reponse if self.session_ouverte else ""

    def expliquer_le_silence(self):
        """Le réseau n'a pas répondu à temps : ce que le modem en dit, en une
        ligne pour le journal (voir `ModemSerie.etat_apres_silence`). Si le
        réglage des annonces USSD est tombé, il est reposé au passage. Ne
        lève jamais, et rend "" pour un modem qui ne sait pas se sonder
        (simulateur, tests)."""
        sonde = getattr(self.modem, "etat_apres_silence", None)
        self.dernier_silence = None
        if sonde is None:
            return ""
        try:
            etat = sonde()
        except Exception as e:
            return t(f"modem not answering ({e})", f"modem muet ({e})")
        self.dernier_silence = etat
        if etat.get("repare"):
            self.codes_sans_reseau = 0      # la cause est trouvée et réparée
        return phrase_du_silence(etat)

    def a_relancer_apres_echecs(self, seuil):
        """Trois codes de suite qui n'ont pas atteint le réseau, et la sonde
        n'a rien trouvé à réparer : le modem cache un état qu'on ne sait pas
        lire, et une relance complète est ce qui le dissipe. Rend True une
        fois, et repart de zéro."""
        if self.codes_sans_reseau < seuil:
            return False
        self.codes_sans_reseau = 0
        return True

    def etat_de_la_puce(self):
        """Ce que le modem a dit de sa puce à la dernière lecture (voir
        `modem.etat_de_la_puce`), ou None s'il ne sait pas le dire."""
        return getattr(self.modem, "puce", None)

    def reglages_refuses(self):
        """Les réglages que le modem a refusés à sa dernière mise en route
        (voir `ModemSerie._initialiser`) — vide si tout est pris."""
        return list(getattr(self.modem, "reglages_refuses", None) or [])

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
        # d'échecs du chien de garde repart de zéro, et ce qu'on savait du
        # service de l'ancienne carte ne vaut rien pour celle-ci.
        self.echecs = 0
        service = getattr(self, "service", None)
        if service is not None:
            service.reinitialiser()
        return ancienne if ancienne.identifiee else None

    def memoire_sms(self):
        try:
            return self.modem.memoire_sms()
        except Exception:
            return (0, 0)

    # ---- le service (le réseau de la carte) ------------------------------
    def lire_service(self):
        """L'état du service de la carte, ou None si on ne lit pas cette fois.

        On ne lit JAMAIS pendant un menu, ni pendant une relève ou un envoi
        de SMS : la carte doit être libre À L'INSTANT (sans attendre), et le
        menu fermé — revérifié sous le verrou. Une carte occupée se relit au
        passage suivant. Ne lève jamais : un modem qui bafouille donne
        « inconnu », qui ne compte ni pour ni contre."""
        lire = getattr(self.modem, "inscription", None)
        if lire is None or self.session_ouverte:
            return None
        if not self.verrou.acquire(blocking=False):
            return None
        try:
            if self.session_ouverte:
                return None
            sim_prete, creg, cereg = lire()
            self.sim_vue = bool(sim_prete)
            etat = etat_du_service(creg, cereg, sim_prete)
        except Exception:
            return INCONNU
        finally:
            self.verrou.release()
        # Le nom du réseau et l'itinérance ne se figent plus au démarrage :
        # ils suivent la carte — mais seulement quand elle est inscrite, et
        # jamais ils ne changent l'OPÉRATEUR de la carte (qui vient de l'IMSI).
        if etat not in SANS_SERVICE and etat != INCONNU:
            self.carte.itinerance = etat == ITINERANCE
        return etat

    def relancer_radio(self):
        """Mode avion, puis retour (voir `ModemSerie.relancer_radio`).

        `en_reglage` est posé AVANT de prendre le verrou : une demande qui
        arrive pendant la relance est refusée tout de suite (« se reconnecte
        à son réseau »), au lieu d'attendre et de partir en retard. Rend True
        (revenue), False (pas revenue), ou None (pas faite : carte occupée,
        menu ouvert, modem qui ne sait pas)."""
        relancer = getattr(self.modem, "relancer_radio", None)
        if relancer is None or self.session_ouverte:
            return None
        with self._reglage():
            if not self.verrou.acquire(timeout=5):
                return None
            try:
                if self.session_ouverte:
                    return None
                return bool(relancer())
            finally:
                self.verrou.release()

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

    @property
    def derniere_releve(self):
        """Les PDU bruts de la dernière relève (voir `modem._trace_du_morceau`).
        Vide pour un modem qui ne les donne pas (simulateur, mode texte)."""
        return list(getattr(self.modem, "derniere_releve", None) or [])

    def effacer_sms(self, indices):
        """`indices` : un emplacement, ou la liste des morceaux d'un long SMS."""
        with self.verrou:
            try:
                return self.modem.effacer_sms(indices)
            except Exception:
                return False

    def envoyer_sms(self, numero, texte):
        """Envoie un SMS depuis cette carte ; rend la référence du modem.

        Sous le verrou de la carte (pour ne pas s'intercaler entre un
        `ussd_demarrer` et sa suite), mais SANS `_echanger` : sur une erreur,
        `_echanger` raccroche le menu USSD — celui qu'une personne tient
        peut-être à cet instant sur la même carte. Un SMS ne tient aucun
        menu : `session_ouverte`, `titulaire`, `dernier_menu` ne bougent pas.
        Les exceptions du modem (`ReponseRefusee`, `ErreurModem`,
        `EnvoiIncertain`) remontent telles quelles."""
        self._refuser_si_en_reglage()
        with self.verrou:
            self._refuser_si_en_reglage()
            return self.modem.envoyer_sms(numero, texte)

    def redemarrer(self):
        # Pendant le redémarrage (près d'une minute), une demande est refusée
        # tout de suite plutôt que composée en retard derrière le verrou.
        try:
            with self._reglage(), self.verrou:
                self.modem.redemarrer()
                self.session_ouverte = False
                self.titulaire = None
        finally:
            # Une relance, d'où qu'elle vienne (le chien de garde, trois
            # codes sans réponse, Telegram, la veille du service), se sait
            # partout : les codes repartent de zéro, et la veille ne relance
            # pas une seconde fois le modem dans le même épisode.
            self.codes_sans_reseau = 0
            service = getattr(self, "service", None)
            if service is not None:
                service.modem_relance(time.monotonic())
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
           "ReponseRefusee", "MenuReferme", "ReponseNonRecue", "EnvoiIncertain",
           "MessageTropLong", "RefusDuModem", "WEB", "TELEGRAM"]
