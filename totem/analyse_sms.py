# -*- coding: utf-8 -*-
"""Lecture des SMS Mobile Money : du texte brut au paiement structuré.

Le robot reçoit des phrases écrites par MTN et Orange. Pour que l'application
web puisse afficher « NGONO Marie · 25 000 FCFA · réf PP0947 », les chercher,
les additionner, il faut les comprendre.

Principes de ce fichier :

  - **Tolérance.** Les opérateurs changent leurs formulations sans prévenir,
    et les SMS arrivent parfois sans accents (contrainte GSM), avec des
    espaces insécables, ou tronqués. On reconnaît large.

  - **Prudence.** Un SMS mal compris vaut moins qu'un SMS non compris : dans
    le doute, on renvoie None et le message reste consultable en clair. On
    n'invente jamais un montant.

  - **Rien n'est perdu.** Le texte d'origine est toujours conservé à côté de
    l'analyse : c'est lui qui fait foi en cas de litige avec un client.

  - **On ne devine pas le sens.** Orange nomme les deux parties d'un transfert
    sans dire laquelle est la nôtre. Tant qu'on ne connaît pas le numéro de la
    carte, le sens reste `None` : « Montant reçu » est un mensonge si
    l'opération était un envoi.
"""

import re
import unicodedata

# --- Normalisation -------------------------------------------------------

def _sans_accents(texte):
    """« reçu » et « recu » doivent se ressembler."""
    decompose = unicodedata.normalize("NFD", texte)
    return "".join(c for c in decompose if unicodedata.category(c) != "Mn")


def _propre(texte):
    """Le message avec ses accents et ses majuscules, mais des espaces sages.

    C'est dans cette version qu'on va rechercher les noms : « PRIX MONO SARL »
    doit ressortir tel quel, pas en minuscules.
    """
    t = texte.replace(" ", " ").replace(" ", " ")   # espaces insécables
    return re.sub(r"\s+", " ", t).strip()


def _normaliser(texte):
    """Ramène le message à une forme comparable : sans accents, espaces
    ordinaires, casse basse. Le texte d'origine, lui, n'est jamais modifié."""
    return _sans_accents(_propre(texte)).lower()


def _nombre(brut):
    """« 25 000 », « 25.000 », « 25,000 » → 25000 ; « 2784137.6 » → 2784137,6.

    Le point et la virgule sont ambigus : séparateur de milliers dans
    « 1.250.000 », décimale dans « 2784137.6 ». Le nombre de chiffres qui
    suivent le **dernier** séparateur tranche : trois → des milliers, un ou
    deux → une décimale. Sans cette règle, le solde d'Orange était lu dix fois
    trop grand.

    Un montant rond reste un entier — les sommes du bilan quotidien, les
    exports et le cloud continuent de voir exactement ce qu'ils voyaient.
    """
    if not brut:
        return None
    # L'espace ne sépare jamais que des milliers ; on le retire d'office.
    t = re.sub(r"[^\d.,]", "", brut).strip(".,")
    if not t:
        return None

    entier, decimale = t, ""
    dernier = max(t.rfind("."), t.rfind(","))
    if dernier != -1 and len(t) - dernier - 1 in (1, 2):
        entier, decimale = t[:dernier], t[dernier + 1:]

    entier = re.sub(r"[.,]", "", entier)
    if not entier:
        return None
    # Un montant Mobile Money tient en une douzaine de chiffres. Au-delà, ce
    # n'est pas un montant : on refuse, plutôt que de risquer un calcul démesuré
    # (« int » et « 10 ** n » lèvent sur des milliers de chiffres — et
    # analyser() ne doit JAMAIS lever, même sur un SMS trafiqué).
    if len(entier) > 15 or len(decimale) > 6:
        return None
    valeur = int(entier)
    if decimale:
        valeur = round(valeur + int(decimale) / 10 ** len(decimale), len(decimale))
        if valeur == int(valeur):       # « 2 500,0 » est un entier déguisé
            valeur = int(valeur)
    return valeur


def formater_montant(valeur, langue=None):
    """Le montant dans la langue du moment, décimales seulement si elles
    disent quelque chose. Même règle que la maquette des reçus.

    En français : « 2 784 137,6 » (espace, virgule) — la forme camerounaise.
    En anglais :  « 2,784,137.6 » (virgule, point).
    """
    if valeur is None:
        return ""
    from .textes import langue_active, normaliser
    choisie = normaliser(langue) if langue else langue_active()
    entier = int(abs(valeur))
    reste = round(abs(valeur) - entier, 2)
    decimales = f"{reste:.2f}".split(".")[1].rstrip("0") if reste else ""
    if choisie == "en":
        corps = f"{entier:,}" + ("." + decimales if decimales else "")
    else:
        corps = f"{entier:,}".replace(",", " ")   # espace ordinaire, comme ailleurs
        corps += ("," + decimales) if decimales else ""
    return ("−" if valeur < 0 else "") + corps


def _neuf_derniers(numero):
    """Le numéro camerounais réduit à sa forme comparable : « +237696103864 »,
    « 237696103864 » et « 696103864 » désignent la même ligne."""
    chiffres = re.sub(r"\D", "", numero or "")
    return chiffres[-9:] if len(chiffres) >= 9 else chiffres


# --- Motifs --------------------------------------------------------------
# Un montant : suite de chiffres pouvant contenir séparateurs, suivie de la
# devise sous l'une de ses formes (FCFA, F CFA, XAF, CFA, F).
MONTANT = r"([\d][\d\s.,]*)\s*(?:f\s*cfa|fcfa|xaf|cfa|f\b)"

RE_RECU = re.compile(
    r"\b(?:recu|receive[sd]?|credite|cash\s*in)\b.{0,20}?" + MONTANT, re.S)
RE_ENVOYE = re.compile(
    r"\b(?:envoye|transfere|debite|paye|retire|sent|cash\s*out"
    r"|payment de|paiement de)\b.{0,20}?" + MONTANT, re.S)

# La forme d'Orange Money, relevée sur de vraies captures :
#   « Transfert de 656483918 PRIX MONO SARL vers 696103864 WONDER PHONE reussi. »
# Elle nomme les DEUX parties, avec numéro et raison sociale. Le mot de
# réussite est exigé : un transfert échoué ne doit jamais devenir un reçu.
RE_TRANSFERT = re.compile(
    r"\btransfert\s+(?:de\s+)?"
    r"(?P<num_emetteur>[+\d][\d\s]{6,20}?)\s*"
    r"(?P<nom_emetteur>[^\d\n]{0,40}?)\s*"
    r"\bvers\s+"
    r"(?P<num_benef>[+\d][\d\s]{6,20}?)\s*"
    r"(?P<nom_benef>[^\d\n]{0,40}?)\s*"
    r"\b(?:reussi|reussie|effectue|effectuee|confirme|confirmee|succes|success)\b")

# La même forme, côté anglophone — relevée sur une vraie capture (Orange,
# ligne réglée en anglais) :
#   « Successful transfer from 696413104 IBRAHIM DAHIROU to 696103864
#     WONDER PHONE. Details: Transaction ID: PP260805.1402.C55918, ... »
# Le mot de réussite vient AVANT le verbe, les parties après « from » et
# « to ». Même exigence : sans lui, pas de transfert.
RE_TRANSFERT_EN = re.compile(
    r"\b(?:successful|completed)\s+transfer\b[^\n]{0,30}?"
    r"\bfrom\s+"
    r"(?P<num_emetteur>[+\d][\d\s]{6,20}?)\s*"
    r"(?P<nom_emetteur>[^\d\n]{0,40}?)\s*"
    r"\bto\s+"
    r"(?P<num_benef>[+\d][\d\s]{6,20}?)\s*"
    r"(?P<nom_benef>[^\d\n]{0,40}?)"
    r"(?:[.,;:\n]|$)")

# Et la variante où la réussite se dit à la fin :
#   « Transfer of 50000 FCFA from 6xx to 6yy NAME successful. »
RE_TRANSFERT_EN_FIN = re.compile(
    r"\btransfer\b[^\n]{0,40}?"
    r"\bfrom\s+"
    r"(?P<num_emetteur>[+\d][\d\s]{6,20}?)\s*"
    r"(?P<nom_emetteur>[^\d\n]{0,40}?)\s*"
    r"\bto\s+"
    r"(?P<num_benef>[+\d][\d\s]{6,20}?)\s*"
    r"(?P<nom_benef>[^\d\n]{0,40}?)\s*"
    r"\b(?:successful(?:ly)?|completed|confirmed)\b")

# Les opérations d'agent (dépôt, retrait) nomment le bénéficiaire APRÈS
# « vers », le numéro D'ABORD puis la raison sociale — l'ordre inverse d'un
# reçu classique. L'émetteur, lui, apparaît parfois en fin de message :
#   « Depot de 50000 FCFA vers 690933686 NGANGOM NOUBEWE reussi from 80684177 »
#   « Retrait vers 690933686 NGANGOM NOUBEWE effectue »
# Le mot de réussite est exigé — une opération échouée n'est pas un mouvement.
# Le sens n'est pas tranché ici : preciser_sens() dira, une fois les cartes
# connues, laquelle des deux lignes est la nôtre.
RE_OPERATION = re.compile(
    r"\b(?:depot|deposit|retrait|withdrawal|transfert|transfer"
    r"|paiement|payment|envoi)\b"
    r"(?P<avant>[^\n]*?)"
    r"\b(?:vers|to)\s+"
    r"(?P<num_benef>[+\d][\d\s]{6,20}?)\s+"
    r"(?P<nom_benef>[A-Za-z][^\d\n]{0,40}?)?\s*"
    r"\b(?:reussi|reussie|effectue|effectuee|confirme|confirmee|succes"
    r"|success(?:ful(?:ly)?)?|completed)\b"
    r"(?P<apres>[^\n]*)")

# L'émetteur nommé en fin de message : « ... reussi from 80684177 ».
RE_EMETTEUR_FIN = re.compile(
    r"\b(?:from|de|par)\s+(?P<num>[+\d][\d\s]{6,20})"
    r"\s*(?P<nom>[A-Za-z][^\d\n]{0,40}?)?(?:[.,;\n]|$)")

# « de NGONO Marie (677123456) » / « de 677123456 » / « from Marie »
RE_TIERS = re.compile(
    r"\b(?:de|from|a|to|vers|chez)\s+"
    r"(?P<nom>[^().,;:\n]{2,40}?)?\s*"
    r"(?:\(\s*(?P<num1>[+\d][\d\s]{6,20})\s*\)|(?P<num2>\b[+\d][\d\s]{7,20}\b))")

# Les libellés les plus longs d'abord : « ID transaction » avant « id ».
#
# Le refus qui suit n'est pas une précaution de style. Quand la référence est
# trop courte pour le motif, l'expression recule sur l'alternative « id » et
# capture le mot « transaction » qui la suit. Deux transferts différents
# reçoivent alors la MÊME référence — or elle est unique en base : le second
# n'obtient aucun reçu, sans que rien ne le signale.
#
# Mieux vaut aucune référence qu'une fausse : le garde-fou anti-doublon
# retombe alors sur la ligne du journal, qui, elle, ne se répète jamais.
RE_REFERENCE = re.compile(
    r"\b(?:id\s*(?:de\s*)?(?:la\s*)?transaction|financial\s*transaction\s*id"
    r"|transaction\s*id|reference|ref|txn|id)\b"
    r"\s*[:.\-]?\s*"
    r"(?!transaction\b|reference\b|ref\b|id\b|txn\b)"
    r"([A-Za-z0-9][A-Za-z0-9._\-]{3,40})")

RE_SOLDE = re.compile(
    r"\b(?:nouveau\s+solde|solde(?:\s+(?:actuel|disponible))?"
    r"|new\s+balance|balance)\b"
    r"[^\d]{0,20}?" + MONTANT, re.S)

# « Le solde de votre compte est de 2784137.6FCFA. » — la phrase d'Orange
# après une interrogation USSD. Elle place vingt-cinq caractères entre le mot
# et le chiffre, bien plus que le motif ci-dessus n'en tolère. On l'accepte
# large, mais seulement dans `solde_annonce()`, qui a déjà écarté les
# paiements, les publicités et les codes.
RE_SOLDE_SEUL = re.compile(
    r"\b(?:solde|balance)\b[^\d]{0,40}?" + MONTANT, re.S)

RE_FRAIS = re.compile(
    r"\b(?:frais|fee[s]?|charge[s]?)\b[^\d]{0,20}?" + MONTANT, re.S)
RE_COMMISSION = re.compile(r"\bcommission\b[^\d]{0,20}?" + MONTANT, re.S)

# Orange détaille lui-même le brut et le net. On ne recalcule ni l'un ni
# l'autre : ce que l'opérateur annonce fait foi.
RE_MONTANT_NET = re.compile(
    r"\b(?:montant\s+net|net\s+amount)\b[^\d]{0,20}?" + MONTANT, re.S)
RE_MONTANT_BRUT = re.compile(
    r"\b(?:montant\s+(?:de\s+la\s+)?transaction"
    r"|transaction\s+amount)\b[^\d]{0,20}?" + MONTANT, re.S)
# Un champ « Montant : 50000 FCFA » isolé — dernier recours pour les dépôts
# et retraits qui ne détaillent ni « net » ni « transaction ».
RE_MONTANT_SIMPLE = re.compile(
    r"\b(?:montant|amount)\b[^\d]{0,20}?" + MONTANT, re.S)
# Un montant nu, sans mot-clé, cherché dans le seul fragment « depot de 50000
# FCFA vers … » : trop court pour contenir des frais ou un solde.
RE_MONTANT_SEUL = re.compile(MONTANT, re.S)

# Mots qui trahissent un message publicitaire ou un code de connexion : on ne
# veut surtout pas les compter comme des encaissements.
RE_BRUIT = re.compile(
    r"\b(?:promo|promotion|bonus|gagnez|felicitations|offre|forfait|"
    r"mot de passe|code de verification|otp|ne partagez|"
    # Les mêmes marqueurs, côté anglophone. Volontairement étroits : ce motif
    # REJETTE un paiement, et un mot trop large (« win » — WIN TELECOM est un
    # nom d'entreprise plausible) tuerait un vrai transfert. Les mots larges
    # vivent dans RE_PUB, qui ne sert qu'à catégoriser.
    r"congratulations|you\s+have\s+won|do\s+not\s+share|"
    r"verification\s+code|one[-\s]?time\s+password)\b")

# Détection ÉLARGIE de la réclame, pour la seule catégorisation (jamais pour
# rejeter un paiement) : on ne l'applique qu'à un SMS déjà écarté comme
# mouvement d'argent et comme solde. Elle peut donc être plus large sans
# risque de requalifier un encaissement.
RE_PUB = re.compile(
    r"\b(?:gagner|jackpot|tente\s+ta\s+chance|max\s*it|illimite|abonne|"
    r"data|reseau\s+social|whatsapp|recharge|rechargez|cadeau|"
    r"win|won|gift|reward|offer|bundle|unlimited|subscribe|"
    r"top\s*up|airtime)\b")

# Un code à usage unique : « Le code de 696103864 est: 515318. » Ce n'est pas
# un paiement, mais surtout ce n'est pas un texte à conserver ni à relayer.
RE_CODE_UNIQUE = re.compile(
    r"\b(?:code|otp|mot\s+de\s+passe|password|pin)\b"
    r"[^\n.]{0,40}?"
    r"(?:\best\b|\bis\b|:)\s*:?\s*"
    r"(\d{4,10})\b")


class Partie:
    """Une des deux parties d'un transfert : un numéro, souvent un nom."""

    __slots__ = ("numero", "nom")

    def __init__(self, numero=None, nom=None):
        self.numero = numero or None
        self.nom = nom or None

    def __bool__(self):
        return bool(self.numero or self.nom)

    def __eq__(self, autre):
        return (isinstance(autre, Partie) and self.numero == autre.numero
                and self.nom == autre.nom)

    def __str__(self):
        from .textes import t
        if self.nom and self.numero:
            return f"{self.nom} ({self.numero})"
        return self.nom or self.numero or t("Unknown", "Inconnu")

    def __repr__(self):
        return f"<Partie {self}>"

    def en_dict(self):
        return {"numero": self.numero, "nom": self.nom}


class Paiement:
    """Un mouvement d'argent compris. Le texte d'origine reste attaché."""

    __slots__ = ("sens", "montant", "nom", "numero", "reference",
                 "solde_apres", "frais", "commission", "montant_brut",
                 "emetteur", "beneficiaire", "texte")

    def __init__(self, sens, montant, texte, nom=None, numero=None,
                 reference=None, solde_apres=None, frais=None,
                 commission=None, montant_brut=None,
                 emetteur=None, beneficiaire=None):
        self.sens = sens                  # « entree », « sortie », ou None
        self.montant = montant            # en FCFA — le montant NET
        self.nom = nom                    # « NGONO Marie », si le SMS le donne
        self.numero = numero              # « 677123456 », si le SMS le donne
        self.reference = reference        # référence de transaction
        self.solde_apres = solde_apres    # solde annoncé après l'opération
        self.frais = frais                # frais prélevés, si annoncés
        self.commission = commission      # commission, quand Orange la détaille
        self.montant_brut = montant_brut  # « Montant Transaction », avant frais
        self.emetteur = emetteur          # Partie, quand le SMS nomme les deux
        self.beneficiaire = beneficiaire  # Partie
        self.texte = texte                # le SMS d'origine, intact

    @property
    def tiers(self):
        """Qui est en face, sous la meilleure forme disponible."""
        if self.nom or self.numero:
            return self.nom or self.numero
        if self.emetteur and self.beneficiaire:
            return f"{self.emetteur} → {self.beneficiaire}"
        if self.beneficiaire:
            return str(self.beneficiaire)
        if self.emetteur:
            return str(self.emetteur)
        from .textes import t
        return t("Unknown", "Inconnu")

    @property
    def sens_connu(self):
        return self.sens in ("entree", "sortie")

    def preciser_sens(self, numeros):
        """Dit de quel côté se trouve la carte TOTEM, en comparant les numéros
        du SMS à ceux des cartes en place.

        Sans numéro propre — beaucoup de SIM prépayées n'en déclarent aucun —
        le sens reste `None`. Deviner ici retournerait le libellé du reçu :
        « Montant reçu » sur un envoi est un faux document.

        Renvoie le sens retenu.
        """
        if self.sens_connu or not (self.emetteur and self.beneficiaire):
            return self.sens
        miens = {_neuf_derniers(n) for n in numeros if _neuf_derniers(n)}
        if not miens:
            return None
        emetteur = _neuf_derniers(self.emetteur.numero)
        benef = _neuf_derniers(self.beneficiaire.numero)
        if benef in miens and emetteur not in miens:
            self.sens = "entree"
            self.nom, self.numero = self.emetteur.nom, self.emetteur.numero
        elif emetteur in miens and benef not in miens:
            self.sens = "sortie"
            self.nom, self.numero = self.beneficiaire.nom, self.beneficiaire.numero
        return self.sens

    def en_dict(self):
        return {
            "sens": self.sens, "montant": self.montant, "nom": self.nom,
            "numero": self.numero, "reference": self.reference,
            "solde_apres": self.solde_apres, "frais": self.frais,
            "commission": self.commission, "montant_brut": self.montant_brut,
            "emetteur": self.emetteur.en_dict() if self.emetteur else None,
            "beneficiaire": (self.beneficiaire.en_dict()
                             if self.beneficiaire else None),
            "texte": self.texte,
        }

    def __repr__(self):
        signe = {"entree": "+", "sortie": "−"}.get(self.sens, "±")
        return f"<Paiement {signe}{self.montant} FCFA {self.tiers}>"


def _nettoyer_nom(brut):
    """Retire la ponctuation résiduelle et rejette les faux positifs
    (« votre compte », « la part de »…) qui ne sont pas des noms."""
    if not brut:
        return None
    nom = re.sub(r"\s+", " ", brut).strip(" .,;:-'\"")
    if len(nom) < 2 or len(nom) > 40:
        return None
    if re.fullmatch(r"[\d\s+]+", nom):      # ce n'est qu'un numéro
        return None
    mots_vides = {"votre", "vous", "la part", "compte", "le compte", "part"}
    if _normaliser(nom) in mots_vides:
        return None
    return nom


def _tel_quel(m, groupe, norme, propre):
    """Le morceau capturé, mais avec ses accents et ses majuscules.

    Les deux textes ont la même longueur — la normalisation ne remplace que des
    caractères un à un — donc les positions se transposent. On vérifie quand
    même : une lettre déjà décomposée à l'origine casserait l'alignement.
    """
    if not m.group(groupe):
        return None
    if len(norme) == len(propre):
        debut, fin = m.span(groupe)
        return propre[debut:fin]
    return m.group(groupe)


def _extraire_tiers(norme, propre):
    """Retrouve le nom et le numéro de l'autre partie. On cherche dans le
    texte normalisé pour la robustesse, mais on récupère le nom dans le texte
    d'origine pour garder ses accents et ses majuscules."""
    m = RE_TIERS.search(norme)
    if not m:
        return None, None
    numero_brut = m.group("num1") or m.group("num2")
    numero = re.sub(r"\s+", "", numero_brut) if numero_brut else None
    return _nettoyer_nom(_tel_quel(m, "nom", norme, propre)), numero


def _montant_nomme(motif, norme):
    m = motif.search(norme)
    return _nombre(m.group(1)) if m else None


def _transfert_orange(m, norme, propre, texte):
    """Le transfert d'Orange Money : deux parties nommées, un détail complet.

    Le sens n'est pas déterminé ici. Le SMS dit qui envoie et qui reçoit, pas
    laquelle des deux lignes est la nôtre : `preciser_sens()` s'en charge une
    fois les cartes connues.
    """
    emetteur = Partie(
        re.sub(r"\s+", "", m.group("num_emetteur")),
        _nettoyer_nom(_tel_quel(m, "nom_emetteur", norme, propre)))
    beneficiaire = Partie(
        re.sub(r"\s+", "", m.group("num_benef")),
        _nettoyer_nom(_tel_quel(m, "nom_benef", norme, propre)))

    net = _montant_nomme(RE_MONTANT_NET, norme)
    brut = _montant_nomme(RE_MONTANT_BRUT, norme)
    montant = net if net is not None else brut
    if montant is None:
        # « Transfer of 50000 FCFA from … » : le montant vit dans la tête de
        # phrase, avant la première partie — jamais plus loin, pour ne pas
        # confondre avec les frais ou le solde qui suivent.
        tete = RE_MONTANT_SEUL.search(norme, m.start(), m.start("num_emetteur"))
        if tete:
            montant = _nombre(tete.group(1))
    if not montant:
        return None     # un transfert sans montant lisible n'est pas exploitable

    reference = _reference(norme, propre)
    solde = _montant_nomme(RE_SOLDE, norme)
    return Paiement(
        sens=None, montant=montant, texte=texte,
        reference=reference, solde_apres=solde,
        frais=_montant_nomme(RE_FRAIS, norme),
        commission=_montant_nomme(RE_COMMISSION, norme),
        montant_brut=brut,
        emetteur=emetteur, beneficiaire=beneficiaire)


def _operation_agent(m, norme, propre, texte):
    """Un dépôt ou un retrait d'agent : le bénéficiaire est nommé après
    « vers » (numéro puis nom), l'émetteur parfois en fin de message.

    Comme pour un transfert, le sens n'est pas décidé ici : le SMS dit qui
    envoie et qui reçoit, pas laquelle des deux lignes est la nôtre.
    """
    beneficiaire = Partie(
        re.sub(r"\s+", "", m.group("num_benef")),
        _nettoyer_nom(_tel_quel(m, "nom_benef", norme, propre)))

    # L'émetteur, s'il est nommé après le mot de réussite (« ... from 806…
    # WONDER PHONE »). On cherche sur le texte normalisé complet, à partir de
    # la fin du motif, pour retrouver le nom avec ses majuscules d'origine.
    emetteur = None
    fin = RE_EMETTEUR_FIN.search(norme, m.start("apres"))
    if fin:
        emetteur = Partie(re.sub(r"\s+", "", fin.group("num")),
                          _nettoyer_nom(_tel_quel(fin, "nom", norme, propre)))

    # Le montant, entre le verbe et « vers » (« depot de 50000 FCFA vers … »),
    # sinon dans un champ « Montant ». Jamais deviné : sans montant lisible,
    # on renonce et le SMS reste affiché tel quel.
    montant = None
    tete = RE_MONTANT_SEUL.search(m.group("avant") or "")
    if tete:
        montant = _nombre(tete.group(1))
    if montant is None:
        montant = (_montant_nomme(RE_MONTANT_NET, norme)
                   or _montant_nomme(RE_MONTANT_BRUT, norme)
                   or _montant_nomme(RE_MONTANT_SIMPLE, norme))
    if not montant:
        return None

    return Paiement(
        sens=None, montant=montant, texte=texte,
        reference=_reference(norme, propre),
        solde_apres=_montant_nomme(RE_SOLDE, norme),
        frais=_montant_nomme(RE_FRAIS, norme),
        commission=_montant_nomme(RE_COMMISSION, norme),
        emetteur=emetteur if emetteur else None,
        beneficiaire=beneficiaire)


def _reference(norme, propre):
    m = RE_REFERENCE.search(norme)
    if not m:
        return None
    valeur = _tel_quel(m, 1, norme, propre)
    return valeur.strip(" .,;:") if valeur else None


def analyser(texte, numeros=()):
    """Renvoie un Paiement, ou None si le message n'en est pas un.

    `numeros` : les numéros des cartes en place, quand on les connaît. Ils
    servent uniquement à trancher le sens d'un transfert qui nomme ses deux
    parties. Sans eux, le paiement est rendu avec `sens = None`.

    Ne lève jamais : un SMS incompréhensible n'est pas une erreur, c'est un
    SMS qu'on affichera tel quel.
    """
    if not texte or not texte.strip():
        return None
    propre = _propre(texte)
    norme = _normaliser(texte)

    if RE_BRUIT.search(norme):
        return None     # publicité, code de vérification : pas un paiement

    transfert = (RE_TRANSFERT.search(norme) or RE_TRANSFERT_EN.search(norme)
                 or RE_TRANSFERT_EN_FIN.search(norme))
    if transfert:
        paiement = _transfert_orange(transfert, norme, propre, texte)
        if paiement is not None:
            paiement.preciser_sens(numeros)
        return paiement

    operation = RE_OPERATION.search(norme)
    if operation:
        paiement = _operation_agent(operation, norme, propre, texte)
        if paiement is not None:
            paiement.preciser_sens(numeros)
            return paiement
        # Sans montant lisible, ce n'était pas exploitable comme opération :
        # on laisse la suite tenter une lecture plus simple.

    entree = RE_RECU.search(norme)
    sortie = None if entree else RE_ENVOYE.search(norme)
    trouve = entree or sortie
    if not trouve:
        return None

    montant = _nombre(trouve.group(1))
    if not montant:
        return None     # sans montant fiable, on n'invente pas

    nom, numero = _extraire_tiers(norme, propre)
    solde = RE_SOLDE.search(norme)
    frais = RE_FRAIS.search(norme) or RE_COMMISSION.search(norme)

    return Paiement(
        sens="entree" if entree else "sortie",
        montant=montant,
        texte=texte,
        nom=nom,
        numero=numero,
        reference=_reference(norme, propre),
        solde_apres=_nombre(solde.group(1)) if solde else None,
        frais=_nombre(frais.group(1)) if frais else None,
        commission=_montant_nomme(RE_COMMISSION, norme),
    )


def solde_annonce(texte):
    """Le solde d'un SMS qui ne parle que de ça : « Le solde de votre compte
    est de 2784137.6FCFA. »

    Renvoie None dès qu'il s'agit d'autre chose — un paiement, une publicité,
    un code. Le solde d'un SMS de transfert se lit dans `Paiement.solde_apres` ;
    ici on ne veut que l'interrogation pure, celle qui suit un `#150#`.
    """
    if not texte or not texte.strip():
        return None
    norme = _normaliser(texte)
    if RE_BRUIT.search(norme) or RE_CODE_UNIQUE.search(norme):
        return None
    if (RE_TRANSFERT.search(norme) or RE_TRANSFERT_EN.search(norme)
            or RE_TRANSFERT_EN_FIN.search(norme) or RE_OPERATION.search(norme)
            or RE_RECU.search(norme) or RE_ENVOYE.search(norme)):
        return None
    m = RE_SOLDE.search(norme) or RE_SOLDE_SEUL.search(norme)
    return _nombre(m.group(1)) if m else None


def categoriser(texte, numeros=()):
    """Range un SMS reçu dans une catégorie, pour la boîte de réception.

    Rien n'est jeté : la catégorie n'est qu'une aide à la lecture et au tri.
    Un SMS reste toujours consultable en entier, quelle que soit sa catégorie.

    Les valeurs possibles :
      encaissement · envoi · transfert · depot · retrait  — des mouvements
      solde   — une interrogation de solde (« #150# »)
      code    — un code à usage unique (masqué)
      publicite — une réclame de l'opérateur
      message — un SMS quelconque (de n'importe qui)
    """
    if not texte or not texte.strip():
        return "message"
    if code_a_usage_unique(texte):
        return "code"
    norme = _normaliser(texte)
    # On tranche d'ABORD si c'est de l'argent : ainsi un motif publicitaire ne
    # peut jamais requalifier un vrai paiement (« 2 millions », « gagné »…).
    paiement = analyser(texte, numeros=numeros)
    if paiement is not None:
        if re.search(r"\bdepot\b|\bdeposit\b", norme):
            return "depot"
        if re.search(r"\bretrait\b|\bretire\b|\bwithdraw(?:al|n)?\b"
                     r"|\bcash\s*out\b", norme):
            return "retrait"
        if re.search(r"\btransfert\b|\btransfer\b", norme):
            return "transfert"
        if paiement.sens == "entree":
            return "encaissement"
        if paiement.sens == "sortie":
            return "envoi"
        return "transfert"      # deux parties nommées, sens encore indéterminé
    if solde_annonce(texte) is not None:
        return "solde"
    if RE_BRUIT.search(norme) or RE_PUB.search(norme):
        return "publicite"
    return "message"


def code_a_usage_unique(texte):
    """Ce SMS transporte-t-il un code à usage unique ?

    Deux conditions, et pas une seule : la tournure du code doit s'y trouver,
    **et** le message ne doit pas être un paiement. Un SMS d'encaissement qui
    mentionne un « code marchand » reste ainsi lisible en entier — c'est
    pourquoi `analyser()` ne connaît pas ce motif : le masquage s'appuie sur
    son verdict, il ne peut pas en dépendre.
    """
    if not texte or not texte.strip():
        return False
    if not RE_CODE_UNIQUE.search(_normaliser(texte)):
        return False
    return analyser(texte) is None


def masquer_secrets(texte):
    """Le même message, le code remplacé par des points.

    C'est cette version-là qui est écrite au journal et affichée sur Telegram :
    un code à usage unique n'a aucune raison de survivre à sa minute, ni de
    traîner dans une sauvegarde envoyée hors du Pi.
    """
    if not texte or not code_a_usage_unique(texte):
        return texte

    def _points(m):
        return m.group(0)[:m.start(1) - m.start(0)] + "•" * len(m.group(1))

    # Le motif est écrit pour le texte normalisé ; sur l'original on refait
    # une passe insensible à la casse, qui suffit ici (le code est un nombre).
    return re.sub(RE_CODE_UNIQUE.pattern, _points, texte, flags=re.I)


__all__ = ["Paiement", "Partie", "analyser", "solde_annonce", "categoriser",
           "code_a_usage_unique", "masquer_secrets", "formater_montant"]
