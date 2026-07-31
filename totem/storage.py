# -*- coding: utf-8 -*-
"""Journal du robot : SMS reçus, transcriptions USSD, événements.

SQLite : un seul fichier, robuste, consultable plus tard par l'app web.
Chaque ligne porte le compte (opérateur) d'origine.
Les montants MoMo sont extraits des SMS pour les rapports quotidiens.

Deux files d'attente distinctes y vivent aussi, et ne visent pas la même
destination : la colonne « envoye » suit ce qui reste à pousser vers le cloud,
la table « sortants » ce qui reste à annoncer dans Telegram après une coupure.

Cloisonnement par carte
-----------------------
Chaque ligne porte aussi l'**ICCID** de la SIM qui l'a produite, et la table
`cartes` garde la trace de toutes les puces déjà vues. Deux SIM MTN qui se
succèdent dans le berceau sont deux comptes : leurs encaissements ne doivent
pas s'additionner, et retirer une carte ne doit pas faire disparaître son
journal — il ressort intact quand on la remet.

Les lignes antérieures au cloisonnement n'ont pas d'ICCID. On ne peut pas
deviner à quelle carte elles appartiennent, alors on les montre toujours,
quelle que soit la carte consultée : les cacher ressemblerait à une perte de
données. Le mélange s'efface de lui-même, puisque toute ligne nouvelle est
attribuée.
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
                -- Toutes les cartes SIM déjà vues dans ce terminal. L'ICCID
                -- est gravé sur la puce : c'est la seule identité qui survit
                -- au retrait, au changement de modem et à l'itinérance.
                CREATE TABLE IF NOT EXISTS cartes(
                    iccid TEXT PRIMARY KEY, imsi TEXT, operateur TEXT,
                    libelle TEXT, numero TEXT, imei TEXT,
                    premiere_vue TEXT, derniere_vue TEXT,
                    envoye INTEGER DEFAULT 0);
                -- Raccourcis appris en observant une opération réelle.
                -- Rangés par OPÉRATEUR et non par carte : les codes sont ceux
                -- du réseau, pas de la puce. Changer de SIM MTN pour une autre
                -- SIM MTN ne doit pas faire disparaître les boutons.
                CREATE TABLE IF NOT EXISTS raccourcis(
                    id INTEGER PRIMARY KEY, operateur TEXT NOT NULL,
                    nom TEXT NOT NULL, libelle TEXT, etapes TEXT NOT NULL,
                    cree_le TEXT, UNIQUE(operateur, nom));
                """
            )
            # Migration douce des bases créées avant le multi-comptes.
            self._ajouter_colonne_si_absente("sms", "compte")
            self._ajouter_colonne_si_absente("ussd", "compte")
            # Cloisonnement par carte : les lignes déjà présentes restent sans
            # ICCID, et sont donc visibles depuis n'importe quelle carte.
            self._ajouter_colonne_si_absente("sms", "iccid")
            self._ajouter_colonne_si_absente("ussd", "iccid")
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

    def sms(self, expediteur, texte, compte="", iccid=""):
        with self.verrou:
            self.conn.execute(
                "INSERT INTO sms(date, expediteur, texte, compte, iccid) "
                "VALUES(?,?,?,?,?)",
                (self._maintenant(), expediteur, texte, compte, iccid))
            self.conn.commit()

    def ussd(self, direction, texte, compte="", iccid=""):
        """direction : « envoyé » ou « reçu ». Ne JAMAIS journaliser un PIN :
        l'appelant remplace le PIN par des étoiles avant l'appel."""
        with self.verrou:
            self.conn.execute(
                "INSERT INTO ussd(date, direction, texte, compte, iccid) "
                "VALUES(?,?,?,?,?)",
                (self._maintenant(), direction, texte, compte, iccid))
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

    # ---- cartes SIM connues ------------------------------------------------
    def voir_carte(self, carte, imei=""):
        """Enregistre la carte présente et dit si on la découvre.

        Renvoie « nouvelle » la toute première fois que cette puce est vue,
        « connue » si elle figure déjà au registre, « inconnue » si l'ICCID
        n'a pas pu être lu. Le robot n'annonce pas la même chose dans les deux
        premiers cas : découvrir une puce jamais vue mérite un avertissement,
        retrouver l'une des siennes mérite une confirmation rassurante.
        """
        if not carte or not carte.iccid:
            return "inconnue"
        maintenant = self._maintenant()
        with self.verrou:
            ligne = self.conn.execute(
                "SELECT derniere_vue FROM cartes WHERE iccid = ?",
                (carte.iccid,)).fetchone()
            if ligne is None:
                self.conn.execute(
                    "INSERT INTO cartes(iccid, imsi, operateur, libelle, numero,"
                    " imei, premiere_vue, derniere_vue, envoye)"
                    " VALUES(?,?,?,?,?,?,?,?,0)",
                    (carte.iccid, carte.imsi, carte.operateur, carte.libelle,
                     carte.numero, imei, maintenant, maintenant))
                etat = "nouvelle"
            else:
                # Le libellé et le numéro peuvent s'affiner (IMSI lu plus tard,
                # numéro provisionné entre-temps) : on rafraîchit, et on remet
                # la carte dans la file du cloud pour qu'il sache.
                self.conn.execute(
                    "UPDATE cartes SET imsi = ?, operateur = ?, libelle = ?,"
                    " numero = ?, imei = ?, derniere_vue = ?, envoye = 0"
                    " WHERE iccid = ?",
                    (carte.imsi, carte.operateur, carte.libelle, carte.numero,
                     imei, maintenant, carte.iccid))
                etat = "connue"
            self.conn.commit()
        return etat

    def cartes(self):
        """Toutes les cartes vues, la plus récemment présente en tête.

        [(iccid, libelle, operateur, numero, premiere_vue, derniere_vue,
          nb_sms, total_recu)]
        """
        with self.verrou:
            lignes = self.conn.execute(
                "SELECT iccid, libelle, operateur, COALESCE(numero, ''),"
                " premiere_vue, derniere_vue FROM cartes"
                " ORDER BY derniere_vue DESC").fetchall()
            textes = {}
            for iccid, texte in self.conn.execute(
                    "SELECT COALESCE(iccid, ''), texte FROM sms"):
                textes.setdefault(iccid, []).append(texte)
        resultat = []
        for iccid, libelle, operateur, numero, premiere, derniere in lignes:
            nb, total = 0, 0
            for texte in textes.get(iccid, []):
                montant = montant_recu(texte)
                if montant is not None:
                    nb += 1
                    total += montant
            resultat.append((iccid, libelle, operateur, numero, premiere,
                             derniere, len(textes.get(iccid, [])), total))
        return resultat

    def cartes_non_envoyees(self, limite=100):
        with self.verrou:
            return self.conn.execute(
                "SELECT iccid, imsi, operateur, libelle, COALESCE(numero, ''),"
                " COALESCE(imei, ''), premiere_vue, derniere_vue FROM cartes"
                " WHERE COALESCE(envoye, 0) = 0 ORDER BY derniere_vue LIMIT ?",
                (limite,)).fetchall()

    def marquer_cartes_envoyees(self, iccids):
        if not iccids:
            return
        with self.verrou:
            self.conn.executemany(
                "UPDATE cartes SET envoye = 1 WHERE iccid = ?",
                [(i,) for i in iccids])
            self.conn.commit()

    @staticmethod
    def _filtre_cartes(iccids):
        """Clause SQL et paramètres pour ne voir que certaines cartes.

        On filtre sur les cartes **présentes**, pas sur celle du compte piloté :
        avec deux modems, ne montrer que l'un ferait disparaître les recettes de
        l'autre du bilan quotidien. Ce qu'on écarte, ce sont les cartes retirées
        — dont l'historique reste consultable par `/sims`.

        Les lignes sans ICCID (antérieures au cloisonnement) restent visibles :
        on ignore à qui elles appartiennent, et les masquer donnerait
        l'impression d'un historique amputé.
        """
        retenus = [i for i in ([iccids] if isinstance(iccids, str) else iccids or []) if i]
        if not retenus:
            return "", ()
        trous = ",".join("?" * len(retenus))
        return f" AND (iccid IN ({trous}) OR COALESCE(iccid, '') = '')", tuple(retenus)

    # ---- raccourcis appris -------------------------------------------------
    # Les codes USSD n'ont rien d'universel : le solde est « *126# puis 5
    # puis 1 » chez l'un, « #148*5# » chez l'autre. Les deviner serait
    # irresponsable — une erreur de chiffre envoie de l'argent ailleurs. On
    # les apprend donc en regardant l'utilisateur faire l'opération une fois.

    def ajouter_raccourci(self, operateur, nom, libelle, etapes):
        """Enregistre (ou remplace) un raccourci pour cet opérateur."""
        if not operateur or not nom or not etapes:
            return False
        with self.verrou:
            self.conn.execute(
                "INSERT INTO raccourcis(operateur, nom, libelle, etapes, cree_le)"
                " VALUES(?,?,?,?,?)"
                " ON CONFLICT(operateur, nom) DO UPDATE SET"
                " libelle = excluded.libelle, etapes = excluded.etapes,"
                " cree_le = excluded.cree_le",
                (operateur, nom[:24], (libelle or nom)[:32],
                 ",".join(etapes), self._maintenant()))
            self.conn.commit()
        return True

    def raccourcis(self, operateur):
        """{nom: {libelle, etapes}} pour l'opérateur de la carte en place."""
        if not operateur:
            return {}
        with self.verrou:
            lignes = self.conn.execute(
                "SELECT nom, libelle, etapes FROM raccourcis"
                " WHERE operateur = ? ORDER BY id", (operateur,)).fetchall()
        return {nom: {"libelle": libelle or nom,
                      "etapes": [e for e in etapes.split(",") if e]}
                for nom, libelle, etapes in lignes}

    def supprimer_raccourci(self, operateur, nom):
        with self.verrou:
            curseur = self.conn.execute(
                "DELETE FROM raccourcis WHERE operateur = ? AND nom = ?",
                (operateur, nom))
            self.conn.commit()
        return curseur.rowcount > 0

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

    def derniers_sms(self, n=5, iccids=()):
        """[(date, expéditeur, texte, compte)] du plus récent au plus ancien,
        limité aux cartes indiquées si `iccids` est fourni."""
        clause, params = self._filtre_cartes(iccids)
        with self.verrou:
            return self.conn.execute(
                "SELECT date, expediteur, texte, COALESCE(compte, '') "
                f"FROM sms WHERE 1=1{clause} ORDER BY id DESC LIMIT ?",
                params + (n,)).fetchall()

    # ---- file d'attente vers le cloud -------------------------------------
    # Le journal local reste la source de vérité : une ligne n'est marquée
    # envoyée qu'une fois le cloud confirmé. Une coupure réseau ne perd rien,
    # elle ne fait qu'allonger la file.

    def sms_non_envoyes(self, limite=100):
        """[(id, date, expéditeur, texte, compte, iccid)] restant à transmettre."""
        with self.verrou:
            return self.conn.execute(
                "SELECT id, date, expediteur, texte, COALESCE(compte, ''), "
                "COALESCE(iccid, '') "
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
                "+ (SELECT COUNT(*) FROM evenements WHERE COALESCE(envoye,0)=0) "
                "+ (SELECT COUNT(*) FROM cartes WHERE COALESCE(envoye,0)=0)"
            ).fetchone()
        return n

    def rapport_du_jour(self, iccids=()):
        """(nb d'encaissements, total FCFA, nb de SMS) sur les dernières 24 h,
        limité aux cartes indiquées si `iccids` est fourni.

        Le cloisonnement compte ici plus qu'ailleurs : additionner les recettes
        de deux cartes différentes donnerait un total qui ne correspond à aucun
        solde réel.
        """
        depuis = (datetime.now() - timedelta(days=1)).isoformat(timespec="seconds")
        clause, params = self._filtre_cartes(iccids)
        with self.verrou:
            lignes = self.conn.execute(
                f"SELECT texte FROM sms WHERE date >= ?{clause}",
                (depuis,) + params).fetchall()
        nb, total = 0, 0
        for (texte,) in lignes:
            montant = montant_recu(texte)
            if montant is not None:
                nb += 1
                total += montant
        return nb, total, len(lignes)

    def export_csv(self, jours=7, iccids=()):
        """Journal en CSV (octets), prêt pour Excel ou la comptabilité.

        Chaque SMS compris devient une ligne exploitable : qui a payé, combien,
        sous quelle référence. Le message d'origine reste en dernière colonne,
        c'est lui qui fait foi."""
        depuis = (datetime.now() - timedelta(days=jours)).isoformat(timespec="seconds")
        clause, params = self._filtre_cartes(iccids)
        with self.verrou:
            lignes = self.conn.execute(
                "SELECT date, expediteur, texte, COALESCE(compte, ''), "
                "COALESCE(iccid, '') "
                f"FROM sms WHERE date >= ?{clause} ORDER BY id",
                (depuis,) + params).fetchall()
        tampon = io.StringIO()
        plume = csv.writer(tampon, delimiter=";")
        plume.writerow(["date", "compte", "carte", "sens", "montant_fcfa",
                        "tiers", "numero", "reference", "solde_apres", "message"])
        for date, expediteur, texte, compte, ligne_iccid in lignes:
            p = analyser(texte)
            plume.writerow([
                date.replace("T", " "), compte or expediteur, ligne_iccid,
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
