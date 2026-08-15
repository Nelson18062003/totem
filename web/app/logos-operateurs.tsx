// Les marques des opérateurs, dessinées au trait sûr — jamais téléchargées.
//
// Le carré orange EST le symbole officiel d'Orange ; l'ovale jaune au mot
// bleu EST celui de MTN : deux formes géométriques simples, reproduites en
// SVG pour rester nettes à 18 px comme à 40 px, sans dépendre du réseau.
// Une carte d'un opérateur inconnu porte une puce neutre, au trait.
//
// C'est de la DONNÉE, pas de la marque TOTEM : le logo dit « quelle caisse »,
// comme la couleur d'un billet — il ne décore rien d'autre que sa carte.

type P = { size?: number; className?: string };

/** Le carré d'Orange — le symbole officiel est ce carré-là. */
export function LogoOrange({ size = 18, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="0" y="0" width="24" height="24" rx="2.5" fill="#FF7900" />
      <rect x="5" y="18" width="14" height="2.6" rx="1.3" fill="#ffffff" />
    </svg>
  );
}

/** L'ovale de MTN — jaune, le sigle en bleu profond. */
export function LogoMtn({ size = 18, className }: P) {
  return (
    <svg width={(size * 24) / 15} height={size} viewBox="0 0 38 24" className={className} aria-hidden>
      <ellipse cx="19" cy="12" rx="18.5" ry="11.5" fill="#FFCB00" />
      <text x="19" y="16.2" textAnchor="middle" fontFamily="Arial, sans-serif"
        fontWeight="bold" fontSize="11.5" fill="#00427A" letterSpacing="0.5">MTN</text>
    </svg>
  );
}

/** La puce neutre — l'opérateur n'est pas reconnu, on ne devine pas. */
export function LogoInconnu({ size = 18, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M7 3.5h7l5 5v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2Z" />
      <rect x="9" y="11" width="6" height="6" rx="1" />
    </svg>
  );
}

/**
 * LA marque de la caisse : Orange, MTN, ou la puce neutre. Elle s'adapte
 * toute seule à l'opérateur de la carte en place.
 */
export function LogoOperateur({
  operateur, size = 18, className,
}: { operateur: string; size?: number; className?: string }) {
  const nom = (operateur || "").trim().toLowerCase();
  if (nom.startsWith("orange")) return <LogoOrange size={size} className={className} />;
  if (nom.startsWith("mtn")) return <LogoMtn size={size} className={className} />;
  return <LogoInconnu size={size} className={className} />;
}
