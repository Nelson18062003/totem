// Faire sonner un téléphone depuis la PLATEFORME.
//
// D'habitude ce n'est pas elle qui sonne : c'est le robot de Douala, parce
// qu'il est le seul à savoir ce qu'il n'a PAS compris d'un SMS (voir
// `totem/notification.py`). Cette règle ne bouge pas.
//
// Il reste UN cas où la plateforme doit pouvoir pousser elle-même : l'essai.
// Le propriétaire vient d'installer l'application ; il veut savoir tout de
// suite si son téléphone sonnera le jour où de l'argent arrivera. Lui
// demander d'attendre un vrai paiement pour le découvrir serait cruel — et
// s'il ne sonne pas, il faudra chercher longtemps.
//
// CE QUE CET ESSAI ÉPROUVE, et il faut être honnête sur la limite :
//
//   ✓ le jeton de l'appareil est bien enregistré ;
//   ✓ Expo l'accepte ;
//   ✓ Apple ou Google le relaie ;
//   ✓ le téléphone l'affiche, sur le bon canal, avec le bon son.
//
//   ✗ PAS le robot de Douala. Un SMS qui arrive là-bas emprunte le même
//     dernier kilomètre, mais le premier — le modem, la lecture du SMS,
//     l'analyse — n'est pas touché ici.
//
// Aucun contenu de SMS ne passe par là : le message d'essai ne parle que de
// lui-même. Ce qu'une vraie notification montre — le message reçu, en aperçu,
// tel qu'il est arrivé — se décide chez le robot (`totem/notification.py`), à
// un seul endroit.
//
// ────────────────────────────────────────────────────────────────────────
// LE BILLET N'EST PAS L'ACCUSÉ, ET LA DIFFÉRENCE A COÛTÉ DES SEMAINES.
//
// Ce fichier ne lisait que le BILLET — la réponse immédiate du guichet
// d'Expo. Un billet « ok » ne dit rien de plus que : « votre message est
// accepté, je m'en occupe ». Ce qui se passe ENSUITE — Apple qui refuse
// parce que le projet n'a pas de clé, Google qui ne connaît pas l'appareil,
// le téléphone désinstallé — ne s'écrit QUE dans l'ACCUSÉ DE RÉCEPTION,
// qu'il faut aller chercher après coup.
//
// Résultat, sur cet iPhone-ci : l'écran annonçait « Envoyé. Votre téléphone
// devrait sonner dans quelques secondes », et rien ne sonnait, jamais. Le
// propriétaire n'avait pas une panne à réparer, il avait un écran qui lui
// disait que tout allait bien. **Un contrôle qui passe sans rien regarder
// est pire que pas de contrôle : il rassure.**
//
// On va donc chercher les accusés, et c'est l'accusé qui a le dernier mot.
// ────────────────────────────────────────────────────────────────────────

const GUICHET_EXPO = "https://exp.host/--/api/v2/push/send";
const GUICHET_ACCUSES = "https://exp.host/--/api/v2/push/getReceipts";
const DELAI_MS = 10_000;

/** Les attentes entre deux demandes d'accusé. Expo prévient qu'un accusé
 *  peut mettre plusieurs minutes ; en pratique il est là en une ou deux
 *  secondes. On patiente le temps qu'une personne accepte d'attendre devant
 *  un bouton, pas une seconde de plus — et on DIT qu'on n'a pas attendu la
 *  suite plutôt que d'inventer une réussite. */
const ATTENTES_ACCUSE = [1_200, 2_000, 3_000];

/**
 * POURQUOI UNE CAUSE, ET PAS LE MESSAGE D'EXPO.
 *
 * Le détail rendu par Expo est un mot anglais de développeur —
 * « InvalidCredentials », « MismatchSenderId ». Il était affiché tel quel
 * au propriétaire, qui n'est pas informaticien : autant lui montrer une
 * page blanche. Chaque cause porte donc un nom d'ici, et l'écran la dit
 * dans sa langue (voir `noyau/textes/reglages.ts`).
 */
export type Cause =
  /** Le projet n'a pas de quoi joindre ce téléphone : clé Apple absente
   *  chez Expo (iPhone), ou fichier Firebase absent du paquet (Android).
   *  C'EST LA PANNE LA PLUS FRÉQUENTE, et elle ne se répare pas d'ici. */
  | "sansCle"
  /** L'appareil est inscrit sous un autre projet de notification. */
  | "mauvaisProjet"
  /** Trop d'envois d'affilée vers le même appareil. */
  | "tropSouvent"
  /** Le message dépassait ce que le service accepte. */
  | "tropGros"
  /** Le guichet lui-même n'a pas répondu, ou a refusé la requête. */
  | "guichet"
  /** Une raison qu'on ne sait pas nommer : le détail brut fait foi. */
  | "autre";

/** Ce qu'Expo a répondu pour UN appareil, une fois l'accusé lu. */
export type Verdict = {
  jeton: string;
  /**
   * - `ok` : l'accusé confirme la remise. Le téléphone a sonné.
   * - `attente` : accepté, mais l'accusé n'est pas encore revenu. On ne
   *   promet rien — c'est exactement l'état où l'ancien code annonçait une
   *   réussite.
   * - `inconnu` : l'appareil n'existe plus (désinstallé, jeton remplacé).
   *   Son jeton ne servira plus jamais : on peut l'oublier.
   * - `invalide` : le service refuse de servir cet appareil, et dit
   *   pourquoi. C'est là que vit « il manque la clé Apple ».
   * - `refuse` : le guichet n'a pas pris la requête.
   */
  etat: "ok" | "attente" | "inconnu" | "invalide" | "refuse";
  cause?: Cause;
  /** Les mots du service, gardés pour le journal — jamais pour l'écran. */
  detail?: string;
};

type Billet = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

/** Le mot d'Expo, traduit en une cause d'ici. */
function cause(erreur: string | undefined): Cause {
  switch (erreur) {
    case "InvalidCredentials": return "sansCle";
    case "MismatchSenderId": return "mauvaisProjet";
    case "MessageRateExceeded": return "tropSouvent";
    case "MessageTooBig": return "tropGros";
    default: return "autre";
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Demande les accusés de ces envois. Rend ce qu'Expo a rendu, et rien
 *  d'autre : un guichet muet ne se transforme pas en refus — l'envoi peut
 *  très bien être en route. */
async function accuses(ids: string[]): Promise<Record<string, Billet>> {
  if (!ids.length) return {};
  try {
    const r = await fetch(GUICHET_ACCUSES, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(DELAI_MS),
      cache: "no-store",
    });
    if (!r.ok) return {};
    const corps = await r.json().catch(() => null);
    const data = corps?.data;
    return data && typeof data === "object" ? (data as Record<string, Billet>) : {};
  } catch {
    return {};
  }
}

/**
 * Pousse un message vers ces appareils, et DIT ce qui leur est arrivé.
 *
 * Le compte d'envois ne suffit pas, et le compte de billets non plus : Expo
 * accepte la requête entière, rend un billet par appareil, puis un ACCUSÉ
 * par billet. Seul l'accusé sait si le téléphone a sonné.
 */
export async function pousser(
  jetons: string[], titre: string, corps: string,
): Promise<Verdict[]> {
  const valides = jetons.filter((j) => typeof j === "string" && j.startsWith("Expo"));
  if (!valides.length || !corps) return [];

  const messages = valides.map((jeton) => ({
    to: jeton,
    title: titre,
    body: corps,
    sound: "default",
    // La même priorité que celle du robot, et pour la même raison : en
    // priorité « normale », Android ne réveille pas un téléphone qui dort —
    // il garde la notification pour sa prochaine fenêtre d'entretien,
    // plusieurs minutes plus tard. Un essai qui voyagerait autrement que les
    // vraies notifications ne prouverait rien des vraies.
    priority: "high",
    // Le même canal que celui du robot, déclaré par `src/sonnerie.tsx` :
    // un essai qui arriverait sur un autre canal ne prouverait rien du
    // canal qui sert vraiment.
    channelId: "paiements",
  }));

  let billets: Billet[] = [];
  try {
    const r = await fetch(GUICHET_EXPO, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(DELAI_MS),
      cache: "no-store",
    });
    if (!r.ok) {
      return valides.map((jeton) => ({
        jeton, etat: "refuse" as const, cause: "guichet" as const,
        detail: `guichet ${r.status}`,
      }));
    }
    const corpsRep = await r.json().catch(() => null);
    billets = Array.isArray(corpsRep?.data) ? corpsRep.data : [];
  } catch (e) {
    return valides.map((jeton) => ({
      jeton, etat: "refuse" as const, cause: "guichet" as const,
      detail: e instanceof Error ? e.message : "guichet injoignable",
    }));
  }

  // Premier tri, sur le billet. Un billet en erreur est déjà un verdict :
  // l'envoi n'a même pas commencé, il n'y aura pas d'accusé.
  const verdicts: Verdict[] = valides.map((jeton, i) => {
    const b = billets[i];
    if (!b) return { jeton, etat: "refuse", cause: "guichet", detail: "sans réponse" };
    if (b.status === "ok") return { jeton, etat: "attente" };
    const erreur = b.details?.error;
    // « DeviceNotRegistered » : l'application a été désinstallée, ou le jeton
    // a été remplacé. Ce jeton ne servira plus JAMAIS — on peut l'oublier.
    if (erreur === "DeviceNotRegistered") {
      return { jeton, etat: "inconnu", detail: b.message };
    }
    return { jeton, etat: "invalide", cause: cause(erreur), detail: b.message ?? erreur };
  });

  // Les billets acceptés portent chacun un numéro : c'est par lui qu'on
  // réclame l'accusé.
  const numeros = new Map<string, number>();
  valides.forEach((_, i) => {
    const id = billets[i]?.id;
    if (id && verdicts[i].etat === "attente") numeros.set(id, i);
  });

  for (const attente of ATTENTES_ACCUSE) {
    const restants = [...numeros.keys()].filter((id) => {
      const i = numeros.get(id);
      return i !== undefined && verdicts[i].etat === "attente";
    });
    if (!restants.length) break;
    await dormir(attente);
    const rendus = await accuses(restants);
    for (const [id, accuse] of Object.entries(rendus)) {
      const i = numeros.get(id);
      if (i === undefined || !accuse) continue;
      if (accuse.status === "ok") { verdicts[i] = { ...verdicts[i], etat: "ok" }; continue; }
      const erreur = accuse.details?.error;
      if (erreur === "DeviceNotRegistered") {
        verdicts[i] = { jeton: verdicts[i].jeton, etat: "inconnu", detail: accuse.message };
        continue;
      }
      verdicts[i] = {
        jeton: verdicts[i].jeton, etat: "invalide",
        cause: cause(erreur), detail: accuse.message ?? erreur,
      };
    }
  }

  return verdicts;
}
