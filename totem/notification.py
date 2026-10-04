"""Faire sonner le téléphone quand quelque chose arrive.

Le robot de Douala envoie lui-même les notifications, plutôt qu'une fonction
posée dans le nuage. Trois raisons, et la première suffirait :

  1. **Il est le seul à savoir ce qu'il n'a PAS compris.** `analyse_sms` rend
     `None` dans le doute ; cette ignorance-là est la matière première d'une
     notification honnête, et elle vit ici. Une fonction du nuage ne verrait
     que la ligne écrite en base, sans savoir ce qui a été perdu en chemin.
  2. Il a déjà la file d'attente : une coupure Internet ne perd rien. La
     sonnerie qu'elle a empêchée est retenue, et repart au retour du réseau
     (voir `Robot._rattraper_les_sonneries` et `composer_rattrapage`).
  3. Une pièce mobile de moins.

CE QU'UNE NOTIFICATION MONTRE

Le message reçu, tel qu'il est arrivé — en aperçu, comme WhatsApp ou
l'application SMS du téléphone. C'est le message du propriétaire, sur sa
carte : il doit pouvoir le lire depuis le volet des notifications, code
compris, sans même ouvrir l'application. On avait un temps résumé le SMS et
masqué ses codes « pour l'écran verrouillé » ; personne ne l'avait demandé,
et c'était une faute — on la retire. Le propriétaire décide de ce qui
s'affiche sur son écran verrouillé, dans les réglages de SON téléphone, comme
pour toute autre application.

Deux choses seulement encadrent l'aperçu, et aucune ne cache le message :

  — **on n'invente rien.** On montre le texte reçu ; on ne calcule pas un
    montant ni un sens qu'on présenterait comme certains. Ce que le
    propriétaire lit, c'est l'opérateur qui l'a écrit ;
  — **c'est un aperçu.** Un SMS très long est coupé — le journal de
    l'application garde le message entier. Android montre le début sur le
    volet replié et déroule le reste quand on tire dessus.

Le code SECRET que le propriétaire tape pendant une opération, lui, n'entre
jamais nulle part : mais il n'arrive pas non plus par SMS — il vit dans les
sessions USSD, pas dans les messages reçus. Un aperçu de SMS ne peut donc pas
le porter.
"""

import json
import urllib.error
import urllib.request

# Le guichet d'envoi d'Expo. Gratuit, et sans clé : c'est le JETON DE
# L'APPAREIL qui autorise l'envoi, et il n'est connu que de l'appareil et de
# nous. Voir docs/MOBILE.md.
GUICHET_EXPO = "https://exp.host/--/api/v2/push/send"
# Les ACCUSÉS DE RÉCEPTION : ce qu'Apple et Google ont fait du billet.
ACCUSES_EXPO = "https://exp.host/--/api/v2/push/getReceipts"

# Expo accepte cent messages par requête. On n'en aura jamais autant — un
# propriétaire, deux ou trois téléphones — mais la borne évite qu'un jour un
# envoi parte en mille morceaux.
PAR_LOT = 100

DELAI = 10  # secondes : au-delà, la notification n'en vaut plus la peine


# Longueur de l'aperçu. Un SMS d'opérateur tient très largement en dessous ;
# au-delà, on coupe, car une notification est un aperçu — le journal de
# l'application garde le message entier. Android montre le début sur le volet
# replié et déroule le reste quand on tire dessus : c'est là qu'on lit son
# message sans ouvrir l'application.
APERCU_MAX = 200


def _apercu(texte):
    """Le message reçu, prêt pour le volet : sauts de ligne aplatis, espaces
    normalisés, et coupé s'il est très long. On ne réécrit rien d'autre — ce
    sont les mots reçus, pas les nôtres.
    """
    resume = " ".join((texte or "").split())
    if len(resume) > APERCU_MAX:
        resume = resume[:APERCU_MAX - 1].rstrip() + "…"
    return resume


def composer(expediteur, libelle, texte, anglais=False):
    """Le titre et le corps d'une notification, ou `None` s'il ne faut RIEN
    envoyer.

    Le titre est la carte concernée ; le corps est le MESSAGE REÇU, en aperçu,
    tel qu'il est arrivé — code compris. C'est le message du propriétaire : il
    le lit depuis le volet des notifications, sans ouvrir l'application. On ne
    cache rien et on n'invente rien.
    """
    def t(en, fr):
        return en if anglais else fr

    apercu = _apercu(texte)
    if apercu:
        return (libelle, apercu)

    # Cas défensif : pas de texte sous la main (un SMS vide, illisible à
    # l'octet). On annonce au moins qu'un message est arrivé, sans rien
    # inventer de son contenu.
    return (libelle, t(f"A message from {expediteur}",
                       f"Un message de {expediteur}"))


# Ce qu'Expo répond quand il refuse de servir un appareil, dit avec des mots
# d'ici. Ces codes s'écrivent dans le journal du robot — celui que le
# propriétaire lit sur la page « Ce qui s'est passé » — et il n'est pas
# informaticien : « InvalidCredentials » ne désigne rien pour lui.
CAUSES = {
    "DeviceNotRegistered": "l'application n'est plus installée sur ce téléphone",
    "InvalidCredentials": "la clé du service de notification manque au projet",
    "MismatchSenderId": "le téléphone est inscrit sous un autre projet",
    "MessageRateExceeded": "trop de notifications d'affilée",
    "MessageTooBig": "le message était trop long",
}


def composer_rattrapage(sonneries, anglais=False, nom="TOTEM"):
    """La notification qui rattrape les sonneries qu'une coupure a retenues.

    `sonneries` : [(libellé de la carte, expéditeur, texte, paiement, heure)],
    de la plus ancienne à la plus récente. `heure` est l'heure de réception
    déjà écrite (« 14 h 05 »), ou None si on ne la sait pas. Le texte est
    déjà celui de l'écran verrouillé (code à usage unique masqué) : on ne le
    démasque pas ici.

    UNE seule notification : au retour du réseau, dix sonneries d'affilée
    noieraient le volet et ne diraient rien de plus. Elle dit combien, et de
    quoi — paiements reçus ou autres messages, comme l'a lu le robot — puis
    montre le DERNIER message tel qu'il est arrivé.

    ELLE DIT TOUJOURS QU'ELLE EST EN RETARD, même seule. Rejouée telle
    qu'elle serait partie à l'heure, une sonnerie retenue vingt-cinq minutes
    ressemblait trait pour trait à un paiement qui vient d'arriver — et au
    comptoir, quelqu'un peut montrer son téléphone qui sonne pour faire
    croire qu'il vient de payer.
    """
    if not sonneries:
        return None

    def t(en, fr):
        return en if anglais else fr

    libelles = {s[0] for s in sonneries}
    titre = sonneries[-1][0] if len(libelles) == 1 else nom
    _, expediteur, texte, _, heure = sonneries[-1]
    message = _apercu(texte) or t(f"A message from {expediteur}",
                                  f"Un message de {expediteur}")
    if len(sonneries) == 1:
        if heure:
            phrase = t(f"Received at {heure}, during the outage: ",
                       f"Reçu à {heure}, pendant la coupure : ")
        else:
            phrase = t("Received during the outage: ",
                       "Reçu pendant la coupure : ")
        return titre, _apercu(phrase + message)

    paiements = sum(1 for s in sonneries if s[3])
    autres = len(sonneries) - paiements
    if not autres:
        phrase = t(f"{paiements} payments received during the outage.",
                   f"{paiements} paiements reçus pendant la coupure.")
    elif not paiements:
        phrase = t(f"{autres} messages received during the outage.",
                   f"{autres} messages reçus pendant la coupure.")
    else:
        phrase = t(
            f"{paiements} payment{'s' if paiements > 1 else ''} and "
            f"{autres} message{'s' if autres > 1 else ''} received during "
            "the outage.",
            f"{paiements} paiement{'s' if paiements > 1 else ''} et "
            f"{autres} message{'s' if autres > 1 else ''} reçus pendant la "
            "coupure.")
    if heure:
        phrase += " " + t(f"Latest, at {heure}: ", f"Dernier, à {heure} : ")
    else:
        phrase += " " + t("Latest: ", "Dernier : ")
    return titre, _apercu(phrase + message)


# Ce que dit le journal quand le guichet a REÇU la notification mais que sa
# réponse s'est perdue : on ne sait pas si elle est partie.
PEUT_ETRE_PARTIE = "le guichet n'a pas répondu à temps — la notification est peut-être partie"


def _a_renvoyer_plus_tard(erreur):
    """Vrai seulement si la notification n'a SÛREMENT pas été servie, et
    qu'un nouvel essai a un sens : c'est la seule qu'on peut renvoyer plus
    tard sans risque de faire sonner deux fois.

    `urlopen` ne range dans `URLError` que ce qui échoue AVANT la fin de
    l'envoi : nom introuvable, connexion refusée, réseau injoignable, délai
    dépassé en se connectant. La requête n'est pas arrivée entière, le
    guichet n'a rien pu servir. Une réponse d'erreur (`HTTPError`) dit ce
    que le guichet en a fait : 5xx et 429, il ne l'a pas servie et le dit ;
    un autre refus (4xx) se répéterait à l'identique.

    Ce qui échoue APRÈS l'envoi — la réponse qui tarde au-delà du délai, la
    connexion coupée en la lisant — n'est PAS de ce côté-là : la requête est
    partie entière, et le guichet l'a peut-être servie. On l'avait comptée
    parmi les « injoignables », et la sonnerie rejouée au signe de vie
    suivant faisait sonner DEUX fois le même paiement, à l'identique : sur
    de l'argent, deux sonneries font croire à deux paiements.
    """
    if isinstance(erreur, urllib.error.HTTPError):
        return erreur.code >= 500 or erreur.code == 429
    return isinstance(erreur, urllib.error.URLError)


def _peut_etre_partie(erreur):
    """La requête est partie entière, et sa réponse s'est perdue."""
    return not isinstance(erreur, urllib.error.URLError)


def envoyer(jetons, titre, corps, ouvrir=None, acceptes=None, injoignables=None):
    """Pousse la notification vers les appareils enregistrés.

    Rend `(servis, soucis)` : combien d'appareils le guichet a ACCEPTÉS, et
    ce qu'il a répondu pour les autres. Une panne du guichet n'est jamais
    fatale : la notification est un confort, le journal reste la vérité.

    CE QUE CE COMPTE VALAIT AVANT, et pourquoi c'était un mensonge. Il
    faisait « servis += len(lot) » dès que la requête rendait un code
    inférieur à 300 — c'est-à-dire dès que le guichet avait ACCEPTÉ
    L'ENVELOPPE, sans jamais l'ouvrir. Or Expo répond 200 puis range, DANS
    LE CORPS, un billet par appareil : « je ne connais pas ce téléphone »,
    « ce projet n'a pas de clé ». Un iPhone dont le projet n'a pas de clé
    Apple comptait donc pour un appareil servi, à chaque paiement, pendant
    que rien ne sonnait — et le journal du robot n'en disait pas un mot.

    Le billet n'est pas encore l'accusé de remise : un billet accepté peut
    échouer plus loin (voir `web/lib/pousser.ts`, qui va chercher les
    accusés). Le robot, lui, ne guette rien : il envoie et passe au SMS
    suivant. Il dit donc « accepté », pas « remis » — et c'est déjà
    infiniment plus que ce qu'il disait.

    `acceptes`, s'il est donné, reçoit l'identifiant de chaque billet
    accepté : c'est avec lui qu'on ira chercher l'accusé (`lire_les_accuses`).

    `injoignables`, s'il est donné, reçoit les jetons qu'on n'a SÛREMENT pas
    pu remettre au guichet (voir `_a_renvoyer_plus_tard`) : réseau coupé avant
    l'envoi, ou guichet en panne qui le dit (5xx, 429). Ceux-là n'ont rien
    reçu, et réessayer plus tard a un sens — le robot retient la sonnerie.
    Un refus (4xx) se répéterait à l'identique ; une réponse perdue APRÈS
    l'envoi laisse la notification peut-être partie : ni l'un ni l'autre ne
    se renvoie.
    """
    jetons = [j for j in jetons if isinstance(j, str) and j.startswith("Expo")]
    if not jetons or not corps:
        return 0, []

    servis = 0
    soucis = []
    for depart in range(0, len(jetons), PAR_LOT):
        lot = [
            {
                "to": jeton,
                "title": titre,
                "body": corps,
                "sound": "default",
                # HAUTE PRIORITÉ, et ce n'est pas un détail : sans elle, la
                # notification voyage en priorité « normale », et Android ne
                # RÉVEILLE PAS un téléphone qui dort pour une priorité
                # normale — il la garde pour la prochaine fenêtre d'entretien,
                # trois à cinq minutes plus tard, parfois plus. C'est
                # exactement le retard qui a été constaté sur le terrain :
                # l'argent arrivait, le téléphone se taisait, et sonnait
                # ensuite « en retard » sans que rien ne semble cassé.
                # Un paiement est le cas d'école de la haute priorité : une
                # notification visible, attendue par une personne, qui perd
                # sa valeur en vieillissant. Telegram sonne à la seconde pour
                # la même raison.
                "priority": "high",
                # Android : le canal décide de la sonnerie et de la
                # discrétion. Celui-ci est déclaré par l'application.
                "channelId": "paiements",
                **({"data": {"ouvrir": ouvrir}} if ouvrir else {}),
            }
            for jeton in jetons[depart:depart + PAR_LOT]
        ]
        corps_requete = json.dumps(lot).encode("utf-8")
        requete = urllib.request.Request(
            GUICHET_EXPO, data=corps_requete,
            headers={"content-type": "application/json",
                     "accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(requete, timeout=DELAI) as reponse:
                if reponse.status >= 300:
                    soucis.append(f"le guichet a répondu {reponse.status}")
                    continue
                rendu = json.loads(reponse.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            # Réseau coupé, guichet muet : on n'insiste pas ici. Le SMS est
            # déjà dans le journal et dans Telegram ; et l'appelant, s'il le
            # demande, apprend quels téléphones n'ont SÛREMENT rien reçu.
            if isinstance(e, urllib.error.HTTPError):
                soucis.append(f"le guichet a répondu {e.code}")
            elif _peut_etre_partie(e):
                soucis.append(PEUT_ETRE_PARTIE)
            else:
                soucis.append("le guichet n'a pas répondu")
            if injoignables is not None and _a_renvoyer_plus_tard(e):
                injoignables.extend(m["to"] for m in lot)
            continue
        except (ValueError, UnicodeDecodeError):
            # Une réponse qu'on ne sait pas lire ne se compte pas comme une
            # réussite : c'est exactement l'erreur qu'on répare ici.
            soucis.append("le guichet a répondu quelque chose d'illisible")
            continue

        billets = rendu.get("data") if isinstance(rendu, dict) else None
        if not isinstance(billets, list):
            soucis.append("le guichet n'a rendu aucun billet")
            continue
        for billet in billets:
            if not isinstance(billet, dict):
                continue
            if billet.get("status") == "ok":
                servis += 1
                if acceptes is not None and isinstance(billet.get("id"), str):
                    acceptes.append(billet["id"])
                continue
            details = billet.get("details")
            code = details.get("error") if isinstance(details, dict) else None
            soucis.append(CAUSES.get(code, code or "refusé sans raison donnée"))
    return servis, soucis


def lire_les_accuses(billets):
    """Ce qu'Apple et Google ont fait des billets acceptés.

    Rend la liste des causes, une par billet REFUSÉ plus loin. Un accusé qui
    n'est pas encore revenu ne compte ni pour ni contre : on ne sait pas.

    POURQUOI CETTE LECTURE. Le guichet d'Expo accepte le billet tout de
    suite — c'est APRÈS qu'Apple refuse, quand le projet n'a pas de clé de
    notification. Ce refus ne s'écrit QUE dans l'accusé. Le robot ne le
    lisait jamais : sur un iPhone qui n'a jamais sonné, il comptait chaque
    paiement comme « servi », et son journal se taisait. C'était exactement
    la panne qu'on cherchait, et l'endroit où elle était écrite.
    """
    billets = [b for b in billets if isinstance(b, str) and b]
    if not billets:
        return []
    requete = urllib.request.Request(
        ACCUSES_EXPO, data=json.dumps({"ids": billets}).encode("utf-8"),
        headers={"content-type": "application/json", "accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(requete, timeout=DELAI) as reponse:
            if reponse.status >= 300:
                return []
            rendu = json.loads(reponse.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, TimeoutError, ValueError, UnicodeDecodeError):
        # Le guichet des accusés ne répond pas : on ne sait pas, et on ne
        # dit rien de plus que ce qu'on savait.
        return []
    accuses = rendu.get("data") if isinstance(rendu, dict) else None
    if not isinstance(accuses, dict):
        return []
    causes = []
    for billet in billets:
        accuse = accuses.get(billet)
        if not isinstance(accuse, dict) or accuse.get("status") != "error":
            continue
        details = accuse.get("details")
        code = details.get("error") if isinstance(details, dict) else None
        causes.append(CAUSES.get(code, code or "refusé sans raison donnée"))
    return causes
