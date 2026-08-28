import {
  loadCurrentAccount,
  requireAccount,
  type AccountContext,
  type GuildRole,
  type GuildSummary,
} from './membership.ts';
import { cleanString, isObject, readJson, signedReadUrl } from './serverHelpers.ts';
import { failure, success, type HandlerResult, type ServiceClient } from './types.ts';
import { hashGuildInviteCode } from './guildInviteSecurity.ts';

const INVITE_LINK_BASE = 'https://lupang.expo.app/guild/join?code=';
const GUILD_ACCENT_COLOR = /^#[0-9A-Fa-f]{6}$/;
const INVITE_GENERATION_ATTEMPTS = 32;
type GuildInviteRole = 'member' | 'admin' | 'owner';

type AuthorizationResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

type GuildStatus = 'active' | 'inactive';

type GuildRow = {
  id: string;
  name: string;
  tagline: string;
  server: '아이라';
  logo_path: string | null;
  header_background_path: string | null;
  accent_color: string;
  max_members: number;
  status: GuildStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type GuildOwnerRow = {
  profile_id: string;
  profile: { id: string; nickname: string } | Array<{ id: string; nickname: string }> | null;
};

type GuildInviteRow = {
  id: string;
  guild_id: string;
  invite_role: GuildInviteRole;
  expires_at: string | null;
  revoked_at: string | null;
  max_uses: number | null;
  use_count: number;
  created_at: string;
  updated_at: string;
  guild: GuildRow | GuildRow[] | null;
};

type AdminGuildSummary = GuildSummary & {
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  ownerProfileId: string | null;
  ownerNickname: string | null;
};

type GuildInviteDto = {
  id: string;
  guildId: string;
  inviteRole: GuildInviteRole;
  code: string;
  link: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
  createdAt: string;
};

type InvitePreview = {
  guild: GuildSummary;
  expiresAt: string | null;
  inviteRole: GuildInviteRole;
};

type AdminGuildCreateResult = {
  guild: AdminGuildSummary;
  ownerInvite: GuildInviteDto | null;
};

type GuildMemberRoleChange = {
  guildId: string;
  profileId: string;
  role: Extract<GuildRole, 'admin' | 'member'>;
};

type RpcPayload = Record<string, unknown> & { status?: string; guild_id?: string | null };
type CurrentAccountData = Awaited<ReturnType<typeof loadCurrentAccount>>;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function rpcPayload(value: unknown): RpcPayload {
  return isObject(value) ? (value as RpcPayload) : {};
}

async function countActiveMembers(client: ServiceClient, guildId: string): Promise<number> {
  const { count } = await client
    .from('guild_members')
    .select('*', { head: true, count: 'exact' })
    .eq('guild_id', guildId)
    .eq('status', 'active')
    .is('left_at', null);

  return count ?? 0;
}

async function readOwner(client: ServiceClient, guildId: string): Promise<{ id: string; nickname: string } | null> {
  const { data, error } = await client
    .from('guild_members')
    .select('profile_id,profile:profiles!guild_members_profile_id_fkey(id,nickname)')
    .eq('guild_id', guildId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .is('left_at', null)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as GuildOwnerRow;
  const profile = one(row.profile);
  return profile ? { id: profile.id, nickname: profile.nickname } : { id: row.profile_id, nickname: '알 수 없음' };
}

async function mapGuildSummary(client: ServiceClient, row: GuildRow): Promise<GuildSummary> {
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    server: row.server,
    memberCount: await countActiveMembers(client, row.id),
    maxMembers: Number(row.max_members),
    logoUrl: await signedReadUrl(client, 'profiles', row.logo_path),
    headerBackgroundUrl: await signedReadUrl(client, 'profiles', row.header_background_path),
    accentColor: row.accent_color,
    status: row.status,
  };
}

async function mapAdminGuildSummary(client: ServiceClient, row: GuildRow): Promise<AdminGuildSummary> {
  const guild = await mapGuildSummary(client, row);
  const owner = await readOwner(client, row.id);
  return {
    ...guild,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    ownerProfileId: owner?.id ?? null,
    ownerNickname: owner?.nickname ?? null,
  };
}

async function readGuild(client: ServiceClient, guildId: string): Promise<GuildRow | null> {
  const { data, error } = await client
    .from('guilds')
    .select('id,name,tagline,server,logo_path,header_background_path,accent_color,max_members,status,created_by,created_at,updated_at')
    .eq('id', guildId)
    .maybeSingle();

  if (error || !data) return null;
  return data as GuildRow;
}

async function readInviteByHash(client: ServiceClient, codeHash: string): Promise<GuildInviteRow | null> {
  const { data, error } = await client
    .from('guild_invite_codes')
    .select(
      'id,guild_id,invite_role,expires_at,revoked_at,max_uses,use_count,created_at,updated_at,guild:guilds!guild_invite_codes_guild_id_fkey(id,name,tagline,server,logo_path,header_background_path,accent_color,max_members,status,created_by,created_at,updated_at)',
    )
    .eq('code_hash', codeHash)
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !data) return null;
  return data as GuildInviteRow;
}

function newInviteCode(): string {
  const values = new Uint16Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= 60000);
  return (values[0] % 10000).toString().padStart(4, '0');
}

function inviteLink(code: string): string {
  return `${INVITE_LINK_BASE}${encodeURIComponent(code)}`;
}

function parseAccentColor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  const color = value.trim();
  if (!GUILD_ACCENT_COLOR.test(color)) return undefined;
  return color;
}

function parseGuildCreateInput(raw: unknown):
  | { ok: true; value: { name: string; tagline: string; maxMembers: number; accentColor: string; logoPath: string | null; headerBackgroundPath: string | null } }
  | { ok: false; message: string } {
  if (!isObject(raw)) return { ok: false, message: '길드 정보를 확인해주세요.' };
  const name = cleanString(raw.name, 30, true);
  if (!name) return { ok: false, message: '길드명은 1~30자로 입력해주세요.' };
  const tagline = cleanString(raw.tagline, 100, true);
  if (!tagline) return { ok: false, message: '길드 소개는 1~100자로 입력해주세요.' };
  const accentColor = raw.accentColor === undefined ? '#8b5cf6' : parseAccentColor(raw.accentColor);
  if (!accentColor) return { ok: false, message: '강조색은 #RRGGBB 형식으로 입력해주세요.' };
  const maxMembers = raw.maxMembers === undefined ? 100 : Number(raw.maxMembers);
  if (!Number.isInteger(maxMembers) || maxMembers < 1 || maxMembers > 999) {
    return { ok: false, message: '최대 인원은 1~999명으로 입력해주세요.' };
  }
  const logoPath = cleanString(raw.logoPath, 500, false);
  const headerBackgroundPath = cleanString(raw.headerBackgroundPath, 500, false);
  if ((raw.logoPath !== undefined && raw.logoPath !== null && logoPath === undefined)
    || (raw.headerBackgroundPath !== undefined && raw.headerBackgroundPath !== null && headerBackgroundPath === undefined)) {
    return { ok: false, message: '길드 이미지 경로를 확인해주세요.' };
  }
  return {
    ok: true,
    value: {
      name,
      tagline,
      maxMembers,
      accentColor,
      logoPath: logoPath ?? null,
      headerBackgroundPath: headerBackgroundPath ?? null,
    },
  };
}

function parseGuildPatchInput(raw: unknown):
  | { ok: true; value: { status: GuildStatus } }
  | { ok: false; message: string } {
  if (!isObject(raw)) return { ok: false, message: '길드 상태를 확인해주세요.' };
  if (raw.status !== 'active' && raw.status !== 'inactive') {
    return { ok: false, message: '길드 상태가 올바르지 않습니다.' };
  }
  return { ok: true, value: { status: raw.status } };
}

function parseOwnerTransferInput(raw: unknown):
  | { ok: true; value: { ownerProfileId: string } }
  | { ok: false; message: string } {
  if (!isObject(raw)) return { ok: false, message: '새 길드장을 확인해주세요.' };
  const ownerProfileId = typeof raw.ownerProfileId === 'string' ? raw.ownerProfileId.trim() : '';
  if (!ownerProfileId) return { ok: false, message: '새 길드장을 선택해주세요.' };
  return { ok: true, value: { ownerProfileId } };
}

function parseInviteInput(raw: unknown):
  | { ok: true; value: { guildId: string | null; inviteRole: GuildInviteRole; expiresAt: string | null; maxUses: number | null } }
  | { ok: false; message: string } {
  if (!isObject(raw)) return { ok: false, message: '초대 설정을 확인해주세요.' };
  if (raw.inviteRole !== 'member' && raw.inviteRole !== 'admin' && raw.inviteRole !== 'owner') {
    return { ok: false, message: '초대코드 종류를 확인해주세요.' };
  }
  let guildId: string | null = null;
  if (raw.guildId !== undefined && raw.guildId !== null) {
    if (typeof raw.guildId !== 'string' || !raw.guildId.trim()) {
      return { ok: false, message: '대상 길드를 확인해주세요.' };
    }
    guildId = raw.guildId.trim();
  }
  let expiresAt: string | null = null;
  if (isObject(raw) && raw.expiresAt !== undefined && raw.expiresAt !== null) {
    if (typeof raw.expiresAt !== 'string') return { ok: false, message: '만료 시각이 올바르지 않습니다.' };
    const date = new Date(raw.expiresAt);
    if (Number.isNaN(date.getTime())) return { ok: false, message: '만료 시각이 올바르지 않습니다.' };
    expiresAt = date.toISOString();
  }
  let maxUses: number | null = null;
  if (isObject(raw) && raw.maxUses !== undefined && raw.maxUses !== null && raw.maxUses !== '') {
    maxUses = Number(raw.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 1) return { ok: false, message: '사용 가능 횟수는 1회 이상이어야 합니다.' };
  }
  return { ok: true, value: { guildId, inviteRole: raw.inviteRole, expiresAt, maxUses } };
}

function parseConfirmationInput(raw: unknown):
  | { ok: true; value: { confirmationName: string } }
  | { ok: false; message: string } {
  if (!isObject(raw)) return { ok: false, message: '확인할 길드명을 입력해주세요.' };
  const confirmationName = cleanString(raw.confirmationName, 30, true);
  if (!confirmationName) return { ok: false, message: '확인할 길드명을 입력해주세요.' };
  return { ok: true, value: { confirmationName } };
}

function parseInviteCodeInput(raw: unknown):
  | { ok: true; value: { code: string } }
  | { ok: false; message: string } {
  if (!isObject(raw)) return { ok: false, message: '초대코드를 확인해주세요.' };
  const code = typeof raw.code === 'string' ? raw.code.trim() : '';
  if (!code) return { ok: false, message: '초대코드를 입력해주세요.' };
  return { ok: true, value: { code } };
}

function parseRoleUpdateInput(raw: unknown):
  | { ok: true; value: Extract<GuildRole, 'admin' | 'member'> }
  | { ok: false; message: string } {
  if (!isObject(raw)) return { ok: false, message: '변경할 역할을 확인해주세요.' };
  if (raw.role !== 'admin' && raw.role !== 'member') {
    return { ok: false, message: '길드장은 별도 위임으로만 변경할 수 있습니다.' };
  }
  return { ok: true, value: raw.role };
}

export function authorizeGuildCreate(context: AccountContext): AuthorizationResult {
  return context.isSuperAdmin
    ? { ok: true }
    : { ok: false, status: 403, code: 'FORBIDDEN', message: '최고 관리자만 길드를 생성할 수 있습니다.' };
}

export function authorizeGuildOwnerTransfer(context: AccountContext): AuthorizationResult {
  return context.isSuperAdmin || context.membership?.role === 'owner'
    ? { ok: true }
    : { ok: false, status: 403, code: 'FORBIDDEN', message: '길드장 위임 권한이 없습니다.' };
}

export function authorizeGuildRoleUpdate(
  context: AccountContext,
  role: Extract<GuildRole, 'admin' | 'member'>,
): AuthorizationResult {
  if (role !== 'admin' && role !== 'member') {
    return { ok: false, status: 400, code: 'INVALID_INPUT', message: '길드장은 별도 위임으로만 변경할 수 있습니다.' };
  }
  return context.membership?.role === 'owner'
    ? { ok: true }
    : { ok: false, status: 403, code: 'FORBIDDEN', message: '길드장만 관리자 역할을 변경할 수 있습니다.' };
}

export function authorizeGuildJoin(context: AccountContext): AuthorizationResult {
  return context.membership
    ? { ok: false, status: 409, code: 'ALREADY_IN_GUILD', message: '이미 다른 길드에 가입되어 있습니다.' }
    : { ok: true };
}

export function authorizeGuildLeave(context: AccountContext): AuthorizationResult {
  if (!context.membership) {
    return { ok: false, status: 409, code: 'NOT_IN_GUILD', message: '가입한 길드가 없습니다.' };
  }
  if (context.membership.role === 'owner') {
    return { ok: false, status: 409, code: 'OWNER_TRANSFER_REQUIRED', message: '길드장은 먼저 길드장을 위임해야 탈퇴할 수 있습니다.' };
  }
  return { ok: true };
}

function canManageInvites(context: AccountContext): AuthorizationResult {
  if (context.membership?.role === 'owner' || context.membership?.role === 'admin') return { ok: true };
  return { ok: false, status: 403, code: 'FORBIDDEN', message: '초대코드를 관리할 권한이 없습니다.' };
}

function rpcFailure(status: string | undefined, fallbackMessage: string) {
  switch (status) {
    case 'forbidden':
      return failure(403, 'FORBIDDEN', '현재 권한으로 요청을 처리할 수 없습니다.');
    case 'not_found':
      return failure(404, 'NOT_FOUND', '대상을 찾을 수 없습니다.');
    case 'owner_not_found':
      return failure(404, 'NOT_FOUND', '최초 길드장을 찾을 수 없습니다.');
    case 'target_not_member':
      return failure(404, 'NOT_FOUND', '대상 길드원을 찾을 수 없습니다.');
    case 'owner_already_in_guild':
      return failure(409, 'ALREADY_IN_GUILD', '선택한 길드장은 이미 다른 길드에 가입되어 있습니다.');
    case 'already_in_guild':
      return failure(409, 'ALREADY_IN_GUILD', '이미 다른 길드에 가입되어 있습니다.');
    case 'guild_full':
      return failure(409, 'GUILD_FULL', '길드 인원이 가득 찼습니다.');
    case 'invite_invalid':
    case 'invite_admin_not_allowed':
      return failure(404, 'INVALID_INVITE_CODE', '초대코드를 찾을 수 없습니다.');
    case 'invite_expired':
      return failure(409, 'INVITE_EXPIRED', '초대코드가 만료되었습니다.');
    case 'invite_revoked':
      return failure(409, 'INVITE_REVOKED', '초대코드가 중지되었습니다.');
    case 'invite_exhausted':
      return failure(409, 'INVITE_EXHAUSTED', '초대코드 사용 횟수를 모두 사용했습니다.');
    case 'guild_inactive':
      return failure(409, 'GUILD_INACTIVE', '비활성화된 길드입니다.');
    case 'guild_active':
      return failure(409, 'GUILD_ACTIVE', '활성 길드에서는 이 작업을 할 수 없습니다.');
    case 'owner_already_assigned':
      return failure(409, 'OWNER_ALREADY_ASSIGNED', '이미 길드장이 지정된 길드입니다.');
    case 'owner_claim_required':
      return failure(409, 'OWNER_CLAIM_REQUIRED', '복구하려면 먼저 새 길드장 초대코드를 발급해주세요.');
    case 'name_mismatch':
      return failure(409, 'GUILD_NAME_MISMATCH', '입력한 길드명이 일치하지 않습니다.');
    case 'name_taken':
      return failure(409, 'GUILD_NAME_TAKEN', '이미 사용 중인 길드명입니다.');
    case 'owner_transfer_required':
      return failure(409, 'OWNER_TRANSFER_REQUIRED', '길드장은 먼저 길드장을 위임해야 합니다.');
    case 'not_in_guild':
      return failure(409, 'NOT_IN_GUILD', '가입한 길드가 없습니다.');
    case 'use_owner_transfer':
      return failure(400, 'INVALID_INPUT', '길드장 위임은 별도 기능으로만 변경할 수 있습니다.');
    default:
      return failure(500, 'SERVER_ERROR', fallbackMessage);
  }
}

async function issueGuildInvite(
  client: ServiceClient,
  context: AccountContext,
  guildId: string,
  inviteRole: GuildInviteRole,
  expiresAt: string | null = null,
  maxUses: number | null = null,
): Promise<HandlerResult<GuildInviteDto>> {
  if (inviteRole === 'owner' && !context.isSuperAdmin) {
    return failure(403, 'FORBIDDEN', '최고관리자만 최초 길드장 코드를 만들 수 있습니다.');
  }

  for (let attempt = 0; attempt < INVITE_GENERATION_ATTEMPTS; attempt += 1) {
    const code = newInviteCode();
    const codeHash = await hashGuildInviteCode(code);
    if (!codeHash) return failure(500, 'SERVER_CONFIG', 'GUILD_INVITE_HASH_SECRET 설정이 필요합니다.');

    const rpc = inviteRole === 'owner' ? 'create_owner_guild_invite_atomic' : 'create_guild_invite_atomic';
    const args = inviteRole === 'owner'
      ? {
        p_actor_profile_id: context.profileId,
        p_guild_id: guildId,
        p_code_hash: codeHash,
        p_expires_at: expiresAt,
      }
      : {
        p_actor_profile_id: context.profileId,
        p_guild_id: guildId,
        p_code_hash: codeHash,
        p_invite_role: inviteRole,
        p_expires_at: expiresAt,
        p_max_uses: maxUses,
      };
    const { data, error } = await client.rpc(rpc, args);
    if (error) return failure(500, 'SERVER_ERROR', '초대코드를 생성하지 못했습니다.');
    const payload = rpcPayload(data);
    if (payload.status === 'hash_conflict') continue;
    if (payload.status !== 'created'
      || typeof payload.id !== 'string'
      || typeof payload.guild_id !== 'string'
      || typeof payload.created_at !== 'string') {
      return rpcFailure(payload.status, '초대코드를 생성하지 못했습니다.');
    }
    return success({
      id: payload.id,
      guildId: payload.guild_id,
      inviteRole,
      code,
      link: inviteLink(code),
      expiresAt: typeof payload.expires_at === 'string' ? payload.expires_at : null,
      maxUses: typeof payload.max_uses === 'number' ? payload.max_uses : null,
      useCount: Number(payload.use_count ?? 0),
      revokedAt: typeof payload.revoked_at === 'string' ? payload.revoked_at : null,
      createdAt: payload.created_at,
    }, 201);
  }
  return failure(503, 'INVITE_CODE_SPACE_EXHAUSTED', '사용 가능한 초대코드를 찾지 못했습니다. 다시 시도해주세요.');
}

export async function handleListAdminGuilds(
  req: Request,
  client: ServiceClient,
): Promise<HandlerResult<AdminGuildSummary[]>> {
  const context = await requireAccount(req, client);
  if (!context) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const access = authorizeGuildCreate(context);
  if (!access.ok) return failure(access.status, access.code, access.message);

  const { data, error } = await client
    .from('guilds')
    .select('id,name,tagline,server,logo_path,header_background_path,accent_color,max_members,status,created_by,created_at,updated_at')
    .order('created_at', { ascending: true });

  if (error) return failure(500, 'SERVER_ERROR', '길드 목록을 불러오지 못했습니다.');
  return success(await Promise.all(((data ?? []) as GuildRow[]).map((row) => mapAdminGuildSummary(client, row))));
}

export async function handleCreateAdminGuild(
  req: Request,
  client: ServiceClient,
): Promise<HandlerResult<AdminGuildCreateResult>> {
  const context = await requireAccount(req, client);
  if (!context) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const access = authorizeGuildCreate(context);
  if (!access.ok) return failure(access.status, access.code, access.message);

  const parsed = parseGuildCreateInput(await readJson(req));
  if (!parsed.ok) return failure(400, 'INVALID_INPUT', parsed.message);

  const { data, error } = await client.rpc('create_unclaimed_guild_atomic', {
    p_actor_profile_id: context.profileId,
    p_name: parsed.value.name,
    p_tagline: parsed.value.tagline,
    p_logo_path: parsed.value.logoPath,
    p_header_background_path: parsed.value.headerBackgroundPath,
    p_accent_color: parsed.value.accentColor,
    p_max_members: parsed.value.maxMembers,
  });

  if (error) return failure(500, 'SERVER_ERROR', '길드를 생성하지 못했습니다.');
  const payload = rpcPayload(data);
  if (payload.status !== 'created' || typeof payload.guild_id !== 'string') {
    return rpcFailure(payload.status, '길드를 생성하지 못했습니다.');
  }
  const guild = await readGuild(client, payload.guild_id);
  if (!guild) return failure(500, 'SERVER_ERROR', '생성한 길드를 확인하지 못했습니다.');
  const ownerInviteResult = await issueGuildInvite(client, context, guild.id, 'owner');
  return success({
    guild: await mapAdminGuildSummary(client, guild),
    ownerInvite: ownerInviteResult.ok ? ownerInviteResult.data : null,
  }, 201);
}

export async function handleUpdateAdminGuild(
  req: Request,
  client: ServiceClient,
  guildId: string,
): Promise<HandlerResult<AdminGuildSummary>> {
  const context = await requireAccount(req, client);
  if (!context) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const access = authorizeGuildCreate(context);
  if (!access.ok) return failure(access.status, access.code, access.message);

  const parsed = parseGuildPatchInput(await readJson(req));
  if (!parsed.ok) return failure(400, 'INVALID_INPUT', parsed.message);

  const { data, error } = await client.rpc('set_guild_status_atomic', {
    p_actor_profile_id: context.profileId,
    p_guild_id: guildId,
    p_status: parsed.value.status,
  });

  if (error) return failure(500, 'SERVER_ERROR', '길드 상태를 변경하지 못했습니다.');
  const payload = rpcPayload(data);
  if (payload.status !== 'updated') {
    return rpcFailure(payload.status, '길드 상태를 변경하지 못했습니다.');
  }
  const guild = await readGuild(client, guildId);
  if (!guild) return failure(404, 'NOT_FOUND', '길드를 찾을 수 없습니다.');
  return success(await mapAdminGuildSummary(client, guild));
}

async function requireSuperAdminContext(req: Request, client: ServiceClient) {
  const context = await requireAccount(req, client);
  if (!context) return { context: null, error: failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.') };
  if (!context.isSuperAdmin) return { context: null, error: failure(403, 'FORBIDDEN', '최고관리자만 길드를 관리할 수 있습니다.') };
  return { context, error: null };
}

export async function handleDeactivateAdminGuild(
  req: Request,
  client: ServiceClient,
  guildId: string,
): Promise<HandlerResult<AdminGuildSummary>> {
  const account = await requireSuperAdminContext(req, client);
  if (!account.context) return account.error as HandlerResult<AdminGuildSummary>;
  const parsed = parseConfirmationInput(await readJson(req));
  if (!parsed.ok) return failure(400, 'INVALID_INPUT', parsed.message);
  const { data, error } = await client.rpc('deactivate_guild_atomic', {
    p_actor_profile_id: account.context.profileId,
    p_guild_id: guildId,
    p_confirmation_name: parsed.value.confirmationName,
  });
  if (error) return failure(500, 'SERVER_ERROR', '길드를 비활성화하지 못했습니다.');
  const payload = rpcPayload(data);
  if (payload.status !== 'deactivated') return rpcFailure(payload.status, '길드를 비활성화하지 못했습니다.');
  const guild = await readGuild(client, guildId);
  if (!guild) return failure(404, 'NOT_FOUND', '길드를 찾을 수 없습니다.');
  return success(await mapAdminGuildSummary(client, guild));
}

export async function handleRestoreAdminGuild(
  req: Request,
  client: ServiceClient,
  guildId: string,
): Promise<HandlerResult<AdminGuildSummary>> {
  const account = await requireSuperAdminContext(req, client);
  if (!account.context) return account.error as HandlerResult<AdminGuildSummary>;
  const { data, error } = await client.rpc('restore_guild_atomic', {
    p_actor_profile_id: account.context.profileId,
    p_guild_id: guildId,
  });
  if (error) return failure(500, 'SERVER_ERROR', '길드를 복구하지 못했습니다.');
  const payload = rpcPayload(data);
  if (payload.status !== 'restored') return rpcFailure(payload.status, '길드를 복구하지 못했습니다.');
  const guild = await readGuild(client, guildId);
  if (!guild) return failure(404, 'NOT_FOUND', '길드를 찾을 수 없습니다.');
  return success(await mapAdminGuildSummary(client, guild));
}

export async function handlePermanentlyDeleteAdminGuild(
  req: Request,
  client: ServiceClient,
  guildId: string,
): Promise<HandlerResult<{ deleted: true; guildId: string; counts: Record<string, number> }>> {
  const account = await requireSuperAdminContext(req, client);
  if (!account.context) return account.error as HandlerResult<{ deleted: true; guildId: string; counts: Record<string, number> }>;
  const parsed = parseConfirmationInput(await readJson(req));
  if (!parsed.ok) return failure(400, 'INVALID_INPUT', parsed.message);
  const { data, error } = await client.rpc('permanently_delete_guild_atomic', {
    p_actor_profile_id: account.context.profileId,
    p_guild_id: guildId,
    p_confirmation_name: parsed.value.confirmationName,
  });
  if (error) return failure(500, 'SERVER_ERROR', '길드를 영구 삭제하지 못했습니다.');
  const payload = rpcPayload(data);
  if (payload.status !== 'deleted') return rpcFailure(payload.status, '길드를 영구 삭제하지 못했습니다.');
  const counts = isObject(payload.counts)
    ? Object.fromEntries(Object.entries(payload.counts).map(([key, value]) => [key, Number(value)]))
    : {};
  return success({ deleted: true, guildId, counts });
}

export async function handleTransferGuildOwner(
  req: Request,
  client: ServiceClient,
  guildId: string,
): Promise<HandlerResult<AdminGuildSummary>> {
  const context = await requireAccount(req, client);
  if (!context) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const access = authorizeGuildOwnerTransfer(context);
  if (!access.ok) return failure(access.status, access.code, access.message);
  if (!context.isSuperAdmin && context.membership?.guildId !== guildId) {
    return failure(403, 'FORBIDDEN', '다른 길드의 길드장은 변경할 수 없습니다.');
  }

  const parsed = parseOwnerTransferInput(await readJson(req));
  if (!parsed.ok) return failure(400, 'INVALID_INPUT', parsed.message);

  const { data, error } = await client.rpc('transfer_guild_owner_atomic', {
    p_actor_profile_id: context.profileId,
    p_guild_id: guildId,
    p_new_owner_profile_id: parsed.value.ownerProfileId,
  });

  if (error) return failure(500, 'SERVER_ERROR', '길드장을 변경하지 못했습니다.');
  const payload = rpcPayload(data);
  if (payload.status !== 'transferred' && payload.status !== 'no_change') {
    return rpcFailure(payload.status, '길드장을 변경하지 못했습니다.');
  }
  const guild = await readGuild(client, guildId);
  if (!guild) return failure(404, 'NOT_FOUND', '길드를 찾을 수 없습니다.');
  return success(await mapAdminGuildSummary(client, guild));
}

export async function handleCreateGuildInvite(
  req: Request,
  client: ServiceClient,
): Promise<HandlerResult<GuildInviteDto>> {
  const context = await requireAccount(req, client);
  if (!context) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const parsed = parseInviteInput(await readJson(req));
  if (!parsed.ok) return failure(400, 'INVALID_INPUT', parsed.message);

  let guildId: string | null = parsed.value.guildId;
  if (parsed.value.inviteRole === 'owner' && !context.isSuperAdmin) {
    return failure(403, 'FORBIDDEN', '최고관리자만 최초 길드장 코드를 만들 수 있습니다.');
  }
  if (guildId) {
    if (!context.isSuperAdmin) {
      const access = canManageInvites(context);
      if (!access.ok) return failure(access.status, access.code, access.message);
      if (context.membership?.guildId !== parsed.value.guildId) {
        return failure(403, 'FORBIDDEN', '다른 길드의 초대코드는 만들 수 없습니다.');
      }
    }
  } else {
    const access = canManageInvites(context);
    if (!access.ok) return failure(access.status, access.code, access.message);
    guildId = context.membership?.guildId ?? null;
  }
  if (!guildId) return failure(403, 'FORBIDDEN', '길드 초대 권한이 없습니다.');
  return issueGuildInvite(
    client,
    context,
    guildId,
    parsed.value.inviteRole,
    parsed.value.expiresAt,
    parsed.value.inviteRole === 'owner' ? 1 : parsed.value.maxUses,
  );
}

export async function handleIssueOwnerGuildInvite(
  req: Request,
  client: ServiceClient,
  guildId: string,
): Promise<HandlerResult<GuildInviteDto>> {
  const context = await requireAccount(req, client);
  if (!context) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  if (!context.isSuperAdmin) return failure(403, 'FORBIDDEN', '최고관리자만 최초 길드장 코드를 만들 수 있습니다.');
  return issueGuildInvite(client, context, guildId, 'owner');
}

export async function handleDeleteGuildInvite(
  req: Request,
  client: ServiceClient,
  inviteId: string,
): Promise<HandlerResult<{ deleted: true; inviteId: string }>> {
  const context = await requireAccount(req, client);
  if (!context) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const access = canManageInvites(context);
  if (!access.ok) return failure(access.status, access.code, access.message);
  const guildId = context.membership?.guildId;
  if (!guildId) return failure(403, 'FORBIDDEN', '길드 초대 권한이 없습니다.');

  const { data, error } = await client.rpc('revoke_guild_invite_atomic', {
    p_actor_profile_id: context.profileId,
    p_guild_id: guildId,
    p_invite_id: inviteId,
  });
  if (error) return failure(500, 'SERVER_ERROR', '초대코드를 중지하지 못했습니다.');
  const payload = rpcPayload(data);
  if (payload.status !== 'revoked') return rpcFailure(payload.status, '초대코드를 중지하지 못했습니다.');
  return success({ deleted: true, inviteId });
}

export async function handlePreviewGuildInvite(
  req: Request,
  client: ServiceClient,
): Promise<HandlerResult<InvitePreview>> {
  const context = await requireAccount(req, client);
  if (!context) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const parsed = parseInviteCodeInput(await readJson(req));
  if (!parsed.ok) return failure(400, 'INVALID_INPUT', parsed.message);
  const codeHash = await hashGuildInviteCode(parsed.value.code);
  if (!codeHash) return failure(500, 'SERVER_CONFIG', 'GUILD_INVITE_HASH_SECRET 설정이 필요합니다.');

  const invite = await readInviteByHash(client, codeHash);
  if (!invite || (invite.invite_role !== 'member' && invite.invite_role !== 'owner')) {
    return failure(404, 'INVALID_INVITE_CODE', '초대코드를 찾을 수 없습니다.');
  }
  if (invite.revoked_at) return failure(409, 'INVITE_REVOKED', '초대코드가 중지되었습니다.');
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
    return failure(409, 'INVITE_EXPIRED', '초대코드가 만료되었습니다.');
  }
  if (invite.max_uses !== null && Number(invite.use_count) >= Number(invite.max_uses)) {
    return failure(409, 'INVITE_EXHAUSTED', '초대코드 사용 횟수를 모두 사용했습니다.');
  }
  const guild = one(invite.guild);
  const validGuildState = invite.invite_role === 'owner'
    ? guild?.status === 'inactive'
    : guild?.status === 'active';
  if (!guild || !validGuildState) return failure(409, 'GUILD_INACTIVE', '현재 사용할 수 없는 길드입니다.');

  return success({
    guild: await mapGuildSummary(client, guild),
    expiresAt: invite.expires_at,
    inviteRole: invite.invite_role,
  });
}

export async function handleJoinGuild(
  req: Request,
  client: ServiceClient,
): Promise<HandlerResult<CurrentAccountData>> {
  const context = await requireAccount(req, client);
  if (!context) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const access = authorizeGuildJoin(context);
  if (!access.ok) return failure(access.status, access.code, access.message);

  const parsed = parseInviteCodeInput(await readJson(req));
  if (!parsed.ok) return failure(400, 'INVALID_INPUT', parsed.message);
  const codeHash = await hashGuildInviteCode(parsed.value.code);
  if (!codeHash) return failure(500, 'SERVER_CONFIG', 'GUILD_INVITE_HASH_SECRET 설정이 필요합니다.');

  const { data, error } = await client.rpc('join_guild_via_invite_atomic', {
    p_profile_id: context.profileId,
    p_code_hash: codeHash,
  });

  if (error) return failure(500, 'SERVER_ERROR', '길드에 가입하지 못했습니다.');
  const payload = rpcPayload(data);
  if (payload.status !== 'joined' && payload.status !== 'claimed') {
    return rpcFailure(payload.status, '길드에 가입하지 못했습니다.');
  }

  const account = await loadCurrentAccount(client, context.profileId);
  if (!account) return failure(500, 'SERVER_ERROR', '가입한 길드 정보를 확인하지 못했습니다.');
  return success(account);
}

export async function handleLeaveGuild(
  req: Request,
  client: ServiceClient,
): Promise<HandlerResult<CurrentAccountData>> {
  const context = await requireAccount(req, client);
  if (!context) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const access = authorizeGuildLeave(context);
  if (!access.ok) return failure(access.status, access.code, access.message);

  const { data, error } = await client.rpc('leave_guild_atomic', {
    p_profile_id: context.profileId,
  });

  if (error) return failure(500, 'SERVER_ERROR', '길드를 탈퇴하지 못했습니다.');
  const payload = rpcPayload(data);
  if (payload.status !== 'left') return rpcFailure(payload.status, '길드를 탈퇴하지 못했습니다.');

  const account = await loadCurrentAccount(client, context.profileId);
  if (!account) return failure(500, 'SERVER_ERROR', '탈퇴 후 계정 정보를 확인하지 못했습니다.');
  return success(account);
}

export async function handleUpdateGuildMemberRole(
  req: Request,
  client: ServiceClient,
  profileId: string,
): Promise<HandlerResult<GuildMemberRoleChange>> {
  const context = await requireAccount(req, client);
  if (!context) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const parsed = parseRoleUpdateInput(await readJson(req));
  if (!parsed.ok) return failure(400, 'INVALID_INPUT', parsed.message);
  const access = authorizeGuildRoleUpdate(context, parsed.value);
  if (!access.ok) return failure(access.status, access.code, access.message);
  const guildId = context.membership?.guildId;
  if (!guildId) return failure(403, 'FORBIDDEN', '길드 권한이 없습니다.');

  const { data, error } = await client.rpc('set_guild_member_role_atomic', {
    p_actor_profile_id: context.profileId,
    p_guild_id: guildId,
    p_target_profile_id: profileId,
    p_role: parsed.value,
  });

  if (error) return failure(500, 'SERVER_ERROR', '길드 역할을 변경하지 못했습니다.');
  const payload = rpcPayload(data);
  if (payload.status !== 'updated' && payload.status !== 'no_change') {
    return rpcFailure(payload.status, '길드 역할을 변경하지 못했습니다.');
  }
  return success({
    guildId,
    profileId,
    role: parsed.value,
  });
}
