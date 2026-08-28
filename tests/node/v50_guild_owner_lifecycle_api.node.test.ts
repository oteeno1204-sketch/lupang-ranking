import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const guildAdmin = () => read('supabase/functions/api/guildAdmin.ts');
const routes = () => read('supabase/functions/api/index.ts');
const auth = () => read('supabase/functions/api/auth.ts');
const migration = () => read('supabase/migrations/20260828075416_v50_guild_owner_claim_lifecycle.sql');

test('admin guild creation no longer accepts an owner profile id and returns an owner invite', () => {
  const source = guildAdmin();
  const createHandler = source.slice(source.indexOf('export async function handleCreateAdminGuild'), source.indexOf('export async function handleUpdateAdminGuild'));
  assert.doesNotMatch(createHandler, /ownerProfileId/);
  assert.match(source, /create_unclaimed_guild_atomic/);
  assert.match(source, /ownerInvite/);
  assert.match(source, /issueGuildInvite[\s\S]+?'owner'/);
});

test('owner invite issuance and lifecycle endpoints are explicitly routed', () => {
  const source = routes();
  assert.match(source, /adminGuildOwnerInviteMatch/);
  assert.match(source, /adminGuildDeactivateMatch/);
  assert.match(source, /adminGuildRestoreMatch/);
  assert.match(source, /handlePermanentlyDeleteAdminGuild/);
  assert.match(source, /req\.method === 'DELETE'/);
});

test('owner codes use a dedicated service-only inactive-guild RPC', () => {
  const sql = migration();
  assert.match(sql, /create or replace function public\.create_owner_guild_invite_atomic/i);
  assert.match(sql, /v_guild_status <> 'inactive'/i);
  assert.match(sql, /'owner'/i);
  assert.match(sql, /max_uses[\s\S]+1/i);
  assert.match(sql, /revoke all on function public\.create_owner_guild_invite_atomic[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.create_owner_guild_invite_atomic[\s\S]+to service_role/i);
});

test('registration and existing account joins accept owner claims atomically', () => {
  const sql = migration();
  assert.match(sql, /create or replace function public\.register_with_guild_invite_atomic/i);
  assert.match(sql, /v_invite_role = 'owner'/i);
  assert.match(sql, /insert into public\.profiles[\s\S]+insert into public\.guild_members[\s\S]+update public\.guilds/i);
  assert.match(sql, /create or replace function public\.join_guild_via_invite_atomic/i);
  assert.match(sql, /claim_guild_owner_by_invite_atomic/i);
  assert.match(auth(), /payload\.status !== 'registered'/);
});

test('preview and join responses preserve owner invite role for UI copy', () => {
  const source = guildAdmin();
  assert.match(source, /type InvitePreview[\s\S]+inviteRole: GuildInviteRole/);
  assert.match(source, /inviteRole: invite\.invite_role/);
  assert.match(source, /payload\.status !== 'joined' && payload\.status !== 'claimed'/);
});
