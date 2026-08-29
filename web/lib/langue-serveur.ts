// Lecture de la langue côté serveur — pages, layout et routes API.

import { cookies } from "next/headers";
import { COOKIE_LANGUE, langueDe, type Langue } from "@noyau/langue";

export async function langueServeur(): Promise<Langue> {
  const boite = await cookies();
  return langueDe(boite.get(COOKIE_LANGUE)?.value);
}
