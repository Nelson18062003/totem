import { chargerDonnees } from "@/lib/serveur";
import type { Paiement } from "@/lib/types";
import { Vide } from "../vide";

export const dynamic = "force-dynamic";

export default async function SmsRecus() {
  const { paiements } = await chargerDonnees();

  const parDate = paiements.reduce<Record<string, Paiement[]>>((acc, p) => {
    (acc[p.date] ||= []).push(p); return acc;
  }, {});

  return (
    // Des lignes de SMS trop larges se lisent mal : on borne la colonne.
    <div className="flex max-w-3xl flex-col gap-7">
      <header>
        <h1 className="text-title font-semibold tracking-tight">SMS reçus</h1>
        <p className="mt-1 text-small text-ink-soft">
          Le message d’origine de chaque paiement, tel que la carte l’a reçu.
          C’est lui qui fait foi — les montants en sont extraits, jamais réécrits.
        </p>
      </header>

      {Object.keys(parDate).length === 0 ? (
        <Vide
          titre="Aucun message pour l’instant"
          detail="Les SMS des paiements apparaîtront ici dès que le terminal en recevra."
        />
      ) : (
        Object.entries(parDate).map(([date, items]) => (
          <section key={date}>
            <p className="mb-1 text-caption uppercase tracking-wider text-ink-faint">{date}</p>
            <ul className="divide-hair">
              {items.map((p) => (
                <li key={p.id} className="py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-small font-medium">{p.sim}</p>
                    <span className="flex items-center gap-2">
                      <span className={`rounded-sm px-1.5 py-0.5 text-caption font-medium ${
                        p.sens === "in" ? "bg-ink text-white" : "bg-surface-2 text-ink-soft"
                      }`}>
                        {p.sens === "in" ? "Reçu" : "Envoyé"}
                      </span>
                      <span className="text-small tabnums text-ink-faint">{p.heure}</span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-small leading-relaxed text-ink-soft">{p.smsBrut}</p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <p className="text-caption leading-relaxed text-ink-faint">
        Les autres SMS — solde, publicité, codes à usage unique — restent pour
        l’instant dans le journal du terminal, consultables sur Telegram. Les
        faire remonter ici demande une table de plus dans la base ; c’est une
        prochaine étape. Un code à usage unique, lui, ne sera jamais montré en
        clair.
      </p>
    </div>
  );
}
