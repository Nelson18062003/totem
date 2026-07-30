# -*- coding: utf-8 -*-
"""Journal du robot : SMS reçus, transcriptions USSD, événements.

SQLite : un seul fichier, robuste, consultable plus tard par l'app web.
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
                    id INTEGER PRIMARY KEY, date TEXT, expediteur TEXT, texte TEXT);
                CREATE TABLE IF NOT EXISTS ussd(
                    id INTEGER PRIMARY KEY, date TEXT, direction TEXT, texte TEXT);
                CREATE TABLE IF NOT EXISTS evenements(
                    id INTEGER PRIMARY KEY, date TEXT, texte TEXT);
                """
            )
            self.conn.commit()

    def _maintenant(self):
        return datetime.now().isoformat(timespec="seconds")

    def sms(self, expediteur, texte):
        with self.verrou:
            self.conn.execute("INSERT INTO sms(date, expediteur, texte) VALUES(?,?,?)",
                              (self._maintenant(), expediteur, texte))
            self.conn.commit()

    def ussd(self, direction, texte):
        """direction : 'envoyé' ou 'reçu'. Ne JAMAIS journaliser un PIN :
        l'appelant doit remplacer le PIN par des étoiles avant l'appel."""
        with self.verrou:
            self.conn.execute("INSERT INTO ussd(date, direction, texte) VALUES(?,?,?)",
                              (self._maintenant(), direction, texte))
            self.conn.commit()

    def evenement(self, texte):
        with self.verrou:
            self.conn.execute("INSERT INTO evenements(date, texte) VALUES(?,?)",
                              (self._maintenant(), texte))
            self.conn.commit()

    def derniers_sms(self, n=5):
        with self.verrou:
            lignes = self.conn.execute(
                "SELECT date, expediteur, texte FROM sms ORDER BY id DESC LIMIT ?", (n,)
            ).fetchall()
        return lignes

    def rapport_du_jour(self):
        """Statistiques des dernières 24 h : nb d'encaissements et total FCFA."""
        depuis = (datetime.now() - timedelta(days=1)).isoformat(timespec="seconds")
        with self.verrou:
            lignes = self.conn.execute(
                "SELECT texte FROM sms WHERE date >= ?", (depuis,)
            ).fetchall()
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
