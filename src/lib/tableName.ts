const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value.trim());
}

/**
 * Floor name from the API (`T1`, `T1/1`). Blank when missing or when the
 * value is a table id. Callers must not invent a name from the id.
 */
export function visibleTableLabel(label?: string | null): string {
  const name = (label ?? '').trim();
  if (!name || isUuid(name)) return '';
  const head = name.split('/')[0]?.trim() ?? '';
  if (head && isUuid(head)) return '';
  return name;
}
