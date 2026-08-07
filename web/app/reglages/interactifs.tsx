"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { changerLangue, useLangue } from "@/app/langue";
import { LANGUES, type Langue } from "@/lib/langue";
import { textesReglages } from "@/lib/textes/reglages";
import { IconClose, IconLock, IconPhone } from "../icons";
import { Bouton, BoutonIcone } from "../ui/bouton";
import { Carte, EnTeteSection } from "../ui/carte";
import { Champ } from "../ui/champ";
import { Liste, Rangee } from "../ui/rangee";
import { GroupeSegments, Interrupteur } from "../ui/selecteurs";

/**
 * LES RÉGLAGES INTERACTIFS — entièrement recomposés sur le système.
 *
 * C'était le pire écran du dépôt : onze boutons pour neuf hauteurs (24, 28,
 * 30, 32, 34, 36, 38, 40, 44), quatre champs sans aucun nom accessible, un
 * interrupteur de 40 × 24 sans zone d'appui, trois opacités de désactivation
 * et sept traitements de survol. Plus une seule de ces valeurs n'est écrite
 * ici : `Bouton`, `Champ`, `Interrupteur`, `GroupeSegments`, `Carte`,
 * `Rangee` et `Liste` les portent, une fois pour toutes.
 *
 * Le désalignement le plus visible — le champ « numéro » à 32 px collé à son
 * bouton « OK » à 30 — disparaît de lui-même : les deux prennent `h-controle`
 * par leurs composants, et tombent d'aplomb.
 *
 * ─── v2 · CE QUI A QUITTÉ CE FICHIER ────────────────────────────────────────
 *
 * LA SECTION « CODES USSD ». 572 px, 21,7 % de la page, pour six lignes qu'on
 * ne réglait pas : le catalogue vit dans `lib/codes.ts`, et ce que la section
 * appelait « modifier » ou « ajouter » n'allait nulle part — `setCodes` ne
 * touchait qu'un état React local, jamais la base, jamais `lib/codes.ts`. Un
 * code corrigé ici disparaissait au rechargement et n'atteignait ni `/ussd` ni
 * `/actions`, qui lisent tous deux le catalogue statique. Ce n'était pas un
 * réglage : c'était un formulaire sans destinataire. Les codes se lisent et se
 * composent là où ils servent — `/ussd` — et les réglages y mènent d'une
 * rangée.
 *
 * LES QUATRE PARAGRAPHES GRIS (`noteCodes`, `noteLangue`, `notePin`, et la
 * note du numéro côté page). 289 px cumulés pour 197 mots dont on lit au plus
 * 28 %. Deux d'entre eux répétaient la promesse du code secret, qui est déjà
 * écrite là où le code se tape : `connexion`, `guichet`, `ussd`. La promesse
 * n'a pas bougé d'un mot — elle a cessé d'être répétée sur un écran où l'on ne
 * tape aucun code.
 */

/**
 * Le numéro d'une puce, réglé depuis la plateforme. C'est lui qui dit de quel
 * côté d'un dépôt ou d'un transfert se trouve le terminal : sans lui, un dépôt
 * s'affiche sans qu'on sache s'il sort ou entre.
 *
 * La saisie ne touche jamais un modem : elle dépose une demande que le robot
 * de Douala relève, contrôle et applique — puis republie. On attend sa
 * confirmation avant de dire que c'est fait.
 */
export function ReglageNumero({
  iccid,
  numeroInitial,
  libelle,
}: {
  iccid: string;
  numeroInitial: string;
  libelle: string;
}) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesReglages[langue];
  const [numero, setNumero] = useState(numeroInitial);
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(numeroInitial);
  const [etat, setEtat] = useState<"repos" | "envoi" | "erreur">("repos");
  const [message, setMessage] = useState("");

  async function attendre(id: number) {
    // Le robot relève les demandes toutes les quelques secondes : on patiente
    // jusqu'à ~40 s, puis on considère qu'il n'a pas répondu.
    for (let i = 0; i < 26; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const rep = await fetch(`/api/commande/${id}`, { cache: "no-store" });
      if (!rep.ok) continue;
      const c = await rep.json();
      if (c.etat === "faite" || c.etat === "echouee") return c;
    }
    return null;
  }

  async function enregistrer() {
    const propre = brouillon.replace(/\D/g, "");
    if (propre.length < 8) {
      setEtat("erreur");
      setMessage(t.neufChiffres);
      return;
    }
    setEtat("envoi");
    setMessage("");
    try {
      const rep = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "identite", parametres: { iccid, numero: propre } }),
      });
      const { id, erreur } = await rep.json();
      if (!rep.ok || !id) throw new Error(erreur || "demande refusée");
      const resultat = await attendre(id);
      if (!resultat) {
        setEtat("erreur");
        setMessage(t.pasRepondu);
        return;
      }
      if (resultat.etat === "faite") {
        setNumero(propre);
        setEdition(false);
        setEtat("repos");
        router.refresh(); // la page relit la base, numéro à jour partout
      } else if (/inconnue/i.test(resultat.resultat || "")) {
        // Le terminal tourne une version d'avant ce réglage : il ne connaît
        // pas encore la demande. On le dit clairement, avec l'issue de secours.
        setEtat("erreur");
        setMessage(t.majRequise);
      } else {
        // Le résultat écrit par le robot arrive déjà dans la langue choisie.
        setEtat("erreur");
        setMessage(resultat.resultat || t.aRefuse);
      }
    } catch {
      setEtat("erreur");
      setMessage(t.pasPartie);
    }
  }

  // Au repos : le numéro est un bouton discret de 44 — on peut le viser.
  if (!edition) {
    return (
      <Bouton
        variante="discret"
        className="tabnums text-ink-soft"
        onClick={() => {
          setBrouillon(numero);
          setEdition(true);
          setEtat("repos");
          setMessage("");
        }}
        title={t.reglerNumero(libelle)}
      >
        {numero || t.numeroARenseigner}
      </Bouton>
    );
  }

  // En saisie : le champ et son bouton déclarent la MÊME hauteur (44). Le
  // champ porte enfin un nom — masqué à l'œil, lu à voix haute.
  return (
    <div className="flex items-start gap-2">
      {/* Le `w-full` du champ vit sur SON enveloppe : c'est celle-ci qui pose
          la largeur, jamais une classe qui viendrait la contredire. */}
      <div className="min-w-0 flex-1 tabnums sm:w-32 sm:flex-none">
        <Champ
          libelle={t.reglerNumero(libelle)}
          libelleMasque
          value={brouillon}
          autoFocus
          inputMode="tel"
          disabled={etat === "envoi"}
          onChange={(e) => setBrouillon(e.target.value.replace(/[^\d\s]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && enregistrer()}
          placeholder="696103864"
          aide={etat === "envoi" ? t.enregistrement : undefined}
          erreur={etat === "erreur" ? message : undefined}
        />
      </div>
      <Bouton
        variante="secondaire"
        onClick={enregistrer}
        desactive={etat === "envoi"}
      >
        OK
      </Bouton>
      <BoutonIcone
        variante="discret"
        aria-label={t.annuler}
        icone={<IconClose size={20} />}
        onClick={() => setEdition(false)}
        desactive={etat === "envoi"}
      />
    </div>
  );
}

/**
 * La langue de la plateforme, au choix du propriétaire. Le clic pose le
 * cookie et recharge : le serveur repeint tout dans la nouvelle langue.
 * Les noms des deux choix (« English », « Français ») ne se traduisent pas :
 * chacun se reconnaît dans sa propre écriture.
 *
 * Les deux boutons de 40 px, dont l'un seul portait une bordure, sont devenus
 * un groupe de segments : la hauteur est posée par le groupe, les deux
 * segments l'occupent — actif ou non, ils font le même 44.
 */
export function SectionLangue() {
  const langue = useLangue();
  const t = textesReglages[langue];
  const active = LANGUES.find((l) => l.code === langue);

  return (
    <section>
      <EnTeteSection titre={t.langue} />
      <Carte bordABord>
        <Liste>
          <Rangee titre={t.langueActive} valeur={active?.libelle} />
        </Liste>
        <div className="border-t border-line px-4 pt-4">
          <GroupeSegments
            libelle={t.langue}
            options={LANGUES.map(({ code, libelle }) => ({ valeur: code, libelle }))}
            valeur={langue}
            pleineLargeur
            surChangement={(v) => v !== langue && changerLangue(v as Langue)}
          />
        </div>
      </Carte>
    </section>
  );
}

/**
 * La sécurité. Les deux rangées n'ouvrent encore rien — elles étaient déjà des
 * boutons sans suite, et le restent : même geste, même résultat. Ce qui change,
 * c'est la cible : 56 px de haut au lieu de 34, chevron de 20 au lieu de 16, et
 * plus aucun survol qui efface la rangée à l'opacité.
 */
export function SectionSecurite() {
  const langue = useLangue();
  const t = textesReglages[langue];

  return (
    <section>
      <EnTeteSection titre={t.securite} />
      <Carte bordABord>
        <Liste>
          <Rangee
            titre={t.motDePasse}
            icone={<IconLock size={24} />}
            chevron
            onClick={() => {}}
          />
          <Rangee
            titre={t.doubleAuth}
            icone={<IconPhone size={24} />}
            valeur={t.activee}
            chevron
            onClick={() => {}}
          />
        </Liste>
      </Carte>
    </section>
  );
}

/**
 * SE DÉCONNECTER — remonté, réduit, et confirmé.
 *
 * Il était en bas de page, pleine largeur, à 195 px du bord inférieur : arc
 * 200 depuis le pivot du pouce (340, 880), c'est-à-dire la zone FACILE, sous
 * le pouce AU REPOS. Le geste le plus regretté de l'application était le plus
 * facile à déclencher, et le seul qui ne se rattrape pas — il faut ressaisir
 * le mot de passe.
 *
 * Les trois corrections, ensemble, parce qu'aucune ne suffit seule :
 *
 *   1. IL REMONTE dans l'en-tête. Depuis le même pivot, un objet posé à
 *      (330, 40) est à un arc de ~840 px : zone DIFFICILE. On ne l'atteint
 *      plus qu'en changeant la prise en main du téléphone — ce qui est
 *      exactement ce qu'on veut d'une sortie.
 *   2. IL RÉTRÉCIT. Pleine largeur (358 px) et 40 px de haut, il barrait
 *      l'écran ; il dessine maintenant 32 px et n'occupe que son libellé. Sa
 *      CIBLE reste 44 par `.cible` : on ne rend pas un contrôle difficile à
 *      viser, on le rend difficile à rencontrer.
 *   3. IL DEMANDE CONFIRMATION. Le premier appui n'ouvre rien d'autre qu'une
 *      question ; c'est le second, sur un bouton `danger` qui dessine ses
 *      44 px, qui sort. « Annuler » vient en premier dans le DOM et à gauche :
 *      le pouce qui revient tombe sur lui, pas sur la sortie.
 *
 * Aucun mot nouveau : « Se déconnecter » et « Annuler » sont déjà au
 * dictionnaire, dans les deux langues.
 */
export function BoutonDeconnexion() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesReglages[langue];
  const [confirme, setConfirme] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  async function sortir() {
    setEnvoi(true);
    try {
      await fetch("/api/deconnexion", { method: "POST" });
    } catch {
      /* on redirige de toute façon vers la connexion */
    }
    router.replace("/connexion");
    router.refresh();
  }

  if (!confirme) {
    return (
      <Bouton
        variante="discret"
        taille="compacte"
        className="text-ink-soft"
        onClick={() => setConfirme(true)}
      >
        {t.seDeconnecter}
      </Bouton>
    );
  }

  // Les deux cibles voisines gardent leurs 12 px de gouttière (`gap-3`) : sans
  // eux, la norme retire l'aire commune et les deux retombent sous 44.
  // `desactive` plutôt que `enCours` : le libellé change déjà de mot pendant
  // l'envoi, et il doit rester lisible.
  return (
    <div className="flex items-center justify-end gap-3">
      <Bouton
        variante="discret"
        taille="compacte"
        onClick={() => setConfirme(false)}
        desactive={envoi}
      >
        {t.annuler}
      </Bouton>
      <Bouton variante="danger" onClick={sortir} desactive={envoi}>
        {envoi ? t.deconnexion : t.seDeconnecter}
      </Bouton>
    </div>
  );
}

/**
 * Une bascule de notification : une rangée de liste, et l'interrupteur du
 * système. Le précédent faisait 40 × 24 sans zone d'appui étendue — sous la
 * cible sur les deux axes — et sa pastille sautait d'un bord à l'autre.
 * Celui-ci fait 48 × 28 dans une région de 48 × 44, et la pastille glisse.
 *
 * LA HAUTEUR SE LIT, ELLE NE S'ÉCRIT PAS. `hauteur-rangee` prend la valeur de
 * la densité de la ZONE (56 en confort, 52 en dense) et non un nombre posé
 * ici. Une liste de quatre bascules est le cas d'école de la densité : quatre
 * libellés courts, un contrôle par ligne, rien à lire de long. La cible de
 * l'interrupteur, elle, ne recule pas — le plancher de 44 est écrit DANS la
 * formule (`max(--spacing-cible, …)`), et `[role="switch"]` est de toute façon
 * exclu de la densification par le système.
 */
export function Bascule({ t, defaut }: { t: string; defaut?: boolean }) {
  const [actif, setActif] = useState(Boolean(defaut));
  return (
    <li className="relative flex hauteur-rangee items-center px-4">
      <Interrupteur
        libelle={t}
        actif={actif}
        surChangement={setActif}
        classe="w-full justify-between"
      />
    </li>
  );
}
