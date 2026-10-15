import React from 'react';
import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import { AuthGuard } from '@/components/AuthGuard';
import { OrderNotificationProvider } from '@/components/OrderNotificationToast';
import { BookingReminderProvider } from '@/components/BookingReminderToast';
import '../styles/tailwind.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'SkyBar POS — Rooftop Lounge Point of Sale',
  description: 'Real-time floor management, ordering, payments, and shift reconciliation for SkyBar Rooftop Lounge.',
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${dmSans.variable} dark`}>
      <body className={`${dmSans.className} bg-background text-foreground antialiased`}>
        <OrderNotificationProvider>
          <BookingReminderProvider>
            <AuthGuard>{children}</AuthGuard>
          </BookingReminderProvider>
        </OrderNotificationProvider>
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: 'rgba(30, 41, 59, 0.95)',
              border: '1px solid rgba(51, 65, 85, 0.8)',
              color: '#f1f5f9',
              backdropFilter: 'blur(12px)',
            },
          }}
        />
</body>
    </html>
  );
}