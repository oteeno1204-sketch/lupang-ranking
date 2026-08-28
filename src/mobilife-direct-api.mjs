const AIRA_SERVER_CODE = '02';
const AIRA_SERVER_NAME = '아이라';

const CLASS_NAMES = new Map([
  ['01', '전사'],
  ['02', '대검전사'],
  ['03', '검술사'],
  ['04', '궁수'],
  ['05', '석궁사수'],
  ['06', '장궁병'],
  ['07', '마법사'],
  ['08', '화염술사'],
  ['09', '빙결술사'],
  ['10', '힐러'],
  ['11', '사제'],
  ['12', '수도사'],
  ['13', '음유시인'],
  ['14', '댄서'],
  ['15', '악사'],
  ['16', '도적'],
  ['17', '격투가'],
  ['18', '듀얼블레이드'],
  ['19', '전격술사'],
  ['20', '암흑술사'],
  ['21', '기사'],
]);

function normalize(value) {
  return String(value ?? '').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
}

function integer(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function buildMobiLifeApiUrl(characterName) {
  const params = new URLSearchParams({
    character_name: normalize(characterName),
    sort_by: 'total',
    sort_order: 'desc',
    page: '1',
    per_page: '20',
  });
  return `https://mabimobi.life/d/api/v1/search/rankings/v2?${params.toString()}`;
}

function candidates(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const direct = [payload];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) direct.push(...value);
    else if (value && typeof value === 'object') direct.push(value);
  }
  return direct;
}

export function parseMobiLifeApiPayload(payload, characterName) {
  const expectedName = normalize(characterName);
  for (const item of candidates(payload)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if (normalize(item.character_name) !== expectedName) continue;
    if (normalize(item.server).padStart(2, '0') !== AIRA_SERVER_CODE) continue;

    const job = CLASS_NAMES.get(normalize(item.klass).padStart(2, '0')) ?? '';
    const combatPower = integer(item.combat);
    const charmPower = integer(item.charm);
    const lifePower = integer(item.life_skill);
    const totalPower = integer(item.total);
    if (!job || [combatPower, charmPower, lifePower, totalPower].some((v) => v === null)) continue;
    if (combatPower + charmPower + lifePower !== totalPower) continue;

    return {
      server: AIRA_SERVER_NAME,
      characterName: expectedName,
      job,
      combatPower,
      lifePower,
      charmPower,
      totalPower,
    };
  }
  return null;
}
