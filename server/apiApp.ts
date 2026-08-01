import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { authApiMiddleware } from './authApiPlugin';
import { uploadApiMiddleware } from './uploadApiPlugin';
import { onboardingApiMiddleware } from './onboardingApiPlugin';
import { signingApiMiddleware } from './signingApiPlugin';
import { activityLogApiMiddleware } from './activityLogApiPlugin';

type HttpMiddleware = (
  req: import('http').IncomingMessage & { url?: string },
  res: import('http').ServerResponse,
  next: (err?: unknown) => void
) => void | Promise<void>;

/** Wrap Connect-style middleware for Express (same Node req/res). */
function asExpress(mw: HttpMiddleware) {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(mw(req, res, next)).catch(next);
  };
}

/**
 * Shared HTTP API used by Vite dev middleware and Cloud Function `api`.
 * Handlers read the raw body themselves — do not add express.json().
 */
export function createApiApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  // Cloud Functions / Hosting may deliver a pre-parsed or raw body.
  // json parser helps when raw stream is already consumed; handlers also use readHttpBody.
  app.use(
    express.json({
      limit: '12mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  // Hosting rewrite preserves path; support direct function URL too
  app.use((req, _res, next) => {
    if (req.url && !req.url.startsWith('/api/') && req.path?.startsWith('/api/')) {
      req.url = req.originalUrl || req.url;
    }
    next();
  });

  app.use(asExpress(authApiMiddleware));
  app.use(asExpress(uploadApiMiddleware));
  app.use(asExpress(onboardingApiMiddleware));
  app.use(asExpress(signingApiMiddleware));
  app.use(asExpress(activityLogApiMiddleware));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}

export default createApiApp;
