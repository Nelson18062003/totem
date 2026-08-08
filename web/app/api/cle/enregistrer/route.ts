// Poser une clé sur cet appareil-ci.
//
// Deux temps, une seule route : GET demande la phrase à signer, POST rapporte
// la signature. Il faut être DÉJÀ entré pour arriver ici — on ne pose pas une
// clé sur un compte qu'on n'a pas ouvert.

import { headers } from "next/headers";
import { exigerPresence } from "@/lib/garde";
import { qui, contexteAppareil } from "@/lib/garde";
import { enregistrerCle, lieuDepuis, optionsEnregistrement, proposerUneCle } from "@/lib/cles";
import { langueServeur } from "@/lib/langue-serveur";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export const dynamic = "force-dynamic";

const DIT = {
  fr: {
    connexion: "connexion requise",
    partage: "Cet appareil est partagé : on n'y pose pas de clé. "
      + "Sur un combiné que plusieurs personnes tiennent, une clé n'identifie "
      + "plus personne.",
    ailleurs: "L'adresse du site n'a pas pu être établie.",
    refuse: "Votre téléphone n'a pas confirmé. Réessayez, ou entrez par mail.",
    deja: "Cette clé est déjà enregistrée sur ce compte.",
  },
  en: {
    connexion: "sign-in required",
    partage: "This device is shared, so no key is set up on it. On a handset "
      + "several people hold, a key no longer identifies anyone.",
    ailleurs: "The site address could not be established.",
    refuse: "Your phone did not confirm. Try again, or sign in by email.",
    deja: "This key is already registered on this account.",
  },
} as const;

async function ou() {
  const h = await headers();
  return lieuDepuis(h.get("host"), h.get("x-forwarded-proto"));
}

/** La phrase à signer, et ce que le navigateur doit fabriquer. */
export async function GET() {
  const langue = await langueServeur();
  const dit = DIT[langue];
  const p = await qui();
  if (!p) return Response.json({ erreur: dit.connexion }, { status: 401 });

  // Le refus qui compte. Il tient dans une ligne et il n'est pas négociable :
  // une clé posée sur le combiné du comptoir ouvrirait le compte à quiconque
  // tient le combiné.
  if (!proposerUneCle(p.session.partage)) {
    return Response.json({ erreur: dit.partage }, { status: 409 });
  }

  const lieu = await ou();
  if (!lieu) return Response.json({ erreur: dit.ailleurs }, { status: 503 });

  const options = await optionsEnregistrement(p.personne, p.nom, lieu);
  if (!options) return Response.json({ erreur: dit.ailleurs }, { status: 503 });
  return Response.json(options);
}

/** La signature, rapportée par le navigateur. */
export async function POST(req: Request) {
  const langue = await langueServeur();
  const dit = DIT[langue];
  const p = await exigerPresence();
  if (!proposerUneCle(p.session.partage)) {
    return Response.json({ erreur: dit.partage }, { status: 409 });
  }

  const lieu = await ou();
  if (!lieu) return Response.json({ erreur: dit.ailleurs }, { status: 503 });

  const corps = (await req.json().catch(() => null)) as RegistrationResponseJSON | null;
  if (!corps?.id) return Response.json({ erreur: dit.refuse }, { status: 400 });

  const { appareil, lieu: endroit } = await contexteAppareil();
  const r = await enregistrerCle(p.personne, corps, lieu, appareil, endroit);
  if (!r.ok) return Response.json({ erreur: dit.refuse }, { status: 400 });

  return Response.json({
    ok: true,
    appareil: r.cle.appareil,
    // La personne doit savoir si sa clé est recopiée ailleurs : cela change
    // entièrement ce qu'il faut faire le jour où le téléphone disparaît.
    sauvegardee: r.cle.sauvegardee,
  });
}
