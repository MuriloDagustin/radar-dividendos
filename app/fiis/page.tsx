import { pageMetadata } from '@/app/seo';
import { ScreenPage } from '@/app/components/screen-view';

export const metadata = pageMetadata('/fiis');

export default function Page() {
  return <ScreenPage kind="fiis" />;
}
