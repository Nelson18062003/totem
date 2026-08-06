"use client";

import {
  IconArrowDown,
  IconArrowUp,
  IconBank,
  IconDoc,
  IconPhone,
  IconWallet,
} from "@/app/icons";
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
 * LA GALERIE DES CARTES ET DES LISTES — la preuve, pas la démonstration.
 *
 * Chaque bloc montre une chose qui se vérifie à la règle : les trois hauteurs
 * de rangée, le plafond qui tient sur un texte trop long, la pastille de 32
 * qui ne se confond pas avec le contrôle de 44, le séparateur en retrait de 16.
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
        <div className="grid gap-4 sm:grid-cols-3">
          <Liste>
            <Rangee
              icone={<IconWallet size={24} />}
              titre="Une ligne — 56"
              montant={{ texte: "12 500 FCFA", sens: "credit" }}
            />
          </Liste>
          <Liste>
            <Rangee
              lignes={2}
              icone={<IconPhone size={24} />}
              titre="Deux lignes — 72"
              sousTitre="MTN · 14:32 — le sous-titre tient sur une ligne, et une seule."
              montant={{ texte: "3 000 FCFA", sens: "debit" }}
            />
          </Liste>
          <Liste>
            <Rangee
              lignes={3}
              icone={<IconBank size={24} />}
              titre="Trois lignes — 88"
              sousTitre="Le sous-titre dispose de deux lignes, puis il s'arrête net."
              montant={{ texte: "148 300 FCFA", sens: "neutre" }}
            />
          </Liste>
        </div>
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
            pastille={<IconArrowDown size={16} />}
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
        <Carte bordABord>
          <Liste>
            <Rangee
              lignes={2}
              pastille={<IconArrowDown size={16} />}
              titre="JEAN NKOMO"
              sousTitre="MTN · 14:32"
              montant={{ texte: "12 500 FCFA", sens: "credit" }}
              action={{
                icone: <IconDoc size={20} />,
                libelle: "Télécharger le reçu",
                href: "/api/recu/exemple",
                externe: true,
              }}
              onClick={() => {}}
            />
            <Rangee
              lignes={2}
              pastille={<IconArrowUp size={16} />}
              titre="MARIE ATANGANA"
              sousTitre="Orange · 13:04"
              montant={{ texte: "3 000 FCFA", sens: "debit" }}
              chevron
              onClick={() => {}}
            />
            <Rangee
              lignes={2}
              pastille={<IconPhone size={16} />}
              titre="Rechargement de la carte"
              sousTitre="MTN · 11:47"
              montant={{ texte: "5 000 FCFA", sens: "neutre" }}
              chevron
              href="/encaissements"
            />
            <Rangee
              icone={<IconBank size={24} />}
              titre="Virement bancaire"
              valeur="hier"
            />
          </Liste>
        </Carte>
        <p className="mt-2 text-small text-ink-faint">
          Crédit et débit sont indiscernables en niveaux de gris : le signe est
          écrit par le composant, jamais laissé à l&apos;appelant.
        </p>
      </section>
    </div>
  );
}
