// Un SMS n'est pas une chaîne de caractères : c'est un encodage.
// Si TOUS les signes tiennent dans l'alphabet GSM 03.38, le message part en
// 7 bits : 160 signes par morceau. Dès qu'UN seul signe en sort — un point
// médian « · », un tiret cadratin « — », une apostrophe courbe « ’ » — tout
// le message bascule en UCS-2 et tombe à 70 signes par morceau.
// Un joli « · » de typographe coûte donc la moitié du message, et un code
// coupé en deux arrive dans le désordre. On vérifie, on ne suppose pas.
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
  + "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_ETENDU = "^{}\\[~]|€";          // comptent double
const dedans = new Set([...GSM]), etendu = new Set([...GSM_ETENDU]);

export function mesurerSms(texte) {
  const hors = [...texte].filter((c) => !dedans.has(c) && !etendu.has(c));
  const ucs2 = hors.length > 0;
  const unites = ucs2 ? [...texte].length
    : [...texte].reduce((n, c) => n + (etendu.has(c) ? 2 : 1), 0);
  const parSeul = ucs2 ? 70 : 160;
  const parMorceau = ucs2 ? 67 : 153;      // en-tête de concaténation
  const morceaux = unites <= parSeul ? 1 : Math.ceil(unites / parMorceau);
  return { unites, ucs2, morceaux, hors: [...new Set(hors)] };
}

const ici = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(ici, process.argv[2] || "C10-messages.src.html"), "utf8");
let fautes = 0;
for (const m of src.matchAll(/<div class="bulle">([\s\S]*?)<\/div>\s*<p class="compte">([^<]*)<\/p>/g)) {
  const brut = m[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
  const texte = brut.replace(/\s+/g, " ").trim();
  const r = mesurerSms(texte);
  const annonce = /(\d+)\s*characters/.exec(m[2]);
  const canal = /WhatsApp/.test(m[2]) ? "WhatsApp" : "SMS";
  const ok = r.morceaux === 1 || canal === "WhatsApp";
  const compte = annonce && Number(annonce[1]) === r.unites;
  console.log(`${ok && compte ? "✔" : "✘"} ${canal.padEnd(8)} ${String(r.unites).padStart(4)} unités · ${r.ucs2 ? "UCS-2" : "GSM-7"} · ${r.morceaux} morceau(x)`);
  if (!compte && annonce) { console.log(`    annoncé ${annonce[1]}, réel ${r.unites}`); fautes++; }
  if (r.ucs2 && canal === "SMS") { console.log(`    hors GSM-7 : ${r.hors.map((c) => `« ${c} » U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join(", ")}`); fautes++; }
  if (r.morceaux > 1 && canal === "SMS") { console.log(`    ce message part en ${r.morceaux} morceaux — un code coupé arrive dans le désordre`); fautes++; }
  console.log(`    « ${texte.slice(0, 62)}… »`);
}
if (fautes) { console.log(`\n✘ ${fautes} problème(s) de message`); process.exit(1); }
console.log("\n✔ tous les messages tiennent en un seul envoi, et les comptes sont justes.");
