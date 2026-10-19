// LA DÉMO VIVANTE, côté plateforme : ce que seul son administrateur fait, et
// le pont vers Glisil (docs/DEMO-VIVANTE.md).
//
// Tout ici se joue DANS la démo (`dansLaDemoVivante`) : même appelé depuis
// une requête de la maison, rien ne touche une vraie table — et réciproquement,
// la maison ne voit jamais ce que ce fichier écrit.
//
// QUI PEUT APPELER QUOI se décide dans les routes (`/api/demo/…`) : la
// fabrication et les floats exigent l'administrateur de la démo ; la création
// de cet administrateur, le vrai propriétaire de TOTEM. Ce fichier ne fait
// qu'exécuter.

import { appeler, relie } from "@/lib/serveur";
import { dansLaDemoVivante } from "@/lib/monde";

const cle = process.env.SUPABASE_CLE || "";
const entetes = (): Record<string, string> => ({
  apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json",
});

async function lireDemo<T>(chemin: string): Promise<T[]> {
  if (!relie) return [];
  try {
    const r = await appeler(chemin, { headers: entetes(), cache: "no-store" });
    return r.ok ? ((await r.json()) as T[]) : [];
  } catch {
    return [];
  }
}

async function rpcDemo(nom: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await appeler(`rpc/${nom}`, {
    method: "POST", headers: entetes(), body: JSON.stringify(args), cache: "no-store",
  });
  if (!r.ok) throw new Error(`demo ${nom} → ${r.status}`);
  return r.json();
}

export type Verdict = { ok: true; solde: number; reference: string } | { ok: false; raison: string };

/** FABRIQUER DES FRANCS : la seule source d'argent de la démo. La base garde
 *  la trace (`demo_emissions`) — la somme des soldes égale toujours la somme
 *  fabriquée. Le montant est un entier positif ; aucun plafond, comme pour
 *  les vrais dépôts. */
export function fabriquerDesFrancs(iccid: string, montant: number, par: string): Promise<Verdict> {
  return dansLaDemoVivante(async () => {
    if (!/^[A-Za-z0-9]{1,32}$/.test(iccid)) return { ok: false, raison: "Carte inconnue." };
    if (!Number.isSafeInteger(montant) || montant <= 0) return { ok: false, raison: "Montant invalide." };
    try {
      const r = (await rpcDemo("demo_fabriquer", { p_iccid: iccid, p_montant: montant, p_par: par })) as
        { ok?: boolean; raison?: string; solde?: number; reference?: string };
      if (!r?.ok) return { ok: false, raison: r?.raison || "Refusé." };
      void deposerChezGlisil();
      return { ok: true, solde: Number(r.solde), reference: String(r.reference) };
    } catch {
      return { ok: false, raison: "La base n'a pas répondu." };
    }
  });
}

export type EtatDeLaDemo = {
  cartes: {
    iccid: string; libelle: string; operateur: string; numero: string; nom: string;
    solde: number; titulaire: string | null; float: boolean;
  }[];
  fabrique: number;
  enCirculation: number;
  glisil: { relie: boolean; enAttente: number; derniereReponse: string | null };
};

/** Ce que l'administrateur voit : chaque carte, son titulaire, son solde ;
 *  la somme fabriquée face à la somme des soldes (elles doivent être
 *  égales) ; et où en est la file vers Glisil. */
export function etatDeLaDemo(): Promise<EtatDeLaDemo> {
  return dansLaDemoVivante(async () => {
    const [comptes, cartes, attributions, utilisateurs, floats, emissions, file] = await Promise.all([
      lireDemo<{ iccid: string; libelle: string; operateur: string; numero: string; solde: number | null }>(
        "comptes?select=iccid,libelle,operateur,numero,solde&order=id.asc&limit=1000"),
      lireDemo<{ iccid: string; nom: string | null }>("cartes?select=iccid,nom&limit=1000"),
      lireDemo<{ utilisateur: number; iccid: string }>("attributions?select=utilisateur,iccid&limit=2000"),
      lireDemo<{ id: number; courriel: string; prenom: string | null; nom: string | null }>(
        "utilisateurs?select=id,courriel,prenom,nom&limit=1000"),
      lireDemo<{ iccid: string }>("demo_floats_xafe?select=iccid"),
      lireDemo<{ montant: number }>("demo_emissions?select=montant&limit=100000"),
      lireDemo<{ envoye_le: string | null; reponse: string | null }>(
        "demo_file_xafe?select=envoye_le,reponse&order=paiement_id.desc&limit=500"),
    ]);
    const nomDe = new Map(cartes.map((c) => [c.iccid, c.nom ?? ""]));
    const qui = new Map(utilisateurs.map((u) => [u.id,
      [u.prenom, u.nom].filter(Boolean).join(" ") || u.courriel]));
    const titulaire = new Map(attributions.map((a) => [a.iccid, qui.get(a.utilisateur) ?? null]));
    const sontFloats = new Set(floats.map((f) => f.iccid));
    const lignes = comptes.map((c) => ({
      iccid: c.iccid, libelle: c.libelle, operateur: c.operateur, numero: c.numero,
      nom: nomDe.get(c.iccid) ?? "", solde: Number(c.solde ?? 0),
      titulaire: titulaire.get(c.iccid) ?? null, float: sontFloats.has(c.iccid),
    }));
    return {
      cartes: lignes,
      fabrique: emissions.reduce((s, e) => s + Number(e.montant), 0),
      enCirculation: lignes.reduce((s, c) => s + c.solde, 0),
      glisil: {
        relie: Boolean(process.env.XAFE_DEMO_URL && process.env.XAFE_DEMO_CLE),
        enAttente: file.filter((f) => !f.envoye_le).length,
        derniereReponse: file.find((f) => f.envoye_le)?.reponse ?? null,
      },
    };
  });
}

/** Déclare (ou retire) une carte de démo comme float de test chez Glisil :
 *  ses SMS d'argent partiront chez Glisil, comme ceux d'un vrai boîtier. */
export function declarerFloat(iccid: string, float: boolean): Promise<boolean> {
  return dansLaDemoVivante(async () => {
    if (!relie || !/^[A-Za-z0-9]{1,32}$/.test(iccid)) return false;
    const existe = await lireDemo<{ iccid: string }>(`comptes?select=iccid&iccid=eq.${iccid}&limit=1`);
    if (!existe.some((c) => c.iccid === iccid)) return false;
    const r = float
      ? await appeler("demo_floats_xafe?on_conflict=iccid", {
          method: "POST", cache: "no-store", body: JSON.stringify([{ iccid }]),
          headers: { ...entetes(), prefer: "resolution=ignore-duplicates,return=minimal" },
        })
      : await appeler(`demo_floats_xafe?iccid=eq.${iccid}`, {
          method: "DELETE", cache: "no-store", headers: entetes(),
        });
    return r.ok;
  });
}

// ---------------------------------------------------------------------------
// LE PONT VERS GLISIL
//
// Un vrai boîtier relève le SMS, le lit, et le dépose chez Glisil par la
// porte signée (totem/xafe.py). Ici, le SMS est écrit par la base elle-même,
// déjà lu : la plateforme fait la même dernière étape — la même porte, la
// même signature, ligne par ligne — sous l'identité du terminal « totem-demo »
// que Glisil connaît, avec sa propre clé :
//
//   XAFE_DEMO_URL    l'adresse du projet Supabase de Glisil (le test)
//   XAFE_DEMO_CLE    la clé du terminal « totem-demo » chez Glisil
//   XAFE_DEMO_ANON   la clé publique de ce projet, si sa passerelle l'exige
//
// Sans ces variables, la file attend : rien ne se perd, rien ne part.
// ---------------------------------------------------------------------------

export const TERMINAL_DEMO = "totem-demo";

const enc = new TextEncoder();

/** hex( HMAC-SHA256( clé, horodatage + "." + MÉTHODE + " " + cible + "." + corps ) )
 *  — la signature de totem/xafe.py et de la porte de Glisil, à l'octet. */
export async function signerPourGlisil(
  cleTerminal: string, horodatage: number, methode: string, cible: string, corps: string,
): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(cleTerminal) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign(
    "HMAC", k, enc.encode(`${horodatage}.${methode.toUpperCase()} ${cible}.${corps}`) as unknown as BufferSource);
  return Array.from(new Uint8Array(sig), (o) => o.toString(16).padStart(2, "0")).join("");
}

type LigneDuFloat = {
  id: number; carte: string; sens: string | null; montant: number | null;
  numero: string | null; tiers: string | null; reference: string | null;
  solde_apres: number | null; texte: string; emis_le: string | null; recu_le: string;
};

// Une seule vidange à la fois sur cette instance : deux gestes rapprochés ne
// déposent pas deux fois le même lot (Glisil reconnaîtrait le doublon — il
// le reconnaît par terminal et numéro de ligne — mais autant ne pas l'y
// obliger).
let enCours: Promise<number> | null = null;

/** Dépose chez Glisil ce que les floats de test ont encaissé ou payé.
 *  Rend le nombre de lignes tranchées par Glisil. */
export function deposerChezGlisil(): Promise<number> {
  if (enCours) return enCours;
  enCours = dansLaDemoVivante(vidanger).finally(() => { enCours = null; });
  return enCours;
}

async function vidanger(): Promise<number> {
  const base = (process.env.XAFE_DEMO_URL || "").replace(/\/+$/, "");
  const cleTerminal = process.env.XAFE_DEMO_CLE || "";
  const anon = process.env.XAFE_DEMO_ANON || "";
  if (!relie || !base || !cleTerminal) return 0;
  const file = await lireDemo<{ paiement_id: number; essais: number }>(
    "demo_file_xafe?select=paiement_id,essais&envoye_le=is.null&essais=lt.20&order=paiement_id.asc&limit=50");
  if (file.length === 0) return 0;
  const ids = file.map((f) => f.paiement_id).filter((n) => Number.isSafeInteger(n));
  const [paiements, comptes] = await Promise.all([
    lireDemo<LigneDuFloat>(`paiements?select=id,carte,sens,montant,numero,tiers,reference,solde_apres,texte,emis_le,recu_le&id=in.(${ids.join(",")})`),
    lireDemo<{ iccid: string; operateur: string; numero: string }>("comptes?select=iccid,operateur,numero&limit=1000"),
  ]);
  const carteDe = new Map(comptes.map((c) => [c.iccid, c]));
  const lignes = paiements
    .filter((p) => ids.includes(p.id) && (p.sens === "entree" || p.sens === "sortie"))
    .map((p) => {
      const c = carteDe.get(p.carte);
      return c && {
        terminal: TERMINAL_DEMO,
        source_id: p.id,
        operateur: c.operateur === "MTN" ? "mtn" : "om",
        float_numero: c.numero,
        sens: p.sens,
        montant: Number(p.montant),
        numero: p.numero,
        tiers: p.tiers || p.numero,
        reference: p.reference,
        texte: p.texte,
        emis_le: p.emis_le,
        recu_le: p.recu_le,
        ...(p.solde_apres != null ? { solde_apres: Number(p.solde_apres) } : {}),
      };
    })
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
  if (lignes.length === 0) return 0;

  const corps = JSON.stringify({ lignes });
  const ts = Math.floor(Date.now() / 1000);
  let verdicts: { source_id?: number; resultat?: string; motif?: string; reference?: string }[] = [];
  let statut = 0;
  try {
    const r = await fetch(`${base}/functions/v1/totem-sms`, {
      method: "POST", body: corps, cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-totem-terminal": TERMINAL_DEMO,
        "x-totem-horodatage": String(ts),
        "x-totem-signature": await signerPourGlisil(cleTerminal, ts, "POST", "totem-sms", corps),
        ...(anon ? { apikey: anon, authorization: `Bearer ${anon}` } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    statut = r.status;
    const lu = await r.json().catch(() => null);
    verdicts = Array.isArray(lu) ? lu : lu ? [lu] : [];
  } catch {
    statut = 0;
  }

  let tranchees = 0;
  const maintenant = new Date().toISOString();
  for (const l of lignes) {
    const v = statut === 200 ? verdicts.find((x) => x?.source_id === l.source_id) : undefined;
    const tranche = v && ["credite", "retenue", "ignore", "constatee", "refuse"].includes(v.resultat ?? "");
    const reponse = tranche
      ? `${v!.resultat} ${v!.reference || v!.motif || ""}`.trim().slice(0, 300)
      : statut === 401 ? "signature refusée par Glisil"
        : statut === 0 ? "Glisil injoignable" : `Glisil : ${v?.resultat ?? statut} ${v?.motif ?? ""}`.trim().slice(0, 300);
    const essais = (file.find((f) => f.paiement_id === l.source_id)?.essais ?? 0) + 1;
    await appeler(`demo_file_xafe?paiement_id=eq.${l.source_id}`, {
      method: "PATCH", cache: "no-store",
      headers: { ...entetes(), prefer: "return=minimal" },
      body: JSON.stringify(tranche ? { envoye_le: maintenant, reponse, essais } : { reponse, essais }),
    }).catch(() => null);
    if (tranche) tranchees++;
  }
  return tranchees;
}
