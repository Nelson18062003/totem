"""Faire sonner le téléphone quand quelque chose arrive.

Le robot de Douala envoie lui-même les notifications, plutôt qu'une fonction
posée dans le nuage. Trois raisons, et la première suffirait :

  1. **Il est le seul à savoir ce qu'il n'a PAS compris.** `analyse_sms` rend
     `None` dans le doute ; cette ignorance-là est la matière première d'une
     notification honnête, et elle vit ici. Une fonction du nuage ne verrait
     que la ligne écrite en base, sans savoir ce qui a été perdu en chemin.
  2. Il a déjà la file d'attente : une coupure Internet ne perd rien.
  3. Une pièce mobile de moins.

CE QUI NE DOIT JAMAIS ENTRER DANS UNE NOTIFICATION

Une notification s'affiche sur un écran VERROUILLÉ, dans un taxi, sur une
table de réunion. Elle se lit sans le téléphone en main. D'où trois règles :

  — **jamais le code secret**, ni un code à usage unique, ni les chiffres
    d'un SMS qui en porte un. Le texte d'un tel message ne sort pas d'ici ;
  — **jamais un montant douteux présenté comme certain.** Si le sens n'est
    pas connu, on ne dit ni « reçu » ni « envoyé » ; si le montant n'a pas
    été lu, on ne l'invente pas ;
  — **jamais le SMS entier.** La notification annonce, elle ne remplace pas
    le journal. C'est l'application qui montre le message.
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


def _fcfa(montant):
    """« 20 000 FCFA » — le nombre entier, jamais abrégé."""
    return f"{montant:,}".replace(",", " ") + " FCFA"


def composer(paiement, expediteur, libelle, categorie=None, anglais=False):
    """Le titre et le corps d'une notification, ou `None` s'il ne faut RIEN
    envoyer.

    `paiement` est ce que `analyse_sms.analyser` a compris — souvent `None`.
    `categorie` est ce que `categoriser` a deviné, et c'est elle qui protège
    les codes.
    """
    def t(en, fr):
        return en if anglais else fr

    # UN CODE NE SORT PAS. Ni son texte, ni ses chiffres, ni même une
    # allusion à sa valeur. On dit qu'il est arrivé, c'est tout : le
    # propriétaire ouvrira l'application s'il en a besoin.
    if categorie == "code":
        return (libelle, t(f"A code from {expediteur}",
                           f"Un code de {expediteur}"))

    if paiement is None:
        # Le robot n'a pas lu de mouvement. On le dit ainsi, sans montant et
        # sans le texte du message : il peut contenir n'importe quoi.
        if categorie == "illisible":
            return (libelle, t(
                f"A money message from {expediteur} I could not read",
                f"Un message d'argent de {expediteur} que je n'ai pas su lire"))
        return (libelle, t(f"A message from {expediteur}",
                           f"Un message de {expediteur}"))

    # Un mouvement compris, mais sans montant lu : on ne l'invente pas.
    if paiement.montant is None:
        return (libelle, t(f"A movement from {expediteur}, amount unread",
                           f"Un mouvement de {expediteur}, montant non lu"))

    somme = _fcfa(paiement.montant)
    tiers = paiement.tiers

    if paiement.sens == "entree":
        return (libelle, t(f"+{somme} from {tiers}", f"+{somme} de {tiers}"))
    if paiement.sens == "sortie":
        return (libelle, t(f"−{somme} to {tiers}", f"−{somme} vers {tiers}"))

    # Le sens n'est pas établi — Orange nomme les deux parties sans dire
    # laquelle est la nôtre. On annonce le MOUVEMENT, sans signe : « reçu »
    # sur un envoi serait un mensonge, et l'inverse aussi.
    return (libelle, t(f"Movement of {somme} · {tiers}",
                       f"Mouvement de {somme} · {tiers}"))


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
