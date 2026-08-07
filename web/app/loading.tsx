import { Carte } from "./ui/carte";
import { Squelette } from "./ui/etat";

/**
 * Le squelette d'attente : la page suivante se dessine en gris le temps que
 * les données arrivent. L'écran répond au clic IMMÉDIATEMENT — la lenteur
 * ressentie venait autant de l'attente à blanc que du chargement lui-même.
 * Formes neutres, aucune donnée inventée.
 *
 * UN SQUELETTE QUI MENT EST PIRE QU'UN ÉCRAN BLANC. Celui-ci annonçait 48 px
 * là où le vrai geste du guichet en faisait 42, et 56 px là où la vraie rangée
 * de SMS en faisait 68 : la page sautait au moment exact où l'œil s'y pose.
 * Chaque bloc prend maintenant la hauteur du composant qu'il remplace vraiment
 * sur l'accueil, dans le même vocabulaire que lui :
 *
 *   — la salutation et le titre : `h-ligne-sm` (20) et `h-ligne-lg` (28), les
 *     interlignes de `text-small` et de `text-title` ;
 *   — les cinq gestes du guichet : `h-controle` (44), la hauteur d'un `Bouton`
 *     secondaire ;
 *   — les derniers SMS : `h-rangee-2` (72), la hauteur d'une `Rangee` de deux
 *     lignes — c'est celle que rend `DerniersSms`.
 *
 * La carte du solde n'a pas de hauteur à elle : comme la vraie, elle prend
 * celle de son contenu, ligne par ligne, dans les 16 px de retrait de `Carte`.
 *
 * Le tout est muet (`aria-hidden` porté par chaque `Squelette`) : c'est le
 * texte de la page qui parle une fois arrivé, pas son ombre.
 */
export default function Attente() {
  return (
    <div>
      {/* L'en-tête : la salutation, puis le titre de la page. */}
      <Squelette hauteur="h-ligne-sm" largeur="w-1/4" rayon="rounded-sm" />
      <div className="mt-3">
        <Squelette hauteur="h-ligne-lg" largeur="w-1/2" rayon="rounded-sm" />
      </div>

      {/* La carte du solde : l'opérateur, le montant, ses deux annexes. */}
      <div className="mt-8">
        <Carte>
          <Squelette hauteur="h-4" largeur="w-1/3" rayon="rounded-sm" />
          <div className="mt-4">
            <Squelette hauteur="h-12" largeur="w-2/3" rayon="rounded-sm" />
          </div>
          <div className="mt-4">
            <Squelette hauteur="h-ligne-sm" largeur="w-1/2" rayon="rounded-sm" />
          </div>
          <div className="mt-4">
            <Squelette hauteur="h-ligne-sm" largeur="w-2/3" rayon="rounded-sm" />
          </div>
        </Carte>
      </div>

      {/* Les gestes du guichet — de vrais contrôles de 44 px. */}
      <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Squelette hauteur="h-controle" rayon="rounded-btn" />
        <Squelette hauteur="h-controle" rayon="rounded-btn" />
        <Squelette hauteur="h-controle" rayon="rounded-btn" />
      </div>

      {/* Les derniers SMS — trois rangées de deux lignes. */}
      <div className="mt-8">
        <Squelette hauteur="h-rangee-2" nombre={3} />
      </div>
    </div>
  );
}
