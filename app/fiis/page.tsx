import type { Metadata } from 'next';
import { ScreenPage } from '@/app/components/screen-view';

export const metadata: Metadata = { title: 'Triagem de FIIs — Radar de Dividendos' };

export default function Page() {
  return <ScreenPage kind="fiis" />;
}
