import { pageMetadata, websiteJsonLd } from '@/app/seo';
import { Home } from '@/app/components/home';

export const metadata = pageMetadata('/');

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()).replace(/</g, '\\u003c') }} />
      <Home />
    </>
  );
}
