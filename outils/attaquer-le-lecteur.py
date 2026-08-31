#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Le lecteur de SMS, attaqué — et pas seulement essayé.

    python3 outils/attaquer-le-lecteur.py [tours]

POURQUOI CE HARNAIS EXISTE. Les tests unitaires éprouvent les messages qu'on
a SU imaginer. Or le lecteur est la surface la plus exposée de tout TOTEM :
n'importe qui connaissant le numéro de la SIM peut lui envoyer le texte qu'il
veut, et ce texte décide de ce qui entre au bilan et sur les reçus. Il faut
donc lui envoyer aussi ce qu'on n'a PAS imaginé.

Ce harnais fabrique des dizaines de milliers de messages hostiles en mutant
de vrais SMS d'opérateurs — insertions, coupures, écritures mêlées, longues
répétitions, caractères de contrôle — et vérifie QUATRE PROMESSES du lecteur,
celles que son en-tête écrit noir sur blanc :

  1. IL NE LÈVE JAMAIS. Un SMS incompréhensible n'est pas une erreur : une
     exception ici arrête la relève, et le message suivant attend derrière.

  2. IL N'INVENTE JAMAIS UN MONTANT. Tout chiffre d'un montant rendu doit se
     retrouver dans le message. C'est la promesse qui protège l'argent, et
     c'est elle qui a cédé la première fois qu'on a lancé ce harnais :
     Python voit un chiffre dans « ٥ » comme dans « 5 », si bien que
     « Depot de 5٥٠٠٠0000 FCFA » se lisait 550 000 000 FCFA. Le SMS
     s'affichant tel qu'il est arrivé, l'écart était invisible.

  3. IL N'INVENTE JAMAIS UN SOLDE. Même règle, même raison.

  4. IL RANGE TOUJOURS DANS UNE CATÉGORIE CONNUE. Une catégorie inventée
     casse la boîte de réception, sur le web comme sur le téléphone.

Le tirage est REPRODUCTIBLE (graine fixe) : un échec se rejoue à l'identique.
"""

import random
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from totem.analyse_sms import analyser, categoriser, solde_annonce  # noqa: E402

CATEGORIES = {"encaissement", "envoi", "transfert", "depot", "retrait",
              "solde", "echec", "code", "publicite", "illisible",
              "message", "inconnu"}

# De VRAIS messages, des deux opérateurs et dans les deux langues : on mute ce
# que le lecteur rencontre pour de bon, pas du bruit tiré au hasard.
GRAINES = [
    "Vous avez recu 20 000 FCFA de NGONO Marie (677123456). Ref: PP240829. "
    "Nouveau solde: 412 500 FCFA.",
    "Transfer of 5,000 FCFA to 677123456 NGONO Marie completed. Fee: 100 FCFA. "
    "Airtime balance: 7,943 FCFA. New balance: 8,910 FCFA.",
    "Le solde de votre compte est de 2784137.6FCFA.",
    "Votre code de confirmation est 483921. Ne le communiquez a personne.",
    "Depot de 50000 FCFA vers 677123456 NGONO Marie reussi. Frais: 100 FCFA.",
    "Transaction failed. Current balance: 8910 FCFA.",
    "Cash Out completed from 677123456 EDGARD MANGA. Montant: 500000 FCFA. "
    "Commission: 1300 FCFA.",
    "2 millions a gagner avec Orange Money ! Composez #150#",
    "Successful transfer from 696103864 A to 690000001 GARANTIE EXCHANGE SARL 3",
]

# Les morceaux qu'on injecte. Les écritures de chiffres étrangères y sont à
# dessein : c'est par elles que le lecteur a cédé.
MORCEAUX = [
    "FCFA", " XAF", "recu", "envoye", "solde", "balance", "Ref:", "code", "PIN",
    "0", "9", " ", " ", " ", ".", ",", "*", "#", "-", "\n", "\r", "\t",
    "airtime", "Fee", "Montant", "amount", "de ", "to ", "from ", "(", ")",
    "677123456", "-1", "1e9", "0.0000001",
    "٥٠٠٠",          # « 5000 » en arabe-indien
    "５０００",          # « 5000 » en pleine chasse
    "%s", "{}", "'", '"', "\\",
]


def chiffres(valeur):
    """Les chiffres d'une chaîne, écriture d'origine conservée."""
    return re.sub(r"\D", "", unicodedata.normalize("NFKD", str(valeur)))


def muter(rng, texte):
    for _ in range(rng.randint(1, 6)):
        tirage = rng.random()
        if tirage < 0.30 and texte:
            i = rng.randrange(len(texte))
            texte = texte[:i] + rng.choice(MORCEAUX) + texte[i:]
        elif tirage < 0.50 and len(texte) > 4:
            i = rng.randrange(len(texte) - 2)
            texte = texte[:i] + texte[i + rng.randint(1, 3):]
        elif tirage < 0.65 and texte:
            i = rng.randrange(len(texte))
            texte = texte[:i] + texte[i:].upper()
        elif tirage < 0.80:
            texte = texte + rng.choice(MORCEAUX) * rng.randint(1, 20)
        elif tirage < 0.92 and texte:
            i = rng.randrange(len(texte))
            texte = texte[:i] + chr(rng.randrange(0x20, 0x2ff)) + texte[i:]
        else:
            texte = rng.choice(GRAINES) + " " + texte
    return texte


def main():
    tours = int(sys.argv[1]) if len(sys.argv) > 1 else 30000
    rng = random.Random(20260831)          # reproductible : un échec se rejoue
    echecs = []

    for _ in range(tours):
        texte = muter(rng, rng.choice(GRAINES))
        try:
            paiement = analyser(texte)
            categorie = categoriser(texte)
            solde = solde_annonce(texte)
        except Exception as e:                       # noqa: BLE001
            echecs.append(("le lecteur a LEVÉ " + type(e).__name__, texte, e))
            continue

        if categorie not in CATEGORIES:
            echecs.append(("catégorie inconnue", texte, categorie))

        presents = chiffres(texte)
        if paiement is not None and paiement.montant is not None:
            if chiffres(paiement.montant) not in presents:
                echecs.append(("MONTANT INVENTÉ", texte, paiement.montant))
        if solde is not None and chiffres(solde) not in presents:
            echecs.append(("SOLDE INVENTÉ", texte, solde))

    print(f"\n  {tours} SMS hostiles présentés au lecteur.\n")
    if not echecs:
        print("  ✓ jamais d'exception")
        print("  ✓ aucun montant inventé")
        print("  ✓ aucun solde inventé")
        print("  ✓ toujours une catégorie connue")
        print("\n✓ Le lecteur tient.\n")
        return 0

    for quoi, texte, detail in echecs[:10]:
        print(f"  ✗ {quoi} → {detail!r}")
        print(f"      sur : {texte[:150]!r}\n")
    print(f"✗ {len(echecs)} manquement(s) aux promesses du lecteur.\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
