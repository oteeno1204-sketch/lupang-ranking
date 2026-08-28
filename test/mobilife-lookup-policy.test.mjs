import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMobiLifeApiUrl } from '../src/mobilife-direct-api.mjs';

test('MobiLife direct API URL searches the exact character', () => {
  assert.equal(
    buildMobiLifeApiUrl('히 이릴'),
    'https://mabimobi.life/d/api/v1/search/rankings/v2?character_name=%ED%9E%88+%EC%9D%B4%EB%A6%B4&sort_by=total&sort_order=desc&page=1&per_page=20',
  );
});

test('lookup uses the MobiLife JSON API without browser automation', () => {
  const source = fs.readFileSync(new URL('../src/lookup.mjs', import.meta.url), 'utf8');
  assert.match(source, /mabimobi|buildMobiLifeApiUrl/);
  assert.match(source, /fetch\(/);
  assert.doesNotMatch(source, /mabinogimobile\.nexon\.com|chromium|page\.goto|locator\(/);
});

test('runtime no longer ships Playwright', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const docker = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.equal(pkg.dependencies.playwright, undefined);
  assert.match(docker, /^FROM node:22-alpine/m);
  assert.doesNotMatch(docker, /playwright/i);
});
