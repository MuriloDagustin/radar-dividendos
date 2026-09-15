import { Suspense } from 'react';
import { Home } from '@/app/components/home';

export default function Page() {
  // The key never reaches the client: only whether it exists, so the checkbox knows.
  return (
    <Suspense>
      <Home aiAvailable={Boolean(process.env.ANTHROPIC_API_KEY)} />
    </Suspense>
  );
}
