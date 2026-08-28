import express from 'express';
import { isAllowedOrigin, parseAllowedOrigins, validateLookupInput } from './contracts.mjs';
import { lookupOfficialRanking, closeBrowser } from './lookup.mjs';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const buckets = new Map();
const WINDOW_MS = 60_000;
const LIMIT = Math.max(1, Number(process.env.RATE_LIMIT_PER_MINUTE ?? 20));

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!isAllowedOrigin(origin, allowedOrigins)) return res.status(403).json({ data: null, error: { code: 'ORIGIN_FORBIDDEN', message: '허용되지 않은 요청입니다.' } });
  if (origin) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function rateLimited(req) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const state = buckets.get(key);
  if (!state || now - state.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  state.count += 1;
  return state.count > LIMIT;
}

app.get('/health', (_req, res) => res.json({ data: { ok: true }, error: null }));
app.post('/lookup', async (req, res) => {
  if (rateLimited(req)) return res.status(429).json({ data: null, error: { code: 'RATE_LIMITED', message: '조회 요청이 많습니다. 잠시 후 다시 시도해주세요.' } });
  const parsed = validateLookupInput(req.body);
  if (!parsed.ok) return res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.message } });
  try {
    const stats = await lookupOfficialRanking(parsed.value.characterName);
    if (!stats) return res.status(404).json({ data: null, error: { code: 'OFFICIAL_NOT_FOUND', message: '공식 랭킹에서 캐릭터를 찾지 못했습니다.' } });
    return res.json({ data: stats, error: null });
  } catch (error) {
    console.error('ranking lookup failed', error instanceof Error ? error.message : error);
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'BROWSER_LOOKUP_FAILED';
    return res.status(code === 'UPSTREAM_BLOCKED' ? 502 : 504).json({ data: null, error: { code, message: '공식 랭킹 조회 서버가 응답하지 못했습니다.' } });
  }
});

const server = app.listen(port, '0.0.0.0', () => console.log(`ranking-browser-service listening on ${port}`));
async function shutdown() { server.close(); await closeBrowser(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
