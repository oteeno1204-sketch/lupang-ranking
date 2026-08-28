import { buildMobiLifeApiUrl, parseMobiLifeApiPayload } from './mobilife-direct-api.mjs';

const DEFAULT_TIMEOUT_MS = 15000;

export async function lookupOfficialRanking(characterName, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = buildMobiLifeApiUrl(characterName);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.7',
        referer: 'https://mabimobi.life/ranking',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 800);
      console.info('mobilife direct api failed', JSON.stringify({ status: response.status, url, body }));
      const error = new Error(`모비라이프 랭킹 API가 응답하지 않았습니다. (${response.status})`);
      error.code = 'UPSTREAM_BLOCKED';
      throw error;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      const error = new Error('모비라이프 랭킹 API 응답 형식을 읽지 못했습니다.');
      error.code = 'UPSTREAM_RESPONSE_INVALID';
      throw error;
    }

    const parsed = parseMobiLifeApiPayload(payload, characterName);
    if (!parsed) {
      console.info('mobilife direct api miss', JSON.stringify({ characterName, url, payload }));
      return null;
    }
    return parsed;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('모비라이프 랭킹 API 응답 시간이 초과되었습니다.');
      timeoutError.code = 'UPSTREAM_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function closeBrowser() {}
