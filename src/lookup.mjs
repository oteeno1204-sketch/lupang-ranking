import { chromium } from 'playwright';
import { parseOfficialRankingHtml } from './parser.mjs';

const RANKING_PAGE = 'https://mabinogimobile.nexon.com/Ranking/List?t=4';
let browserPromise = null;

async function browserInstance() {
  browserPromise ??= chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox'] });
  return browserPromise;
}

async function fetchRankDataInPage(page, characterName, contentType) {
  return await page.evaluate(async ({ name, type }) => {
    const payload = { t: 4, pageno: 1, s: 2, c: 0, search: name };
    const body = type === 'application/json'
      ? JSON.stringify(payload)
      : new URLSearchParams(Object.entries(payload).map(([key, value]) => [key, String(value)])).toString();
    const response = await fetch('/Ranking/List/rankdata', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': type, 'x-requested-with': 'XMLHttpRequest', accept: 'text/html,*/*;q=0.8' },
      body,
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  }, { name: characterName, type: contentType });
}

export async function lookupOfficialRanking(characterName, { timeoutMs = 20000 } = {}) {
  const browser = await browserInstance();
  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  try {
    const landing = await page.goto(RANKING_PAGE, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (!landing || landing.status() >= 400) {
      const error = new Error(`공식 랭킹 페이지를 열지 못했습니다. (${landing?.status() ?? 0})`);
      error.code = 'UPSTREAM_BLOCKED';
      throw error;
    }
    for (const contentType of ['application/json', 'application/x-www-form-urlencoded']) {
      const result = await fetchRankDataInPage(page, characterName, contentType);
      if (!result.ok) continue;
      const stats = parseOfficialRankingHtml(result.text, characterName);
      if (stats) return stats;
    }
    return null;
  } finally {
    await context.close();
  }
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}
