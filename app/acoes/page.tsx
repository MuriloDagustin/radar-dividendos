import { pageMetadata } from '@/app/seo';
import { ScreenPage } from '@/app/components/screen-view';

export const metadata = pageMetadata('/acoes');

export default function Page() {
  return <ScreenPage kind="acoes" />;
}
