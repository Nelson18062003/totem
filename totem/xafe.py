# -*- coding: utf-8 -*-
"""La porte XAFe Exchange : la seconde destination des encaissements.

Les trois principes de `nuage.py` (hors-ligne d'abord, rien en double,
silencieux) valent ici mot pour mot — on ne les réécrit pas. Ce qui diffère,
en une phrase : la porte XAFe parle à `/functions/v1`, se signe avec la clé
du boîtier, et rend ses verdicts ligne par ligne dans le corps d'un 200.

C'est pourquoi ce module est un FRÈRE de `nuage.py`, pas un drapeau dedans :
le transport n'a rien de commun (trois en-têtes HMAC, pas de PostgREST, pas de
« Prefer »), et `Nuage._requete` ne se transpose pas. Sans section `[xafe]`
dans totem.conf, `PorteXafe.actif` est faux et aucune méthode ne touche ni le
réseau ni le journal : le robot se comporte à l'octet près comme avant.

XAFe est un TIERS. Un SMS appartient au propriétaire : seuls les SMS d'argent
ENTRANT lui sont envoyés — jamais une publicité, un code, un solde, une
sortie, ni un SMS que le lecteur ne comprend pas. Le tri se fait ICI, avant
toute requête.
"""

import hashlib
import hmac
import json
import socket
import threading
import time
import urllib.error
import urllib.request

from .analyse_sms import analyser
from .carte import OPERATEURS_XAFE  # noqa: F401 — la table unique, référencée
from .nuage import (DEBOUNCE, DELAI, LOT, _age_de_la_demande,  # noqa: F401
                    _heure_de_l_en_tete, _horodatage)
from .textes import t

PAUSE = 60
# Secondes entre deux relèves de commandes (chaque GET vaut signe de vie).
PAS_RELEVE = 10
# La fenêtre de la porte XAFe (porte.ts, FENETRE_SECONDES).
FENETRE_HORLOGE = 300
# L'âge au-delà duquel ce guichet ne veut plus qu'on compose une demande.
XAFE_DEMANDE_PERIMEE_S = 900
# Les verdicts qui CLOSENT une ligne. « erreur » n'en est pas : on réessaie.
DEFINITIFS = frozenset({"credite", "retenue", "ignore", "refuse"})


class PorteMuette(Exception):
    """Réseau coupé, délai, 5xx, JSON illisible : l'appelant garde tout et
    réessaie plus tard."""


class PorteXafe:
    """Dépose les encaissements chez XAFe Exchange. Inerte si non configurée."""

    def __init__(self, url, cle, terminal, journal, pause=PAUSE, anon="",
                 transferts=False):
        self.url = (url or "").rstrip("/")
        self.cle = cle or ""
        self.terminal = terminal or ""
        self.journal = journal
        self.pause = pause
        self.anon = anon or ""
        self.transferts = bool(transferts)
        # HTTPS, OU RIEN — la même garde que `Nuage` : cette adresse se tape
        # à la main sur une partition FAT, et un « http:// » enverrait la
        # clé du boîtier en clair sur le réseau mobile. Qui la lit peut
        # faire créditer des comptes. Le « localhost » des harnais reste
        # admis : rien n'y traverse le réseau.
        if self.url and not self.url.startswith("https://"):
            local = self.url.startswith(("http://127.0.0.1", "http://localhost",
                                         "http://[::1]"))
            if not local:
                if journal is not None:
                    journal.evenement(t(
                        "XAFe address refused: it is not https — the terminal "
                        "key would travel in the clear. Fix [xafe] url.",
                        "Adresse XAFe refusée : elle n'est pas en https — la "
                        "clé du boîtier voyagerait en clair. Corrigez "
                        "[xafe] url."))
                self.url = ""
        self.actif = bool(self.url and self.cle and self.terminal)
        self.nom = "xafe"
        self.derniere_erreur = None
        # Crochets posés par le robot.
        self.fournir_numeros = None     # () -> tuple des numéros du terminal
        self.fournir_float = None       # (iccid) -> (operateur_xafe, numero) | None
        self.sur_incident = None        # (source_id, erreur)
        self.secret_de = None           # (iccid) -> str | None — jamais posé ici
        self._marche = True
        self._reveil = threading.Event()
        self._arret = threading.Event()
        # L'heure de la BASE XAFe (en-tête « Date ») et l'instant monotone où
        # on l'a lue : c'est elle qui signe, pas l'horloge du Pi.
        self._heure_base = None
        self._verrou_heure = threading.Lock()
        self._sans_numero_signales = set()
        self._bogue_signale = False
        self._prochain_releve = 0.0

    # ---- l'heure de la base --------------------------------------------------
    def _noter_l_heure(self, reponse):
        try:
            heure = _heure_de_l_en_tete(reponse.headers.get("Date"))
        except Exception:
            return None
        if heure is not None:
            with self._verrou_heure:
                self._heure_base = (heure, time.monotonic())
        return heure

    def heure_de_la_base(self):
        """L'heure de XAFe maintenant, ou None si elle ne l'a jamais dite."""
        from datetime import timedelta
        with self._verrou_heure:
            if self._heure_base is None:
                return None
            heure, lue_a = self._heure_base
        return heure + timedelta(seconds=time.monotonic() - lue_a)

    def _horodatage_signe(self):
        """Les secondes Unix qui vont dans la signature : celles de la base
        quand on les connaît, sinon celles du Pi (et un 401 nous les
        apprendra)."""
        h = self.heure_de_la_base()
        return int(h.timestamp()) if h is not None else int(time.time())

    @staticmethod
    def _ecart_horloge(heure_serveur):
        return abs(heure_serveur.timestamp() - time.time())

    # ---- la signature ---------------------------------------------------------
    def _signer(self, horodatage, corps_octets):
        """hex( HMAC-SHA256( clé, horodatage + "." + corps ) ) — porte.ts."""
        return hmac.new(self.cle.encode("utf-8"),
                        str(int(horodatage)).encode() + b"." + corps_octets,
                        hashlib.sha256).hexdigest()

    def _appel(self, methode, chemin, corps=None, delai=DELAI, _rejoue=False):
        """(statut, json ou None, heure de la base). Lève `PorteMuette` sur
        tout ce qui n'est pas une réponse de la porte.

        UNE sérialisation : les octets signés sont les octets envoyés. La
        porte relit `req.text()` tel quel ; resérialiser de l'autre côté du
        « = » suffirait à être refusé."""
        donnees = (json.dumps(corps, ensure_ascii=False,
                              separators=(",", ":")).encode("utf-8")
                   if corps is not None else b"")
        ts = self._horodatage_signe()
        req = urllib.request.Request(f"{self.url}/functions/v1/{chemin}",
                                     data=donnees or None, method=methode)
        req.add_header("x-totem-terminal", self.terminal)
        req.add_header("x-totem-horodatage", str(ts))
        req.add_header("x-totem-signature", self._signer(ts, donnees))
        req.add_header("Content-Type", "application/json")
        if self.anon:
            req.add_header("apikey", self.anon)
            req.add_header("Authorization", f"Bearer {self.anon}")
        try:
            with urllib.request.urlopen(req, timeout=delai) as rep:
                heure = self._noter_l_heure(rep)
                brut = rep.read()
                return rep.status, (json.loads(brut) if brut else None), heure
        except urllib.error.HTTPError as e:
            # L'en-tête « Date » est là même sur un 401 : c'est ainsi qu'un
            # Pi dont l'heure a des heures de retard apprend celle de XAFe.
            heure = self._noter_l_heure(e)
            try:
                brut = e.read()
                corps_json = json.loads(brut) if brut else None
            except Exception:
                corps_json = None
            if (e.code == 401 and not _rejoue and heure is not None
                    and self._ecart_horloge(heure) > 60):
                return self._appel(methode, chemin, corps, delai, _rejoue=True)
            if e.code >= 500:
                raise PorteMuette(f"{e.code}")
            return e.code, corps_json, heure
        except (urllib.error.URLError, socket.timeout, OSError, ValueError) as e:
            raise PorteMuette(str(e))

    # ---- pousser les encaissements -------------------------------------------
    def _ligne(self, id_local, date, expediteur, texte, compte, iccid, emis_le,
               numeros):
        """La ligne à envoyer (dict), « sans objet » (à clore ici, sans
        réseau), ou None (carte sans numéro déclaré : la ligne attend)."""
        float_ = None
        if self.fournir_float and iccid:
            try:
                float_ = self.fournir_float(iccid)
            except Exception:
                float_ = None
        if float_ is None:
            if iccid not in self._sans_numero_signales:
                self._sans_numero_signales.add(iccid)
                self.journal.evenement(t(
                    f"XAFe: card {compte} has no declared number — its "
                    "payments wait (Telegram /reglages).",
                    f"XAFe : la carte {compte} n'a pas de numéro déclaré — "
                    "ses encaissements attendent (Telegram /reglages)."))
            return None
        try:
            p = analyser(texte, numeros=numeros)
        except Exception:
            p = None
        if p is None or p.sens != "entree" or not p.montant or p.montant <= 0:
            return "sans objet"
        return {
            "terminal": self.terminal,
            "source_id": id_local,
            "operateur": float_[0],
            "float_numero": float_[1],
            "sens": "entree",
            "montant": p.montant,
            "numero": p.numero,
            # Jamais `p.tiers` : c'est une chaîne traduite (« Inconnu »).
            "tiers": p.nom or p.numero,
            "reference": p.reference,
            "texte": texte,
            "emis_le": _horodatage(emis_le) if emis_le else None,
            "recu_le": _horodatage(date),
        }

    def pousser_paiements(self):
        """Dépose chez XAFe les encaissements qu'il n'a pas tranchés, et dit
        combien de lignes il a CLOSES (crédité, retenu, ignoré, refusé). Ce
        qui est clos ici sans réseau ne compte pas ; ce qui attend se lit
        dans `journal.xafe_en_attente()`."""
        if not self.actif:
            return 0
        lignes = self.journal.sms_a_pousser_xafe(LOT)
        if not lignes:
            return 0
        numeros = ()
        if self.fournir_numeros:
            try:
                numeros = tuple(self.fournir_numeros())
            except Exception:
                numeros = ()
        charge, sans_objet = [], []
        for (id_local, date, expediteur, texte, compte, iccid, emis_le) in lignes:
            ligne = self._ligne(id_local, date, expediteur, texte, compte,
                                iccid, emis_le, numeros)
            if ligne is None:
                continue
            if ligne == "sans objet":
                sans_objet.append((id_local, "sans objet"))
            else:
                charge.append(ligne)
        if sans_objet:
            self.journal.marquer_sms_xafe(sans_objet)
        if not charge:
            return 0
        try:
            statut, reponse, _ = self._appel("POST", "totem-sms",
                                             {"lignes": charge})
        except PorteMuette as e:
            self.derniere_erreur = str(e)
            return 0
        if statut == 401:
            # La PORTE est fermée, pas la ligne : « reseau », jamais
            # « refuse » (nuage.py en a tiré la leçon).
            self.derniere_erreur = "signature refusée"
            self._signaler_une_fois(t(
                "XAFe refuses the terminal signature: wrong key, or clock off "
                "by more than five minutes. Nothing is lost.",
                "XAFe refuse la signature du boîtier : clé fausse, ou horloge "
                "décalée de plus de cinq minutes. Rien n'est perdu."))
            return 0
        if statut != 200:
            self.derniere_erreur = f"{statut} {reponse!r}"[:300]
            self._signaler_une_fois(t(
                f"XAFe refuses the batch ({statut}): a defect on our side, "
                "nothing is lost.",
                f"XAFe refuse le lot ({statut}) : un défaut de notre côté, "
                "rien n'est perdu."))
            return 0
        verdicts = reponse if isinstance(reponse, list) else [reponse]
        a_marquer, erreur_vue = [], None
        for ligne, v in zip(charge, verdicts):
            if not isinstance(v, dict):
                continue
            if v.get("source_id") not in (None, ligne["source_id"]):
                continue        # la réponse n'est pas celle de cette ligne
            id_local = ligne["source_id"]
            r = v.get("resultat")
            motif = str(v.get("motif") or "")
            if r == "credite":
                ref = v.get("reference") or ""
                a_marquer.append((id_local, f"credite {ref}".strip()))
                self.journal.evenement(t(f"XAFe: SMS {id_local} credited ({ref})",
                                         f"XAFe : SMS {id_local} crédité ({ref})"))
            elif r == "retenue":
                a_marquer.append((id_local, f"retenue {v.get('id', '')}".strip()))
            elif r == "ignore":
                a_marquer.append((id_local, "ignore"))
            elif r == "refuse":
                a_marquer.append((id_local, f"refuse {motif}".strip()))
                self.journal.evenement(t(
                    f"payment {id_local} refused by XAFe, set aside: {motif}",
                    f"paiement {id_local} refusé par XAFe, mis de côté : {motif}"))
                self._alerter(id_local, motif)
            elif r == "erreur":
                erreur_vue = motif or "erreur"
                self._alerter(id_local, erreur_vue)
            # verdict absent ou inconnu : la ligne reste, on réessaiera.
        self.journal.marquer_sms_xafe(a_marquer)
        self.derniere_erreur = erreur_vue
        return len(a_marquer)

    def _signaler_une_fois(self, phrase):
        if self._bogue_signale:
            return
        self._bogue_signale = True
        try:
            self.journal.evenement(phrase)
        except Exception:
            pass

    def _alerter(self, source_id, erreur):
        if self.sur_incident:
            try:
                self.sur_incident(source_id, erreur)
            except Exception:
                pass

    # ---- le fil ---------------------------------------------------------------
    def reveiller(self):
        """Une ligne vient d'entrer au journal : ne pas attendre la pause."""
        self._reveil.set()

    def demarrer(self):
        if not self.actif:
            return None
        fil = threading.Thread(target=self._boucle, name="porte xafe",
                               daemon=True)
        fil.start()
        return fil

    def arreter(self):
        self._marche = False
        self._reveil.set()
        self._arret.set()

    def _boucle(self):
        while self._marche:
            try:
                self._pousser_tout()
            except Exception as e:
                self.derniere_erreur = str(e)
            if self._reveil.wait(timeout=self.pause):
                self._reveil.clear()
                time.sleep(DEBOUNCE)

    def _pousser_tout(self):
        """Lot après lot tant qu'un lot part plein ; une coupure rend 0 et
        sort."""
        total = 0
        while self._marche:
            envoyes = self.pousser_paiements()
            total += envoyes
            if envoyes < LOT:
                break
            time.sleep(0.2)
        return total

    def resume(self):
        """Ligne d'état pour /statut."""
        if not self.actif:
            return t("XAFe disabled", "XAFe désactivé")
        reste = self.journal.xafe_en_attente()
        if self.derniere_erreur:
            return t(f"XAFe unreachable · {reste} waiting",
                     f"XAFe injoignable · {reste} en attente")
        if not reste:
            return t("XAFe up to date", "XAFe à jour")
        return t(f"XAFe · {reste} waiting", f"XAFe · {reste} en attente")
