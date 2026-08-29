"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLangue } from "@/app/langue";
import { NATURES as NATURES_CHOISIES } from "@noyau/natures";
import { textesSms } from "@noyau/textes/sms";
import { type Categorie, fcfa, type Paiement } from "@noyau/types";
import { Feuille } from "./feuille";
import {
  IconArrowDown, IconArrowUp, IconBank, IconBubble, IconChart, IconClose,
  IconCopy, IconDoc, IconLock, IconMail, IconMegaphone, IconPlus,
  IconTransfer,
} from "./icons";
import { reveillerLaVeille } from "./veille";

// Chaque catégorie de SMS a son icône au trait, comme une boîte de réception.
// Son libellé, lui, vit dans le dictionnaire bilingue (lib/textes/sms.ts) —
// les clés ("encaissement", "depot"…) sont des données et ne se traduisent
// pas. La catégorie n'est qu'une aide : le SMS reste lisible en entier.
export const CAT: Record<Categorie, typeof IconArrowDown> = {
  encaissement: IconArrowDown,
  envoi: IconArrowUp,
  transfert: IconTransfer,
  depot: IconPlus,
  retrait: IconBank,
  solde: IconChart,
  echec: IconClose,
  code: IconLock,
  publicite: IconMegaphone,
  illisible: IconMail,
  message: IconBubble,
  inconnu: IconMail,
};

/** L'icône d'une catégorie, prête à poser dans une pastille ou une puce. */
export function CatIcone({
  c, size = 16, className,
}: { c: Categorie; size?: number; className?: string }) {
  const Icone = CAT[c];
  return <Icone size={size} className={className} />;
}

// Les schémas de couleur des étiquettes du Simple Design System, relevés du
// fichier : vert « positif » pour l'argent qui entre, ambre « attention »
// pour la publicité. Le reste demeure neutre — une sortie d'argent n'est pas
// un danger, c'est le métier.
const SCHEMA_CAT: Partial<Record<Categorie, string>> = {
  encaissement: "bg-[#cff7d3] text-[#02542d]",
  depot: "bg-[#cff7d3] text-[#02542d]",
  publicite: "bg-[#fff1c2] text-[#522504]",
  // Ambre « attention » : un échec et un message illisible méritent un
  // coup d'œil — pas une alarme rouge, rien n'est perdu.
  echec: "bg-[#fff1c2] text-[#522504]",
  illisible: "bg-[#fff1c2] text-[#522504]",
};

/** Les couleurs de la pastille d'une catégorie — schéma SDS, neutre sinon. */
export const classeCat = (c: Categorie): string =>
  SCHEMA_CAT[c] ?? "border border-line text-ink-soft";

// Les natures que le propriétaire peut choisir à la main (elles donnent un
// reçu) — la liste partagée avec les guichets d'API, miroir du terminal.
const NATURES: readonly Categorie[] = NATURES_CHOISIES;

// La catégorie effective : la nature choisie par le propriétaire l'emporte sur
// la catégorie devinée par le terminal.
export const catDe = (p: Paiement): Categorie => p.nature ?? p.categorie;

// Un SMS d'argent : il porte un montant, ou sa catégorie est un mouvement.
// C'est LUI seul qui a droit à un reçu — jamais une publicité, jamais un code.
const ARGENT: Categorie[] = [...NATURES, "encaissement", "envoi"];
export const estArgent = (p: Paiement): boolean =>
  p.montant != null || ARGENT.includes(catDe(p));

// Seconde ligne de défense : le robot masque les codes à usage unique avant
// de les transmettre, mais l'écran ne fait pas aveuglément confiance à la
// base — une ligne d'avant le masquage remasque ses chiffres à l'affichage.
// La catégorie DEVINÉE suffit à déclencher le masque : une nature posée à la
// main ne doit jamais déshabiller un code — c'est une défense, pas un habit.
export const texteSurEcran = (p: Paiement): string =>
  p.categorie === "code" || catDe(p) === "code"
    ? p.smsBrut.replace(/\d(?:[\s.-]?\d){2,9}/g, "••••••")
    : p.smsBrut;

// Au-delà de cette taille, la fiche replie le message : la preuve reste à un
// geste, mais elle ne chasse plus les détails de l'écran.
const LONG_MESSAGE = 380;

/**
 * La fiche d'un SMS — une feuille (jamais un écran entier) : l'essentiel en
 * en-tête épinglé, les détails, le message d'origine, et UN geste principal
 * choisi par la catégorie. Le reçu ne se propose que pour un mouvement
 * d'argent. C'est LA même fiche partout — boîte de réception ou accueil.
 */
export function FicheSms({ p, onFermer }: { p: Paiement; onFermer: () => void }) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesSms[langue];
  const [etabli, setEtabli] = useState<"repos" | "envoi" | "fait" | "refus">("repos");
  const [mot, setMot] = useState("");
  const [nature, setNature] = useState<Paiement["nature"]>(p.nature);
  const [classe, setClasse] = useState(false);
  const [choisirType, setChoisirType] = useState(false);
  const [messageDeplie, setMessageDeplie] = useState(false);

  const argent = estArgent(p);
  const texte = texteSurEcran(p);
  const long = texte.length > LONG_MESSAGE;

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
  // elle s'affiche ainsi partout, et son reçu suit dans la foulée — établi
  // s'il n'existe pas, REFABRIQUÉ s'il existe sous une autre nature. Avant,
  // un reçu déjà émis restait sous son ancien titre : la liste disait
  // « Retrait » et le PDF téléchargé disait encore « Reçu de dépôt ».
  const classer = async (n: Categorie) => {
    if (classe) return;
    setClasse(true);
    const avant = nature;
    setNature(n);
    setChoisirType(false);
    // Deux temps, deux échecs distincts : si la NATURE n'est pas retenue,
    // l'écran la rend — jamais une pastille que la base n'a pas. Si c'est
    // le REÇU qui échoue ensuite, la nature, elle, est bien enregistrée :
    // on ne la reprend pas, l'état du reçu raconte déjà son propre échec.
    let retenue = false;
    try {
      const r = await fetch("/api/nature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: Number(p.id), nature: n }),
      });
      retenue = r.ok;
    } catch {
      retenue = false;
    }
    if (!retenue) {
      setNature(avant);
      setClasse(false);
      return;
    }
    // La nature CHOISIE voyage explicitement : l'état React de ce rendu
    // porte encore l'ancienne valeur, et une demande partie sans elle
    // laissait le terminal décider seul — le classement d'un SMS illisible
    // n'aurait jamais donné son reçu.
    if (p.sourceId != null && (!p.recu || n !== (avant ?? p.categorie))) {
      await etablirRecu(n);
    }
    router.refresh();
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

  const etablirRecu = async (natureVoulue?: Categorie) => {
    if (etabli === "envoi" || p.sourceId == null) return;
    const natureDemandee = natureVoulue ?? nature;
    setEtabli("envoi");
    const etabliAvant = await ficheRecu();
    try {
      const r = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "recu",
          // Le terminal qui a REÇU ce SMS : `source_id` ne veut rien dire
          // dans le journal d'un autre boîtier.
          ...(p.terminal ? { terminal: p.terminal } : {}),
          parametres: {
            source_id: p.sourceId,
            ...(natureDemandee ? { nature: natureDemandee } : {}),
          },
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

  const copier = () => navigator.clipboard?.writeText(texteSurEcran(p));

  // L'en-tête épinglé : ce qui décide, rien d'autre. Le montant quand il
  // existe, sinon la nature du message — et qui l'a envoyé.
  const entete = (
    <>
      <p className="text-small text-ink-soft">
        {p.montant == null
          ? t.smsRecu
          : p.sens === "in" ? t.paiementRecu : p.sens === "out" ? t.paiementEnvoye : t.sensAConfirmer}
      </p>
      {p.montant != null && (
        <p className="mt-0.5 text-display font-semibold tabnums tracking-tight">
          {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant, langue)}
        </p>
      )}
      <p className="mt-0.5 truncate text-body text-ink-soft">{p.tiers || p.nom}</p>
    </>
  );

  // UN geste principal, choisi par la catégorie : le reçu pour l'argent, la
  // copie pour le reste. Jamais de reçu pour une pub, un code, un message.
  const pied = (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={copier}
          className={`flex min-w-[45%] flex-1 items-center justify-center gap-2 rounded-btn py-2.5 text-small font-medium transition ${
            argent
              ? "border border-line hover:border-ink-faint"
              : "bg-ink text-white hover:opacity-90"
          }`}>
          <IconCopy size={15} /> {t.copierSms}
        </button>
        {argent && (p.recu ? (
          <a href={`/api/recu/${p.recu}`} target="_blank" rel="noopener"
            className="flex min-w-[45%] flex-1 items-center justify-center gap-2 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
            <IconDoc size={15} /> {t.telechargerPdf}
          </a>
        ) : (
          p.sourceId != null && etabli !== "fait" && (
            <button onClick={() => etablirRecu()} disabled={etabli === "envoi"}
              className="flex min-w-[45%] flex-1 items-center justify-center gap-2 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-40">
              <IconDoc size={15} />
              {etabli === "envoi" ? t.demandeAuTerminal : t.etablirRecu}
            </button>
          )
        ))}
      </div>
      {/* Refaire un document existant : un geste discret, pas un troisième
          bouton — le cas est rare, il ne mérite pas la première ligne. */}
      {argent && p.recu && p.sourceId != null && (
        <button onClick={() => etablirRecu()} disabled={etabli === "envoi" || etabli === "fait"}
          className="mt-2 text-caption text-ink-faint underline underline-offset-4 transition hover:text-ink disabled:opacity-40">
          {etabli === "envoi" ? t.demandeAuTerminal : t.regenererPdf}
        </button>
      )}
      {mot && (
        <p className={`mt-2 text-caption leading-relaxed ${etabli === "refus" ? "text-negative" : "text-ink-soft"}`}>
          {mot}
        </p>
      )}
    </>
  );

  return (
    <Feuille entete={entete} libelleFermer={t.fermerFiche} onFermer={onFermer} pied={pied}>
      {/* Les détails — seulement les lignes qui existent. La catégorie vit
          dans la ligne « nature », pas en doublon. */}
      <dl className="divide-hair">
        <L t={t.operateur} v={p.sim} />
        {p.numero && <L t={t.numero} v={p.numero} />}
        <L t={t.date} v={t.dateEtHeure(p.date, p.heure)} />
        {p.reference && <L t={t.reference} v={p.reference} />}
        {p.soldeApres != null && <L t={t.soldeApres} v={fcfa(p.soldeApres, langue)} />}
      </dl>

      {/* La nature : une ligne comme les autres — le choix ne se déploie
          qu'à la demande. Réservée à l'argent (et aux SMS incompris, qui
          peuvent en cacher) : une publicité n'a pas de nature. Hors du dl :
          ses boutons n'ont rien d'une définition.

          « illisible » et « message » y ont droit aussi : c'est LA porte de
          sortie quand le robot n'a pas su lire un SMS d'argent. Elle était
          réservée à « inconnu » — une valeur que le robot n'émet jamais —
          et le propriétaire restait sans recours devant son propre argent. */}
      {(argent || ["inconnu", "illisible", "echec", "message"].includes(catDe(p))) && (
          <div className="border-t border-line py-2.5">
            {choisirType ? (
              <>
                <p className="mb-1.5 text-caption uppercase tracking-wider text-ink-faint">
                  {t.natureTitre}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {NATURES.map((n) => (
                    <button key={n} onClick={() => classer(n)} disabled={classe}
                      className={`flex items-center gap-1.5 rounded-btn border px-3 py-1.5 text-small transition disabled:opacity-40 ${
                        nature === n
                          ? "border-ink bg-ink font-medium text-white"
                          : "border-line text-ink-soft hover:border-ink-faint"
                      }`}>
                      <CatIcone c={n} size={14} /> {t.cat[n]}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-caption leading-relaxed text-ink-faint">
                  {t.natureAide}
                </p>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-small text-ink-soft">{t.typeTitre}</span>
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-small font-medium">
                    <CatIcone c={catDe(p)} size={14} /> {t.cat[catDe(p)]}
                  </span>
                  <button onClick={() => setChoisirType(true)}
                    className="text-caption text-ink-faint underline underline-offset-4 transition hover:text-ink">
                    {argent ? t.modifierType : t.classerMessage}
                  </button>
                </span>
              </div>
            )}
          </div>
      )}

      {/* Le message d'origine — la preuve. En entier d'un geste, mais un long
          SMS ne chasse pas les détails de l'écran : il se replie. dir=auto :
          un texte arabe se lit de droite à gauche, proprement. */}
      <div className="mt-4">
        <p className="mb-1.5 text-caption uppercase tracking-wider text-ink-faint">{t.messageRecu}</p>
        <p dir="auto"
          className={`whitespace-pre-wrap break-words rounded-card bg-surface-2 p-3.5 text-small leading-relaxed text-ink-soft ${
            long && !messageDeplie ? "line-clamp-6" : ""
          }`}>
          {texte}
        </p>
        {long && (
          <button onClick={() => setMessageDeplie((d) => !d)}
            className="mt-1.5 text-caption text-ink-soft underline underline-offset-4 transition hover:text-ink">
            {messageDeplie ? t.replierMessage : t.toutLeMessage}
          </button>
        )}
      </div>
    </Feuille>
  );
}

function L({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-small text-ink-soft">{t}</dt>
      <dd className="text-small font-medium tabnums">{v}</dd>
    </div>
  );
}
