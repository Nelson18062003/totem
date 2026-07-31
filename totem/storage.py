# -*- coding: utf-8 -*-
"""Journal du robot : SMS reçus, transcriptions USSD, événements.

SQLite : un seul fichier, robuste, consultable plus tard par l'app web.
Chaque ligne porte le compte (opérateur) d'origine.
Les montants MoMo sont extraits des SMS pour les rapports quotidiens.

Deux files d'attente distinctes y vivent aussi, et ne visent pas la même
destination : la colonne « envoye » suit ce qui reste à pousser vers le cloud,
la table « sortants » ce qui reste à annoncer dans Telegram après une coupure.
"""

import csv
import io
import re
import sqlite3
import threading
from datetime import datetime, timedelta

from .analyse_sms import analyser


def _canal(brut):
    """Le canal est stocké en texte : « alertes », ou un identifiant de chat."""
    if not brut:
        return None
    return int(brut) if re.fullmatch(r"-?\d+", brut) else brut


def _conseil(chemin, erreur):
    """Message d'erreur qui dit quel fichier, pourquoi, et quoi taper.

    « attempt to write a readonly database » ne dit rien d'utile à qui n'a
    pas écrit SQLite. Ici on nomme le fichier, l'utilisateur, et les deux
    sorties possibles."""
    import getpass
    import os

    try:
        utilisateur = getpass.getuser()
    except Exception:
        utilisateur = str(os.getuid())
    dossier = os.path.dirname(chemin) or "."
    return (
        f"Le journal « {chemin} » n'est pas accessible en écriture pour "
        f"l'utilisateur « {utilisateur} ».\n"
        f"({erreur})\n\n"
        "Le service tourne en root et écrit sans difficulté ; un lancement "
        "à la main depuis votre compte se heurte aux droits du fichier.\n\n"
        "Deux solutions :\n"
        f"  sudo chown -R {utilisateur} {dossier}     "
        "← une fois pour toutes, recommandé\n"
        "  sudo python3 -m totem …                    "
        "← lancer avec les droits du service\n\n"
        "Les diagnostics n'ont pas besoin du journal et fonctionnent sans "
        "droits particuliers :\n"
        "  python3 -m totem --modems\n"
        "  python3 -m totem --stk"
    )


class JournalInaccessible(Exception):
    """Le journal existe mais l'utilisateur courant ne peut pas y écrire.

    Cas typique : le service tourne en root et a créé le fichier ; un
    lancement manuel depuis un compte ordinaire se heurte alors aux droits.
    L'erreur brute de SQLite (« attempt to write a readonly database ») ne
    dit ni quel fichier, ni quoi faire."""


class Journal:
    def __init__(self, chemin="totem.db"):
        try:
            self.conn = sqlite3.connect(chemin, check_same_thread=False)
        except sqlite3.OperationalError as e:
            raise JournalInaccessible(_conseil(chemin, e))
        self.verrou = threading.Lock()
        try:
            self._creer_tables()
        except sqlite3.OperationalError as e:
            raise JournalInaccessible(_conseil(chemin, e))

    def _creer_tables(self):
        with self.verrou:
            self.conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS sms(
                    id INTEGER PRIMARY KEY, date TEXT, expediteur TEXT,
                    texte TEXT, compte TEXT);
                CREATE TABLE IF NOT EXISTS ussd(
                    id INTEGER PRIMARY KEY, date TEXT, direction TEXT,
                    texte TEXT, compte TEXT);
                -- Courrier en souffrance : ce que le robot n'a pas pu envoyer
                -- dans Telegram (coupure Internet). Rien ne se perd, tout part
                -- au retour du réseau. À ne pas confondre avec la file vers le
                -- cloud (colonne « envoye »), qui vise une autre destination.
                CREATE TABLE IF NOT EXISTS sortants(
                    id INTEGER PRIMARY KEY, date TEXT, canal TEXT, texte TEXT,
                    essais INTEGER DEFAULT 0);
                CREATE TABLE IF NOT EXISTS evenements(
                    id INTEGER PRIMARY KEY, date TEXT, texte TEXT);
                """
            )
            # Migration douce des bases créées avant le multi-comptes.
            self._ajouter_colonne_si_absente("sms", "compte")
            self._ajouter_colonne_si_absente("ussd", "compte")
            # File d'attente vers le cloud : 0 tant que la ligne n'est pas
            # partie. Les lignes déjà présentes sont considérées à envoyer.
            self._ajouter_colonne_si_absente("sms", "envoye", "INTEGER DEFAULT 0")
            self._ajouter_colonne_si_absente("evenements", "envoye", "INTEGER DEFAULT 0")
            self.conn.commit()

    def _ajouter_colonne_si_absente(self, table, colonne, type_sql="TEXT"):
        existantes = {r[1] for r in self.conn.execute(f"PRAGMA table_info({table})")}
        if colonne not in existantes:
            self.conn.execute(
                f"ALTER TABLE {table} ADD COLUMN {colonne} {type_sql}")

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

    def sms_existe(self, expediteur, texte, compte="", secondes=900):
        """Ce SMS a-t-il déjà été enregistré récemment ? Garde-fou contre les
        doublons quand l'effacement dans le modem a échoué au tour précédent."""
        depuis = (datetime.now() - timedelta(seconds=secondes)).isoformat(
            timespec="seconds")
        with self.verrou:
            return self.conn.execute(
                "SELECT 1 FROM sms WHERE date >= ? AND expediteur = ? AND texte = ? "
                "AND COALESCE(compte, '') = ? LIMIT 1",
                (depuis, expediteur, texte, compte)).fetchone() is not None

    # ---- courrier Telegram en souffrance -----------------------------------
    def enfiler(self, canal, texte):
        """Met un message de côté pour l'envoyer dès que le réseau revient."""
        with self.verrou:
            self.conn.execute(
                "INSERT INTO sortants(date, canal, texte) VALUES(?,?,?)",
                (self._maintenant(), "" if canal is None else str(canal), texte))
            self.conn.commit()

    def courrier_en_attente(self):
        with self.verrou:
            return self.conn.execute("SELECT COUNT(*) FROM sortants").fetchone()[0]

    def prochain_courrier(self):
        """(id, canal, texte, essais) du plus ancien message en attente."""
        with self.verrou:
            ligne = self.conn.execute(
                "SELECT id, canal, texte, essais FROM sortants "
                "ORDER BY id LIMIT 1").fetchone()
        if not ligne:
            return None
        identifiant, canal, texte, essais = ligne
        return identifiant, _canal(canal), texte, essais

    def courrier_livre(self, identifiant):
        with self.verrou:
            self.conn.execute("DELETE FROM sortants WHERE id = ?", (identifiant,))
            self.conn.commit()

    def courrier_echoue(self, identifiant, essais_max=60):
        """Compte l'échec ; abandonne au bout de nombreuses tentatives pour
        qu'un message impossible à envoyer ne bloque pas toute la file."""
        with self.verrou:
            self.conn.execute(
                "UPDATE sortants SET essais = essais + 1 WHERE id = ?", (identifiant,))
            self.conn.execute("DELETE FROM sortants WHERE id = ? AND essais >= ?",
                              (identifiant, essais_max))
            self.conn.commit()

    # ---- sauvegarde --------------------------------------------------------
    def sauvegarder(self, chemin):
        """Copie cohérente du journal, même pendant que le robot écrit.
        Envoyée dans Telegram, elle constitue la seule copie hors du Pi."""
        destination = sqlite3.connect(chemin)
        try:
            with self.verrou:
                self.conn.backup(destination)
        finally:
            destination.close()
        return chemin

    def dernier_evenement(self):
        """Texte du dernier événement journalisé, ou None si le journal est
        vierge. Sert à savoir si l'arrêt précédent était propre."""
        with self.verrou:
            ligne = self.conn.execute(
                "SELECT texte FROM evenements ORDER BY id DESC LIMIT 1").fetchone()
        return ligne[0] if ligne else None

    def derniers_sms(self, n=5):
        """[(date, expéditeur, texte, compte)] du plus récent au plus ancien."""
        with self.verrou:
            return self.conn.execute(
                "SELECT date, expediteur, texte, COALESCE(compte, '') "
                "FROM sms ORDER BY id DESC LIMIT ?", (n,)
            ).fetchall()

    # ---- file d'attente vers le cloud -------------------------------------
    # Le journal local reste la source de vérité : une ligne n'est marquée
    # envoyée qu'une fois le cloud confirmé. Une coupure réseau ne perd rien,
    # elle ne fait qu'allonger la file.

    def sms_non_envoyes(self, limite=100):
        """[(id, date, expéditeur, texte, compte)] restant à transmettre."""
        with self.verrou:
            return self.conn.execute(
                "SELECT id, date, expediteur, texte, COALESCE(compte, '') "
                "FROM sms WHERE COALESCE(envoye, 0) = 0 ORDER BY id LIMIT ?",
                (limite,)).fetchall()

    def evenements_non_envoyes(self, limite=100):
        with self.verrou:
            return self.conn.execute(
                "SELECT id, date, texte FROM evenements "
                "WHERE COALESCE(envoye, 0) = 0 ORDER BY id LIMIT ?",
                (limite,)).fetchall()

    def marquer_sms_envoyes(self, ids):
        self._marquer("sms", ids)

    def marquer_evenements_envoyes(self, ids):
        self._marquer("evenements", ids)

    def _marquer(self, table, ids):
        if not ids:
            return
        with self.verrou:
            self.conn.executemany(
                f"UPDATE {table} SET envoye = 1 WHERE id = ?",
                [(i,) for i in ids])
            self.conn.commit()

    def reste_a_envoyer(self):
        """Combien de lignes attendent encore le cloud."""
        with self.verrou:
            (n,) = self.conn.execute(
                "SELECT (SELECT COUNT(*) FROM sms WHERE COALESCE(envoye,0)=0) "
                "+ (SELECT COUNT(*) FROM evenements WHERE COALESCE(envoye,0)=0)"
            ).fetchone()
        return n

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
        """Journal en CSV (octets), prêt pour Excel ou la comptabilité.

        Chaque SMS compris devient une ligne exploitable : qui a payé, combien,
        sous quelle référence. Le message d'origine reste en dernière colonne,
        c'est lui qui fait foi."""
        depuis = (datetime.now() - timedelta(days=jours)).isoformat(timespec="seconds")
        with self.verrou:
            lignes = self.conn.execute(
                "SELECT date, expediteur, texte, COALESCE(compte, '') "
                "FROM sms WHERE date >= ? ORDER BY id", (depuis,)
            ).fetchall()
        tampon = io.StringIO()
        plume = csv.writer(tampon, delimiter=";")
        plume.writerow(["date", "compte", "sens", "montant_fcfa", "tiers",
                        "numero", "reference", "solde_apres", "message"])
        for date, expediteur, texte, compte in lignes:
            p = analyser(texte)
            plume.writerow([
                date.replace("T", " "), compte or expediteur,
                {"entree": "reçu", "sortie": "envoyé"}.get(p.sens if p else "", ""),
                p.montant if p else "",
                p.tiers if p else "",
                (p.numero or "") if p else "",
                (p.reference or "") if p else "",
                (p.solde_apres or "") if p else "",
                texte.replace("\n", " "),
            ])
        # BOM : Excel ouvre alors correctement les accents.
        return b"\xef\xbb\xbf" + tampon.getvalue().encode("utf-8")


def montant_recu(texte):
    """Montant en FCFA d'un encaissement, sinon None.

    Délègue à l'analyseur de SMS, qui sait distinguer un vrai paiement d'une
    publicité (« gagnez 1000 FCFA de bonus ») ou d'un code de vérification —
    lesquels étaient auparavant comptés comme des recettes."""
    p = analyser(texte)
    return p.montant if p and p.sens == "entree" else None
