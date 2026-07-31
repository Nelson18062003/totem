# -*- coding: utf-8 -*-
"""Pont vers Supabase : une copie de ce que le terminal a vu.

Trois principes, dans cet ordre :

  1. **Hors-ligne d'abord.** À Douala l'internet tombe, mais les paiements
     continuent d'arriver. Le journal local reste la source de vérité ; le
     cloud n'est qu'un miroir qui rattrape son retard quand il peut. Une
     panne réseau ne doit jamais faire perdre un SMS ni bloquer le robot.

  2. **Rien en double.** Une ligne renvoyée après une coupure ne doit pas
     créer un second paiement. Chaque ligne porte l'identifiant qu'elle a
     dans le journal local ; couplé au nom du terminal, il rend l'envoi
     rejouable sans risque (contrainte d'unicité côté base).

  3. **Silencieux.** Un cloud injoignable est une situation normale, pas une
     alerte. On note l'incident dans le journal, on réessaiera plus tard, et
     l'utilisateur n'en sait rien.

Aucune dépendance : urllib suffit, et le Pi n'a rien de plus à installer.
"""

import json
import threading
import time
import urllib.error
import urllib.request

from .analyse_sms import analyser

DELAI = 15          # secondes avant d'abandonner une requête
LOT = 100           # lignes envoyées par requête
# Après un réveil, on laisse une seconde aux arrivées voisines de rejoindre le
# même envoi. Trois SMS reçus coup sur coup partent alors ensemble.
DEBOUNCE = 1


class Nuage:
    """Envoie le journal local vers Supabase. Inerte si non configuré."""

    def __init__(self, url, cle, terminal, journal, pause=60):
        self.url = (url or "").rstrip("/")
        self.cle = cle or ""
        self.terminal = terminal or "totem"
        self.journal = journal
        self.pause = pause
        self.actif = bool(self.url and self.cle)
        self.derniere_erreur = None
        self._marche = True
        # Levé dès qu'une ligne entre au journal : le pont n'attend plus le
        # prochain battement pour transmettre ce qu'il sait déjà.
        self._reveil = threading.Event()

    # ---- requêtes ---------------------------------------------------------
    def _requete(self, methode, chemin, corps=None, entetes=None):
        url = f"{self.url}/rest/v1/{chemin}"
        donnees = json.dumps(corps).encode() if corps is not None else None
        req = urllib.request.Request(url, data=donnees, method=methode)
        req.add_header("apikey", self.cle)
        req.add_header("Authorization", f"Bearer {self.cle}")
        req.add_header("Content-Type", "application/json")
        req.add_header("Prefer", "return=minimal")
        for nom, valeur in (entetes or {}).items():
            req.add_header(nom, valeur)
        with urllib.request.urlopen(req, timeout=DELAI) as rep:
            return rep.status

    def _inserer(self, table, lignes, cle_unicite):
        """Insertion rejouable : les doublons sont ignorés côté base."""
        if not lignes:
            return True
        try:
            self._requete(
                "POST", f"{table}?on_conflict={cle_unicite}", lignes,
                {"Prefer": "return=minimal,resolution=ignore-duplicates"})
            self.derniere_erreur = None
            return True
        except Exception as e:
            self.derniere_erreur = str(e)
            return False

    # ---- envois -----------------------------------------------------------
    def enregistrer_terminal(self, sante=None):
        """Annonce le terminal et son état. Sert aussi de signe de vie :
        sans nouvelles, l'application web saura le dire."""
        ligne = {
            "id": self.terminal,
            "nom": self.terminal,
            "vu_le": _horodatage(),
            "sante": sante or {},
        }
        return self._inserer_ou_mettre_a_jour("terminaux", [ligne], "id")

    def _inserer_ou_mettre_a_jour(self, table, lignes, cle_unicite):
        if not lignes:
            return True
        try:
            self._requete(
                "POST", f"{table}?on_conflict={cle_unicite}", lignes,
                {"Prefer": "return=minimal,resolution=merge-duplicates"})
            self.derniere_erreur = None
            return True
        except Exception as e:
            self.derniere_erreur = str(e)
            return False

    def publier_comptes(self, comptes):
        """État courant des SIM en place : signal, réseau visité, itinérance.

        La clé est l'**ICCID**, pas le libellé : deux SIM MTN successives
        doivent occuper deux lignes distinctes, sans quoi la seconde écraserait
        l'état de la première et leurs historiques se confondraient.
        """
        lignes = []
        for c in comptes:
            if not c.carte.identifiee:
                continue    # sans ICCID, on ne sait pas quelle ligne viser
            try:
                lignes.append({
                    "terminal": self.terminal,
                    "iccid": c.carte.iccid,
                    "libelle": c.libelle,
                    "operateur": c.carte.operateur,
                    "reseau": c.carte.reseau or None,
                    "itinerance": c.carte.itinerance,
                    "signal": c.signal(),
                    "maj": _horodatage(),
                })
            except Exception:
                continue    # un modem qui ne répond pas ne doit rien bloquer
        return self._inserer_ou_mettre_a_jour("comptes", lignes, "terminal,iccid")

    def pousser_cartes(self):
        """Envoie le registre des cartes vues, y compris celles retirées.

        C'est ce qui permet à l'application web de montrer l'historique d'une
        puce absente du boîtier, et de dire depuis quand elle l'est.

        De l'IMSI, seuls les cinq premiers chiffres partent : ils donnent le
        pays et l'opérateur, ce qui suffit à expliquer le nom du compte. Le
        reste identifie l'abonné et n'a rien à faire dans le cloud.
        """
        lignes_locales = self.journal.cartes_non_envoyees(LOT)
        if not lignes_locales:
            return 0
        charge = [{
            "terminal": self.terminal,
            "iccid": iccid,
            "imsi_prefixe": (imsi or "")[:5],
            "operateur": operateur,
            "libelle": libelle,
            "numero": numero or None,
            "imei": imei or None,
            "premiere_vue": _horodatage(premiere),
            "derniere_vue": _horodatage(derniere),
        } for (iccid, imsi, operateur, libelle, numero, imei,
               premiere, derniere) in lignes_locales]
        if not self._inserer_ou_mettre_a_jour("cartes", charge, "terminal,iccid"):
            return 0
        self.journal.marquer_cartes_envoyees([l[0] for l in lignes_locales])
        return len(charge)

    def pousser_paiements(self):
        """Envoie les SMS pas encore transmis. Renvoie le nombre envoyé."""
        lignes_locales = self.journal.sms_non_envoyes(LOT)
        if not lignes_locales:
            return 0
        charge, ids = [], []
        for id_local, date, expediteur, texte, compte, iccid in lignes_locales:
            p = analyser(texte)
            charge.append({
                "terminal": self.terminal,
                "source_id": id_local,
                "compte": compte or expediteur,
                # La carte qui a reçu le paiement : c'est elle qui rattache
                # la somme au bon solde quand plusieurs SIM se succèdent.
                "carte": iccid or None,
                "sens": p.sens if p else None,
                "montant": p.montant if p else None,
                "tiers": p.tiers if p else None,
                "numero": (p.numero if p else None),
                "reference": (p.reference if p else None),
                "solde_apres": (p.solde_apres if p else None),
                "frais": (p.frais if p else None),
                "texte": texte,
                "recu_le": _horodatage(date),
            })
            ids.append(id_local)
        if not self._inserer("paiements", charge, "terminal,source_id"):
            return 0
        self.journal.marquer_sms_envoyes(ids)
        return len(ids)

    def pousser_evenements(self):
        lignes_locales = self.journal.evenements_non_envoyes(LOT)
        if not lignes_locales:
            return 0
        charge = [{
            "terminal": self.terminal,
            "source_id": id_local,
            "texte": texte,
            "survenu_le": _horodatage(date),
        } for id_local, date, texte in lignes_locales]
        if not self._inserer("evenements", charge, "terminal,source_id"):
            return 0
        self.journal.marquer_evenements_envoyes([l[0] for l in lignes_locales])
        return len(charge)

    # ---- boucle -----------------------------------------------------------
    def demarrer(self, comptes=None, sante=None):
        """Lance la synchronisation en tâche de fond. Sans configuration,
        ne fait rien du tout — le robot fonctionne exactement pareil."""
        if not self.actif:
            return None
        fil = threading.Thread(
            target=self._boucle, args=(comptes or [], sante), daemon=True)
        fil.start()
        return fil

    def arreter(self):
        self._marche = False
        self._reveil.set()      # ne pas attendre la fin du sommeil pour sortir

    def reveiller(self):
        """« J'ai quelque chose à transmettre, maintenant. »

        Appelé dès qu'une ligne entre au journal. Sans cela, le pont dormait
        jusqu'à une minute alors qu'il savait déjà qu'un paiement venait
        d'arriver — un délai qu'on s'infligeait sans raison.

        Plusieurs appels rapprochés ne réveillent qu'une fois : c'est le
        propre d'un drapeau. Trois SMS reçus coup sur coup partent donc en un
        seul envoi, pas en trois.
        """
        self._reveil.set()

    def _boucle(self, comptes, sante):
        premier = True
        prochain_etat = 0.0
        while self._marche:
            try:
                # L'état du terminal et des SIM change lentement : on le
                # republie au rythme de fond, pas à chaque paiement.
                if time.monotonic() >= prochain_etat:
                    prochain_etat = time.monotonic() + self.pause
                    etat = sante.resume() if sante else None
                    self.enregistrer_terminal({"resume": etat} if etat else None)
                    self.publier_comptes(comptes)
                envoyes = (self.pousser_cartes() + self.pousser_paiements()
                           + self.pousser_evenements())
                if premier and envoyes:
                    self.journal.evenement(
                        f"cloud : {envoyes} ligne(s) transmise(s) au démarrage")
                    premier = False
            except Exception as e:
                # Un cloud injoignable est normal : on note, on continue.
                self.derniere_erreur = str(e)
            # Réveil immédiat sur nouvelle ligne, sinon battement de fond —
            # qui reste indispensable : il rejoue ce qu'une coupure a retenu
            # et sert de signe de vie au terminal.
            if self._reveil.wait(timeout=self.pause):
                self._reveil.clear()
                # Laisser une seconde aux arrivées quasi simultanées de se
                # joindre au même envoi, plutôt que d'ouvrir trois connexions.
                time.sleep(DEBOUNCE)

    def resume(self):
        """Ligne d'état pour /statut."""
        if not self.actif:
            return "cloud désactivé"
        reste = self.journal.reste_a_envoyer()
        if self.derniere_erreur:
            return f"cloud injoignable · {reste} ligne(s) en attente"
        return "cloud à jour" if not reste else f"cloud · {reste} en attente"


def _horodatage(iso=None):
    """Les dates du journal local sont naïves (heure du Pi). On les envoie
    telles quelles ; Supabase les interprète dans son fuseau."""
    from datetime import datetime
    return (iso or datetime.now().isoformat(timespec="seconds"))
