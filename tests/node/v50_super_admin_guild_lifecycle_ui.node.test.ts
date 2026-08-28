import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('super admin creates a guild without a profile id and receives the owner code', () => {
  const screen = read('app/admin/guilds.tsx');
  assert.doesNotMatch(screen, /최초 길드장 프로필 ID/);
  assert.doesNotMatch(screen, /setOwnerProfileId/);
  assert.match(screen, /최초 길드장 초대코드/);
  assert.match(screen, /코드 복사/);
  assert.match(screen, /새 코드 발급/);
});

test('guild lifecycle UI separates deactivate restore and permanent delete', () => {
  const screen = read('app/admin/guilds.tsx');
  assert.match(screen, /길드 비활성화/);
  assert.match(screen, /길드 복구/);
  assert.match(screen, /영구 삭제/);
  assert.match(screen, /confirmationName/);
  assert.match(screen, /selectedGuild\.status === 'inactive'/);
});

test('client exposes guarded lifecycle mutations and owner invite issuance', () => {
  const api = read('src/guild/membershipApi.ts');
  const queries = read('src/guild/membershipQueries.ts');
  for (const method of ['issueOwnerInvite', 'deactivateGuild', 'restoreGuild', 'permanentlyDeleteGuild']) {
    assert.match(api, new RegExp(method));
  }
  assert.match(queries, /useDeactivateAdminGuild/);
  assert.match(queries, /useRestoreAdminGuild/);
  assert.match(queries, /usePermanentlyDeleteAdminGuild/);
});

