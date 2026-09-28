import express, { type Application, type Response } from 'express';
import { join } from 'node:path';
import { PROTOCOL_VERSION, type VersionInfo } from '@western/shared';
import { config } from './config.js';
import { savesRouter } from './saves.js';
import { ttsHandler } from './tts.js';

/** Files that must always be revalidated so PWA updates are picked up immediately. */
const NO_CACHE_FILES = new Set(['/sw.js', '/index.html', '/manifest.webmanifest', '/']);

export function configureHttp(app: Application) {
  // TLS terminates at the reverse proxy (nginx); trust its X-Forwarded-* headers.
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/version.json', (_req, res) => {
    const info: VersionInfo = { version: config.appVersion, protocol: PROTOCOL_VERSION };
    res.setHeader('Cache-Control', 'no-cache');
    res.json(info);
  });

  app.get('/api/tts', ttsHandler);
  app.use('/api/saves', savesRouter);

  app.use(
    '/narration',
    express.static(config.narrationDir, {
      fallthrough: false,
      setHeaders: (res, path) => {
        res.setHeader(
          'Cache-Control',
          path.endsWith('manifest.json') ? 'no-cache' : 'public, max-age=31536000, immutable',
        );
      },
    }),
  );

  app.use(
    express.static(config.clientDir, {
      index: false,
      setHeaders: (res, path) => setStaticCacheHeaders(res, path.slice(config.clientDir.length)),
    }),
  );

  // Registering "/" explicitly also stops Colyseus from adding its own root banner route.
  // Everything else that isn't a file falls back to the SPA shell.
  app.get(/^\/(?!api\/|narration\/|matchmake\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(config.clientDir, 'index.html'), (err) => {
      if (err && !res.headersSent) res.status(404).send('Klienten er ikke bygget endnu');
    });
  });
}

function setStaticCacheHeaders(res: Response, urlPath: string) {
  if (NO_CACHE_FILES.has(urlPath) || urlPath.startsWith('/workbox-')) {
    res.setHeader('Cache-Control', 'no-cache');
  } else if (urlPath.startsWith('/assets/')) {
    // Vite fingerprints everything under /assets.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}
