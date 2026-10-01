import { test } from "node:test";
import assert from "node:assert/strict";
import { clientsRecents } from "../recents";
import type { Paiement } from "../types";

const p = (numero: string, tiers: string, carte: string, recuLe: string) =>
  ({ numero, tiers, carte, recuLe } as unknown as Paiement);

test("les numéros de CETTE carte, sans doublon, le plus récent d'abord", () => {
  const r = clientsRecents([
    p("677 99 88 77", "NKENGAFAC M.", "mtn", "2026-10-01T08:00:00Z"),
    p("677998877", "NKENGAFAC M.", "mtn", "2026-10-01T09:00:00Z"),
    p("690112233", "BOUTIQUE AKWA", "orange", "2026-10-01T10:00:00Z"),
    p("", "SANS NUMERO", "mtn", "2026-10-01T11:00:00Z"),
    p("670334455", "", "mtn", "2026-09-30T08:00:00Z"),
  ], "mtn");
  assert.deepEqual(r, [
    { numero: "677998877", nom: "NKENGAFAC M." },
    { numero: "670334455", nom: "" },
  ]);
});
