# -*- coding: utf-8 -*-
"""Ce que le Pi laisse traîner sur son disque.

DEUX FICHIERS VALENT TOUT LE RESTE sur cette machine :

  · `totem.conf` — il porte le jeton du robot Telegram ET la clé de service
    Supabase. Cette clé-là contourne toutes les règles de la base : qui la
    lit lit, écrit et efface les 302 paiements. Le fichier le dit lui-même :
    « ⚠ SECRÈTE : elle contourne… ».
  · `journal.db` — tout l'historique : montants, tiers, numéros, soldes.

Un Raspberry Pi n'est pas une machine à un seul utilisateur. Il a un compte
`pi`, souvent un accès SSH partagé pour la maintenance, parfois un second
compte pour quelqu'un du bureau. Le mode 0644 par défaut veut dire que tous
les lisent.

Ces essais ne mesurent pas une intention : ils créent les fichiers comme le
code les crée, et regardent les droits obtenus.
"""

import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

from totem.storage import Journal

RACINE = Path(__file__).resolve().parent.parent


def droits(chemin):
    """Les neuf bits de permission, en octal (0o600, 0o644…)."""
    return stat.S_IMODE(os.stat(chemin).st_mode)


def lisible_par_les_autres(chemin):
    """Quelqu'un d'autre que le propriétaire peut-il lire ceci ?"""
    return bool(droits(chemin) & (stat.S_IRGRP | stat.S_IROTH))


class TestJournalSurLeDisque(unittest.TestCase):
    """Le journal porte l'argent : il ne se lit pas par-dessus l'épaule."""

    def test_le_journal_n_est_pas_lisible_par_les_autres(self):
        with tempfile.TemporaryDirectory() as dossier:
            chemin = os.path.join(dossier, "journal.db")
            journal = Journal(chemin)
            try:
                self.assertFalse(
                    lisible_par_les_autres(chemin),
                    f"journal.db en {oct(droits(chemin))} : tout le monde peut "
                    "lire les montants, les tiers et les numéros.")
            finally:
                journal.fermer() if hasattr(journal, "fermer") else None

    def test_la_sauvegarde_non_plus(self):
        """La sauvegarde part sur Telegram, mais elle passe par le disque.

        C'est une copie ENTIÈRE du journal. La laisser en 0644 le temps du
        transfert annule le soin pris sur l'original."""
        with tempfile.TemporaryDirectory() as dossier:
            journal = Journal(os.path.join(dossier, "journal.db"))
            copie = os.path.join(dossier, "copie.db")
            journal.sauvegarder(copie)
            self.assertFalse(
                lisible_par_les_autres(copie),
                f"la sauvegarde est en {oct(droits(copie))}.")


class TestInstallateur(unittest.TestCase):
    """L'installateur pose le fichier des secrets. Il doit le refermer.

    On lit le script plutôt que de le lancer : il installe des services
    systemd et écrit dans /etc. Ce qu'on vérifie est précis — que le geste
    est là, et qu'il vise le bon fichier.
    """

    def setUp(self):
        self.script = (RACINE / "install.sh").read_text(encoding="utf-8")

    def test_le_fichier_des_secrets_est_referme(self):
        self.assertIn('chmod 600 "$CONF"', self.script,
                      "install.sh ne restreint jamais les droits de totem.conf, "
                      "qui porte le jeton Telegram et la clé de service.")

    def test_le_dossier_du_journal_est_referme(self):
        self.assertIn("chmod 700 /var/lib/totem", self.script,
                      "le dossier du journal reste ouvert en lecture.")

    def test_le_jeton_ne_s_affiche_pas_pendant_la_saisie(self):
        """Un secret qu'on colle ne doit pas rester à l'écran.

        L'installation se fait souvent en partage d'écran, ou devant
        quelqu'un qui aide."""
        self.assertNotIn('read -rp "  Clé du bot', self.script)
        self.assertIn("read -rsp", self.script)

    def test_le_script_reste_valide(self):
        """Un script d'installation cassé est pire qu'un script permissif."""
        r = subprocess.run(["bash", "-n", str(RACINE / "install.sh")],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)


class TestConfigPrevient(unittest.TestCase):
    """Si le fichier des secrets est ouvert, le robot doit le DIRE.

    Sur la partition de démarrage (`/boot/firmware`), le système de fichiers
    est en FAT : il n'a pas de droits Unix du tout, et aucun `chmod` n'y
    peut rien. C'est un choix assumé — on veut pouvoir corriger la config
    depuis un PC Windows. Mais alors il faut le dire, pas le taire.
    """

    def test_un_fichier_ouvert_est_signale(self):
        from totem import config
        with tempfile.TemporaryDirectory() as dossier:
            chemin = os.path.join(dossier, "totem.conf")
            Path(chemin).write_text(
                "[telegram]\njeton = x\nchat_id = 1\n"
                "[cloud]\nurl =\ncle = une-cle-de-service\n",
                encoding="utf-8")
            os.chmod(chemin, 0o644)
            avertissements = config.avertissements_droits(chemin)
            self.assertTrue(avertissements,
                            "un fichier de secrets en 0644 passe sans un mot.")
            self.assertIn("644", " ".join(avertissements))

    def test_un_fichier_bien_fermé_ne_dit_rien(self):
        from totem import config
        with tempfile.TemporaryDirectory() as dossier:
            chemin = os.path.join(dossier, "totem.conf")
            Path(chemin).write_text("[telegram]\njeton = x\n", encoding="utf-8")
            os.chmod(chemin, 0o600)
            self.assertEqual(config.avertissements_droits(chemin), [])


if __name__ == "__main__":
    unittest.main()
