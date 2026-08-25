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
from .textes import langue_active, normaliser, t

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
CORPS_ETIQUETTE, ECART_ETIQUETTE = 13, 0.20
CORPS_MOT, ECART_MOT = 30, 0.18
CORPS_TYPE = 20
CORPS_NUMERO = 13
CORPS_SOMME, ECART_SOMME = 88, -0.04
CORPS_NOM, ECART_NOM = 27, -0.025
CORPS_NUM = 21
# L'identifiant de transaction est ce qu'on QUOTE au guichet quand une
# opération est contestée. Composé au corps d'une mention de bas de page, il
# obligeait à plisser les yeux : il se lit maintenant d'un coup d'œil.
CORPS_PREUVE = 26
CORPS_PIED = 13
SUIVI = -0.011                 # l'interlettrage général du document

TRANCHE = 0.22                 # écart entre tranches de trois chiffres, en em
PART_DEVISE, ECART_DEVISE = 0.42, 0.34

COTE_SYMBOLE = 78 * 0.75       # les 78 px de la maquette, en points
COTE_MARQUE = 34               # la hauteur de la marque du réseau, en tête
# Un nom de deux mots tient sur une ligne, trois se replient. Au-delà, on
# rétrécit plutôt que d'empiler : le bloc doit rester centré sur la page.
LIGNES_NOM = 2

# Le document est bilingue : anglais par défaut, français au choix. Chaque
# fonction accepte `langue=None` et retombe alors sur la langue active — les
# appelants n'ont rien à passer.
MOIS = {
    "en": ["January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"],
    "fr": ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
           "août", "septembre", "octobre", "novembre", "décembre"],
}


def _langue_choisie(langue):
    return normaliser(langue) if langue else langue_active()


def date_en_lettres(quand, langue=None):
    """« 5 August 2026 » en anglais, « 5 août 2026 » en français."""
    choisie = _langue_choisie(langue)
    return f"{quand.day} {MOIS[choisie][quand.month - 1]} {quand.year}"


def heure_en_lettres(quand, langue=None, secondes=False):
    """« 13:19 » en anglais, « 13 h 19 » en français.

    `secondes` : l'heure À LA SECONDE — « 13:55:27 », « 13 h 55 min 27 s ».
    Elle ne se donne que lorsque le RÉSEAU l'a écrite : c'est l'instant qui
    figurera sur son relevé, et on le recopie tel qu'il l'a donné. L'heure de
    réception du SMS, elle, n'a pas cette précision — la seconde où le
    message est arrivé ne prouve rien et ferait croire à une exactitude
    qu'on n'a pas.
    """
    choisie = _langue_choisie(langue)
    if choisie == "en":
        court = f"{quand.hour}:{quand.minute:02d}"
        return f"{court}:{quand.second:02d}" if secondes else court
    court = f"{quand.hour} h {quand.minute:02d}"
    return f"{court} min {quand.second:02d} s" if secondes else court


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
    """« 696103864 » → « 696 103 864 » : un numéro se lit par tranches.

    MTN écrit les siens au format international, indicatif compris —
    « 237681026861 ». Douze chiffres d'affilée sur un reçu ne se relisent
    pas : l'indicatif se détache, le reste se découpe comme un numéro local.
    """
    chiffres = "".join(c for c in (numero or "") if c.isdigit())
    if len(chiffres) == 12 and chiffres.startswith("237"):
        reste = chiffres[3:]
        return f"+237 {reste[:3]} {reste[3:6]} {reste[6:]}"
    return (f"{chiffres[:3]} {chiffres[3:6]} {chiffres[6:]}"
            if len(chiffres) == 9 else (numero or ""))


class Gabarit:
    """Le squelette commun aux deux reçus.

    Toutes les positions sont en points, mesurées depuis le haut de la page —
    on transcrit une maquette, qui se lit de haut en bas.
    """

    def __init__(self, type_document, numero, operateur="Orange Money",
                 langue=None):
        self.page = Page(LARGEUR, HAUTEUR)
        self.normale = Police(os.path.join(POLICES, "dmsans-400.ttf"), "DMSans")
        self.grasse = Police(os.path.join(POLICES, "dmsans-700.ttf"),
                             "DMSansGras")
        self.operateur = operateur
        self.langue = _langue_choisie(langue)
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

    # -- rien ne dépasse -----------------------------------------------------
    # La maquette a été dessinée sur « PRIX MONO SARL » et « WONDER PHONE ».
    # Un vrai nom camerounais fait volontiers trois mots — « NKENGAFAC
    # MARICOLE NGWA » — et sortait de la page. Le navigateur repliait tout
    # seul ; ici, il faut le faire soi-même, et le faire partout.

    def _replier(self, texte, police, corps, largeur, interlettrage=0.0,
                 lignes_max=2):
        """Coupe au mot pour tenir dans `largeur`, comme un navigateur.

        Un mot seul plus large que sa colonne ne se coupe pas : on le rend tel
        quel, et l'appelant réduira le corps. Mieux vaut un nom plus petit
        qu'un nom tronqué — sur un reçu, c'est une identité.
        """
        mots = (texte or "").split()
        if not mots:
            return [""]
        lignes, courante = [], ""
        for mot in mots:
            essai = f"{courante} {mot}".strip()
            if courante and police.largeur(essai, corps, interlettrage) > largeur:
                lignes.append(courante)
                courante = mot
            else:
                courante = essai
        lignes.append(courante)
        if len(lignes) <= lignes_max:
            return lignes
        # Trop de lignes : on regroupe le reste sur la dernière, elle sera
        # rétrécie pour tenir.
        return lignes[:lignes_max - 1] + [" ".join(lignes[lignes_max - 1:])]

    def _corps_ajuste(self, texte, police, corps, largeur, interlettrage=0.0):
        """Le corps le plus grand qui tienne dans `largeur`.

        La largeur d'un texte est proportionnelle à son corps : une règle de
        trois suffit, et elle est exacte. Aucun plancher — un texte qui
        déborde de la page est pire qu'un texte petit.
        """
        mesure = police.largeur(texte, corps, interlettrage)
        if mesure <= largeur or mesure <= 0:
            return corps
        return corps * largeur / mesure

    def _bloc_nom(self, texte, largeur):
        """Le nom d'une partie : ses lignes, et le corps qui les fait tenir.

        On replie d'abord, on rétrécit ensuite, puis on replie de nouveau : à
        un corps plus petit, la coupure au mot ne tombe plus au même endroit,
        et le résultat est plus régulier qu'un simple écrasement.
        """
        corps = CORPS_NOM
        for _ in range(12):
            lignes = self._replier(texte, self.grasse, corps, largeur,
                                   ECART_NOM, LIGNES_NOM)
            trop_large = max(
                (self.grasse.largeur(l, corps, ECART_NOM) for l in lignes),
                default=0)
            if trop_large <= largeur:
                return lignes, corps
            corps *= max(0.9, largeur / trop_large)
        return lignes, corps

    def _poser_ajuste(self, x, ligne_de_base, texte, police, corps, teinte,
                      largeur, interlettrage=0.0):
        """Pose un texte en le rétrécissant juste ce qu'il faut."""
        reduit = self._corps_ajuste(texte, police, corps, largeur, interlettrage)
        return self.page.texte(x, ligne_de_base, texte, police, reduit, teinte,
                               interlettrage)

    # -- zone 1 : qui émet le reçu ------------------------------------------
    def _entete(self, type_document, numero):
        """Deux signatures, une de chaque côté.

        À gauche, QUI fabrique le document : le symbole et le mot TOTEM.
        À droite, POUR QUEL RÉSEAU, puis quel document et sous quel numéro.

        La marque du réseau était reléguée en bas de page, haute de onze
        points, à côté d'une mention de lieu. Sur un reçu qu'on tend à un
        client, le réseau est la première chose qu'on cherche : elle monte
        donc en tête, à une taille où elle se reconnaît sans se lire.
        """
        haut = MARGE_V
        poser(self.page, GAUCHE, haut, COTE_SYMBOLE, LATERITE)

        # Le mot est centré sur le symbole : boîte de ligne haute d'un corps,
        # centrée dans le carré de 78 px.
        boite_mot = haut + (COTE_SYMBOLE - CORPS_MOT) / 2
        self.page.texte(GAUCHE + COTE_SYMBOLE + 7 * MM,
                        self._base(boite_mot, CORPS_MOT, 1.0), "TOTEM",
                        self.grasse, CORPS_MOT, ENCRE, ECART_MOT)

        # À droite, la pile : le réseau, le type de document, son numéro —
        # calée sur le bas du symbole, pour que les deux côtés s'assoient sur
        # la même ligne.
        bas = haut + COTE_SYMBOLE
        haut_numero = bas - self._hauteur(CORPS_NUMERO)
        self._a_droite(f"N° {numero}", self._base(haut_numero, CORPS_NUMERO),
                       self.normale, CORPS_NUMERO, ETIQUETTE)
        haut_type = haut_numero - 2.5 * MM - self._hauteur(CORPS_TYPE, 1.1)
        self._a_droite(type_document, self._base(haut_type, CORPS_TYPE, 1.1),
                       self.grasse, CORPS_TYPE, ENCRE, -0.02)
        haut_reseau = haut_type - 4 * MM - COTE_MARQUE
        self._reseau_a_droite(haut_reseau, COTE_MARQUE)

        self.page.filet(GAUCHE, bas + 9 * MM, UTILE, FILET)
        return bas + 9 * MM

    def _reseau_a_droite(self, haut, cote):
        """La marque du réseau, alignée sur la marge droite.

        LA MARQUE SEULE. Elle portait son nom écrit à côté — « MTN MoMo »,
        « Orange Money » — ce qui revenait à légender un logo : on ne met pas
        « MTN » sous le logo de MTN. Un réseau se reconnaît, il ne se lit pas.

        Un opérateur dont la marque n'est pas connue garde son nom écrit :
        mieux vaut un mot qu'un blanc, et le document doit toujours dire de
        quel réseau il parle.
        """
        largeur = self._largeur_marque(cote)
        if largeur:
            self._marque_reseau(DROITE - largeur, haut, cote)
            return
        nom = self.operateur or ""
        corps = cote * 0.52
        self.page.texte(DROITE - self.grasse.largeur(nom, corps, SUIVI),
                        self._base(haut + (cote - self._hauteur(corps)) / 2,
                                   corps),
                        nom, self.grasse, corps, ENCRE, SUIVI)

    def _a_droite(self, texte, ligne_de_base, police, corps, teinte,
                  interlettrage=SUIVI, largeur_max=None):
        corps = self._corps_ajuste(texte, police, corps,
                                   largeur_max or UTILE / 2, interlettrage)
        largeur = police.largeur(texte, corps, interlettrage)
        self.page.texte(DROITE - largeur, ligne_de_base, texte, police, corps,
                        teinte, interlettrage)

    # -- briques communes ----------------------------------------------------
    def etiquette(self, x, haut, texte):
        """Les petites capitales espacées. Même langue dans tout le document."""
        self.page.texte(x, self._base(haut, CORPS_ETIQUETTE, 1.0),
                        texte.upper(), self.grasse, CORPS_ETIQUETTE,
                        ETIQUETTE, ECART_ETIQUETTE)

    def _decomposer_montant(self, valeur):
        """Les tranches de milliers, les décimales, et leur séparateur.

        `formater_montant` suit la langue : « 2,784,137.6 » en anglais,
        « 2 784 137,6 » en français. Le séparateur de milliers est aussitôt
        retiré — les tranches se posent une à une, l'écart est une fraction
        du corps — mais celui des décimales reste imprimé : point en anglais,
        virgule en français.
        """
        if self.langue == "en":
            entier, _, decimales = formater_montant(valeur, "en").partition(".")
            return entier.split(","), decimales, "."
        entier, _, decimales = formater_montant(valeur, "fr").partition(",")
        return entier.split(" "), decimales, ","

    def _largeur_somme(self, valeur, corps, part_devise, ecart_devise):
        """Ce que le montant occupera, devise comprise. Tout y est
        proportionnel au corps : la largeur l'est donc aussi, et il suffit
        d'une règle de trois pour le faire tenir."""
        tranches, decimales, separateur = self._decomposer_montant(valeur)
        large = sum(self.grasse.largeur(morceau, corps, ECART_SOMME)
                    for morceau in tranches)
        large += TRANCHE * corps * (len(tranches) - 1)
        if decimales:
            large += (0.02 * corps
                      + self.grasse.largeur(separateur + decimales, corps,
                                            ECART_SOMME))
        corps_devise = part_devise * corps
        return (large + ecart_devise * corps_devise
                + self.grasse.largeur("FCFA", corps_devise, -0.01))

    def somme(self, x, ligne_de_base, valeur, corps, part_devise=PART_DEVISE,
              ecart_devise=ECART_DEVISE, largeur_max=None):
        """Le montant, tranche par tranche.

        Aucune espace n'est employée comme séparateur : l'écart est une
        fraction du corps, donc identique à 74 pt et à 17 pt.

        `largeur_max` : un solde à huit chiffres et une décimale est bien plus
        large que les « 184 137 » de la maquette. Le corps se réduit alors
        juste ce qu'il faut, sans que rien d'autre ne bouge.
        """
        if largeur_max:
            mesure = self._largeur_somme(valeur, corps, part_devise, ecart_devise)
            if mesure > largeur_max:
                corps = corps * largeur_max / mesure
        tranches, decimales, separateur = self._decomposer_montant(valeur)
        for i, tranche in enumerate(tranches):
            if i:
                x += TRANCHE * corps
            x += self.page.texte(x, ligne_de_base, tranche, self.grasse,
                                 corps, ENCRE, ECART_SOMME)
        if decimales:
            x += 0.02 * corps
            x += self.page.texte(x, ligne_de_base, separateur + decimales,
                                 self.grasse, corps, ENCRE, ECART_SOMME)
        corps_devise = part_devise * corps
        x += ecart_devise * corps_devise
        x += self.page.texte(x, ligne_de_base, "FCFA", self.grasse,
                             corps_devise, SECOND, -0.01)
        return x

    def partie(self, x, haut, etiquette, lignes, numero, place_nom,
               largeur, corps_nom=CORPS_NOM):
        """Une colonne « DE » ou « À » : l'étiquette, le nom, le numéro.

        `place_nom` : la hauteur réservée au nom. Elle est la même pour les
        deux colonnes, sans quoi un nom replié sur deux lignes ferait
        descendre son numéro et pas celui d'en face.
        """
        self.etiquette(x, haut, etiquette)
        haut += CORPS_ETIQUETTE + 6 * MM
        y = haut
        for morceau in lignes:
            # Un nom d'un seul tenant plus large que la colonne ne se coupe
            # pas au mot : il se rétrécit. Tronquer une identité sur un reçu
            # serait pire que de l'écrire un peu plus petit.
            self._poser_ajuste(x, self._base(y, corps_nom, 1.18), morceau,
                               self.grasse, corps_nom, ENCRE, largeur, ECART_NOM)
            y += self._hauteur(corps_nom, 1.18)
        haut += place_nom + 3 * MM
        self._poser_ajuste(x, self._base(haut, CORPS_NUM),
                           numero_lisible(numero), self.normale, CORPS_NUM,
                           SECOND, largeur, SUIVI)

    # -- zone 2 : ce qui s'est passé ----------------------------------------
    def centre(self, bas, etiquette_somme, valeur, parties):
        """Le montant à gauche, les parties à droite, chacun centré dans la
        bande qui reste entre l'en-tête et le bandeau des preuves.

        Rien ne dépasse : les noms se replient au mot, comme le ferait un
        navigateur, et le montant se réduit s'il est trop large. Un document
        dont le texte sort de la page n'est pas présentable à un client.
        """
        interieur_haut = self.bas_entete + 14 * MM
        interieur_bas = bas - 14 * MM
        milieu = (interieur_haut + interieur_bas) / 2

        largeur_somme = UTILE * 0.42
        colonne = (UTILE - largeur_somme - 24 * MM - 20 * MM) / 2

        # On replie d'abord, on positionne ensuite : la hauteur du bloc dépend
        # du nombre de lignes, et le centrage dépend de la hauteur.
        blocs = [self._bloc_nom(nom or "—", colonne) for _, nom, _ in parties]
        # Le plus petit corps l'emporte pour les deux colonnes : « DE » et
        # « À » se lisent ensemble, ils ne peuvent pas avoir deux tailles.
        corps_nom = min((c for _, c in blocs), default=CORPS_NOM)
        replis = [self._replier(nom or "—", self.grasse, corps_nom, colonne,
                                ECART_NOM, LIGNES_NOM)
                  for _, nom, _ in parties]
        lignes_nom = max((len(l) for l in replis), default=1)
        place_nom = lignes_nom * self._hauteur(corps_nom, 1.18)
        hauteur_partie = (CORPS_ETIQUETTE + 6 * MM + place_nom + 3 * MM
                          + self._hauteur(CORPS_NUM))

        hauteur_somme = CORPS_ETIQUETTE + 6 * MM + CORPS_SOMME
        haut = milieu - hauteur_somme / 2
        self.etiquette(GAUCHE, haut, etiquette_somme)
        self.somme(GAUCHE,
                   self._base(haut + CORPS_ETIQUETTE + 6 * MM, CORPS_SOMME, 1.0),
                   valeur, CORPS_SOMME, largeur_max=largeur_somme)

        x = GAUCHE + largeur_somme + 24 * MM
        haut = milieu - hauteur_partie / 2
        for i, ((nom_colonne, _, numero), lignes) in enumerate(
                zip(parties, replis)):
            self.partie(x + i * (colonne + 20 * MM), haut, nom_colonne,
                        lignes, numero, place_nom, colonne, corps_nom)

    # -- zone 3 : les preuves ------------------------------------------------
    def preuves(self, colonnes):
        """Le bandeau sable, calé sur le bas de page. Renvoie son sommet.

        `colonnes` : (étiquette, valeurs, poids). Une valeur est une chaîne, ou
        un nombre — auquel cas elle est composée comme un montant.

        L'étiquette réserve deux lignes : les valeurs s'alignent, qu'elle
        tienne sur une ligne ou sur deux.
        """
        interieur_h, interieur_v, ecart = 13 * MM, 11 * MM, 12 * MM
        # Les colonnes ne s'étirent pas sur toute la largeur quand elles sont
        # peu nombreuses : deux preuves écartées d'un demi-mètre ne se lisent
        # plus ensemble. Elles se serrent à gauche, et le bandeau garde sa
        # pleine largeur — c'est un aplat, pas un tableau.
        largeur_max = UTILE - 2 * interieur_h
        disponible = (largeur_max - ecart * (len(colonnes) - 1)) * min(
            1.0, (len(colonnes) + 1) / 5)
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
                    self._poser_ajuste(x, base, valeur, self.grasse,
                                       CORPS_PREUVE, ENCRE, largeur, -0.02)
                else:
                    self.somme(x, base, valeur, CORPS_PREUVE,
                               part_devise=0.66, ecart_devise=0.3,
                               largeur_max=largeur)
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

    # -- la marque du réseau -------------------------------------------------
    # Le nom du service ne suffit pas : sur un reçu qu'on montre, la marque se
    # RECONNAÎT avant de se lire. On la dessine — jamais une image
    # téléchargée : le carré d'Orange, l'ovale de MTN, aux couleurs publiées.
    # Un opérateur sans marque garde son nom écrit, comme partout ailleurs.
    # (fond, encre, mot, largeur/hauteur, rayon des coins — None : pilule)
    #
    # Les proportions sont celles des marques publiées : le carré plein
    # d'Orange, aux coins à peine cassés ; le rectangle très arrondi de MTN,
    # une fois et demie plus large que haut.
    MARQUES = {
        "orange": ("#ff7900", "#ffffff", "orange", 1.0, 2.0),
        "mtn": ("#ffcb05", "#000000", "MTN", 1.55, None),
    }

    def _largeur_marque(self, cote):
        """Ce que la marque occupera, sans rien dessiner — zéro si le réseau
        n'a pas de marque connue."""
        nom = (self.operateur or "").strip().lower()
        for prefixe, (_f, _e, _m, ratio, _r) in self.MARQUES.items():
            if nom.startswith(prefixe):
                return cote * ratio
        return 0

    def _marque_reseau(self, x, haut, cote=12):
        """Dépose la marque, coin haut gauche en (x, haut). Renvoie la largeur
        occupée — zéro quand l'opérateur n'a pas de marque connue."""
        nom = (self.operateur or "").strip().lower()
        for prefixe, (fond, encre, mot, ratio, rayon) in self.MARQUES.items():
            if not nom.startswith(prefixe):
                continue
            largeur = cote * ratio
            arrondi = cote / 2 if rayon is None else rayon
            self.page.rectangle(x, haut, largeur, cote, fond, rayon=arrondi)
            # Le mot tient TOUJOURS dans sa boîte : on rétrécit s'il le faut,
            # plutôt que de le laisser mordre sur le bord.
            corps = cote * 0.56 if ratio > 1 else cote * 0.34
            place = largeur - cote * 0.30
            mesure = self.grasse.largeur(mot, corps, SUIVI)
            if mesure > place:
                corps *= place / mesure
                mesure = self.grasse.largeur(mot, corps, SUIVI)
            self.page.texte(x + (largeur - mesure) / 2,
                            self._base(haut + (cote - self._hauteur(corps)) / 2,
                                       corps),
                            mot, self.grasse, corps, encre, SUIVI)
            return largeur
        return 0

    def pied(self):
        """Le lieu, et rien d'autre.

        Le réseau signait ici, tout petit. Il signe désormais en tête : le
        répéter en bas de page ferait deux fois la même chose, moins bien.
        """
        haut = HAUTEUR - MARGE_V - self._hauteur(CORPS_PIED)
        self.page.texte(GAUCHE, self._base(haut, CORPS_PIED),
                        t("Douala, Cameroon", "Douala, Cameroun", self.langue),
                        self.normale, CORPS_PIED, ETIQUETTE, SUIVI)

    def debordements(self, tolerance=0.5):
        """Les textes qui sortent des marges. Vide, toujours — c'est le
        contrat. Un reçu dont un nom mord sur le bord n'est pas présentable."""
        return [(contenu, gauche, droite)
                for gauche, droite, contenu in self.page.empreintes
                if gauche < GAUCHE - tolerance or droite > DROITE + tolerance]

    def octets(self):
        return Document(self.page).octets()


# --- Les deux documents -----------------------------------------------------

# L'étiquette au-dessus du gros montant, selon le sens de l'opération. Les
# deux langues vivent côte à côte : (anglais, français).
ETIQUETTES_SOMME = {"entree": ("Amount received", "Montant reçu"),
                    "sortie": ("Amount sent", "Montant envoyé")}
SOMME_SANS_SENS = ("Net amount", "Montant net")


def etiquette_somme(sens, langue=None):
    """« Amount received / sent », « Montant reçu / envoyé » — et quand le
    sens n'est pas connu, « Net amount / Montant net », le terme qu'emploie
    Orange lui-même."""
    en, fr = ETIQUETTES_SOMME.get(sens, SOMME_SANS_SENS)
    return t(en, fr, langue)


def recu_transfert(paiement, numero, quand, operateur="Orange Money",
                   titre=None, langue=None, compte=None):
    """Le reçu d'une opération réussie.

    `quand` : la date de l'opération. Le SMS d'Orange ne l'écrit pas en toutes
    lettres ; c'est l'heure de réception par le terminal qui fait foi.

    `titre` : « Transfer receipt / Reçu de transfert » par défaut, mais
    l'appelant passe « Deposit receipt / Reçu de dépôt » ou « Withdrawal
    receipt / Reçu de retrait » quand le SMS dit qu'il s'agit de l'un ou de
    l'autre — le document nomme alors l'opération telle qu'elle est.

    `langue` : « en » ou « fr » ; sans elle, la langue active du robot.

    `compte` : (nom, numéro) de NOTRE côté — le nom et le numéro inscrits aux
    Réglages pour la carte qui a reçu le SMS. Sans lui, notre colonne reste
    vide, mais elle reste à sa place.

    Quand le sens n'est pas connu — le SMS nomme les deux parties sans dire
    laquelle est la nôtre — l'étiquette devient « Net amount / Montant net »,
    le terme qu'emploie Orange lui-même. Écrire « Montant reçu » sur un envoi
    ferait du reçu un faux document.
    """
    langue = _langue_choisie(langue)
    gabarit = Gabarit(titre or t("Transfer receipt", "Reçu de transfert",
                                 langue),
                      numero, operateur, langue)

    # L'heure à la seconde quand c'est le RÉSEAU qui l'a écrite — MTN la
    # donne — et à la minute quand elle vient de la réception du SMS.
    preuves = [(t("Transaction ID", "ID transaction", langue),
                [paiement.reference or "—"], 2.2),
               (t("Date", "Date", langue),
                [date_en_lettres(quand, langue),
                 heure_en_lettres(quand, langue,
                                  secondes=paiement.quand is not None)], 1.3)]
    if paiement.montant_brut is not None:
        preuves.append((t("Transaction amount", "Montant transaction", langue),
                        [paiement.montant_brut], 1.5))
    if paiement.frais is not None:
        preuves.append((t("Fees", "Frais", langue), [paiement.frais], 1))
    if paiement.commission is not None:
        preuves.append((t("Commission", "Commission", langue),
                        [paiement.commission], 1))
    haut = gabarit.preuves(preuves)

    de, a = t("From", "De", langue), t("To", "À", langue)
    parties = _de_et_a(paiement, compte, de, a)

    # LE SOLDE N'EST PAS SUR LE REÇU, et ce n'est pas un oubli.
    #
    # MTN l'écrit à chaque message, et il serait facile de l'ajouter. Mais un
    # reçu se tend à un client : il n'a pas à y lire la caisse de l'agent.
    # Le solde se lit sur l'accueil, sur le reçu de solde, dans le bilan —
    # partout où c'est le propriétaire qui regarde.
    gabarit.centre(haut, etiquette_somme(paiement.sens, langue),
                   paiement.montant, parties)
    gabarit.pied()
    return gabarit.octets()


def _de_et_a(paiement, compte, de, a):
    """Qui envoie, qui reçoit — dans le bon sens, toujours.

    Un SMS MTN ne nomme qu'UN tiers : « to PAYSELA (…) from your mobile money
    account », « from BABY FRANCIS (…) on your mobile money account ». L'autre
    côté, c'est nous — le message ne le nomme pas, il n'a pas à le faire.

    L'ancienne règle mettait ce tiers unique en « De », quel que soit le sens.
    Sur un envoi, le reçu annonçait donc que le bénéficiaire était l'émetteur,
    et laissait « À » vide : le document disait le contraire de l'opération.

    Le sens décide, et lui seul. Notre identité vient des Réglages ; si elle
    manque, notre colonne reste vide — mais du bon côté.
    """
    emetteur, beneficiaire = paiement.emetteur, paiement.beneficiaire
    if emetteur is not None and beneficiaire is not None:
        return [(de, emetteur.nom, emetteur.numero),
                (a, beneficiaire.nom, beneficiaire.numero)]

    tiers = (paiement.nom, paiement.numero)
    nous = compte if compte and (compte[0] or compte[1]) else (None, None)
    if paiement.sens == "sortie":
        return [(de, *nous), (a, *tiers)]
    if paiement.sens == "entree":
        return [(de, *tiers), (a, *nous)]
    # Sens inconnu : on ne choisit pas de camp. Le tiers est nommé, notre
    # côté reste vide — comme avant, et pour la même raison.
    return [(de, *tiers), (a, None, None)]


def recu_solde(solde, compte, numero_ligne, numero, quand,
               operateur="Orange Money", langue=None):
    """Le reçu d'une interrogation de solde.

    Le SMS ne porte ni référence ni horodatage : la seule date honnête est
    celle de sa réception, et c'est ce que dit l'étiquette.

    `langue` : « en » ou « fr » ; sans elle, la langue active du robot.
    """
    langue = _langue_choisie(langue)
    gabarit = Gabarit(t("Balance receipt", "Reçu de solde", langue),
                      numero, operateur, langue)
    haut = gabarit.preuves([
        (t("Operator", "Opérateur", langue), [operateur], 1.4),
        (t("Statement date", "Date du relevé", langue),
         [date_en_lettres(quand, langue)], 1.4),
        (t("Statement time", "Heure du relevé", langue),
         [heure_en_lettres(quand, langue)], 1),
    ])
    gabarit.centre(haut, t("Account balance", "Solde du compte", langue),
                   solde, [(t("Account", "Compte", langue),
                            compte, numero_ligne)])
    gabarit.pied()
    return gabarit.octets()


__all__ = ["etiquette_somme", "numero_de_recu", "numero_lisible",
           "recu_solde", "recu_transfert"]
