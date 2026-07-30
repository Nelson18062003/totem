# -*- coding: utf-8 -*-
"""Points d'entrée du robot MoMo.

  python3 -m totem                 → mode réel (Pi + SIM7600 + Telegram)
  python3 -m totem --simulation    → faux modem + vrai Telegram (test sans matériel)
  python3 -m totem --console       → faux modem + chat dans le terminal
  python3 -m totem --demo          → scénario automatique (vérification rapide)
"""

import sys

from .app import Robot
from .storage import Journal


def _modem_simule(sms_auto=True):
    from .simulator import ModemSimule
    return ModemSimule(sms_auto=sms_auto)


def principal():
    args = sys.argv[1:]

    if "--demo" in args:
        from .console import TransportScenario
        modem = _modem_simule(sms_auto=False)
        scenario = [
            "/aide",
            "/statut",
            "*126#",       # ouvre le menu MoMo
            "5", "1",      # Mon compte → Solde
            "*126#",       # transfert complet
            "1", "677123456", "50000", "1234",   # 1234 = PIN de simulation (effacé du chat)
            "/rapport",
            "/sms",
        ]
        transport = TransportScenario(scenario)
        journal = Journal(":memory:")
        robot = Robot(modem, transport, journal, nom="TOTEM (démo)", pause_sms=1)
        # Un client « paie » avant le début du scénario, pour /rapport et /sms
        modem.injecter_paiement("NGONO Marie", 25000)
        robot.demarrer()
        print("--- Fin de la démo ---")
        return

    if "--console" in args:
        from .console import TransportConsole
        robot = Robot(_modem_simule(), TransportConsole(), Journal(":memory:"),
                      nom="TOTEM (console)", pause_sms=5)
        print("Mode console : tapez *126# pour essayer (PIN de simulation : 1234, Ctrl-D pour quitter)")
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

    transport = TransportTelegram(cfg["jeton"], cfg["chat_id"])
    journal = Journal(cfg["base"] if "--simulation" not in args else ":memory:")

    if "--simulation" in args:
        modem = _modem_simule()
        nom = cfg["nom"] + " (simulation)"
    else:
        from .modem import ModemSerie
        modem = ModemSerie(port=cfg["port"])
        nom = cfg["nom"]

    Robot(modem, transport, journal, nom=nom,
          heure_rapport=cfg["heure_rapport"]).demarrer()


if __name__ == "__main__":
    principal()
