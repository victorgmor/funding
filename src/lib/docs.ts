/** Sidebar order for /docs (content ids under helpcenter collection). */
export const DOCS_ORDER = [
  "overview",
  "funds",
  "committing",
  "wallet",
  "trading",
  "settlement",
  "roadmap",
] as const;

export function sortDocs<T extends { id: string }>(entries: T[]): T[] {
  const rank = new Map(DOCS_ORDER.map((id, i) => [id, i]));
  return [...entries].sort(
    (a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99),
  );
}
