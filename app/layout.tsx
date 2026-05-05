// =============================================================
// app/layout.tsx — Root layout
// Sets up PWA meta tags so the app installs cleanly as a
// home-screen icon on iPhone (no Safari chrome when launched).
// =============================================================

import type { Metadata, Viewport } from 'next'
import { Nunito, Nunito_Sans } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'

// Display font for headings and numbers
const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
  weight: ['700', '800', '900'],
})

// Body font
const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  variable: '--font-nunito-sans',
  display: 'swap',
  weight: ['400', '600', '700'],
})

export const metadata: Metadata = {
  title: "Aradhiya's Violin Tracker 🎻",
  description: 'Track your daily violin practice, earn gems, and unlock rewards!',
  manifest: '/manifest.json',
  // iOS PWA meta tags
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Violin Tracker',
  },
  // Open Graph for sharing
  openGraph: {
    title: "Aradhiya's Violin Tracker",
    description: 'Daily violin practice tracker with streaks and rewards!',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,          // Prevent iOS zoom on double-tap
  userScalable: false,
  themeColor: '#5B4FCF',   // Matches our indigo brand color
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${nunito.variable} ${nunitoSans.variable}`}>
      <head>
        {/* iOS PWA icons — add /public/icon-192.png and /public/icon-512.png */}
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png" />
        {/* Prevents tap highlight on mobile */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-sans bg-violet-50 text-gray-900 antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  )
}
