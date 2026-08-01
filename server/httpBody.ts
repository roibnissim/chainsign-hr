import type { IncomingMessage } from 'http';

type BodyRequest = IncomingMessage & {
  rawBody?: Buffer | string;
  body?: unknown;
  readableEnded?: boolean;
  complete?: boolean;
};

/**
 * Read JSON/text body for both Vite middleware (stream) and Cloud Functions
 * (rawBody / already-parsed body). Prevents hangs when the stream already ended.
 */
export async function readHttpBody(req: IncomingMessage, maxBytes = 12 * 1024 * 1024): Promise<string> {
  const r = req as BodyRequest;

  if (r.rawBody != null) {
    return Buffer.isBuffer(r.rawBody) ? r.rawBody.toString('utf8') : String(r.rawBody);
  }

  if (typeof r.body === 'string') {
    return r.body;
  }

  if (r.body != null && typeof r.body === 'object') {
    // express.json() / Cloud Functions may already parse JSON
    return JSON.stringify(r.body);
  }

  if (r.readableEnded || r.complete) {
    return '';
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    // Safety: never hang forever if 'end' never fires
    const timer = setTimeout(() => {
      fail(new Error('body_read_timeout'));
    }, 25_000);

    req.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > maxBytes) {
        clearTimeout(timer);
        fail(new Error('payload_too_large'));
        try {
          req.destroy();
        } catch {
          // ignore
        }
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      clearTimeout(timer);
      finish(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      fail(err instanceof Error ? err : new Error(String(err)));
    });
  });
}
