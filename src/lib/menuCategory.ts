import type { MenuCategoryType } from '@/lib/api/types';

export const MENU_CATEGORY_TYPE_OPTIONS: { value: MenuCategoryType; label: string; short: string }[] = [
  { value: 'food', label: 'Food / Kitchen', short: 'Food' },
  { value: 'drink', label: 'Drinks / Bar', short: 'Drink' },
];

export function normalizeCategoryType(raw: unknown): MenuCategoryType | undefined {
  if (raw === 'food' || raw === 'drink') return raw;
  return undefined;
}

export function categoryTypeLabel(type: MenuCategoryType | undefined, style: 'short' | 'long' = 'short'): string {
  const opt = MENU_CATEGORY_TYPE_OPTIONS.find((o) => o.value === type);
  if (!opt) return '—';
  return style === 'long' ? opt.label : opt.short;
}

export function categoryTypeBadgeClass(type: MenuCategoryType | undefined): string {
  if (type === 'food') {
    return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  }
  if (type === 'drink') {
    return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
  }
  return 'bg-muted/50 text-muted-foreground border-border';
}
