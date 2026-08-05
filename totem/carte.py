# -*- coding: utf-8 -*-
"""L'identité d'une carte SIM.

Trois numéros cohabitent dans un modem, et on les confond facilement :

  - **IMEI** : le numéro du *modem*. Il ne bouge pas quand on change de carte.
  - **ICCID** : le numéro de série gravé sur la *carte*, unique au monde.
    Deux SIM MTN achetées le même jour au même guichet ont des ICCID
    différents. C'est **l'identité de la carte**, et donc la clé de tout ce
    qui doit rester cloisonné : l'historique, les encaissements, les soldes.
  - **IMSI** : l'identité de l'*abonné* sur le réseau. Ses cinq premiers
    chiffres donnent le pays et l'opérateur d'origine (624-01 = MTN Cameroun).

Pourquoi l'opérateur se lit sur l'IMSI et jamais sur le réseau
--------------------------------------------------------------
Le nom du réseau (« AT+COPS? ») est celui sur lequel le modem est *enregistré
en ce moment*. En itinérance c'est l'opérateur du pays visité : une SIM MTN
Cameroun essayée en France répond « Orange F ». S'y fier renommerait le compte
« Orange » pendant les essais, puis « MTN » à l'arrivée à Douala — deux comptes
dans la base pour une seule carte, et l'historique coupé en deux le jour même
de la mise en production. L'IMSI, lui, est gravé sur la carte et ne change
nulle part.

Le réseau visité n'est pas jeté pour autant : il devient une information
d'itinérance, affichée telle quelle.
"""

from .textes import t

# MCC+MNC → nom court de l'opérateur d'origine de la carte.
# Le Cameroun d'abord (c'est là que vivent les SIM), la France ensuite
# (c'est là que se font les essais avant expédition).
RESEAUX = {
    "62401": "MTN",        # MTN Cameroon
    "62402": "Orange",     # Orange Cameroun
    "62404": "Nexttel",    # Nexttel (Viettel)
    "62407": "Camtel",     # Camtel / Blue
    "20801": "Orange F",   # Orange France
    "20802": "Orange F",
    "20810": "SFR",
    "20813": "SFR",
    "20815": "Free",
    "20820": "Bouygues",
}


def operateur_depuis_imsi(imsi):
    """« 624011234567890 » → « MTN ». None si l'IMSI est absent ou inconnu."""
    if not imsi or len(imsi) < 5:
        return None
    return RESEAUX.get(imsi[:5])


def _depuis_nom_reseau(nom):
    """Repli quand l'IMSI ne dit rien : deviner d'après le nom du réseau."""
    majuscules = (nom or "").upper()
    if "MTN" in majuscules:
        return "MTN"
    if "ORANGE" in majuscules:
        return "Orange"
    return None


def masquer(iccid):
    """« 8923701234567890123 » → « ·8901 ».

    Les quatre derniers chiffres suffisent à distinguer deux cartes du même
    opérateur à l'œil nu, et ne permettent pas de reconstituer le numéro de
    série complet s'ils traînent dans une conversation ou une capture d'écran.
    """
    return ("·" + iccid[-4:]) if iccid else "?"


class Carte:
    """Ce qu'on sait de la SIM présente dans un modem, à un instant donné."""

    __slots__ = ("iccid", "imsi", "numero", "reseau", "itinerance")

    def __init__(self, iccid="", imsi="", numero="", reseau="", itinerance=False):
        self.iccid = (iccid or "").strip()
        self.imsi = (imsi or "").strip()
        self.numero = (numero or "").strip()
        self.reseau = (reseau or "").strip()   # réseau visité, tel qu'annoncé
        self.itinerance = bool(itinerance)

    # ---- noms -------------------------------------------------------------
    @property
    def operateur(self):
        """« MTN », « Orange »… — l'opérateur d'origine de la carte."""
        return (operateur_depuis_imsi(self.imsi)
                or _depuis_nom_reseau(self.reseau)
                or self.reseau
                or t("unknown SIM", "SIM inconnue"))

    @property
    def libelle(self):
        """Nom court affiché partout : « MTN ·8901 ».

        L'opérateur seul ne suffit pas : deux cartes MTN qui se succèdent dans
        le berceau porteraient le même nom, et leurs historiques se
        mélangeraient à l'écran. Les quatre derniers chiffres de l'ICCID les
        séparent sans rien révéler.
        """
        if not self.iccid:
            return self.operateur
        return f"{self.operateur} {masquer(self.iccid)}"

    @property
    def description(self):
        """Ligne lisible pour le diagnostic, itinérance comprise."""
        if self.itinerance and self.reseau:
            return t(f"{self.libelle} (roaming on {self.reseau})",
                     f"{self.libelle} (itinérance sur {self.reseau})")
        return self.libelle

    # ---- comparaison ------------------------------------------------------
    @property
    def identifiee(self):
        """Faux quand l'ICCID n'a pas pu être lu : on ne peut alors ni
        cloisonner l'historique, ni détecter un changement de carte."""
        return bool(self.iccid)

    def meme_carte(self, autre):
        """Deux lectures désignent-elles la même puce physique ?

        Sans ICCID des deux côtés, on ne conclut pas : répondre « oui » ferait
        passer un changement de carte inaperçu, répondre « non » déclencherait
        une fausse alerte à chaque lecture ratée. On répond None.
        """
        if not autre or not self.identifiee or not autre.identifiee:
            return None
        return self.iccid == autre.iccid

    def en_dict(self):
        return {
            "iccid": self.iccid,
            "imsi": self.imsi,
            "numero": self.numero,
            "operateur": self.operateur,
            "libelle": self.libelle,
            "reseau": self.reseau,
            "itinerance": self.itinerance,
        }

    def __bool__(self):
        return bool(self.iccid or self.imsi or self.reseau)

    def __repr__(self):
        return f"<Carte {self.description}>"
