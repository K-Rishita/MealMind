/** Whole-word ingredient matching (same rules as the frontend's "Cook" feature). */
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && /(oes|ches|shes|sses)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

/** True if every word of the pantry name appears, in order and adjacent, in the ingredient name. */
export function namesMatch(pantryName: string, ingredientName: string): boolean {
  const p = tokens(pantryName);
  const i = tokens(ingredientName);
  if (!p.length) return false;
  for (let start = 0; start + p.length <= i.length; start++) {
    if (p.every((w, k) => i[start + k] === w)) return true;
  }
  return false;
}

/** Names of the pantry items a recipe uses. */
export function pantryItemsUsed(ingredientNames: string[], pantryNames: string[]): string[] {
  return pantryNames.filter((p) => ingredientNames.some((ing) => namesMatch(p, ing)));
}
