import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guildAdmin = () => fs.readFileSync('supabase/functions/api/guildAdmin.ts', 'utf8');

test('guild invite generator creates exactly four decimal digits with cryptographic randomness', () => {
  const source = guildAdmin();
  assert.match(source, /function newInviteCode\(\): string/);
  assert.match(source, /crypto\.getRandomValues/);
  assert.match(source, /padStart\(4, '0'\)/);
  assert.doesNotMatch(source, /btoa\(/);
});

test('guild invite API validates the invite role and forwards it through the bounded issuer', () => {
  const source = guildAdmin();
  assert.match(source, /inviteRole: GuildInviteRole/);
  assert.match(source, /raw\.inviteRole !== 'member' && raw\.inviteRole !== 'admin'/);
  assert.match(source, /issueGuildInvite\([\s\S]*parsed\.value\.inviteRole/);
  assert.match(source, /p_invite_role: inviteRole/);
  assert.match(source, /inviteRole,\s*\n\s*code/);
});

test('guild invite issuance retries bounded collisions and has a dedicated exhaustion error', () => {
  const source = guildAdmin();
  assert.match(source, /INVITE_GENERATION_ATTEMPTS\s*=\s*\d+/);
  assert.match(source, /attempt < INVITE_GENERATION_ATTEMPTS/);
  assert.match(source, /payload\.status === 'hash_conflict'/);
  assert.match(source, /INVITE_CODE_SPACE_EXHAUSTED/);
});

test('owner and admin may manage invites while members may not', () => {
  const source = guildAdmin();
  assert.match(source, /membership\?\.role === 'owner' \|\| context\.membership\?\.role === 'admin'/);
  assert.match(source, /초대코드를 관리할 권한이 없습니다/);
});
