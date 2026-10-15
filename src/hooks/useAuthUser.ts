'use client';

import { useEffect, useState } from 'react';
import { getAuthToken, getAuthUser, persistLoginSession } from '@/lib/api/config';
import { authApi } from '@/lib/api/client';
import { registerStaffNames } from '@/lib/staffDisplay';
import type { UserRole } from '@/lib/api/types';
import { isUserRole } from '@/lib/navRoles';

export function useAuthUser() {
  // Always null on server and first client paint — avoids nav/role hydration mismatch
  // (localStorage is read only after mount).
  const [user, setUser] = useState<ReturnType<typeof getAuthUser>>(null);

  useEffect(() => {
    const stored = getAuthUser();
    setUser(stored);

    const token = getAuthToken();
    if (!token) return;

    authApi
      .me()
      .then((profile) => {
        persistLoginSession(token, {
          id: profile.id,
          name: profile.name,
          role: profile.role,
          terminalId: profile.terminalId,
          avatar: profile.avatar,
        });
        registerStaffNames({ [profile.id]: profile.name });
        setUser(getAuthUser());
      })
      .catch(() => {
        /* keep stored user if /me fails */
      });
  }, []);

  return user;
}

export function useAuthRole(): UserRole {
  const user = useAuthUser();
  return isUserRole(user?.role) ? user.role : 'Bartender';
}
