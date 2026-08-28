const AIRA_SERVER = '아이라';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'");
}

function linesFromHtml(html) {
  const text = decodeHtml(
    String(html ?? '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '\n'),
  );
  return text.split(/\r?\n/).map(normalizeText).filter(Boolean);
}

function parseNumber(value) {
  const normalized = normalizeText(value).replace(/,/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function findLabel(lines, label, from, to) {
  for (let i = Math.max(0, from); i < Math.min(lines.length, to); i += 1) {
    if (lines[i] === label || lines[i].startsWith(`${label} `)) return i;
  }
  return -1;
}

function nextValue(lines, index) {
  return index >= 0 && index + 1 < lines.length ? lines[index + 1] : null;
}

function numberAfterLabel(lines, label, from, to) {
  const index = findLabel(lines, label, from, to);
  if (index < 0) return null;
  const inline = lines[index].slice(label.length).trim();
  if (inline) {
    const parsed = parseNumber(inline);
    if (parsed !== null) return parsed;
  }
  for (let i = index + 1; i < Math.min(lines.length, index + 4, to); i += 1) {
    const parsed = parseNumber(lines[i]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function validStats(value, expectedName) {
  if (value.server !== AIRA_SERVER || value.characterName !== expectedName || !value.job) return null;
  const numbers = [value.combatPower, value.lifePower, value.charmPower, value.totalPower];
  if (!numbers.every((item) => Number.isSafeInteger(item) && item >= 0)) return null;
  if (value.combatPower + value.lifePower + value.charmPower !== value.totalPower) return null;
  return value;
}

export function parseOfficialRankingHtml(html, characterName) {
  const expectedName = normalizeText(characterName);
  if (!expectedName) return null;
  const lines = linesFromHtml(html);

  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i] !== '캐릭터명' || normalizeText(lines[i + 1]) !== expectedName) continue;
    const start = Math.max(0, i - 10);
    let end = Math.min(lines.length, i + 45);
    for (let j = i + 2; j < lines.length; j += 1) {
      if (lines[j] === '캐릭터명') { end = j; break; }
    }
    const server = normalizeText(nextValue(lines, findLabel(lines, '서버명', start, i + 1)));
    if (server !== AIRA_SERVER) continue;
    const job = normalizeText(nextValue(lines, findLabel(lines, '클래스', i + 1, end)));
    const totalPower = numberAfterLabel(lines, '종합 점수', i + 1, end);
    let combatPower = numberAfterLabel(lines, '전투력', i + 1, end);
    let lifePower = numberAfterLabel(lines, '생활력', i + 1, end);
    let charmPower = numberAfterLabel(lines, '매력', i + 1, end);

    if (totalPower !== null && (combatPower === null || lifePower === null || charmPower === null)) {
      const totalIndex = findLabel(lines, '종합 점수', i + 1, end);
      const candidates = [];
      for (let j = totalIndex + 1; j < Math.min(end, totalIndex + 10); j += 1) {
        for (const token of lines[j].match(/\d{1,3}(?:,\d{3})+|\d+/g) ?? []) {
          const parsed = parseNumber(token);
          if (parsed !== null && parsed !== totalPower) candidates.push(parsed);
        }
      }
      if (candidates.length >= 3) {
        combatPower ??= candidates[0];
        lifePower ??= candidates[1];
        charmPower ??= candidates[2];
      }
    }

    return validStats({ server, characterName: expectedName, job, combatPower, lifePower, charmPower, totalPower }, expectedName);
  }

  const flat = normalizeText(decodeHtml(String(html ?? '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')));
  const rowPattern = /서버명\s+(.+?)\s+캐릭터명\s+(.+?)\s+클래스\s+(.+?)\s+종합 점수\s+([\d,]+)([\s\S]*?)(?=\s+서버명\s+|$)/g;
  for (const match of flat.matchAll(rowPattern)) {
    const server = normalizeText(match[1]);
    const foundName = normalizeText(match[2]);
    const job = normalizeText(match[3]);
    if (server !== AIRA_SERVER || foundName !== expectedName || !job) continue;
    const totalPower = parseNumber(match[4]);
    const tail = normalizeText(match[5]);
    const labeled = /전투력\s+([\d,]+)\s+생활력\s+([\d,]+)\s+매력\s+([\d,]+)/.exec(tail);
    const tokens = labeled ? [labeled[1], labeled[2], labeled[3]] : (tail.match(/\d{1,3}(?:,\d{3})+|\d+/g) ?? []).slice(0, 3);
    if (totalPower === null || tokens.length < 3) continue;
    const combatPower = parseNumber(tokens[0]);
    const lifePower = parseNumber(tokens[1]);
    const charmPower = parseNumber(tokens[2]);
    const result = validStats({ server, characterName: expectedName, job, combatPower, lifePower, charmPower, totalPower }, expectedName);
    if (result) return result;
  }
  return null;
}
