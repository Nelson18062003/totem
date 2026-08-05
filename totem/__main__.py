# -*- coding: utf-8 -*-
"""Points d'entrée de TOTEM.

  python3 -m totem                 → mode réel (détection automatique des modems)
  python3 -m totem --simulation    → faux modems + vrai Telegram (sans matériel)
  python3 -m totem --console       → faux modems + chat dans le terminal
  python3 -m totem --demo          → scénario automatique (vérification rapide)
  python3 -m totem --modems        → liste les modems détectés, puis quitte
  python3 -m totem --version       → la version en service sur ce Pi
  python3 -m totem --stk           → la SIM porte-t-elle une applet Mobile Money ?
"""

import sys

from .app import Robot
from .compte import Compte
from .storage import Journal, JournalInaccessible


def _comptes_simules(sms_auto=True):
    """Deux comptes simulés : MTN et Orange, comme la configuration cible."""
    from .simulator import ModemSimule
    return [
        Compte(ModemSimule("MTN", sms_auto=sms_auto), "MTN"),
        Compte(ModemSimule("Orange", sms_auto=sms_auto), "Orange"),
    ]


def _comptes_reels(patience=120):
    """Détecte les modems branchés et ouvre un compte pour chacun.

    Au démarrage à froid du Pi, les modems USB mettent une vingtaine de
    secondes à s'annoncer, et le SIM7600 encore plus à s'enregistrer sur le
    réseau. On patiente donc au lieu d'abandonner tout de suite.
    """
    import time

    from .detect import detecter_modems
    from .modem import ModemSerie

    fin = time.time() + patience
    trouves = []
    while True:
        trouves = detecter_modems()
        if trouves or time.time() >= fin:
            break
        print("  aucun modem pour l'instant, nouvelle tentative dans 10 s…")
        time.sleep(10)

    comptes = []
    for info in trouves:
        try:
            comptes.append(Compte(ModemSerie(port=info.port),
                                  carte=info.carte, imei=info.imei))
            print(f"  {info.description} sur {info.port} (IMEI {info.imei})")
        except Exception as e:
            print(f"  Modem sur {info.port} inutilisable : {e}", file=sys.stderr)
    return comptes


def principal():
    args = sys.argv[1:]

    # --- Quelle version tourne ici ? ---------------------------------------
    # Elle s'affiche déjà dans Telegram, mais c'est en SSH qu'on la cherche :
    # juste après un « git pull », pour vérifier que le correctif est bien là.
    if "--version" in args:
        from .version import version
        print(version())
        return

    # --- Diagnostic : la carte porte-t-elle une applet SIM Toolkit ? -------
    # Lecture seule. Répond à la seule question qui décide de l'avenir du
    # pilotage : l'opérateur peut-il déclarer lui-même ce qu'il attend, au
    # lieu de nous laisser le deviner d'après le texte d'un menu ?
    if "--stk" in args:
        from .detect import detecter_modems
        from .modem import ModemSerie
        from .stk import rapport, sonder
        trouves = detecter_modems()
        if not trouves:
            print("Aucun modem détecté. Vérifiez les branchements USB.")
            return
        for info in trouves:
            print(f"\n########## {info.libelle} — {info.port} ##########\n")
            try:
                modem = ModemSerie(port=info.port)
            except Exception as e:
                print(f"Modem inutilisable : {e}", file=sys.stderr)
                continue
            print(rapport(sonder(modem)))
        return

    # --- Diagnostic : que voit-on comme modems ? ---------------------------
    if "--modems" in args:
        from .carte import operateur_depuis_imsi
        from .detect import detecter_modems
        trouves = detecter_modems()
        if not trouves:
            print("Aucun modem détecté. Vérifiez les branchements USB.")
            return
        print(f"{len(trouves)} modem(s) détecté(s) :")
        for i, m in enumerate(trouves, 1):
            sim = "SIM prête" if m.sim_prete else "SIM absente ou PIN actif"
            print(f"  {i}. {m.description:<34} {m.port:<14} {sim}")
            print(f"     modem IMEI {m.imei}")
            if m.carte.iccid:
                # ICCID en entier : c'est l'identité qu'il faut pouvoir
                # comparer à celle imprimée sur la puce quand on en change.
                print(f"     carte ICCID {m.carte.iccid}", end="")
                # De l'IMSI, seuls le pays et l'opérateur : le reste
                # identifierait l'abonné sans rien apprendre d'utile ici.
                if m.carte.imsi:
                    connu = operateur_depuis_imsi(m.carte.imsi)
                    print(f" · réseau d'origine {m.carte.imsi[:5]}"
                          + ("" if connu else " (inconnu de TOTEM)"), end="")
                print(f" · {m.carte.numero}" if m.carte.numero else "")
            elif m.sim_prete:
                print("     carte présente mais ICCID illisible — le "
                      "cloisonnement par SIM ne pourra pas fonctionner")
        return

    # --- Démo scriptée, sans matériel ni Telegram --------------------------
    if "--demo" in args:
        from .console import TransportScenario
        comptes = _comptes_simules(sms_auto=False)
        scenario = [
            "/menu", "/statut", "/comptes", "/sims", "/raccourcis",
            "*126#", "5", "1",                    # solde MTN (menus en boutons)
            "!r:enr", "Solde",                    # 💾 : le parcours devient un bouton
            "/raccourcis",                        # il doit y figurer
            "/orange", "/raccourcis", "!r:cat",   # catalogue Orange propose puis pose
            "/menu",                              # les boutons Orange apparaissent
            "#150#", "5", "1",                    # solde Orange
            "mtn *126#",                          # transfert ciblé MTN
            # Bénéficiaire et montant se composent sur le pavé de boutons :
            # aucun chiffre ne devient un message de la conversation.
            "1",
            *[f"!s:{c}" for c in "677123456"], "!s:ok",
            *[f"!s:{c}" for c in "50000"], "!s:ok",
            "1234",                               # PIN (jamais journalisé)
            "/rapport", "/sms",
        ]
        journal = Journal(":memory:")
        # Un client paie sur chaque réseau avant le scénario
        comptes[0].modem.injecter_paiement("NGONO Marie", 25000)
        comptes[1].modem.injecter_paiement("TCHOUMI Paul", 15000)
        Robot(comptes, TransportScenario(scenario), journal,
              nom="TOTEM (démo)", pause_sms=1,
              raccourcis={"solde": {"libelle": "💰 Solde",
                                    "etapes": ["*126#", "5", "1"]}}).demarrer()
        print("--- Fin de la démo ---")
        return

    # --- Console interactive, sans matériel --------------------------------
    if "--console" in args:
        from .console import TransportConsole
        print("Mode console : tapez *126# (MTN) ou /orange puis #150#. "
              "PIN de simulation : 1234. Ctrl-D pour quitter.")
        Robot(_comptes_simules(), TransportConsole(), Journal(":memory:"),
              nom="TOTEM (console)", pause_sms=5).demarrer()
        return

    # --- Modes avec vrai Telegram -----------------------------------------
    from .config import ErreurConfig, charger
    from .telegram import TransportTelegram
    try:
        cfg = charger()
    except ErreurConfig as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        sys.exit(1)

    # La langue du robot, fixée une fois pour toutes : chaque texte sortant
    # (Telegram, reçus, rapports) la suit. Anglais par défaut.
    from .textes import definir_langue
    definir_langue(cfg.get("langue"))

    transport = TransportTelegram(cfg["jeton"], cfg["chat_id"], groupe=cfg["groupe"],
                                  admins=cfg["admins"], sujets=cfg["sujets"])

    if "--simulation" in args:
        comptes = _comptes_simules()
        journal = Journal(":memory:")
        nom = cfg["nom"] + " (simulation)"
    else:
        print("Détection des modems…")
        comptes = _comptes_reels()
        if not comptes:
            message = ("Aucun modem détecté. Vérifiez les branchements USB, "
                       "puis relancez (diagnostic : python3 -m totem --modems).")
            print(message, file=sys.stderr)
            transport.envoyer(f"{cfg['nom']} : {message}")
            sys.exit(1)
        try:
            journal = Journal(cfg["base"])
        except JournalInaccessible as e:
            print(f"\nERREUR : {e}\n", file=sys.stderr)
            sys.exit(1)
        nom = cfg["nom"]

    # Le cloud n'est branché qu'en mode réel et s'il est configuré : sinon
    # l'objet est inerte et le robot se comporte exactement comme avant.
    nuage = None
    if "--simulation" not in args:
        from .nuage import Nuage
        nuage = Nuage(cfg["cloud_url"], cfg["cloud_cle"], cfg["terminal"], journal)
        if nuage.actif:
            print(f"  cloud : {cfg['cloud_url']} (terminal « {cfg['terminal']} »)")

    Robot(comptes, transport, journal, nom=nom,
          heure_rapport=cfg["heure_rapport"], raccourcis=cfg["raccourcis"],
          delai_session=cfg["delai_session"],
          seuil_confirmation=cfg["seuil_confirmation"],
          sauvegarde_quotidienne=cfg["sauvegarde_quotidienne"],
          chemin_base=cfg["base"] if "--simulation" not in args else None,
          numeros=cfg["numeros"], recus=cfg["recus"],
          nuage=nuage).demarrer()


if __name__ == "__main__":
    principal()
