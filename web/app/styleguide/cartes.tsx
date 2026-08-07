"use client";

import { IconBank, IconDoc, IconPhone, IconWallet } from "@/app/icons";
import { Carte, EnTeteSection } from "@/app/ui/carte";
import { Liste, Rangee } from "@/app/ui/rangee";

// Un SMS de quatre lignes — celui qui faisait 142 px dans la liste des
// encaissements. Il est là pour être tronqué : si la rangée qui le porte
// dépasse 88 px, c'est que le plafond ne tient pas.
const SMS_LONG =
  "Vous avez recu 12 500 FCFA de JEAN NKOMO (695 12 34 56).\n"
  + "Frais: 0 FCFA. Nouveau solde: 148 300 FCFA.\n"
  + "Transaction ID: MP240815.1432.B84021.\n"
  + "Merci d'utiliser notre service.";

/**
 * L'action de queue, la même partout : le reçu PDF. Elle n'existe que pour les
 * paiements qui en ont un — c'est justement ce qui décalait la colonne des
 * montants d'une rangée à l'autre avant que la liste ne réserve sa place.
 */
const RECU = {
  icone: <IconDoc size={20} />,
  libelle: "Télécharger le reçu",
  href: "/api/recu/exemple",
  externe: true,
};

/**
 * LA GALERIE DES CARTES ET DES LISTES — la preuve, pas la démonstration.
 *
 * Chaque bloc montre une chose qui se vérifie à la règle : les trois hauteurs
 * de rangée, le plafond qui tient sur un texte trop long, le séparateur en
 * retrait de 16 — et la colonne de montants, dont les bords droits se mesurent
 * à la règle plutôt qu'ils ne se plaident.
 */
export function GalerieCartes() {
  return (
    <div className="flex flex-col gap-8">
      {/* ── La carte ─────────────────────────────────────────────────────── */}
      <section>
        <EnTeteSection
          titre="La carte"
          detail="Une surface : padding 16, rayon 12, filet décoratif. Elle regroupe, elle ne réclame rien."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Carte>
            <p className="text-body">Une carte, et ce qu&apos;on met dedans.</p>
            <p className="mt-2 text-small text-ink-soft">
              Le padding vaut 16 sur les quatre côtés, le rayon 12, le filet est
              celui qui sépare — jamais celui qui affirme.
            </p>
          </Carte>
          <Carte>
            <EnTeteSection niveau={3} titre="Un en-tête dans une carte" />
            <p className="text-small text-ink-soft">
              Le même en-tête sert au-dessus d&apos;une carte et à l&apos;intérieur.
            </p>
          </Carte>
        </div>
      </section>

      {/* ── L'en-tête de section ─────────────────────────────────────────── */}
      <section>
        <EnTeteSection
          titre="L'en-tête de section"
          detail="Écart interne 4, écart externe 12 — que la phrase soit là ou non."
          action={<span className="text-small text-ink-soft">Tout voir</span>}
        />
        <Carte>
          <EnTeteSection niveau={3} titre="Sans phrase" />
          <EnTeteSection
            niveau={3}
            titre="Avec phrase"
            detail="La phrase ne mange pas la marge du titre : c'est l'en-tête entier qui garde ses 12 px."
          />
          <p className="text-small text-ink-faint">
            Les deux formes déposent leur contenu à la même hauteur.
          </p>
        </Carte>
      </section>

      {/* ── Les trois hauteurs, côte à côte ──────────────────────────────── */}
      <section>
        <EnTeteSection
          titre="Les trois hauteurs de rangée"
          detail="56 pour une ligne, 72 pour deux, 88 pour trois. Fermes : une rangée ne grandit pas avec son contenu."
        />
        {/* Pas de montant ici : trois colonnes de 330 px et une colonne de
            montants de 144 ne laisseraient que 53 px au titre, qui se
            tronquerait — et ce bloc-là parle de hauteur, pas d'argent. La
            colonne de montants a sa propre section, en pleine largeur. */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Liste>
            <Rangee icone={<IconWallet size={24} />} titre="Une ligne — 56" />
          </Liste>
          <Liste>
            <Rangee
              lignes={2}
              icone={<IconPhone size={24} />}
              titre="Deux lignes — 72"
              sousTitre="MTN · 14:32 — le sous-titre tient sur une ligne, et une seule."
            />
          </Liste>
          <Liste>
            <Rangee
              lignes={3}
              icone={<IconBank size={24} />}
              titre="Trois lignes — 88"
              sousTitre="Le sous-titre dispose de deux lignes, puis il s'arrête net."
            />
          </Liste>
        </div>
      </section>

      {/* ── LA COLONNE DE MONTANTS ───────────────────────────────────────── */}
      <section>
        <EnTeteSection
          titre="La colonne de montants"
          detail="Six montants de 5 000 à 1 248 500, avec et sans action de queue. Les bords droits sont au même pixel — et ils ne le doivent à aucune police."
        />
        <Carte bordABord>
          <Liste queue>
            <Rangee
              lignes={2}
              titre="Orange · 23:06"
              sousTitre="Vous avez recu 5 000 FCFA de PAUL BIYA (699 00 11 22)."
              montant={{ texte: "5 000 FCFA", sens: "credit" }}
              onClick={() => {}}
              action={RECU}
            />
            <Rangee
              lignes={2}
              titre="MTN · 21:47"
              sousTitre="Retrait de 12 500 FCFA. Nouveau solde: 135 800 FCFA."
              montant={{ texte: "12 500 FCFA", sens: "debit" }}
              onClick={() => {}}
            />
            <Rangee
              lignes={2}
              titre="Orange · 19:12"
              sousTitre="Vous avez recu 150 000 FCFA de MARIE ATANGANA."
              montant={{ texte: "150 000 FCFA", sens: "credit" }}
              onClick={() => {}}
              action={RECU}
            />
            <Rangee
              lignes={2}
              titre="MTN · 14:32"
              sousTitre="Vous avez recu 1 248 500 FCFA de COOPERATIVE DU NKAM."
              montant={{ texte: "1 248 500 FCFA", sens: "credit" }}
              onClick={() => {}}
            />
            <Rangee
              lignes={2}
              titre="Orange · 11:05"
              sousTitre="Paiement de 1 248 500 FCFA au fournisseur SODECOTON."
              montant={{ texte: "1 248 500 FCFA", sens: "debit" }}
              onClick={() => {}}
              action={RECU}
            />
            <Rangee
              lignes={2}
              titre="MTN · 08:24"
              sousTitre="Solde du compte marchand: 148 300 FCFA."
              montant={{ texte: "148 300 FCFA", sens: "neutre" }}
              onClick={() => {}}
            />
            {/* Le robot n'a pas su lire de montant — et il ne l'invente pas.
                La colonne garde sa place : cette rangée-là ne repousse pas son
                titre de 144 px vers la droite, et la colonne n'a pas de brèche. */}
            <Rangee
              lignes={2}
              titre="Orange · 07:51"
              sousTitre="Votre forfait internet a ete active. Bonne navigation."
              montant={undefined}
              onClick={() => {}}
            />
          </Liste>
        </Carte>
        <p className="mt-2 max-w-lecture text-small text-ink-faint">
          DM Sans n&apos;a aucune fonction <code>tnum</code> : sa table GSUB
          contient <code>calt ccmp dnom frac kern liga locl mark mkmk numr</code>,
          et rien de plus. <code>tabular-nums</code> — donc la classe{" "}
          <code>.tabnums</code> — n&apos;a jamais rien fait ici : les chasses vont
          de 312 pour le « 1 » à 684 pour le « 0 », 5,95 px d&apos;écart à 16 px.
          L&apos;alignement vient de la mise en page : colonne de largeur fixe,
          texte calé à droite. Le signe en fait partie, et c&apos;est U+2212
          (chasse 550, la même que le plus), jamais le trait d&apos;union U+002D
          (541).
        </p>
        <p className="mt-2 max-w-lecture text-small text-ink-faint">
          La dernière rangée n&apos;a pas de montant : le robot n&apos;a pas su
          lire ce SMS, et il n&apos;invente pas un chiffre. Sa place est tenue
          quand même — sinon son titre serait le seul à courir jusqu&apos;au bout
          de la ligne, et la colonne aurait une brèche à l&apos;endroit exact où
          l&apos;œil descend.
        </p>
      </section>

      {/* ── Le disque décoratif, et ce qu'il en reste ────────────────────── */}
      <section>
        <EnTeteSection
          titre="Le disque décoratif"
          detail="Il survit sur une rangée qui ne porte pas d'argent. Sur une rangée de paiement, il prenait les 44 px qui manquaient au titre : il est retiré."
        />
        <Carte bordABord>
          <Liste>
            <Rangee lignes={2} pastille="N" titre="Nelson" sousTitre="Propriétaire" />
            <Rangee
              icone={<IconPhone size={24} />}
              titre="Numéro du terminal"
              valeur="6 99 00 11 22"
            />
          </Liste>
        </Carte>
      </section>

      {/* ── Le plafond de hauteur ────────────────────────────────────────── */}
      <section>
        <EnTeteSection
          titre="Le plafond de hauteur"
          detail="Un SMS de quatre lignes. La rangée reste à 88 px ; le message entier s'ouvre dans la fiche."
        />
        <Liste>
          <Rangee
            lignes={3}
            titre="MTN · 14:32"
            sousTitre={SMS_LONG}
            montant={{ texte: "12 500 FCFA", sens: "credit" }}
            chevron
            onClick={() => {}}
            libelle="Ouvrir le SMS de JEAN NKOMO"
          />
        </Liste>
        <p className="mt-2 text-small text-ink-faint">
          Le même texte rendu sans plafond faisait 142 px, et cassait le rythme
          de toute la colonne.
        </p>
      </section>

      {/* ── Une liste dans une carte ─────────────────────────────────────── */}
      <section>
        <EnTeteSection
          titre="Une liste dans une carte"
          detail="La carte passe en bord à bord : c'est la rangée qui porte le padding, et elle va jusqu'au bord parce que c'est elle qu'on touche."
        />
        {/* Le chevron est le même sur les quatre rangées. Une liste qui en met
            sur certaines seulement décale les autres de 32 px (20 d'icône et
            12 d'écart) : le chevron se pose APRÈS la colonne de montants, et
            une place qui n'est pas tenue est une colonne qui bouge. */}
        <Carte bordABord>
          <Liste>
            <Rangee
              lignes={2}
              titre="JEAN NKOMO"
              sousTitre="MTN · 14:32"
              montant={{ texte: "12 500 FCFA", sens: "credit" }}
              chevron
              onClick={() => {}}
            />
            <Rangee
              lignes={2}
              titre="MARIE ATANGANA"
              sousTitre="Orange · 13:04"
              montant={{ texte: "3 000 FCFA", sens: "debit" }}
              chevron
              onClick={() => {}}
            />
            <Rangee
              lignes={2}
              titre="Rechargement"
              sousTitre="MTN · 11:47"
              montant={{ texte: "5 000 FCFA", sens: "neutre" }}
              chevron
              href="/encaissements"
            />
            {/* Pas de montant, mais une valeur : elle prend la même colonne, au
                même bord droit. Une liste d'argent n'a pas deux colonnes de
                droite.

                ET PAS D'OBJET DE TÊTE. Dans une liste d'argent, une icône de
                tête sur une seule rangée décale SA colonne de texte de 36 px
                (24 d'icône, 12 d'écart) — donc son montant. L'objet de tête est
                là sur toutes les rangées ou sur aucune ; c'est le cas de
                l'écran d'analyse, où il porte le rang du client. */}
            <Rangee titre="Virement" valeur="hier" chevron href="/cartes" />
          </Liste>
        </Carte>
        <p className="mt-2 max-w-lecture text-small text-ink-faint">
          Crédit et débit sont indiscernables en niveaux de gris : le signe est
          écrit par le composant, jamais laissé à l&apos;appelant.
        </p>
      </section>
    </div>
  );
}
