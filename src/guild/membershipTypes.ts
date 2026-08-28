export type GuildRole = 'owner'|'admin'|'member';
export type GuildInviteRole = 'member' | 'admin' | 'owner';
export type GuildSummary = {
  id:string; name:string; tagline:string; server:'아이라'; memberCount:number;
  maxMembers:number; logoUrl:string|null; headerBackgroundUrl:string|null;
  accentColor:string; status:'active'|'inactive';
};
export type GuildMembership = { guild:GuildSummary; role:GuildRole; joinedAt:string };
export type InvitePreview = { guild:GuildSummary; expiresAt:string|null; inviteRole:GuildInviteRole };
export type AdminGuildSummary = GuildSummary & {
  createdAt:string; updatedAt:string; createdBy:string;
  ownerProfileId:string|null; ownerNickname:string|null;
};
export type AdminGuildCreateInput = {
  name:string; tagline:string;
  maxMembers?:number; accentColor?:string;
  logoPath?:string|null; headerBackgroundPath?:string|null;
};
export type AdminGuildCreateResult = { guild:AdminGuildSummary; ownerInvite:GuildInvite|null };
export type GuildLifecycleConfirmation = { guildId:string; confirmationName:string };
export type GuildPermanentDeleteResult = { deleted:true; guildId:string; counts:Record<string,number> };
export type AdminGuildPatch = { status:'active'|'inactive' };
export type GuildInvite = {
  id:string; guildId:string; inviteRole:GuildInviteRole; code:string; link:string;
  expiresAt:string|null; maxUses:number|null; useCount:number;
  revokedAt:string|null; createdAt:string;
};
export type GuildInviteCreateInput = {
  guildId?:string;
  inviteRole:GuildInviteRole;
  expiresAt?:string|null;
  maxUses?:number|null;
};
export type GuildMemberRoleChange = {
  guildId:string;
  profileId:string;
  role:Extract<GuildRole, 'admin'|'member'>;
};
