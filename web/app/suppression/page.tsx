import type { Metadata } from "next";
import Link from "next/link";
import { textesSuppression } from "@noyau/textes/suppression";
import { langueServeur } from "@/lib/langue-serveur";
import { courrielDeContact } from "@/lib/contact";
import { Symbole } from "../marque";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TOTEM — Delete your account and data",
  robots: { index: true, follow: true },
};

/**
 * La marche à suivre pour faire supprimer son compte et ses données.
 *
 * PUBLIQUE, et pour la même raison que la politique de confidentialité :
 * Google Play réclame une adresse ouverte, qu'un examinateur ouvre sans
 * compte depuis un formulaire. Le formulaire « Sécurité des données » refuse
 * le lien si la page ne nomme pas l'application, ne décrit pas la marche à
 * suivre, ou ne dit pas ce qui est effacé et ce qui est gardé.
 *
 * Elle n'est donc pas un doublon de la politique de confidentialité : celle-ci
 * dit ce que le logiciel fait, celle-là dit comment en sortir.
 */
export default async function Suppression() {
  const langue = await langueServeur();
  const t = textesSuppression[langue];
  const adresse = courrielDeContact();

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12">
      <Symbole size={30} className="text-laterite" />
      <h1 className="mt-5 text-title font-semibold tracking-tight">{t.titre}</h1>
      <p className="mt-1 text-caption text-ink-faint">{t.maj}</p>

      <div className="mt-10 flex flex-col gap-9">
        <Bloc titre={t.appliTitre}>{t.appli}</Bloc>

        <Bloc titre={t.commentTitre}>
          {t.comment}
          <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5">
            {t.commentEtapes.map((e) => <li key={e}>{e}</li>)}
          </ol>
          <p className="mt-3">{t.commentNote}</p>
        </Bloc>

        <Bloc titre={t.effaceTitre}>
          <Liste entrees={t.efface} />
          <p className="mt-3">{t.effaceNote}</p>
        </Bloc>

        <Bloc titre={t.gardeTitre}>
          <Liste entrees={t.garde} />
          <p className="mt-3">{t.gardeNote}</p>
        </Bloc>

        <Bloc titre={t.contactTitre}>
          {/* Pas d'adresse inventée : quand la variable d'environnement n'est
              pas posée, on renvoie vers l'adresse du développeur affichée sur
              la fiche du magasin, qui existe toujours. Afficher une boîte
              morte serait promettre une porte qui ne s'ouvre pas. */}
          {adresse ? (
            <>
              {t.contact}{" "}
              <a
                href={`mailto:${adresse}`}
                className="font-medium text-ink underline underline-offset-4"
              >
                {adresse}
              </a>
            </>
          ) : (
            t.contactSansAdresse
          )}
          <p className="mt-3">
            <Link
              href="/confidentialite"
              className="font-medium text-ink underline underline-offset-4"
            >
              {t.voirAussi}
            </Link>
          </p>
        </Bloc>
      </div>
    </div>
  );
}

function Liste({ entrees }: { entrees: readonly string[][] }) {
  return (
    <dl className="flex flex-col gap-2">
      {entrees.map(([nom, quoi]) => (
        <div key={nom}>
          <dt className="inline font-medium text-ink">{nom} — </dt>
          <dd className="inline">{quoi}</dd>
        </div>
      ))}
    </dl>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-heading font-semibold">{titre}</h2>
      <div className="text-small leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}
