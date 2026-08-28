import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { charactersApi } from '@/characters/api';
import type { CharacterInput, GrowthMetric, OfficialBrowserInput, PowerInput, PowerRankingScope } from '@/characters/types';
import { useAuthStore } from '@/auth/store';

export const characterKeys = {
  mine: ['characters', 'mine'] as const,
  detail: (id: string) => ['characters', id] as const,
  powers: (id: string) => ['characters', id, 'power-records'] as const,
  rankings: (guildId:string|null,scope:PowerRankingScope,metric:GrowthMetric) => ['power', guildId, 'rankings', scope, metric] as const,
  growth: (metric: GrowthMetric) => ['power', 'growth', metric] as const,
};
const invalidateCharacterLists = (client: ReturnType<typeof useQueryClient>) => {
  void client.invalidateQueries({ queryKey: characterKeys.mine });
  void client.invalidateQueries({ queryKey: ['members'] });
};
const invalidatePowerDerived = (client: ReturnType<typeof useQueryClient>) => {
  void client.invalidateQueries({ queryKey: ['power'] });
  void client.invalidateQueries({ queryKey: ['power', 'growth'] });
};
export function useMyCharacters() { return useQuery({ queryKey: characterKeys.mine, queryFn: charactersApi.mine }); }
export function useGuildOfficialSyncTargets(enabled=true) { return useQuery({ queryKey: ['guild','official-sync-targets'], queryFn: charactersApi.guildOfficialSyncTargets, enabled }); }
export function useCharacter(id?: string) { return useQuery({ queryKey: characterKeys.detail(id ?? ''), queryFn: () => charactersApi.detail(id as string), enabled: Boolean(id) }); }
export function usePowerRecords(id?: string) { return useQuery({ queryKey: characterKeys.powers(id ?? ''), queryFn: () => charactersApi.powerRecords(id as string), enabled: Boolean(id) }); }
export function usePowerRankings(scope:PowerRankingScope,metric:GrowthMetric) { const guildId=useAuthStore((s)=>s.membership?.guild.id??null); return useQuery({ queryKey: characterKeys.rankings(guildId,scope,metric), queryFn:()=>charactersApi.rankings(scope,metric), enabled:Boolean(guildId) }); }
export function usePowerGrowth(metric: GrowthMetric) { return useQuery({ queryKey: characterKeys.growth(metric), queryFn: () => charactersApi.growth(metric) }); }
export function useCreateCharacter() { const c = useQueryClient(); return useMutation({ mutationFn: charactersApi.create, onSuccess: () => { invalidateCharacterLists(c); invalidatePowerDerived(c); } }); }
export function useUpdateCharacter() { const c = useQueryClient(); return useMutation({ mutationFn: ({ id, input }: { id: string; input: CharacterInput }) => charactersApi.update(id, input), onSuccess: (x) => { c.setQueryData(characterKeys.detail(x.id), (old: unknown) => old ? { ...(old as object), character: x } : old); invalidateCharacterLists(c); invalidatePowerDerived(c); } }); }
export function useDeleteCharacter() { const c = useQueryClient(); return useMutation({ mutationFn: charactersApi.remove, onSuccess: () => { invalidateCharacterLists(c); invalidatePowerDerived(c); } }); }
export function useSetPrimaryCharacter() { const c = useQueryClient(); return useMutation({ mutationFn: charactersApi.setPrimary, onSuccess: () => { invalidateCharacterLists(c); invalidatePowerDerived(c); } }); }
export function useAddPowerRecord() { const c = useQueryClient(); return useMutation({ mutationFn: ({ id, input }: { id: string; input: PowerInput }) => charactersApi.addPower(id, input), onSuccess: (_x, variables) => { void c.invalidateQueries({ queryKey: characterKeys.powers(variables.id) }); void c.invalidateQueries({ queryKey: characterKeys.detail(variables.id) }); invalidatePowerDerived(c); invalidateCharacterLists(c); } }); }
export function useSyncOfficialStats() { const c = useQueryClient(); return useMutation({ mutationFn: charactersApi.syncOfficial, onSuccess: (_x, id) => { void c.invalidateQueries({ queryKey: characterKeys.detail(id) }); void c.invalidateQueries({ queryKey: characterKeys.powers(id) }); invalidatePowerDerived(c); invalidateCharacterLists(c); } }); }

export function useSaveOfficialBrowserResult(){const c=useQueryClient();return useMutation({mutationFn:({id,input}:{id:string;input:OfficialBrowserInput})=>charactersApi.saveOfficialBrowserResult(id,input),onSuccess:(_x,v)=>{void c.invalidateQueries({queryKey:characterKeys.detail(v.id)});void c.invalidateQueries({queryKey:characterKeys.powers(v.id)});invalidatePowerDerived(c);invalidateCharacterLists(c);}});}
