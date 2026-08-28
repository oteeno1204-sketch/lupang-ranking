import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('native bulk sync renders one official WebView and progress controls', () => {
  const native = read('src/characters/GuildBulkOfficialSync.native.tsx');
  assert.match(native, /OfficialRankingWebView/);
  assert.match(native, /targets\[state\.index\]/);
  assert.match(native, /길드원 전투력 전체 갱신/);
  assert.match(native, /갱신 취소/);
  assert.match(native, /성공/);
  assert.match(native, /실패/);
  assert.match(native, /미등록/);
});

test('web bulk sync never imports or starts official ranking lookup', () => {
  const web = read('src/characters/GuildBulkOfficialSync.web.tsx');
  assert.match(web, /return null/);
  assert.doesNotMatch(web, /OfficialRankingWebView|react-native-webview|fetch\(/);
});

test('power screen role-gates the native-only bulk sync surface', () => {
  const screen = read('app/power/index.tsx');
  assert.match(screen, /GuildBulkOfficialSync/);
  assert.match(screen, /membership\?\.role/);
  assert.match(screen, /owner.*admin|admin.*owner/);
  assert.match(screen, /useGuildOfficialSyncTargets/);
});

