-- Owner invite values must be committed before later migrations use them.
alter type public.guild_invite_role add value if not exists 'owner';
