const AIRA_SERVER = '아이라';

export function validateLookupInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: '요청 형식이 올바르지 않습니다.' };
  if (value.server !== AIRA_SERVER) return { ok: false, message: '아이라 서버만 조회할 수 있습니다.' };
  const characterName = typeof value.characterName === 'string' ? value.characterName.normalize('NFKC').trim() : '';
  if (characterName.length < 1 || characterName.length > 30) return { ok: false, message: '캐릭터명은 1~30자로 입력해주세요.' };
  if(/[\u0000-\u001f\u007f]/.test(characterName)) return { ok: false, message: '캐릭터명을 확인해주세요.' };
  return { ok: true, value: { server: AIRA_SERVER, characterName } };
}

export function parseAllowedOrigins(value) {
  const raw = value?.trim() || 'https://lupang.expo.app,http://localhost:8081,http://localhost:19006';
  return new Set(raw.split(',').map((item) => item.trim().replace(/\/$/, '')).filter(Boolean));
}

export function isAllowedOrigin(origin, allowed) {
  if (!origin) return true;
  return allowed.has(origin.replace(/\/$/, ''));
}
