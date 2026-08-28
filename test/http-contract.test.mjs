import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, parseAllowedOrigins, validateLookupInput } from '../src/contracts.mjs';

test('lookup input accepts only Aira and a bounded character name', () => {
  assert.deepEqual(validateLookupInput({ server: '아이라', characterName: ' 히이릴 ' }), { ok: true, value: { server: '아이라', characterName: '히이릴' } });
  assert.equal(validateLookupInput({ server: '데이안', characterName: '히이릴' }).ok, false);
  assert.equal(validateLookupInput({ server: '아이라', characterName: '' }).ok, false);
});

test('CORS allowlist accepts configured PWA origin and rejects others', () => {
  const allowed = parseAllowedOrigins('https://lupang.expo.app,http://localhost:8081');
  assert.equal(isAllowedOrigin('https://lupang.expo.app', allowed), true);
  assert.equal(isAllowedOrigin('https://evil.example', allowed), false);
});
