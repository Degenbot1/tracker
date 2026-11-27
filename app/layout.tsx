import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { THEME_BOOT } from '@/components/theme.ts'

export const metadata: Metadata = {
  title: 'Launch Tracker',
  description: 'Token, trade e wallet del team',
  robots: { index: false, follow: false },
}
export const viewport: Viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#d9d9d9' }, { media: '(prefers-color-scheme: dark)', color: '#060608' }], width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`} style={{ ['--font-sans' as any]: 'var(--font-geist-sans)', ['--font-mono' as any]: 'var(--font-geist-mono)' }}>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body>{children}</body>
    </html>
  )
}
