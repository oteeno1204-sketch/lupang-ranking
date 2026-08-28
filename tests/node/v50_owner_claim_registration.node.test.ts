import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('shared invite contracts include the owner role and preview role', () => {
  const types = read('src/guild/membershipTypes.ts');
  assert.match(types, /GuildInviteRole = 'member' \| 'admin' \| 'owner'/);
  assert.match(types, /InvitePreview = \{[\s\S]+inviteRole:GuildInviteRole/);
  assert.doesNotMatch(types, /AdminGuildCreateInput[\s\S]{0,250}ownerProfileId/);
});

test('registration explains that an owner code activates the guild', () => {
  const register = read('app/(auth)/register.tsx');
  assert.match(register, /길드장 초대코드/);
  assert.match(register, /길드가 활성화/);
});

test('existing-account join labels owner claim separately', () => {
  const join = read('app/guild/join.tsx');
  assert.match(join, /preview\.data\.inviteRole === 'owner'/);
  assert.match(join, /길드장으로 등록/);
});

