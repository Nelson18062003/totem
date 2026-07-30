# -*- coding: utf-8 -*-
"""Journal du robot : SMS reçus, transcriptions USSD, événements.

SQLite : un seul fichier, robuste, consultable plus tard par l'app web.
Les montants Mobile Money sont extraits des SMS pour les rapports quotidiens.

**Cloisonnement par SIM.** Chaque ligne porte l'ICCID de la carte présente au
moment de l'écriture. Deux SIM Orange différentes ne mélangent donc jamais
leurs SMS ni leurs rapports, même si elles se succèdent dans le même HAT.
Les lectures portent par défaut sur la SIM courante.
"""

import csv
import io
import re
import sqlite3
import threading
from datetime import datetime, timedelta

# Les opérateurs n'écrivent pas les sommes de la même façon : « 25 000 FCFA »,
# « 25.000 F CFA », « 25000 XAF ». Et « reçu » perd souvent sa cédille dans les
# SMS en alphabet réduit.
DEVISE = r"(?:F\s*\.?\s*CFA|FCFA|XAF|F)"
MONTANT = r"([\d][\d\s., ]*)"
RE_MONTANT_RECU = re.compile(
    rf"\b(?:re[cç]u|recus|credite|crédité|encaiss\w*)\b[^\d]{{0,40}}{MONTANT}\s*{DEVISE}",
    re.I)
RE_MONTANT_ENVOYE = re.compile(
    rf"\b(?:envoy\w+|transf\w+|debite|débité|retrait\w*|paiement)\b[^\d]{{0,40}}"
    rf"{MONTANT}\s*{DEVISE}", re.I)

TABLES = ("sms", "ussd", "evenements")


class Journal:
    def __init__(self, chemin="totem.db"):
        self.conn = sqlite3.connect(chemin, check_same_thread=False)
        self.verrou = threading.Lock()
        self.sim = ""          # ICCID de la SIM en place ; "" tant qu'inconnue
        with self.verrou:
            self.conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS sms(
                    id INTEGER PRIMARY KEY, date TEXT, expediteur TEXT, texte TEXT);
                CREATE TABLE IF NOT EXISTS ussd(
                    id INTEGER PRIMARY KEY, date TEXT, direction TEXT, texte TEXT);
                CREATE TABLE IF NOT EXISTS evenements(
                    id INTEGER PRIMARY KEY, date TEXT, texte TEXT);
                """
            )
            self._migrer_colonne_sim()
            self.conn.commit()

    def _migrer_colonne_sim(self):
        """Ajoute la colonne `sim` aux journaux créés avant le multi-SIM.
        Les anciennes lignes gardent une SIM vide : elles restent lisibles."""
        for table in TABLES:
            colonnes = [c[1] for c in self.conn.execute(f"PRAGMA table_info({table})")]
            if "sim" not in colonnes:
                self.conn.execute(f"ALTER TABLE {table} ADD COLUMN sim TEXT DEFAULT ''")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_sms_sim ON sms(sim, date)")

    def definir_sim(self, iccid):
        """Déclare la SIM en place. Tout ce qui suit lui est rattaché."""
        with self.verrou:
            self.sim = iccid or ""

    def _maintenant(self):
        return datetime.now().isoformat(timespec="seconds")

    def sms(self, expediteur, texte):
        with self.verrou:
            self.conn.execute(
                "INSERT INTO sms(date, expediteur, texte, sim) VALUES(?,?,?,?)",
                (self._maintenant(), expediteur, texte, self.sim))
            self.conn.commit()

    def ussd(self, direction, texte):
        """direction : 'envoyé' ou 'reçu'. Ne JAMAIS journaliser un PIN :
        l'appelant doit remplacer le PIN par des étoiles avant l'appel."""
        with self.verrou:
            self.conn.execute(
                "INSERT INTO ussd(date, direction, texte, sim) VALUES(?,?,?,?)",
                (self._maintenant(), direction, texte, self.sim))
            self.conn.commit()

    def evenement(self, texte):
        with self.verrou:
            self.conn.execute(
                "INSERT INTO evenements(date, texte, sim) VALUES(?,?,?)",
                (self._maintenant(), texte, self.sim))
            self.conn.commit()

    def derniers_sms(self, n=5, toutes_sims=False):
        condition, parametres = self._filtre_sim(toutes_sims)
        with self.verrou:
            return self.conn.execute(
                f"SELECT date, expediteur, texte FROM sms {condition} "
                "ORDER BY id DESC LIMIT ?", (*parametres, n)).fetchall()

    def rapport_du_jour(self, toutes_sims=False, heures=24):
        """Bilan des dernières 24 h : entrées, sorties et volume de SMS."""
        depuis = (datetime.now() - timedelta(hours=heures)).isoformat(timespec="seconds")
        condition, parametres = self._filtre_sim(toutes_sims, "date >= ?")
        with self.verrou:
            lignes = self.conn.execute(
                f"SELECT texte FROM sms {condition}", (depuis, *parametres)).fetchall()
        bilan = {"encaissements": 0, "recu": 0, "sorties": 0, "envoye": 0,
                 "sms": len(lignes)}
        for (texte,) in lignes:
            entree = montant_recu(texte)
            if entree is not None:
                bilan["encaissements"] += 1
                bilan["recu"] += entree
                continue
            sortie = montant_envoye(texte)
            if sortie is not None:
                bilan["sorties"] += 1
                bilan["envoye"] += sortie
        return bilan

    def sms_existe(self, expediteur, texte, secondes=900):
        """Ce SMS a-t-il déjà été enregistré récemment ? Garde-fou contre les
        doublons quand l'effacement dans le modem a échoué au tour précédent."""
        depuis = (datetime.now() - timedelta(seconds=secondes)).isoformat(timespec="seconds")
        with self.verrou:
            return self.conn.execute(
                "SELECT 1 FROM sms WHERE date >= ? AND expediteur = ? AND texte = ? "
                "AND sim = ? LIMIT 1",
                (depuis, expediteur, texte, self.sim)).fetchone() is not None

    def export_csv(self, jours=7, toutes_sims=False):
        """Journal des SMS en CSV (octets), prêt à être envoyé dans Telegram
        puis ouvert dans Excel ou importé dans la comptabilité."""
        depuis = (datetime.now() - timedelta(days=jours)).isoformat(timespec="seconds")
        condition, parametres = self._filtre_sim(toutes_sims, "date >= ?")
        with self.verrou:
            lignes = self.conn.execute(
                f"SELECT date, sim, expediteur, texte FROM sms {condition} ORDER BY id",
                (depuis, *parametres)).fetchall()
        tampon = io.StringIO()
        plume = csv.writer(tampon, delimiter=";")
        plume.writerow(["date", "sim", "expediteur", "montant_fcfa", "message"])
        for date, sim, expediteur, texte in lignes:
            montant = montant_recu(texte)
            plume.writerow([date.replace("T", " "), sim or "", expediteur,
                            montant if montant is not None else "",
                            texte.replace("\n", " ")])
        # BOM : Excel ouvre alors correctement les accents.
        return b"\xef\xbb\xbf" + tampon.getvalue().encode("utf-8")

    def sims_connues(self):
        """[(iccid, nb de SMS, dernière activité)] — l'historique des cartes
        qui sont passées dans le HAT."""
        with self.verrou:
            return self.conn.execute(
                "SELECT sim, COUNT(*), MAX(date) FROM sms GROUP BY sim "
                "ORDER BY MAX(date) DESC").fetchall()

    def _filtre_sim(self, toutes_sims, condition_base=""):
        """Construit le WHERE : la SIM courante, sauf demande explicite."""
        clauses = [condition_base] if condition_base else []
        parametres = []
        if not toutes_sims:
            clauses.append("sim = ?")
            parametres.append(self.sim)
        return ("WHERE " + " AND ".join(clauses)) if clauses else "", tuple(parametres)


def _nombre(brut):
    """« 25 000 » / « 25.000 » / « 25,000 » → 25000. None si illisible."""
    chiffres = re.sub(r"\D", "", brut or "")
    return int(chiffres) if chiffres else None


def montant_recu(texte):
    """Montant en FCFA d'un SMS d'encaissement, sinon None."""
    m = RE_MONTANT_RECU.search(texte or "")
    return _nombre(m.group(1)) if m else None


def montant_envoye(texte):
    """Montant en FCFA d'un SMS de sortie (envoi, retrait, paiement), sinon None.
    Un débit non reconnu est un débit qu'on ne verra pas passer."""
    if montant_recu(texte) is not None:
        return None            # un encaissement n'est pas une sortie
    m = RE_MONTANT_ENVOYE.search(texte or "")
    return _nombre(m.group(1)) if m else None
