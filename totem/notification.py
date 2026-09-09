"""Faire sonner le téléphone quand quelque chose arrive.

Le robot de Douala envoie lui-même les notifications, plutôt qu'une fonction
posée dans le nuage. Trois raisons, et la première suffirait :

  1. **Il est le seul à savoir ce qu'il n'a PAS compris.** `analyse_sms` rend
     `None` dans le doute ; cette ignorance-là est la matière première d'une
     notification honnête, et elle vit ici. Une fonction du nuage ne verrait
     que la ligne écrite en base, sans savoir ce qui a été perdu en chemin.
  2. Il a déjà la file d'attente : une coupure Internet ne perd rien.
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


def envoyer(jetons, titre, corps, ouvrir=None):
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
        except (urllib.error.URLError, OSError, TimeoutError):
            # Réseau coupé, guichet muet : on n'insiste pas. Le SMS est déjà
            # dans le journal et dans Telegram ; la notification n'était que
            # le raccourci.
            soucis.append("le guichet n'a pas répondu")
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
                continue
            details = billet.get("details")
            code = details.get("error") if isinstance(details, dict) else None
            soucis.append(CAUSES.get(code, code or "refusé sans raison donnée"))
    return servis, soucis
