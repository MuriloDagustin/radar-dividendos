import { pageMetadata, websiteJsonLd } from '@/app/seo';
import { Home } from '@/app/components/home';

export const metadata = pageMetadata('/');

export default function Page() {
  // The key never reaches the client: only whether it exists, so the checkbox knows.
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()).replace(/</g, '\\u003c') }} />
      <Home aiAvailable={Boolean(process.env.ANTHROPIC_API_KEY)} />
    </>
  );
}
