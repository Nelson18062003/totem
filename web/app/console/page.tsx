"use client";

import { useRef, useState } from "react";

type Ligne = { role: "vous" | "reseau" | "info"; texte: string };

// Menu MoMo simplifié pour la maquette (démo hors-ligne, sans matériel).
const REPONSES: Record<string, { texte: string; ouvert: boolean; pin?: boolean }> = {
  "*126#": {
    texte:
      "MTN MoMo\n1. Transfert d'argent\n2. Retrait d'argent\n3. Paiements\n4. Épargne\n5. Mon compte\n6. Quitter",
    ouvert: true,
  },
  "menu:1": { texte: "Transfert\nEntrez le numéro du bénéficiaire :", ouvert: true },
  "num": { texte: "Entrez le montant (FCFA) :", ouvert: true },
  "montant": { texte: "Confirmez avec votre code PIN :", ouvert: true, pin: true },
  "pin": {
    texte: "✅ Transfert de 50 000 FCFA vers 677 12 34 56 réussi.\nFrais : 500 FCFA.\nNouveau solde : 822 000 FCFA.",
    ouvert: false,
  },
  "menu:5": { texte: "Mon compte\n1. Consulter le solde\n2. Dernières transactions\n3. Retour", ouvert: true },
  "compte:1": { texte: "Votre solde MoMo est de 872 500 FCFA.", ouvert: false },
};

export default function Console() {
  const [historique, setHistorique] = useState<Ligne[]>([
    { role: "info", texte: "Console USSD — maquette de démonstration. Tapez *126# pour commencer." },
  ]);
  const [saisie, setSaisie] = useState("");
  const [etape, setEtape] = useState<string | null>(null); // suit la navigation du menu
  const [sim, setSim] = useState<"MTN" | "Orange">("MTN");
  const finRef = useRef<HTMLDivElement>(null);

  function ajouter(l: Ligne) {
    setHistorique((h) => [...h, l]);
    setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
  }

  function repondre(brut: string) {
    const t = brut.trim();
    if (!t) return;
    const pinEnCours = etape === "montant";
    ajouter({ role: "vous", texte: pinEnCours ? "••••" : t });
    setSaisie("");

    // Détermine la réponse simulée selon l'étape courante.
    let cle = "";
    if (/^\*\d+#$/.test(t)) cle = "*126#";
    else if (etape === "*126#" && t === "1") cle = "menu:1";
    else if (etape === "*126#" && t === "5") cle = "menu:5";
    else if (etape === "menu:1") cle = "num";
    else if (etape === "num") cle = "montant";
    else if (etape === "montant") cle = "pin";
    else if (etape === "menu:5" && t === "1") cle = "compte:1";

    const rep = REPONSES[cle];
    setTimeout(() => {
      if (!rep) {
        ajouter({ role: "reseau", texte: "Option non gérée dans la maquette. Tapez *126#." });
        setEtape(null);
        return;
      }
      ajouter({ role: "reseau", texte: rep.texte });
      setEtape(rep.ouvert ? (cle === "*126#" ? "*126#" : cle) : null);
    }, 350);
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col gap-3 md:h-[calc(100dvh-6rem)]">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-title font-bold">Console USSD brute</h1>
          <p className="text-small text-ink-soft">Pour un code particulier. Le plus simple reste les Actions guidées.</p>
        </div>
        <div className="flex rounded-pill border border-line p-0.5">
          {(["MTN", "Orange"] as const).map((o) => (
            <button
              key={o}
              onClick={() => setSim(o)}
              className={`rounded-pill px-3 py-1 text-small font-semibold transition ${
                sim === o ? "bg-brand text-black" : "text-ink-soft"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </header>

      {/* Fil de la session */}
      <div className="flex-1 space-y-2.5 overflow-y-auto rounded-card border border-line bg-surface-sunken p-3">
        {historique.map((l, i) => (
          <div
            key={i}
            className={
              l.role === "vous"
                ? "ml-auto max-w-[80%] rounded-card rounded-br-sm bg-brand px-3.5 py-2 text-black"
                : l.role === "reseau"
                  ? "mr-auto max-w-[85%] whitespace-pre-line rounded-card rounded-bl-sm border border-line bg-surface-raised px-3.5 py-2"
                  : "mx-auto max-w-[90%] text-center text-caption text-ink-soft"
            }
          >
            {l.texte}
          </div>
        ))}
        <div ref={finRef} />
      </div>

      {/* Raccourcis */}
      <div className="flex gap-2 overflow-x-auto">
        {["*126#", "#150#", "1", "5"].map((r) => (
          <button
            key={r}
            onClick={() => repondre(r)}
            className="shrink-0 rounded-pill border border-line bg-surface-raised px-3.5 py-1.5 text-small font-mono hover:border-brand"
          >
            {r}
          </button>
        ))}
      </div>

      {/* Saisie */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          repondre(saisie);
        }}
        className="flex gap-2"
      >
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          inputMode={etape === "montant" ? "numeric" : "text"}
          type={etape === "montant" ? "password" : "text"}
          placeholder={etape ? "Votre réponse…" : "Tapez *126# puis Entrée"}
          className="flex-1 rounded-btn border border-line bg-surface-raised px-4 py-3 text-body outline-none placeholder:text-ink-soft focus:border-brand"
        />
        <button
          type="submit"
          className="rounded-btn bg-brand px-5 py-3 font-bold text-black transition hover:opacity-90"
        >
          Envoyer
        </button>
      </form>
      <p className="text-center text-caption text-ink-soft">
        🔒 Le code PIN n’est jamais enregistré — masqué et effacé après envoi.
      </p>
    </div>
  );
}
