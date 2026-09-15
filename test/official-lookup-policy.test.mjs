import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('PWA ranking service uses Nexon official ranking in a browser context', () => {
  const source = fs.readFileSync(new URL('../src/lookup.mjs', import.meta.url), 'utf8');
  assert.match(source, /mabinogimobile\.nexon\.com\/Ranking\/List\?t=4/);
  assert.match(source, /chromium\.launch/);
  assert.match(source, /page\.goto/);
  assert.match(source, /page\.evaluate/);
  assert.match(source, /\/Ranking\/List\/rankdata/);
  assert.doesNotMatch(source, /mabimobi\.life|buildMobiLifeApiUrl/);
});

test('runtime includes Playwright Chromium', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const docker = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.equal(pkg.dependencies.playwright, '1.55.0');
  assert.match(docker, /mcr\.microsoft\.com\/playwright:v1\.55\.0-noble/);
});
