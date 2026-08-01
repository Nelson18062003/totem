import type { Metadata } from "next";
import Link from "next/link";
import { Ouverture } from "./ouverture";

// La page de présentation : le seul écran qui parle de TOTEM au lieu de le
// piloter. Elle s'ouvre sur la tresse qui s'érige au fil du défilement, puis
// dit l'essentiel en trois traits. Voir docs/IDENTITE.md — c'est un écran de
// marque : la claustra y a droit de cité, jamais un montant.

export const metadata: Metadata = {
  title: "TOTEM — présentation",
  description:
    "Le totem reste au pays ; à travers lui, vous agissez à distance.",
};

const TRAITS = [
  {
    titre: "Planté",
    texte:
      "Le boîtier reste au bureau, à Douala, avec vos SIM MTN et Orange. Il ne bouge pas : c'est sa raison d'être.",
  },
  {
    titre: "Traversé",
    texte:
      "Vous agissez à travers lui, depuis Telegram, de n'importe où dans le monde : codes USSD, SMS de paiement, rapports quotidiens.",
  },
  {
    titre: "Double",
    texte:
      "Un modem par opérateur, tous deux à l'écoute en permanence. Aucun SMS ne se perd, aucun compte n'attend son tour.",
  },
] as const;

export default function Presentation() {
  return (
    <div className="pb-16">
      <Ouverture />

      <section className="mx-auto max-w-xl">
        <h2 className="text-heading font-semibold">Un objet resté au pays</h2>
        <p className="mt-3 text-body leading-relaxed text-ink-soft">
          TOTEM n&rsquo;est pas une application de paiement de plus. C&rsquo;est
          un objet planté au pays, à travers lequel son propriétaire agit à
          distance — comme les deux brins de sa tresse, qui se croisent sans
          jamais se confondre.
        </p>

        <dl className="mt-10 grid gap-6 sm:grid-cols-3">
          {TRAITS.map((t) => (
            <div key={t.titre}>
              <dt className="text-body font-medium">{t.titre}</dt>
              <dd className="mt-1.5 text-small leading-relaxed text-ink-soft">
                {t.texte}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-12">
          <Link
            href="/connexion"
            className="inline-block rounded-btn bg-ink px-5 py-3 text-body font-medium text-white transition hover:opacity-90"
          >
            Ouvrir l&rsquo;application
          </Link>
          <p className="mt-2.5 text-small text-ink-soft">
            Accès réservé au propriétaire du terminal.
          </p>
        </div>
      </section>
    </div>
  );
}
