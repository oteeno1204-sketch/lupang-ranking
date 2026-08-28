import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { AppScreen } from '@/components/AppScreen';
import { Avatar } from '@/components/Avatar';
import { ScreenTitle } from '@/components/ScreenTitle';
import { StateView } from '@/components/StateView';
import { PowerChart } from '@/characters/PowerChart';
import { GrowthRankingList, GrowthSummaryCard } from '@/characters/PowerGrowthSections';
import { StatMetricTabs } from '@/characters/StatMetricTabs';
import { GuildBulkOfficialSync } from '@/characters/GuildBulkOfficialSync';
import { useCharacter, useGuildOfficialSyncTargets, useMyCharacters, usePowerGrowth, usePowerRankings } from '@/characters/queries';
import type { GrowthMetric, PowerRankingScope } from '@/characters/types';
import { useOpenDirectChat } from '@/chat/queries';
import { useAuthStore } from '@/auth/store';
import { theme } from '@/theme/tokens';

const fmt=(value:number|null|undefined)=>value==null?'-':value.toLocaleString();
const METRIC_LABEL:Record<GrowthMetric,string>={total:'종합',combat:'전투력',life:'생활력',charm:'매력'};

export default function PowerScreen(){
  const router=useRouter(); const [metric,setMetric]=useState<GrowthMetric>('total'); const [scope,setScope]=useState<PowerRankingScope>('guild');
  const membership=useAuthStore((state)=>state.membership);
  const canBulkSync=Platform.OS!=='web'&&(membership?.role==='owner'||membership?.role==='admin');
  const chars=useMyCharacters(); const rankings=usePowerRankings(scope,metric); const growth=usePowerGrowth(metric); const openDirect=useOpenDirectChat();
  const bulkTargets=useGuildOfficialSyncTargets(canBulkSync);
  const primary=chars.data?.find((c)=>c.isPrimary); const detail=useCharacter(primary?.id);
  const chat=async(profileId:string)=>{const result=await openDirect.mutateAsync(profileId);router.push({pathname:'/chat/[id]',params:{id:result.roomId}});};
  return <AppScreen contentStyle={styles.screen}><Stack.Screen options={{title:'투력 관리'}}/><ScreenTitle title="투력 관리" subtitle="현재 길드와 모든 길드 캐릭터 순위를 확인하세요."/>
    {canBulkSync?<GuildBulkOfficialSync targets={bulkTargets.data??[]} loading={bulkTargets.isPending}/>:null}
    {chars.isPending?<StateView kind="loading"/>:!primary?<StateView kind="empty" message="대표 캐릭터를 먼저 지정해주세요."/>:<>
      <Pressable style={styles.hero} onPress={()=>router.push({pathname:'/characters/[id]',params:{id:primary.id}})}><Avatar uri={primary.avatarUrl} name={primary.name} size={66}/><View style={styles.heroBody}><Text style={styles.heroName}>{primary.name}</Text><Text style={styles.heroMeta}>{primary.job==='조회중'?'직업 확인 중':primary.job} · 아이라</Text><Text style={styles.heroLabel}>종합 점수</Text><Text style={styles.heroPower}>{fmt(primary.latestTotalPower)}</Text><Text style={styles.heroStats}>전투력 {fmt(primary.latestCombatPower)} · 생활력 {fmt(primary.latestLifePower)} · 매력 {fmt(primary.latestCharmPower)}</Text></View></Pressable>
      <Text style={styles.section}>내 성장</Text><StatMetricTabs value={metric} onChange={setMetric}/>{detail.isPending?<StateView kind="loading" compact/>:<PowerChart records={detail.data?.powerRecords??[]} metric={metric}/>}</>}
    {growth.isPending?<StateView kind="loading" compact/>:growth.isError?<StateView kind="error" compact onRetry={()=>void growth.refetch()}/>:<>{primary?<GrowthSummaryCard summary={growth.data.personal}/>:null}<GrowthRankingList metricLabel={METRIC_LABEL[metric]} rankings={growth.data.rankings} onPressCharacter={(characterId)=>router.push({pathname:'/characters/[id]',params:{id:characterId}})}/></>}
    <View style={styles.scopeTabs}><Pressable style={[styles.scopeTab,scope==='guild'&&styles.scopeActive]} onPress={()=>setScope('guild')}><Text style={[styles.scopeText,scope==='guild'&&styles.scopeTextActive]}>길드 순위</Text></Pressable><Pressable style={[styles.scopeTab,scope==='alliance'&&styles.scopeActive]} onPress={()=>setScope('alliance')}><Text style={[styles.scopeText,scope==='alliance'&&styles.scopeTextActive]}>연합 순위</Text></Pressable></View>
    <Text style={styles.scopeHelp}>{scope==='guild'?'현재 길드 캐릭터 순위':'모든 길드 캐릭터 통합 순위'} · {METRIC_LABEL[metric]}</Text>
    {rankings.isPending?<StateView kind="loading" compact/>:rankings.isError?<StateView kind="error" compact onRetry={()=>void rankings.refetch()}/>:rankings.data?.length===0?<StateView kind="empty" compact message="아직 순위 데이터가 없습니다."/>:<View style={styles.ranking}>{rankings.data?.map((r)=><View key={r.characterId} style={styles.rankRow}><Pressable style={styles.rankMain} onPress={()=>router.push({pathname:'/characters/[id]',params:{id:r.characterId}})}><Text style={[styles.rank,r.rank<=3&&styles.topRank]}>{r.rank}</Text><View style={styles.rankBody}><Text style={styles.rankName}>{r.nickname} · {r.characterName}</Text><Text style={styles.rankMeta}>{r.job}{scope==='alliance'?` · ${r.guildName}`:''}</Text></View><Text style={styles.rankPower}>{r.power.toLocaleString()}</Text></Pressable>{scope==='alliance'?<Pressable style={styles.chatButton} onPress={()=>void chat(r.profileId)}><Text style={styles.chatText}>1:1 대화</Text></Pressable>:null}</View>)}</View>}
  </AppScreen>;
}
const styles=StyleSheet.create({screen:{gap:theme.spacing.md},hero:{flexDirection:'row',alignItems:'center',gap:13,padding:16,borderRadius:theme.radius.card,borderWidth:1,borderColor:theme.colors.goldBorder,backgroundColor:theme.colors.card},heroBody:{flex:1,gap:2},heroName:{color:theme.colors.text,fontSize:21,fontWeight:'900'},heroMeta:{color:theme.colors.textMuted,fontSize:12},heroLabel:{color:theme.colors.textMuted,fontSize:10,marginTop:3},heroPower:{color:theme.colors.accent,fontSize:25,fontWeight:'900'},heroStats:{color:theme.colors.accentSoft,fontSize:10,fontWeight:'700',lineHeight:15},section:{color:theme.colors.screenText,fontSize:18,fontWeight:'900',marginTop:7},scopeTabs:{flexDirection:'row',gap:8,padding:4,borderRadius:18,backgroundColor:'rgba(18,31,73,.8)',borderWidth:1,borderColor:theme.colors.nightBorder},scopeTab:{flex:1,minHeight:42,borderRadius:14,alignItems:'center',justifyContent:'center'},scopeActive:{backgroundColor:theme.colors.card},scopeText:{color:theme.colors.screenTextMuted,fontWeight:'900'},scopeTextActive:{color:theme.colors.accentDark},scopeHelp:{color:theme.colors.screenTextMuted,fontSize:11,textAlign:'center'},ranking:{gap:7},rankRow:{borderRadius:14,borderWidth:1,borderColor:theme.colors.goldBorder,backgroundColor:theme.colors.card,overflow:'hidden'},rankMain:{flexDirection:'row',alignItems:'center',gap:10,padding:12},rank:{width:28,color:theme.colors.textMuted,fontSize:17,fontWeight:'900',textAlign:'center'},topRank:{color:theme.colors.accent},rankBody:{flex:1},rankName:{color:theme.colors.text,fontWeight:'800'},rankMeta:{color:theme.colors.textMuted,fontSize:11,marginTop:2},rankPower:{color:theme.colors.accentSoft,fontWeight:'900'},chatButton:{alignSelf:'flex-end',marginRight:10,marginBottom:9,paddingHorizontal:11,paddingVertical:7,borderRadius:12,backgroundColor:theme.colors.accentDark},chatText:{color:theme.colors.white,fontSize:10,fontWeight:'900'}});
