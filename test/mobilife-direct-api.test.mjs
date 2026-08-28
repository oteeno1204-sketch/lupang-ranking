import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMobiLifeApiUrl, parseMobiLifeApiPayload } from '../src/mobilife-direct-api.mjs';

test('builds the MobiLife internal ranking API URL for an exact character search', () => {
  assert.equal(
    buildMobiLifeApiUrl('이든곰'),
    'https://mabimobi.life/d/api/v1/search/rankings/v2?character_name=%EC%9D%B4%EB%93%A0%EA%B3%B0&sort_by=total&sort_order=desc&page=1&per_page=20',
  );
});

test('parses MobiLife code-based ranking response into Lupang stats', () => {
  const payload = {
    id: 489516075,
    character_name: '이든곰',
    server: '02',
    klass: '05',
    combat: 81834,
    charm: 26388,
    life_skill: 10451,
    total: 118673,
  };
  assert.deepEqual(parseMobiLifeApiPayload(payload, '이든곰'), {
    server: '아이라',
    characterName: '이든곰',
    job: '석궁사수',
    combatPower: 81834,
    lifePower: 10451,
    charmPower: 26388,
    totalPower: 118673,
  });
});

test('rejects another server or mismatched character', () => {
  const base = { character_name: '이든곰', server: '02', klass: '05', combat: 1, charm: 2, life_skill: 3, total: 6 };
  assert.equal(parseMobiLifeApiPayload({ ...base, server: '04' }, '이든곰'), null);
  assert.equal(parseMobiLifeApiPayload(base, '다른이름'), null);
});

test('lookup implementation uses direct API rather than Playwright page parsing', () => {
  const source = fs.readFileSync(new URL('../src/lookup.mjs', import.meta.url), 'utf8');
  assert.match(source, /buildMobiLifeApiUrl/);
  assert.match(source, /fetch\(/);
  assert.doesNotMatch(source, /chromium|page\.goto|locator\(/);
});
