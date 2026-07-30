# -*- coding: utf-8 -*-
"""Journal du robot : SMS reçus, transcriptions USSD, événements.

SQLite : un seul fichier, robuste, consultable plus tard par l'app web.
Chaque ligne porte le compte (opérateur) d'origine.
Les montants MoMo sont extraits des SMS pour les rapports quotidiens.
"""

import csv
import io
import re
import sqlite3
import threading
from datetime import datetime, timedelta

RE_MONTANT_RECU = re.compile(r"re[cç]u\s+([\d\s.,]+?)\s*F\s*CFA", re.I)


class Journal:
    def __init__(self, chemin="totem.db"):
        self.conn = sqlite3.connect(chemin, check_same_thread=False)
        self.verrou = threading.Lock()
        with self.verrou:
            self.conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS sms(
                    id INTEGER PRIMARY KEY, date TEXT, expediteur TEXT,
                    texte TEXT, compte TEXT);
                CREATE TABLE IF NOT EXISTS ussd(
                    id INTEGER PRIMARY KEY, date TEXT, direction TEXT,
                    texte TEXT, compte TEXT);
                CREATE TABLE IF NOT EXISTS evenements(
                    id INTEGER PRIMARY KEY, date TEXT, texte TEXT);
                """
            )
            # Migration douce des bases créées avant le multi-comptes.
            self._ajouter_colonne_si_absente("sms", "compte")
            self._ajouter_colonne_si_absente("ussd", "compte")
            self.conn.commit()

    def _ajouter_colonne_si_absente(self, table, colonne):
        existantes = {r[1] for r in self.conn.execute(f"PRAGMA table_info({table})")}
        if colonne not in existantes:
            self.conn.execute(f"ALTER TABLE {table} ADD COLUMN {colonne} TEXT")

    def _maintenant(self):
        return datetime.now().isoformat(timespec="seconds")

    def sms(self, expediteur, texte, compte=""):
        with self.verrou:
            self.conn.execute(
                "INSERT INTO sms(date, expediteur, texte, compte) VALUES(?,?,?,?)",
                (self._maintenant(), expediteur, texte, compte))
            self.conn.commit()

    def ussd(self, direction, texte, compte=""):
        """direction : « envoyé » ou « reçu ». Ne JAMAIS journaliser un PIN :
        l'appelant remplace le PIN par des étoiles avant l'appel."""
        with self.verrou:
            self.conn.execute(
                "INSERT INTO ussd(date, direction, texte, compte) VALUES(?,?,?,?)",
                (self._maintenant(), direction, texte, compte))
            self.conn.commit()

    def evenement(self, texte):
        with self.verrou:
            self.conn.execute("INSERT INTO evenements(date, texte) VALUES(?,?)",
                              (self._maintenant(), texte))
            self.conn.commit()

    def derniers_sms(self, n=5):
        """[(date, expéditeur, texte, compte)] du plus récent au plus ancien."""
        with self.verrou:
            return self.conn.execute(
                "SELECT date, expediteur, texte, COALESCE(compte, '') "
                "FROM sms ORDER BY id DESC LIMIT ?", (n,)
            ).fetchall()

    def rapport_du_jour(self):
        """(nb d'encaissements, total FCFA, nb de SMS) sur les dernières 24 h."""
        depuis = (datetime.now() - timedelta(days=1)).isoformat(timespec="seconds")
        with self.verrou:
            lignes = self.conn.execute(
                "SELECT texte FROM sms WHERE date >= ?", (depuis,)).fetchall()
        nb, total = 0, 0
        for (texte,) in lignes:
            montant = montant_recu(texte)
            if montant is not None:
                nb += 1
                total += montant
        return nb, total, len(lignes)

    def export_csv(self, jours=7):
        """Journal des SMS en CSV (octets), prêt à être envoyé dans Telegram
        puis ouvert dans Excel ou importé dans la comptabilité."""
        depuis = (datetime.now() - timedelta(days=jours)).isoformat(timespec="seconds")
        with self.verrou:
            lignes = self.conn.execute(
                "SELECT date, expediteur, texte FROM sms WHERE date >= ? ORDER BY id",
                (depuis,)
            ).fetchall()
        tampon = io.StringIO()
        plume = csv.writer(tampon, delimiter=";")
        plume.writerow(["date", "expediteur", "montant_fcfa", "message"])
        for date, expediteur, texte in lignes:
            montant = montant_recu(texte)
            plume.writerow([date.replace("T", " "), expediteur,
                            montant if montant is not None else "",
                            texte.replace("\n", " ")])
        # BOM : Excel ouvre alors correctement les accents.
        return b"\xef\xbb\xbf" + tampon.getvalue().encode("utf-8")


def montant_recu(texte):
    """Montant en FCFA d'un SMS « Vous avez reçu … », sinon None."""
    m = RE_MONTANT_RECU.search(texte)
    if not m:
        return None
    return int(re.sub(r"\D", "", m.group(1)) or 0)
