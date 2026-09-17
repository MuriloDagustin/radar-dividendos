import { pageMetadata } from '@/app/seo';
import { Suspense } from 'react';
import { PortfolioPage } from '@/app/components/portfolio-view';

export const metadata = pageMetadata('/carteira');

export default function Page() {
  return (
    <Suspense>
      <PortfolioPage />
    </Suspense>
  );
}
