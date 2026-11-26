const UUID_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function humanTableName(label?: string | null): string | undefined {
  const name = (label ?? '').trim();
  if (!name) return undefined;
  if (UUID_NAME.test(name)) return undefined;
  return name;
}

function stripSplitSuffix(label: string): string {
  return label.replace(/\/\d+$/, '');
}

/** Keep the real table name and add /1, /2 on split. Never substitute "T". */
export function displayTableLabel(table: {
  id?: string;
  label?: string | null;
  parentTableId?: string | null;
  splitIndex?: number | null;
}, parents?: Map<string, { label?: string | null }>): string {
  const index = table.splitIndex != null && table.splitIndex > 0 ? table.splitIndex : null;
  const stored = humanTableName(table.label);
  const parent = table.parentTableId && parents ? parents.get(table.parentTableId) : undefined;
  const parentName = humanTableName(parent?.label);
  const base = stripSplitSuffix(stored ?? parentName ?? '');
  if (index != null && base) return `${base}/${index}`;
  if (stored) return stored;
  if (parentName) return parentName;
  return (table.label ?? '').trim();
}
