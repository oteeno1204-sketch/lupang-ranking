import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

type QueryResponse = { data?: unknown; error: null; count?: number };
type RpcStatus = 'forbidden' | 'target_not_member' | 'owner_transfer_required';

const npmSpecifiers = new Map([
  ['npm:@supabase/supabase-js@2', '@supabase/supabase-js'],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'npm:bcryptjs@2.4.3') {
      return {
        shortCircuit: true,
        url: 'data:text/javascript,export default { hash() { throw new Error("bcrypt unavailable in handler test") }, compare() { throw new Error("bcrypt unavailable in handler test") } }',
      };
    }
    return nextResolve(npmSpecifiers.get(specifier) ?? specifier, context);
  },
});

const runtime = globalThis as typeof globalThis & {
  Deno: { env: { get(name: string): string | undefined } };
};
runtime.Deno = {
  env: {
    get(name) {
      if (name === 'SESSION_TOKEN_PEPPER') return 'node-handler-test-pepper';
      return undefined;
    },
  },
};

const [{
  handleCreateAdminGuild,
  handleTransferGuildOwner,
  handleUpdateAdminGuild,
  handleUpdateGuildMemberRole,
}, { handleRemoveMember }] = await Promise.all([
  import('../../supabase/functions/api/guildAdmin.ts'),
  import('../../supabase/functions/api/members.ts'),
]);

function queryResult(result: QueryResponse) {
  const builder = {
    select() { return builder; },
    eq() { return builder; },
    is() { return builder; },
    order() { return builder; },
    async maybeSingle() { return result; },
    then(resolve: (value: QueryResponse) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

function fakeAccountClient(options: {
  expectedRpc: string;
  rpcStatus: RpcStatus | ((args: Record<string, unknown>) => RpcStatus);
  role?: 'owner' | 'admin';
  isSuperAdmin?: boolean;
  membership?: boolean;
}) {
  const profile = {
    id: 'actor-1',
    nickname: 'actor',
    role: 'admin',
    avatar_path: null,
    bio: null,
    cover_path: null,
    is_active: true,
    is_super_admin: options.isSuperAdmin ?? false,
    created_at: new Date(0).toISOString(),
  };
  const guild = {
    id: 'guild-1',
    name: '길드',
    tagline: '소개',
    server: '아이라',
    logo_path: null,
    header_background_path: null,
    accent_color: '#8b5cf6',
    max_members: 100,
    status: 'active',
  };
  const responses = new Map<string, QueryResponse[]>([
    ['app_sessions', [{ data: { id: 'session-1', expires_at: '2999-01-01T00:00:00.000Z', revoked_at: null, profile }, error: null }]],
    ['profiles', [{ data: profile, error: null }]],
    ['guild_members', options.membership === false
      ? [{ data: null, error: null }]
      : [
          { data: { role: options.role ?? 'owner', joined_at: new Date(0).toISOString(), guild }, error: null },
          { count: 2, error: null },
        ]],
  ]);

  return {
    from(table: string) {
      const result = responses.get(table)?.shift();
      if (!result) throw new Error(`Unexpected table query: ${table}`);
      return queryResult(result);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name !== options.expectedRpc) throw new Error(`Unexpected RPC: ${name}`);
      const status = typeof options.rpcStatus === 'function' ? options.rpcStatus(args) : options.rpcStatus;
      return { data: { status }, error: null };
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
  } as never;
}

function request(body?: unknown) {
  return new Request('https://example.test/api', {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('real guild handlers map transaction-time privilege loss to forbidden', async () => {
  const cases = [
    handleCreateAdminGuild(
      request({ name: '새 길드', tagline: '소개' }),
      fakeAccountClient({ expectedRpc: 'create_unclaimed_guild_atomic', rpcStatus: 'forbidden', isSuperAdmin: true, membership: false }),
    ),
    handleUpdateAdminGuild(
      request({ status: 'inactive' }),
      fakeAccountClient({ expectedRpc: 'set_guild_status_atomic', rpcStatus: 'forbidden', isSuperAdmin: true, membership: false }),
      'guild-1',
    ),
    handleTransferGuildOwner(
      request({ ownerProfileId: 'owner-2' }),
      fakeAccountClient({ expectedRpc: 'transfer_guild_owner_atomic', rpcStatus: 'forbidden' }),
      'guild-1',
    ),
    handleUpdateGuildMemberRole(
      request({ role: 'admin' }),
      fakeAccountClient({ expectedRpc: 'set_guild_member_role_atomic', rpcStatus: 'forbidden' }),
      'member-1',
    ),
  ];

  for (const result of await Promise.all(cases)) {
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, 'FORBIDDEN');
    }
  }
});

test('real removal handler rejects cross-guild and owner targets', async () => {
  const crossGuild = await handleRemoveMember(
    request(),
    fakeAccountClient({
      expectedRpc: 'remove_guild_member_atomic',
      role: 'admin',
      rpcStatus: (args) => args.p_guild_id === 'guild-1' ? 'target_not_member' : 'forbidden',
    }),
    'other-guild-member',
  );
  assert.equal(crossGuild.ok, false);
  if (!crossGuild.ok) {
    assert.equal(crossGuild.status, 404);
    assert.equal(crossGuild.code, 'NOT_FOUND');
  }

  const owner = await handleRemoveMember(
    request(),
    fakeAccountClient({ expectedRpc: 'remove_guild_member_atomic', role: 'admin', rpcStatus: 'owner_transfer_required' }),
    'owner-2',
  );
  assert.equal(owner.ok, false);
  if (!owner.ok) {
    assert.equal(owner.status, 409);
    assert.equal(owner.code, 'OWNER_TRANSFER_REQUIRED');
  }
});
