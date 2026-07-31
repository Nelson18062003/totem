# -*- coding: utf-8 -*-
"""Points d'entrée du robot Mobile Money.

  python3 -m totem                 → mode réel (Pi + SIM7600 + Telegram)
  python3 -m totem --simulation    → faux modem + vrai Telegram (test sans matériel)
  python3 -m totem --console       → faux modem + chat dans le terminal
  python3 -m totem --demo          → scénario automatique (vérification rapide)

  --orange  →  simule une SIM Orange au lieu d'une SIM MTN (menus et codes
               différents : c'est le meilleur moyen de vérifier l'affichage
               des deux opérateurs sans démonter le HAT).
"""

import sys
import time

from .app import Robot
from .storage import Journal

# Profils utilisés hors configuration (console et démo).
PROFILS_SIMULES = {
    "mtn": {"nom": "MTN MoMo", "detection": "MTN", "menu": "*126#",
            "raccourcis": {"solde": {"libelle": "💰 Solde",
                                     "etapes": ["*126#", "5", "1"]}}},
    "orange": {"nom": "Orange Money", "detection": "Orange", "menu": "#148#",
               "raccourcis": {"solde": {"libelle": "💰 Solde",
                                        "etapes": ["#148#", "4", "1"]}}},
}


def _modem_simule(args, sms_auto=True):
    from .simulator import ModemSimule
    return ModemSimule(sms_auto=sms_auto,
                       reseau="ORANGE" if "--orange" in args else "MTN")


def principal():
    args = sys.argv[1:]
    orange = "--orange" in args

    if "--demo" in args:
        from .console import TransportScenario
        modem = _modem_simule(args, sms_auto=False)
        compte = "4" if orange else "5"
        scenario = [
            "/menu",
            "/statut",
            modem.reseau["code"],   # ouvre le menu de l'opérateur simulé
            compte, "1",            # Mon compte → Solde
            modem.reseau["code"],   # transfert complet
            "1", "677123456", "50000",  # 50 000 > seuil : confirmation demandée
            "!c:confirmer",             # appui sur « ✅ Confirmer »
            "!p:1", "!p:2", "!p:3", "!p:4", "!p:ok",   # code au pavé sécurisé
            "/rapport",
            "/sms",
            "/sims",
        ]
        if orange:
            # Le menu « Gerer mon code secret » ne doit PAS ouvrir le pavé.
            scenario[2:2] = [modem.reseau["code"], "5"]
        journal = Journal(":memory:")
        robot = Robot(modem, TransportScenario(scenario), journal,
                      nom="TOTEM (démo)", pause_sms=1, profils=PROFILS_SIMULES,
                      seuil_confirmation=25000, sauvegarde_quotidienne=False)
        # Un client « paie » avant le début du scénario, pour /rapport et /sms
        modem.injecter_paiement("NGONO Marie", 25000)
        robot.demarrer()
        print("--- Fin de la démo ---")
        return

    if "--console" in args:
        from .console import TransportConsole
        modem = _modem_simule(args)
        robot = Robot(modem, TransportConsole(), Journal(":memory:"),
                      nom="TOTEM (console)", pause_sms=5, profils=PROFILS_SIMULES)
        print(f"Mode console : tapez {modem.reseau['code']} pour essayer "
              "(code de simulation : 1234, Ctrl-D pour quitter)")
        robot.demarrer()
        return

    # Modes avec vrai Telegram
    from .config import ErreurConfig, charger
    from .telegram import TransportTelegram
    try:
        cfg = charger()
    except ErreurConfig as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        sys.exit(1)

    transport = TransportTelegram(cfg["jeton"], cfg["chat_id"], groupe=cfg["groupe"],
                                  admins=cfg["admins"], sujets=cfg["sujets"])
    journal = Journal(cfg["base"] if "--simulation" not in args else ":memory:")

    if "--simulation" in args:
        modem = _modem_simule(args)
        nom = cfg["nom"] + " (simulation)"
    else:
        modem = _attendre_modem(cfg["port"], transport)
        nom = cfg["nom"]

    Robot(modem, transport, journal, nom=nom,
          heure_rapport=cfg["heure_rapport"], profils=cfg["profils"],
          delai_session=cfg["delai_session"],
          seuil_confirmation=cfg["seuil_confirmation"],
          sauvegarde_quotidienne=cfg["sauvegarde_quotidienne"]).demarrer()


def _attendre_modem(port, transport, pause=30):
    """Ouvre le modem, en prévenant sur Telegram tant qu'il est injoignable.

    Le robot est à 5 000 km : s'il meurt parce que le HAT a bougé dans son
    berceau, systemd le relance en boucle et personne n'est averti. On monte
    donc Telegram d'abord, on dit ce qui ne va pas, et on réessaie."""
    from .modem import ModemSerie

    tentative = 0
    while True:
        try:
            modem = ModemSerie(port=port)
            if tentative:
                transport.envoyer("✅ Modem retrouvé, le robot démarre.")
            return modem
        except Exception as e:
            tentative += 1
            print(f"Modem injoignable sur {port} : {e}", file=sys.stderr)
            if tentative == 1:      # une seule alerte, pas un message toutes les 30 s
                transport.envoyer(
                    "⛔ <b>Modem injoignable</b>\n"
                    f"Port : <code>{port}</code>\n"
                    f"Erreur : {e}\n\n"
                    "<i>Vérifiez le câble USB entre le HAT et le Pi, puis "
                    "l'alimentation du HAT. Le robot réessaie toutes les 30 s "
                    "et vous préviendra dès qu'il repart. Autre piste : le port "
                    "peut avoir changé (ls /dev/ttyUSB*).</i>")
            time.sleep(pause)


if __name__ == "__main__":
    principal()
