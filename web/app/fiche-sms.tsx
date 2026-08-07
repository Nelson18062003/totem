"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesGuichet } from "@/lib/textes/guichet";
import { textesSms } from "@/lib/textes/sms";
import { type Categorie, fcfa, type Paiement } from "@/lib/types";
import { IconCopy, IconDoc } from "./icons";
import { Bouton } from "./ui/bouton";
import { Fenetre } from "./ui/fenetre";
import { PuceFiltre } from "./ui/selecteurs";
import { reveillerLaVeille } from "./veille";

// Chaque catégorie de SMS a sa pastille, comme une boîte de réception. Son
// libellé, lui, vit dans le dictionnaire bilingue (lib/textes/sms.ts) — les
// clés ("encaissement", "depot"…) sont des données et ne se traduisent pas.
// La catégorie n'est qu'une aide : le SMS reste lisible en entier.
export const CAT: Record<Categorie, string> = {
  encaissement: "💰",
  envoi: "↗️",
  transfert: "🔁",
  depot: "📥",
  retrait: "📤",
  solde: "📊",
  code: "🔑",
  publicite: "📢",
  message: "💬",
  inconnu: "✉️",
};

// Les natures que le propriétaire peut choisir à la main (elles donnent un reçu).
const NATURES: Categorie[] = ["depot", "retrait", "transfert", "solde"];

// La catégorie effective : la nature choisie par le propriétaire l'emporte sur
// la catégorie devinée par le terminal.
export const catDe = (p: Paiement): Categorie => p.nature ?? p.categorie;

/**
 * La fiche d'un SMS : le message en entier, ses détails, sa nature (qui
 * établit le reçu), la copie du texte et le reçu PDF.
 *
 * C'est LA même fiche partout — boîte de réception ou accueil : un SMS
 * cliqué raconte la même chose et permet les mêmes gestes, où qu'il soit.
 *
 * Elle est posée sur `Fenetre` (`app/ui/fenetre.tsx`, § 5.7 du système), qui
 * répare quatre défauts que cette fiche portait :
 *
 *   1. NI HAUTEUR MAXIMALE NI DÉFILEMENT. Un SMS de quatre lignes poussait les
 *      boutons d'action sous le bord de l'écran, sans aucun moyen de les
 *      atteindre. Désormais le CORPS SEUL défile, et les actions vivent dans
 *      un PIED FIXE : elles ne partent jamais.
 *   2. NI `role="dialog"`, NI `aria-modal`, NI FERMETURE À ÉCHAP, NI PIÈGE DE
 *      FOCUS. La tabulation continuait tranquillement dans la page cachée
 *      derrière le voile. Les quatre sont là, et le focus revient à la ligne
 *      qui a ouvert la fiche.
 *   3. UNE CROIX DE 18 × 18. Elle fait 44 × 44.
 *   4. QUATRE BOUTONS D'ACTION SE PARTAGEANT LA MÊME CHAÎNE DE CLASSES
 *      RECOPIÉE, sur une largeur `min-w-[45%]` que personne n'avait calculée.
 *      Ce sont des `Bouton` : une seule fabrique, cinq états, deux hauteurs.
 */
export function FicheSms({ p, onFermer }: { p: Paiement; onFermer: () => void }) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesSms[langue];
  // La fenêtre exige de nommer sa fermeture — un bouton muet n'existe pas.
  // Le mot est celui du dictionnaire, déjà écrit pour la fenêtre d'opération.
  const tf = textesGuichet[langue];
  const [etabli, setEtabli] = useState<"repos" | "envoi" | "fait" | "refus">("repos");
  const [mot, setMot] = useState("");
  const [nature, setNature] = useState<Paiement["nature"]>(p.nature);
  const [classe, setClasse] = useState(false);

  // Ouvrir la fiche, c'est lire le message : le point de la ligne s'éteint et
  // la pastille du menu se met à jour dans la foulée. Si la base n'a pas
  // encore la migration, l'appel échoue en silence — rien ne casse.
  useEffect(() => {
    if (!p.nonLu) return;
    fetch("/api/lu", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: Number(p.id) }),
    })
      .then((r) => { if (r.ok) { reveillerLaVeille(); router.refresh(); } })
      .catch(() => {});
  }, [p.id, p.nonLu, router]);

  // Le propriétaire décide la nature d'un SMS (dépôt/retrait/transfert/solde) :
  // elle s'affiche ainsi partout, et son reçu s'établit dans la foulée.
  const classer = async (n: Categorie) => {
    if (classe) return;
    setClasse(true);
    setNature(n);
    try {
      await fetch("/api/nature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: Number(p.id), nature: n }),
      });
      if (p.sourceId != null && !p.recu) await etablirRecu();
      router.refresh();
    } catch {
      /* l'échec reste visible via l'état du reçu */
    }
    setClasse(false);
  };

  // Le reçu d'un message passé : le terminal le refabrique depuis le SMS,
  // qui fait foi — même numéro, à la demande. La nature choisie voyage avec
  // la demande : c'est ELLE qui décide du document (un transfert marqué
  // « transfert » ne peut pas revenir en reçu de solde).
  // La date d'établissement du reçu, lue dans le cloud : elle avance quand le
  // terminal a VRAIMENT remplacé le document — c'est elle qu'on guette.
  const ficheRecu = async (): Promise<string | null> => {
    if (!p.recu) return null;
    try {
      const r = await fetch(`/api/recu/${p.recu}/fiche`, { cache: "no-store" });
      if (!r.ok) return null;
      const corps = (await r.json()) as { etabliLe: string | null };
      return corps.etabliLe;
    } catch {
      return null;
    }
  };

  const etablirRecu = async () => {
    if (etabli === "envoi" || p.sourceId == null) return;
    setEtabli("envoi");
    const etabliAvant = await ficheRecu();
    try {
      const r = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "recu",
          parametres: { source_id: p.sourceId, ...(nature ? { nature } : {}) },
        }),
      });
      if (!r.ok) throw new Error();
      const { id } = (await r.json()) as { id: number };
      for (let i = 0; i < 20; i++) {
        await new Promise((res) => setTimeout(res, 1300));
        const c = await fetch(`/api/commande/${id}`, { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null);
        if (c && (c.etat === "faite" || c.etat === "echouee")) {
          setEtabli(c.etat === "faite" ? "fait" : "refus");
          if (c.etat !== "faite") {
            setMot(c.resultat || "");
            return;
          }
          if (p.recu) {
            // RÉGÉNÉRATION d'un document existant : le terminal fabrique
            // (délai volontaire de dix secondes) puis remplace l'archive.
            // On ne promet RIEN sur un minuteur : on guette la date
            // d'établissement dans le cloud, et on ne dit « c'est le
            // nouveau » que quand elle a vraiment avancé.
            setMot(t.regenerationEnCours);
            if (!etabliAvant) {
              // Le repère d'avant n'a pas pu être lu : impossible de
              // CONSTATER le remplacement — alors on ne le certifie pas.
              // Message d'attente honnête, et la main revient.
              await new Promise((res) => setTimeout(res, 15000));
              setMot(t.regenerationEnRoute);
              setEtabli("repos");
              router.refresh();
              return;
            }
            for (let attente = 0; attente < 30; attente++) {
              await new Promise((res) => setTimeout(res, 3000));
              const etabliApres = await ficheRecu();
              if (etabliApres && etabliApres !== etabliAvant) {
                setMot(t.regenerationFaite);
                setEtabli("repos");
                router.refresh();
                return;
              }
            }
            // Toujours rien après une minute et demie : on le dit sans
            // prétendre que c'est fait.
            setMot(t.regenerationLente);
            setEtabli("repos");
          } else {
            setMot(c.resultat || "");
            // Laisser au terminal le temps d'archiver, puis relire la base :
            // l'icône de téléchargement apparaîtra sur la ligne.
            setTimeout(() => router.refresh(), 8000);
          }
          return;
        }
      }
      throw new Error();
    } catch {
      setMot(t.terminalMuet);
      setEtabli("refus");
    }
  };

  // Ce que la fiche annonce en une ligne : le sens du mouvement, ou son
  // absence. C'est le titre de la fenêtre, donc son nom accessible.
  const enTete =
    p.montant == null
      ? t.smsRecu
      : p.sens === "in"
        ? t.paiementRecu
        : p.sens === "out"
          ? t.paiementEnvoye
          : t.sensAConfirmer;

  // LES ACTIONS — dans le pied FIXE de la fenêtre. Elles ne partent plus au
  // défilement, et aucune ne réécrit ses habits : une seule fabrique.
  const actions = (
    <>
      <Bouton
        variante="secondaire"
        icone={<IconCopy size={20} />}
        onClick={() => navigator.clipboard?.writeText(p.smsBrut)}
      >
        {t.copierSms}
      </Bouton>
      {p.recu ? (
        // Le document existe : on peut l'ouvrir tel quel — ET le refaire
        // à neuf avec la lecture et le type d'aujourd'hui. Avant, ce
        // bouton n'était qu'un lien : impossible de régénérer un reçu
        // depuis l'écran, l'ancien document était servi pour toujours.
        <>
          {p.sourceId != null && (
            <Bouton
              variante="secondaire"
              icone={<IconDoc size={20} />}
              onClick={etablirRecu}
              desactive={etabli === "envoi" || etabli === "fait"}
            >
              {etabli === "envoi" ? t.demandeAuTerminal : t.regenererPdf}
            </Bouton>
          )}
          {/* L'action principale est indigo, pas noire : « l'indigo porte
              l'action », depuis le premier jour de la charte. */}
          <Bouton
            variante="primaire"
            href={`/api/recu/${p.recu}`}
            target="_blank"
            rel="noopener"
            icone={<IconDoc size={20} />}
          >
            {t.telechargerPdf}
          </Bouton>
        </>
      ) : (
        p.sourceId != null && etabli !== "fait" && (
          <Bouton
            variante="primaire"
            icone={<IconDoc size={20} />}
            onClick={etablirRecu}
            desactive={etabli === "envoi"}
          >
            {etabli === "envoi" ? t.demandeAuTerminal : t.etablirRecu}
          </Bouton>
        )
      )}
    </>
  );

  return (
    <Fenetre
      titre={enTete}
      description={p.nom}
      etiquetteFermer={tf.fermer}
      onFermer={onFermer}
      pied={actions}
    >
      <div className="flex flex-col gap-6">
        {/* Le montant, complet et jamais abrégé. Le signe fait partie de la
            chaîne : crédit et débit sont à 1,21:1 l'un de l'autre, donc
            indiscernables en niveaux de gris — et le titre de la fenêtre dit
            le sens en toutes lettres. */}
        {p.montant != null && (
          <p className="text-display tabnums">
            {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}
            {fcfa(p.montant, langue)}
          </p>
        )}

        <dl className="divide-hair">
          <L t={t.categorie} v={`${CAT[catDe(p)]} ${t.cat[catDe(p)]}`} />
          <L t={t.operateur} v={p.sim} />
          {p.numero && <L t={t.numero} v={p.numero} />}
          <L t={t.date} v={t.dateEtHeure(p.date, p.heure)} />
          {p.reference && <L t={t.reference} v={p.reference} />}
          {p.soldeApres != null && <L t={t.soldeApres} v={fcfa(p.soldeApres, langue)} />}
        </dl>

        {/* LA NATURE — des puces sur lesquelles on clique, donc `h-controle`
            (44). Elles faisaient 28, 32 et 40 px selon l'écran, avec deux
            rayons ; et elles s'éteignaient par l'opacité, ce qui les rendait
            illisibles au lieu de les rendre inertes. */}
        <div>
          <p className="mb-2 text-caption uppercase text-ink-faint">{t.natureTitre}</p>
          <div className="flex flex-wrap gap-2">
            {NATURES.map((n) => (
              <PuceFiltre
                key={n}
                libelle={`${CAT[n]} ${t.cat[n]}`}
                selectionnee={nature === n}
                surChangement={() => classer(n)}
                eteint={classe}
              />
            ))}
          </div>
          <p className="mt-2 max-w-lecture text-small text-ink-soft">{t.natureAide}</p>
        </div>

        {/* LE MESSAGE EN ENTIER — c'est lui qu'on vient lire ici, puisque la
            rangée de la liste le tronque. Jamais reformulé, jamais traduit. */}
        <div>
          <p className="mb-2 text-caption uppercase text-ink-faint">{t.messageRecu}</p>
          <p className="max-w-lecture whitespace-pre-wrap break-words rounded-card bg-surface-2 p-4 text-small text-ink-soft">
            {p.smsBrut}
          </p>
        </div>

        {mot && (
          <p
            className={`max-w-lecture text-small ${
              etabli === "refus" ? "text-negative" : "text-ink-soft"
            }`}
          >
            {mot}
          </p>
        )}
      </div>
    </Fenetre>
  );
}

/** Une ligne de détail. Le libellé à gauche, la valeur à droite, en tabulaires. */
function L({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-small text-ink-soft">{t}</dt>
      <dd className="text-small font-medium tabnums">{v}</dd>
    </div>
  );
}
