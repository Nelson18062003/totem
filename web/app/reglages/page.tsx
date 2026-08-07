import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesReglages } from "@/lib/textes/reglages";
import { IconWallet } from "../icons";
import { Bouton } from "../ui/bouton";
import { Carte, EnTeteSection } from "../ui/carte";
import { Vide } from "../ui/etat";
import { Liste, Rangee } from "../ui/rangee";
import {
  Bascule,
  BoutonDeconnexion,
  ReglageNumero,
  SectionCodes,
  SectionLangue,
  SectionSecurite,
} from "./interactifs";

export const dynamic = "force-dynamic";

export default async function Reglages() {
  const langue = await langueServeur();
  const t = textesReglages[langue];
  const { terminal, sims } = await chargerDonnees(langue, { sms: 0, recus: 0 });
  const carte = sims.find((s) => s.enPlace);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-title">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {/* Compte utilisateur — le disque porte l'initiale : il est décoratif,
          il fait 32, et il ne ressemble donc à rien qui se clique. */}
      <Carte bordABord>
        <Liste>
          <Rangee lignes={2} pastille="N" titre="Nelson" sousTitre={t.proprietaire} />
        </Liste>
      </Carte>

      {/* Grand écran : deux colonnes de réglages, pas une pile sans fin. */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
        <div className="flex flex-col gap-8">
          {/* État du terminal */}
          <section>
            <EnTeteSection titre={t.terminal} />
            <Carte bordABord>
              {terminal ? (
                <Liste>
                  {/* Le point ne parle jamais seul : le mot « En ligne » ou
                      « Muet » est écrit à côté (WCAG 1.4.1). */}
                  <Rangee
                    icone={
                      <span
                        aria-hidden
                        className={`size-2 rounded-full ${
                          terminal.enLigne ? "bg-positive" : "bg-negative"
                        }`}
                      />
                    }
                    titre={terminal.enLigne ? t.enLigne : t.muet}
                    valeur={<span className="tabnums">{t.misAJour(terminal.majTexte)}</span>}
                  />
                  <Rangee titre={t.nom} valeur={terminal.nom} />
                  {terminal.version ? (
                    <Rangee titre={t.version} valeur={terminal.version} />
                  ) : null}
                </Liste>
              ) : (
                <p className="max-w-lecture px-4 text-small text-ink-soft">
                  {t.aucunTerminal}
                </p>
              )}
              <div className="mt-4 border-t border-line px-4 pt-4">
                <Bouton variante="secondaire" pleineLargeur>
                  {t.redemarrer}
                </Bouton>
              </div>
            </Carte>
          </section>

          {/* Comptes */}
          <section>
            <EnTeteSection
              titre={t.comptes}
              action={
                <Bouton variante="discret" href="/cartes">
                  {t.voirSoldes}
                </Bouton>
              }
            />
            {sims.length === 0 ? (
              <Vide titre={t.aucuneCarte} />
            ) : (
              <div className="flex flex-col gap-2">
                {sims.map((s) => (
                  <Carte key={s.iccid} bordABord>
                    <Liste>
                      <Rangee
                        lignes={2}
                        icone={<IconWallet size={24} />}
                        titre={s.nom || s.libelle}
                        sousTitre={
                          s.enPlace
                            ? `${s.libelle} · ${t.carte(s.iccid.slice(-8))}`
                            : t.retireeJournal(s.derniereVue)
                        }
                        valeur={
                          <span className="tabnums">
                            {s.enPlace && s.signal != null ? `${s.signal}/31` : "—"}
                          </span>
                        }
                      />
                    </Liste>
                    {/* Le numéro se règle d'ici : au repos un bouton de 44, en
                        saisie un champ de 44 et son « OK » de 44 — d'aplomb. */}
                    {s.enPlace && (
                      // Le numéro est une donnée de la carte, pas une note en
                      // bas de rangée : il lui faut son étiquette et sa place
                      // sur la grille des rangées. Sans elle, il flottait seul
                      // et à droite, sans dire ce qu'il était. Le mot vient du
                      // dictionnaire (`noteNumeroMot`) : la majuscule est
                      // posée en CSS pour ne pas toucher à la chaîne traduite.
                      <div className="flex min-h-rangee items-center justify-between gap-3 px-4">
                        <span className="text-small text-ink-soft first-letter:uppercase">
                          {t.noteNumeroMot}
                        </span>
                        <ReglageNumero
                          iccid={s.iccid}
                          numeroInitial={s.numero}
                          libelle={s.libelle}
                        />
                      </div>
                    )}
                  </Carte>
                ))}
              </div>
            )}
            <p className="mt-2 max-w-lecture text-caption text-ink-faint">
              {t.noteIccid}
            </p>
            <p className="mt-2 max-w-lecture text-caption text-ink-faint">
              {t.noteNumeroAvant}
              <strong className="font-medium text-ink-soft">{t.noteNumeroMot}</strong>
              {t.noteNumeroMilieu}
              <code className="tabnums">/reglages</code>
              {t.noteNumeroFin}
            </p>
          </section>

          {/* Notifications */}
          <section>
            <EnTeteSection titre={t.notifications} />
            <Carte bordABord>
              <Liste>
                <Bascule t={t.notifPaiement} defaut />
                <Bascule t={t.notifRapport} defaut />
                <Bascule t={t.notifCourant} defaut />
                <Bascule t={t.notifTelegram} defaut />
              </Liste>
            </Carte>
          </section>
        </div>

        <div className="flex flex-col gap-8">
          {/* La langue de la plateforme — en tête de colonne : c'est le premier
              réglage qu'un nouvel arrivant cherche. La bascule vit aussi dans la
              navigation, sur chaque écran. */}
          <SectionLangue />

          {/* Codes USSD — ceux de l'opérateur de la carte en place */}
          <SectionCodes operateur={carte?.operateur ?? "Orange"} />

          {/* Sécurité */}
          <SectionSecurite />
        </div>
      </div>

      <BoutonDeconnexion />
    </div>
  );
}
