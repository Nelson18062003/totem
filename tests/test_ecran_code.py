# -*- coding: utf-8 -*-
"""L'écran des six chiffres tient-il ses promesses, ou seulement ses phrases ?

Tout ce que cet écran promet peut se casser en silence. Un `maxLength` ajouté
« pour aider », six petites cases trouvées jolies, un `type="password"` mis par
réflexe, un refus qu'on rend plus « clair » en disant que le code avait déjà
servi, un contrôle de lenteur déplacé de trois lignes vers le bas : aucune de
ces fautes ne fait échouer une compilation, aucune ne se voit sur une capture
d'écran, et chacune retire quelque chose à quelqu'un.

Ce test lit les fichiers de l'écran et des deux routes, et vérifie les six
règles qui n'ont pas d'autre gardien.
"""

import re
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
WEB = RACINE / "web"
ECRAN = WEB / "app" / "invitation" / "[jeton]" / "code"
FORMULAIRE = ECRAN / "formulaire.tsx"
PAGE = ECRAN / "page.tsx"
VERIFIER = WEB / "app" / "api" / "code" / "verifier" / "route.ts"
DEMANDER = WEB / "app" / "api" / "code" / "demander" / "route.ts"
TEXTES = WEB / "lib" / "textes" / "code.ts"


def lu(fichier):
    return fichier.read_text(encoding="utf-8")


def sans_commentaires(source):
    """Le code seul. Un commentaire qui NOMME la faute ne doit pas la faire
    croire présente — l'en-tête de chaque fichier explique justement ce qu'on
    a refusé de faire."""
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    return re.sub(r"^\s*//.*$", "", source, flags=re.M)


def bloc(source, cle):
    """Le contenu d'un objet « cle: { … } », accolades appariées."""
    debut = source.find(cle)
    if debut < 0:
        return ""
    ouvrant = source.find("{", debut)
    profondeur, i = 0, ouvrant
    while i < len(source):
        if source[i] == "{":
            profondeur += 1
        elif source[i] == "}":
            profondeur -= 1
            if profondeur == 0:
                return source[ouvrant:i + 1]
        i += 1
    return source[ouvrant:]


class ChampDesSixChiffres(unittest.TestCase):
    def test_le_champ_ne_coupe_pas_ce_qu_on_y_colle(self):
        """Pas de `maxLength`.

        Le clavier d'un téléphone glisse parfois un caractère invisible en
        collant. Un champ qui refuse le septième caractère sans rien dire rend
        alors un code amputé, et la personne relit six chiffres justes en se
        demandant ce qu'elle a fait de travers.
        """
        for fichier in (FORMULAIRE, PAGE):
            self.assertNotRegex(
                sans_commentaires(lu(fichier)), r"(?i)maxlength",
                f"{fichier.name} pose une longueur maximale sur le champ : "
                "ce qui se colle s'y fait couper en silence")

    def test_un_seul_champ_jamais_six_cases(self):
        """Six cases séparées se photographient bien et se vivent mal.

        On n'y colle pas, on n'y corrige pas une faute de frappe sans tout
        reprendre, et un lecteur d'écran y annonce six champs sans nom
        (WCAG 2.2 §3.3.8).
        """
        code = sans_commentaires(lu(FORMULAIRE))
        champs = re.findall(r"<input\b", code)
        self.assertEqual(
            len(champs), 1,
            f"l'écran porte {len(champs)} champs de saisie : le code des six "
            "chiffres se saisit dans UN seul")
        for motif in (r"length:\s*6", r"Array\(6\)", r"repeat\(6", r"\[0,\s*1,\s*2"):
            self.assertNotRegex(
                code, motif,
                "une série de six cases se dessine dans cet écran")

    def test_le_champ_ne_se_masque_pas(self):
        """Un code reçu il y a trente secondes ne se cache pas.

        Le masquer empêche de le relire pour vérifier, sans rien protéger :
        celui qui regarde par-dessus l'épaule voit déjà l'écran du téléphone
        où le message est arrivé.
        """
        code = sans_commentaires(lu(FORMULAIRE))
        self.assertNotRegex(code, r'type="password"',
                            "le champ du code est masqué")
        self.assertNotRegex(code, r"(?i)text-security",
                            "le champ du code est masqué par la feuille de style")
        self.assertRegex(code, r'type="text"')
        self.assertRegex(code, r'inputMode="numeric"',
                         "le clavier numérique n'est pas demandé")
        self.assertRegex(code, r'autoComplete="one-time-code"',
                         "le code reçu ne se propose pas tout seul")

    def test_le_bouton_de_renvoi_dit_le_temps_qui_reste(self):
        """Un bouton grisé sans explication se martèle ; un bouton qui annonce
        « 0:48 » s'attend."""
        code = sans_commentaires(lu(FORMULAIRE))
        self.assertIn("renvoyerDans", code,
                      "le bouton « renvoyer » se désarme sans dire combien de "
                      "temps il reste")
        self.assertIn("compteARebours", code)


class LesQuatreRefus(unittest.TestCase):
    def test_le_refus_ne_dit_jamais_si_le_code_existait(self):
        """« Faux » et « déjà servi » reçoivent le même mot, exactement.

        Les séparer apprendrait à qui essaie que le code existait — et c'est
        précisément ce qu'un attaquant cherche à savoir.
        """
        code = sans_commentaires(lu(VERIFIER))
        self.assertNotRegex(
            code, r'raison\s*===\s*"inconnu"',
            "la route traite « code inconnu » à part de « code faux » : "
            "la porte apprend à qui essaie que le code existait")
        for mot in ("deja_servi", "dejaServi", "utilise", "deja_utilise"):
            self.assertNotIn(
                f'"{mot}"', code,
                f"un refus « {mot} » distingue le code déjà servi du code faux")

    def test_la_lenteur_se_regarde_avant_de_comparer(self):
        """Sinon le chronomètre livre la réponse.

        Un code faux ne trouve aucune ligne et repart tout de suite ; un code
        juste trouve la sienne et se fait refuser par la lenteur. Les deux
        chemins n'ont donc pas la même durée, et quelqu'un qui chronomètre
        pendant une période de lenteur apprend lequel de ses codes était le
        bon — sans jamais entrer.
        """
        code = sans_commentaires(lu(VERIFIER))
        garde = code.find("attenteDeLaPorte(")
        comparaison = code.find("verifierCode(")
        self.assertGreater(garde, -1,
                           "la route ne regarde jamais si la porte est lente")
        self.assertGreater(comparaison, -1)
        self.assertLess(
            garde, comparaison,
            "la comparaison a lieu AVANT le contrôle de lenteur : la durée de "
            "la réponse dit alors si le code était bon")

    def test_le_message_de_refus_se_fait_entendre(self):
        """`role="alert"` sur le message, `aria-invalid` sur le champ.

        Sans cela, quelqu'un qui n'a pas les yeux sur l'écran appuie une
        deuxième fois sur « continuer » sans savoir que la porte a répondu.
        """
        code = sans_commentaires(lu(FORMULAIRE))
        self.assertIn('role="alert"', code,
                      "le refus ne s'annonce pas : il apparaît en silence")
        self.assertIn("aria-invalid", code,
                      "le champ ne se déclare pas invalide quand il l'est")

    def test_les_quatre_refus_existent_dans_les_deux_langues(self):
        """Faux, expiré, ralenti, trop de demandes. Aucun ne manque, et le
        français ne se dégrade pas en anglais faute de phrase."""
        source = lu(TEXTES)
        anglais = bloc(source, "const en = {")
        francais = bloc(source, "const fr: typeof en = {")
        for langue, texte in (("en", anglais), ("fr", francais)):
            refus = bloc(texte, "refus: {")
            self.assertTrue(refus, f"le bloc des refus manque en « {langue} »")
            for genre in ("faux", "expire", "lent", "trop"):
                self.assertRegex(
                    refus, rf"\b{genre}:",
                    f"le refus « {genre} » n'a pas de phrase en « {langue} »")

    def test_aucun_refus_ne_dit_erreur(self):
        """Le mot ne dit ni ce qui s'est passé, ni quoi faire : il donne
        seulement le sentiment d'avoir cassé quelque chose."""
        source = lu(TEXTES)
        refus = bloc(bloc(source, "const en = {"), "refus: {") \
            + bloc(bloc(source, "const fr: typeof en = {"), "refus: {")
        for mot in ("erreur", "error", "invalide", "invalid", "échec", "failed"):
            self.assertNotRegex(
                refus, rf"(?i)\b{mot}\b",
                f"un refus emploie le mot « {mot} » : il faut dire ce qui se "
                "passe et ce qu'il faut faire")

    def test_le_refus_lent_dit_que_ce_n_est_pas_un_verrou(self):
        """Verrouiller le propriétaire, c'est le couper de son propre argent.

        Quelqu'un qui croit son commerce fermé va chercher le mot de passe du
        patron sur WhatsApp — c'est-à-dire qu'il détruit exactement ce qu'on
        est en train de construire.
        """
        source = lu(TEXTES)
        for langue, marque in (("en", "const en = {"), ("fr", "const fr: typeof en = {")):
            lent = bloc(bloc(bloc(source, marque), "refus: {"), "lent: {")
            self.assertRegex(
                lent, r"(?i)(lock|verrouill)",
                f"le refus « lent » en « {langue} » ne dit pas que la porte "
                "ralentit sans jamais se verrouiller")


class LesRoutes(unittest.TestCase):
    def test_les_routes_notent_le_passage(self):
        """Un refus qui ne laisse aucune trace ne permet de rien dire.

        C'est pourtant ce qu'une propriétaire doit apprendre : « cinq codes
        ont été essayés hier soir, rien ne s'est ouvert. »
        """
        for fichier in (VERIFIER, DEMANDER):
            code = sans_commentaires(lu(fichier))
            self.assertIn("noterEntree(", code,
                          f"{fichier.parent.name} ne note aucun passage")
            self.assertIn('moyen: "courriel"', code,
                          f"{fichier.parent.name} ne dit pas par où c'est passé")

    def test_sur_le_chemin_de_l_invitation_l_adresse_ne_vient_jamais_du_navigateur(self):
        """Le code part sur l'adresse que la propriétaire a saisie, pas sur
        celle qu'on tape ici. C'est ce qui protège le lien qui a circulé dans
        un groupe WhatsApp de quarante personnes.

        LA RÈGLE A DÛ ÊTRE PRÉCISÉE, ET NON AFFAIBLIE. Elle interdisait toute
        adresse venue du navigateur, dans tout le fichier. C'était juste tant
        que ces routes ne servaient qu'à l'invitation ; l'entrée de tous les
        jours, elle, n'a AUCUNE invitation d'où relire une adresse — elle n'a
        que celle qu'on lui donne.

        Ce qui protège chaque chemin n'est donc pas le même, et le test le
        dit maintenant :
          · invitation — l'adresse est relue en base, jamais reçue ;
          · entrée quotidienne — l'adresse reçue ne sert qu'à s'écrire à
            elle-même, et la réponse est identique que le compte existe ou
            non (voir « tests/test_ecran_entree.py »).

        LA COUPE EST À « ouvrirInvitation », et pas ailleurs. Avant cette
        ligne il n'y a que l'aiguillage — lire le corps pour savoir de quel
        chemin il s'agit n'est pas s'en servir. Après, on est SUR le chemin de
        l'invitation, et là l'adresse ne peut venir que de la base.
        """
        for fichier in (VERIFIER, DEMANDER):
            code = sans_commentaires(lu(fichier))
            debut = code.find("ouvrirInvitation(jeton)")
            self.assertGreater(
                debut, -1,
                f"{fichier.parent.name} n'ouvre plus d'invitation : ce test ne "
                "sait plus où commence le chemin qu'il garde")
            code = code[debut:]
            for marque in ("async function demanderPourUneEntree",
                           "async function entrerAvecUnCode"):
                if marque in code:
                    code = code[:code.index(marque)]
            self.assertNotRegex(
                code, r"corps\??\.courriel",
                f"{fichier.parent.name} accepte, SUR LE CHEMIN DE "
                "L'INVITATION, une adresse envoyée par le navigateur : le "
                "code partirait où l'on veut")
            self.assertIn("inv.courriel", code)


if __name__ == "__main__":
    unittest.main()
