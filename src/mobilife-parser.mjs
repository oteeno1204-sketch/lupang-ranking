const AIRA_SERVER = '아이라';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  const normalized = normalizeText(value).replace(/,/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function firstValue(obj, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && obj[key] !== '') return obj[key];
  }
  return null;
}

function normalizeCandidate(obj, expectedName) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const characterName = normalizeText(firstValue(obj, ['characterName', 'character_name', 'nickname', 'name', 'charName', 'char_name']));
  if (!characterName || characterName !== expectedName) return null;
  const server = normalizeText(firstValue(obj, ['server', 'serverName', 'server_name', 'world', 'worldName', 'world_name']));
  const job = normalizeText(firstValue(obj, ['job', 'className', 'class_name', 'klassName', 'klass_name', 'class', 'klass']));
  const combatPower = toNumber(firstValue(obj, ['combatPower', 'combat_power', 'combat', 'battlePower', 'battle_power']));
  const lifePower = toNumber(firstValue(obj, ['lifePower', 'life_power', 'life', 'lifeSkill', 'life_skill', 'lifeSkillPower', 'life_skill_power']));
  const charmPower = toNumber(firstValue(obj, ['charmPower', 'charm_power', 'charm', 'appealPower', 'appeal_power']));
  const totalPower = toNumber(firstValue(obj, ['totalPower', 'total_power', 'total', 'totalScore', 'total_score', 'score']));
  if (server !== AIRA_SERVER || !job) return null;
  if (![combatPower, lifePower, charmPower, totalPower].every((value) => value !== null)) return null;
  if (combatPower + lifePower + charmPower !== totalPower) return null;
  return { server, characterName, job, combatPower, lifePower, charmPower, totalPower };
}

export function parseMobiLifeJson(payload, characterName) {
  const expectedName = normalizeText(characterName);
  if (!expectedName) return null;
  const stack = [payload];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current == null || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);
    if (!Array.isArray(current)) {
      const candidate = normalizeCandidate(current, expectedName);
      if (candidate) return candidate;
    }
    for (const value of Array.isArray(current) ? current : Object.values(current)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return null;
}

function findLabeledNumber(text, label) {
  const match = new RegExp(`${label}\\s*[:：]?\\s*([\\d,]+)`, 'i').exec(text);
  return match ? toNumber(match[1]) : null;
}

export function parseMobiLifeText(text, characterName) {
  const expectedName = normalizeText(characterName);
  const normalized = normalizeText(text);
  if (!expectedName || !normalized.includes(expectedName) || !normalized.includes(AIRA_SERVER)) return null;
  const totalPower = findLabeledNumber(normalized, '종합(?:\\s*점수)?');
  const combatPower = findLabeledNumber(normalized, '전투력');
  const charmPower = findLabeledNumber(normalized, '매력');
  const lifePower = findLabeledNumber(normalized, '생활력');
  if (![combatPower, lifePower, charmPower, totalPower].every((value) => value !== null)) return null;
  if (combatPower + lifePower + charmPower !== totalPower) return null;

  const nameIndex = normalized.indexOf(expectedName);
  const prefix = normalized.slice(Math.max(0, nameIndex - 80), nameIndex);
  const suffix = normalized.slice(nameIndex + expectedName.length, nameIndex + expectedName.length + 100);
  const jobSource = `${prefix} ${suffix}`;
  const knownJobs = [
    '전사','대검전사','검술사','기사','궁수','석궁사수','장궁병','마법사','화염술사','빙결술사','전격술사',
    '힐러','사제','수도사','암흑술사','음유시인','댄서','악사','도적','격투가','듀얼블레이드',
  ];
  const job = knownJobs.find((item) => jobSource.includes(item)) ?? '';
  if (!job) return null;
  return { server: AIRA_SERVER, characterName: expectedName, job, combatPower, lifePower, charmPower, totalPower };
}
