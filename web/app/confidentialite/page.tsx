import type { Metadata } from "next";
import { textesConfidentialite } from "@noyau/textes/confidentialite";
import { langueServeur } from "@/lib/langue-serveur";
import { Symbole } from "../marque";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TOTEM — Privacy Policy",
  // Un examinateur du Play Store arrive ici sans compte, depuis un lien
  // collé dans un formulaire. La page doit se suffire à elle-même.
  robots: { index: true, follow: true },
};

/**
 * La politique de confidentialité.
 *
 * PUBLIQUE, et c'est la seule page de la plateforme dans ce cas avec l'écran
 * de connexion. Google Play l'exige à une adresse ouverte : un examinateur
 * l'ouvre sans compte, depuis un lien collé dans un formulaire. Une page
 * derrière le verrou ferait refuser l'application, sans plus d'explication.
 *
 * Elle décrit ce que CETTE application fait, et rien d'autre. Un modèle
 * générique parlerait de cookies et de géolocalisation là où il n'y en a pas.
 * Écrire faux, même par excès de prudence, c'est mentir à qui lit — et se
 * contredire devant le formulaire « Sécurité des données » du Play Store,
 * qui doit correspondre au mot près.
 */
export default async function Confidentialite() {
  const langue = await langueServeur();
  const t = textesConfidentialite[langue];

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12">
      <Symbole size={30} className="text-laterite" />
      <h1 className="mt-5 text-title font-semibold tracking-tight">{t.titre}</h1>
      <p className="mt-1 text-caption text-ink-faint">{t.maj}</p>

      <div className="mt-10 flex flex-col gap-9">
        <Bloc titre={t.quoiTitre}>{t.quoi}</Bloc>

        <Bloc titre={t.collecteTitre}>
          {t.collecte}
          <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5">
            {t.collecteListe.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </Bloc>

        <Bloc titre={t.smsTitre}>{t.sms}</Bloc>

        <Bloc titre={t.permissionsTitre}>
          <dl className="flex flex-col gap-2">
            {t.permissions.map(([nom, pourquoi]) => (
              <div key={nom}>
                <dt className="inline font-medium text-ink">{nom} — </dt>
                <dd className="inline">{pourquoi}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3">{t.permissionsNote}</p>
        </Bloc>

        <Bloc titre={t.telephoneTitre}>
          <dl className="flex flex-col gap-2">
            {t.telephone.map(([nom, quoi]) => (
              <div key={nom}>
                <dt className="inline font-medium text-ink">{nom} — </dt>
                <dd className="inline">{quoi}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3">{t.telephoneNote}</p>
        </Bloc>

        <Bloc titre={t.codeTitre}>{t.code}</Bloc>

        <Bloc titre={t.tiersTitre}>
          <dl className="flex flex-col gap-2">
            {t.tiers.map(([nom, quoi]) => (
              <div key={nom}>
                <dt className="inline font-medium text-ink">{nom} — </dt>
                <dd className="inline">{quoi}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3">{t.tiersNote}</p>
        </Bloc>

        <Bloc titre={t.gardeTitre}>{t.garde}</Bloc>
        <Bloc titre={t.supprimerTitre}>{t.supprimer}</Bloc>

        <Bloc titre={t.contactTitre}>
          {t.contact}{" "}
          {/* L'adresse vient d'une variable d'environnement : elle n'a pas à
              vivre dans le dépôt, et le propriétaire la change sans nous. */}
          <a
            href={`mailto:${process.env.CONTACT_COURRIEL || "contact@bonzinilabs.com"}`}
            className="font-medium text-ink underline underline-offset-4"
          >
            {process.env.CONTACT_COURRIEL || "contact@bonzinilabs.com"}
          </a>
        </Bloc>
      </div>
    </div>
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
