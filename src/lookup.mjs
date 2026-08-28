import { chromium } from 'playwright';
import { parseMobiLifeJson, parseMobiLifeText } from './mobilife-parser.mjs';
import { buildMobiLifeRankingUrl } from './mobilife-lookup-utils.mjs';

let browserPromise = null;

async function browserInstance() {
  browserPromise ??= chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox'] });
  return browserPromise;
}

export async function lookupOfficialRanking(characterName, { timeoutMs = 25000 } = {}) {
  const browser = await browserInstance();
  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  let found = null;
  const pendingResponses = new Set();

  const onResponse = (response) => {
    if (found) return;
    const contentType = response.headers()['content-type'] ?? '';
    if (!contentType.includes('json')) return;
    const task = (async () => {
      try {
        const payload = await response.json();
        const parsed = parseMobiLifeJson(payload, characterName);
        if (parsed) found = parsed;
      } catch {
        // Ignore non-JSON or already-consumed responses; DOM fallback runs below.
      }
    })();
    pendingResponses.add(task);
    task.finally(() => pendingResponses.delete(task));
  };

  page.on('response', onResponse);
  try {
    const landing = await page.goto(buildMobiLifeRankingUrl(characterName), {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    if (!landing || landing.status() >= 400) {
      const error = new Error(`모비라이프 랭킹 페이지를 열지 못했습니다. (${landing?.status() ?? 0})`);
      error.code = 'UPSTREAM_BLOCKED';
      throw error;
    }

    try {
      await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 12000) });
    } catch {
      // Ranking page can keep background connections open; continue with captured responses and DOM.
    }
    await page.waitForTimeout(1200);
    if (pendingResponses.size) await Promise.allSettled([...pendingResponses]);
    if (found) return found;

    const bodyText = await page.locator('body').innerText({ timeout: 5000 });
    return parseMobiLifeText(bodyText, characterName);
  } finally {
    page.off('response', onResponse);
    await context.close();
  }
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}
