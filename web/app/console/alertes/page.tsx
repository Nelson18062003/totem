// Écran 7 · LES ALERTES — ce qui va mal, et ce qu'on en a fait.
//
// LA CHOSE À COMPRENDRE AVANT DE LIRE LE RESTE
// Aujourd'hui, personne n'écrit dans la table « alertes ». Le robot calcule ce
// qui ne va pas sur chaque terminal — sous-tension, disque plein, silence — et
// n'en fait qu'un message Telegram, qui défile. Cet écran est donc VIDE en
// production, et un écran d'alertes vide se lit comme « tout va bien ».
//
// C'est le mensonge que cette page refuse de faire. Quand le registre n'a
// jamais reçu une ligne, elle ne montre pas un beau zéro vert : elle écrit que
// personne n'écrit ici, et elle pose à côté ce que la flotte, elle, raconte —
// combien de boîtiers se taisent en ce moment sans qu'aucune alerte n'ait été
// ouverte. Cette contradiction est la preuve, et elle est plus utile que
// n'importe quelle mesure.
//
// LES DEUX GESTES, ET POURQUOI ILS SONT DEUX
// « Je l'ai vue » n'est pas « c'est réglé ». Le premier dit que quelqu'un s'en
// occupe et laisse la ligne à l'écran ; le second la fait descendre. Les fondre
// ferait disparaître, dès le premier regard, des choses que personne n'a
// réparées. Ce sont les deux seules écritures de toute la console.
//
// CE QUE CET ÉCRAN NE PEUT PAS FAIRE
// Redémarrer, consulter un solde, mettre l'argent à l'abri. Une alerte nomme
// l'argent d'un commerce : le lire est le métier de la plateforme, y toucher ne
// l'est pas. Les trois gestes sont montrés désarmés — celui qui ne les trouve
// pas ici les cherchera ailleurs, et l'ailleurs est toujours pire.

import Link from "next/link";
import { exigerPouvoir } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerRegistreDesAlertes, type AlerteDuRegistre } from "@/lib/journal";
import { textesConsole } from "@noyau/textes/console";
import { textesRegistre } from "@noyau/textes/console-registre";
import {
  CadreConsole, EtatDeVie, Etiquette, GesteInterdit, Mesure, NomDeCommerce,
  Panneau, Pastille, RienADire,
} from "../gabarit";
import { GestesDAlerte } from "./gestes";
import type { Langue } from "@noyau/langue";

export const dynamic = "force-dynamic";

const TON_GRAVITE = {
  grave: "negatif",
  attention: "attention",
  information: "neutre",
} as const;

/** Une alerte, avec à qui elle appartient et ce qu'on en a fait. */
function Ligne({
  a,
  langue,
  gestes,
  proprietes,
}: {
  a: AlerteDuRegistre;
  langue: Langue;
  gestes: boolean;
  proprietes: boolean;
}) {
  const tc = textesConsole[langue];
  const t = textesRegistre[langue].alertes;
  return (
    <li className="flex gap-3 px-4 py-3.5">
      <span className="mt-1.5">
        <Pastille ton={TON_GRAVITE[a.gravite]} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-small font-medium">{a.titre}</p>
          <Etiquette ton={TON_GRAVITE[a.gravite]}>{tc.gravite[a.gravite]}</Etiquette>
        </div>
        {a.detail && (
          <p className="mt-1 text-caption leading-relaxed text-ink-soft">{a.detail}</p>
        )}
        {/* À qui c'est. Sans ce nom, il faut ouvrir une autre page pour savoir
            qui appeler — et c'est le moment où l'on n'a pas le temps. */}
        <p className="mt-1.5 text-caption text-ink-faint">
          <NomDeCommerce noms={a.commerceNom ? [a.commerceNom] : []}
            langue={langue} connu={proprietes} />
        </p>
        <p className="mt-0.5 text-caption tabnums text-ink-faint">
          {[a.terminalNom, t.ouverteDepuis(a.depuis), a.ouverteQuand]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-1 text-caption leading-relaxed text-ink-soft">
          {a.vue
            ? a.vueParNom
              ? t.vuePar(a.vueParNom, a.vueQuand)
              : t.vueParPersonne(a.vueQuand)
            : t.pasVue}
        </p>
        {a.close && (
          <p className="mt-0.5 text-caption leading-relaxed text-positive">
            {a.closeParNom
              ? t.closePar(a.closeParNom, a.closeQuand)
              : t.closeParPersonne(a.closeQuand)}
            {a.closeMotif ? ` — ${a.closeMotif}` : ""}
          </p>
        )}
        {gestes && <GestesDAlerte alerte={a.id} vue={a.vue} />}
      </div>
    </li>
  );
}

export default async function Alertes() {
  // La garde AVANT toute lecture. Une lecture faite d'abord a déjà servi.
  await exigerPouvoir("administrer");
  const langue = await langueServeur();
  const tc = textesConsole[langue];
  const t = textesRegistre[langue].alertes;
  const registre = await chargerRegistreDesAlertes(langue);

  const malades = registre.boitiersQuiVontMal;
  const compteOuPhrase = (n: number) => (n > 0 ? String(n) : "—");

  // Ce que la flotte dit d'elle-même, lu sur les terminaux et pas dans le
  // registre. C'est ce panneau qui empêche un écran vide de passer pour une
  // bonne nouvelle.
  const contradiction = (
    <Panneau titre={t.contradictionTitre} pied={t.contradictionDetail}>
      {malades.length === 0 ? (
        <p className="px-4 py-3 text-small text-ink-soft">
          {t.jamaisEcritCalme(registre.flotteEnService)}
        </p>
      ) : (
        <ul className="divide-hair">
          {malades.map((b) => (
            <li key={b.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3.5">
              <Link
                href={`/console/terminal/${encodeURIComponent(b.id)}`}
                className="text-small font-medium underline-offset-4 hover:underline"
              >
                {b.nom}
              </Link>
              <span className="text-caption text-ink-soft">
                <NomDeCommerce noms={b.commerces} langue={langue}
                  connu={registre.proprietesConnues} />
              </span>
              <span className="ml-auto text-small">
                <EtatDeVie vivacite={b.vivacite} depuis={b.depuis} langue={langue} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panneau>
  );

  const gestesInterdits = (
    <Panneau titre={t.gestesTitre} pied={t.gestesDetail}>
      <div className="px-4 py-2">
        <GesteInterdit quoi={t.gesteRedemarrer} qui={t.gesteRedemarrerQui} />
        <GesteInterdit quoi={t.gesteSolde} qui={t.gesteSoldeQui} />
        <GesteInterdit quoi={t.gesteSortie} qui={t.gesteSortieQui} />
      </div>
    </Panneau>
  );

  return (
    <CadreConsole
      actif="alertes"
      langue={langue}
      titre={t.titre}
      ariane={registre.jamaisEcrit ? undefined : t.ariane(registre.ouvertes.length)}
    >
      {!registre.relie ? (
        <RienADire titre={tc.pasDeBaseTitre} detail={tc.pasDeBaseDetail} ton="alerte" />
      ) : registre.jamaisEcrit ? (
        <>
          <RienADire
            titre={t.jamaisEcritTitre}
            detail={t.jamaisEcritDetail}
            ton="alerte"
          />
          <p className="text-small leading-relaxed text-ink-soft">
            {malades.length > 0
              ? t.jamaisEcritContredit(malades.length)
              : t.jamaisEcritCalme(registre.flotteEnService)}
          </p>
          {contradiction}
          {gestesInterdits}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Mesure
              libelle={t.mesureOuvertes}
              valeur={compteOuPhrase(registre.ouvertes.length)}
              note={registre.ouvertes.length === 0 ? t.mesureOuvertesCalme : undefined}
              ton={registre.ouvertes.length > 0 ? "negatif" : "neutre"}
            />
            <Mesure
              libelle={t.mesureAVoir}
              valeur={compteOuPhrase(registre.aVoir)}
              note={registre.aVoir === 0 ? t.mesureAVoirCalme : undefined}
              ton={registre.aVoir > 0 ? "attention" : "neutre"}
            />
            <Mesure
              libelle={t.mesureCloses}
              valeur={compteOuPhrase(registre.closes.length)}
              note={registre.closes.length === 0 ? t.mesureClosesCalme : undefined}
            />
            <Mesure
              libelle={t.mesureFlotte}
              valeur={compteOuPhrase(malades.length)}
              note={malades.length === 0 ? t.mesureFlotteCalme : undefined}
              ton={malades.length > 0 ? "negatif" : "neutre"}
            />
          </div>

          {registre.ouvertes.length === 0 ? (
            <RienADire titre={t.videTitre} detail={t.videDetail} />
          ) : (
            <Panneau titre={t.ouvertesTitre} pied={t.gesteExplique}>
              <ul className="divide-hair">
                {registre.ouvertes.map((a) => (
                  <Ligne key={a.id} a={a} langue={langue} gestes
                    proprietes={registre.proprietesConnues} />
                ))}
              </ul>
            </Panneau>
          )}

          {contradiction}

          {registre.closes.length > 0 && (
            <Panneau titre={t.closesTitre} pied={t.closesDetail}>
              <ul className="divide-hair">
                {registre.closes.map((a) => (
                  <Ligne key={a.id} a={a} langue={langue} gestes={false}
                    proprietes={registre.proprietesConnues} />
                ))}
              </ul>
            </Panneau>
          )}

          {gestesInterdits}
        </>
      )}
    </CadreConsole>
  );
}
