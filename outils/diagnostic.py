# -*- coding: utf-8 -*-
"""Diagnostic TOTEM — à lancer sur le Raspberry Pi : python3 diagnostic.py

Vérifie chaque maillon de la chaîne des SMS, dans l'ordre où un message la
parcourt, et dit en clair où ça bloque :

  1. le service (le robot tourne-t-il ?)
  2. la version réellement en service (le correctif est-il déployé ?)
  3. la configuration (sans jamais afficher les clés)
  4. les modems (les ports sont-ils là ?)
  5. le journal local (dernier SMS relevé, dernières notes du robot,
     files d'attente vers Telegram et vers le cloud)
  6. la liaison Telegram (le jeton répond-il ?)
  7. la liaison Supabase (signe de vie, dernier SMS en base, migration)

Tout est en LECTURE SEULE : ce script ne modifie rien, n'envoie rien,
et n'affiche ni le jeton Telegram, ni la clé du cloud, ni aucun code.
"""

import configparser
import glob
import json
import os
import sqlite3
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone

# Les mêmes chemins que le robot (totem/config.py).
CHEMINS_CONF = [
    os.environ.get("TOTEM_CONF", ""),
    "totem.conf",
    "/boot/firmware/totem.conf",
    "/etc/totem.conf",
]
VERSION_EN_SERVICE = "/opt/totem/VERSION"

SECRETS = []      # tout ce qui ne doit jamais paraître à l'écran


def masquer(texte):
    """Aucun secret ne sort, même au fond d'un message d'erreur."""
    texte = str(texte)
    for secret in SECRETS:
        if secret:
            texte = texte.replace(secret, "****")
    return texte


def titre(t):
    print(f"\n━━━ {t} " + "━" * max(0, 58 - len(t)))


def ok(t):
    print(f"  ✅ {masquer(t)}")


def attention(t):
    print(f"  ⚠️  {masquer(t)}")


def probleme(t):
    print(f"  ❌ {masquer(t)}")


def age_humain(quand, reference=None):
    """« il y a 3 min », « il y a 2 j » — ou « date illisible »."""
    try:
        if isinstance(quand, str):
            quand = datetime.fromisoformat(quand.replace("Z", "+00:00"))
        reference = reference or (
            datetime.now(timezone.utc) if quand.tzinfo else datetime.now())
        s = int((reference - quand).total_seconds())
    except Exception:
        return "date illisible"
    if s < 0:
        return "dans le futur (horloge à vérifier)"
    if s < 60:
        return f"il y a {s} s"
    if s < 3600:
        return f"il y a {s // 60} min"
    if s < 86400:
        return f"il y a {s // 3600} h {s % 3600 // 60} min"
    return f"il y a {s // 86400} j"


def secondes_depuis(quand):
    try:
        if isinstance(quand, str):
            quand = datetime.fromisoformat(quand.replace("Z", "+00:00"))
        reference = datetime.now(timezone.utc) if quand.tzinfo else datetime.now()
        return (reference - quand).total_seconds()
    except Exception:
        return None


def requete_json(url, entetes=None, delai=15):
    """GET → (code HTTP, corps décodé ou texte brut). Jamais d'exception."""
    try:
        r = urllib.request.Request(url, headers=entetes or {})
        with urllib.request.urlopen(r, timeout=delai) as reponse:
            corps = reponse.read().decode("utf-8", errors="replace")
            try:
                return reponse.status, json.loads(corps)
            except Exception:
                return reponse.status, corps
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read().decode("utf-8", errors="replace")
        except Exception:
            return e.code, ""
    except Exception as e:
        return None, masquer(e)


# ---------------------------------------------------------------------------
# 1. Le service
# ---------------------------------------------------------------------------
def verifier_service(constats):
    titre("1. Le service (le robot tourne-t-il ?)")
    try:
        r = subprocess.run(["systemctl", "is-active", "totem"],
                           capture_output=True, text=True, timeout=10)
        etat = r.stdout.strip()
    except Exception:
        attention("impossible d'interroger systemd depuis ici — "
                  "essayez : systemctl status totem")
        constats["service"] = None
        return
    if etat == "active":
        ok("le service « totem » est en marche")
        constats["service"] = True
    else:
        probleme(f"le service « totem » est : {etat or 'introuvable'}")
        print("     → pour le relancer : sudo systemctl restart totem")
        print("     → pour voir pourquoi il s'est arrêté : "
              "sudo journalctl -u totem -n 50")
        constats["service"] = False


# ---------------------------------------------------------------------------
# 2. La version en service
# ---------------------------------------------------------------------------
def verifier_version(constats):
    titre("2. La version réellement en service")
    en_service = None
    try:
        with open(VERSION_EN_SERVICE, encoding="utf-8") as f:
            en_service = f.read().strip()[:60]
    except OSError:
        pass
    if en_service:
        ok(f"le robot exécute : {en_service}   (lu dans {VERSION_EN_SERVICE})")
    else:
        attention(f"pas de fichier {VERSION_EN_SERVICE} — le robot tourne "
                  "peut-être depuis les sources, ou n'est pas installé")
    dossier = os.path.expanduser("~/totem")
    try:
        r = subprocess.run(
            ["git", "-C", dossier, "log", "-1", "--format=%h %cd",
             "--date=short"], capture_output=True, text=True, timeout=10)
        du_depot = r.stdout.strip()
    except Exception:
        du_depot = ""
    if du_depot:
        print(f"     le dossier {dossier} contient : {du_depot}")
        if en_service and not en_service.startswith(du_depot.split()[0]):
            attention("le robot N'EXÉCUTE PAS le code du dossier — "
                      "« git pull » seul ne suffit jamais :")
            print("     → cd ~/totem && sudo bash install.sh")
            constats["version_en_retard"] = True
    constats["version"] = en_service or du_depot or "inconnue"


# ---------------------------------------------------------------------------
# 3. La configuration
# ---------------------------------------------------------------------------
def lire_configuration(constats):
    titre("3. La configuration")
    chemin = next((c for c in CHEMINS_CONF if c and os.path.isfile(c)), None)
    if not chemin:
        probleme("aucun totem.conf trouvé (ni /boot/firmware/totem.conf, "
                 "ni /etc/totem.conf)")
        constats["conf"] = None
        return {}
    ok(f"fichier lu : {chemin}")
    cfg = configparser.ConfigParser()
    try:
        cfg.read(chemin, encoding="utf-8")
    except Exception as e:
        probleme(f"fichier illisible : {masquer(e)}")
        constats["conf"] = None
        return {}
    valeurs = {
        "jeton": cfg.get("telegram", "jeton", fallback="").strip(),
        "chat_id": cfg.get("telegram", "chat_id", fallback="").strip(),
        "base": cfg.get("totem", "base",
                        fallback="/var/lib/totem/journal.db").strip(),
        "cloud_url": cfg.get("cloud", "url", fallback="").strip(),
        "cloud_cle": cfg.get("cloud", "cle", fallback="").strip(),
        "terminal": cfg.get("cloud", "terminal", fallback="totem").strip(),
    }
    SECRETS.extend([valeurs["jeton"], valeurs["cloud_cle"]])
    ok("jeton Telegram : renseigné" if valeurs["jeton"]
       else "jeton Telegram : ABSENT")
    ok(f"chat_id : {valeurs['chat_id'] or 'ABSENT'}")
    if valeurs["cloud_url"] and valeurs["cloud_cle"]:
        ok(f"cloud : {valeurs['cloud_url']}  (terminal « {valeurs['terminal']} »)")
    else:
        attention("cloud non configuré ([cloud] url/cle vides) — la plateforme "
                  "ne peut RIEN recevoir de ce terminal")
    constats["conf"] = True
    constats["cloud_configure"] = bool(valeurs["cloud_url"] and valeurs["cloud_cle"])
    return valeurs


# ---------------------------------------------------------------------------
# 4. Les modems
# ---------------------------------------------------------------------------
def verifier_modems(constats):
    titre("4. Les modems")
    ports = sorted(glob.glob("/dev/ttyUSB*"))
    if ports:
        ok(f"{len(ports)} port(s) série USB : {', '.join(ports)}")
        print("     (un modem SIM7600 expose plusieurs ports ; "
              "2 modems ≈ 8 à 10 ports)")
        constats["ports"] = len(ports)
    else:
        probleme("AUCUN port modem (/dev/ttyUSB*) : câble USB débranché, "
                 "alimentation trop faible, ou HAT éteint")
        print("     → vérifier le câble et l'alimentation (le HAT réclame 3 A)")
        constats["ports"] = 0


# ---------------------------------------------------------------------------
# 5. Le journal local
# ---------------------------------------------------------------------------
def verifier_journal(valeurs, constats):
    titre("5. Le journal local (la mémoire du robot)")
    chemin = valeurs.get("base") or "/var/lib/totem/journal.db"
    if not os.path.isfile(chemin):
        probleme(f"journal introuvable : {chemin}")
        constats["journal"] = None
        return
    ok(f"journal : {chemin}")
    try:
        conn = sqlite3.connect(f"file:{chemin}?mode=ro", uri=True, timeout=5)
    except Exception as e:
        probleme(f"impossible d'ouvrir le journal : {masquer(e)}")
        constats["journal"] = None
        return

    def un(sql):
        try:
            return conn.execute(sql).fetchone()
        except Exception:
            return None

    # Dernier SMS relevé — LE chiffre qui dit si la relève vit encore.
    ligne = un("SELECT date, compte FROM sms ORDER BY id DESC LIMIT 1")
    if ligne and ligne[0]:
        constats["dernier_sms_s"] = secondes_depuis(ligne[0])
        print(f"     dernier SMS relevé : {ligne[0]} ({age_humain(ligne[0])})"
              f" sur {ligne[1] or '?'}")
    else:
        attention("aucun SMS dans le journal")
        constats["dernier_sms_s"] = None
    ligne = un("SELECT COUNT(*) FROM sms WHERE date >= datetime('now', "
               "'localtime', '-1 day')")
    if ligne:
        n = ligne[0]
        (ok if n else attention)(f"SMS relevés ces dernières 24 h : {n}")

    # Dernière trace de vie écrite par le robot lui-même.
    ligne = un("SELECT MAX(date) FROM evenements")
    if ligne and ligne[0]:
        constats["dernier_evenement_s"] = secondes_depuis(ligne[0])
        print(f"     dernière note du robot : {ligne[0]} "
              f"({age_humain(ligne[0])})")

    # Les 12 dernières notes : c'est là que le robot écrit ses pannes.
    print("\n     — Les 12 dernières notes du robot —")
    try:
        for date, texte in conn.execute(
                "SELECT date, texte FROM evenements ORDER BY id DESC LIMIT 12"):
            print(f"     · {date}  {masquer(texte)[:110]}")
    except Exception as e:
        attention(f"notes illisibles : {masquer(e)}")

    # Files d'attente : ce qui est retenu, et vers où.
    ligne = un("SELECT COUNT(*) FROM sortants")
    if ligne is not None:
        n = ligne[0]
        (attention if n else ok)(
            f"messages en attente vers Telegram : {n}"
            + (" — le robot n'arrive plus à envoyer !" if n else ""))
        constats["attente_telegram"] = n
    ligne = un("SELECT COUNT(*) FROM sms WHERE envoye = 0")
    if ligne is not None:
        n = ligne[0]
        (attention if n else ok)(
            f"SMS en attente vers le cloud : {n}"
            + (" — la plateforme est en retard sur le terminal !" if n else ""))
        constats["attente_cloud"] = n
    ligne = un("SELECT COUNT(*) FROM recus WHERE envoye = 0")
    if ligne is not None and ligne[0]:
        attention(f"reçus PDF pas encore envoyés : {ligne[0]}")
    conn.close()
    constats["journal"] = True


# ---------------------------------------------------------------------------
# 6. Telegram
# ---------------------------------------------------------------------------
def verifier_telegram(valeurs, constats):
    titre("6. La liaison Telegram")
    jeton = valeurs.get("jeton")
    if not jeton:
        probleme("pas de jeton dans la configuration : rien à tester")
        constats["telegram"] = False
        return
    code, corps = requete_json(f"https://api.telegram.org/bot{jeton}/getMe")
    if code == 200 and isinstance(corps, dict) and corps.get("ok"):
        nom = corps["result"].get("username", "?")
        ok(f"Telegram répond — le robot s'appelle @{nom}")
        constats["telegram"] = True
    elif code == 401:
        probleme("Telegram refuse le jeton (401) : la clé du bot a changé "
                 "ou a été révoquée")
        constats["telegram"] = False
    elif code is None:
        probleme(f"Internet ou Telegram injoignable : {corps}")
        constats["telegram"] = False
    else:
        attention(f"réponse inattendue de Telegram : {code}")
        constats["telegram"] = None


# ---------------------------------------------------------------------------
# 7. Supabase
# ---------------------------------------------------------------------------
def verifier_cloud(valeurs, constats):
    titre("7. La liaison Supabase (ce que voit la plateforme)")
    url, cle = valeurs.get("cloud_url"), valeurs.get("cloud_cle")
    if not (url and cle):
        attention("cloud non configuré : rien à tester")
        return
    entetes = {"apikey": cle, "authorization": f"Bearer {cle}"}

    code, corps = requete_json(
        f"{url}/rest/v1/terminaux?select=id,vu_le,version"
        "&order=vu_le.desc.nullslast&limit=1", entetes)
    if code == 200 and isinstance(corps, list):
        if corps:
            t = corps[0]
            constats["vu_le_s"] = secondes_depuis(t.get("vu_le") or "")
            ok(f"terminal « {t.get('id')} » — signe de vie : "
               f"{age_humain(t.get('vu_le') or '')} — version déclarée : "
               f"{t.get('version') or 'inconnue'}")
        else:
            attention("la table « terminaux » est VIDE : le robot n'a encore "
                      "jamais réussi à s'annoncer")
    elif code == 401 or code == 403:
        probleme(f"Supabase refuse la clé ({code}) : mauvaise clé, ou projet "
                 "en pause — vérifiez sur supabase.com que le projet est actif")
        constats["cloud_refus"] = True
        return
    elif code is None:
        probleme(f"Supabase injoignable : {corps}")
        return
    else:
        probleme(f"terminaux → {code} : {masquer(corps)[:160]}")

    code, corps = requete_json(
        f"{url}/rest/v1/paiements?select=recu_le"
        "&order=recu_le.desc&limit=1", entetes)
    if code == 200 and isinstance(corps, list) and corps:
        quand = corps[0].get("recu_le") or ""
        constats["dernier_sms_cloud_s"] = secondes_depuis(quand)
        ok(f"dernier SMS dans la base : {age_humain(quand)}")
    elif code == 200:
        attention("aucun SMS dans la base cloud")

    # La migration est-elle appliquée ? On demande les colonnes de la refonte.
    code, corps = requete_json(
        f"{url}/rest/v1/paiements?select=expediteur,categorie,nature,emis_le"
        "&limit=1", entetes)
    if code == 200:
        ok("colonnes de la refonte SMS présentes : la migration est appliquée")
    elif code == 400:
        probleme("il MANQUE des colonnes : la migration n'est pas (toute) "
                 "appliquée")
        print("     → coller sql/migration-refonte-sms-et-audit.sql dans "
              "Supabase → SQL Editor → Run")
        constats["migration_manquante"] = True

    # Les dernières notes que le terminal a poussées : ses pannes s'y lisent.
    code, corps = requete_json(
        f"{url}/rest/v1/evenements?select=survenu_le,texte"
        "&order=survenu_le.desc&limit=5", entetes)
    if code == 200 and isinstance(corps, list) and corps:
        print("\n     — Dernières notes du terminal, vues du cloud —")
        for e in corps:
            print(f"     · {e.get('survenu_le', '?')}  "
                  f"{masquer(e.get('texte', ''))[:110]}")


# ---------------------------------------------------------------------------
# 8. La synthèse : où ça bloque
# ---------------------------------------------------------------------------
UNE_HEURE = 3600


def synthese(constats):
    titre("EN RÉSUMÉ — où ça bloque")
    conclusions = []
    if constats.get("service") is False:
        conclusions.append(
            "❌ Le robot est ARRÊTÉ. Tout part de là : "
            "sudo systemctl restart totem, puis relancez ce diagnostic.")
    if constats.get("ports") == 0:
        conclusions.append(
            "❌ Aucun modem visible : sans port série, aucun SMS ne peut "
            "entrer. Câble USB et alimentation d'abord.")
    if constats.get("telegram") is False:
        conclusions.append(
            "❌ La liaison Telegram ne répond pas (jeton ou Internet).")
    if constats.get("cloud_refus"):
        conclusions.append(
            "❌ Supabase refuse la clé du terminal : la plateforme ne peut "
            "rien recevoir. Vérifiez le projet et la clé service_role.")
    if constats.get("migration_manquante"):
        conclusions.append(
            "⚠️ La migration de la base n'est pas appliquée : des SMS "
            "peuvent être retenus côté terminal.")

    sms_s = constats.get("dernier_sms_s")
    evt_s = constats.get("dernier_evenement_s")
    if constats.get("service") is not False and sms_s and sms_s > 6 * UNE_HEURE:
        if evt_s is not None and evt_s < UNE_HEURE:
            conclusions.append(
                "❌ SIGNATURE RECONNUE : le robot vit (notes récentes) mais "
                "ne relève PLUS les SMS depuis " + age_humain_depuis(sms_s)
                + ". C'est le fil de surveillance qui s'est arrêté — le "
                "correctif existe : mettre à jour le robot "
                "(cd ~/totem && git pull && sudo bash install.sh).")
        else:
            conclusions.append(
                "❌ Plus aucune activité depuis " + age_humain_depuis(sms_s)
                + " : le robot est figé ou arrêté depuis ce moment-là. "
                "sudo journalctl -u totem -n 50 dira pourquoi.")
    if constats.get("attente_telegram"):
        conclusions.append(
            f"⚠️ {constats['attente_telegram']} message(s) coincé(s) vers "
            "Telegram : dès que la liaison revient, ils partiront seuls.")
    if constats.get("attente_cloud"):
        conclusions.append(
            f"⚠️ {constats['attente_cloud']} SMS pas encore transmis à la "
            "plateforme : le terminal les garde, rien n'est perdu.")
    if constats.get("version_en_retard"):
        conclusions.append(
            "⚠️ Le robot n'exécute pas le code du dossier ~/totem : "
            "sudo bash install.sh pour déployer réellement.")

    if not conclusions:
        conclusions.append(
            "✅ Rien d'anormal détecté d'ici. Si les SMS manquent toujours, "
            "envoyez un SMS de test à la SIM et relancez ce diagnostic "
            "2 minutes après : le « dernier SMS relevé » doit bouger.")
    for c in conclusions:
        print(f"  {c}")
    print("\n  Envoyez cette sortie complète pour analyse : elle ne contient "
          "ni clé, ni jeton, ni code secret.\n")


def age_humain_depuis(secondes):
    if secondes is None:
        return "?"
    if secondes < 3600:
        return f"{int(secondes // 60)} min"
    if secondes < 86400:
        return f"{int(secondes // 3600)} h"
    return f"{int(secondes // 86400)} j"


def principal():
    print("╔" + "═" * 60 + "╗")
    print("║  DIAGNOSTIC TOTEM — lecture seule, aucun secret affiché" + " " * 3 + "║")
    print("╚" + "═" * 60 + "╝")
    print(f"  Lancé le {datetime.now().isoformat(timespec='seconds')} "
          f"sur {os.uname().nodename}")
    constats = {}
    verifier_service(constats)
    verifier_version(constats)
    valeurs = lire_configuration(constats)
    verifier_modems(constats)
    if valeurs:
        verifier_journal(valeurs, constats)
        verifier_telegram(valeurs, constats)
        verifier_cloud(valeurs, constats)
    synthese(constats)
    return 0


if __name__ == "__main__":
    sys.exit(principal())
