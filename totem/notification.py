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


def envoyer(jetons, titre, corps, ouvrir=None):
    """Pousse la notification vers les appareils enregistrés.

    Rend le nombre d'appareils servis. Une panne du guichet n'est jamais
    fatale : la notification est un confort, le journal reste la vérité.
    """
    jetons = [j for j in jetons if isinstance(j, str) and j.startswith("Expo")]
    if not jetons or not corps:
        return 0

    servis = 0
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
                if reponse.status < 300:
                    servis += len(lot)
        except (urllib.error.URLError, OSError, TimeoutError):
            # Réseau coupé, guichet muet : on n'insiste pas. Le SMS est déjà
            # dans le journal et dans Telegram ; la notification n'était que
            # le raccourci.
            pass
    return servis
