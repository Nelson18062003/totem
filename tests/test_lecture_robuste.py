# -*- coding: utf-8 -*-
"""La lecture robuste des SMS : les leçons d'août 2026.

Le 22 août 2026, un transfert réel d'un million de FCFA vers « GARANTIE
EXCHANGE SARL 3 » est devenu une « interrogation de solde » : un chiffre dans
la raison sociale du client cassait le motif du transfert anglais, et le
lecteur retombait sur le « New balance » du même SMS. Le propriétaire ne
pouvait ni corriger la nature, ni refabriquer le PDF — le message refusé avec
une phrase qui ne disait pas ce qui avait été lu.

Ces tests verrouillent les trois remèdes :

  1. **Les noms ne cassent plus rien.** Les parties sont ancrées sur leurs
     numéros ; le nom est ce qui suit, chiffres, apostrophes et tirets
     compris. Une mutation du nom ne change ni la catégorie ni le montant.

  2. **Jamais un repli confiant.** Un message qui parle d'argent sans être
     compris est « illisible » — il ne se déguise plus en solde, en réclame
     ni en message quelconque. Et un fragment de SMS multipart ne fabrique
     plus jamais un reçu de solde.

  3. **Un seul verdict.** La boîte de réception (`categoriser`) et les reçus
     (`motif_du_sms`) tiennent le même discours : une opération annulée
     n'est un encaissement nulle part, un pied de message conditionnel
     (« Pour toute annulation… ») ne tue un reçu nulle part.

Lancer :  python3 -m unittest discover -s tests
"""

import unittest

from totem.analyse_sms import (analyser, categoriser, code_a_usage_unique,
                               solde_annonce)
from totem.declencheur import (SOLDE, TRANSFERT, motif_du_sms,
                               motif_selon_nature, raison_du_refus)

# Le SMS réel du 22 août 2026, tel que relevé sur la capture du propriétaire.
# C'est LUI qu'il faut continuer à comprendre, pas une reformulation commode.
SMS_DU_BUG = (
    "Successful transfer from 696103864 WONDER PHONE to 697028711 GARANTIE "
    "EXCHANGE SARL 3. Transaction ID: PP260822.1047.A01089, Transaction "
    "amount: 1036880 FCFA, Charges: 0 FCFA, Commission: 0 FCFA, Net debit "
    "amount: 1036880 FCFA, New balance: 863120.6 FCFA.")

# La seconde moitié du même genre de SMS, seule — un message multipart dont
# la première partie s'est perdue en route. Il ne reste que des champs.
FRAGMENT = (" 0 FCFA, Commission: 0 FCFA, Montant Net: 184137 FCFA, "
            "Nouveau Solde: 2784137.6 FCFA")


class TestLeSmsDuBug(unittest.TestCase):
    """Le transfert vers « GARANTIE EXCHANGE SARL 3 », champ par champ."""

    def test_cest_un_transfert_pas_un_solde(self):
        self.assertEqual(categoriser(SMS_DU_BUG), "transfert")
        self.assertIsNone(solde_annonce(SMS_DU_BUG))

    def test_tout_est_lu(self):
        p = analyser(SMS_DU_BUG)
        self.assertIsNotNone(p)
        self.assertEqual(p.montant, 1036880)
        self.assertEqual(p.reference, "PP260822.1047.A01089")
        self.assertEqual(p.solde_apres, 863120.6)
        self.assertEqual(p.frais, 0)
        self.assertEqual(p.emetteur.numero, "696103864")
        self.assertEqual(p.emetteur.nom, "WONDER PHONE")
        self.assertEqual(p.beneficiaire.numero, "697028711")
        self.assertEqual(p.beneficiaire.nom, "GARANTIE EXCHANGE SARL 3")

    def test_le_montant_net_debite_anglais_est_compris(self):
        """« Net debit amount » est le « Montant Net Débité » anglais —
        le champ qui fait foi, avant le montant brut."""
        seul = ("Successful transfer from 696103864 A to 697028711 B. "
                "Net debit amount: 5000 FCFA.")
        self.assertEqual(analyser(seul).montant, 5000)

    def test_le_sens_se_tranche_avec_ma_carte(self):
        p = analyser(SMS_DU_BUG, numeros=("696103864",))
        self.assertEqual(p.sens, "sortie")
        self.assertEqual(p.nom, "GARANTIE EXCHANGE SARL 3")

    def test_le_recu_de_transfert_est_possible(self):
        """Le bug vécu de bout en bout : la nature « transfert » choisie sur
        la plateforme doit trouver ses faits."""
        motif = motif_du_sms(SMS_DU_BUG, numeros=("696103864",))
        self.assertIsNotNone(motif)
        self.assertEqual(motif.genre, TRANSFERT)
        self.assertIsNotNone(motif_selon_nature(motif, "transfert"))


class TestLesNomsNeCassentRien(unittest.TestCase):
    """Le nom d'un client est le sien : chiffres, apostrophes, tirets,
    longueurs démesurées. Aucun ne doit faire perdre une opération."""

    # (texte de base, nom d'origine, montant attendu, catégorie attendue)
    BASES = [
        ("Transfert de 656483918 PRIX MONO SARL vers 696103864 WONDER "
         "PHONE reussi. Montant Net: 184137 FCFA, Nouveau Solde: 2784137.6 "
         "FCFA", "PRIX MONO SARL", 184137, "transfert"),
        ("Successful transfer from 696413104 IBRAHIM DAHIROU to 696103864 "
         "WONDER PHONE. Transaction amount: 1300000 FCFA, New balance: "
         "6335788.6 FCFA.", "IBRAHIM DAHIROU", 1300000, "transfert"),
        ("Depot vers 690933686 NGANGOM NOUBEWE reussi from 696103864 WONDER "
         "PHONE. Montant transaction : 10000FCFA, Nouveau Solde : "
         "2773937.6FCFA.", "NGANGOM NOUBEWE", 10000, "depot"),
        ("CashOut success to 693377266 MANGA from 696103864 WONDER PHONE. "
         "transaction amount: 500000 FCFA", "MANGA", 500000, "retrait"),
    ]

    MUTATIONS = [
        "GARANTIE EXCHANGE SARL 3",     # le chiffre en fin — le bug vécu
        "3 FRERES SARL",                # le chiffre en tête
        "STATION T3",                   # le chiffre au milieu
        "STE 2M-SERVICES",              # tiret et chiffre collés
        "L'OREAL 237",                  # apostrophe et chiffre
        "SOCIETE GENERALE DES TRAVAUX PUBLICS DU CAMEROUN",   # 48 caractères
    ]

    def test_toutes_les_mutations_de_noms(self):
        for base, nom, montant, cat in self.BASES:
            for mutation in self.MUTATIONS:
                texte = base.replace(nom, mutation)
                with self.subTest(nom=mutation, base=cat):
                    p = analyser(texte)
                    self.assertIsNotNone(
                        p, f"le nom « {mutation} » a fait perdre l'opération")
                    self.assertEqual(p.montant, montant)
                    self.assertEqual(categoriser(texte), cat)

    def test_le_chiffre_en_tete_ne_pollue_pas_le_numero(self):
        """« 3 FRERES SARL » : le 3 est un nom, pas la dixième décimale du
        téléphone. Un faux numéro irait sur le reçu du client."""
        p = analyser("Successful transfer from 696103864 WONDER PHONE to "
                     "697028711 3 FRERES SARL. Net amount :7000 FCFA.")
        self.assertEqual(p.beneficiaire.numero, "697028711")
        self.assertEqual(p.beneficiaire.nom, "3 FRERES SARL")

    def test_un_nom_demesure_garde_son_numero(self):
        """Au-delà de 40 caractères le nom est abandonné, jamais l'opération :
        le numéro suffit à trancher le sens et à remplir le reçu."""
        p = analyser("Successful transfer from 696413104 IBRAHIM to "
                     "696103864 SOCIETE GENERALE DES TRAVAUX PUBLICS DU "
                     "CAMEROUN. Net amount :5000 FCFA.",
                     numeros=("696103864",))
        self.assertEqual(p.sens, "entree")
        self.assertEqual(p.beneficiaire.numero, "696103864")

    def test_une_entreprise_nommee_bonus_paie_quand_meme(self):
        """« bonus » est un mot de réclame — mais BONUS SARL est un client.
        Le rejet du bruit ne s'applique qu'à la lecture simple, jamais à une
        opération complète."""
        texte = ("Successful transfer from 655001122 BONUS SARL to 696103864 "
                 "WONDER PHONE. Net amount :250000 FCFA.")
        self.assertEqual(analyser(texte).montant, 250000)
        self.assertEqual(categoriser(texte), "transfert")

    def test_un_nom_nomme_depot_ne_change_pas_la_categorie(self):
        """Le PREMIER geste du message fait la catégorie : le nom du client
        (« L'OREAL 237 DEPOT 5 ») n'a pas voix au chapitre."""
        texte = ("Successful transfer from 655001122 STE 2M-SERVICES to "
                 "696103864 L'OREAL 237 DEPOT 5. Transaction amount: 5000 "
                 "FCFA.")
        self.assertEqual(categoriser(texte), "transfert")


class TestJamaisUnRepliConfiant(unittest.TestCase):
    """Un échec de lecture est un échec — jamais une autre réponse."""

    def test_le_fragment_multipart_nest_pas_un_solde(self):
        """La seconde moitié d'un transfert porte « Nouveau Solde » : en
        faire une interrogation de solde fabriquait un document de solde sur
        un transfert d'un million. Plus jamais."""
        self.assertIsNone(solde_annonce(FRAGMENT))
        self.assertIsNone(motif_du_sms(FRAGMENT))
        self.assertEqual(categoriser(FRAGMENT), "illisible")

    def test_la_premiere_moitie_amputee_est_illisible(self):
        tronque = SMS_DU_BUG[:120]
        self.assertIsNone(analyser(tronque))
        self.assertEqual(categoriser(tronque), "illisible")

    def test_une_operation_sans_montant_lisible_est_illisible(self):
        """Le dépôt qui ne détaille que des frais et un solde : on n'invente
        pas le montant, et on ne se déguise pas en message quelconque."""
        texte = ("Depot vers 690933686 NGANGOM NOUBEWE reussi from 80684177. "
                 "Frais: 0 FCFA, Nouveau Solde: 2768937.6 FCFA")
        self.assertIsNone(analyser(texte))
        self.assertEqual(categoriser(texte), "illisible")

    def test_une_operation_future_nest_pas_un_mouvement(self):
        """« sera effectué demain » : rien ne s'est encore passé — pas de
        reçu, pas d'encaissement, mais pas un silence non plus."""
        texte = ("Votre retrait de 25000 FCFA vers 690933686 NKENGA sera "
                 "effectue demain.")
        self.assertIsNone(analyser(texte))
        self.assertIsNone(motif_du_sms(texte))
        self.assertEqual(categoriser(texte), "illisible")

    def test_le_vrai_solde_reste_un_solde(self):
        self.assertEqual(categoriser("Le solde de votre compte est de "
                                     "2784137.6FCFA."), "solde")
        self.assertEqual(solde_annonce("Le solde de votre compte est de "
                                       "2784137.6FCFA."), 2784137.6)


class TestLesEchecsSontDesEchecs(unittest.TestCase):
    """Une opération annulée n'est un mouvement NULLE PART : ni sur Telegram,
    ni dans la boîte de réception, ni au bilan, ni en reçu."""

    ECHECS = [
        "Votre paiement de 5000 FCFA a echoue. Reessayez plus tard.",
        "Vous avez recu 25 000 FCFA de NGONO Marie (677123456). "
        "Operation annulee.",
        "Annulation du transfert de 25000 FCFA vers 690933686 NKENGA "
        "NOUBEWE effectuee avec succes.",
        "CashOut failed to 693377266 MANGA from 696103864 WONDER PHONE. "
        "Your balance is 1200 FCFA.",
        "Transfer of 5000 FCFA from 696103864 A to 697028711 B failed. "
        "New balance: 100 FCFA.",
        "Vous n'avez pas recu 25000 FCFA de 677123456 ? Contactez le 8900.",
    ]

    def test_rien_ne_devient_un_mouvement(self):
        for texte in self.ECHECS:
            with self.subTest(texte=texte[:50]):
                self.assertIsNone(analyser(texte))
                self.assertIsNone(motif_du_sms(texte))
                self.assertEqual(categoriser(texte), "echec")

    def test_un_echec_avec_solde_nest_pas_un_solde(self):
        """« Your balance is 1200 FCFA » au pied d'un retrait raté : c'est
        un retrait raté, pas un relevé."""
        self.assertIsNone(solde_annonce(
            "CashOut failed to 693377266 MANGA. Your balance is 1200 FCFA."))

    def test_le_pied_conditionnel_ne_tue_pas_le_recu(self):
        """« Pour toute annulation, composez le #150# » n'annule rien : le
        dépôt réussi au-dessus garde son reçu."""
        texte = ("Depot de 50000 FCFA vers 690933686 NGANGOM NOUBEWE reussi "
                 "from 80684177. Pour toute annulation, composez le #150#.")
        self.assertEqual(analyser(texte).montant, 50000)
        self.assertIsNotNone(motif_du_sms(texte))
        self.assertEqual(categoriser(texte), "depot")

    def test_le_pied_anglais_conditionnel_non_plus(self):
        texte = ("Successful transfer from 696413104 IBRAHIM DAHIROU to "
                 "696103864 WONDER PHONE. Net amount :1300000 FCFA. If you "
                 "are unable to see the funds, call 8900.")
        self.assertEqual(analyser(texte).montant, 1300000)
        self.assertIsNotNone(motif_du_sms(texte))


class TestAccordDesRegles(unittest.TestCase):
    """La boîte de réception et les reçus tiennent le même discours.

    C'est la propriété qui manquait : un SMS rangé « encaissement » dont le
    reçu était refusé (transaction annulée), un SMS rangé « solde » qui
    fabriquait un document sur un fragment. Chaque catégorie promet
    exactement ce que le déclencheur tiendra.
    """

    ARGENT = ("encaissement", "envoi", "transfert", "depot", "retrait")

    CORPUS = ([SMS_DU_BUG, FRAGMENT]
              + TestLesEchecsSontDesEchecs.ECHECS
              + [base for base, _, _, _ in TestLesNomsNeCassentRien.BASES]
              + [
                  "Vous avez recu 25 000 FCFA de NGONO Marie (677123456). "
                  "Nouveau solde: 872 500 FCFA.",
                  "Le solde de votre compte est de 2784137.6FCFA.",
                  "PROMO! Rechargez 5000 FCFA et gagnez 1000 FCFA de bonus !",
                  "Le code de 696103864 est: 515318. Merci.",
                  "Bonjour, es-tu disponible demain ?",
                  "Votre solde est insuffisant. Il vous reste 100 FCFA.",
                  "Cash In of 40000 FCFA. Your balance is 60000 FCFA.",
              ])

    def test_chaque_categorie_tient_sa_promesse(self):
        for texte in self.CORPUS:
            with self.subTest(texte=texte[:50]):
                cat = categoriser(texte)
                motif = motif_du_sms(texte)
                if cat in self.ARGENT:
                    self.assertIsNotNone(
                        motif, "rangé comme argent, refusé en reçu")
                    self.assertEqual(motif.genre, TRANSFERT)
                elif cat == "solde":
                    self.assertIsNotNone(motif)
                    self.assertEqual(motif.genre, SOLDE)
                else:
                    self.assertIsNone(
                        motif, f"rangé « {cat} », mais un reçu sortirait")


class TestLesRaisonsDuRefus(unittest.TestCase):
    """Quand le reçu est refusé, le robot dit ce qu'il a lu — quatre
    situations, quatre phrases, plus jamais une seule pour toutes."""

    def test_une_operation_annulee(self):
        self.assertEqual(raison_du_refus(
            "Vous avez recu 25 000 FCFA de NGONO Marie. Operation annulee."),
            "echec")

    def test_un_code(self):
        self.assertEqual(raison_du_refus(
            "Le code de 696103864 est: 515318. Merci."), "code")

    def test_une_reclame(self):
        self.assertEqual(raison_du_refus(
            "PROMO! Rechargez 5000 FCFA et gagnez 1000 FCFA de bonus !"),
            "publicite")

    def test_un_message_illisible(self):
        self.assertEqual(raison_du_refus(FRAGMENT), "illisible")

    def test_un_transfert_demande_sur_un_solde(self):
        self.assertEqual(raison_du_refus(
            "Le solde de votre compte est de 2784137.6FCFA.",
            nature="transfert"), "solde_pas_mouvement")

    def test_un_solde_demande_sans_solde_annonce(self):
        self.assertEqual(raison_du_refus(
            "Successful transfer from 696103864 A to 697028711 B. "
            "Net amount :5000 FCFA.", nature="solde"), "mouvement_sans_solde")

    def test_les_phrases_existent_dans_les_deux_langues(self):
        from totem.pilotage import Pilotage
        for raison in ("echec", "code", "publicite", "illisible",
                       "solde_pas_mouvement", "mouvement_sans_solde",
                       "incompris"):
            for langue in ("fr", "en"):
                phrase = Pilotage._expliquer_refus(raison, langue)
                self.assertTrue(phrase and len(phrase) > 20,
                                f"pas de phrase pour {raison}/{langue}")
        self.assertIn("échouée", Pilotage._expliquer_refus("echec", "fr"))
        self.assertIn("annonce de solde",
                      Pilotage._expliquer_refus("solde_pas_mouvement", "fr"))


class TestLesFauxAmis(unittest.TestCase):
    """Les champs voisins ne se contaminent plus entre eux."""

    def test_le_solde_nest_pas_un_numero_de_tiers(self):
        """« s'élève à 12345678 FCFA » donnait le solde comme numéro du
        client — un faux numéro sur le document."""
        p = analyser("Vous avez recu 25000 FCFA. Votre solde s'eleve a "
                     "12345678 FCFA.")
        self.assertIsNone(p.numero)
        self.assertEqual(p.solde_apres, 12345678)

    def test_un_mot_nest_jamais_une_reference(self):
        """« Reference disponible auprès du service client » capturait le mot
        « disponible » — deux envois différents partageaient alors la même
        référence, et le second perdait son reçu sans un bruit."""
        p = analyser("Vous avez envoye 80 000 FCFA a Fournisseur SARL "
                     "(690334455). Reference disponible aupres du service "
                     "client.")
        self.assertIsNone(p.reference)

    def test_le_code_marchand_nest_pas_un_secret(self):
        """Un code marchand est l'outil de travail du propriétaire, pas un
        code de connexion : il ne doit jamais être masqué."""
        self.assertFalse(code_a_usage_unique(
            "Le code marchand est: 44556. Presentez-le au caissier."))
        self.assertTrue(code_a_usage_unique("Votre code OTP: 483920"))


class TestLesMotsDechecNeConfisquentRien(unittest.TestCase):
    """Un mot de la famille de l'échec logé dans un NOM ou un MOTIF ne doit
    jamais confisquer l'argent d'un client — la relecture adversaire du
    correctif avait trouvé exactement ça."""

    def test_un_client_nomme_remboursement_est_paye(self):
        texte = ("Successful transfer from 696103864 WONDER PHONE to "
                 "697028711 ETS REMBOURSEMENT PLUS. Transaction amount: "
                 "5000 FCFA, New balance: 100000 FCFA.")
        p = analyser(texte)
        self.assertIsNotNone(p)
        self.assertEqual(p.montant, 5000)
        self.assertEqual(categoriser(texte), "transfert")

    def test_un_motif_de_remboursement_reste_un_encaissement(self):
        texte = ("Vous avez recu 25000 FCFA de NGONO Marie (677123456). "
                 "Motif: remboursement pret. Nouveau solde: 872500 FCFA.")
        p = analyser(texte)
        self.assertIsNotNone(p)
        self.assertEqual((p.sens, p.montant), ("entree", 25000))
        self.assertEqual(categoriser(texte), "encaissement")

    def test_un_client_nomme_sans_echec_est_paye(self):
        texte = ("Transfert de 656483918 STE SANS ECHEC vers 696103864 "
                 "WONDER PHONE reussi. Montant Net: 40000 FCFA.")
        self.assertEqual(analyser(texte).montant, 40000)
        self.assertEqual(categoriser(texte), "transfert")


class TestLeReleveGardeSonSolde(unittest.TestCase):
    """Le pied publicitaire d'un relevé (« Pour un retrait, composez le
    #150# ») est une invitation, pas une opération : le solde reste lisible
    et son reçu reste possible."""

    RELEVE = ("Le solde de votre compte est de 2784137.6FCFA. "
              "Pour un retrait, composez le #150#.")

    def test_le_solde_est_lu(self):
        self.assertEqual(solde_annonce(self.RELEVE), 2784137.6)
        self.assertEqual(categoriser(self.RELEVE), "solde")

    def test_le_recu_de_solde_reste_possible(self):
        motif = motif_du_sms(self.RELEVE)
        self.assertIsNotNone(motif)
        self.assertEqual(motif.genre, SOLDE)


class TestLaReclameNeSonnePasLalarme(unittest.TestCase):
    """Les opérateurs vantent leurs transferts à longueur de SMS : une
    réclame qui parle d'argent reste une réclame — jamais un « message
    d'argent illisible » qui déclencherait l'alerte à chaque promotion."""

    def test_la_promo_du_transfert_reste_une_pub(self):
        texte = ("PROMO Orange Money ! Le transfert d'argent a 0 FCFA de "
                 "frais tout le weekend. Envoyez plus, gagnez plus !")
        self.assertIsNone(analyser(texte))
        self.assertEqual(categoriser(texte), "publicite")


class TestLeMouvementNulNexistePas(unittest.TestCase):
    """Un « Montant Net: 0 FCFA » n'est pas un mouvement : ni annonce
    « Encaissement — 0 FCFA », ni reçu de rien — même règle que la lecture
    simple, les deux chemins ne doivent plus se contredire."""

    def test_zero_franc_nest_pas_un_paiement(self):
        texte = ("Transfert de 656483918 PRIX MONO SARL vers 696103864 "
                 "WONDER PHONE reussi. Montant Net: 0 FCFA, "
                 "Nouveau Solde: 2784137.6 FCFA")
        self.assertIsNone(analyser(texte))
        self.assertIsNone(motif_du_sms(texte))


class TestLeBilanEtLaPlateformeComptentPareil(unittest.TestCase):
    """Le bilan Telegram et la plateforme lisent les MÊMES SMS avec les MÊMES
    numéros : un transfert à deux parties reçu sur notre carte est un
    encaissement des deux côtés — avant, la plateforme le comptait et le
    bilan quotidien l'ignorait (sens inconnu, faute de numéros)."""

    ENTRANT = ("Successful transfer from 696413104 IBRAHIM DAHIROU to "
               "696103864 WONDER PHONE. Transaction amount: 1300000 FCFA, "
               "New balance: 6335788.6 FCFA.")

    def test_montant_recu_tranche_avec_nos_numeros(self):
        from totem.storage import montant_recu
        self.assertIsNone(montant_recu(self.ENTRANT))     # sens inconnu : rien
        self.assertEqual(montant_recu(self.ENTRANT, numeros=("696103864",)),
                         1300000)
        # Vu de l'autre côté, c'est un envoi : toujours rien au bilan.
        self.assertIsNone(montant_recu(self.ENTRANT, numeros=("696413104",)))

    def test_le_rapport_du_jour_compte_le_transfert_entrant(self):
        from totem.storage import Journal
        journal = Journal(":memory:")
        journal.sms("OrangeMoney", self.ENTRANT, "Orange", "8923700000000000000")
        nb, total, nb_sms = journal.rapport_du_jour(numeros=("696103864",))
        self.assertEqual((nb, total, nb_sms), (1, 1300000, 1))
        # Sans les numéros, le sens reste inconnu — on ne compte pas au
        # hasard, et le SMS reste visible dans le compte de messages.
        nb, total, nb_sms = journal.rapport_du_jour()
        self.assertEqual((nb, total, nb_sms), (0, 0, 1))


class TestLaLangueDuRecu(unittest.TestCase):
    """La langue de l'écran qui demande voyage jusqu'au document : la
    fabrication est différée d'une dizaine de secondes, et sans elle un
    écran en français recevait un PDF dans la langue du robot."""

    def test_la_langue_est_inscrite_et_ressort(self):
        from totem.storage import Journal
        journal = Journal(":memory:")
        sms_id = journal.sms("OrangeMoney", SMS_DU_BUG, "Orange",
                             "8923700000000000000")
        journal.programmer_recu(sms_id, "transfert", "TM-2026-0822-0001",
                                nature="transfert", langue="fr")
        (_, genre, _, _, _, _, _, nature, langue), = (
            journal.recus_a_envoyer(-60))
        self.assertEqual((genre, nature, langue), ("transfert", "transfert", "fr"))

    def test_redemander_dans_une_autre_langue_la_retient(self):
        from totem.storage import Journal
        journal = Journal(":memory:")
        sms_id = journal.sms("OrangeMoney", SMS_DU_BUG, "Orange",
                             "8923700000000000000")
        journal.programmer_recu(sms_id, "transfert", "TM-2026-0822-0001",
                                langue="en")
        journal.programmer_recu(sms_id, "transfert", "TM-2026-0822-0001",
                                nature="depot", langue="fr")
        ligne, = journal.recus_a_envoyer(-60)
        self.assertEqual(ligne[-1], "fr")


if __name__ == "__main__":
    unittest.main()
