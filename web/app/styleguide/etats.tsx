"use client";

/**
 * LA GALERIE DES ÉTATS ET DES FENÊTRES.
 *
 * Une planche de contrôle, pas une page d'application : on y voit côte à côte
 * ce qui doit s'aligner, et l'on y prouve ce qui se prouve mal en lisant du
 * code — qu'un squelette porte la hauteur du vrai composant, et qu'une fenêtre
 * pleine à ras bord garde ses boutons atteignables.
 *
 * Les textes sont en français et écrits en dur ICI, et seulement ici : une
 * planche de contrôle n'est pas un écran, elle ne passe pas par le
 * dictionnaire bilingue.
 */

import { useState } from "react";
import {
  IconAlert,
  IconCheck,
  IconDoc,
  IconError,
  IconInbox,
  IconInfo,
  IconRefresh,
  IconWallet,
} from "@/app/icons";
import {
  Bandeau,
  Chargement,
  Pastille,
  PuceInfo,
  Squelette,
  Vide,
} from "@/app/ui/etat";
import { Fenetre } from "@/app/ui/fenetre";

function Section({ titre, note, children }: { titre: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-title">{titre}</h2>
      {note && <p className="mt-2 max-w-lecture text-small text-ink-soft">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Le bouton de la planche. Il pose sa hauteur et centre son contenu (règle R3),
// il est indigo (l'indigo porte l'action), et son contour est `contour` — pas
// `line`, qui vaut 1,26:1 et ne peut pas dire « ceci est un bouton ».
function BoutonPlanche({
  onClick,
  variante = "primaire",
  children,
}: {
  onClick?: () => void;
  variante?: "primaire" | "secondaire";
  children: React.ReactNode;
}) {
  const habit =
    variante === "primaire"
      ? "h-controle-fort bg-accent text-sur-couleur hover:bg-accent-hover"
      : "h-controle border border-contour bg-surface-raised text-ink hover:bg-surface-2";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-btn px-4 text-body font-medium transition-teintes ${habit}`}
    >
      {children}
    </button>
  );
}

export function GalerieEtats() {
  const [ouverte, setOuverte] = useState(false);

  return (
    <div className="entree">
      <h1 className="text-title">États, feedback et fenêtres</h1>
      <p className="mt-2 max-w-lecture text-body text-ink-soft">
        Ce qui répond quand l&apos;écran compte, prévient, attend, ou n&apos;a rien à
        montrer. Rien ici n&apos;est un contrôle : un badge et une puce
        d&apos;information ne se touchent pas.
      </p>

      <Section
        titre="Pastilles"
        note="Hauteur du badge : 20 px, jamais plus. Le point muet fait 8 px et se centre dans les mêmes 20 px, pour que les deux formes tombent sur la même colonne. Chaque pastille porte son libellé pour le lecteur d'écran : « 3 » ne veut rien dire."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Pastille compte={3} etiquette="3 messages non lus" />
          <Pastille compte={12} etiquette="12 messages non lus" />
          <Pastille compte={99} etiquette="99 messages non lus" ton="negative" />
          <Pastille compte={2} etiquette="2 reçus établis" ton="positive" />
          <Pastille compte={7} etiquette="7 opérations en attente" ton="alert" />
          <Pastille compte={4} etiquette="4 documents" ton="neutre" />
          <Pastille etiquette="Message non lu" />
          <Pastille etiquette="Terminal muet" ton="alert" />
        </div>
      </Section>

      <Section
        titre="Puces d'information"
        note="Hauteur 28 px, icône 16. Non interactives : une puce sur laquelle on clique n'est pas une puce, c'est un contrôle, et un contrôle fait 44 px."
      >
        <div className="flex flex-wrap items-center gap-2">
          <PuceInfo>Encaissement</PuceInfo>
          <PuceInfo ton="accent" icone={<IconWallet size={16} />}>
            MTN Mobile Money
          </PuceInfo>
          <PuceInfo ton="positive">Reçu établi</PuceInfo>
          <PuceInfo ton="negative">Terminal muet</PuceInfo>
          <PuceInfo ton="alert" icone={<IconRefresh size={16} />}>
            En attente
          </PuceInfo>
        </div>
      </Section>

      <Section
        titre="Bandeaux"
        note="Hauteur minimale 48 px, padding 16, icône 20. L'icône est obligatoire : sans elle, seule la couleur distinguerait une réussite d'un échec — et en niveaux de gris, crédit et débit sont à 1,21:1 l'un de l'autre. Chaque ton porte désormais son propre dessin : coche, croix cerclée, triangle, « i ». Le fond est le ton doux, à peine détaché du blanc."
      >
        <div className="space-y-3">
          <Bandeau ton="alert" icone={<IconAlert size={20} />} titre="Le terminal ne répond plus">
            Le dernier signe de vie remonte à onze minutes. Les encaissements
            continuent d&apos;arriver, mais les reçus attendront son retour.
          </Bandeau>
          <Bandeau ton="negative" icone={<IconError size={20} />} titre="Code refusé">
            Le code saisi n&apos;a pas été accepté par l&apos;opérateur. Il reste
            deux essais avant le blocage de la carte.
          </Bandeau>
          <Bandeau ton="positive" icone={<IconCheck size={20} />} titre="Reçu établi">
            Le document porte le même numéro que le message d&apos;origine. Il est
            disponible dans la fiche.
          </Bandeau>
          <Bandeau ton="accent" icone={<IconInfo size={20} />}>
            Les messages de plus de six mois sont archivés, et restent
            consultables depuis la recherche.
          </Bandeau>
        </div>
      </Section>

      <Section
        titre="État vide"
        note="Un seul composant, un seul padding : 24 px. Il était réécrit à la main quatre fois, avec quatre paddings verticaux différents."
      >
        <Vide
          icone={<IconInbox size={24} />}
          titre="Aucun message aujourd'hui"
          detail="Un dimanche sans client n'est pas une panne. Les messages reviendront dès la première opération."
          action={<BoutonPlanche variante="secondaire">Relire la boîte</BoutonPlanche>}
        />
      </Section>

      <Section
        titre="Chargement"
        note="Anneau de 24 px. Le texte est annoncé au lecteur d'écran même quand il ne s'affiche pas ; la rotation s'arrête pour qui a demandé moins d'animations."
      >
        <div className="flex flex-wrap items-center gap-8 rounded-card border border-line bg-surface-raised p-6">
          <Chargement texte="Chargement des messages…" />
          <Chargement texte="Demande envoyée au terminal…" visible />
        </div>
      </Section>

      <Section
        titre="Squelettes"
        note="À gauche le squelette, à droite le vrai composant. Les deux hauteurs sont le même jeton : c'est tout l'objet de la prop. Un squelette qui annonce 48 px pour un contrôle de 42 fait sauter la page au moment exact où l'œil s'y pose. Pour du texte, la hauteur se prend dans l'échelle typographique — h-ligne-sm, h-ligne, h-ligne-lg — et non dans l'échelle d'espacement, qui ne sait exprimer ni 20 ni 28."
      >
        <div className="space-y-6">
          <Paire jeton="h-controle (44)">
            <Squelette hauteur="h-controle" largeur="w-1/2" rayon="rounded-btn" />
            <div className="flex h-controle w-1/2 items-center justify-center rounded-btn border border-contour bg-surface-raised text-small">
              Un vrai contrôle de 44
            </div>
          </Paire>

          <Paire jeton="h-controle-fort (48)">
            <Squelette hauteur="h-controle-fort" largeur="w-1/2" rayon="rounded-btn" />
            <div className="flex h-controle-fort w-1/2 items-center justify-center rounded-btn bg-accent px-4 text-small font-medium text-sur-couleur">
              Une action primaire de 48
            </div>
          </Paire>

          <Paire jeton="h-rangee (56)">
            <Squelette hauteur="h-rangee" largeur="w-1/2" />
            <div className="flex h-rangee w-1/2 items-center rounded-card border border-line bg-surface-raised px-4 text-small">
              Une rangée d&apos;une ligne
            </div>
          </Paire>

          <Paire jeton="h-rangee-2 (72)">
            <Squelette hauteur="h-rangee-2" largeur="w-1/2" />
            <div className="flex h-rangee-2 w-1/2 flex-col justify-center rounded-card border border-line bg-surface-raised px-4">
              <p className="text-body">Une rangée de deux lignes</p>
              <p className="text-small text-ink-soft">Et sa seconde ligne</p>
            </div>
          </Paire>

          <Paire jeton="h-ligne (24) et h-ligne-sm (20) — les lignes de texte">
            <div className="w-1/2 space-y-2">
              <Squelette hauteur="h-ligne" largeur="w-2/3" rayon="rounded-sm" />
              <Squelette hauteur="h-ligne-sm" largeur="w-1/3" rayon="rounded-sm" />
            </div>
            <div className="w-1/2">
              <p className="text-body">Une ligne de corps, 24 px</p>
              <p className="text-small text-ink-soft">Une ligne d&apos;annexe, 20 px</p>
            </div>
          </Paire>

          <Paire jeton="trois rangées empilées, écart 8">
            <Squelette hauteur="h-rangee" largeur="w-1/2" nombre={3} />
            <p className="w-1/2 text-small text-ink-soft">
              La prop <code>nombre</code> empile, et l&apos;écart est celui du
              système — jamais choisi sur place.
            </p>
          </Paire>
        </div>
      </Section>

      <Section
        titre="Fenêtre"
        note="Le contenu ci-dessous est volontairement interminable. En-tête fixe, corps défilant, pied fixe : les deux boutons d'action restent visibles quoi qu'il arrive, et la touche Échap referme. Sur téléphone, il reste toujours 44 px de voile au-dessus de la feuille pour fermer d'un doigt."
      >
        <BoutonPlanche onClick={() => setOuverte(true)}>
          <IconDoc size={20} /> Ouvrir une fenêtre très longue
        </BoutonPlanche>

        <Fenetre
          ouverte={ouverte}
          titre="Fiche d'un message"
          description="Reçu de MTN Mobile Money, le 6 août à 14 h 12"
          etiquetteFermer="Fermer la fiche"
          onFermer={() => setOuverte(false)}
          pied={
            <>
              <BoutonPlanche variante="secondaire" onClick={() => setOuverte(false)}>
                Copier le message
              </BoutonPlanche>
              <BoutonPlanche onClick={() => setOuverte(false)}>
                <IconDoc size={20} /> Établir le reçu
              </BoutonPlanche>
            </>
          }
        >
          <div className="space-y-4">
            <Bandeau ton="alert" icone={<IconAlert size={20} />} titre="Reçu en attente">
              Le terminal fabrique le document. Rien n&apos;est promis sur un
              minuteur : l&apos;écran attend que la date d&apos;établissement ait
              vraiment avancé.
            </Bandeau>
            <div className="flex flex-wrap gap-2">
              <PuceInfo ton="accent" icone={<IconWallet size={16} />}>
                MTN Mobile Money
              </PuceInfo>
              <PuceInfo>Encaissement</PuceInfo>
            </div>
            {PARAGRAPHES.map((texte, i) => (
              <p key={i} className="max-w-lecture text-body text-ink-soft">
                {texte}
              </p>
            ))}
            <p className="text-caption uppercase text-ink-faint">Fin du contenu</p>
            <p className="max-w-lecture text-body">
              Si vous lisez cette ligne, c&apos;est que le corps a défilé — et que
              les deux boutons du pied sont restés là, sous les yeux.
            </p>
          </div>
        </Fenetre>
      </Section>
    </div>
  );
}

function Paire({ jeton, children }: { jeton: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-caption uppercase text-ink-faint">{jeton}</p>
      <div className="mt-2 flex items-start gap-4">{children}</div>
    </div>
  );
}

// Du contenu long, et rien d'autre : c'est lui qui prouve le défilement.
const PARAGRAPHES = [
  "Vous avez reçu un paiement de 25 000 FCFA de la part de Jeanne Mbala. Le solde de la carte est de 412 500 FCFA. Référence de l'opération : MP250806.1412.B47291.",
  "Le message d'origine est conservé mot pour mot : c'est lui qui fait foi, et c'est de lui que le reçu est refabriqué, à la demande, avec le même numéro.",
  "Une nature choisie à la main l'emporte sur la catégorie devinée par le terminal. Un transfert marqué « transfert » ne peut plus revenir en reçu de solde.",
  "Quand la lecture du message échoue, rien n'est inventé : aucun montant n'est déduit, aucune date n'est reconstituée. Le message reste lisible en entier, et c'est au propriétaire de trancher.",
  "Le code secret n'est jamais conservé, jamais écrit dans un message, jamais journalisé autrement que par quatre étoiles.",
  "Les documents de plus de six mois passent à l'archive. Ils restent consultables depuis la recherche, et leur numéro ne change pas.",
  "Le terminal donne signe de vie toutes les deux minutes. Passé onze minutes de silence, l'écran le dit — il ne fait pas semblant que tout va bien.",
  "Un reçu régénéré remplace l'ancien document dans l'archive. L'écran ne l'annonce qu'une fois la date d'établissement vraiment avancée dans le cloud.",
  "Les encaissements d'une même journée se regroupent par opérateur. Le total du jour se lit en haut, en chiffres tabulaires : les colonnes s'alignent d'une ligne à l'autre.",
  "Cette dernière ligne existe pour une seule raison : forcer le corps de la fenêtre à défiler, même sur un grand écran.",
];
