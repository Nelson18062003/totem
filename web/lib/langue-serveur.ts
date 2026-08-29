// Lecture de la langue côté serveur — pages, layout et routes API.

import { cookies } from "next/headers";
import { COOKIE_LANGUE, langueDe, type Langue } from "@noyau/langue";

export async function langueServeur(): Promise<Langue> {
  const boite = await cookies();
  return langueDe(boite.get(COOKIE_LANGUE)?.value);
}

/**
 * La langue d'une demande, qu'elle vienne du navigateur ou du téléphone.
 *
 * Le navigateur porte sa préférence dans un cookie ; l'application, elle,
 * n'a pas de cookie — elle la dit dans l'adresse (`?langue=fr`). On regarde
 * donc l'adresse D'ABORD, puis le cookie, puis la langue par défaut.
 *
 * Sans cet ordre, un téléphone réglé en français recevrait ses messages
 * d'erreur en anglais : le serveur ne verrait aucun cookie et retomberait
 * sur la langue principale de la plateforme.
 */
export async function langueDemandee(req: Request): Promise<Langue> {
  const demandee = new URL(req.url).searchParams.get("langue");
  if (demandee === "fr" || demandee === "en") return demandee;
  return langueServeur();
}
