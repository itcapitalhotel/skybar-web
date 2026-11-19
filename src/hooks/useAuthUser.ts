'use client';

import { useEffect, useState } from 'react';
import { getAuthToken, getAuthUser, persistLoginSession, type StoredAuthUser } from '@/lib/api/config';
import { authApi } from '@/lib/api/client';
import { registerStaffNames } from '@/lib/staffDisplay';
import type { UserRole } from '@/lib/api/types';
import { isUserRole } from '@/lib/navRoles';

let profileToken: string | null = null;
let profileRequest: Promise<StoredAuthUser | null> | null = null;

/** One /auth/me for the whole app. TopNav and the page used to each fire their own. */
function loadProfile(): Promise<StoredAuthUser | null> {
  const token = getAuthToken();
  const stored = getAuthUser();
  if (!token) return Promise.resolve(stored);
  if (profileRequest && profileToken === token) return profileRequest;
  profileToken = token;
  profileRequest = authApi
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
      return getAuthUser();
    })
    .catch(() => {
      profileRequest = null;
      return stored;
    });
  return profileRequest;
}

export function useAuthUser() {
  // Always null on server and first client paint — avoids nav/role hydration mismatch
  // (localStorage is read only after mount).
  const [user, setUser] = useState<StoredAuthUser | null>(null);

  useEffect(() => {
    const stored = getAuthUser();
    if (stored) setUser(stored);
    let cancelled = false;
    loadProfile().then((next) => {
      if (!cancelled && next) setUser(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}

export function useAuthRole(): UserRole {
  const user = useAuthUser();
  return isUserRole(user?.role) ? user.role : 'Bartender';
}
