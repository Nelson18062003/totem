"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { changerLangue, useLangue } from "@/app/langue";
import { codesUssd, type CodeUssd } from "@/lib/codes";
import { LANGUES, type Langue } from "@/lib/langue";
import { textesReglages } from "@/lib/textes/reglages";
import { IconClose, IconHash, IconLock, IconPhone, IconPlus } from "../icons";
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
 * Les codes du guichet, par opérateur. Rien n'est deviné : le catalogue de
 * départ a été composé sur un vrai téléphone, et chaque code se corrige ou
 * s'ajoute ici — un opérateur qui change son menu ne casse rien.
 *
 * Les codes eux-mêmes (#148#…) ne se traduisent jamais : seuls les libellés
 * autour changent de langue. Un raccourci ajouté à la main garde son nom.
 */
export function SectionCodes({ operateur }: { operateur: string }) {
  const langue = useLangue();
  const t = textesReglages[langue];
  const [codes, setCodes] = useState<CodeUssd[]>(codesUssd[operateur] ?? []);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const [ajout, setAjout] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauCode, setNouveauCode] = useState("");

  const proprer = (v: string) => v.replace(/[^0-9#*]/g, "");

  const enregistrer = (cle: string) => {
    if (brouillon.trim()) {
      setCodes((cs) => cs.map((c) => (c.cle === cle ? { ...c, code: brouillon.trim() } : c)));
    }
    setEnEdition(null);
  };

  const ajouter = () => {
    if (!nouveauNom.trim() || !nouveauCode.trim()) return;
    setCodes((cs) => [...cs, {
      cle: `perso-${cs.length}`, libelle: nouveauNom.trim(), code: nouveauCode.trim(),
    }]);
    setNouveauNom(""); setNouveauCode(""); setAjout(false);
  };

  return (
    <section>
      <EnTeteSection titre={t.codesUssd} />
      <Carte bordABord>
        <p className="border-b border-line px-4 pb-4 text-caption uppercase text-ink-faint">
          {t.carteEnPlace(operateur)}
        </p>

        {codes.length === 0 && !ajout && (
          <p className="max-w-lecture px-4 pt-4 text-small text-ink-soft">
            {t.aucunCode(operateur)}
          </p>
        )}

        <Liste>
          {codes.map((c) => (
            <li key={c.cle} className="relative flex min-h-rangee items-center gap-3 px-4">
              <span className="grid size-icone-lg shrink-0 place-items-center text-ink-faint">
                <IconHash size={20} />
              </span>
              <span className="min-w-0 flex-1 truncate text-body">
                {t.libellesCodes[c.cle] ?? c.libelle}
              </span>
              {enEdition === c.cle ? (
                <div className="flex shrink-0 items-center gap-2">
                  <div className="w-32 tabnums">
                    <Champ
                      libelle={t.modifierCode}
                      libelleMasque
                      value={brouillon}
                      autoFocus
                      onChange={(e) => setBrouillon(proprer(e.target.value))}
                      onKeyDown={(e) => e.key === "Enter" && enregistrer(c.cle)}
                    />
                  </div>
                  <Bouton variante="secondaire" onClick={() => enregistrer(c.cle)}>
                    OK
                  </Bouton>
                </div>
              ) : (
                <Bouton
                  variante="discret"
                  className="shrink-0 tabnums text-ink-soft"
                  onClick={() => { setEnEdition(c.cle); setBrouillon(c.code); }}
                  title={t.modifierCode}
                >
                  {c.code}
                </Bouton>
              )}
            </li>
          ))}
        </Liste>

        <div className="border-t border-line px-4 pt-4">
          {ajout ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              {/* Les deux champs de l'ajout n'avaient AUCUN nom accessible :
                  ils portent maintenant le leur, masqué à l'œil. */}
              <Champ
                libelle={t.nomExemple}
                libelleMasque
                value={nouveauNom}
                onChange={(e) => setNouveauNom(e.target.value)}
                placeholder={t.nomExemple}
                autoFocus
                className="flex-1"
              />
              <div className="tabnums sm:w-32 sm:shrink-0">
                <Champ
                  libelle={t.codesUssd}
                  libelleMasque
                  value={nouveauCode}
                  onChange={(e) => setNouveauCode(proprer(e.target.value))}
                  placeholder="#148*6#"
                  inputMode="tel"
                />
              </div>
              <div className="flex gap-2">
                <Bouton
                  variante="secondaire"
                  onClick={ajouter}
                  desactive={!nouveauNom.trim() || !nouveauCode.trim()}
                  className="flex-1"
                >
                  {t.ajouter}
                </Bouton>
                <BoutonIcone
                  variante="discret"
                  aria-label={t.annulerAjout}
                  icone={<IconClose size={20} />}
                  onClick={() => setAjout(false)}
                />
              </div>
            </div>
          ) : (
            <Bouton
              variante="secondaire"
              pleineLargeur
              icone={<IconPlus size={20} />}
              onClick={() => setAjout(true)}
            >
              {t.ajouterRaccourci}
            </Bouton>
          )}
        </div>
      </Carte>
      <p className="mt-2 max-w-lecture text-caption text-ink-faint">
        {t.noteCodes}
      </p>
    </section>
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
      <p className="mt-2 max-w-lecture text-caption text-ink-faint">
        {t.noteLangue}
      </p>
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
      <p className="mt-2 max-w-lecture text-caption text-ink-faint">{t.notePin}</p>
    </section>
  );
}

export function BoutonDeconnexion() {
  const router = useRouter();
  const langue = useLangue();
  const t = textesReglages[langue];
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
  // `desactive` plutôt que `enCours` : le libellé change déjà de mot pendant
  // l'envoi, et il doit rester lisible.
  return (
    <Bouton variante="secondaire" onClick={sortir} desactive={envoi}>
      {envoi ? t.deconnexion : t.seDeconnecter}
    </Bouton>
  );
}

/**
 * Une bascule de notification : une rangée de liste, et l'interrupteur du
 * système. Le précédent faisait 40 × 24 sans zone d'appui étendue — sous la
 * cible sur les deux axes — et sa pastille sautait d'un bord à l'autre.
 * Celui-ci fait 48 × 28 dans une région de 48 × 44, et la pastille glisse.
 */
export function Bascule({ t, defaut }: { t: string; defaut?: boolean }) {
  const [actif, setActif] = useState(Boolean(defaut));
  return (
    <li className="relative flex h-rangee items-center px-4">
      <Interrupteur
        libelle={t}
        actif={actif}
        surChangement={setActif}
        classe="w-full justify-between"
      />
    </li>
  );
}
