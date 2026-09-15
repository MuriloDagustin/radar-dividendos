import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PortfolioPage } from '@/app/components/portfolio-view';

export const metadata: Metadata = { title: 'Carteira — Radar de Dividendos' };

export default function Page() {
  return (
    <Suspense>
      <PortfolioPage />
    </Suspense>
  );
}
