import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Profile } from '@/auth/types';
import { useAuthStore } from '@/auth/store';
import { membershipApi } from '@/guild/membershipApi';
import type { GuildInviteCreateInput, GuildLifecycleConfirmation, GuildMemberRoleChange, GuildMembership } from '@/guild/membershipTypes';

export const membershipKeys = {
  adminGuilds: ['admin-guilds'] as const,
};

function syncAccount(profile: Profile, membership: GuildMembership | null) {
  useAuthStore.setState((state) => ({
    ...state,
    status: 'signedIn',
    profile,
    membership,
  }));
}

function invalidateMembershipState(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['me'] });
  void queryClient.invalidateQueries({ queryKey: ['guild'] });
  void queryClient.invalidateQueries({ queryKey: ['members'] });
  void queryClient.invalidateQueries({ queryKey: membershipKeys.adminGuilds });
}

function invalidateGuildAdminState(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: membershipKeys.adminGuilds });
  void queryClient.invalidateQueries({ queryKey: ['guild'] });
  void queryClient.invalidateQueries({ queryKey: ['members'] });
}

export function useAdminGuilds() {
  return useQuery({
    queryKey: membershipKeys.adminGuilds,
    queryFn: membershipApi.listAdminGuilds,
  });
}

export function useCreateAdminGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: membershipApi.createAdminGuild,
    onSuccess: () => invalidateMembershipState(queryClient),
  });
}

export function useUpdateAdminGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guildId, status }: { guildId: string; status: 'active' | 'inactive' }) =>
      membershipApi.updateAdminGuild(guildId, { status }),
    onSuccess: () => invalidateMembershipState(queryClient),
  });
}

export function useIssueOwnerInvite() {
  return useMutation({ mutationFn: membershipApi.issueOwnerInvite });
}

export function useDeactivateAdminGuild() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: GuildLifecycleConfirmation) => membershipApi.deactivateGuild(input), onSuccess: () => invalidateMembershipState(queryClient) });
}

export function useRestoreAdminGuild() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: membershipApi.restoreGuild, onSuccess: () => invalidateMembershipState(queryClient) });
}

export function usePermanentlyDeleteAdminGuild() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: GuildLifecycleConfirmation) => membershipApi.permanentlyDeleteGuild(input), onSuccess: () => invalidateMembershipState(queryClient) });
}

export function useTransferGuildOwner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guildId, ownerProfileId }: { guildId: string; ownerProfileId: string }) =>
      membershipApi.transferGuildOwner(guildId, ownerProfileId),
    onSuccess: () => invalidateMembershipState(queryClient),
  });
}

export function useCreateGuildInvite() {
  return useMutation({
    mutationFn: (input: GuildInviteCreateInput) => membershipApi.createInvite(input),
  });
}

export function useRevokeGuildInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: membershipApi.revokeInvite,
    onSuccess: () => invalidateGuildAdminState(queryClient),
  });
}

export function usePreviewGuildInvite() {
  return useMutation({
    mutationFn: membershipApi.previewInvite,
  });
}

export function useJoinGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: membershipApi.joinGuild,
    onSuccess: (account) => {
      syncAccount(account.profile, account.membership);
      invalidateMembershipState(queryClient);
    },
  });
}

export function useLeaveGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: membershipApi.leaveGuild,
    onSuccess: (account) => {
      syncAccount(account.profile, account.membership);
      invalidateMembershipState(queryClient);
    },
  });
}

export function useUpdateGuildMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, role }: GuildMemberRoleChange) =>
      membershipApi.updateGuildMemberRole(profileId, role),
    onSuccess: () => invalidateMembershipState(queryClient),
  });
}
