import { pageMetadata } from '@/app/seo';
import { Suspense } from 'react';
import { AnalysisView } from '@/app/components/analysis';

export const metadata = pageMetadata('/analise');

export default function Page() {
  // The key never reaches the client: only whether it exists, so the checkbox knows.
  return (
    <Suspense>
      <AnalysisView aiAvailable={Boolean(process.env.ANTHROPIC_API_KEY)} />
    </Suspense>
  );
}
