# -*- coding: utf-8 -*-
"""Le reçu PDF : la maquette de `recus/`, fabriquée en Python.

Le dessin ne change pas. Il a été arrêté dans `recus/maquette.mjs`, éprouvé sur
de vrais SMS Orange, et les aperçus de `recus/apercus/` font foi. Ce fichier
transcrit cette maquette — les mêmes millimètres, les mêmes corps, les mêmes
couleurs — sans passer par un navigateur.

Trois zones, de haut en bas, dans l'ordre où on lit :

  1. QUI ÉMET LE REÇU     le symbole, le mot TOTEM, le type de document
  2. CE QUI S'EST PASSÉ   le montant en gros, puis DE et À
  3. LES PREUVES          un bandeau sable : identifiant, date, frais

Deux points de la maquette qui ont demandé du travail, et qu'il ne faut pas
perdre :

  - **Le séparateur de milliers n'est pas une espace.** Une espace, même
    insécable, garde la même chasse quelle que soit la taille du texte : à
    74 pt, « 2 784 137 » se lit « 2784137 ». Chaque tranche de trois chiffres
    est donc posée séparément, l'écart étant une fraction du corps.

  - **Le symbole n'est pas redessiné.** « La Tresse » est décrite une seule
    fois, dans `brand/generer.py` ; `totem/logo.py` va l'y chercher.

La mise en page du navigateur est reproduite explicitement : une boîte de ligne
haute de `interligne × corps`, la ligne de base posée dessous. C'est ce qui
permet de retrouver les mêmes millimètres que les aperçus.
"""

import os

from .analyse_sms import formater_montant
from .logo import poser
from .pdf import MM, Document, Page, Police

# --- La charte --------------------------------------------------------------
ENCRE = "#16171a"        # le texte
ETIQUETTE = "#8a8279"    # les petites capitales espacées
SECOND = "#62605c"       # numéros, devise
FILET = "#e8e5e1"        # le trait qui ferme l'en-tête
SABLE = "#f7f4f1"        # l'aplat des preuves
LATERITE = "#9a4b2e"     # le symbole

# A3 paysage, comme la maquette validée.
LARGEUR, HAUTEUR = 420 * MM, 297 * MM
MARGE_H, MARGE_V = 28 * MM, 26 * MM
GAUCHE, DROITE = MARGE_H, LARGEUR - MARGE_H
UTILE = DROITE - GAUCHE

POLICES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "polices")

# Corps, interlignes et interlettrages, repris de la feuille de style.
CORPS_ETIQUETTE, ECART_ETIQUETTE = 12, 0.20
CORPS_MOT, ECART_MOT = 30, 0.18
CORPS_TYPE = 17
CORPS_NUMERO = 12
CORPS_SOMME, ECART_SOMME = 74, -0.04
CORPS_NOM, ECART_NOM = 27, -0.025
CORPS_NUM = 17
CORPS_PREUVE = 17
CORPS_PIED = 11
SUIVI = -0.011                 # l'interlettrage général du document

TRANCHE = 0.22                 # écart entre tranches de trois chiffres, en em
PART_DEVISE, ECART_DEVISE = 0.42, 0.34

COTE_SYMBOLE = 78 * 0.75       # les 78 px de la maquette, en points

MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
        "août", "septembre", "octobre", "novembre", "décembre"]


def date_en_lettres(quand):
    return f"{quand.day} {MOIS[quand.month - 1]} {quand.year}"


def heure_en_lettres(quand):
    return f"{quand.hour} h {quand.minute:02d}"


# La deuxième lettre dit d'où vient le document : d'un Message, ou d'une
# Session au menu. Sans elle, le SMS n° 5 et la réponse USSD n° 5 porteraient
# le même numéro le même jour — et le second écraserait le premier dans le
# cloud, qui les range par numéro.
PREFIXES = {"sms": "TM", "ussd": "TS"}


def numero_de_recu(quand, source_id, source="sms"):
    """« TM-2026-0731-0042 ».

    Le compteur est l'identifiant de la ligne au journal : il ne se répète
    jamais, et refabriquer un reçu après coup lui redonne exactement le même
    numéro. Un compteur remis à zéro chaque jour aurait obligé à tenir un état
    de plus, pour un numéro moins sûr.
    """
    tete = PREFIXES.get(source, "TM")
    return f"{tete}-{quand.year}-{quand.month:02d}{quand.day:02d}-{source_id:04d}"


def numero_lisible(numero):
    """« 696103864 » → « 696 103 864 » : un numéro se lit par tranches."""
    chiffres = "".join(c for c in (numero or "") if c.isdigit())
    return (f"{chiffres[:3]} {chiffres[3:6]} {chiffres[6:]}"
            if len(chiffres) == 9 else (numero or ""))


class Gabarit:
    """Le squelette commun aux deux reçus.

    Toutes les positions sont en points, mesurées depuis le haut de la page —
    on transcrit une maquette, qui se lit de haut en bas.
    """

    def __init__(self, type_document, numero, operateur="Orange Money"):
        self.page = Page(LARGEUR, HAUTEUR)
        self.normale = Police(os.path.join(POLICES, "dmsans-400.ttf"), "DMSans")
        self.grasse = Police(os.path.join(POLICES, "dmsans-700.ttf"),
                             "DMSansGras")
        self.operateur = operateur
        self.page.rectangle(0, 0, LARGEUR, HAUTEUR, "#ffffff")
        self.bas_entete = self._entete(type_document, numero)

    # -- où tombe une ligne de base -----------------------------------------
    def _base(self, haut, corps, interligne=None):
        """La ligne de base d'un texte dont la boîte de ligne commence à `haut`.

        Une boîte de ligne plus courte que le texte le déborde par le haut et
        par le bas à parts égales — c'est ce demi-blanc que retranche le
        navigateur, et sans lui les gros corps se posent trop bas.
        """
        naturel = self.normale.interligne * corps
        hauteur = naturel if interligne is None else interligne * corps
        return haut + (hauteur - naturel) / 2 + self.normale.montee * corps

    @staticmethod
    def _hauteur(corps, interligne=None):
        return corps * (1.302 if interligne is None else interligne)

    # -- zone 1 : qui émet le reçu ------------------------------------------
    def _entete(self, type_document, numero):
        haut = MARGE_V
        poser(self.page, GAUCHE, haut, COTE_SYMBOLE, LATERITE)

        # Le mot est centré sur le symbole : boîte de ligne haute d'un corps,
        # centrée dans le carré de 78 px.
        boite_mot = haut + (COTE_SYMBOLE - CORPS_MOT) / 2
        self.page.texte(GAUCHE + COTE_SYMBOLE + 7 * MM,
                        self._base(boite_mot, CORPS_MOT, 1.0), "TOTEM",
                        self.grasse, CORPS_MOT, ENCRE, ECART_MOT)

        # À droite, le type de document et son numéro, calés sur le bas.
        bas = haut + COTE_SYMBOLE
        haut_numero = bas - self._hauteur(CORPS_NUMERO)
        self._a_droite(f"N° {numero}", self._base(haut_numero, CORPS_NUMERO),
                       self.normale, CORPS_NUMERO, ETIQUETTE)
        haut_type = haut_numero - 2.5 * MM - self._hauteur(CORPS_TYPE, 1.1)
        self._a_droite(type_document, self._base(haut_type, CORPS_TYPE, 1.1),
                       self.grasse, CORPS_TYPE, ENCRE, -0.02)

        self.page.filet(GAUCHE, bas + 9 * MM, UTILE, FILET)
        return bas + 9 * MM

    def _a_droite(self, texte, ligne_de_base, police, corps, teinte,
                  interlettrage=SUIVI):
        largeur = police.largeur(texte, corps, interlettrage)
        self.page.texte(DROITE - largeur, ligne_de_base, texte, police, corps,
                        teinte, interlettrage)

    # -- briques communes ----------------------------------------------------
    def etiquette(self, x, haut, texte):
        """Les petites capitales espacées. Même langue dans tout le document."""
        self.page.texte(x, self._base(haut, CORPS_ETIQUETTE, 1.0),
                        texte.upper(), self.grasse, CORPS_ETIQUETTE,
                        ETIQUETTE, ECART_ETIQUETTE)

    def somme(self, x, ligne_de_base, valeur, corps, part_devise=PART_DEVISE,
              ecart_devise=ECART_DEVISE):
        """Le montant, tranche par tranche.

        Aucune espace n'est employée comme séparateur : l'écart est une
        fraction du corps, donc identique à 74 pt et à 17 pt.
        """
        entier, _, decimales = formater_montant(valeur).partition(",")
        for i, tranche in enumerate(entier.split(" ")):
            if i:
                x += TRANCHE * corps
            x += self.page.texte(x, ligne_de_base, tranche, self.grasse,
                                 corps, ENCRE, ECART_SOMME)
        if decimales:
            x += 0.02 * corps
            x += self.page.texte(x, ligne_de_base, "," + decimales,
                                 self.grasse, corps, ENCRE, ECART_SOMME)
        corps_devise = part_devise * corps
        x += ecart_devise * corps_devise
        x += self.page.texte(x, ligne_de_base, "FCFA", self.grasse,
                             corps_devise, SECOND, -0.01)
        return x

    def partie(self, x, haut, etiquette, nom, numero):
        """Une colonne « DE » ou « À » : l'étiquette, le nom, le numéro."""
        self.etiquette(x, haut, etiquette)
        haut += CORPS_ETIQUETTE + 6 * MM
        self.page.texte(x, self._base(haut, CORPS_NOM, 1.18), nom or "—",
                        self.grasse, CORPS_NOM, ENCRE, ECART_NOM)
        haut += self._hauteur(CORPS_NOM, 1.18) + 3 * MM
        self.page.texte(x, self._base(haut, CORPS_NUM), numero_lisible(numero),
                        self.normale, CORPS_NUM, SECOND, SUIVI)

    HAUTEUR_PARTIE = (CORPS_ETIQUETTE + 6 * MM + CORPS_NOM * 1.18 + 3 * MM
                      + CORPS_NUM * 1.302)

    # -- zone 2 : ce qui s'est passé ----------------------------------------
    def centre(self, bas, etiquette_somme, valeur, parties):
        """Le montant à gauche, les parties à droite, chacun centré dans la
        bande qui reste entre l'en-tête et le bandeau des preuves."""
        interieur_haut = self.bas_entete + 14 * MM
        interieur_bas = bas - 14 * MM
        milieu = (interieur_haut + interieur_bas) / 2

        hauteur_somme = CORPS_ETIQUETTE + 6 * MM + CORPS_SOMME
        haut = milieu - hauteur_somme / 2
        self.etiquette(GAUCHE, haut, etiquette_somme)
        self.somme(GAUCHE,
                   self._base(haut + CORPS_ETIQUETTE + 6 * MM, CORPS_SOMME, 1.0),
                   valeur, CORPS_SOMME)

        largeur_somme = UTILE * 0.42
        x = GAUCHE + largeur_somme + 24 * MM
        colonne = (UTILE - largeur_somme - 24 * MM - 20 * MM) / 2
        haut = milieu - self.HAUTEUR_PARTIE / 2
        for i, (nom_colonne, nom, numero) in enumerate(parties):
            self.partie(x + i * (colonne + 20 * MM), haut, nom_colonne,
                        nom, numero)

    # -- zone 3 : les preuves ------------------------------------------------
    def preuves(self, colonnes):
        """Le bandeau sable, calé sur le bas de page. Renvoie son sommet.

        `colonnes` : (étiquette, valeurs, poids). Une valeur est une chaîne, ou
        un nombre — auquel cas elle est composée comme un montant.

        L'étiquette réserve deux lignes : les valeurs s'alignent, qu'elle
        tienne sur une ligne ou sur deux.
        """
        interieur_h, interieur_v, ecart = 13 * MM, 11 * MM, 12 * MM
        disponible = UTILE - 2 * interieur_h - ecart * (len(colonnes) - 1)
        poids_total = sum(poids for _, _, poids in colonnes)
        largeurs = [poids / poids_total * disponible for _, _, poids in colonnes]

        decoupees = [self._decouper(nom, largeur)
                     for (nom, _, _), largeur in zip(colonnes, largeurs)]
        lignes_etiquette = max(2, max(len(d) for d in decoupees))
        hauteur_etiquette = lignes_etiquette * self._hauteur(CORPS_ETIQUETTE, 1.32)
        lignes_valeur = max(len(v) for _, v, _ in colonnes)
        hauteur = (2 * interieur_v + hauteur_etiquette + 2 * MM
                   + lignes_valeur * self._hauteur(CORPS_PREUVE, 1.28))

        bas = HAUTEUR - MARGE_V - self._hauteur(CORPS_PIED) - 9 * MM
        haut = bas - hauteur
        self.page.rectangle(GAUCHE, haut, UTILE, hauteur, SABLE, rayon=4 * MM)

        x = GAUCHE + interieur_h
        for (_, valeurs, _), largeur, morceaux in zip(colonnes, largeurs, decoupees):
            y = haut + interieur_v
            for morceau in morceaux:
                self.etiquette(x, y, morceau)
                y += self._hauteur(CORPS_ETIQUETTE, 1.32)
            y = haut + interieur_v + hauteur_etiquette + 2 * MM
            for valeur in valeurs:
                base = self._base(y, CORPS_PREUVE, 1.28)
                if isinstance(valeur, str):
                    self.page.texte(x, base, valeur, self.grasse,
                                    CORPS_PREUVE, ENCRE, -0.02)
                else:
                    self.somme(x, base, valeur, CORPS_PREUVE,
                               part_devise=0.66, ecart_devise=0.3)
                y += self._hauteur(CORPS_PREUVE, 1.28)
            x += largeur + ecart
        return haut

    def _decouper(self, etiquette, largeur):
        """Coupe une étiquette trop longue pour sa colonne, comme le ferait un
        navigateur : au mot, jamais au milieu."""
        lignes, courante = [], ""
        for mot in etiquette.upper().split():
            essai = f"{courante} {mot}".strip()
            if courante and self.grasse.largeur(
                    essai, CORPS_ETIQUETTE, ECART_ETIQUETTE) > largeur:
                lignes.append(courante)
                courante = mot
            else:
                courante = essai
        if courante:
            lignes.append(courante)
        return lignes or [""]

    def pied(self):
        base = self._base(HAUTEUR - MARGE_V - self._hauteur(CORPS_PIED),
                          CORPS_PIED)
        self.page.texte(GAUCHE, base, f"{self.operateur} · Douala, Cameroun",
                        self.normale, CORPS_PIED, ETIQUETTE, SUIVI)

    def octets(self):
        return Document(self.page).octets()


# --- Les deux documents -----------------------------------------------------

ETIQUETTES_SOMME = {"entree": "Montant reçu", "sortie": "Montant envoyé"}


def recu_transfert(paiement, numero, quand, operateur="Orange Money"):
    """Le reçu d'une opération réussie.

    `quand` : la date de l'opération. Le SMS d'Orange ne l'écrit pas en toutes
    lettres ; c'est l'heure de réception par le terminal qui fait foi.

    Quand le sens n'est pas connu — le SMS nomme les deux parties sans dire
    laquelle est la nôtre — l'étiquette devient « Montant net », le terme
    qu'emploie Orange lui-même. Écrire « Montant reçu » sur un envoi ferait du
    reçu un faux document.
    """
    gabarit = Gabarit("Reçu de transfert", numero, operateur)

    preuves = [("ID transaction", [paiement.reference or "—"], 2.2),
               ("Date", [date_en_lettres(quand), heure_en_lettres(quand)], 1.3)]
    if paiement.montant_brut is not None:
        preuves.append(("Montant transaction", [paiement.montant_brut], 1.5))
    if paiement.frais is not None:
        preuves.append(("Frais", [paiement.frais], 1))
    if paiement.commission is not None:
        preuves.append(("Commission", [paiement.commission], 1))
    haut = gabarit.preuves(preuves)

    emetteur = paiement.emetteur
    beneficiaire = paiement.beneficiaire
    if emetteur is None or beneficiaire is None:
        # Les formes plus anciennes ne nomment qu'un seul tiers : on met le
        # compte en face, sans inventer l'autre côté.
        connu = ("De", paiement.nom, paiement.numero)
        parties = [connu, ("À", None, None)]
    else:
        parties = [("De", emetteur.nom, emetteur.numero),
                   ("À", beneficiaire.nom, beneficiaire.numero)]

    gabarit.centre(haut, ETIQUETTES_SOMME.get(paiement.sens, "Montant net"),
                   paiement.montant, parties)
    gabarit.pied()
    return gabarit.octets()


def recu_solde(solde, compte, numero_ligne, numero, quand,
               operateur="Orange Money"):
    """Le reçu d'une interrogation de solde.

    Le SMS ne porte ni référence ni horodatage : la seule date honnête est
    celle de sa réception, et c'est ce que dit l'étiquette.
    """
    gabarit = Gabarit("Reçu de solde", numero, operateur)
    haut = gabarit.preuves([
        ("Opérateur", [operateur], 1.4),
        ("Date du relevé", [date_en_lettres(quand)], 1.4),
        ("Heure du relevé", [heure_en_lettres(quand)], 1),
    ])
    gabarit.centre(haut, "Solde du compte", solde,
                   [("Compte", compte, numero_ligne)])
    gabarit.pied()
    return gabarit.octets()


__all__ = ["numero_de_recu", "recu_solde", "recu_transfert"]
