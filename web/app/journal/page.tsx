import { langueServeur } from "@/lib/langue-serveur";
import { lireIncidents, relie } from "@/lib/serveur";
import { FUSEAU } from "@/lib/fuseau";
import { journalPour } from "@noyau/textes/journal";
import { jourLocal } from "@noyau/types";
import { Vide } from "../vide";

export const dynamic = "force-dynamic";

// CE QUI S'EST PASSÉ — la page qui manquait.
//
// Le terminal tenait son journal depuis toujours : modem redémarré, SMS
// illisible, nuage injoignable. Il le poussait dans la base, et personne ne
// le lisait — aucun écran ne l'affichait. On collectait pour jeter.
//
// La plateforme, elle, n'écrivait rien : ses pannes partaient dans la sortie
// d'erreur de l'hébergeur, que le propriétaire n'ouvrira jamais. Quand
// quelque chose casse un dimanche à Douala, il faut qu'il reste quelque chose
// à lire — par lui, pas par un informaticien.
//
// Aucune donnée personnelle n'entre ici : ni code, ni mot de passe, ni
// courriel, ni texte de SMS. Un journal se garde longtemps et se lit à
// plusieurs.

const LOCALE = { fr: "fr-FR", en: "en-GB" } as const;

export default async function Journal() {
  const langue = await langueServeur();
  const t = journalPour(langue);

  if (!relie) {
    return <Vide titre={t.titre} detail={t.rienDetail} />;
  }

  const incidents = await lireIncidents(200);

  // Les jours se découpent dans le fuseau DU TERMINAL, comme partout
  // ailleurs : la caisse peut être à Douala et le lecteur à Paris.
  const heure = new Intl.DateTimeFormat(LOCALE[langue], {
    hour: "2-digit", minute: "2-digit", timeZone: FUSEAU,
  });
  const jourLong = new Intl.DateTimeFormat(LOCALE[langue], {
    weekday: "long", day: "numeric", month: "long", timeZone: FUSEAU,
  });

  const present = new Date();
  const cleAujourdhui = jourLocal(present, FUSEAU);
  const cleHier = jourLocal(new Date(present.getTime() - 86_400_000), FUSEAU);

  // Groupés par jour : une longue liste plate d'horodatages ne se lit pas.
  const parJour = new Map<string, typeof incidents>();
  for (const i of incidents) {
    const d = new Date(i.quand);
    if (!Number.isFinite(d.getTime())) continue;
    const cle = jourLocal(d, FUSEAU);
    parJour.set(cle, [...(parJour.get(cle) ?? []), i]);
  }

  const nomDuJour = (cle: string, exemple: string) => {
    if (cle === cleAujourdhui) return t.aujourdhui;
    if (cle === cleHier) return t.hier;
    const nom = jourLong.format(new Date(exemple));
    return nom.charAt(0).toUpperCase() + nom.slice(1);
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {parJour.size === 0 ? (
        <Vide titre={t.rienTitre} detail={t.rienDetail} />
      ) : (
        <div className="flex flex-col gap-7">
          {[...parJour.entries()].map(([cle, lignes]) => (
            <section key={cle}>
              <h2 className="mb-2 text-small font-medium text-ink-soft">
                {nomDuJour(cle, lignes[0].quand)}
              </h2>
              <ul className="divide-hair">
                {lignes.map((i) => (
                  <li key={i.id} className="flex gap-3.5 py-3">
                    <span className="w-11 shrink-0 pt-px text-small tabnums text-ink-faint">
                      {heure.format(new Date(i.quand))}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body">{i.texte}</p>
                      <p className="mt-0.5 text-caption text-ink-faint">
                        {i.qui ? t.leTerminal : t.laPlateforme}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
