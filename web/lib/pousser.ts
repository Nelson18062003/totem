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
//   ✓ Firebase le relaie ;
//   ✓ Android l'affiche, sur le bon canal, avec le bon son.
//
//   ✗ PAS le robot de Douala. Un SMS qui arrive là-bas emprunte le même
//     dernier kilomètre, mais le premier — le modem, la lecture du SMS,
//     l'analyse — n'est pas touché ici.
//
// Aucun contenu de SMS ne passe par là : le message d'essai ne parle que de
// lui-même. Ce qu'une vraie notification montre — le message reçu, en aperçu,
// tel qu'il est arrivé — se décide chez le robot (`totem/notification.py`), à
// un seul endroit.

const GUICHET_EXPO = "https://exp.host/--/api/v2/push/send";
const DELAI_MS = 10_000;

/** Ce qu'Expo a répondu pour UN appareil. */
export type Verdict = {
  jeton: string;
  /** « ok », ou le code d'erreur rendu par Expo. */
  etat: "ok" | "inconnu" | "invalide" | "refuse";
  detail?: string;
};

type Billet = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * Pousse un message vers ces appareils, et DIT ce qu'Expo a répondu pour
 * chacun.
 *
 * Le compte d'envois ne suffit pas : Expo accepte la requête entière puis
 * rend un billet par appareil. Un téléphone désinstallé répond
 * « DeviceNotRegistered » — et si l'on ne lit pas les billets, son jeton
 * reste en base pour toujours, et l'on croit servir un appareil qui n'existe
 * plus.
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
        jeton, etat: "refuse" as const, detail: `guichet ${r.status}`,
      }));
    }
    const corpsRep = await r.json().catch(() => null);
    billets = Array.isArray(corpsRep?.data) ? corpsRep.data : [];
  } catch (e) {
    return valides.map((jeton) => ({
      jeton, etat: "refuse" as const,
      detail: e instanceof Error ? e.message : "guichet injoignable",
    }));
  }

  return valides.map((jeton, i) => {
    const b = billets[i];
    if (!b) return { jeton, etat: "refuse" as const, detail: "sans réponse" };
    if (b.status === "ok") return { jeton, etat: "ok" as const };
    const erreur = b.details?.error;
    // « DeviceNotRegistered » : l'application a été désinstallée, ou le jeton
    // a été remplacé. Ce jeton ne servira plus JAMAIS — on peut l'oublier.
    if (erreur === "DeviceNotRegistered") {
      return { jeton, etat: "inconnu" as const, detail: b.message };
    }
    return { jeton, etat: "invalide" as const, detail: b.message ?? erreur };
  });
}
