/** Helpers for POST /payments/split — each split needs disjoint non-empty itemIds. */

export interface SplitLineItem {
  id: string;
  qty: number;
  price: number;
}

export function lineSubtotal(item: SplitLineItem): number {
  return item.price * item.qty;
}

const TAX_MULTIPLIER = 1.21;

/** Greedy partition by line value into N disjoint groups. */
export function partitionItemsEvenly(items: SplitLineItem[], guestCount: number): string[][] {
  if (guestCount < 1 || items.length === 0) return [];
  const buckets = Array.from({ length: guestCount }, () => ({
    ids: [] as string[],
    value: 0,
  }));
  const sorted = [...items].sort((a, b) => lineSubtotal(b) - lineSubtotal(a));
  for (const item of sorted) {
    let minIdx = 0;
    for (let i = 1; i < buckets.length; i++) {
      if (buckets[i].value < buckets[minIdx].value) minIdx = i;
    }
    buckets[minIdx].ids.push(item.id);
    buckets[minIdx].value += lineSubtotal(item);
  }
  fillEmptyBuckets(buckets);
  return buckets.map(b => b.ids);
}

/** Assign items to guests to approximate per-guest amount targets (amounts include tax). */
export function partitionItemsByAmounts(items: SplitLineItem[], amountTargets: number[]): string[][] {
  if (items.length === 0 || amountTargets.length === 0) return [];
  const remaining = amountTargets.map(a => Math.max(0, a / TAX_MULTIPLIER));
  const groups: string[][] = amountTargets.map(() => []);
  const sorted = [...items].sort((a, b) => lineSubtotal(b) - lineSubtotal(a));
  for (const item of sorted) {
    let bestIdx = 0;
    let bestNeed = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] > bestNeed) {
        bestNeed = remaining[i];
        bestIdx = i;
      }
    }
    groups[bestIdx].push(item.id);
    remaining[bestIdx] = Math.max(0, remaining[bestIdx] - lineSubtotal(item));
  }
  const buckets = groups.map(ids => ({ ids, value: 0 }));
  fillEmptyBuckets(buckets);
  return buckets.map(b => b.ids);
}

function fillEmptyBuckets(buckets: { ids: string[]; value: number }[]): void {
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].ids.length > 0) continue;
    let donor = 0;
    for (let j = 1; j < buckets.length; j++) {
      if (buckets[j].ids.length > buckets[donor].ids.length) donor = j;
    }
    if (buckets[donor].ids.length === 0) continue;
    const moved = buckets[donor].ids.pop()!;
    buckets[i].ids.push(moved);
  }
}

export function isValidItemPartition(allIds: string[], groups: string[][]): boolean {
  const flat = groups.flat();
  if (flat.length !== allIds.length) return false;
  const seen = new Set<string>();
  for (const id of flat) {
    if (seen.has(id)) return false;
    seen.add(id);
  }
  return allIds.every(id => seen.has(id)) && groups.every(g => g.length > 0);
}

export function subtotalForItemIds(items: SplitLineItem[], ids: string[]): number {
  const set = new Set(ids);
  return items.filter(it => set.has(it.id)).reduce((a, it) => a + lineSubtotal(it), 0);
}

export function amountWithTax(subtotal: number): number {
  return Math.round(subtotal * TAX_MULTIPLIER * 100) / 100;
}
