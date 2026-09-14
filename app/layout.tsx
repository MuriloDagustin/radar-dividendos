import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter, JetBrains_Mono } from 'next/font/google';
import { DISCLAIMER } from '@/src/types';
import './globals.css';

// Cormorant Garamond at 500 is the open substitute DESIGN.md names for the licensed display serif.
const display = Cormorant_Garamond({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const text = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-text',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Radar de Dividendos — fundamentos da B3',
  description: DISCLAIMER,
};

export const viewport: Viewport = {
  themeColor: '#faf9f5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
