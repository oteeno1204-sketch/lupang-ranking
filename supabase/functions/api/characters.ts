import { powerDelta } from './rules.ts';
import { cleanString, isObject, readJson, sessionOrFailure, signedReadUrl } from './serverHelpers.ts';
import { failure, success, type HandlerFailure, type HandlerResult, type ServiceClient } from './types.ts';
import { officialRecordRow } from './officialStatsRules.ts';
import { AccountAccessError, requireAccount, requireGuildRole, type AccountContext } from './membership.ts';
import { parseGrowthMetric, rankOfficialCharacters, type OfficialRankingCandidate } from './powerGrowthRules.ts';

const AIRA_SERVER = '아이라';

type PowerRow = {
  id: string; power: number | string; note: string | null; recorded_at: string; created_at: string;
  combat_power?: number | string | null; life_power?: number | string | null; charm_power?: number | string | null;
  total_power?: number | string | null; source?: 'manual' | 'official'; stat_date?: string | null; source_checked_at?: string | null;
};
type CharacterRow = {
  id: string; profile_id: string; name: string; job: string; level: number; avatar_path: string | null;
  is_primary: boolean; game_server?: string | null; official_sync_enabled?: boolean;
  official_last_synced_at?: string | null; official_last_error?: string | null;
  created_at: string; updated_at: string; power_records?: PowerRow[] | null;
};

export type PowerRecordDto = {
  id: string; power: number; combatPower: number | null; lifePower: number | null; charmPower: number | null; totalPower: number | null;
  source: 'manual' | 'official'; statDate: string | null; sourceCheckedAt: string | null;
  note: string | null; recordedAt: string; createdAt: string;
};
export type CharacterDto = {
  id: string; profileId: string; name: string; job: string; level: number; avatarUrl: string | null;
  isPrimary: boolean; gameServer: string | null; officialSyncEnabled: boolean; officialLastSyncedAt: string | null; officialLastError: string | null;
  latestPower: number | null; latestPowerAt: string | null; powerDelta: number | null;
  latestCombatPower: number | null; latestLifePower: number | null; latestCharmPower: number | null; latestTotalPower: number | null;
  createdAt: string; updatedAt: string;
};
export type PowerRankingDto = {
  rank:number; profileId:string; nickname:string; characterId:string; characterName:string; job:string;
  power:number; recordedAt:string; sourceCheckedAt:string; guildId:string; guildName:string; scope:'guild'|'alliance';
};
export type GuildOfficialSyncTargetDto = {
  characterId:string; characterName:string; profileId:string; nickname:string; avatarUrl:string|null;
};

const powerColumns = 'id,power,combat_power,life_power,charm_power,total_power,source,stat_date,source_checked_at,note,recorded_at,created_at';
const selectCharacter = `id,profile_id,name,job,level,avatar_path,is_primary,game_server,official_sync_enabled,official_last_synced_at,official_last_error,created_at,updated_at,power_records(${powerColumns})`;

function sortedPowers(rows: PowerRow[] | null | undefined): PowerRow[] {
  return [...(rows ?? [])].sort((a, b) => {
    const byRecorded = new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime();
    return byRecorded || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
function numeric(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
function combatOf(row: PowerRow): number {
  return numeric(row.combat_power) ?? Number(row.power);
}
function mapPower(row: PowerRow): PowerRecordDto {
  return {
    id: row.id,
    power: Number(row.power),
    combatPower: numeric(row.combat_power) ?? Number(row.power),
    lifePower: numeric(row.life_power), charmPower: numeric(row.charm_power), totalPower: numeric(row.total_power),
    source: row.source === 'official' ? 'official' : 'manual', statDate: row.stat_date ?? null, sourceCheckedAt: row.source_checked_at ?? null,
    note: row.note, recordedAt: row.recorded_at, createdAt: row.created_at,
  };
}

async function mapCharacter(client: ServiceClient, row: CharacterRow): Promise<CharacterDto> {
  const powers = sortedPowers(row.power_records);
  const latest = powers[0];
  const latestOfficial = powers.find((record) => record.source === 'official' && record.total_power !== null && record.total_power !== undefined);
  const latestTwo = powers.slice(0, 2).map((item) => ({ power: combatOf(item) }));
  return {
    id: row.id, profileId: row.profile_id, name: row.name, job: row.job, level: Number(row.level),
    avatarUrl: await signedReadUrl(client, 'profiles', row.avatar_path), isPrimary: row.is_primary,
    gameServer: row.game_server ?? null, officialSyncEnabled: row.official_sync_enabled ?? true,
    officialLastSyncedAt: row.official_last_synced_at ?? null, officialLastError: row.official_last_error ?? null,
    latestPower: latest ? combatOf(latest) : null, latestPowerAt: latest?.recorded_at ?? null,
    powerDelta: powerDelta(latestTwo),
    latestCombatPower: latestOfficial ? combatOf(latestOfficial) : latest ? combatOf(latest) : null,
    latestLifePower: latestOfficial ? numeric(latestOfficial.life_power) : null,
    latestCharmPower: latestOfficial ? numeric(latestOfficial.charm_power) : null,
    latestTotalPower: latestOfficial ? numeric(latestOfficial.total_power) : null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function getCharacterRow(client: ServiceClient, id: string): Promise<CharacterRow | null> {
  const { data, error } = await client.from('characters').select(selectCharacter).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data as unknown as CharacterRow;
}
async function characterManageFailure(client: ServiceClient, account: AccountContext, ownerId: string): Promise<HandlerFailure | null> {
  if (account.profileId === ownerId) return null;
  let guildId: string;
  try { guildId = requireGuildRole(account, ['owner','admin']); }
  catch (error) { if (error instanceof AccountAccessError) return failure(error.status, error.code, error.message); throw error; }
  const { data } = await client.from('guild_members').select('profile_id').eq('guild_id', guildId).eq('profile_id', ownerId).eq('status', 'active').is('left_at', null).maybeSingle();
  return data ? null : failure(404, 'NOT_FOUND', '캐릭터를 찾을 수 없습니다.');
}

type ParsedCharacterInput = {
  name: string; avatarPath: string | null | undefined; profileId?: string; officialSyncEnabled: boolean;
};
function parseCharacterInput(value: unknown): { ok: true; value: ParsedCharacterInput } | { ok: false; message: string } {
  if (!isObject(value)) return { ok: false, message: '캐릭터 정보를 확인해주세요.' };
  const name = cleanString(value.name, 30, true);
  if (!name) return { ok: false, message: '캐릭터명을 입력해주세요.' };
  let avatarPath: string | null | undefined;
  if ('avatarPath' in value) {
    if (value.avatarPath !== null && typeof value.avatarPath !== 'string') return { ok: false, message: '캐릭터 이미지 정보가 올바르지 않습니다.' };
    avatarPath = value.avatarPath as string | null;
  }
  const profileId = typeof value.profileId === 'string' ? value.profileId : undefined;
  return { ok: true, value: { name, avatarPath, profileId, officialSyncEnabled: value.officialSyncEnabled !== false } };
}

export async function handleListMyCharacters(req: Request, client: ServiceClient): Promise<HandlerResult<CharacterDto[]>> {
  const auth = await sessionOrFailure(req, client); if (!auth.ok) return auth.failure;
  const { data, error } = await client.from('characters').select(selectCharacter).eq('profile_id', auth.profile.id).order('is_primary', { ascending: false }).order('created_at', { ascending: true });
  if (error) return failure(500, 'SERVER_ERROR', '캐릭터를 불러오지 못했습니다.');
  return success(await Promise.all(((data ?? []) as unknown as CharacterRow[]).map((row) => mapCharacter(client, row))));
}
export async function handleGetCharacter(req: Request, client: ServiceClient, id: string): Promise<HandlerResult<{ character: CharacterDto; powerRecords: PowerRecordDto[] }>> {
  const auth = await sessionOrFailure(req, client); if (!auth.ok) return auth.failure;
  const row = await getCharacterRow(client, id); if (!row) return failure(404, 'NOT_FOUND', '캐릭터를 찾을 수 없습니다.');
  return success({ character: await mapCharacter(client, row), powerRecords: sortedPowers(row.power_records).slice(0, 30).map(mapPower) });
}
export async function handleCreateCharacter(req: Request, client: ServiceClient): Promise<HandlerResult<CharacterDto>> {
  const account = await requireAccount(req, client); if (!account) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const parsed = parseCharacterInput(await readJson(req)); if (!parsed.ok) return failure(400, 'INVALID_INPUT', parsed.message);
  const targetProfileId = parsed.value.profileId ?? account.profileId;
  const denied = await characterManageFailure(client, account, targetProfileId); if (denied) return denied;
  if (parsed.value.avatarPath && !parsed.value.avatarPath.startsWith(`${targetProfileId}/`)) return failure(400, 'INVALID_INPUT', '캐릭터 이미지 경로가 올바르지 않습니다.');
  const { data: existing } = await client.from('characters').select('id').eq('profile_id', targetProfileId).limit(1);
  const { data, error } = await client.from('characters').insert({
    profile_id: targetProfileId, name: parsed.value.name, job: '조회중', level: 1,
    avatar_path: parsed.value.avatarPath ?? null, is_primary: !existing?.length,
    game_server: AIRA_SERVER, official_sync_enabled: parsed.value.officialSyncEnabled,
  }).select(selectCharacter).single();
  if (error || !data) return failure(500, 'SERVER_ERROR', '캐릭터를 등록하지 못했습니다.');
  return success(await mapCharacter(client, data as unknown as CharacterRow), 201);
}
export async function handleUpdateCharacter(req: Request, client: ServiceClient, id: string): Promise<HandlerResult<CharacterDto>> {
  const account = await requireAccount(req, client); if (!account) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const existing = await getCharacterRow(client, id); if (!existing) return failure(404, 'NOT_FOUND', '캐릭터를 찾을 수 없습니다.');
  const denied = await characterManageFailure(client, account, existing.profile_id); if (denied) return denied;
  const parsed = parseCharacterInput(await readJson(req)); if (!parsed.ok) return failure(400, 'INVALID_INPUT', parsed.message);
  if (parsed.value.avatarPath && !parsed.value.avatarPath.startsWith(`${existing.profile_id}/`)) return failure(400, 'INVALID_INPUT', '캐릭터 이미지 경로가 올바르지 않습니다.');
  const { data, error } = await client.from('characters').update({
    name: parsed.value.name,
    ...(parsed.value.name !== existing.name ? { job: '조회중', official_last_synced_at: null, official_last_error: null } : {}),
    game_server: AIRA_SERVER, official_sync_enabled: parsed.value.officialSyncEnabled,
    ...(parsed.value.avatarPath !== undefined ? { avatar_path: parsed.value.avatarPath } : {}), updated_at: new Date().toISOString(),
  }).eq('id', id).select(selectCharacter).maybeSingle();
  if (error) return failure(500, 'SERVER_ERROR', '캐릭터를 수정하지 못했습니다.');
  if (!data) return failure(404, 'NOT_FOUND', '캐릭터를 찾을 수 없습니다.');
  return success(await mapCharacter(client, data as unknown as CharacterRow));
}
export async function handleDeleteCharacter(req: Request, client: ServiceClient, id: string): Promise<HandlerResult<{ deleted: true }>> {
  const account = await requireAccount(req, client); if (!account) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const existing = await getCharacterRow(client, id); if (!existing) return failure(404, 'NOT_FOUND', '캐릭터를 찾을 수 없습니다.');
  const denied = await characterManageFailure(client, account, existing.profile_id); if (denied) return denied;
  const { error } = await client.from('characters').delete().eq('id', id); if (error) return failure(500, 'SERVER_ERROR', '캐릭터를 삭제하지 못했습니다.');
  if (existing.avatar_path) await client.storage.from('profiles').remove([existing.avatar_path]);
  return success({ deleted: true });
}
export async function handleSetPrimaryCharacter(req: Request, client: ServiceClient, id: string): Promise<HandlerResult<{ primaryId: string }>> {
  const account = await requireAccount(req, client); if (!account) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const existing = await getCharacterRow(client, id); if (!existing) return failure(404, 'NOT_FOUND', '캐릭터를 찾을 수 없습니다.');
  const denied = await characterManageFailure(client, account, existing.profile_id); if (denied) return denied;
  const { data, error } = await client.rpc('set_primary_character', { p_profile_id: existing.profile_id, p_character_id: id });
  if (error) return failure(500, 'SERVER_ERROR', '대표 캐릭터를 변경하지 못했습니다.');
  if (!data) return failure(404, 'NOT_FOUND', '캐릭터를 찾을 수 없습니다.');
  return success({ primaryId: id });
}
export async function handleListPowerRecords(req: Request, client: ServiceClient, id: string): Promise<HandlerResult<PowerRecordDto[]>> {
  const auth = await sessionOrFailure(req, client); if (!auth.ok) return auth.failure;
  const { data: character } = await client.from('characters').select('id').eq('id', id).maybeSingle(); if (!character) return failure(404, 'NOT_FOUND', '캐릭터를 찾을 수 없습니다.');
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.from('power_records').select(powerColumns).eq('character_id', id).gte('recorded_at', cutoff).order('recorded_at', { ascending: false }).limit(30);
  if (error) return failure(500, 'SERVER_ERROR', '투력 기록을 불러오지 못했습니다.');
  return success(((data ?? []) as unknown as PowerRow[]).map(mapPower));
}
export async function handleCreatePowerRecord(req: Request, client: ServiceClient, id: string): Promise<HandlerResult<PowerRecordDto>> {
  const account = await requireAccount(req, client); if (!account) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const existing = await getCharacterRow(client, id); if (!existing) return failure(404, 'NOT_FOUND', '캐릭터를 찾을 수 없습니다.');
  const denied = await characterManageFailure(client, account, existing.profile_id); if (denied) return denied;
  const body = await readJson(req); if (!isObject(body)) return failure(400, 'INVALID_INPUT', '투력 정보를 확인해주세요.');
  const power = Number(body.power); if (!Number.isSafeInteger(power) || power < 0) return failure(400, 'INVALID_INPUT', '투력은 0 이상의 숫자로 입력해주세요.');
  const note = cleanString(body.note, 300, false); if (body.note !== undefined && body.note !== null && note === undefined) return failure(400, 'INVALID_INPUT', '메모는 300자 이하로 입력해주세요.');
  const parsedDate = typeof body.recordedAt === 'string' ? new Date(body.recordedAt) : new Date(); if (Number.isNaN(parsedDate.getTime())) return failure(400, 'INVALID_INPUT', '기록 시간을 확인해주세요.');
  const { data, error } = await client.from('power_records').insert({ character_id: id, power, combat_power: power, source: 'manual', stat_date: null, note: note ?? null, recorded_at: parsedDate.toISOString() }).select(powerColumns).single();
  if (error || !data) return failure(500, 'SERVER_ERROR', '투력 기록을 저장하지 못했습니다.');
  return success(mapPower(data as unknown as PowerRow), 201);
}

export type BrowserOfficialStatsDto = { characterId:string; server:string; characterName:string; job:string; combatPower:number; lifePower:number; charmPower:number; totalPower:number; checkedAt:string; statDate:string };
function browserStat(value: unknown): number | null { const n=Number(value); return Number.isSafeInteger(n)&&n>=0?n:null; }
export async function handleOfficialBrowserResult(req:Request,client:ServiceClient,id:string):Promise<HandlerResult<BrowserOfficialStatsDto>>{
  const account=await requireAccount(req,client);if(!account)return failure(401,'UNAUTHORIZED','로그인이 필요합니다.');
  const existing=await getCharacterRow(client,id);if(!existing)return failure(404,'NOT_FOUND','캐릭터를 찾을 수 없습니다.');
  const denied=await characterManageFailure(client,account,existing.profile_id);if(denied)return denied;
  const raw=await readJson(req);if(!isObject(raw))return failure(400,'INVALID_INPUT','공식 랭킹 정보를 확인해주세요.');
  const server=raw.server===AIRA_SERVER?AIRA_SERVER:null;const characterName=typeof raw.characterName==='string'?raw.characterName.trim():'';const job=cleanString(raw.job,30,true);
  const combatPower=browserStat(raw.combatPower),lifePower=browserStat(raw.lifePower),charmPower=browserStat(raw.charmPower),totalPower=browserStat(raw.totalPower);
  if(!server||characterName!==existing.name||!job||combatPower===null||lifePower===null||charmPower===null||totalPower===null||combatPower+lifePower+charmPower!==totalPower)return failure(400,'INVALID_OFFICIAL_STATS','공식 랭킹 결과가 캐릭터 정보와 일치하지 않습니다.');
  const checkedAt=new Date().toISOString();const stats={server,characterName,job,combatPower,lifePower,charmPower,totalPower,checkedAt};const row=officialRecordRow(id,stats);
  const{error}=await client.from('power_records').upsert(row,{onConflict:'character_id,stat_date,source'});if(error)return failure(500,'SERVER_ERROR','공식 기록을 저장하지 못했습니다.');
  const{error:characterError}=await client.from('characters').update({job,game_server:AIRA_SERVER,official_last_synced_at:checkedAt,official_last_error:null,updated_at:checkedAt}).eq('id',id);if(characterError)return failure(500,'SERVER_ERROR','공식 캐릭터 정보를 저장하지 못했습니다.');
  return success({characterId:id,server,characterName,job,combatPower,lifePower,charmPower,totalPower,checkedAt,statDate:row.stat_date});
}

export async function handleListGuildOfficialSyncTargets(
  req: Request,
  client: ServiceClient,
): Promise<HandlerResult<GuildOfficialSyncTargetDto[]>> {
  const account = await requireAccount(req, client);
  if (!account) return failure(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  let guildId: string;
  try { guildId = requireGuildRole(account, ['owner','admin']); }
  catch (error) {
    if (error instanceof AccountAccessError) return failure(error.status, error.code, error.message);
    throw error;
  }
  const selection = 'profile_id,profile:profiles!guild_members_profile_id_fkey(id,nickname,is_active,characters(id,name,avatar_path,is_primary,official_sync_enabled))';
  const { data, error } = await client.from('guild_members').select(selection)
    .eq('guild_id', guildId).eq('status', 'active').is('left_at', null);
  if (error) return failure(500, 'SERVER_ERROR', '전체 갱신 대상을 불러오지 못했습니다.');
  type TargetCharacter = { id:string; name:string; avatar_path:string|null; is_primary:boolean; official_sync_enabled:boolean };
  type TargetProfile = { id:string; nickname:string; is_active:boolean; characters?:TargetCharacter[]|null };
  type TargetMembership = { profile_id:string; profile:TargetProfile|TargetProfile[]|null };
  const first = <T,>(value:T|T[]|null|undefined):T|null => Array.isArray(value) ? value[0] ?? null : value ?? null;
  const targets: GuildOfficialSyncTargetDto[] = [];
  for (const membership of (data ?? []) as unknown as TargetMembership[]) {
    const profile = first(membership.profile);
    if (!profile || profile.is_active === false) continue;
    const character = (profile.characters ?? []).find((item) => item.is_primary && item.official_sync_enabled);
    if (!character) continue;
    targets.push({
      characterId: character.id,
      characterName: character.name,
      profileId: profile.id,
      nickname: profile.nickname,
      avatarUrl: await signedReadUrl(client, 'profiles', character.avatar_path),
    });
  }
  targets.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko') || a.characterName.localeCompare(b.characterName, 'ko'));
  return success(targets);
}

export async function handlePowerRankings(req:Request,client:ServiceClient):Promise<HandlerResult<PowerRankingDto[]>>{
  const account=await requireAccount(req,client);if(!account)return failure(401,'UNAUTHORIZED','로그인이 필요합니다.');
  let guildId:string;
  try{guildId=requireGuildRole(account,['owner','admin','member']);}catch(error){if(error instanceof AccountAccessError)return failure(error.status,error.code,error.message);throw error;}
  const url=new URL(req.url);const scope=url.searchParams.get('scope')==='alliance'?'alliance':'guild';const metric=parseGrowthMetric(url.searchParams.get('metric'));
  const membershipSelect='guild_id,profile_id,guild:guilds!guild_members_guild_id_fkey(id,name,status),profile:profiles!guild_members_profile_id_fkey(id,nickname,is_active,characters(id,profile_id,name,job,is_primary,power_records(id,power,combat_power,life_power,charm_power,total_power,source,source_checked_at,recorded_at,created_at)))';
  let query=client.from('guild_members').select(membershipSelect).eq('status','active').is('left_at',null);
  if(scope === 'guild')query=query.eq('guild_id',guildId);
  const{data,error}=await query;if(error)return failure(500,'SERVER_ERROR','순위를 불러오지 못했습니다.');
  type Guild={id:string;name:string;status:string};
  type RankPower={id:string;power:number|string;combat_power?:number|string|null;life_power?:number|string|null;charm_power?:number|string|null;total_power?:number|string|null;source?:string;source_checked_at?:string|null;recorded_at:string;created_at:string};
  type RankChar={id:string;profile_id:string;name:string;job:string;is_primary:boolean;power_records?:RankPower[]|null};
  type RankProfile={id:string;nickname:string;is_active:boolean;characters?:RankChar[]|null};
  type Membership={guild_id:string;profile_id:string;guild:Guild|Guild[]|null;profile:RankProfile|RankProfile[]|null};
  const one=<T>(value:T|T[]|null|undefined):T|null=>Array.isArray(value)?value[0]??null:value??null;
  const num=(value:unknown):number|null=>{const parsed=Number(value);return value!==null&&value!==undefined&&Number.isSafeInteger(parsed)&&parsed>=0?parsed:null;};
  const candidates:OfficialRankingCandidate[]=[];
  const meta=new Map<string,{recordedAt:string}>();
  for(const row of (data??[]) as unknown as Membership[]){
    const guild=one(row.guild),profile=one(row.profile);if(!guild||guild.status!=='active'||!profile||profile.is_active===false)continue;
    const character=(profile.characters??[]).find((item)=>item.is_primary);if(!character)continue;
    const official=[...(character.power_records??[])].filter((record)=>record.source==='official'&&typeof record.source_checked_at==='string').sort((a,b)=>new Date(b.source_checked_at!).getTime()-new Date(a.source_checked_at!).getTime()||new Date(b.recorded_at).getTime()-new Date(a.recorded_at).getTime()||b.id.localeCompare(a.id));
    const latest=official[0];if(!latest||!latest.source_checked_at)continue;
    candidates.push({profileId:profile.id,nickname:profile.nickname,characterId:character.id,characterName:character.name,job:character.job,guildId:guild.id,guildName:guild.name,sourceCheckedAt:latest.source_checked_at,values:{total:num(latest.total_power),combat:num(latest.combat_power)??num(latest.power),life:num(latest.life_power),charm:num(latest.charm_power)}});
    meta.set(character.id,{recordedAt:latest.recorded_at});
  }
  const ranked=rankOfficialCharacters(candidates,metric);
  return success(ranked.map((item)=>({rank:item.rank,profileId:item.profileId,nickname:item.nickname,characterId:item.characterId,characterName:item.characterName,job:item.job,power:item.value,recordedAt:meta.get(item.characterId)?.recordedAt??item.sourceCheckedAt,sourceCheckedAt:item.sourceCheckedAt,guildId:item.guildId,guildName:item.guildName,scope})));
}
