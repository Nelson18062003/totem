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
        """État courant des SIM : solde connu, signal, opérateur."""
        lignes = []
        for c in comptes:
            try:
                lignes.append({
                    "terminal": self.terminal,
                    "libelle": c.libelle,
                    "operateur": c.modem.operateur(),
                    "signal": c.signal(),
                    "maj": _horodatage(),
                })
            except Exception:
                continue    # un modem qui ne répond pas ne doit rien bloquer
        return self._inserer_ou_mettre_a_jour("comptes", lignes, "terminal,libelle")

    def pousser_paiements(self):
        """Envoie les SMS pas encore transmis. Renvoie le nombre envoyé."""
        lignes_locales = self.journal.sms_non_envoyes(LOT)
        if not lignes_locales:
            return 0
        charge, ids = [], []
        for id_local, date, expediteur, texte, compte in lignes_locales:
            p = analyser(texte)
            charge.append({
                "terminal": self.terminal,
                "source_id": id_local,
                "compte": compte or expediteur,
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

    def _boucle(self, comptes, sante):
        premier = True
        while self._marche:
            try:
                etat = sante.resume() if sante else None
                self.enregistrer_terminal({"resume": etat} if etat else None)
                self.publier_comptes(comptes)
                envoyes = self.pousser_paiements() + self.pousser_evenements()
                if premier and envoyes:
                    self.journal.evenement(
                        f"cloud : {envoyes} ligne(s) transmise(s) au démarrage")
                    premier = False
            except Exception as e:
                # Un cloud injoignable est normal : on note, on continue.
                self.derniere_erreur = str(e)
            time.sleep(self.pause)

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
