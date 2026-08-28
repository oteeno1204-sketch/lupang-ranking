import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficialRankingHtml } from '../src/parser.mjs';

const html = `
<div class="row">
  <span>서버명</span><strong>아이라</strong>
  <span>캐릭터명</span><strong>히이릴</strong>
  <span>클래스</span><strong>검술사</strong>
  <span>종합 점수</span><strong>151,216</strong>
  <span>전투력</span><strong>92,572</strong>
  <span>생활력</span><strong>27,626</strong>
  <span>매력</span><strong>31,018</strong>
</div>`;

test('official parser returns exact Aira character stats', () => {
  assert.deepEqual(parseOfficialRankingHtml(html, '히이릴'), {
    server: '아이라',
    characterName: '히이릴',
    job: '검술사',
    combatPower: 92572,
    lifePower: 27626,
    charmPower: 31018,
    totalPower: 151216,
  });
});

test('official parser rejects a mismatched total', () => {
  assert.equal(parseOfficialRankingHtml(html.replace('151,216', '151,215'), '히이릴'), null);
});
