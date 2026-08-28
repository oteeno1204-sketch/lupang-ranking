import { apiFetch } from '@/lib/apiClient';import { currentToken } from '@/lib/session';
import type { Character,CharacterDetail,CharacterInput,GrowthMetric,GuildOfficialSyncTarget,OfficialBrowserInput,OfficialSyncResult,PowerGrowth,PowerInput,PowerRanking,PowerRankingScope,PowerRecord } from '@/characters/types';
export const charactersApi={
 mine:()=>apiFetch<Character[]>('/characters',{},currentToken()),detail:(id:string)=>apiFetch<CharacterDetail>(`/characters/${id}`,{},currentToken()),
 create:(input:CharacterInput)=>apiFetch<Character>('/characters',{method:'POST',body:JSON.stringify(input)},currentToken()),update:(id:string,input:CharacterInput)=>apiFetch<Character>(`/characters/${id}`,{method:'PATCH',body:JSON.stringify(input)},currentToken()),remove:(id:string)=>apiFetch<{deleted:true}>(`/characters/${id}`,{method:'DELETE'},currentToken()),
 setPrimary:(id:string)=>apiFetch<{primaryId:string}>(`/characters/${id}/primary`,{method:'POST'},currentToken()),powerRecords:(id:string)=>apiFetch<PowerRecord[]>(`/characters/${id}/power-records`,{},currentToken()),addPower:(id:string,input:PowerInput)=>apiFetch<PowerRecord>(`/characters/${id}/power-records`,{method:'POST',body:JSON.stringify(input)},currentToken()),
 syncOfficial:(id:string)=>apiFetch<OfficialSyncResult>(`/characters/${id}/official-stats/sync`,{method:'POST'},currentToken()),saveOfficialBrowserResult:(id:string,input:OfficialBrowserInput)=>apiFetch<OfficialSyncResult>(`/characters/${id}/official-browser-result`,{method:'POST',body:JSON.stringify(input)},currentToken()),
 rankings:(scope:PowerRankingScope,metric:GrowthMetric)=>apiFetch<PowerRanking[]>(`/power/rankings?scope=${scope}&metric=${metric}`,{},currentToken()),
 growth:(metric:GrowthMetric)=>apiFetch<PowerGrowth>(`/power/growth?metric=${metric}`,{},currentToken()),
 guildOfficialSyncTargets:()=>apiFetch<GuildOfficialSyncTarget[]>('/guild/official-sync-targets',{},currentToken()),
};
