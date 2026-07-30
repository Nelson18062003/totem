# -*- coding: utf-8 -*-
"""Points d'entrée de TOTEM.

  python3 -m totem                 → mode réel (détection automatique des modems)
  python3 -m totem --simulation    → faux modems + vrai Telegram (sans matériel)
  python3 -m totem --console       → faux modems + chat dans le terminal
  python3 -m totem --demo          → scénario automatique (vérification rapide)
  python3 -m totem --modems        → liste les modems détectés, puis quitte
"""

import sys

from .app import Robot
from .compte import Compte
from .storage import Journal


def _comptes_simules(sms_auto=True):
    """Deux comptes simulés : MTN et Orange, comme la configuration cible."""
    from .simulator import ModemSimule
    return [
        Compte(ModemSimule("MTN", sms_auto=sms_auto), "MTN"),
        Compte(ModemSimule("Orange", sms_auto=sms_auto), "Orange"),
    ]


def _comptes_reels():
    """Détecte les modems branchés et ouvre un compte pour chacun."""
    from .detect import detecter_modems
    from .modem import ModemSerie

    comptes = []
    for info in detecter_modems():
        try:
            comptes.append(Compte(ModemSerie(port=info.port), info.libelle))
            print(f"  {info.libelle} sur {info.port} (IMEI {info.imei})")
        except Exception as e:
            print(f"  Modem sur {info.port} inutilisable : {e}", file=sys.stderr)
    return comptes


def principal():
    args = sys.argv[1:]

    # --- Diagnostic : que voit-on comme modems ? ---------------------------
    if "--modems" in args:
        from .detect import detecter_modems
        trouves = detecter_modems()
        if not trouves:
            print("Aucun modem détecté. Vérifiez les branchements USB.")
            return
        print(f"{len(trouves)} modem(s) détecté(s) :")
        for i, m in enumerate(trouves, 1):
            sim = "SIM prête" if m.sim_prete else "SIM absente ou PIN actif"
            print(f"  {i}. {m.libelle:<12} {m.port:<14} IMEI {m.imei}  {sim}")
        return

    # --- Démo scriptée, sans matériel ni Telegram --------------------------
    if "--demo" in args:
        from .console import TransportScenario
        comptes = _comptes_simules(sms_auto=False)
        scenario = [
            "/menu", "/statut", "/comptes",
            "*126#", "5", "1",                    # solde MTN (menus en boutons)
            "/orange", "#150#", "5", "1",         # bascule puis solde Orange
            "mtn *126#",                          # transfert ciblé MTN
            "1", "677123456", "50000", "1234",    # 1234 = PIN (jamais journalisé)
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
        journal = Journal(cfg["base"])
        nom = cfg["nom"]

    Robot(comptes, transport, journal, nom=nom,
          heure_rapport=cfg["heure_rapport"], raccourcis=cfg["raccourcis"],
          delai_session=cfg["delai_session"]).demarrer()


if __name__ == "__main__":
    principal()
