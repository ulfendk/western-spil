import { Router, json, type Request } from 'express';
import { normalizeRejsekode, validateSave } from '@western/shared';
import { createSave, getSave, updateSave } from './db.js';

/** Simple per-IP limiter for rejsekode lookups, to make guessing codes impractical. */
const LOOKUPS_PER_HOUR = 60;
const lookups = new Map<string, { count: number; resetAt: number }>();

function tooManyLookups(req: Request): boolean {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const entry = lookups.get(key);
  if (!entry || entry.resetAt < now) {
    lookups.set(key, { count: 1, resetAt: now + 3_600_000 });
    return false;
  }
  entry.count++;
  return entry.count > LOOKUPS_PER_HOUR;
}

export const savesRouter = Router();
savesRouter.use(json({ limit: '32kb' }));

/** POST /api/saves — store a new save, returns { rejsekode }. */
savesRouter.post('/', (req, res) => {
  try {
    const rejsekode = createSave(validateSave(req.body));
    res.status(201).json({ rejsekode });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** GET /api/saves/:code — restore a save by rejsekode. */
savesRouter.get('/:code', (req, res) => {
  if (tooManyLookups(req)) {
    res.status(429).json({ error: 'For mange forsøg – prøv igen om lidt' });
    return;
  }
  const code = normalizeRejsekode(req.params.code);
  const save = code ? getSave(code) : undefined;
  if (!code || !save) {
    res.status(404).json({ error: 'Rejsekoden findes ikke' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ rejsekode: code, save });
});

/** PUT /api/saves/:code — overwrite the save for a known rejsekode. */
savesRouter.put('/:code', (req, res) => {
  const code = normalizeRejsekode(req.params.code);
  try {
    const save = validateSave(req.body);
    if (!code || !updateSave(code, save)) {
      res.status(404).json({ error: 'Rejsekoden findes ikke' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
