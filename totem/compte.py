# -*- coding: utf-8 -*-
"""Un compte = un modem, une SIM, un opérateur, sa propre session USSD.

Le robot pilote plusieurs comptes en parallèle : chacun écoute son réseau en
permanence, donc aucun SMS n'est perdu quel que soit l'opérateur du client.
"""

import threading

from .modem import USSD_OUVERTE, ErreurModem


class Compte:
    def __init__(self, modem, libelle):
        self.modem = modem
        self.libelle = libelle          # « MTN », « Orange »…
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

    # ---- SMS --------------------------------------------------------------
    def lire_nouveaux_sms(self):
        with self.verrou:
            return self.modem.lire_nouveaux_sms()

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
