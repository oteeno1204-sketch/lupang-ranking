import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { AppScreen } from '@/components/AppScreen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StateView } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { useAuthStore } from '@/auth/store';
import {
  useAdminGuilds,
  useCreateAdminGuild,
  useCreateGuildInvite,
  useDeactivateAdminGuild,
  useIssueOwnerInvite,
  usePermanentlyDeleteAdminGuild,
  useRestoreAdminGuild,
} from '@/guild/membershipQueries';
import type { GuildInvite, GuildInviteRole } from '@/guild/membershipTypes';
import { ApiError } from '@/lib/apiClient';
import { theme } from '@/theme/tokens';

const inviteRoleLabel: Record<GuildInviteRole, string> = { member: '길드원', admin: '관리자', owner: '길드장' };
type LifecycleAction = 'deactivate' | 'delete' | null;

export default function SuperAdminGuildsScreen() {
  const isSuperAdmin = useAuthStore((state) => Boolean(state.profile?.isSuperAdmin));
  const guilds = useAdminGuilds();
  const createGuildMutation = useCreateAdminGuild();
  const createInvite = useCreateGuildInvite();
  const issueOwnerInvite = useIssueOwnerInvite();
  const deactivateGuild = useDeactivateAdminGuild();
  const restoreGuild = useRestoreAdminGuild();
  const permanentlyDeleteGuild = usePermanentlyDeleteAdminGuild();
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [invites, setInvites] = useState<Partial<Record<GuildInviteRole, GuildInvite>>>({});
  const [pendingInviteRole, setPendingInviteRole] = useState<Extract<GuildInviteRole, 'member' | 'admin'> | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction>(null);
  const [confirmationName, setConfirmationName] = useState('');
  const [screenError, setScreenError] = useState<string | null>(null);
  const [screenNotice, setScreenNotice] = useState<string | null>(null);

  if (!isSuperAdmin) return <AppScreen scroll={false}><StateView kind="empty" message="최고관리자만 접근할 수 있습니다." /></AppScreen>;
  const selectedGuild = guilds.data?.find((guild) => guild.id === selectedGuildId) ?? null;
  const lifecyclePending = deactivateGuild.isPending || permanentlyDeleteGuild.isPending;
  const showError = (error: unknown, fallback: string) => setScreenError(error instanceof ApiError ? error.message : fallback);

  const createGuild = async () => {
    setScreenError(null); setScreenNotice(null);
    if (!name.trim() || !tagline.trim()) { setScreenError('길드명과 소개를 모두 입력해주세요.'); return; }
    try {
      const result = await createGuildMutation.mutateAsync({ name: name.trim(), tagline: tagline.trim() });
      setName(''); setTagline(''); setSelectedGuildId(result.guild.id);
      if (result.ownerInvite) setInvites({ owner: result.ownerInvite });
      setScreenNotice(result.ownerInvite ? '길드를 만들고 최초 길드장 초대코드를 발급했습니다.' : '길드를 만들었습니다. 길드장 코드를 다시 발급해주세요.');
    } catch (error) { showError(error, '길드를 생성하지 못했습니다.'); }
  };

  const selectGuild = (guildId: string) => {
    setSelectedGuildId(guildId); setInvites({}); setPendingInviteRole(null);
    setLifecycleAction(null); setConfirmationName(''); setScreenError(null); setScreenNotice(null);
  };

  const issueRegularInvite = async () => {
    if (!selectedGuild || !pendingInviteRole) return;
    const inviteRole = pendingInviteRole;
    try {
      const invite = await createInvite.mutateAsync({ guildId: selectedGuild.id, inviteRole });
      setInvites((current) => ({ ...current, [inviteRole]: invite }));
      setScreenNotice(`${inviteRoleLabel[inviteRole]} 초대코드 ${invite.code}를 만들었습니다.`); setPendingInviteRole(null);
    } catch (error) { showError(error, '초대코드를 생성하지 못했습니다.'); }
  };

  const issueOwner = async () => {
    if (!selectedGuild) return;
    try {
      const invite = await issueOwnerInvite.mutateAsync(selectedGuild.id);
      setInvites((current) => ({ ...current, owner: invite }));
      setScreenNotice(`최초 길드장 초대코드 ${invite.code}를 만들었습니다.`);
    } catch (error) { showError(error, '길드장 초대코드를 만들지 못했습니다.'); }
  };

  const restore = async () => {
    if (!selectedGuild) return;
    try { await restoreGuild.mutateAsync(selectedGuild.id); setScreenNotice(`${selectedGuild.name} 길드를 복구했습니다.`); }
    catch (error) { showError(error, '길드를 복구하지 못했습니다.'); }
  };

  const confirmLifecycle = async () => {
    if (!selectedGuild || !lifecycleAction) return;
    if (confirmationName !== selectedGuild.name) { setScreenError('입력한 길드명이 일치하지 않습니다.'); return; }
    try {
      if (lifecycleAction === 'deactivate') {
        await deactivateGuild.mutateAsync({ guildId: selectedGuild.id, confirmationName });
        setScreenNotice(`${selectedGuild.name} 길드를 비활성화했습니다. 데이터는 보존됩니다.`);
      } else {
        await permanentlyDeleteGuild.mutateAsync({ guildId: selectedGuild.id, confirmationName });
        setSelectedGuildId(null); setInvites({}); setScreenNotice(`${selectedGuild.name} 길드를 영구 삭제했습니다.`);
      }
      setLifecycleAction(null); setConfirmationName('');
    } catch (error) { showError(error, lifecycleAction === 'delete' ? '길드를 영구 삭제하지 못했습니다.' : '길드를 비활성화하지 못했습니다.'); }
  };

  const copy = async (value: string, label: string) => {
    try { await Clipboard.setStringAsync(value); setScreenNotice(`${label}을 복사했습니다.`); }
    catch { setScreenError(`${label}을 복사하지 못했습니다.`); }
  };

  const renderInvite = (inviteRole: GuildInviteRole) => {
    const invite = invites[inviteRole]; if (!invite) return null;
    return <View style={[styles.inviteResult, inviteRole === 'owner' && styles.ownerInvite]}>
      <Text style={styles.inviteKind}>{inviteRole === 'owner' ? '최초 길드장 초대코드' : `${inviteRoleLabel[inviteRole]} 초대코드`}</Text>
      <Text style={styles.code}>{invite.code}</Text>
      {inviteRole === 'owner' ? <Text style={styles.ownerMessage}>이 코드로 가입하면 길드장으로 등록됩니다.</Text> : null}
      <Text style={styles.link}>{invite.link}</Text>
      <View style={styles.inviteActions}>
        <Pressable style={styles.copyButton} onPress={() => void copy(invite.code, '코드')}><Ionicons name="copy-outline" size={16} color={theme.colors.accent}/><Text style={styles.copyText}>코드 복사</Text></Pressable>
        <Pressable style={styles.copyButton} onPress={() => void copy(invite.link, '초대 링크')}><Ionicons name="link-outline" size={16} color={theme.colors.accent}/><Text style={styles.copyText}>링크 복사</Text></Pressable>
      </View>
    </View>;
  };

  return <AppScreen contentStyle={styles.screen}>
    <Stack.Screen options={{ title: '길드 관리' }} /><Text style={styles.title}>연합 길드 관리</Text>
    {screenError ? <View style={[styles.feedback, styles.errorFeedback]}><Text style={styles.errorText}>{screenError}</Text></View> : null}
    {screenNotice ? <View style={[styles.feedback, styles.successFeedback]}><Text style={styles.successText}>{screenNotice}</Text></View> : null}
    <View style={styles.card}><Text style={styles.section}>새 길드 만들기</Text><TextField label="길드명" value={name} onChangeText={setName}/><TextField label="길드 소개" value={tagline} onChangeText={setTagline}/><Text style={styles.help}>프로필 ID 없이 생성되며, 최초 길드장 코드는 생성 후 자동 발급됩니다.</Text><PrimaryButton label="길드 생성" onPress={() => void createGuild()} loading={createGuildMutation.isPending}/></View>
    <View style={styles.card}><Text style={styles.section}>등록 길드</Text>{guilds.data?.map((guild) => <Pressable key={guild.id} style={[styles.guild, guild.id === selectedGuildId && styles.guildSelected]} onPress={() => selectGuild(guild.id)}><View style={styles.guildText}><Text style={styles.name}>{guild.name}</Text><Text style={styles.meta}>{guild.ownerNickname ?? '길드장 미지정'} · {guild.memberCount}/{guild.maxMembers} · {guild.status === 'active' ? '활성' : '비활성'}</Text><Text style={styles.selectText}>{guild.id === selectedGuildId ? '선택됨' : '관리하기'}</Text></View></Pressable>)}</View>
    {selectedGuild ? <View style={styles.card}><Text style={styles.section}>선택한 길드 · {selectedGuild.name}</Text>
      {selectedGuild.status === 'inactive' ? <><View style={styles.waitingBadge}><Ionicons name="key-outline" size={16} color={theme.colors.accentSoft}/><Text style={styles.waitingText}>{selectedGuild.ownerProfileId ? '비활성 길드' : '길드장 대기'}</Text></View>{!selectedGuild.ownerProfileId ? <>{renderInvite('owner')}<PrimaryButton label={invites.owner ? '새 코드 발급' : '최초 길드장 코드 발급'} onPress={() => void issueOwner()} loading={issueOwnerInvite.isPending}/></> : <PrimaryButton label="길드 복구" onPress={() => void restore()} loading={restoreGuild.isPending}/>}<PrimaryButton label="영구 삭제" variant="ghost" onPress={() => { setLifecycleAction('delete'); setConfirmationName(''); }}/></> : <><PrimaryButton label="길드원 초대코드 만들기" onPress={() => setPendingInviteRole('member')} loading={createInvite.isPending && pendingInviteRole === 'member'}/>{renderInvite('member')}<PrimaryButton label="관리자 초대코드 만들기" onPress={() => setPendingInviteRole('admin')} loading={createInvite.isPending && pendingInviteRole === 'admin'}/>{renderInvite('admin')}<PrimaryButton label="길드 비활성화" variant="ghost" onPress={() => { setLifecycleAction('deactivate'); setConfirmationName(''); }}/></>}
    </View> : null}
    <Modal transparent animationType="fade" visible={Boolean(pendingInviteRole && selectedGuild)} onRequestClose={() => setPendingInviteRole(null)}><View style={styles.modalBackdrop}><View style={styles.confirmCard}><Text style={styles.confirmTitle}>{inviteRoleLabel[pendingInviteRole ?? 'member']} 초대코드 만들기</Text><Text style={styles.confirmMessage}>기존 같은 종류의 코드는 중지됩니다. 새 4자리 코드를 만들까요?</Text><View style={styles.confirmActions}><Pressable style={[styles.confirmButton, styles.cancelButton]} onPress={() => setPendingInviteRole(null)}><Text style={styles.cancelText}>취소</Text></Pressable><Pressable style={[styles.confirmButton, styles.createButton]} onPress={() => void issueRegularInvite()}><Text style={styles.createText}>만들기</Text></Pressable></View></View></View></Modal>
    <Modal transparent animationType="fade" visible={Boolean(lifecycleAction && selectedGuild)} onRequestClose={() => !lifecyclePending && setLifecycleAction(null)}><View style={styles.modalBackdrop}><View style={styles.confirmCard}><Text style={styles.confirmTitle}>{lifecycleAction === 'delete' ? '길드 영구 삭제' : '길드 비활성화'}</Text><Text style={styles.confirmMessage}>{lifecycleAction === 'delete' ? '소속 길드원과 게시물·앨범·채팅 데이터가 삭제되며 되돌릴 수 없습니다.' : '길드원 활동과 초대코드가 중지되지만 데이터는 보존되어 복구할 수 있습니다.'}</Text><TextField label={`확인을 위해 “${selectedGuild?.name ?? ''}” 입력`} value={confirmationName} onChangeText={setConfirmationName}/><View style={styles.confirmActions}><Pressable disabled={lifecyclePending} style={[styles.confirmButton, styles.cancelButton]} onPress={() => setLifecycleAction(null)}><Text style={styles.cancelText}>취소</Text></Pressable><Pressable disabled={lifecyclePending || confirmationName !== selectedGuild?.name} style={[styles.confirmButton, lifecycleAction === 'delete' ? styles.deleteButton : styles.createButton]} onPress={() => void confirmLifecycle()}><Text style={styles.createText}>{lifecycleAction === 'delete' ? '영구 삭제' : '비활성화'}</Text></Pressable></View></View></View></Modal>
  </AppScreen>;
}

const styles = StyleSheet.create({
  screen:{gap:14,paddingBottom:60},title:{fontSize:28,fontWeight:'900',color:theme.colors.cream},card:{gap:12,padding:16,borderRadius:24,borderWidth:1,borderColor:theme.colors.goldBorder,backgroundColor:'rgba(255,249,245,.96)'},section:{fontSize:18,fontWeight:'900',color:theme.colors.text},help:{fontSize:12,lineHeight:18,color:theme.colors.textMuted},feedback:{borderRadius:14,paddingHorizontal:12,paddingVertical:10,borderWidth:1},errorFeedback:{backgroundColor:'rgba(191,72,72,.08)',borderColor:'rgba(191,72,72,.24)'},successFeedback:{backgroundColor:'rgba(58,142,108,.08)',borderColor:'rgba(58,142,108,.24)'},errorText:{color:theme.colors.danger,fontSize:12,fontWeight:'800'},successText:{color:'#397B65',fontSize:12,fontWeight:'800'},guild:{minHeight:76,padding:10,borderTopWidth:1,borderTopColor:'rgba(183,141,54,.14)',flexDirection:'row',alignItems:'center',borderRadius:16},guildSelected:{backgroundColor:'rgba(139,92,246,.08)',borderWidth:1,borderColor:'rgba(139,92,246,.25)'},guildText:{flex:1},name:{fontWeight:'900',color:theme.colors.text},meta:{fontSize:10,color:theme.colors.textMuted,marginTop:3},selectText:{marginTop:6,fontSize:11,fontWeight:'900',color:theme.colors.accent},waitingBadge:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:6,borderRadius:14,backgroundColor:'rgba(216,182,93,.15)'},waitingText:{fontSize:11,fontWeight:'900',color:theme.colors.accentSoft},inviteResult:{gap:7,padding:13,borderRadius:18,borderWidth:1,borderColor:'rgba(139,92,246,.22)',backgroundColor:'rgba(139,92,246,.06)'},ownerInvite:{borderColor:theme.colors.goldBorder,backgroundColor:'rgba(216,182,93,.1)'},inviteKind:{fontSize:12,fontWeight:'900',color:theme.colors.textMuted},code:{fontSize:34,letterSpacing:7,fontWeight:'900',color:theme.colors.accentSoft,textAlign:'center'},ownerMessage:{fontSize:12,fontWeight:'800',color:theme.colors.textMuted,textAlign:'center'},link:{fontSize:10,color:theme.colors.textMuted},inviteActions:{flexDirection:'row',flexWrap:'wrap',gap:8},copyButton:{minHeight:36,flexDirection:'row',gap:5,alignItems:'center',paddingHorizontal:10,borderRadius:16,borderWidth:1,borderColor:theme.colors.cardBorder,backgroundColor:'#fff'},copyText:{fontSize:10,fontWeight:'900',color:theme.colors.textMuted},modalBackdrop:{flex:1,alignItems:'center',justifyContent:'center',padding:22,backgroundColor:'rgba(2,10,34,.72)'},confirmCard:{width:'100%',maxWidth:420,gap:14,padding:20,borderRadius:24,borderWidth:1,borderColor:theme.colors.goldBorder,backgroundColor:'#FFF9F1'},confirmTitle:{fontSize:20,fontWeight:'900',color:theme.colors.text},confirmMessage:{fontSize:13,lineHeight:20,color:theme.colors.textMuted},confirmActions:{flexDirection:'row',gap:10,marginTop:2},confirmButton:{flex:1,minHeight:46,borderRadius:18,alignItems:'center',justifyContent:'center'},cancelButton:{borderWidth:1,borderColor:theme.colors.cardBorder,backgroundColor:'#fff'},createButton:{backgroundColor:theme.colors.accent},deleteButton:{backgroundColor:theme.colors.danger},cancelText:{fontWeight:'900',color:theme.colors.textMuted},createText:{fontWeight:'900',color:'#fff'},
});
