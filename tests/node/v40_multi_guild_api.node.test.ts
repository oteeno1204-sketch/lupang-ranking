import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

function exportedFunction(source: string, name: string, nextName?: string) {
  const start = source.indexOf(`export function ${name}`);
  const end = nextName ? source.indexOf(`export function ${nextName}`, start + 1) : source.length;
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should exist after ${name}`);
  return source.slice(start, end);
}

function sqlFunction(source: string, name: string, nextName: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  const end = source.indexOf(`create or replace function public.${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should exist after ${name}`);
  return source.slice(start, end);
}

test('membership guard derives guild scope from the authenticated account', () => {
  const source = read('supabase/functions/api/membership.ts');
  assert.match(source, /requireAccount/);
  assert.match(source, /requireGuildRole/);
  assert.match(source, /guild_members/);
  assert.doesNotMatch(source, /body\.guildId/);
  assert.doesNotMatch(source, /searchParams\.get\(['"]guildId['"]\)/);
});

test('auth session payloads expose server-resolved membership and super admin state', () => {
  const auth = read('supabase/functions/api/auth.ts');
  const types = read('supabase/functions/api/types.ts');

  assert.match(types, /isSuperAdmin: boolean/);
  assert.match(auth, /membership:/);
  assert.match(auth, /handleMe/);
  assert.match(auth, /requireAccount|loadCurrentAccount/);
});

test('client auth flow hydrates membership and clears membership-scoped cache on account changes', () => {
  const api = read('src/auth/api.ts');
  const store = read('src/auth/store.ts');

  assert.match(api, /CurrentAccount/);
  assert.match(store, /membership:/);
  assert.match(store, /clearMembershipDependentQueries/);
});

test('guild lifecycle routes hash invite codes server-side and expose membership client wrappers', () => {
  const server = read('supabase/functions/api/guildAdmin.ts');
  const inviteSecurity = read('supabase/functions/api/guildInviteSecurity.ts');
  const index = read('supabase/functions/api/index.ts');
  const api = read('src/guild/membershipApi.ts');
  const queries = read('src/guild/membershipQueries.ts');

  assert.match(inviteSecurity, /GUILD_INVITE_HASH_SECRET/);
  assert.match(inviteSecurity, /crypto\.subtle\.digest/);
  assert.match(server, /https:\/\/lupang\.expo\.app\/guild\/join\?code=/);
  assert.match(server, /requireAccount|accountOrFailure/);
  assert.doesNotMatch(server, /body\.guildId/);
  assert.doesNotMatch(server, /searchParams\.get\(['"]guildId['"]\)/);

  assert.match(index, /\/admin\/guilds/);
  assert.match(index, /\/guild\/invites/);
  assert.match(index, /\/guild\/join/);
  assert.match(index, /\/guild\/leave/);
  assert.match(index, /guildMemberRoleMatch/);

  assert.match(api, /admin\/guilds/);
  assert.match(api, /guild\/invites/);
  assert.match(api, /guild\/join/);
  assert.match(api, /guild\/leave/);
  assert.match(queries, /admin-guilds/);
  assert.match(queries, /invalidateQueries/);
});

test('invite mutations and their audit entries are committed by the same SQL transaction', () => {
  const server = read('supabase/functions/api/guildAdmin.ts');
  const migration = read('supabase/migrations/202608270003_v40_guild_admin_atomic.sql');

  assert.match(server, /'create_guild_invite_atomic'/);
  assert.match(server, /client\.rpc\(rpc, args\)/);
  assert.match(server, /client\.rpc\('revoke_guild_invite_atomic'/);
  assert.doesNotMatch(server, /from\('guild_invite_codes'\)[\s\S]{0,300}\.insert\(/);
  assert.doesNotMatch(server, /from\('guild_invite_codes'\)[\s\S]{0,300}\.update\(/);
  assert.match(migration, /create or replace function public\.create_guild_invite_atomic/);
  assert.match(migration, /create or replace function public\.revoke_guild_invite_atomic/);
});

test('membership mutations invalidate every membership-dependent query family', () => {
  const queries = read('src/guild/membershipQueries.ts');

  for (const body of [
    exportedFunction(queries, 'useCreateAdminGuild', 'useUpdateAdminGuild'),
    exportedFunction(queries, 'useUpdateAdminGuild', 'useTransferGuildOwner'),
    exportedFunction(queries, 'useTransferGuildOwner', 'useCreateGuildInvite'),
    exportedFunction(queries, 'useJoinGuild', 'useLeaveGuild'),
    exportedFunction(queries, 'useLeaveGuild', 'useUpdateGuildMemberRole'),
    exportedFunction(queries, 'useUpdateGuildMemberRole'),
  ]) {
    assert.match(body, /invalidateMembershipState\(queryClient\)/);
  }
});

test('privileged guild RPCs lock and recheck the current actor authority', () => {
  const migration = read('supabase/migrations/202608270003_v40_guild_admin_atomic.sql');
  const create = sqlFunction(migration, 'create_guild_with_owner_atomic', 'set_guild_status_atomic');
  const status = sqlFunction(migration, 'set_guild_status_atomic', 'transfer_guild_owner_atomic');
  const transfer = sqlFunction(migration, 'transfer_guild_owner_atomic', 'set_guild_member_role_atomic');
  const role = sqlFunction(migration, 'set_guild_member_role_atomic', 'create_guild_invite_atomic');
  const invite = sqlFunction(migration, 'create_guild_invite_atomic', 'revoke_guild_invite_atomic');
  const revoke = sqlFunction(migration, 'revoke_guild_invite_atomic', 'join_guild_via_invite_atomic');

  for (const body of [create, status]) {
    assert.match(body, /is_super_admin/);
    assert.match(body, /select is_super_admin[^;]+for (?:no key )?update;/);
    assert.match(body, /'forbidden'/);
  }
  assert.match(transfer, /select is_super_admin[^;]+for (?:no key )?update;/);
  assert.match(transfer, /perform 1[^;]+profile_id = p_actor_profile_id[^;]+role = 'owner'[^;]+for update;/);
  assert.match(role, /perform 1[^;]+profile_id = p_actor_profile_id[^;]+role = 'owner'[^;]+for update;/);
  for (const body of [invite, revoke]) {
    assert.match(body, /perform 1[^;]+profile_id = p_actor_profile_id[^;]+role in \('owner', 'admin'\)[^;]+for update;/);
  }
});

test('member removal only ends the target guild membership and audits atomically', () => {
  const members = read('supabase/functions/api/members.ts');
  const migration = read('supabase/migrations/202608270003_v40_guild_admin_atomic.sql');
  const removal = sqlFunction(migration, 'remove_guild_member_atomic', 'join_guild_via_invite_atomic');

  assert.match(members, /requireAccount/);
  assert.match(members, /client\.rpc\('remove_guild_member_atomic'/);
  assert.doesNotMatch(members, /profiles'\)\.update\(\{is_active:false/);
  assert.doesNotMatch(members, /app_sessions'\)\.update/);
  assert.match(removal, /perform 1[^;]+profile_id = p_actor_profile_id[^;]+role in \('owner', 'admin'\)[^;]+for update;/);
  assert.match(removal, /profile_id = p_target_profile_id/);
  assert.match(removal, /v_target_role = 'owner'[\s\S]+owner_transfer_required/);
  assert.match(removal, /update public\.guild_members/);
  assert.match(removal, /'guild\.member_removed'/);
});

test('guild lifecycle RPCs deny direct app-role execution', () => {
  const migration = read('supabase/migrations/202608270003_v40_guild_admin_atomic.sql');
  const rpcNames = [
    'create_guild_with_owner_atomic',
    'set_guild_status_atomic',
    'transfer_guild_owner_atomic',
    'set_guild_member_role_atomic',
    'create_guild_invite_atomic',
    'revoke_guild_invite_atomic',
    'remove_guild_member_atomic',
    'join_guild_via_invite_atomic',
    'leave_guild_atomic',
  ];

  for (const name of rpcNames) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public, anon, authenticated;`),
    );
  }

  assert.ok(
    migration.indexOf('create or replace function public.leave_guild_atomic')
      < migration.indexOf('revoke all on function public.leave_guild_atomic'),
    'RPC grants must follow every function declaration',
  );
});

test('guild-owned content handlers derive scope from the authenticated membership', () => {
  const targets = {
    notices: read('supabase/functions/api/notices.ts'),
    schedules: read('supabase/functions/api/schedules.ts'),
    albums: read('supabase/functions/api/albums.ts'),
    proposals: read('supabase/functions/api/proposals.ts'),
  };

  for (const [name, source] of Object.entries(targets)) {
    assert.match(source, /requireAccount/, `${name} should resolve the signed-in account`);
    assert.match(source, /requireGuildRole/, `${name} should derive guild scope from membership`);
    assert.doesNotMatch(source, /body\.guild(?:Id|_id)|searchParams\.get\(['"]guild(?:Id|_id)['"]\)/, `${name} must not trust client guild ids`);
  }

  assert.match(targets.notices, /from\('notices'\)[\s\S]*?eq\('guild_id',\s*guildId\)/);
  assert.match(targets.notices, /insert\(\{[\s\S]*?guild_id:\s*guildId/);
  assert.match(targets.schedules, /from\('schedules'\)[\s\S]*?eq\('guild_id',\s*guildId\)/);
  assert.match(targets.schedules, /insert\(\{[\s\S]*?guild_id:\s*guildId/);
  assert.match(targets.albums, /from\('album_posts'\)[\s\S]*?eq\('guild_id',\s*guildId\)/);
  assert.match(targets.albums, /insert\(\{[\s\S]*?guild_id:\s*guildId/);
  assert.match(targets.proposals, /from\('proposals'\)[\s\S]*?eq\('guild_id',\s*guildId\)/);
  assert.match(targets.proposals, /insert\(\{[\s\S]*?guild_id:\s*guildId/);
});

test('guild detail mutations hide cross-guild records as not found', () => {
  for (const file of ['notices.ts', 'schedules.ts', 'albums.ts', 'proposals.ts']) {
    const source = read(`supabase/functions/api/${file}`);
    assert.match(source, /eq\('guild_id',\s*guildId\)[\s\S]*?maybeSingle\(\)/, `${file} detail lookup must include guild scope`);
    assert.match(source, /eq\('id',\s*id\)[\s\S]*?eq\('guild_id',\s*guildId\)/, `${file} writes should match id and guild together`);
    assert.match(source, /404[\s\S]*?NOT_FOUND/, `${file} should map an invisible row to 404`);
  }
});

test('guild settings and member directory use the current guild instead of legacy global state', () => {
  const guild = read('supabase/functions/api/guild.ts');
  const members = read('supabase/functions/api/members.ts');

  assert.match(guild, /requireAccount/);
  assert.match(guild, /requireGuildRole/);
  assert.match(guild, /from\('guilds'\)/);
  assert.match(guild, /eq\('id',\s*guildId\)/);
  assert.doesNotMatch(guild, /from\('guild_settings'\)/);
  assert.doesNotMatch(guild, /eq\('id',\s*1\)/);

  assert.match(members, /requireGuildRole/);
  assert.match(members, /from\('guild_members'\)/);
  assert.match(members, /eq\('guild_id',\s*guildId\)/);
});

test('guild uploads and push delivery are membership scoped while direct chat stays global', () => {
  const uploads = read('supabase/functions/api/uploads.ts');
  const push = read('supabase/functions/api/push.ts');
  const notices = read('supabase/functions/api/notices.ts');
  const schedules = read('supabase/functions/api/schedules.ts');
  const chat = read('supabase/functions/api/chat.ts');

  assert.match(uploads, /requireAccount/);
  assert.match(uploads, /requireGuildRole/);
  assert.match(uploads, /guilds\/\$\{guildId\}\//);
  assert.match(uploads, /direct\/\$\{roomId\}\//);
  assert.doesNotMatch(uploads, /body\.guild(?:Id|_id)/);

  assert.match(push, /sendPushToGuild/);
  assert.match(push, /from\('guild_members'\)/);
  assert.match(push, /eq\('guild_id',\s*guildId\)/);
  assert.match(push, /eq\('status',\s*'active'\)/);
  assert.match(push, /is\('left_at',\s*null\)/);
  assert.match(notices, /sendPushToGuild\(client,\s*guildId/);
  assert.match(schedules, /sendPushToGuild\(client,\s*guildId/);

  assert.match(chat, /guild_id/);
  assert.match(chat, /guildRoom\(client,\s*guildId\)/);
  assert.match(chat, /room\.room_type === 'guild'[\s\S]*?room\.guild_id === guildId/);
  assert.match(chat, /from\('guild_members'\)[\s\S]*?eq\('guild_id',\s*room\.guild_id\)/);
  assert.match(chat, /room\.room_type === 'direct'[\s\S]*?chat_room_members/);
  assert.doesNotMatch(chat, /from\('profiles'\)\.select\('id'\)\.eq\('is_active', true\)\.neq\('id'/);
});

test('guild-scoped client query keys include the active guild id', () => {
  const files = [
    'src/guild/queries.ts',
    'src/notices/queries.ts',
    'src/schedules/queries.ts',
    'src/albums/queries.ts',
    'src/proposals/queries.ts',
    'src/chat/queries.ts',
    'src/profile/queries.ts',
  ];

  for (const file of files) {
    const source = read(file);
    assert.match(source, /membership\?\.guild\.id|currentGuildId|guildId/, `${file} should read the active guild id`);
    assert.match(source, /\[[^\]]*guildId[^\]]*\]/, `${file} query keys should include guildId`);
  }
});
