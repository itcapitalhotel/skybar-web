'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import { authApi } from '@/lib/api/client';
import { clearAuthToken } from '@/lib/api/config';
import { useAuthRole, useAuthUser } from '@/hooks/useAuthUser';
import { NAV_TABS } from '@/lib/navRoles';
import type { UserRole } from '@/lib/api/types';
import { Lock, User, Monitor, ShieldCheck, Coffee, CreditCard, LayoutGrid, Menu, X, LogOut } from 'lucide-react';

export type { UserRole };

interface TopNavProps {
  onLockTerminal: () => void;
}

const ROLES: { value: UserRole; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'Admin', label: 'Admin', icon: <ShieldCheck size={14} />, color: 'text-rose-400' },
  { value: 'Manager', label: 'Manager', icon: <LayoutGrid size={14} />, color: 'text-purple-400' },
  { value: 'Bartender', label: 'Bartender/Staff', icon: <Coffee size={14} />, color: 'text-amber-400' },
  { value: 'Cashier', label: 'Cashier', icon: <CreditCard size={14} />, color: 'text-cyan-400' },
];

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  Admin: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  Manager: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Bartender: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Cashier: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

export default function TopNav({ onLockTerminal }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentRole = useAuthRole();
  const authUser = useAuthUser();

  const currentRoleData = ROLES.find((r) => r.value === currentRole)!;
  const visibleTabs = NAV_TABS.filter((tab) => tab.roles.includes(currentRole));

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* proceed even if API logout fails */
    }
    clearAuthToken();
    router.replace('/login');
  };

  return (
    <header className="glass-card-elevated sticky top-0 z-40 border-b border-border">
      <div className="flex items-center justify-between px-3 md:px-4 lg:px-6 h-14 md:h-16">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <AppLogo size={28} />
            <div className="hidden sm:block">
              <span className="font-semibold text-sm text-foreground leading-tight block">SkyBar</span>
              <span className="text-xs text-muted-foreground leading-tight block">Rooftop Lounge</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center ml-3 lg:ml-6 gap-0.5 lg:gap-1 overflow-x-auto scrollbar-none">
            {visibleTabs.map((tab) => {
              const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
              return (
                <Link
                  key={`nav-${tab.href}`}
                  href={tab.href}
                  className={`px-2 lg:px-3 py-1.5 rounded-md text-xs lg:text-sm font-medium transition-all duration-150 whitespace-nowrap ${
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1 md:gap-1.5">
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border">
            <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
              <User size={12} className="text-primary" />
            </div>
            <div className="text-xs">
              <span className="text-foreground font-medium block leading-tight">
                {authUser?.name ?? 'Staff'}
              </span>
              <span className="text-muted-foreground flex items-center gap-1 leading-tight">
                <Monitor size={9} />
                {authUser?.terminalId ?? 'POS'}
              </span>
            </div>
          </div>

          <div
            className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg border text-xs font-medium ${ROLE_BADGE_COLORS[currentRole]}`}
          >
            {currentRoleData.icon}
            <span className="hidden sm:block">{currentRoleData.label}</span>
          </div>

          <button
            onClick={onLockTerminal}
            className="flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:border-rose-500/50 hover:bg-rose-500/10 transition-all duration-150 text-xs font-medium"
          >
            <Lock size={13} />
            <span className="hidden lg:block">Lock</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:border-rose-500/50 hover:bg-rose-500/10 transition-all duration-150 text-xs font-medium"
          >
            <LogOut size={13} />
            <span className="hidden lg:block">Logout</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border px-4 py-3 flex flex-col gap-1 fade-in">
          {visibleTabs.map((tab) => {
            const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
            return (
              <Link
                key={`mobile-nav-${tab.href}`}
                href={tab.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
