# -*- coding: utf-8 -*-
"""Le reçu de la PLATEFORME est celui du BOÎTIER, au pixel près.

La plateforme fabrique maintenant elle-même les reçus de la démo vivante
(`web/lib/recu-pdf.ts`), en transcrivant `totem/recu.py` règle pour règle.
Deux transcriptions du même dessin finissent toujours par diverger — une
marge retouchée d'un côté, un arrondi de l'autre — et un reçu est un
document qu'on tend à un client : il ne peut pas changer selon qui l'a fait.

Ce test fabrique les mêmes reçus des deux côtés — MTN et Orange, français et
anglais, envoi, réception et sens inconnu, décimales, frais, commission,
montant brut, un nom de soixante-quinze caractères, un reçu de solde — les
rend en images et exige qu'elles soient identiques. Son TÉMOIN compare deux
reçus qui ne diffèrent que d'un franc : la mesure doit les distinguer, sans
quoi « identique » ne voudrait rien dire.

Il exige aussi que `web/lib/recu-donnees.ts` (le symbole, les marques, les
polices) soit à jour de la charte.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from types import SimpleNamespace

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(RACINE, "web")

try:
    from PIL import Image, ImageChops
except ImportError:  # pragma: no cover - selon la machine
    Image = None

from totem.recu import recu_solde, recu_transfert

# Le seuil : un pixel dont une composante change de plus de 40 sur 255.
# L'anticrénelage d'un même tracé, posé aux mêmes coordonnées, ne bouge pas ;
# un caractère décalé d'un point en change des dizaines.
ECART = 40


def _instant(q):
    return {"annee": q.year, "mois": q.month, "jour": q.day,
            "heure": q.hour, "minute": q.minute, "seconde": q.second}


CAS = [
    dict(nom="mtn-entree-fr", operateur="MTN MoMo", langue="fr", titre="Reçu de transfert",
         quand=datetime(2026, 10, 19, 9, 5, 7), reseau=True,
         paiement=dict(sens="entree", montant=4231500, nom="NKENGAFAC MBOUNGOU JEAN",
                       numero="699112233", reference="9988776655", frais=0,
                       commission=None, montant_brut=None),
         compte=["BOUTIQUE AKWA", "677123456"], numero="TM-2026-1019-0042"),
    dict(nom="orange-sortie-en", operateur="Orange Money", langue="en", titre="Transfer receipt",
         quand=datetime(2026, 8, 5, 13, 19, 0), reseau=False,
         paiement=dict(sens="sortie", montant=2784137.6, nom="WONDER PHONE",
                       numero="237681026861", reference="PP260805.1319.A12345",
                       frais=150, commission=25, montant_brut=2784287.6),
         compte=["ETS. KAMDEM", "699000111"], numero="TM-2026-0805-7"),
    dict(nom="depot-nom-long-fr", operateur="MTN MoMo", langue="fr", titre="Reçu de dépôt",
         quand=datetime(2026, 1, 31, 23, 59, 59), reseau=True,
         paiement=dict(sens="entree", montant=150, nom="STE. NOUVELLE BRASSERIE DU LITTORAL ET DES HAUTS PLATEAUX DE L'OUEST SARL",
                       numero="677998877", reference="18300000001", frais=None,
                       commission=None, montant_brut=None),
         compte=None, numero="TM-2026-0131-123456"),
    dict(nom="sens-inconnu-en", operateur="Camtel", langue="en", titre="Withdrawal receipt",
         quand=datetime(2026, 12, 1, 0, 1, 2), reseau=False,
         paiement=dict(sens=None, montant=1000000000, nom=None, numero=None, reference=None,
                       frais=None, commission=None, montant_brut=None),
         compte=["", ""], numero="TS-2026-1201-0001"),
    dict(nom="solde-fr", genre="solde", operateur="Orange Money", langue="fr",
         quand=datetime(2026, 10, 19, 21, 54, 3), solde=184137,
         compte="BOUTIQUE AKWA", numero_ligne="699000111", numero="TM-2026-1019-0099"),
    dict(nom="solde-en", genre="solde", operateur="MTN MoMo", langue="en",
         quand=datetime(2026, 10, 19, 7, 4, 3), solde=12.5,
         compte="MTN ·3501", numero_ligne="", numero="TM-2026-1019-0100"),
]


def _boitier(cas):
    """Le reçu du boîtier, par le vrai code du boîtier."""
    if cas.get("genre") == "solde":
        return recu_solde(cas["solde"], cas["compte"], cas["numero_ligne"], cas["numero"],
                          cas["quand"], cas["operateur"], langue=cas["langue"])
    p = cas["paiement"]
    paiement = SimpleNamespace(
        sens=p["sens"], montant=p["montant"], nom=p["nom"], numero=p["numero"],
        reference=p["reference"], frais=p["frais"], commission=p["commission"],
        montant_brut=p["montant_brut"], emetteur=None, beneficiaire=None,
        quand=cas["quand"] if cas["reseau"] else None)
    compte = tuple(cas["compte"]) if cas["compte"] is not None else None
    return recu_transfert(paiement, cas["numero"], cas["quand"], cas["operateur"],
                          titre=cas["titre"], langue=cas["langue"], compte=compte)


def _pour_la_plateforme(cas):
    c = {k: v for k, v in cas.items() if k not in ("quand", "reseau", "paiement")}
    c["quand"] = _instant(cas["quand"])
    if "paiement" in cas:
        p = cas["paiement"]
        c["paiement"] = {"sens": p["sens"], "montant": p["montant"], "nom": p["nom"],
                         "numero": p["numero"], "reference": p["reference"],
                         "frais": p["frais"], "commission": p["commission"],
                         "montantBrut": p["montant_brut"], "heureDuReseau": cas["reseau"]}
    return c


def _image(pdf, dossier, nom):
    chemin = os.path.join(dossier, f"{nom}.pdf")
    if pdf is not None:
        with open(chemin, "wb") as f:
            f.write(pdf)
    subprocess.run(["pdftoppm", "-r", "50", "-png", "-singlefile", chemin,
                    os.path.join(dossier, nom)], check=True)
    return Image.open(os.path.join(dossier, f"{nom}.png")).convert("RGB")


def _ecart(a, b):
    if a.size != b.size:
        return a.size[0] * a.size[1]
    d = ImageChops.difference(a, b).point(lambda v: 255 if v > ECART else 0).convert("L")
    return sum(d.histogram()[1:])


class TestLesDonneesDuRecu(unittest.TestCase):
    def test_les_donnees_du_recu_sont_a_jour_de_la_charte(self):
        r = subprocess.run([sys.executable, os.path.join(RACINE, "outils", "generer-donnees-du-recu.py"),
                            "--verifier"])
        self.assertEqual(r.returncode, 0,
                         "web/lib/recu-donnees.ts n'est plus à jour : "
                         "python3 outils/generer-donnees-du-recu.py")


@unittest.skipUnless(Image and shutil.which("pdftoppm") and shutil.which("node"),
                     "il faut Pillow, pdftoppm et node pour comparer les images")
class TestLeRecuDeLaPlateformeEstCeluiDuBoitier(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dossier = tempfile.mkdtemp(prefix="recus-")
        plateforme = os.path.join(cls.dossier, "plateforme")
        os.mkdir(plateforme)
        entree = os.path.join(cls.dossier, "cas.json")
        with open(entree, "w", encoding="utf-8") as f:
            json.dump([_pour_la_plateforme(c) for c in CAS], f, ensure_ascii=False)
        r = subprocess.run(["node", "--no-warnings", "--import", "./noyau/tests/resolveur.mjs",
                            "scripts/recu-de-la-plateforme.mjs", entree, plateforme],
                           cwd=WEB, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr)
        cls.sortie = r.stdout
        cls.plateforme = plateforme

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dossier, ignore_errors=True)

    def test_aucun_texte_ne_sort_de_la_page(self):
        self.assertEqual(self.sortie.strip(), "")

    def test_chaque_recu_est_identique_au_pixel(self):
        for cas in CAS:
            with self.subTest(cas["nom"]):
                boitier = _image(_boitier(cas), self.dossier, f"boitier-{cas['nom']}")
                plateforme = _image(None, self.plateforme, cas["nom"])
                self.assertEqual(_ecart(boitier, plateforme), 0)

    def test_temoin_un_franc_de_difference_se_voit(self):
        cas = dict(CAS[0])
        cas["paiement"] = dict(cas["paiement"], montant=cas["paiement"]["montant"] + 1)
        autre = _image(_boitier(cas), self.dossier, "temoin")
        plateforme = _image(None, self.plateforme, CAS[0]["nom"])
        self.assertGreater(_ecart(autre, plateforme), 20,
                           "la mesure ne voit pas un franc de différence : elle ne prouve rien")


if __name__ == "__main__":
    unittest.main()
