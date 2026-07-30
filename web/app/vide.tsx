/**
 * État vide — ce qu'on voit quand il n'y a rien à montrer.
 *
 * Une liste vide n'est pas une erreur : c'est souvent la situation normale
 * (un dimanche sans client, une recherche trop étroite). Le ton reste calme,
 * et on dit quoi faire ensuite plutôt que de laisser un blanc.
 */
export function Vide({
  titre,
  detail,
  action,
}: {
  titre: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-surface-raised px-6 py-12 text-center">
      <p className="text-body font-medium">{titre}</p>
      {detail && (
        <p className="mx-auto mt-1.5 max-w-xs text-small leading-relaxed text-ink-soft">
          {detail}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
