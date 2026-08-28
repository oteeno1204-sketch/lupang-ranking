-- Durable platform-level audit records intentionally do not reference guilds:
-- permanent guild deletion must not erase its own evidence.
create table public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_guild_id uuid,
  target_guild_name text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index platform_audit_logs_created_idx
  on public.platform_audit_logs(created_at desc);
create index platform_audit_logs_actor_created_idx
  on public.platform_audit_logs(actor_profile_id, created_at desc);

revoke all on public.platform_audit_logs from anon, authenticated;
alter table public.platform_audit_logs enable row level security;

create or replace function public.create_unclaimed_guild_atomic(
  p_actor_profile_id uuid,
  p_name text,
  p_tagline text,
  p_logo_path text,
  p_header_background_path text,
  p_accent_color text,
  p_max_members integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor_is_super_admin boolean;
  v_guild_id uuid;
begin
  select is_super_admin
    into v_actor_is_super_admin
    from public.profiles
   where id = p_actor_profile_id
     and is_active = true
   for update;

  if not found or not v_actor_is_super_admin then
    return jsonb_build_object('status', 'forbidden');
  end if;

  insert into public.guilds (
    name, tagline, server, logo_path, header_background_path,
    accent_color, max_members, status, created_by
  ) values (
    p_name, p_tagline, '아이라', p_logo_path, p_header_background_path,
    p_accent_color, p_max_members, 'inactive', p_actor_profile_id
  )
  returning id into v_guild_id;

  insert into public.platform_audit_logs (
    actor_profile_id, action, target_guild_id, target_guild_name, metadata
  ) values (
    p_actor_profile_id, 'guild.created_unclaimed', v_guild_id, p_name,
    jsonb_build_object('status', 'inactive')
  );

  return jsonb_build_object('status', 'created', 'guild_id', v_guild_id);
exception
  when unique_violation then
    return jsonb_build_object('status', 'name_taken');
  when check_violation then
    return jsonb_build_object('status', 'invalid_input');
end;
$$;

create or replace function public.claim_guild_owner_by_invite_atomic(
  p_profile_id uuid,
  p_code_hash text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_guild_id uuid;
  v_guild_name text;
  v_invite_role public.guild_invite_role;
  v_expires_at timestamptz;
  v_revoked_at timestamptz;
  v_max_uses integer;
  v_use_count integer;
  v_guild_status public.guild_status;
  v_now timestamptz := now();
begin
  perform id
    from public.profiles
   where id = p_profile_id
     and is_active = true
   for update;
  if not found then
    return jsonb_build_object('status', 'profile_not_found');
  end if;

  if exists (
    select 1 from public.guild_members
     where profile_id = p_profile_id
       and status = 'active'
       and left_at is null
  ) then
    return jsonb_build_object('status', 'already_in_guild');
  end if;

  select id, guild_id, invite_role, expires_at, revoked_at, max_uses, use_count
    into v_invite_id, v_guild_id, v_invite_role, v_expires_at,
         v_revoked_at, v_max_uses, v_use_count
    from public.guild_invite_codes
   where code_hash = p_code_hash
   order by (revoked_at is null) desc, created_at desc
   limit 1
   for update;

  if not found then return jsonb_build_object('status', 'invite_invalid'); end if;
  if v_invite_role <> 'owner' then return jsonb_build_object('status', 'invite_invalid'); end if;
  if v_revoked_at is not null then return jsonb_build_object('status', 'invite_revoked'); end if;
  if v_expires_at is not null and v_expires_at <= v_now then
    return jsonb_build_object('status', 'invite_expired');
  end if;
  if v_max_uses <> 1 or v_use_count >= 1 then
    return jsonb_build_object('status', 'invite_exhausted');
  end if;

  select name, status
    into v_guild_name, v_guild_status
    from public.guilds
   where id = v_guild_id
   for update;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_guild_status <> 'inactive' then return jsonb_build_object('status', 'guild_active'); end if;
  if exists (
    select 1 from public.guild_members
     where guild_id = v_guild_id
       and role = 'owner'
       and status = 'active'
       and left_at is null
  ) then
    return jsonb_build_object('status', 'owner_already_assigned');
  end if;

  insert into public.guild_members (guild_id, profile_id, role, status)
  values (v_guild_id, p_profile_id, 'owner', 'active');

  update public.guilds
     set status = 'active', updated_at = v_now
   where id = v_guild_id;

  update public.guild_invite_codes
     set use_count = use_count + 1,
         revoked_at = v_now,
         updated_at = v_now
   where id = v_invite_id;

  insert into public.guild_audit_logs (
    guild_id, actor_profile_id, action, target_profile_id,
    target_invite_code_id, metadata
  ) values (
    v_guild_id, p_profile_id, 'guild.owner_claimed', p_profile_id,
    v_invite_id, jsonb_build_object('inviteRole', 'owner')
  );

  return jsonb_build_object(
    'status', 'claimed', 'guild_id', v_guild_id, 'profile_id', p_profile_id
  );
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_in_guild');
end;
$$;

create or replace function public.deactivate_guild_atomic(
  p_actor_profile_id uuid,
  p_guild_id uuid,
  p_confirmation_name text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor_is_super_admin boolean;
  v_guild_name text;
  v_guild_status public.guild_status;
  v_member_count integer;
  v_invite_count integer;
  v_now timestamptz := now();
begin
  select is_super_admin into v_actor_is_super_admin
    from public.profiles
   where id = p_actor_profile_id and is_active = true
   for update;
  if not found or not v_actor_is_super_admin then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select name, status into v_guild_name, v_guild_status
    from public.guilds where id = p_guild_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if p_confirmation_name <> v_guild_name then
    return jsonb_build_object('status', 'name_mismatch');
  end if;
  if v_guild_status = 'inactive' then
    return jsonb_build_object('status', 'deactivated', 'guild_id', p_guild_id);
  end if;

  update public.guilds
     set status = 'inactive', updated_at = v_now
   where id = p_guild_id;

  update public.guild_members
     set status = 'inactive', left_at = v_now, updated_at = v_now
   where guild_id = p_guild_id
     and status = 'active'
     and left_at is null;
  get diagnostics v_member_count = row_count;

  update public.guild_invite_codes
     set revoked_at = v_now, updated_at = v_now
   where guild_id = p_guild_id
     and revoked_at is null;
  get diagnostics v_invite_count = row_count;

  insert into public.platform_audit_logs (
    actor_profile_id, action, target_guild_id, target_guild_name, metadata
  ) values (
    p_actor_profile_id, 'guild.deactivated', p_guild_id, v_guild_name,
    jsonb_build_object('membersDeactivated', v_member_count, 'invitesRevoked', v_invite_count)
  );

  return jsonb_build_object(
    'status', 'deactivated', 'guild_id', p_guild_id,
    'members_deactivated', v_member_count, 'invites_revoked', v_invite_count
  );
end;
$$;

create or replace function public.restore_guild_atomic(
  p_actor_profile_id uuid,
  p_guild_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor_is_super_admin boolean;
  v_guild_name text;
  v_guild_status public.guild_status;
  v_owner_row record;
  v_members_restored integer := 0;
  v_now timestamptz := now();
begin
  select is_super_admin into v_actor_is_super_admin
    from public.profiles
   where id = p_actor_profile_id and is_active = true
   for update;
  if not found or not v_actor_is_super_admin then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select name, status into v_guild_name, v_guild_status
    from public.guilds where id = p_guild_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_guild_status <> 'inactive' then
    return jsonb_build_object('status', 'guild_active');
  end if;

  select gm.guild_id, gm.profile_id, gm.joined_at
    into v_owner_row
    from public.guild_members gm
   where gm.guild_id = p_guild_id
     and gm.role = 'owner'
     and gm.status = 'inactive'
     and not exists (
       select 1 from public.guild_members active_membership
        where active_membership.profile_id = gm.profile_id
          and active_membership.status = 'active'
          and active_membership.left_at is null
     )
   order by gm.joined_at desc
   limit 1
   for update;

  if not found then
    insert into public.platform_audit_logs (
      actor_profile_id, action, target_guild_id, target_guild_name, metadata
    ) values (
      p_actor_profile_id, 'guild.restore_owner_required', p_guild_id, v_guild_name,
      jsonb_build_object('status', 'owner_claim_required')
    );
    return jsonb_build_object('status', 'owner_claim_required', 'guild_id', p_guild_id);
  end if;

  update public.guild_members
     set status = 'active', left_at = null, updated_at = v_now
   where guild_id = v_owner_row.guild_id
     and profile_id = v_owner_row.profile_id
     and joined_at = v_owner_row.joined_at;

  update public.guilds
     set status = 'active', updated_at = v_now
   where id = p_guild_id;

  with eligible as (
    select distinct on (gm.profile_id) gm.guild_id, gm.profile_id, gm.joined_at
      from public.guild_members gm
     where gm.guild_id = p_guild_id
       and gm.role <> 'owner'
       and gm.status = 'inactive'
       and not exists (
         select 1 from public.guild_members active_membership
          where active_membership.profile_id = gm.profile_id
            and active_membership.status = 'active'
            and active_membership.left_at is null
       )
     order by gm.profile_id, gm.joined_at desc
  )
  update public.guild_members gm
     set status = 'active', left_at = null, updated_at = v_now
    from eligible
   where gm.guild_id = eligible.guild_id
     and gm.profile_id = eligible.profile_id
     and gm.joined_at = eligible.joined_at;
  get diagnostics v_members_restored = row_count;

  insert into public.platform_audit_logs (
    actor_profile_id, action, target_guild_id, target_guild_name, metadata
  ) values (
    p_actor_profile_id, 'guild.restored', p_guild_id, v_guild_name,
    jsonb_build_object('ownerProfileId', v_owner_row.profile_id, 'membersRestored', v_members_restored)
  );

  return jsonb_build_object(
    'status', 'restored', 'guild_id', p_guild_id,
    'owner_profile_id', v_owner_row.profile_id,
    'members_restored', v_members_restored
  );
end;
$$;

create or replace function public.permanently_delete_guild_atomic(
  p_actor_profile_id uuid,
  p_guild_id uuid,
  p_confirmation_name text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor_is_super_admin boolean;
  v_guild_name text;
  v_guild_status public.guild_status;
  v_members integer;
  v_invites integer;
  v_notices integer;
  v_schedules integer;
  v_albums integer;
  v_proposals integer;
  v_rooms integer;
  v_emoji_packs integer;
begin
  select is_super_admin into v_actor_is_super_admin
    from public.profiles
   where id = p_actor_profile_id and is_active = true
   for update;
  if not found or not v_actor_is_super_admin then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select name, status into v_guild_name, v_guild_status
    from public.guilds where id = p_guild_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if p_confirmation_name <> v_guild_name then
    return jsonb_build_object('status', 'name_mismatch');
  end if;
  if v_guild_status <> 'inactive' then
    return jsonb_build_object('status', 'guild_active');
  end if;

  select count(*)::integer into v_members from public.guild_members where guild_id = p_guild_id;
  select count(*)::integer into v_invites from public.guild_invite_codes where guild_id = p_guild_id;
  select count(*)::integer into v_notices from public.notices where guild_id = p_guild_id;
  select count(*)::integer into v_schedules from public.schedules where guild_id = p_guild_id;
  select count(*)::integer into v_albums from public.album_posts where guild_id = p_guild_id;
  select count(*)::integer into v_proposals from public.proposals where guild_id = p_guild_id;
  select count(*)::integer into v_rooms from public.chat_rooms where guild_id = p_guild_id;
  select count(*)::integer into v_emoji_packs from public.chat_emoji_packs where guild_id = p_guild_id;

  insert into public.platform_audit_logs (
    actor_profile_id, action, target_guild_id, target_guild_name, metadata
  ) values (
    p_actor_profile_id, 'guild.permanently_deleted', p_guild_id, v_guild_name,
    jsonb_build_object(
      'members', v_members, 'invites', v_invites, 'notices', v_notices,
      'schedules', v_schedules, 'albums', v_albums, 'proposals', v_proposals,
      'chatRooms', v_rooms, 'emojiPacks', v_emoji_packs
    )
  );

  delete from public.guilds where id = p_guild_id;

  return jsonb_build_object(
    'status', 'deleted', 'guild_id', p_guild_id,
    'counts', jsonb_build_object(
      'members', v_members, 'invites', v_invites, 'notices', v_notices,
      'schedules', v_schedules, 'albums', v_albums, 'proposals', v_proposals,
      'chatRooms', v_rooms, 'emojiPacks', v_emoji_packs
    )
  );
end;
$$;

create or replace function public.create_owner_guild_invite_atomic(
  p_actor_profile_id uuid,
  p_guild_id uuid,
  p_code_hash text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor_is_super_admin boolean;
  v_guild_status public.guild_status;
  v_invite public.guild_invite_codes%rowtype;
begin
  select is_super_admin into v_actor_is_super_admin
    from public.profiles
   where id = p_actor_profile_id and is_active = true
   for update;
  if not found or not v_actor_is_super_admin then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select status into v_guild_status
    from public.guilds where id = p_guild_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_guild_status <> 'inactive' then
    return jsonb_build_object('status', 'guild_active');
  end if;
  if exists (
    select 1 from public.guild_members
     where guild_id = p_guild_id
       and role = 'owner'
       and status = 'active'
       and left_at is null
  ) then
    return jsonb_build_object('status', 'owner_already_assigned');
  end if;

  if exists (
    select 1 from public.guild_invite_codes
     where code_hash = p_code_hash and revoked_at is null
  ) then
    return jsonb_build_object('status', 'hash_conflict');
  end if;

  update public.guild_invite_codes
     set revoked_at = now(), updated_at = now()
   where guild_id = p_guild_id
     and invite_role = 'owner'
     and revoked_at is null;

  insert into public.guild_invite_codes (
    guild_id, code_hash, invite_role, is_legacy,
    expires_at, max_uses, created_by
  ) values (
    p_guild_id, p_code_hash, 'owner', false,
    p_expires_at, 1, p_actor_profile_id
  ) returning * into v_invite;

  insert into public.guild_audit_logs (
    guild_id, actor_profile_id, action, target_invite_code_id, metadata
  ) values (
    p_guild_id, p_actor_profile_id, 'guild.owner_invite_created', v_invite.id,
    jsonb_build_object('inviteRole', 'owner', 'maxUses', 1)
  );

  return jsonb_build_object(
    'status', 'created', 'id', v_invite.id, 'guild_id', v_invite.guild_id,
    'invite_role', v_invite.invite_role, 'expires_at', v_invite.expires_at,
    'revoked_at', v_invite.revoked_at, 'max_uses', v_invite.max_uses,
    'use_count', v_invite.use_count, 'created_at', v_invite.created_at
  );
exception
  when unique_violation then
    return jsonb_build_object('status', 'hash_conflict');
end;
$$;

create or replace function public.register_with_guild_invite_atomic(
  p_code_hash text,
  p_nickname text,
  p_pin_hash text,
  p_session_token_hash text,
  p_session_expires_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_guild_id uuid;
  v_invite_role public.guild_invite_role;
  v_expires_at timestamptz;
  v_revoked_at timestamptz;
  v_max_uses integer;
  v_use_count integer;
  v_guild_status public.guild_status;
  v_max_members integer;
  v_active_member_count integer;
  v_profile_id uuid;
  v_now timestamptz := now();
begin
  select id, guild_id, invite_role, expires_at, revoked_at, max_uses, use_count
    into v_invite_id, v_guild_id, v_invite_role, v_expires_at,
         v_revoked_at, v_max_uses, v_use_count
    from public.guild_invite_codes
   where code_hash = p_code_hash
   order by (revoked_at is null) desc, created_at desc
   limit 1
   for update;

  if not found then return jsonb_build_object('status', 'invite_invalid'); end if;
  if v_revoked_at is not null then return jsonb_build_object('status', 'invite_revoked'); end if;
  if v_expires_at is not null and v_expires_at <= v_now then
    return jsonb_build_object('status', 'invite_expired');
  end if;
  if v_max_uses is not null and v_use_count >= v_max_uses then
    return jsonb_build_object('status', 'invite_exhausted');
  end if;

  select status, max_members into v_guild_status, v_max_members
    from public.guilds where id = v_guild_id for update;
  if not found then return jsonb_build_object('status', 'guild_inactive'); end if;
  if v_invite_role = 'owner' then
    if v_guild_status <> 'inactive' then return jsonb_build_object('status', 'guild_active'); end if;
    if v_max_uses <> 1 then return jsonb_build_object('status', 'invite_invalid'); end if;
    if exists (
      select 1 from public.guild_members
       where guild_id = v_guild_id
         and role = 'owner'
         and status = 'active'
         and left_at is null
    ) then
      return jsonb_build_object('status', 'owner_already_assigned');
    end if;
  elsif v_guild_status <> 'active' then
    return jsonb_build_object('status', 'guild_inactive');
  end if;

  select count(*)::integer into v_active_member_count
    from public.guild_members
   where guild_id = v_guild_id and status = 'active' and left_at is null;
  if v_active_member_count >= v_max_members then
    return jsonb_build_object('status', 'guild_full');
  end if;
  if exists (select 1 from public.profiles where nickname = p_nickname) then
    return jsonb_build_object('status', 'nickname_taken');
  end if;

  begin
    insert into public.profiles (nickname, pin_hash, role, is_super_admin)
    values (p_nickname, p_pin_hash, 'member', false)
    returning id into v_profile_id;
  exception when unique_violation then
    return jsonb_build_object('status', 'nickname_taken');
  end;

  insert into public.guild_members (guild_id, profile_id, role, status)
  values (
    v_guild_id, v_profile_id,
    v_invite_role::text::public.guild_member_role,
    'active'
  );

  if v_invite_role = 'owner' then
    update public.guilds set status = 'active', updated_at = v_now where id = v_guild_id;
  end if;

  update public.guild_invite_codes
     set use_count = use_count + 1,
         revoked_at = case
           when v_invite_role = 'owner' then v_now
           when max_uses is not null and use_count + 1 >= max_uses then v_now
           else revoked_at
         end,
         updated_at = v_now
   where id = v_invite_id;

  insert into public.app_sessions (profile_id, token_hash, expires_at)
  values (v_profile_id, p_session_token_hash, p_session_expires_at);

  insert into public.guild_audit_logs (
    guild_id, actor_profile_id, action, target_profile_id,
    target_invite_code_id, metadata
  ) values (
    v_guild_id, v_profile_id,
    case when v_invite_role = 'owner' then 'guild.owner_claimed' else 'guild.member_joined' end,
    v_profile_id, v_invite_id,
    jsonb_build_object('inviteRole', v_invite_role, 'registration', true)
  );

  return jsonb_build_object(
    'status', 'registered', 'profile_id', v_profile_id,
    'guild_id', v_guild_id, 'invite_role', v_invite_role
  );
end;
$$;

create or replace function public.join_guild_via_invite_atomic(
  p_profile_id uuid,
  p_code_hash text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_guild_id uuid;
  v_invite_role public.guild_invite_role;
  v_expires_at timestamptz;
  v_revoked_at timestamptz;
  v_max_uses integer;
  v_use_count integer;
  v_guild_status public.guild_status;
  v_max_members integer;
  v_active_member_count integer;
  v_claim jsonb;
begin
  if exists (
    select 1 from public.guild_members
     where profile_id = p_profile_id and status = 'active' and left_at is null
  ) then return jsonb_build_object('status', 'already_in_guild'); end if;

  select id, guild_id, invite_role, expires_at, revoked_at, max_uses, use_count
    into v_invite_id, v_guild_id, v_invite_role, v_expires_at,
         v_revoked_at, v_max_uses, v_use_count
    from public.guild_invite_codes
   where code_hash = p_code_hash
   order by (revoked_at is null) desc, created_at desc
   limit 1;
  if not found then return jsonb_build_object('status', 'invite_invalid'); end if;

  if v_invite_role = 'owner' then
    select public.claim_guild_owner_by_invite_atomic(p_profile_id, p_code_hash)
      into v_claim;
    return v_claim;
  end if;
  if v_invite_role <> 'member' then
    return jsonb_build_object('status', 'invite_admin_not_allowed');
  end if;

  select id, guild_id, invite_role, expires_at, revoked_at, max_uses, use_count
    into v_invite_id, v_guild_id, v_invite_role, v_expires_at,
         v_revoked_at, v_max_uses, v_use_count
    from public.guild_invite_codes
   where id = v_invite_id
   for update;
  if v_revoked_at is not null then return jsonb_build_object('status', 'invite_revoked'); end if;
  if v_expires_at is not null and v_expires_at <= now() then
    return jsonb_build_object('status', 'invite_expired');
  end if;
  if v_max_uses is not null and v_use_count >= v_max_uses then
    return jsonb_build_object('status', 'invite_exhausted');
  end if;

  select status, max_members into v_guild_status, v_max_members
    from public.guilds where id = v_guild_id for update;
  if not found or v_guild_status <> 'active' then
    return jsonb_build_object('status', 'guild_inactive');
  end if;
  select count(*)::integer into v_active_member_count
    from public.guild_members
   where guild_id = v_guild_id and status = 'active' and left_at is null;
  if v_active_member_count >= v_max_members then
    return jsonb_build_object('status', 'guild_full');
  end if;

  insert into public.guild_members (guild_id, profile_id, role, status)
  values (v_guild_id, p_profile_id, 'member', 'active');
  update public.guild_invite_codes
     set use_count = use_count + 1,
         revoked_at = case when max_uses is not null and use_count + 1 >= max_uses then now() else revoked_at end,
         updated_at = now()
   where id = v_invite_id;
  insert into public.guild_audit_logs (
    guild_id, actor_profile_id, action, target_profile_id,
    target_invite_code_id, metadata
  ) values (
    v_guild_id, p_profile_id, 'guild.member_joined', p_profile_id,
    v_invite_id, jsonb_build_object('inviteRole', 'member')
  );
  return jsonb_build_object('status', 'joined', 'guild_id', v_guild_id);
exception when unique_violation then
  return jsonb_build_object('status', 'already_in_guild');
end;
$$;

revoke all on function public.create_unclaimed_guild_atomic(uuid, text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.claim_guild_owner_by_invite_atomic(uuid, text) from public, anon, authenticated;
revoke all on function public.deactivate_guild_atomic(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.restore_guild_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.permanently_delete_guild_atomic(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_owner_guild_invite_atomic(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.register_with_guild_invite_atomic(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.join_guild_via_invite_atomic(uuid, text) from public, anon, authenticated;

grant execute on function public.create_unclaimed_guild_atomic(uuid, text, text, text, text, text, integer) to service_role;
grant execute on function public.claim_guild_owner_by_invite_atomic(uuid, text) to service_role;
grant execute on function public.deactivate_guild_atomic(uuid, uuid, text) to service_role;
grant execute on function public.restore_guild_atomic(uuid, uuid) to service_role;
grant execute on function public.permanently_delete_guild_atomic(uuid, uuid, text) to service_role;
grant execute on function public.create_owner_guild_invite_atomic(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.register_with_guild_invite_atomic(text, text, text, text, timestamptz) to service_role;
grant execute on function public.join_guild_via_invite_atomic(uuid, text) to service_role;
