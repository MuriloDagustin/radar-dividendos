import { pageMetadata } from '@/app/seo';
import { Suspense } from 'react';
import { AnalysisView } from '@/app/components/analysis';

export const metadata = pageMetadata('/analise');

export default function Page() {
  return (
    <Suspense>
      <AnalysisView />
    </Suspense>
  );
}
