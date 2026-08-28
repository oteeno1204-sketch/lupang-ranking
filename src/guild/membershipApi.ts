import type { CurrentAccount } from '@/auth/types';
import type {
  AdminGuildCreateInput,
  AdminGuildCreateResult,
  AdminGuildPatch,
  AdminGuildSummary,
  GuildInvite,
  GuildInviteCreateInput,
  GuildLifecycleConfirmation,
  GuildMemberRoleChange,
  GuildPermanentDeleteResult,
  InvitePreview,
} from '@/guild/membershipTypes';
import { apiFetch } from '@/lib/apiClient';
import { currentToken } from '@/lib/session';

export const membershipApi = {
  listAdminGuilds: () =>
    apiFetch<AdminGuildSummary[]>('/admin/guilds', { method: 'GET' }, currentToken()),
  createAdminGuild: (input: AdminGuildCreateInput) =>
    apiFetch<AdminGuildCreateResult>('/admin/guilds', { method: 'POST', body: JSON.stringify(input) }, currentToken()),
  updateAdminGuild: (guildId: string, input: AdminGuildPatch) =>
    apiFetch<AdminGuildSummary>(`/admin/guilds/${encodeURIComponent(guildId)}`, { method: 'PATCH', body: JSON.stringify(input) }, currentToken()),
  transferGuildOwner: (guildId: string, ownerProfileId: string) =>
    apiFetch<AdminGuildSummary>(`/admin/guilds/${encodeURIComponent(guildId)}/owner`, { method: 'POST', body: JSON.stringify({ ownerProfileId }) }, currentToken()),
  issueOwnerInvite: (guildId: string) =>
    apiFetch<GuildInvite>(`/admin/guilds/${encodeURIComponent(guildId)}/owner-invite`, { method: 'POST' }, currentToken()),
  deactivateGuild: ({ guildId, confirmationName }: GuildLifecycleConfirmation) =>
    apiFetch<AdminGuildSummary>(`/admin/guilds/${encodeURIComponent(guildId)}/deactivate`, { method: 'POST', body: JSON.stringify({ confirmationName }) }, currentToken()),
  restoreGuild: (guildId: string) =>
    apiFetch<AdminGuildSummary>(`/admin/guilds/${encodeURIComponent(guildId)}/restore`, { method: 'POST' }, currentToken()),
  permanentlyDeleteGuild: ({ guildId, confirmationName }: GuildLifecycleConfirmation) =>
    apiFetch<GuildPermanentDeleteResult>(`/admin/guilds/${encodeURIComponent(guildId)}`, { method: 'DELETE', body: JSON.stringify({ confirmationName }) }, currentToken()),
  createInvite: (input: GuildInviteCreateInput) =>
    apiFetch<GuildInvite>('/guild/invites', { method: 'POST', body: JSON.stringify(input) }, currentToken()),
  revokeInvite: (inviteId: string) =>
    apiFetch<{ deleted: true; inviteId: string }>(`/guild/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' }, currentToken()),
  previewInvite: (code: string) =>
    apiFetch<InvitePreview>('/guild/invites/preview', { method: 'POST', body: JSON.stringify({ code }) }, currentToken()),
  joinGuild: (code: string) =>
    apiFetch<CurrentAccount>('/guild/join', { method: 'POST', body: JSON.stringify({ code }) }, currentToken()),
  leaveGuild: () =>
    apiFetch<CurrentAccount>('/guild/leave', { method: 'POST' }, currentToken()),
  updateGuildMemberRole: (profileId: string, role: GuildMemberRoleChange['role']) =>
    apiFetch<GuildMemberRoleChange>(`/guild/members/${encodeURIComponent(profileId)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }, currentToken()),
};
