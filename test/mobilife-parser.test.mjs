import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMobiLifeJson, parseMobiLifeText } from '../src/mobilife-parser.mjs';

test('MobiLife JSON parser finds a nested exact character and normalizes stats', () => {
  const payload = {
    data: {
      items: [
        {
          character_name: '히이릴',
          server_name: '아이라',
          class_name: '검술사',
          combat_power: '92,572',
          life_power: 27626,
          charm_power: '31,018',
          total_power: '151,216',
        },
      ],
    },
  };
  assert.deepEqual(parseMobiLifeJson(payload, '히이릴'), {
    server: '아이라',
    characterName: '히이릴',
    job: '검술사',
    combatPower: 92572,
    lifePower: 27626,
    charmPower: 31018,
    totalPower: 151216,
  });
});

test('MobiLife JSON parser supports camelCase ranking payloads', () => {
  const payload = [{
    characterName: '이든곰', server: '아이라', job: '석궁사수',
    combatPower: 81885, lifePower: 10493, charmPower: 25650, totalPower: 118028,
  }];
  assert.equal(parseMobiLifeJson(payload, '이든곰')?.job, '석궁사수');
});

test('MobiLife text parser reads rendered Korean ranking card text', () => {
  const text = `\n아이라\n히이릴\n검술사\n종합 151,216\n전투력 92,572\n매력 31,018\n생활력 27,626\n`;
  assert.deepEqual(parseMobiLifeText(text, '히이릴'), {
    server: '아이라',
    characterName: '히이릴',
    job: '검술사',
    combatPower: 92572,
    lifePower: 27626,
    charmPower: 31018,
    totalPower: 151216,
  });
});

test('MobiLife parser rejects mismatched totals and other characters', () => {
  const payload = [{ character_name: '다른사람', server: '아이라', class_name: '검술사', combat_power: 10, life_power: 20, charm_power: 30, total_power: 60 }];
  assert.equal(parseMobiLifeJson(payload, '히이릴'), null);
  assert.equal(parseMobiLifeText('아이라 히이릴 검술사 종합 61 전투력 10 매력 30 생활력 20', '히이릴'), null);
});
