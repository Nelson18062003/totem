# -*- coding: utf-8 -*-
"""LE SERVICE D'UNE CARTE — a-t-elle son réseau, ou non ?

POURQUOI CE MODULE EXISTE
-------------------------
« Check balance » répondait « no network service » : c'était le modem qui
refusait la demande, en anglais, parce que la carte n'était inscrite sur
aucun réseau. Rien ne l'avait dit avant. L'écran montrait des BARRES : la
force du signal (AT+CSQ) mesure l'antenne, pas l'inscription — une carte
peut capter fort et n'être reçue par personne. Le chien de garde ne voyait
rien non plus : lire les SMS rangés dans le modem marche très bien sans
réseau.

Des barres ne disent pas qu'on a du réseau. Ce module lit ce que le modem
SAIT de l'inscription (AT+CREG?, et AT+CEREG? quand la carte n'est pas
inscrite pour les appels et les SMS), et en tire un état que l'écran peut
dire.

CE QU'IL RETIENT D'UNE CARTE (`EtatDuService`) :

- un état ne se DIT qu'après deux lectures mauvaises de suite : un hoquet
  ne s'affiche pas ;
- une COUPURE commence à la première mauvaise lecture et finit au retour ;
- un ÉPISODE regroupe les coupures rapprochées : il ne se clôt qu'après dix
  minutes de bon continu. « La carte qui se déconnecte tout le temps » est
  un épisode de dix coupures, pas dix épisodes ;
- l'alerte part sur le TEMPS CUMULÉ sans service dans l'épisode, ou sur le
  NOMBRE de coupures en une heure — une carte coupée dix minutes, revenue
  deux, coupée dix… est sans réseau 80 % du temps, et un seuil « quinze
  minutes d'affilée » ne la verrait jamais ;
- une lecture qui n'a rien dit (« inconnu ») ne compte ni pour ni contre.

Module PUR : aucune entrée-sortie, l'horloge est passée en argument (une
horloge monotone : le Pi n'a pas d'horloge à pile, et l'heure saute au
premier réglage réseau).

Les chaînes des états sont le contrat robot → plateforme : elles ont leur
miroir dans `web/noyau/service.ts`.
"""

from collections import deque

# --- Les états ---------------------------------------------------------------

INSCRITE = "inscrite"           # CREG 1 (ou 9) : chez elle
ITINERANCE = "itinerance"       # CREG 5 (ou 10) : sur un réseau visité
SMS_SEULEMENT = "sms_seulement"  # CREG 6/7 : inscrite pour les SMS seulement
LIMITEE = "limitee"             # pas de CREG, mais CEREG 1/5 : données seules
RECHERCHE = "recherche"         # CREG 2 : elle cherche son réseau
REFUSEE = "refusee"             # CREG 3 : le réseau refuse la carte
AUCUN = "aucun"                 # CREG 0, 4, 8… : aucun service
INCONNU = "inconnu"             # rien lu : jamais publié, jamais « sans réseau »

# Ni opération ni SMS d'encaissement. « SMS seulement » n'en est PAS : les
# encaissements arrivent, et dire le contraire au propriétaire serait faux.
SANS_SERVICE = frozenset({LIMITEE, RECHERCHE, REFUSEE, AUCUN})


def etat_du_service(creg, cereg=None, sim_prete=True):
    """L'état d'une carte d'après les deux registres du modem.

    `creg` / `cereg` : le <stat> de +CREG / +CEREG (entiers), ou None quand
    la réponse ne se lisait pas. Une SIM absente ou verrouillée répond
    « +CREG: 0,0 » comme une carte sans réseau : on ne conclut rien."""
    if not sim_prete or creg is None:
        return INCONNU
    if creg in (1, 9):
        return INSCRITE
    if creg in (5, 10):
        return ITINERANCE
    if creg in (6, 7):
        return SMS_SEULEMENT
    if cereg in (1, 5):
        return LIMITEE
    if creg == 2:
        return RECHERCHE
    if creg == 3:
        return REFUSEE
    return AUCUN


# --- Les durées ---------------------------------------------------------------
#
# Toutes tirées de documents, aucune MESURÉE sur le boîtier : le journal note
# chaque coupure et chaque relance avec sa durée, pour les revoir sur pièces.

CONFIRMATION = 2          # lectures mauvaises de suite avant de le dire
LECTURE_NORMALE = 30      # secondes entre deux lectures, quand tout va bien
LECTURE_INQUIETE = 15     # … dès qu'une lecture est mauvaise
STABLE = 600              # dix minutes de bon continu closent un épisode
RADIO_APRES = 240         # sans service continu depuis 4 min : relancer la radio
RADIO_ENCORE = 1800       # … une seconde fois 30 min plus tard, pas plus
RADIOS_PAR_EPISODE = 2
ALERTE_CUMUL = 900        # 15 min sans service, cumulées dans l'épisode
ALERTE_COUPURES = 4       # … ou 4 coupures en une heure
ALERTES_PAR_JOUR = 3
GRACE_DEMARRAGE = 180     # rien ne se relance dans les 3 min après le démarrage
JOUR = 86400
HEURE = 3600


class EtatDuService:
    """La mémoire d'UNE carte. Écrite par le seul fil de sa carte ; lue par
    le fil du signe de vie à travers `a_publier`, qui ne lit qu'un
    instantané posé d'un seul geste (jamais un objet à moitié modifié)."""

    def __init__(self):
        self.reinitialiser()

    def reinitialiser(self):
        """Une autre carte dans le berceau : on oublie tout."""
        self.etat = None              # l'état DIT (confirmé), None avant la 1re lecture
        self._candidat = None         # l'état des dernières lectures, pas encore dit
        self._de_suite = 0
        self._premier_mauvais = None  # 1re lecture mauvaise de la série en cours
        self.mauvais_depuis = None    # début de la coupure en cours
        self.bon_depuis = None
        self.episode = None           # voir `_ouvrir_episode`
        self.coupures = deque()       # (début, fin) des coupures closes, sur 24 h
        self.alertes = deque()        # instants des alertes, sur 24 h
        self.prochaine_lecture = 0.0
        self._instantane = None

    # ---- lire -----------------------------------------------------------
    def a_lire(self, maintenant):
        return maintenant >= self.prochaine_lecture

    def signaler_refus(self):
        """Le modem vient de refuser une demande pour « pas de réseau » :
        on relit tout de suite, sans attendre la cadence."""
        self.prochaine_lecture = 0.0

    def noter(self, etat, maintenant):
        """Range une lecture. Rend la liste des événements qu'elle provoque :
        « coupure » (une coupure est confirmée), « episode » (et c'est la
        première d'un épisode), « retour » (le service est revenu),
        « fin_episode » (dix minutes de bon : l'épisode est clos)."""
        mauvais = etat in SANS_SERVICE
        self.prochaine_lecture = maintenant + (
            LECTURE_INQUIETE if (mauvais or self.etat in SANS_SERVICE)
            else LECTURE_NORMALE)
        evenements = []
        if etat == INCONNU:
            # Ni pour ni contre : on garde ce qu'on savait.
            self._publier(maintenant)
            return evenements

        if etat == self._candidat:
            self._de_suite += 1
        else:
            self._candidat, self._de_suite = etat, 1
            if mauvais and self._premier_mauvais is None:
                self._premier_mauvais = maintenant
        if not mauvais:
            self._premier_mauvais = None

        dit_mauvais = self.etat in SANS_SERVICE
        if mauvais and self._de_suite >= CONFIRMATION and self.etat != etat:
            if not dit_mauvais:
                # Une coupure commence — à la PREMIÈRE lecture mauvaise.
                debut = (self._premier_mauvais if self._premier_mauvais is not None
                         else maintenant)
                self.mauvais_depuis = debut
                self.bon_depuis = None
                if self.episode is None:
                    self._ouvrir_episode(debut)
                    evenements.append("episode")
                self.episode["coupures"].append(debut)
                evenements.append("coupure")
            self.etat = etat
        elif not mauvais and self.etat != etat:
            if dit_mauvais:
                self._clore_coupure(maintenant)
                evenements.append("retour")
            if self.bon_depuis is None:
                self.bon_depuis = maintenant
            self.etat = etat

        if (self.episode is not None and self.etat not in SANS_SERVICE
                and self.etat is not None and self.bon_depuis is not None
                and maintenant - self.bon_depuis >= STABLE):
            evenements.append("fin_episode")
            self._dernier_episode = self.episode
            self.episode = None
        self._oublier_le_vieux(maintenant)
        self._publier(maintenant)
        return evenements

    def _ouvrir_episode(self, debut):
        self.episode = {"debut": debut, "coupures": [], "cumul": 0.0,
                        "alerte": None, "radios": 0, "derniere_radio": None}

    def _clore_coupure(self, maintenant):
        debut = self.mauvais_depuis if self.mauvais_depuis is not None else maintenant
        duree = max(0.0, maintenant - debut)
        if self.episode is not None:
            self.episode["cumul"] += duree
        self.coupures.append((debut, maintenant))
        self.mauvais_depuis = None
        self.bon_depuis = maintenant

    def _oublier_le_vieux(self, maintenant):
        while self.coupures and self.coupures[0][1] < maintenant - JOUR:
            self.coupures.popleft()
        while self.alertes and self.alertes[0] < maintenant - JOUR:
            self.alertes.popleft()

    # ---- ce qu'on en dit ------------------------------------------------
    def sans_service(self):
        return self.etat in SANS_SERVICE

    def cumul_episode(self, maintenant):
        """Secondes sans service dans l'épisode, la coupure en cours comprise."""
        if self.episode is None:
            return 0.0
        en_cours = (maintenant - self.mauvais_depuis
                    if self.mauvais_depuis is not None else 0.0)
        return self.episode["cumul"] + max(0.0, en_cours)

    def coupures_derniere_heure(self, maintenant):
        if self.episode is None:
            return 0
        return sum(1 for d in self.episode["coupures"] if d >= maintenant - HEURE)

    def sans_service_24h(self, maintenant):
        """(nombre de coupures, secondes sans service) sur les 24 dernières
        heures, la coupure en cours comprise."""
        n = len(self.coupures)
        s = sum(min(f, maintenant) - max(d, maintenant - JOUR) for d, f in self.coupures)
        if self.mauvais_depuis is not None:
            n += 1
            s += maintenant - max(self.mauvais_depuis, maintenant - JOUR)
        return n, max(0.0, s)

    def _publier(self, maintenant):
        """L'instantané que lit le signe de vie : posé d'UN geste (une seule
        affectation), donc jamais à moitié écrit pour l'autre fil."""
        if self.etat is None:
            return
        n, s = self.sans_service_24h(maintenant)
        depuis = (self.mauvais_depuis if self.etat in SANS_SERVICE
                  else self.bon_depuis)
        self._instantane = (self.etat, depuis, n, s, maintenant)

    def a_publier(self, maintenant):
        """Ce que la plateforme reçoit pour cette carte, ou None avant la
        première lecture. `depuis_s` est une DURÉE (l'horloge du Pi n'est
        pas fiable) : la plateforme la date sur la sienne."""
        x = self._instantane
        if x is None:
            return None
        etat, depuis, n, s, le = x
        en_plus = maintenant - le if etat in SANS_SERVICE else 0.0
        publie = {"etat": etat, "coupures_24h": n,
                  "sans_service_24h_s": round(s + max(0.0, en_plus))}
        if depuis is not None:
            publie["depuis_s"] = round(max(0.0, maintenant - depuis))
        return publie

    # ---- ce qu'on en fait -----------------------------------------------
    def a_relancer(self, maintenant, *, depuis_demarrage, groupe=False):
        """Faut-il relancer la radio de cette carte ? Seulement :
        - une coupure DITE et toujours en cours (jamais sur une carte qui a
          son réseau à cet instant, même au milieu d'un épisode) ;
        - continue depuis 4 minutes (puis 30 minutes de plus pour la
          seconde, et jamais une troisième) ;
        - hors du démarrage ;
        - et pas quand tout le boîtier, ou tout un opérateur, est coupé :
          ce n'est pas la carte, c'est l'antenne ou le réseau du quartier,
          et relancer quatre modems ensemble n'y changerait rien."""
        if groupe or depuis_demarrage < GRACE_DEMARRAGE:
            return False
        if self.etat not in SANS_SERVICE or self.mauvais_depuis is None:
            return False
        if self.episode is None or self.episode["radios"] >= RADIOS_PAR_EPISODE:
            return False
        continu = maintenant - self.mauvais_depuis
        if self.episode["radios"] == 0:
            return continu >= RADIO_APRES
        derniere = self.episode["derniere_radio"] or self.mauvais_depuis
        return maintenant - derniere >= RADIO_ENCORE and continu >= RADIO_APRES

    def radio_relancee(self, maintenant):
        if self.episode is not None:
            self.episode["radios"] += 1
            self.episode["derniere_radio"] = maintenant
        # Relire tout de suite : c'est la lecture qui dit si ça a pris.
        self.prochaine_lecture = 0.0

    def a_prevenir(self, maintenant):
        """« longue » (15 min cumulées dans l'épisode), « frequente » (quatre
        coupures en une heure), ou None. Une fois par épisode, trois fois
        par jour au plus."""
        if self.episode is None or self.episode["alerte"]:
            return None
        if len(self.alertes) >= ALERTES_PAR_JOUR:
            return None
        if self.cumul_episode(maintenant) >= ALERTE_CUMUL:
            return "longue"
        if self.coupures_derniere_heure(maintenant) >= ALERTE_COUPURES:
            return "frequente"
        return None

    def prevenu(self, maintenant, genre):
        if self.episode is not None:
            self.episode["alerte"] = genre
        self.alertes.append(maintenant)

    def episode_clos(self):
        """L'épisode qui vient de se clore (après « fin_episode »)."""
        return getattr(self, "_dernier_episode", None)
