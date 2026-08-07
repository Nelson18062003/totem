"use client";

import { useState } from "react";
import { useLangue } from "@/app/langue";
import { textesCharpente } from "@/lib/textes/charpente";
import { fcfa, type Paiement } from "@/lib/types";
import { FicheSms } from "./fiche-sms";
import { IconArrowDown, IconArrowUp, IconDoc, IconInbox } from "./icons";
import { Carte } from "./ui/carte";
import { Pastille } from "./ui/etat";
import { Liste, Rangee, type SensMontant } from "./ui/rangee";

/**
 * Les derniers SMS de l'accueil — cliquables, comme dans la boîte de
 * réception. Un appui ouvre LA même fiche : le message en entier, sa nature
 * (qui établit le reçu), la copie du texte, le reçu PDF. Pas besoin de
 * passer par « Tout voir » pour agir sur un message qu'on a sous les yeux.
 *
 * La rangée vient du système (`app/ui/rangee.tsx`), et elle règle deux choses
 * que cet écran n'avait pas :
 *
 *   — LE DISQUE DÉCORATIF ET LE BOUTON DE REÇU FAISAIENT TOUS DEUX 36 px :
 *     rien ne disait lequel répondait au doigt. Le disque prend `size-disque`
 *     (32), rond, filet décoratif ; le reçu prend `size-controle` (44), carré,
 *     filet porteur. On les distingue avant même de les toucher.
 *   — LE SIGNE DU MONTANT est posé par la rangée, jamais par cet écran :
 *     crédit et débit sont à 1,21:1 l'un de l'autre, donc indiscernables en
 *     niveaux de gris. Le `+` / `−` ne peut plus être oublié.
 */

/** Le sens tel que la rangée l'attend. `neutre` quand le robot n'a pas tranché. */
const sensDe = (p: Paiement): SensMontant =>
  p.sens === "in" ? "credit" : p.sens === "out" ? "debit" : "neutre";

export function DerniersSms({ paiements }: { paiements: Paiement[] }) {
  const langue = useLangue();
  const t = textesCharpente[langue];
  const [detail, setDetail] = useState<Paiement | null>(null);

  return (
    <>
      {/* Une liste dans une carte va bord à bord : c'est la rangée qui porte
          le padding, et elle va jusqu'au bord parce que c'est elle qu'on touche. */}
      <Carte bordABord>
        <Liste queue>
          {paiements.map((p) => (
            <Rangee
              key={p.id}
              lignes={2}
              pastille={
                p.sens === "in" ? (
                  <IconArrowDown size={16} />
                ) : p.sens === "out" ? (
                  <IconArrowUp size={16} />
                ) : (
                  // Sens inconnu : le robot n'a pas su trancher, et le dépôt
                  // préfère l'avouer plutôt que d'inverser un montant. On le
                  // dit avec l'icône du message brut, pas avec un point
                  // médian — un glyphe de ponctuation dans un disque ne veut
                  // rien dire à personne.
                  <IconInbox size={16} />
                )
              }
              titre={
                p.nonLu ? (
                  <>
                    {/* Le point plein = pas encore ouvert, comme dans la boîte.
                        Il n'est jamais seul porteur du sens : la pastille dit
                        « non lu » à voix haute. */}
                    <Pastille etiquette={t.nonLu} /> {p.nom}
                  </>
                ) : (
                  p.nom
                )
              }
              sousTitre={`${p.sim} · ${p.heure} · ${p.smsBrut}`}
              montant={
                p.montant != null
                  ? { texte: fcfa(p.montant, langue), sens: sensDe(p) }
                  : undefined
              }
              onClick={() => setDetail(p)}
              // Le reçu PDF, à portée de main quand il existe — comme dans la
              // boîte de réception.
              action={
                p.recu
                  ? {
                      icone: <IconDoc size={20} />,
                      libelle: t.telechargerRecu,
                      href: `/api/recu/${p.recu}`,
                      externe: true,
                    }
                  : undefined
              }
            />
          ))}
        </Liste>
      </Carte>

      {detail && <FicheSms p={detail} onFermer={() => setDetail(null)} />}
    </>
  );
}
