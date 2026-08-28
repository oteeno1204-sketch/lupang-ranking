import { useEffect, useState } from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { AppScreen } from '@/components/AppScreen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StateView } from '@/components/StateView';
import { useAuthStore } from '@/auth/store';
import { useMembers, useRemoveMember } from '@/profile/queries';
import {
  useCreateGuildInvite,
  useTransferGuildOwner,
  useUpdateGuildMemberRole,
} from '@/guild/membershipQueries';
import type { GuildInvite, GuildInviteRole } from '@/guild/membershipTypes';
import type { Member } from '@/profile/types';
import { ApiError } from '@/lib/apiClient';
import { theme } from '@/theme/tokens';

const inviteRoleLabel: Record<GuildInviteRole, string> = {
  member: '길드원',
  admin: '관리자',
  owner: '길드장',
};

type PendingAction = {
  title: string;
  message: string;
  confirmLabel: string;
  failureMessage: string;
  danger?: boolean;
  run: () => Promise<void>;
};

export default function GuildAdminScreen() {
  const router = useRouter();
  const membership = useAuthStore((state) => state.membership);
  const profile = useAuthStore((state) => state.profile);
  const refreshAccount = useAuthStore((state) => state.refreshAccount);
  const members = useMembers();
  const createInvite = useCreateGuildInvite();
  const setRole = useUpdateGuildMemberRole();
  const transfer = useTransferGuildOwner();
  const remove = useRemoveMember();
  const [invites, setInvites] = useState<Partial<Record<GuildInviteRole, GuildInvite>>>({});
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionRunning, setActionRunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    void refreshAccount().catch(() => undefined);
  }, [refreshAccount]);

  const canManage = membership?.role === 'owner' || membership?.role === 'admin';
  const isOwner = membership?.role === 'owner';
  const isSuperAdmin = profile?.isSuperAdmin === true;

  if (!membership || !canManage) {
    return (
      <AppScreen scroll={false}>
        <StateView kind="empty" message="길드장 또는 관리자만 길드를 관리할 수 있습니다." />
      </AppScreen>
    );
  }

  const queueAction = (action: PendingAction) => {
    setActionError(null);
    setActionNotice(null);
    setPendingAction(action);
  };

  const runPendingAction = async () => {
    if (!pendingAction || actionRunning) return;
    const action = pendingAction;
    setActionRunning(true);
    setActionError(null);
    try {
      await action.run();
      setPendingAction(null);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : action.failureMessage);
    } finally {
      setActionRunning(false);
    }
  };

  const issue = (inviteRole: GuildInviteRole) => {
    const label = inviteRoleLabel[inviteRole];
    queueAction({
      title: `${label} 초대코드 만들기`,
      message: '새 코드를 만들면 기존 같은 종류의 초대코드는 중지됩니다. 계속할까요?',
      confirmLabel: '만들기',
      failureMessage: '초대코드를 생성하지 못했습니다.',
      run: async () => {
        const value = await createInvite.mutateAsync({ inviteRole });
        setInvites((current) => ({ ...current, [inviteRole]: value }));
        setActionNotice(`${label} 초대코드 ${value.code}를 생성했습니다.`);
      },
    });
  };

  const copy = async (value: string, label: string) => {
    try {
      await Clipboard.setStringAsync(value);
      setActionError(null);
      setActionNotice(`${label}을 복사했습니다.`);
    } catch {
      setActionError(`${label}을 복사하지 못했습니다.`);
    }
  };

  const shareInvite = async (invite: GuildInvite) => {
    try {
      await Share.share({
        message: `${membership.guild.name} ${inviteRoleLabel[invite.inviteRole]} 초대\n코드: ${invite.code}\n${invite.link}`,
      });
    } catch {
      setActionError('초대코드를 공유하지 못했습니다.');
    }
  };

  const shareQrLink = async (invite: GuildInvite) => {
    try {
      await Share.share({ message: `QR에 넣을 초대 링크\n${invite.link}` });
    } catch {
      setActionError('초대 링크를 공유하지 못했습니다.');
    }
  };

  const toggleAdmin = (member: Member) => {
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    const label = nextRole === 'admin' ? '관리자 지정' : '관리자 해제';
    queueAction({
      title: label,
      message: nextRole === 'admin'
        ? `${member.nickname}님을 관리자로 지정할까요?`
        : `${member.nickname}님의 관리자 권한을 해제할까요?`,
      confirmLabel: nextRole === 'admin' ? '지정' : '해제',
      failureMessage: `${label}에 실패했습니다.`,
      run: async () => {
        await setRole.mutateAsync({
          guildId: membership.guild.id,
          profileId: member.id,
          role: member.role === 'admin' ? 'member' : 'admin',
        });
        setActionNotice(`${member.nickname}님의 권한을 ${nextRole === 'admin' ? '관리자' : '길드원'}로 변경했습니다.`);
      },
    });
  };

  const handover = (id: string, nickname: string) => queueAction({
    title: '길드장 위임',
    message: `${nickname}님에게 길드장을 위임할까요?`,
    confirmLabel: '위임',
    failureMessage: '길드장 위임에 실패했습니다.',
    danger: true,
    run: async () => {
      await transfer.mutateAsync({ guildId: membership.guild.id, ownerProfileId: id });
      setActionNotice(`${nickname}님에게 길드장을 위임했습니다.`);
    },
  });

  const kick = (id: string, nickname: string) => queueAction({
    title: '길드원 내보내기',
    message: `${nickname}님을 길드에서 내보낼까요?`,
    confirmLabel: '내보내기',
    failureMessage: '길드원을 내보내지 못했습니다.',
    danger: true,
    run: async () => {
      await remove.mutateAsync(id);
      setActionNotice(`${nickname}님을 길드에서 내보냈습니다.`);
    },
  });

  const renderInvite = (inviteRole: GuildInviteRole) => {
    const invite = invites[inviteRole];
    if (!invite) return null;
    return (
      <View style={styles.inviteResult}>
        <Text style={styles.inviteKind}>{inviteRoleLabel[inviteRole]} 초대코드</Text>
        <Text style={styles.code}>{invite.code}</Text>
        <Text style={styles.link}>{invite.link}</Text>
        <View style={styles.actions}>
          <Pressable style={styles.small} onPress={() => void copy(invite.code, '초대코드')}>
            <Ionicons name="copy-outline" size={17} color={theme.colors.accent} />
            <Text style={styles.smallText}>코드 복사</Text>
          </Pressable>
          <Pressable style={styles.small} onPress={() => void copy(invite.link, '초대 링크')}>
            <Ionicons name="link-outline" size={17} color={theme.colors.accent} />
            <Text style={styles.smallText}>링크 복사</Text>
          </Pressable>
          <Pressable style={styles.small} onPress={() => void shareInvite(invite)}>
            <Ionicons name="share-social-outline" size={17} color={theme.colors.accent} />
            <Text style={styles.smallText}>공유</Text>
          </Pressable>
          <Pressable style={styles.small} onPress={() => void shareQrLink(invite)}>
            <Ionicons name="qr-code-outline" size={17} color={theme.colors.accent} />
            <Text style={styles.smallText}>QR</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <AppScreen contentStyle={styles.screen}>
      <Stack.Screen options={{ title: '길드 관리' }} />
      <View style={styles.titleRow}>
        <Text style={styles.title}>길드 관리</Text>
        <Pressable accessibilityLabel="길드 설정" onPress={() => router.push('/guild/settings')}>
          <Ionicons name="settings-outline" size={24} color={theme.colors.cream} />
        </Pressable>
      </View>

      {isSuperAdmin ? (
        <PrimaryButton
          label="연합 길드 관리"
          variant="ghost"
          onPress={() => router.push('/admin/guilds')}
        />
      ) : null}

      {actionError ? <View style={[styles.feedback, styles.errorFeedback]}><Text style={styles.errorText}>{actionError}</Text></View> : null}
      {actionNotice ? <View style={[styles.feedback, styles.successFeedback]}><Text style={styles.successText}>{actionNotice}</Text></View> : null}

      <View style={styles.card}>
        <Text style={styles.section}>초대코드</Text>
        <Text style={styles.help}>
          숫자 4자리 코드입니다. 관리자 코드는 신규 가입자에게 길드 관리자 권한을 부여하며 최고 관리자 권한은 부여하지 않습니다.
        </Text>
        <PrimaryButton
          label="길드원 초대코드 만들기"
          onPress={() => issue('member')}
          loading={createInvite.isPending}
        />
        {renderInvite('member')}
        <PrimaryButton
          label="관리자 코드 만들기"
          onPress={() => issue('admin')}
          loading={createInvite.isPending}
        />
        {renderInvite('admin')}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>길드원 · 관리자</Text>
        {members.data?.map((member) => (
          <View key={member.id} style={styles.member}>
            <View style={styles.memberText}>
              <Text style={styles.nickname}>{member.nickname}{member.id === profile?.id ? ' (나)' : ''}</Text>
              <Text style={styles.role}>{member.role === 'owner' ? '길드장' : member.role === 'admin' ? '관리자' : '길드원'}</Text>
            </View>
            {member.id !== profile?.id ? (
              <View style={styles.memberActions}>
                {isOwner && member.role !== 'owner' ? (
                  <Pressable
                    style={styles.memberActionButton}
                    accessibilityLabel={member.role === 'admin' ? '관리자 해제' : '관리자 지정'}
                    onPress={() => toggleAdmin(member)}
                  >
                    <Ionicons name="shield-outline" size={15} color={theme.colors.accent} />
                    <Text style={styles.memberActionText}>{member.role === 'admin' ? '관리자 해제' : '관리자 지정'}</Text>
                  </Pressable>
                ) : null}
                {isOwner && member.role !== 'owner' ? (
                  <Pressable style={styles.memberActionButton} accessibilityLabel="길드장 위임" onPress={() => handover(member.id, member.nickname)}>
                    <Ionicons name="ribbon-outline" size={15} color={theme.colors.accent} />
                    <Text style={styles.memberActionText}>길드장 위임</Text>
                  </Pressable>
                ) : null}
                {member.role !== 'owner' ? (
                  <Pressable style={[styles.memberActionButton, styles.dangerAction]} accessibilityLabel="길드원 내보내기" onPress={() => kick(member.id, member.nickname)}>
                    <Ionicons name="person-remove-outline" size={15} color={theme.colors.danger} />
                    <Text style={styles.dangerActionText}>내보내기</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <Modal transparent animationType="fade" visible={Boolean(pendingAction)} onRequestClose={() => !actionRunning && setPendingAction(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => !actionRunning && setPendingAction(null)} accessibilityLabel="확인창 닫기" />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{pendingAction?.title}</Text>
            <Text style={styles.confirmMessage}>{pendingAction?.message}</Text>
            {actionError ? <Text style={styles.confirmError}>{actionError}</Text> : null}
            <View style={styles.confirmActions}>
              <Pressable disabled={actionRunning} style={[styles.confirmButton, styles.cancelButton]} onPress={() => setPendingAction(null)}>
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
              <Pressable
                disabled={actionRunning}
                style={[styles.confirmButton, pendingAction?.danger ? styles.confirmDanger : styles.confirmPrimary]}
                onPress={() => void runPendingAction()}
              >
                <Text style={styles.confirmButtonText}>{actionRunning ? '처리 중...' : pendingAction?.confirmLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 14, paddingBottom: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '900', color: theme.colors.cream },
  card: { gap: 12, padding: 16, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.goldBorder, backgroundColor: 'rgba(255,249,245,.96)' },
  section: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  help: { fontSize: 11, lineHeight: 17, color: theme.colors.textMuted },
  feedback: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10 },
  errorFeedback: { backgroundColor: 'rgba(255,235,235,.96)', borderColor: 'rgba(190,75,75,.38)' },
  successFeedback: { backgroundColor: 'rgba(238,250,241,.97)', borderColor: 'rgba(69,137,87,.36)' },
  errorText: { color: theme.colors.danger, fontWeight: '800', fontSize: 12 },
  successText: { color: '#39744B', fontWeight: '800', fontSize: 12 },
  inviteResult: { gap: 8, paddingVertical: 8 },
  inviteKind: { textAlign: 'center', fontSize: 12, fontWeight: '900', color: theme.colors.textMuted },
  code: { fontSize: 28, fontWeight: '900', letterSpacing: 5, textAlign: 'center', color: theme.colors.accent },
  link: { fontSize: 10, color: theme.colors.textDim, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  small: { flexGrow: 1, minWidth: 95, minHeight: 42, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.cardBorder, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  smallText: { color: theme.colors.accent, fontSize: 11, fontWeight: '900' },
  member: { minHeight: 68, borderTopWidth: 1, borderTopColor: 'rgba(183,141,54,.12)', paddingTop: 9, gap: 8 },
  memberText: { flex: 1 },
  nickname: { fontWeight: '900', color: theme.colors.text },
  role: { fontSize: 10, color: theme.colors.textMuted },
  memberActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  memberActionButton: { minHeight: 34, paddingHorizontal: 9, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.cardBorder, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.65)' },
  memberActionText: { color: theme.colors.accent, fontSize: 10, fontWeight: '900' },
  dangerAction: { borderColor: 'rgba(190,75,75,.32)' },
  dangerActionText: { color: theme.colors.danger, fontSize: 10, fontWeight: '900' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: 'rgba(3,12,35,.62)' },
  confirmCard: { width: '100%', maxWidth: 430, gap: 13, borderRadius: 25, borderWidth: 1.5, borderColor: theme.colors.goldBorder, backgroundColor: '#FFF9F1', padding: 20, ...theme.shadow.soft },
  confirmTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  confirmMessage: { fontSize: 13, lineHeight: 20, color: theme.colors.textMuted },
  confirmError: { color: theme.colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  confirmActions: { flexDirection: 'row', gap: 9, marginTop: 3 },
  confirmButton: { flex: 1, minHeight: 46, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  cancelButton: { borderWidth: 1, borderColor: theme.colors.cardBorder, backgroundColor: '#FFFDF8' },
  confirmPrimary: { backgroundColor: theme.colors.accent },
  confirmDanger: { backgroundColor: theme.colors.danger },
  cancelText: { color: theme.colors.textMuted, fontWeight: '900' },
  confirmButtonText: { color: '#FFF', fontWeight: '900' },
});
