"use client";

import { useState } from "react";
import { useLangue } from "@/app/langue";
import { textesCharpente } from "@/lib/textes/charpente";
import { fcfa, type Paiement } from "@/lib/types";
import { FicheSms } from "./fiche-sms";
import { IconDoc } from "./icons";
import { Carte } from "./ui/carte";
import { Pastille } from "./ui/etat";
import { Liste, Rangee, type SensMontant } from "./ui/rangee";

/**
 * Les derniers SMS de l'accueil — cliquables, comme dans la boîte de
 * réception. Un appui ouvre LA même fiche : le message en entier, sa nature
 * (qui établit le reçu), la copie du texte, le reçu PDF. Pas besoin de
 * passer par « Tout voir » pour agir sur un message qu'on a sous les yeux.
 *
 * ─── v2 · LE DISQUE DE TÊTE EST PARTI ───────────────────────────────────────
 *
 * Cette liste DÉCLARE un montant : la `Liste` en déduit toute seule qu'elle
 * est une liste d'argent, et une liste d'argent ne porte pas de disque
 * décoratif — il valait 32 px plus 12 de gouttière, c'est-à-dire exactement
 * les 44 px qui manquaient au titre pour ne pas se tronquer en 390. La rangée
 * v2 l'ignorait déjà ; on le retire d'ici, avec ses trois icônes, plutôt que
 * de laisser du code qui ne rend plus rien.
 *
 * Le sens du mouvement, lui, ne se perd pas : il n'a JAMAIS été porté par le
 * disque (`aria-hidden` : il ne disait rien à personne). C'est le signe du
 * montant qui le porte — `+`, `−`, ou rien quand le robot n'a pas tranché —
 * et c'est la rangée qui le pose, sans qu'on puisse l'oublier.
 *
 * Reste le POINT DE NON-LU, qui n'est pas le disque : lui porte une
 * information que rien d'autre ne dit, et son étiquette la donne à voix haute.
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
