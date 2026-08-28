import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobiLifeSearchPending, compactDiagnosticText } from '../src/mobilife-diagnostics.mjs';

test('MobiLife search pending detector recognizes dynamic loading copy', () => {
  assert.equal(isMobiLifeSearchPending('캐릭터 검색 중... 이든곰 검색 중 서버에서 최신 랭킹 데이터를 검색하고 있습니다.'), true);
  assert.equal(isMobiLifeSearchPending('검색 결과 이든곰 아이라 석궁사수 종합 118,028'), false);
});

test('diagnostic text compacts whitespace and bounds log size', () => {
  const text = `  첫줄\n\n둘째줄   ${'가'.repeat(2000)}`;
  const compact = compactDiagnosticText(text, 120);
  assert.equal(compact.includes('\n'), false);
  assert.ok(compact.length <= 120);
  assert.match(compact, /^첫줄 둘째줄/);
});
