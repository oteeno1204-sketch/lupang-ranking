import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMobiLifeRankingUrl } from '../src/mobilife-lookup-utils.mjs';

test('MobiLife lookup URL searches the exact character and total ranking', () => {
  assert.equal(
    buildMobiLifeRankingUrl('히 이릴'),
    'https://mabimobi.life/ranking?character_name=%ED%9E%88+%EC%9D%B4%EB%A6%B4&sort_by=total&sort_order=desc',
  );
});

test('browser lookup targets MobiLife instead of Nexon ranking', () => {
  const source = fs.readFileSync(new URL('../src/lookup.mjs', import.meta.url), 'utf8');
  assert.match(source, /mabimobi\.life|buildMobiLifeRankingUrl/);
  assert.doesNotMatch(source, /mabinogimobile\.nexon\.com/);
  assert.match(source, /parseMobiLifeJson/);
  assert.match(source, /parseMobiLifeText/);
});
