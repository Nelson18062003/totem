// La mise en forme d'un numéro camerounais.
//
// Neuf chiffres se lisent par groupes — « 677 12 34 56 » — parce que c'est
// ainsi qu'on le dicte au téléphone et qu'on le recopie. Un numéro
// international garde son indicatif devant.
//
// Règle d'affichage pure : aucune trace de navigateur ici, donc le noyau.
// La plateforme et le téléphone le formatent identiquement — un numéro
// coupé autrement d'un côté serait recopié faux.

export function formaterNumero(numero: string): string {
  const d = (numero || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 12 && d.startsWith("237")) {
    const n = d.slice(3);
    return `+237 ${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
  }
  if (d.length === 9) {
    return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
  }
  return numero;
}
