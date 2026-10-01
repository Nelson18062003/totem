// Les mots du carnet des bénéficiaires — les mêmes sur le site et le téléphone.

import type { Langue } from "../langue";

const en = {
  titre: "Beneficiaries",
  sous: "The people you send money to",
  enregistres: "Saved",
  vusDansSms: "Seen in your SMS",
  aucunEnregistre: "No beneficiary saved yet. Save one at the end of a transfer, or below.",
  aucunVu: "No number seen in this card's SMS yet.",
  origine:
    "These names come from two places only: your own saved address book, and the SMS " +
    "received on the card — when the operator writes “sent to JOHN DOE 677…”, the " +
    "name and number are read from it. Nothing else.",
  ajouter: "Add a beneficiary",
  nom: "Name",
  nomAide: "Mum, Supplier, John…",
  numero: "Phone number",
  carte: "Card",
  enregistrer: "Save",
  enregistrerCeBenef: "Save this beneficiary?",
  enregistre: "Saved",
  renommer: "Rename",
  supprimer: "Remove",
  supprimerQuestion: (nom: string) => `Remove ${nom} from your beneficiaries?`,
  annuler: "Cancel",
  echec: "That did not go through — try again.",
  vosBenef: "Your beneficiaries",
};

const fr: typeof en = {
  titre: "Bénéficiaires",
  sous: "Les gens à qui vous envoyez de l’argent",
  enregistres: "Enregistrés",
  vusDansSms: "Vus dans vos SMS",
  aucunEnregistre:
    "Aucun bénéficiaire enregistré. Enregistrez-en un à la fin d’un transfert, ou ci-dessous.",
  aucunVu: "Aucun numéro vu dans les SMS de cette carte pour l’instant.",
  origine:
    "Ces noms viennent de deux endroits seulement : votre carnet, et les SMS reçus sur la " +
    "carte — quand l’opérateur écrit « transfert vers JEAN DUPONT 677… », le nom et le " +
    "numéro y sont lus. Rien d’autre.",
  ajouter: "Ajouter un bénéficiaire",
  nom: "Nom",
  nomAide: "Maman, Fournisseur, Jean…",
  numero: "Numéro de téléphone",
  carte: "Carte",
  enregistrer: "Enregistrer",
  enregistrerCeBenef: "Enregistrer ce bénéficiaire ?",
  enregistre: "Enregistré",
  renommer: "Renommer",
  supprimer: "Retirer",
  supprimerQuestion: (nom: string) => `Retirer ${nom} de vos bénéficiaires ?`,
  annuler: "Annuler",
  echec: "Ça n’est pas passé — réessayez.",
  vosBenef: "Vos bénéficiaires",
};

export const textesBeneficiaires: Record<Langue, typeof en> = { en, fr };
