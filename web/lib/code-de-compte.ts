// LE CODE DE COMPTE — ce qui désigne un compte quand TOTEM lui attribue une
// carte.
//
// POURQUOI PAS L'ADRESSE E-MAIL. L'inscription est publique et le compte
// entre tout de suite : rien ne prouve que l'adresse tapée appartient à celle
// qui la tape. Si TOTEM attribuait la puce « au compte de telle adresse »,
// il suffirait à un inconnu de créer le compte au courriel d'une autre
// personne AVANT elle : quand elle enverrait sa puce en donnant SON adresse,
// TOTEM l'attribuerait à l'inconnu — qui lirait ses SMS, ses codes de
// confirmation, ses soldes, et manierait la carte.
//
// Le code, lui, ne se devine pas et ne se choisit pas : il n'est montré QU'AU
// titulaire du compte, dans son application (« Ajouter ma carte »), et au
// propriétaire de la plateforme, dans sa liste des comptes. La personne le
// joint à sa puce ; TOTEM attribue la puce au compte qui porte CE code.
//
// COMMENT IL EST FAIT. Une signature (HMAC-SHA256) du numéro du compte avec
// la clé de session : les numéros se suivent (1, 2, 3…), le code non — sans
// la clé, connaître le numéro d'un compte ne dit rien de son code. Rien à
// ranger en base, rien à migrer. Huit caractères pris dans un alphabet sans
// les signes qui se confondent (ni 0/O, ni 1/I/L), coupés en deux par un
// tiret : « K7QM-4XHT ». Plus de huit cents milliards de codes possibles :
// on ne tombe pas sur celui d'un autre en essayant.
//
// CE QU'IL FAUT SAVOIR. Changer `SESSION_SECRET` change TOUS les codes (et
// ferme toutes les sessions, ce qui se voit davantage). Une puce déjà
// attribuée le reste : seul un code noté sur une enveloppe pas encore
// envoyée deviendrait faux.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 signes lisibles
const enc = new TextEncoder();

/** Le code de compte, ou `null` sans clé de session (développement). */
export async function codeDuCompte(id: number): Promise<string | null> {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret || !Number.isInteger(id)) return null;
  const cle = await crypto.subtle.importKey(
    "raw", enc.encode(secret) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign(
    "HMAC", cle, enc.encode(`code-de-compte|${id}`) as unknown as BufferSource));
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[sig[i] % ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Le code tel qu'on le recopie — majuscules, sans espaces ni tiret
 *  oublié — pour comparer ce qu'une personne a tapé. */
export function codeNormalise(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : "";
}
