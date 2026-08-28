import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
const roleSql = () => read('supabase/migrations/20260828075403_v50_owner_invite_role.sql');
const lifecycleSql = () => read('supabase/migrations/20260828075416_v50_guild_owner_claim_lifecycle.sql');

test('owner invite role is added in a migration committed before owner RPC use', () => {
  assert.match(roleSql(), /alter type public\.guild_invite_role add value if not exists 'owner'/i);
});

test('guild lifecycle migration keeps permanent deletion audit evidence', () => {
  const sql = lifecycleSql();
  assert.match(sql, /create table public\.platform_audit_logs/i);
  assert.match(sql, /target_guild_id uuid/i);
  assert.doesNotMatch(sql, /target_guild_id uuid[^,]+references public\.guilds/i);
  assert.match(sql, /alter table public\.platform_audit_logs enable row level security/i);
  assert.match(sql, /revoke all on public\.platform_audit_logs from anon, authenticated/i);
});

test('guild lifecycle changes are atomic and service-role only', () => {
  const sql = lifecycleSql();
  const functions = [
    'create_unclaimed_guild_atomic',
    'claim_guild_owner_by_invite_atomic',
    'deactivate_guild_atomic',
    'restore_guild_atomic',
    'permanently_delete_guild_atomic',
  ];
  for (const name of functions) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}`, 'i'));
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`, 'i'));
  }
  assert.match(sql, /p_confirmation_name[\s\S]+v_guild_name[\s\S]+p_confirmation_name <> v_guild_name/i);
  assert.match(sql, /v_guild_status <> 'inactive'/i);
  assert.match(sql, /update public\.guild_invite_codes[\s\S]+set revoked_at/i);
});

test('owner claim consumes exactly one owner code and activates exactly one owner', () => {
  const sql = lifecycleSql();
  assert.match(sql, /v_invite_role <> 'owner'/i);
  assert.match(sql, /v_max_uses <> 1/i);
  assert.match(sql, /insert into public\.guild_members[\s\S]+?'owner'[\s\S]+?'active'/i);
  assert.match(sql, /update public\.guilds[\s\S]+set status = 'active'/i);
  assert.match(sql, /update public\.guild_invite_codes[\s\S]+use_count = use_count \+ 1[\s\S]+revoked_at = v_now/i);
});

test('lifecycle SQL has one super-admin declaration per RPC and registration rejects an existing active owner', () => {
  const sql = lifecycleSql();
  const permanentDelete = sql.match(/create or replace function public\.permanently_delete_guild_atomic[\s\S]+?\$\$;/i)?.[0] ?? '';
  assert.equal(permanentDelete.match(/v_actor_is_super_admin boolean;/gi)?.length, 1);

  const registration = sql.match(/create or replace function public\.register_with_guild_invite_atomic[\s\S]+?\$\$;/i)?.[0] ?? '';
  assert.match(registration, /v_invite_role = 'owner'[\s\S]+exists \([\s\S]+role = 'owner'[\s\S]+status = 'active'/i);
  assert.match(registration, /owner_already_assigned/i);
});
