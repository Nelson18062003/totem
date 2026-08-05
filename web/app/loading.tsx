/**
 * Le squelette d'attente : la page suivante se dessine en gris le temps que
 * les données arrivent. L'écran répond au clic IMMÉDIATEMENT — la lenteur
 * ressentie venait autant de l'attente à blanc que du chargement lui-même.
 * Formes neutres, aucune donnée inventée.
 */
export default function Attente() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="h-4 w-32 rounded-sm bg-surface-3" />
      <div className="mt-3 h-7 w-56 rounded-sm bg-surface-3" />
      <div className="mt-8 h-40 rounded-card bg-surface-2" />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="h-12 rounded-card bg-surface-2" />
        <div className="h-12 rounded-card bg-surface-2" />
        <div className="h-12 rounded-card bg-surface-2" />
      </div>
      <div className="mt-8 space-y-3">
        <div className="h-14 rounded-card bg-surface-2" />
        <div className="h-14 rounded-card bg-surface-2/70" />
        <div className="h-14 rounded-card bg-surface-2/40" />
      </div>
    </div>
  );
}
