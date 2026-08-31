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

  - **La structure d'abord, pas la phrase.** Un SMS d'opération est un
    document : un en-tête (« Successful transfer from X to Y »), puis des
    champs étiquetés (« Transaction amount: … », « New balance: … »). On lit
    les champs comme un dictionnaire — peu importe leur ordre — et les
    parties par leurs NUMÉROS, qui sont fiables, jamais par la forme de
    leurs noms, qui ne l'est pas. « GARANTIE EXCHANGE SARL 3 » est un nom de
    client parfaitement légal : un chiffre dans une raison sociale ne doit
    jamais faire perdre un transfert. C'est arrivé — voir le troisième
    principe de `categoriser()`.

  - **Un échec de lecture est un échec, jamais une autre réponse.** L'ancien
    lecteur, quand un transfert lui échappait, retombait sur le « Nouveau
    solde » du même SMS et répondait « interrogation de solde » avec aplomb.
    Un transfert d'un million devenait un relevé. Désormais un message qui
    parle d'argent sans être compris est dit « illisible » — visible, jamais
    déguisé en autre chose.
"""

from datetime import datetime
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
    t = texte.replace(" ", " ").replace(" ", " ")   # espaces insécables
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
    r"\b(?:recu|receive[sd]?|credite[d]?|cash\s*in)\b.{0,20}?" + MONTANT, re.S)
RE_ENVOYE = re.compile(
    r"\b(?:envoye|transfere|debit(?:e[es]?)?|paye|retire|sent|cash\s*out"
    r"|transferred|paid|withdrawn|debited"
    r"|payment de|paiement de)\b.{0,20}?" + MONTANT, re.S)

# --- L'en-tête d'une opération : le geste, la réussite, les parties -------
#
# L'ancienne lecture décrivait chaque tournure d'Orange par un motif qui
# épousait la phrase ENTIÈRE — et le nom des parties y était « tout sauf des
# chiffres » ([^\d]{0,40}). Le jour où un client s'est appelé « GARANTIE
# EXCHANGE SARL 3 », le motif a cassé sur le « 3 », le transfert est retombé
# sur « New balance », et un vrai transfert d'un million est devenu une
# interrogation de solde. Le nom d'une entreprise ne se décrit pas ; son
# NUMÉRO, si. On ancre donc les parties sur les numéros, et le nom est
# simplement « ce qui suit le numéro », chiffres compris.

RE_GESTE = re.compile(
    r"\b(?:transfert|transfer|depot|deposit|retrait|withdraw(?:al|n)?"
    r"|cash\s*in|cash\s*out|paiement|payment|envoi)\b")

# La réussite, exigée pour toute opération à deux parties : un transfert
# échoué ne doit jamais devenir un reçu. « sera effectué » n'est pas
# « effectué » — une opération annoncée n'a pas encore eu lieu.
RE_REUSSITE = re.compile(
    r"(?<!sera )(?<!seront )(?<!will be )(?<!to be )"
    r"\b(?:reussi[e]?s?|effectue[e]?s?|confirme[e]?s?|succes"
    r"|success(?:ful(?:ly)?)?|completed|valide[e]?s?)\b")

# Les mots qui disent qu'il ne s'est RIEN passé. Ils vivaient dans le
# déclencheur de reçus ; les voici à la source, pour que la boîte de
# réception, l'alerte Telegram, le cloud et les reçus tiennent le même
# discours — un paiement annulé comptait comme un encaissement partout
# sauf au moment du reçu, qui le refusait sans dire pourquoi.
RE_MOT_ECHEC = re.compile(
    r"\b(?:echec|echoue[e]?s?|annul(?:e|ee|es|ees|ation)s?|rejet(?:e|ee)s?"
    r"|refus(?:e|ee)s?|insuffisant[e]?s?|impossible|non\s+abouti[e]?s?"
    r"|failed|failure|declined|unsuccessful|cancell?ed|rejected|denied"
    r"|insufficient|reversed|reversal"
    r"|could\s+not\b|unable\b"
    r"|n\W{0,2}avez\s+pas\s+recu|pas\s+ete\s+recu|not\s+(?:been\s+)?received?)\b")

# L'annulation d'une opération : la seule famille d'échec qui reste un échec
# même « effectuée avec succès » — c'est l'ANNULATION qui a réussi, pas le
# mouvement. « Remboursement » n'y est pas : un remboursement reçu est un
# vrai encaissement, et c'est un mot qu'on trouve dans les motifs de
# paiement (« Motif: remboursement pret ») comme dans les raisons sociales.
RE_ANNULATION = re.compile(
    r"\b(?:annul\w*|cancell?\w*|revers(?:al|ed))\b")

# Ce qui nomme l'opération sans la conjuguer : « Opération annulée »,
# « Transaction annulée » — la phrase ne porte ni verbe ni montant, mais
# elle parle bien du mouvement d'à côté.
RE_NOMME_OPERATION = re.compile(r"\b(?:operation|transaction)\b")

# « Pour toute annulation, composez le #150# » : le mot d'échec y est
# conditionnel, pas constaté. Un pied de message ne doit pas tuer un dépôt
# réussi — c'est arrivé sur de vrais SMS de production.
RE_CONDITIONNEL = re.compile(
    r"\b(?:pour\s+tout[e]?|en\s+cas\s+d|si\s+(?:vous|le|la|l)\b"
    r"|to\s+cancel|if\s+(?:you|the)\b|for\s+any)\b")

# Une phrase-prospectus : elle INVITE à une opération, elle n'en rapporte
# pas une. « Pour un retrait, composez le #150# » au pied d'un relevé de
# solde ne fait pas du relevé une opération de retrait.
RE_PROSPECTUS = re.compile(
    r"\b(?:composez|tapez|appelez|envoyez\s+\w{1,12}\s+au|faites\s+le"
    r"|dial|call|send\s+\w{1,12}\s+to)\b|#\d|\*\d")


def _parle_dune_operation(norme):
    """Un geste d'opération CONSTATÉ quelque part — pas une invitation
    (« Pour un retrait, composez… »), pas une condition."""
    for phrase in re.split(r"[.!?\n]+", norme):
        if not RE_GESTE.search(phrase):
            continue
        if RE_CONDITIONNEL.search(phrase) or RE_PROSPECTUS.search(phrase):
            continue
        return True
    return False


def _echec_constate(norme):
    """Un mot d'échec hors phrase conditionnelle, où qu'il soit. Plus large
    que `est_echec()` — réservé aux messages qui ne parlent QUE d'un solde,
    où aucun nom de client ne peut le porter par accident."""
    return any(RE_MOT_ECHEC.search(ph) and not RE_CONDITIONNEL.search(ph)
               for ph in re.split(r"[.!?\n]+", norme))

# Une partie : un mot-charnière, puis un NUMÉRO — jamais un montant (la
# devise ou une décimale qui suivent le trahissent), jamais une suite de
# chiffres démesurée. Le nom viendra après, sans contrainte de forme.
RE_PARTIE = re.compile(
    r"\b(?P<role>from|de|par|by|to|vers)\s+"
    r"(?P<numero>\+?\d{7,14})(?!\d)"
    r"(?!\s*(?:f\s*cfa|fcfa|xaf|cfa|f\b)|[.,]\d)")

# Où s'arrête un nom : à la ponctuation, au prochain mot-charnière, au mot de
# réussite ou d'échec. Entre ces bornes, TOUT est permis — chiffres,
# apostrophes, esperluettes : c'est le client qui choisit sa raison sociale.
RE_FIN_NOM = re.compile(
    r"[.;,:\n]"
    r"|\b(?:from|de|par|to|vers|reussi\w*|effectue\w*|confirme\w*"
    r"|succes\b|success\w*|completed|valide\w*|failed|echoue\w*)\b")

# Un champ étiqueté d'argent (« Montant Net : », « New balance: »…). Deux ou
# plus, c'est le détail d'une opération — même quand l'en-tête s'est perdu
# (SMS multipart amputé de sa première moitié).
RE_CHAMP_ARGENT = re.compile(
    r"\b(?:montant|amount|solde|balance|frais|fee[s]?|charge[s]?|commission)\b"
    r"[^:\n,]{0,30}:")

# « de NGONO Marie (677123456) » / « de 677123456 » / « from Marie ».
# Le numéro nu ne doit jamais être un montant : « s'élève à 12345678 FCFA »
# donnait le SOLDE comme numéro du tiers — la devise qui suit l'écarte.
RE_TIERS = re.compile(
    r"\b(?:de|from|by|a|to|vers|chez)\s+"
    r"(?P<nom>[^().,;:\n]{2,40}?)?\s*"
    r"(?:\(\s*(?P<num1>[+\d][\d\s]{6,20})\s*\)"
    r"|(?P<num2>\b[+\d][\d\s]{7,20}\b)(?!\s*(?:f\s*cfa|fcfa|xaf|cfa|f\b)))")

# Les libellés les plus longs d'abord : « ID transaction » avant « id ».
#
# Le refus qui suit n'est pas une précaution de style. Quand la référence est
# trop courte pour le motif, l'expression recule sur l'alternative « id » et
# capture le mot « transaction » qui la suit. Deux transferts différents
# reçoivent alors la MÊME référence — or elle est unique en base : le second
# n'obtient aucun reçu, sans que rien ne le signale.
#
# Même famille de piège : « Reference disponible auprès du service client »
# capturait le mot « disponible ». Une référence d'opérateur porte toujours
# au moins un chiffre — on l'exige.
#
# Mieux vaut aucune référence qu'une fausse : le garde-fou anti-doublon
# retombe alors sur la ligne du journal, qui, elle, ne se répète jamais.
# L'HEURE QUE LE MESSAGE PORTE LUI-MÊME.
#
# Orange ne date pas ses SMS : l'heure de réception par le terminal est alors
# la seule honnête. MTN, lui, écrit la sienne — « at 2026-08-25 13:55:27 » —
# et c'est l'heure du RÉSEAU, celle qui figurera sur son relevé. Entre les
# deux, c'est elle qui fait foi : le terminal peut avoir reçu le SMS une
# minute plus tard, ou l'avoir relu bien après une coupure.
RE_HORODATAGE = re.compile(
    r"\b(?:at|le|du)\s+(\d{4})-(\d{2})-(\d{2})[ t](\d{2}):(\d{2})(?::(\d{2}))?")


def _horodatage(norme):
    """L'instant écrit dans le message, ou None. Jamais d'exception : une
    date impossible (« 2026-13-45 ») vaut une date absente."""
    m = RE_HORODATAGE.search(norme)
    if not m:
        return None
    try:
        return datetime(*(int(g) for g in m.groups()[:5]),
                        int(m.group(6) or 0))
    except ValueError:
        return None


RE_REFERENCE = re.compile(
    r"\b(?:id\s*(?:de\s*)?(?:la\s*)?transaction|financial\s*transaction\s*id"
    r"|transaction\s*id|reference|ref|txn|id)\b"
    r"\s*[:.\-]?\s*"
    r"(?!transaction\b|reference\b|ref\b|id\b|txn\b)"
    r"(?=[A-Za-z._/\-]*\d)"
    r"([A-Za-z0-9][A-Za-z0-9._/\-]{3,40})")

RE_SOLDE = re.compile(
    r"\b(?:nouveau\s+solde|solde(?:\s+(?:actuel|disponible))?"
    r"|new\s+balance|balance)\b"
    r"[^\d]{0,40}?" + MONTANT, re.S)

# Les relevés MTN à PLUSIEURS soldes étiquetés — reçus par SMS quand l'USSD
# ne passe pas (itinérance), et sur les comptes d'agent :
#   « Mobile Money Balance: 0 FCFA. Airtime balance: 7,943FCFA. »
#   « Current balance: 8910 FCFA ; Available balance: 8910 FCFA ;
#     Airtime balance: 7,943 FCFA ; MTN MoMo Gift Balance: 0. »
# Plusieurs montants, mais AUCUNE ambiguïté : chacun porte son étiquette.
# Le porte-monnaie d'abord ; le solde « courant » ensuite (celui que le
# propriétaire suit) ; le « disponible » en dernier recours. Jamais le
# crédit d'appel, la commission ni les cadeaux. C'est la seule exception
# admise à la règle « deux champs d'argent = refus » : elle ne joue que sur
# une étiquette explicite.
RE_SOLDES_ETIQUETES = (
    re.compile(r"\b(?:(?:mobile\s*money|momo)\s*balance"
               r"|solde\s*(?:mobile\s*money|momo))\b"
               r"[^\d]{0,40}?" + MONTANT, re.S),
    re.compile(r"\b(?:current\s*balance|solde\s*courant)\b"
               r"[^\d]{0,40}?" + MONTANT, re.S),
    re.compile(r"\b(?:available\s*balance|solde\s*disponible)\b"
               r"[^\d]{0,40}?" + MONTANT, re.S),
)

# UN SOLDE N'EST PAS L'AUTRE. « Airtime balance », « MTN MoMo Gift Balance »,
# « commission balance » : ces montants-là ne sont pas le porte-monnaie. Dans
#
#   « Transfer of 5 000 FCFA to 677123456 … completed. Fee: 100 FCFA.
#     Airtime balance: 7 943 FCFA. New balance: 8 910 FCFA. »
#
# le PREMIER « balance » rencontré est celui du crédit d'appel — et c'est lui
# que le solde après opération affichait : 7 943 au lieu de 8 910, le crédit
# téléphonique à la place de l'argent. L'alerte de solde bas (`declencheur`)
# s'en nourrissait aussi. Le mot qui PRÉCÈDE le champ tranche.
RE_SOLDE_ETRANGER = re.compile(
    r"\b(?:airtime|credit\s*(?:d\s*)?appel|gift|cadeau|bonus"
    r"|commission|loan|pret|dette)\b")

# « Nouveau solde » / « New balance » : LE champ d'un SMS d'opération, celui
# qui suit le mouvement. Il prime sur un « balance » nu croisé plus tôt.
RE_SOLDE_APRES = re.compile(
    r"\b(?:nouveau\s+solde|new\s+balance)\b[^\d]{0,40}?" + MONTANT, re.S)

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
# l'autre : ce que l'opérateur annonce fait foi. « Net debit amount » est la
# variante anglaise du « Montant Net Débité » français — même champ.
RE_MONTANT_NET = re.compile(
    r"\b(?:montant\s+net|net\s+(?:debit\s+|credit\s+)?amount)\b"
    r"[^\d]{0,20}?" + MONTANT, re.S)
RE_MONTANT_BRUT = re.compile(
    r"\b(?:montant\s+(?:de\s+la\s+)?transaction"
    r"|transaction\s+amount)\b[^\d]{0,20}?" + MONTANT, re.S)
# Un champ « Montant : 50000 FCFA » isolé — dernier recours pour les dépôts
# et retraits qui ne détaillent ni « net » ni « transaction ».
RE_MONTANT_SIMPLE = re.compile(
    r"\b(?:montant|amount)\b[^\d]{0,20}?" + MONTANT, re.S)
# Le mot « montant »/« amount » appartient parfois aux FRAIS : « Fee amount:
# 100 FCFA ». Le lire comme le montant de l'opération faisait passer un
# retrait pour un mouvement de 100 FCFA — le prix du service à la place de la
# somme, et le même nombre annoncé en montant ET en frais. Là encore, c'est le
# mot d'avant qui dit de quel champ il s'agit.
RE_MONTANT_ETRANGER = re.compile(
    r"\b(?:frais|fee[s]?|charge[s]?|commission|taxe?s?|penalite?s?)\W*$")
# Un montant nu, sans mot-clé, cherché dans la seule tête de phrase — « depot
# de 50000 FCFA vers … » : trop court pour contenir des frais ou un solde.
RE_MONTANT_SEUL = re.compile(MONTANT, re.S)

# Mots qui trahissent un message publicitaire ou un code de connexion : on ne
# veut surtout pas les compter comme des encaissements. Ils ne s'appliquent
# qu'à la lecture SIMPLE (un verbe, un montant) : une opération complète —
# geste, réussite, parties numérotées — n'est jamais une réclame, même
# quand le client s'appelle « BONUS SARL ».
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
    r"earn|qr\s*code|top\s*up|airtime)\b")

# Un code à usage unique : « Le code de 696103864 est: 515318. » Ce n'est pas
# un paiement, mais surtout ce n'est pas un texte à conserver ni à relayer.
# Le « code marchand », lui, est une donnée de commerce, pas un secret : on
# ne masque pas l'outil de travail du propriétaire.
RE_CODE_UNIQUE = re.compile(
    r"\b(?:code|otp|mot\s+de\s+passe|password|pin)\b(?!\s*marchand)"
    r"[^\n.]{0,40}?"
    r"(?:\best\b|\bis\b|:)\s*:?\s*"
    r"(\d{4,10})\b")


# --- Les guichets de l'AGENT MTN, relevés sur le terrain ------------------
# Sur une ligne d'agent, le mot seul ment : « Cash in of 500000 XAF … to
# GAELLE … » CRÉDITE un client — la caisse de l'agent BAISSE (les soldes
# annoncés le prouvent : 506 330 − 125 000 = 381 330). « Cash out initiated
# by EDGARD … » : le client retire chez l'agent — sa caisse MONTE. C'est la
# tournure complète qui donne le sens, vérifiée sur les vrais SMS.
RE_CASH_IN_SORTANT = re.compile(
    r"\bcash\s*in\s+of\b[^\d]{0,10}" + MONTANT, re.S)
RE_CASH_OUT_ENTRANT = re.compile(r"\bcash\s*out\s+initiated\s+by\b")

RE_PHRASE_OPERANTE = re.compile(
    RE_GESTE.pattern + "|" + MONTANT +
    r"|\b(?:recu|receive[sd]?|credite[d]?|envoye|transfere|debite|paye"
    r"|retire|sent|transferred|paid|withdrawn|debited)\b")


def est_echec(norme):
    """Ce message annonce-t-il une opération qui n'a PAS eu lieu ?

    Phrase par phrase, pas mot par mot — et jamais sur un simple mot vu
    quelque part : un client peut s'appeler « STE SANS ECHEC », un motif de
    paiement peut dire « remboursement pret ». Trois règles, dans l'ordre :

      - « Pour toute annulation, composez le #150# » : le mot est
        conditionnel, la phrase ne compte pas ;
      - une ANNULATION dans la phrase de l'opération vaut échec même
        « effectuée avec succès » — c'est l'annulation qui a réussi, pas le
        mouvement ; de même « Opération annulée » dans sa propre phrase ;
      - sinon, un mot d'échec ne vaut échec que si sa phrase parle de
        l'opération (verbe, geste ou montant) ET n'annonce pas de réussite —
        un mot d'échec logé dans un NOM (« ETS REMBOURSEMENT PLUS ») partage
        toujours sa phrase avec le mot de réussite du transfert, et ne doit
        jamais confisquer l'argent d'un client.
    """
    for phrase in re.split(r"[.!?\n]+", norme):
        m = RE_MOT_ECHEC.search(phrase)
        if not m or RE_CONDITIONNEL.search(phrase):
            continue
        nomme = RE_NOMME_OPERATION.search(phrase)
        if RE_ANNULATION.search(phrase) and (
                RE_PHRASE_OPERANTE.search(phrase) or nomme):
            return True
        if RE_REUSSITE.search(phrase):
            continue
        if RE_PHRASE_OPERANTE.search(phrase) or nomme:
            return True
    return False


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
                 "emetteur", "beneficiaire", "quand", "texte")

    def __init__(self, sens, montant, texte, nom=None, numero=None,
                 reference=None, solde_apres=None, frais=None,
                 commission=None, montant_brut=None,
                 emetteur=None, beneficiaire=None, quand=None):
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
        self.quand = quand                # l'instant écrit dans le message
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


def _morceau(norme, propre, debut, fin):
    """La tranche [debut:fin), avec accents et majuscules quand l'alignement
    le permet — même prudence que `_tel_quel`."""
    if len(norme) == len(propre):
        return propre[debut:fin]
    return norme[debut:fin]


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


def _sans_voisin(motif, exclusion, norme, portee=20, debut=0, fin=None):
    """Le premier montant de `motif` dont le VOISINAGE AMONT ne porte pas un
    mot d'`exclusion`.

    Beaucoup de champs se ressemblent — « balance », « amount », ou même un
    nombre nu — et seul le mot qui les précède dit de quoi ils parlent :
    « Airtime balance » n'est pas le porte-monnaie, « Fee amount » n'est pas le
    montant de l'opération, et le « 100 » de « Frais : 100 FCFA » n'est pas la
    somme envoyée. On lit donc les quelques caractères d'avant, et on passe au
    champ suivant quand ce n'est pas le bon. Renvoie None si aucun ne convient
    — on préfère ne rien dire que dire le mauvais nombre.

    `debut`/`fin` bornent la recherche sans rogner le voisinage : on regarde
    toujours en amont dans le texte ENTIER, sinon le premier champ de la
    tranche paraîtrait sans étiquette.
    """
    for m in motif.finditer(norme, debut, len(norme) if fin is None else fin):
        avant = norme[max(0, m.start() - portee):m.start()]
        if not exclusion.search(avant):
            return _nombre(m.group(1))
    return None


def _solde_du_message(norme):
    """Le solde du PORTE-MONNAIE, jamais le crédit d'appel.

    Trois passes, de la plus explicite à la plus large :

      1. les soldes étiquetés (« Mobile Money Balance », « Current balance ») ;
      2. le « Nouveau solde » / « New balance » d'un SMS d'opération ;
      3. un « solde »/« balance » nu — en sautant ceux qu'un mot voisin
         désigne comme étrangers au porte-monnaie.
    """
    for motif in RE_SOLDES_ETIQUETES:
        m = motif.search(norme)
        if m:
            return _nombre(m.group(1))
    m = RE_SOLDE_APRES.search(norme)
    if m:
        return _nombre(m.group(1))
    return _sans_voisin(RE_SOLDE, RE_SOLDE_ETRANGER, norme)


def _montant_simple(norme):
    """Un champ « Montant : … » isolé — mais jamais celui des frais."""
    return _sans_voisin(RE_MONTANT_SIMPLE, RE_MONTANT_ETRANGER, norme, 15)


def _parties_de_loperation(norme, propre):
    """Les deux parties d'une opération, ancrées sur leurs numéros.

    « from »/« de »/« par » désignent l'émetteur, « to »/« vers » le
    bénéficiaire. Le nom est tout ce qui suit le numéro jusqu'à la prochaine
    borne — chiffres compris : « GARANTIE EXCHANGE SARL 3 » ou « 3 FRERES »
    sont des noms, pas des morceaux de numéro de téléphone.

    Renvoie (emetteur, beneficiaire, position de la première partie).
    """
    emetteur = beneficiaire = None
    premiere = None
    for m in RE_PARTIE.finditer(norme):
        debut_nom = m.end("numero")
        fenetre = norme[debut_nom:debut_nom + 80]
        borne = RE_FIN_NOM.search(fenetre)
        fin_nom = debut_nom + (borne.start() if borne else len(fenetre))
        nom = _nettoyer_nom(_morceau(norme, propre, debut_nom, fin_nom))
        partie = Partie(re.sub(r"\s+", "", m.group("numero")), nom)
        if m.group("role") in ("from", "de", "par", "by"):
            if emetteur is None:
                emetteur, premiere = partie, premiere if premiere is not None else m.start()
        elif beneficiaire is None:
            beneficiaire, premiere = partie, premiere if premiere is not None else m.start()
    return emetteur, beneficiaire, premiere


def _operation_structuree(norme, propre, texte):
    """L'opération à deux parties — transfert, dépôt, retrait, CashIn/Out —
    lue comme un document : geste + réussite + parties numérotées + champs.

    Renvoie (paiement, definitif). `definitif` à True quand l'opération est
    avérée : soit elle est comprise (paiement), soit son montant est
    illisible et il n'y a rien d'autre à tenter — on n'invente jamais.
    À False, la lecture simple (un verbe, un montant) garde sa chance.

    Le sens n'est pas déterminé ici. Le SMS dit qui envoie et qui reçoit, pas
    laquelle des deux lignes est la nôtre : `preciser_sens()` s'en charge une
    fois les cartes connues.
    """
    geste = RE_GESTE.search(norme)
    if not geste:
        return None, False
    if not RE_REUSSITE.search(norme):
        # Sans mot de réussite, pas d'opération à deux parties : « Cash In of
        # 40000 FCFA. » se lira plus bas, par son verbe.
        return None, False

    emetteur, beneficiaire, premiere = _parties_de_loperation(norme, propre)
    if not (emetteur or beneficiaire):
        return None, False

    # Le montant : les champs étiquetés d'abord (le net d'Orange fait foi),
    # la tête de phrase ensuite (« Depot de 50000 FCFA vers … » — jamais plus
    # loin, pour ne pas confondre avec les frais ou le solde qui suivent),
    # un champ « Montant » isolé en dernier recours.
    net = _montant_nomme(RE_MONTANT_NET, norme)
    brut = _montant_nomme(RE_MONTANT_BRUT, norme)
    montant = net if net is not None else brut
    if montant is None and premiere is not None:
        # Un montant nu en tête — mais pas celui des frais : « Depot reussi.
        # Frais: 100 FCFA. Montant: 5000 FCFA. vers … » plaçait le prix du
        # service avant la somme, et c'est lui qu'on lisait.
        montant = _sans_voisin(RE_MONTANT_SEUL, RE_MONTANT_ETRANGER,
                               norme, 15, geste.end(), premiere)
    if montant is None:
        montant = _montant_simple(norme)
    if not montant:
        # Illisible OU nul : un mouvement de 0 FCFA n'existe pas — même
        # règle que la lecture simple, on renonce plutôt que d'annoncer
        # « Encaissement — 0 FCFA » et d'en tirer un document.
        return None, True

    return Paiement(
        sens=None, montant=montant, texte=texte,
        reference=_reference(norme, propre),
        solde_apres=_solde_du_message(norme),
        frais=_montant_nomme(RE_FRAIS, norme),
        commission=_montant_nomme(RE_COMMISSION, norme),
        montant_brut=brut, quand=_horodatage(norme),
        emetteur=emetteur, beneficiaire=beneficiaire), True


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

    # Une opération échouée ou annulée n'est pas un mouvement — pour la boîte
    # de réception et le bilan autant que pour les reçus. Le verdict est ici,
    # à la source, pour que tous en héritent.
    if est_echec(norme):
        return None

    paiement, definitif = _operation_structuree(norme, propre, texte)
    if paiement is not None:
        paiement.preciser_sens(numeros)
        return paiement
    if definitif:
        return None

    # La lecture simple : un verbe, un montant tout près. C'est elle — et
    # elle seule — que la réclame peut imiter (« gagnez 1000 FCFA ») : le
    # rejet du bruit ne s'applique donc qu'ici, jamais à une opération
    # complète dont le client s'appellerait « BONUS SARL ».
    if RE_BRUIT.search(norme):
        return None

    # Les guichets de l'agent MTN : la tournure complète donne le sens —
    # le verbe seul (« cash in » = entrée ?) mentirait sur une ligne
    # d'agent. « Added commission » est un gain de l'agent, pas des frais.
    if RE_CASH_OUT_ENTRANT.search(norme) and RE_REUSSITE.search(norme):
        montant = _montant_simple(norme)
        if montant:
            nom, numero = _extraire_tiers(norme, propre)
            return Paiement(
                sens="entree", montant=montant, texte=texte,
                nom=nom, numero=numero,
                reference=_reference(norme, propre),
                solde_apres=_solde_du_message(norme),
                quand=_horodatage(norme),
                commission=_montant_nomme(RE_COMMISSION, norme))
    cash_in = RE_CASH_IN_SORTANT.search(norme)
    if (cash_in and RE_REUSSITE.search(norme)
            and not re.search(r"\b(?:recu|receive[sd]?|credite[d]?)\b", norme)):
        montant = _nombre(cash_in.group(1))
        if montant:
            nom, numero = _extraire_tiers(norme, propre)
            return Paiement(
                sens="sortie", montant=montant, texte=texte,
                nom=nom, numero=numero,
                reference=_reference(norme, propre),
                solde_apres=_solde_du_message(norme),
                quand=_horodatage(norme),
                commission=_montant_nomme(RE_COMMISSION, norme))

    entree = RE_RECU.search(norme)
    sortie = RE_ENVOYE.search(norme)
    # Quand les DEUX tournures sont présentes — « Vous avez envoyé 20000 FCFA…
    # le bénéficiaire a reçu 20000 FCFA » — c'est le verbe de TÊTE qui dit
    # l'opération, jamais celui du bénéficiaire cité ensuite. Sans cette règle,
    # un envoi passait pour un encaissement : le bilan gonflait et le reçu
    # affichait « Montant reçu » sur un débit. (Même principe que le premier
    # geste dans categoriser().)
    if entree and sortie:
        if sortie.start() < entree.start():
            entree = None
        else:
            sortie = None
    trouve = entree or sortie
    if not trouve:
        return None

    montant = _nombre(trouve.group(1))
    if not montant:
        return None     # sans montant fiable, on n'invente pas

    nom, numero = _extraire_tiers(norme, propre)
    frais = RE_FRAIS.search(norme) or RE_COMMISSION.search(norme)

    return Paiement(
        sens="entree" if entree else "sortie",
        montant=montant,
        texte=texte,
        nom=nom,
        numero=numero,
        reference=_reference(norme, propre),
        solde_apres=_solde_du_message(norme),
        frais=_nombre(frais.group(1)) if frais else None,
        commission=_montant_nomme(RE_COMMISSION, norme),
        quand=_horodatage(norme),
    )


def _marqueurs_dargent(norme):
    """Ce message parle-t-il d'une opération d'argent, même mal lu ?

    Deux indices, chacun suffisant : un geste d'opération accompagné d'un
    montant en devise ou d'une partie numérotée (un transfert amputé de sa
    seconde moitié garde ses parties), ou au moins deux champs étiquetés
    d'argent — la signature du détail d'Orange, même quand l'en-tête s'est
    perdu (SMS multipart amputé de sa première moitié).
    """
    if len(RE_CHAMP_ARGENT.findall(norme)) >= 2:
        return True
    return bool(_parle_dune_operation(norme)
                and (RE_MONTANT_SEUL.search(norme)
                     or RE_PARTIE.search(norme)))


def solde_annonce(texte):
    """Le solde d'un SMS qui ne parle que de ça : « Le solde de votre compte
    est de 2784137.6FCFA. »

    Renvoie None dès qu'il s'agit d'autre chose — un paiement, une publicité,
    un code, une opération échouée. Le solde d'un SMS de transfert se lit dans
    `Paiement.solde_apres` ; ici on ne veut que l'interrogation pure, celle
    qui suit un `#150#`.

    Le refus des marqueurs d'argent n'est pas une redite : un transfert que
    le lecteur n'a pas su lire — ou dont il ne reste que la seconde moitié —
    porte souvent un « Nouveau solde ». En faire une interrogation de solde,
    c'était fabriquer un document de solde sur un transfert. C'est le bug
    vécu d'août 2026 : plus jamais.
    """
    if not texte or not texte.strip():
        return None
    norme = _normaliser(texte)
    if RE_BRUIT.search(norme) or RE_CODE_UNIQUE.search(norme):
        return None
    # « Solde insuffisant », « échec » : ce solde-là raconte un raté, pas un
    # relevé. Ici le mot suffit (hors phrase conditionnelle) : un message qui
    # ne parle que d'un solde ne porte aucun nom de client pour le déguiser.
    if _echec_constate(norme):
        return None
    # Un geste d'opération CONSTATÉ — « Pour un retrait, composez le #150# »
    # au pied du relevé est une réclame de l'opérateur, pas une opération.
    if _parle_dune_operation(norme):
        return None
    if RE_RECU.search(norme) or RE_ENVOYE.search(norme):
        return None
    # Le relevé étiqueté passe AVANT le refus des deux champs d'argent :
    # « Current balance: 8910 FCFA ; Airtime balance: 7,943 FCFA ; … » porte
    # bien plusieurs montants, mais chaque étiquette lève l'ambiguïté — le
    # porte-monnaie fait foi, jamais le crédit d'appel ni la commission.
    for motif in RE_SOLDES_ETIQUETES:
        m = motif.search(norme)
        if m:
            return _nombre(m.group(1))
    if len(RE_CHAMP_ARGENT.findall(norme)) >= 2:
        return None
    # Un « balance » nu, mais jamais celui du crédit d'appel : un relevé qui
    # ne parle QUE d'airtime n'annonce aucun solde de porte-monnaie, et mieux
    # vaut n'en annoncer aucun que d'afficher le crédit téléphonique comme
    # l'argent du compte.
    solde = _sans_voisin(RE_SOLDE, RE_SOLDE_ETRANGER, norme)
    if solde is None:
        solde = _sans_voisin(RE_SOLDE_SEUL, RE_SOLDE_ETRANGER, norme)
    return solde


def categoriser(texte, numeros=()):
    """Range un SMS reçu dans une catégorie, pour la boîte de réception.

    Rien n'est jeté : la catégorie n'est qu'une aide à la lecture et au tri.
    Un SMS reste toujours consultable en entier, quelle que soit sa catégorie.

    Les valeurs possibles :
      encaissement · envoi · transfert · depot · retrait  — des mouvements
      solde     — une interrogation de solde (« #150# »)
      echec     — une opération échouée ou annulée : rien ne s'est passé
      code      — un code à usage unique (masqué)
      publicite — une réclame de l'opérateur
      illisible — le message parle d'argent, le lecteur n'a pas tout compris
      message   — un SMS quelconque (de n'importe qui)

    Trois principes d'ordre :
      - l'argent se tranche d'ABORD : un motif publicitaire ne peut jamais
        requalifier un vrai paiement (« 2 millions », « gagné »…) ;
      - l'échec avant le solde : « CashOut failed … Your balance is 1200 »
        est un retrait raté, pas un relevé ;
      - l'illisible avant tout repli : un message qui parle d'argent sans
        être compris le DIT, plutôt que de se déguiser en solde, en réclame
        ou en message quelconque. C'est la leçon du transfert vers
        « GARANTIE EXCHANGE SARL 3 » — un chiffre dans le nom du client, et
        un million de FCFA devenait une interrogation de solde.
    """
    if not texte or not texte.strip():
        return "message"
    if code_a_usage_unique(texte):
        return "code"
    norme = _normaliser(texte)
    paiement = analyser(texte, numeros=numeros)
    if paiement is not None:
        # Le PREMIER geste du message dit l'opération : dans un SMS
        # d'opérateur, le verbe précède toujours les noms. Chercher les
        # mots-clés n'importe où faisait d'un transfert vers « L'OREAL 237
        # DEPOT 5 » un dépôt — le nom du client n'a pas voix au chapitre.
        geste = RE_GESTE.search(norme)
        mot = re.sub(r"\s+", "", geste.group(0)) if geste else ""
        if mot in ("depot", "deposit", "cashin"):
            return "depot"
        if mot == "cashout" or mot.startswith(("retrait", "withdraw")):
            return "retrait"
        if mot in ("transfert", "transfer"):
            return "transfert"
        if re.search(r"\bretire\b", norme):     # « Vous avez retiré … »
            return "retrait"
        if paiement.sens == "entree":
            return "encaissement"
        if paiement.sens == "sortie":
            return "envoi"
        return "transfert"      # deux parties nommées, sens encore indéterminé
    if est_echec(norme) and (RE_GESTE.search(norme) or RE_RECU.search(norme)
                             or RE_ENVOYE.search(norme)
                             or RE_MONTANT_SEUL.search(norme)):
        return "echec"
    if solde_annonce(texte) is not None:
        return "solde"
    # La réclame AVANT l'illisible : les opérateurs vantent leurs transferts
    # à longueur de SMS (« Le transfert à 0 FCFA de frais ce weekend ! »), et
    # chacun aurait sonné l'alerte du message d'argent illisible — des
    # fausses alarmes qui auraient appris au propriétaire à ignorer la vraie.
    # Un VRAI mouvement ne passe jamais par ici : compris, il est déjà rendu
    # plus haut, réclame ou pas (« BONUS SARL » paie comme tout le monde).
    if RE_BRUIT.search(norme) or RE_PUB.search(norme):
        return "publicite"
    if _marqueurs_dargent(norme):
        return "illisible"
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


# Le SMS n'est JAMAIS modifié : il appartient au propriétaire, codes compris.
# `masquer_secrets`, qui remplaçait le code par des points avant l'écriture au
# journal, a été retiré — cacher au propriétaire son propre code de connexion
# l'empêchait de s'en servir. `code_a_usage_unique` demeure : il ne cache
# rien, il sert seulement à ranger le SMS dans la catégorie « code » (une
# icône, pas de reçu) et se lit en entier comme les autres.


__all__ = ["Paiement", "Partie", "analyser", "solde_annonce", "categoriser",
           "code_a_usage_unique", "est_echec", "formater_montant"]
