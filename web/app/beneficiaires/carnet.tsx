"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Beneficiaire } from "@noyau/types";
import type { ClientRecent } from "@noyau/recents";
import { nomPropre, numeroPropre } from "@noyau/beneficiaires";
import { formaterNumero } from "@noyau/numero";
import { textesBeneficiaires } from "@noyau/textes/beneficiaires";
import { useLangue } from "../langue";
import { apresEffacement, enFormeDansLeChamp } from "@noyau/saisie";
import { IconPlus } from "../icons";

type CarteCarnet = { iccid: string; libelle: string; operateur: string };

function couleurOperateur(op: string): string {
  const o = op.toUpperCase();
  return o.startsWith("MTN") ? "var(--color-op-mtn)"
    : o.startsWith("ORANGE") ? "var(--color-op-orange)" : "var(--color-ink-faint)";
}

/** Le carnet d'une carte : enregistrer, renommer, retirer — sur place. */
export function Carnet({ cartes, carnet, vus }: {
  cartes: CarteCarnet[];
  carnet: Beneficiaire[];
  vus: Record<string, ClientRecent[]>;
}) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesBeneficiaires[langue];
  const [choisie, setChoisie] = useState(cartes[0]?.iccid ?? "");
  const carte = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  const siens = carnet.filter((b) => b.carte === carte.iccid);
  const deja = new Set(siens.map((b) => b.numero));
  const autres = (vus[carte.iccid] ?? []).filter((r) => !deja.has(r.numero));

  const [envoi, setEnvoi] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  const [nom, setNom] = useState("");
  const [numero, setNumero] = useState("");
  const [edition, setEdition] = useState<number | null>(null);
  const [nomEdition, setNomEdition] = useState("");

  const faire = async (corps: Record<string, unknown>) => {
    if (envoi) return false;
    setEnvoi(true);
    setSouci(null);
    try {
      const r = await fetch("/api/beneficiaires", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(corps),
      });
      if (!r.ok) {
        const c = await r.json().catch(() => null);
        throw new Error(c?.erreur || t.echec);
      }
      router.refresh();
      return true;
    } catch (e) {
      setSouci(e instanceof Error && e.message ? e.message : t.echec);
      return false;
    } finally {
      setEnvoi(false);
    }
  };
  const enregistrer = (n: string, num: string) =>
    faire({ geste: "enregistrer", carte: carte.iccid, numero: num, nom: nomPropre(n) });

  const pret = nom.trim() && /^\d{8,15}$/.test(numeroPropre(numero));

  return (
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10">
      {cartes.length > 1 && (
        <div className="flex flex-wrap gap-2 lg:col-span-2">
          {cartes.map((c) => (
            <button key={c.iccid} onClick={() => setChoisie(c.iccid)} aria-pressed={c.iccid === carte.iccid}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-small font-medium transition ${c.iccid === carte.iccid ? "border-ink bg-ink text-white" : "border-line bg-surface-raised hover:border-ink-faint"}`}>
              <span className="size-2 rounded-full" style={{ background: couleurOperateur(c.operateur) }} />
              {c.libelle}
            </button>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-caption uppercase tracking-wider text-ink-faint">{t.enregistres}</h2>
        {siens.length ? (
          <ul className="divide-hair overflow-hidden rounded-card border border-line bg-surface-raised">
            {siens.map((b) => (
              <li key={b.id}>
                {edition === b.id ? (
                  <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (await faire({ geste: "renommer", id: b.id, nom: nomEdition })) setEdition(null);
                    }}
                    className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <input value={nomEdition} onChange={(e) => setNomEdition(e.target.value)} autoFocus
                      className="min-w-0 flex-1 rounded-btn border border-line bg-surface px-3 py-2 text-body outline-none focus:border-ink" />
                    <button type="submit" disabled={!nomEdition.trim() || envoi}
                      className="rounded-btn bg-ink px-3 py-2 text-small font-medium text-white disabled:opacity-30">{t.enregistrer}</button>
                    <button type="button" onClick={() => setEdition(null)}
                      className="rounded-btn border border-line px-3 py-2 text-small text-ink-soft">{t.annuler}</button>
                    <button type="button" disabled={envoi}
                      onClick={async () => {
                        if (window.confirm(t.supprimerQuestion(b.nom))
                            && await faire({ geste: "supprimer", id: b.id })) setEdition(null);
                      }}
                      className="rounded-btn px-3 py-2 text-small text-negative">{t.supprimer}</button>
                  </form>
                ) : (
                  <button onClick={() => { setEdition(b.id); setNomEdition(b.nom); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2/60">
                    <Initiales nom={b.nom} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{b.nom}</span>
                      <span className="tabnums block text-small text-ink-faint">{formaterNumero(b.numero)}</span>
                    </span>
                    <span className="text-small text-ink-faint">{t.renommer}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small leading-relaxed text-ink-soft">{t.aucunEnregistre}</p>
        )}

        {ajout ? (
          <form onSubmit={async (e) => {
              e.preventDefault();
              if (await enregistrer(nom, numero)) { setAjout(false); setNom(""); setNumero(""); }
            }}
            className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4">
            <p className="font-semibold">{t.ajouter}</p>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t.nomAide} autoFocus
              className="rounded-btn border border-line bg-surface px-3.5 py-2.5 outline-none focus:border-ink" />
            <input value={numero} placeholder={t.numero}
              onChange={(e) => setNumero(enFormeDansLeChamp("numero", apresEffacement(numero, e.target.value), langue))}
              inputMode="tel" className="tabnums rounded-btn border border-line bg-surface px-3.5 py-2.5 text-heading tracking-wide outline-none focus:border-ink" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setAjout(false)}
                className="flex-1 rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft">{t.annuler}</button>
              <button type="submit" disabled={!pret || envoi}
                className="flex-1 rounded-btn bg-ink py-2.5 text-small font-medium text-white disabled:opacity-30">{t.enregistrer}</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setAjout(true)}
            className="inline-flex items-center gap-2 self-start text-small font-medium transition hover:opacity-70">
            <IconPlus size={16} /> {t.ajouter}
          </button>
        )}
        {souci && <p className="text-small text-negative">{souci}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-caption uppercase tracking-wider text-ink-faint">{t.vusDansSms}</h2>
        {autres.length ? (
          <ul className="divide-hair overflow-hidden rounded-card border border-line bg-surface-raised">
            {autres.map((r) => (
              <li key={r.numero} className="flex items-center gap-3 px-4 py-3">
                <Initiales nom={r.nom} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.nom || formaterNumero(r.numero)}</span>
                  <span className="tabnums block text-small text-ink-faint">{formaterNumero(r.numero)}</span>
                </span>
                <button disabled={envoi} onClick={() => void enregistrer(r.nom || r.numero, r.numero)}
                  className="rounded-full bg-surface-2 px-3.5 py-1.5 text-small font-medium transition hover:bg-surface-3">
                  {t.enregistrer}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink-soft">{t.aucunVu}</p>
        )}
        <p className="text-caption leading-relaxed text-ink-faint">{t.origine}</p>
      </section>
    </div>
  );
}

function Initiales({ nom }: { nom: string }) {
  const mots = nom.trim().split(/\s+/).filter((m) => /\p{L}/u.test(m));
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-small font-semibold">
      {mots.length ? (mots[0][0] + (mots[1]?.[0] ?? "")).toUpperCase() : "#"}
    </span>
  );
}
