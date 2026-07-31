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
"""

import re
import unicodedata

# --- Normalisation -------------------------------------------------------

def _sans_accents(texte):
    """« reçu » et « recu » doivent se ressembler."""
    decompose = unicodedata.normalize("NFD", texte)
    return "".join(c for c in decompose if unicodedata.category(c) != "Mn")


def _normaliser(texte):
    """Ramène le message à une forme comparable : sans accents, espaces
    ordinaires, casse basse. Le texte d'origine, lui, n'est jamais modifié."""
    t = _sans_accents(texte)
    t = t.replace(" ", " ").replace(" ", " ")   # espaces insécables
    return re.sub(r"\s+", " ", t).strip().lower()


def _nombre(brut):
    """« 25 000 », « 25.000 », « 25,000 » → 25000. None si illisible."""
    chiffres = re.sub(r"[^\d]", "", brut or "")
    return int(chiffres) if chiffres else None


# --- Motifs --------------------------------------------------------------
# Un montant : suite de chiffres pouvant contenir séparateurs, suivie de la
# devise sous l'une de ses formes (FCFA, F CFA, XAF, CFA, F).
MONTANT = r"([\d][\d\s.,]*)\s*(?:f\s*cfa|fcfa|xaf|cfa|f\b)"

RE_RECU = re.compile(r"\b(?:recu|receive[sd]?|credite)\b.{0,20}?" + MONTANT, re.S)
RE_ENVOYE = re.compile(
    r"\b(?:envoye|transfere|debite|paye|retire|payment de|paiement de)\b.{0,20}?" + MONTANT, re.S)

# « de NGONO Marie (677123456) » / « de 677123456 » / « from Marie »
RE_TIERS = re.compile(
    r"\b(?:de|from|a|to|vers|chez)\s+"
    r"(?P<nom>[^().,;:\n]{2,40}?)?\s*"
    r"(?:\(\s*(?P<num1>[+\d][\d\s]{6,20})\s*\)|(?P<num2>\b[+\d][\d\s]{7,20}\b))")

RE_REFERENCE = re.compile(
    r"\b(?:ref|reference|id|txn|transaction\s*id|financial\s*transaction\s*id)\b"
    r"\s*[:.\-]?\s*([A-Za-z0-9][A-Za-z0-9._\-]{3,40})")

RE_SOLDE = re.compile(
    r"\b(?:nouveau\s+solde|solde(?:\s+(?:actuel|disponible))?"
    r"|new\s+balance|balance)\b"
    r"[^\d]{0,20}?" + MONTANT, re.S)

RE_FRAIS = re.compile(r"\b(?:frais|fee[s]?|commission)\b[^\d]{0,20}?" + MONTANT, re.S)

# Mots qui trahissent un message publicitaire ou un code de connexion : on ne
# veut surtout pas les compter comme des encaissements.
RE_BRUIT = re.compile(
    r"\b(?:promo|promotion|bonus|gagnez|felicitations|offre|forfait|"
    r"mot de passe|code de verification|otp|ne partagez)\b")


class Paiement:
    """Un mouvement d'argent compris. Le texte d'origine reste attaché."""

    __slots__ = ("sens", "montant", "nom", "numero", "reference",
                 "solde_apres", "frais", "texte")

    def __init__(self, sens, montant, texte, nom=None, numero=None,
                 reference=None, solde_apres=None, frais=None):
        self.sens = sens                  # « entree » ou « sortie »
        self.montant = montant            # entier, en FCFA
        self.nom = nom                    # « NGONO Marie », si le SMS le donne
        self.numero = numero              # « 677123456 », si le SMS le donne
        self.reference = reference        # référence de transaction
        self.solde_apres = solde_apres    # solde annoncé après l'opération
        self.frais = frais                # frais prélevés, si annoncés
        self.texte = texte                # le SMS d'origine, intact

    @property
    def tiers(self):
        """Qui est en face, sous la meilleure forme disponible."""
        return self.nom or self.numero or "Inconnu"

    def en_dict(self):
        return {
            "sens": self.sens, "montant": self.montant, "nom": self.nom,
            "numero": self.numero, "reference": self.reference,
            "solde_apres": self.solde_apres, "frais": self.frais,
            "texte": self.texte,
        }

    def __repr__(self):
        signe = "+" if self.sens == "entree" else "−"
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


def _extraire_tiers(texte_norme, texte_origine):
    """Retrouve le nom et le numéro de l'autre partie. On cherche dans le
    texte normalisé pour la robustesse, mais on récupère le nom dans le texte
    d'origine pour garder ses accents et ses majuscules."""
    m = RE_TIERS.search(texte_norme)
    if not m:
        return None, None
    numero_brut = m.group("num1") or m.group("num2")
    numero = re.sub(r"\s+", "", numero_brut) if numero_brut else None

    nom = None
    if m.group("nom"):
        # Même position dans l'original : les deux textes ont la même longueur
        # (la normalisation ne fait que remplacer des caractères un à un,
        # sauf les espaces multiples — d'où la vérification ci-dessous).
        debut, fin = m.span("nom")
        if len(texte_norme) == len(texte_origine):
            nom = _nettoyer_nom(texte_origine[debut:fin])
        else:
            nom = _nettoyer_nom(m.group("nom"))
    return nom, numero


def analyser(texte):
    """Renvoie un Paiement, ou None si le message n'en est pas un.

    Ne lève jamais : un SMS incompréhensible n'est pas une erreur, c'est un
    SMS qu'on affichera tel quel.
    """
    if not texte or not texte.strip():
        return None
    norme = _normaliser(texte)

    if RE_BRUIT.search(norme):
        return None     # publicité, code de vérification : pas un paiement

    entree = RE_RECU.search(norme)
    sortie = None if entree else RE_ENVOYE.search(norme)
    trouve = entree or sortie
    if not trouve:
        return None

    montant = _nombre(trouve.group(1))
    if not montant:
        return None     # sans montant fiable, on n'invente pas

    nom, numero = _extraire_tiers(norme, texte)
    reference = None
    m = RE_REFERENCE.search(norme)
    if m:
        # Récupérée dans l'original pour garder la casse (« PP0947.A12345 »).
        debut, fin = m.span(1)
        reference = (texte[debut:fin] if len(norme) == len(texte)
                     else m.group(1)).strip(" .,;:")

    solde = RE_SOLDE.search(norme)
    frais = RE_FRAIS.search(norme)

    return Paiement(
        sens="entree" if entree else "sortie",
        montant=montant,
        texte=texte,
        nom=nom,
        numero=numero,
        reference=reference,
        solde_apres=_nombre(solde.group(1)) if solde else None,
        frais=_nombre(frais.group(1)) if frais else None,
    )
