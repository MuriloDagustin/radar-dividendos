import { publicEvent } from '@/src/public-data';
import { openCache } from '@/src/cache';
import { errorMessage } from '@/src/errors';
import type { StockScreenEvent } from '@/src/stock-market';
import { screenStocks } from '@/src/screen-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// better-sqlite3 is synchronous: one connection per process, not one per request.
const cache = openCache({ enabled: true });

/**
 * Streams the screen as newline-delimited JSON, one event per line. A cold run takes minutes
 * and a browser fetch would give up on a silent connection before then; each company that
 * finishes keeps the connection alive and lets the page fill in as it goes.
 */
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StockScreenEvent | { type: 'error'; message: string }) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(publicEvent(event))}\n`));
      };
      try {
        await screenStocks({ cache: true, sharedCache: cache, onEvent: send });
      } catch (error) {
        send({ type: 'error', message: errorMessage(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
