interface BilingualItemNameProps {
  name: string;
  khmerName?: string | null;
  nameClassName?: string;
  khmerClassName?: string;
}

export function hasKhmerName(name: string | null | undefined, khmerName: string | null | undefined): boolean {
  const khmer = khmerName?.trim();
  return Boolean(khmer) && khmer !== (name ?? '').trim();
}

/** English name plus optional Khmer name on the next line. */
export default function BilingualItemName({
  name,
  khmerName,
  nameClassName,
  khmerClassName = 'block leading-snug text-primary',
}: BilingualItemNameProps) {
  const showKhmer = hasKhmerName(name, khmerName);
  return (
    <>
      <span className={nameClassName}>{name}</span>
      {showKhmer ? <span className={khmerClassName}>{khmerName?.trim()}</span> : null}
    </>
  );
}
