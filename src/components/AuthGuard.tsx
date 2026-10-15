'use client';

import React, { useLayoutEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getAuthRedirect } from '@/lib/navRoles';

/**
 * Redirect-only auth guard. NEVER blocks rendering with a loading screen —
 * that pattern caused infinite "Loading…" when redirects stalled or sessions were stale.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useLayoutEffect(() => {
    const target = getAuthRedirect(pathname);
    if (target && target !== pathname) {
      router.replace(target);
    }
  }, [pathname, router]);

  return <>{children}</>;
}
