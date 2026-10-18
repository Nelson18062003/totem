# -*- coding: utf-8 -*-
"""L'écran de l'opérateur, lu par le boîtier — la jumelle du noyau.

POURQUOI LE BOÎTIER LIT LUI-MÊME. Un transfert MTN par le menu, c'est cinq
écrans : le menu, « 5 », « 1 », le numéro, le montant. Chacun faisait
l'aller-retour entier — l'écran du téléphone dépose sa réponse sur la
plateforme, le boîtier la relève, la compose, rend l'écran suivant, que le
téléphone relit. Mesuré sur trente-cinq transferts d'octobre : MTN répond en
moins de deux secondes par écran, l'aller-retour en coûte cinq de plus, et le
transfert prenait cinquante et une secondes. Le boîtier enchaîne maintenant
lui-même les écrans prévus (`pilotage._enchainer`), sans repasser par
Internet entre deux.

MAIS IL DÉCIDE EXACTEMENT COMME L'ÉCRAN. Chaque pas automatique touche à
l'argent : un « 5 » sur un menu renuméroté ouvre une autre branche, un numéro
envoyé là où l'opérateur attendait le code secret brûle un essai. Le noyau
(web/noyau/ussd.ts et deroule.ts) tranche déjà ces questions, avec ses
témoins. Ce fichier en est la traduction, règle pour règle ; le corpus
`web/noyau/tests/ecrans-partages.json` est jugé par les deux, et si l'un
change sa règle sans l'autre, l'un des deux échoue.

DANS LE DOUTE, LE BOÎTIER S'ARRÊTE. Les expressions régulières de JavaScript
et de Python ne lisent pas tous les caractères pareil (« \\b » autour d'une
lettre accentuée, l'espace insécable de fin de fichier, les quatre lettres
que Python plie et pas JavaScript…). Ce fichier écrit ses classes à la main
pour coller au JavaScript, et un écran qui porte l'un des caractères où les
deux pourraient encore diverger n'est pas lu du tout : le boîtier rend la
main, l'écran du téléphone décide avec la règle d'origine. S'arrêter coûte
quelques secondes ; continuer à tort peut coûter un transfert.
"""

import re

# ---------------------------------------------------------------------------
# Les classes de JavaScript, écrites à la main
# ---------------------------------------------------------------------------

# « \b » de JavaScript : une frontière entre [A-Za-z0-9_] et le reste. Celui
# de Python voit aussi « é » comme une lettre : « pin » dans « épin » n'a pas
# la même frontière des deux côtés.
B = r"(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))"
# « \s » de JavaScript.
ESP = (r"[\t\n\x0b\x0c\r \xa0\u1680\u2000-\u200a\u2028\u2029"
       r"\u202f\u205f\u3000\ufeff]")
NON_ESP = (r"[^\t\n\x0b\x0c\r \xa0\u1680\u2000-\u200a\u2028\u2029"
           r"\u202f\u205f\u3000\ufeff]")

# Les caractères sur lesquels Python et JavaScript pourraient encore lire
# différemment : séparateurs que l'un compte comme espaces et pas l'autre
# (\x1c-\x1f, \x85, \ufeff), fins de ligne que l'un voit et pas l'autre
# (\u2028, \u2029), lettres que Python plie et pas JavaScript (İ ı ſ K), et
# tout caractère hors du plan de base (JavaScript le lit en deux moitiés).
RE_CARACTERE_DOUTEUX = re.compile(
    "[\x1c-\x1f\x85\ufeff\u2028\u2029\u0130\u0131\u017f\u212a"
    "\ud800-\udfff\U00010000-\U0010ffff]")


def lisible(texte):
    """Ce texte se lit-il de la même façon des deux côtés ?"""
    return not RE_CARACTERE_DOUTEUX.search(texte or "")


def _trim(texte):
    """`String.prototype.trim` — sur un texte `lisible`, `str.strip` lui
    est identique."""
    return texte.strip()


def _ri(motif):
    return re.compile(motif, re.I)


# ---------------------------------------------------------------------------
# web/noyau/ussd.ts
# ---------------------------------------------------------------------------

RECONNAISSANCE = (
    (_ri(r"num[ée]ro|b[ée]n[ée]ficiaire|abonn[ée]|destinataire|t[ée]l[ée]phone"
         r"|number|recipient|beneficiary|receiver|subscriber|phone|msisdn"
         rf"|mobile{ESP}+no"), "numero"),
    (_ri(rf"montant|somme|combien|amount|how{ESP}+much|{B}valeur{B}"
         rf"|{B}value{B}"), "montant"),
)

RE_PAS_UN_TELEPHONE = _ri(
    rf"factur|invoice|{B}bill{B}|r[ée]f[ée]rence|{B}ref{B}|{B}compte{B}"
    rf"|account|contrat|contract|compteur|meter|{B}carte{B}|{B}card{B}"
    rf"|{B}mois{B}|{B}months?{B}|{B}jours?{B}|{B}days?{B}|{B}id{B}"
    r"|identifiant|transaction|commande"
    rf"|{B}order{B}|dossier|ticket|police|policy|re[çc]u|receipt|s[ée]rie"
    rf"|serial|voucher|badge|{B}cni{B}|passeport|passport")

PAS_UNE_DATE = rf"(?![0-9]{{1,2}}[.\-/](?:[0-9]{{4}}{B}|[0-9]{{1,2}}(?![0-9.,])))"
SEPARATEUR = (rf"(?:[.)\-][ \t]*{PAS_UNE_DATE}"
              r"|:[ \t]*(?![0-9]{2}(?:[^0-9]|$)))")
RE_OPTION = re.compile(rf"^[ \t]*[0-9]{{1,2}}[ \t]*{SEPARATEUR}{NON_ESP}", re.M)

MENU_MINIMUM = 2


def _est_un_menu(texte):
    return len(RE_OPTION.findall(texte)) >= MENU_MINIMUM


RE_SECRET = _ri(
    rf"{B}n\.?i\.?p\.?{B}|(?:{B}|m|e-?)pin(?:[0-9]|_|code|{B})|{B}p\.i\.n{B}"
    rf"|{B}mdp{B}|{B}codes?{B}|secr[eè]t|confidentiel|confidential"
    rf"|mot[\t\n\x0b\x0c\r \xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f"
    rf"\u3000\ufeff-]*de[\t\n\x0b\x0c\r \xa0\u1680\u2000-\u200a\u2028\u2029"
    rf"\u202f\u205f\u3000\ufeff-]*passe|password|passcode|passphrase")

VERBES_SAISIE = (
    rf"entre[zr]|saisi(?:r|ssez)|tape[zr]|indique[zr]|r[ée]pond|veuillez"
    rf"|compose[zr]|renseigne[zr]|{B}enter{B}|{B}type{B}|reply|please|input"
    rf"|provide|{B}dial{B}")
VERBES_CHOIX = r"choisi(?:r|ssez)|choose|select"
RE_SAISIE = _ri(rf"{VERBES_SAISIE}|[?:]{ESP}*\Z")
RE_CHOIX_VERBE = _ri(VERBES_CHOIX)
RE_DEMANDE = _ri(rf"{VERBES_SAISIE}|{VERBES_CHOIX}|[?:]{ESP}*\Z")

RE_MISE_EN_GARDE = _ri(
    rf"jamais|never|ne{ESP}+(?:le{ESP}+|la{ESP}+|les{ESP}+)?"
    rf"(?:partag|communiqu|divulgu|donn|transm|r[ée]v[ée]l)"
    rf"|do{ESP}+not{ESP}+(?:share|disclose|give)"
    rf"|don'?t{ESP}+(?:share|disclose|give)")
RE_CODE_DONNE = _ri(
    rf"(?:{B}codes?{B}|{B}pin{B}|{B}n\.?i\.?p{B})"
    rf"(?:{ESP}+(?:de|du|d'|of|for){ESP}*[A-Za-zÀ-ÿ']+){{0,2}}"
    rf"{ESP}*(?::|=|est|is)?{ESP}*[0-9]{{4,}}")

RE_CONSEIL = _ri(
    rf"en{ESP}+cas{ESP}+d|pour{ESP}+annuler|pour{ESP}+toute"
    rf"|to{ESP}+(?:cancel|reverse)|in{ESP}+case{ESP}+of|if{ESP}+(?:this|you)"
    rf"|si{ESP}+(?:cette|vous)|annulation{ESP}+possible"
    rf"|(?:can|may){ESP}+be{ESP}+(?:cancel|revers)"
    rf"|peut{ESP}+(?:[êe]tre{ESP}+)?annul"
    rf"|expires?{ESP}+(?:dans|le|[àa]|in|on|at){B}|valable"
    rf"|valid{ESP}+(?:for|until)")
RE_CONSEIL_DEMANDE = _ri(
    rf"en{ESP}+cas{ESP}+d|pour{ESP}+annuler|pour{ESP}+toute"
    rf"|to{ESP}+(?:cancel|reverse)|in{ESP}+case{ESP}+of")

RE_REUSSIE = _ri(
    rf"succ[eè]s|r[ée]ussi|effectu[ée]"
    rf"|a{ESP}+[ée]t[ée]{ESP}+(?:envoy|transf|cr[ée]dit|d[ée]bit)"
    rf"|confirm[ée]e?{B}|successful|completed"
    rf"|has{ESP}+been{ESP}+(?:sent|transferred|credited)")
RE_REFUSEE = _ri(
    rf"[ée]chec|[ée]chou|refus|insuffisant|invalide|incorrect|erron|erreur"
    rf"|impossible|non{ESP}+autoris|expir|annul|failed|failure|error"
    rf"|insufficient|invalid|declined|not{ESP}+allowed|cancel")
SUCCES_NIE = (
    rf"(?:{B}non{ESP}+|{B}pas{ESP}+(?:[ée]t[ée]{ESP}+)?"
    rf"|n'a{ESP}+pas{ESP}+(?:[ée]t[ée]{ESP}+)?|{B}not{ESP}+(?:been{ESP}+)?"
    rf"|{B}un)(?:effectu|r[ée]ussi|successful|completed|confirm)")
RE_SUCCES_NIE = _ri(SUCCES_NIE)
RE_NOUVEL_ESSAI = _ri(
    rf"reste{ESP}+[0-9]+{ESP}+(?:essai|tentative)"
    rf"|[0-9]+{ESP}+(?:essais?|tentatives?|attempts?|tries){ESP}+"
    rf"(?:restant|remaining|left)"
    rf"|try{ESP}+again|r[ée]essa?y|retry|remaining{ESP}+attempts?"
    rf"|attempts?{ESP}+(?:remaining|left)")


def _phrases(texte):
    coupe = re.sub(r"([.!?;])[ \t]+", "\\1\n", texte)
    return [p for p in (_trim(x) for x in coupe.split("\n")) if p]


def _phrases_utiles(texte):
    return [p for p in _phrases(texte)
            if RE_SAISIE.search(p)
            or not (RE_MISE_EN_GARDE.search(p) or RE_CODE_DONNE.search(p))]


def _issue_de(texte):
    t = "\n".join(p for p in _phrases(texte) if not RE_CONSEIL.search(p))
    echec = bool(RE_SUCCES_NIE.search(t) or RE_REFUSEE.search(t))
    succes = bool(RE_REUSSIE.search(RE_SUCCES_NIE.sub(" ", t)))
    if echec and not succes:
        return "refusee"
    if succes and not echec:
        return "reussie"
    return None


def _demande_quelque_chose(texte):
    return any(not RE_CONSEIL_DEMANDE.search(p) and RE_DEMANDE.search(p)
               for p in _phrases(texte))


def _types_demandes(texte):
    types = []
    for p in _phrases(texte):
        if RE_CONSEIL_DEMANDE.search(p) or not RE_DEMANDE.search(p):
            continue
        for motif, genre in RECONNAISSANCE:
            if not motif.search(p):
                continue
            if genre == "numero" and RE_PAS_UN_TELEPHONE.search(p):
                continue
            if genre not in types:
                types.append(genre)
    return types


RE_LIGNE_CHOIX = re.compile(
    rf"^[ \t]*([0-9]{{1,2}})[ \t]*{SEPARATEUR}({NON_ESP}.*)$")

MOTS_DE_NAVIGATION = (
    rf"next|suivant|suite|la{ESP}+suite|page{ESP}+suivante|nxt|more|plus"
    rf"|back|retour|pr[ée]c[ée]dent|previous|prev|accueil|home"
    rf"|main{ESP}+menu|menu|confirm(?:er)?|valider|annuler|cancel|quitter"
    rf"|exit|oui|non|yes|no")
RE_NAVIGATION = _ri(rf"^(?:{MOTS_DE_NAVIGATION}){B}")
RE_LIGNE_SOUPLE = re.compile(
    rf"^[ \t]*([0-9]{{1,2}})[ \t]+(?=[A-Za-zÀ-ÿ])({NON_ESP}.*)$")
RE_LIGNE_NAVIGATION = _ri(
    rf"^[ \t]*([#*])[ \t]*(?:[.):\-][ \t]*|[ \t]+)"
    rf"(?=(?:{MOTS_DE_NAVIGATION}){B})({NON_ESP}.*)$")


def _est_un_menu_souple(texte):
    if _est_un_menu(texte):
        return True
    lignes = [l for l in texte.split("\n") if _trim(l)]
    for i in range(len(lignes) - 1):
        a = RE_LIGNE_SOUPLE.search(lignes[i])
        b = RE_LIGNE_SOUPLE.search(lignes[i + 1])
        if a and b and int(b.group(1)) == int(a.group(1)) + 1:
            return True
    return False


RE_CHOIX_SUIVANT = re.compile(
    r"[ \t]+(?=(?:[0-9]{1,2}|[#*])[.):>-][ \t]*[A-Za-zÀ-ÿ])")
RE_MORCEAU = re.compile(rf"^([0-9]{{1,2}}|[#*])[.):>-][ \t]*({NON_ESP}.*)$")


def _decouper_le_libelle(numero, libelle):
    morceaux = RE_CHOIX_SUIVANT.split(libelle)
    choix = [{"numero": numero, "libelle": _trim(morceaux[0])}]
    for morceau in morceaux[1:]:
        m = RE_MORCEAU.search(_trim(morceau))
        precedent = choix[-1]
        if m and (RE_NAVIGATION.search(m.group(2))
                  or _nombre(m.group(1)) == _nombre(precedent["numero"]) + 1):
            choix.append({"numero": m.group(1), "libelle": _trim(m.group(2))})
        else:
            precedent["libelle"] = f"{precedent['libelle']} {_trim(morceau)}"
    return choix


def _nombre(numero):
    """`Number()` de JavaScript : « # » et « * » ne sont pas des nombres, et
    NaN n'est égal à rien."""
    return int(numero) if numero.isdigit() else float("nan")


def _choix_de_la_ligne(ligne):
    m = (RE_LIGNE_CHOIX.search(ligne) or RE_LIGNE_SOUPLE.search(ligne)
         or RE_LIGNE_NAVIGATION.search(ligne))
    return _decouper_le_libelle(m.group(1), _trim(m.group(2))) if m else None


RE_NAV_COLLEE_SEPAREE = _ri(
    rf"(^|[.!?:;,][ \t]*|[ \t])([0-9]{{1,2}}|[#*])[ \t]*[.):>\-][ \t]*"
    rf"({MOTS_DE_NAVIGATION})[ \t]*>?[ \t]*$")
RE_NAV_COLLEE_ESPACEE = _ri(
    rf"([.!?:;,])[ \t]+([0-9]{{1,2}}|[#*])[ \t]+({MOTS_DE_NAVIGATION})"
    rf"[ \t]*>?[ \t]*$")
RE_TAPEZ_POUR = _ri(
    rf"(^|[.!?:;,][ \t]*)((?:reply|send|dial|press|enter|tapez|envoyez"
    rf"|composez|r[ée]pondez|appuyez{ESP}+sur){ESP}+([0-9]{{1,2}}|[#*])"
    rf"{ESP}+(?:for|to|pour){ESP}+[^.!?\n]+?)[ \t]*[.!]?[ \t]*$")
RE_LIGNE_NAVIGATION_SOUPLE = _ri(
    rf"^{ESP}*([0-9]{{1,2}}){ESP}+({MOTS_DE_NAVIGATION}){ESP}*$")


def _choix_de_fin(reste):
    derniere = reste[-1] if reste else ""
    if len(reste) >= 2:
        c = (RE_LIGNE_CHOIX.search(derniere)
             or RE_LIGNE_NAVIGATION.search(derniere)
             or RE_LIGNE_NAVIGATION_SOUPLE.search(derniere))
        if c:
            return (_decouper_le_libelle(c.group(1), _trim(c.group(2))),
                    reste[:-1])
    ligne = derniere
    choix = []
    for _ in range(4):
        m = (RE_NAV_COLLEE_SEPAREE.search(ligne)
             or RE_NAV_COLLEE_ESPACEE.search(ligne))
        if not m:
            break
        choix.insert(0, {"numero": m.group(2), "libelle": _trim(m.group(3))})
        ligne = _trim(ligne[:m.start()] + _trim(m.group(1)))
    if not choix:
        m = RE_TAPEZ_POUR.search(ligne)
        if m:
            choix.append({"numero": m.group(3), "libelle": _trim(m.group(2))})
            ligne = _trim(ligne[:m.start()] + _trim(m.group(1)))
    if not choix:
        return None
    return choix, [x for x in reste[:-1] + [ligne] if x]


def _decouper(source):
    menu = _est_un_menu_souple(source)
    choix, reste = [], []
    for ligne in source.split("\n"):
        c = _choix_de_la_ligne(ligne) if menu else None
        if c:
            choix.extend(c)
        elif _trim(ligne):
            reste.append(_trim(ligne))
    return choix, reste


def _code_demande(choix, reste):
    sujet = "\n".join(reste)
    if not RE_SECRET.search(sujet):
        return False
    utiles = _phrases_utiles(sujet)
    nomme = [p for p in utiles if RE_SECRET.search(p)]
    if not nomme and not any(RE_SAISIE.search(p) for p in utiles):
        return False
    vrais_choix = [c for c in choix if not RE_NAVIGATION.search(c["libelle"])]
    le_demande = any(RE_SAISIE.search(p) and not RE_CHOIX_VERBE.search(p)
                     for p in nomme)
    return not vrais_choix or le_demande


def demande_un_code(texte):
    """`demandeUnCode` : le réseau réclame-t-il le code secret ?"""
    return _code_demande(*_decouper((texte or "").replace("\r", "")))


def _lire_le_texte(brut):
    source = (brut or "").replace("\r", "")
    choix, reste = _decouper(source)
    texte = "\n".join(reste)
    parle_du_code = bool(RE_SECRET.search(source))
    if _code_demande(choix, reste):
        issue = _issue_de(texte)
        fin = (issue is not None and not _demande_quelque_chose(texte)
               and not RE_NOUVEL_ESSAI.search(texte))
        if not fin:
            return _ecran(texte, choix, "secret", None, True)
        return _ecran(texte, [], "rien", issue, True)
    if len(choix) >= MENU_MINIMUM:
        return _ecran(texte, choix, "choix", None, parle_du_code)
    fin = _choix_de_fin(reste)
    question = "\n".join(fin[1]) if fin else texte
    choix_fin = fin[0] if fin else []
    types = _types_demandes(question)
    if len(types) == 1:
        return _ecran(question, choix_fin, types[0], None, parle_du_code)
    if _demande_quelque_chose(question):
        return _ecran(question, choix_fin, "texte", None, parle_du_code)
    if fin:
        return _ecran(question, choix_fin, "choix", None, parle_du_code)
    return _ecran(texte, [], "rien", _issue_de(texte), parle_du_code)


def _ecran(texte, choix, attend, issue, parle_du_code):
    return {"texte": texte, "choix": choix, "attend": attend, "issue": issue,
            "parleDuCode": parle_du_code}


def lire_ecran(brut, reseau=None):
    """`lireEcran` : ce que l'opérateur demande, et ses choix."""
    lu = _lire_le_texte(brut)
    if reseau == "fini":
        if lu["attend"] == "rien":
            return lu
        texte = "\n".join(x for x in [lu["texte"]] + [
            f"{c['numero']}. {c['libelle']}" for c in lu["choix"]] if x)
        return _ecran(texte, [], "rien", _issue_de(lu["texte"]),
                      lu["parleDuCode"])
    if reseau == "attend" and lu["attend"] == "rien":
        attend = "secret" if demande_un_code(brut or "") else "texte"
        return {**lu, "attend": attend, "issue": None}
    return lu


def champ_pour_question(texte, restants):
    """`champPourQuestion` : le champ qui répond à cette question, ou None."""
    lu = _lire_le_texte(texte)
    if lu["parleDuCode"]:
        return None
    if lu["attend"] not in ("numero", "montant"):
        return None
    correspondants = [c for c in restants if c["type"] == lu["attend"]]
    return correspondants[0] if len(correspondants) == 1 else None


# ---------------------------------------------------------------------------
# web/noyau/deroule.ts
# ---------------------------------------------------------------------------

RE_CONFIRMATION = _ri("|".join([
    rf"{B}confirm",
    rf"{B}valid(?:er|ez|ate|ation){B}",
    rf"r[ée]pond(?:ez|re){ESP}+(?:par{ESP}+)?1{B}",
    rf"{B}reply{ESP}+(?:with{ESP}+)?1{B}",
    rf"{B}press{ESP}+1{B}",
    rf"{B}tape[zr]?{ESP}+1{B}",
    rf"{B}1{ESP}*[=:]{ESP}*(?:oui|yes|ok){B}",
    rf"{B}oui{ESP}*/{ESP}*non{B}",
    rf"{B}yes{ESP}*/{ESP}*no{B}",
]))


def est_une_confirmation(texte):
    return bool(RE_CONFIRMATION.search(texte or ""))


RE_NOMBRE = re.compile("[0-9](?:[0-9 \xa0\u202f.,]*[0-9])?")


def _nombres_du(texte):
    nombres = []
    for n in RE_NOMBRE.findall(texte or ""):
        n = re.sub(r"[^0-9]", "", re.sub(r"[.,][0-9]{2}\Z", "", n))
        if n:
            nombres.append(n)
    return nombres


def _sans_zeros(n):
    return re.sub(r"^0+(?=[0-9])", "", n)


def porte_la_valeur(texte, genre, valeur):
    """`porteLaValeur` : l'écran récapitule-t-il déjà cette valeur ?"""
    v = re.sub(r"[^0-9]", "", valeur or "")
    if not v:
        return False
    nombres = _nombres_du(texte)
    if genre == "numero":
        return any(len(n) >= len(v) and n.endswith(v) for n in nombres)
    return any(_sans_zeros(n) == _sans_zeros(v) for n in nombres)


def champ_a_servir(texte, reseau, restants, propres):
    """`champAServir` : le champ à envoyer TOUT SEUL à cet écran, ou None.

    `restants` : [{"cle", "type"}] ; `propres` : {cle: ce qui partirait}."""
    if not texte or reseau == "fini":
        return None
    if demande_un_code(texte):
        return None
    champ = champ_pour_question(texte, restants)
    if not champ:
        return None
    if lire_ecran(texte, reseau)["attend"] != champ["type"]:
        return None
    if est_une_confirmation(texte):
        return None
    valeur = propres.get(champ["cle"]) or ""
    if not valeur:
        return None
    if porte_la_valeur(texte, champ["type"], valeur):
        return None
    return champ


RE_TROU = re.compile(r"^\{([A-Za-z0-9_]+)\}$")


def etape_peut_partir(gabarit, texte, reseau):
    """`etapePeutPartir` : l'étape suivante d'un trajet appris peut-elle
    partir sur cet écran ? `gabarit` : l'étape telle qu'apprise (« 1 »,
    « {montant} »)."""
    if not texte or reseau == "fini":
        return False
    if demande_un_code(texte):
        return False
    lu = lire_ecran(texte, reseau)
    if lu["attend"] in ("rien", "secret"):
        return False
    g = _trim(gabarit or "")
    trou = RE_TROU.match(g)
    if trou:
        genre = "montant" if trou.group(1) == "montant" else "numero"
        return (not lu["choix"] and not est_une_confirmation(texte)
                and lu["attend"] in (genre, "texte"))
    return any(c["numero"] == g for c in lu["choix"])
