'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — dashboard is merged into Analytics. */
export default function ManagerDashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/analytics');
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
      Redirecting to Analytics…
    </div>
  );
}
