import { Radar } from '@/app/components/radar';

export default function Page() {
  // The key never reaches the client: only whether it exists, so the checkbox knows.
  return <Radar aiAvailable={Boolean(process.env.ANTHROPIC_API_KEY)} />;
}
