const whole = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** Resource amounts: exact with grouping below 10,000, compact above (12.3K, 4.5M). Never negative zero. */
export function formatAmount(n: number): string {
  const v = Math.floor(n);
  if (Math.abs(v) < 10_000) return whole.format(v === 0 ? 0 : v);
  return compact.format(v);
}

type NameOf = (id: string, amount: number) => string;

/** ["25 Credits", "10 Iron Ore"]: one part per resource, for layouts that wrap between parts only. */
export function formatCostParts(list: { id: string; amount: number }[], nameOf: NameOf): string[] {
  return list.map((a) => `${formatAmount(a.amount)} ${nameOf(a.id, a.amount)}`);
}

/** "25 Credits, 10 Iron Ore". */
export function formatCost(list: { id: string; amount: number }[], nameOf: NameOf): string {
  return formatCostParts(list, nameOf).join(', ');
}

/** Compact HUD numbers: 950, 1.3k, 12k, 4.5M. */
export function formatShort(n: number): string {
  const v = Math.floor(n);
  if (Math.abs(v) < 1000) return String(v === 0 ? 0 : v);
  if (Math.abs(v) < 1_000_000) return `${trim(v / 1000)}k`;
  return `${trim(v / 1_000_000)}M`;
}

function trim(x: number): string {
  return x >= 100 ? String(Math.floor(x)) : String(Math.floor(x * 10) / 10);
}
