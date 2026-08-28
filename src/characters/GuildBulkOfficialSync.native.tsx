import { useEffect, useMemo, useReducer, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { bulkSyncReducer, initialBulkSyncState } from '@/characters/guildBulkSyncMachine';
import type { GuildBulkOfficialSyncProps } from '@/characters/GuildBulkOfficialSync.types';
import { OfficialRankingWebView } from '@/characters/OfficialRankingWebView';
import { useSaveOfficialBrowserResult } from '@/characters/queries';
import { theme } from '@/theme/tokens';

const RESULT_LABEL = { success: '성공', failed: '실패', notFound: '미등록' } as const;

export function GuildBulkOfficialSync({ targets, loading = false, onFinished }: GuildBulkOfficialSyncProps) {
  const [state, dispatch] = useReducer(bulkSyncReducer, initialBulkSyncState);
  const save = useSaveOfficialBrowserResult();
  const queryClient = useQueryClient();
  const finishedStatus = useRef(state.status);
  const settledTarget = useRef<string | null>(null);
  const target = targets[state.index];
  const targetKey = target ? `${state.index}:${target.characterId}` : '';
  const processed = state.success + state.failed + state.notFound;
  const progress = state.total > 0 ? Math.round((processed / state.total) * 100) : 0;
  const recentResults = useMemo(() => state.results.slice(-4).reverse(), [state.results]);

  useEffect(() => {
    const justFinished = state.status === 'completed' || state.status === 'cancelled';
    if (justFinished && finishedStatus.current === 'running') {
      void queryClient.invalidateQueries({ queryKey: ['characters'] });
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      void queryClient.invalidateQueries({ queryKey: ['power'] });
      void queryClient.invalidateQueries({ queryKey: ['guild', 'official-sync-targets'] });
      onFinished?.();
    }
    finishedStatus.current = state.status;
  }, [onFinished, queryClient, state.status]);

  const start = () => {
    settledTarget.current = null;
    dispatch({ type: 'START', total: targets.length });
  };
  const claimTarget = () => {
    if (!target || settledTarget.current === targetKey) return false;
    settledTarget.current = targetKey;
    return true;
  };

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingBody}>
          <Text style={styles.title}>길드원 전투력 전체 갱신</Text>
          <Text style={styles.subtitle}>공식 조회 허용 대표 캐릭터를 한 명씩 안전하게 갱신해요.</Text>
        </View>
        <Text style={styles.badge}>길드장 · 관리자 전용</Text>
      </View>

      {state.status === 'idle' ? (
        <>
          <Text style={styles.targetSummary}>{loading ? '대상 확인 중…' : `갱신 대상 ${targets.length}명`}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={loading || targets.length === 0}
            onPress={start}
            style={({ pressed }) => [styles.startButton, (loading || targets.length === 0) && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.startButtonText}>전체 갱신 시작</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.progressPanel}>
          <View style={styles.progressTop}>
            <View>
              <Text style={styles.progressEyebrow}>{state.status === 'running' ? (state.phase === 'saving' ? '기록 저장 중' : '공식 랭킹 조회 중') : state.status === 'completed' ? '갱신 완료' : '갱신 취소됨'}</Text>
              <Text style={styles.currentName}>{state.status === 'running' ? target?.characterName : `${processed}명 처리`}</Text>
            </View>
            <Text style={styles.count}>{Math.min(processed + (state.status === 'running' ? 1 : 0), state.total)} / {state.total}</Text>
          </View>
          <View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>
          <View style={styles.metrics}>
            <Text style={styles.metricSuccess}>성공 {state.success}</Text>
            <Text style={styles.metricFailed}>실패 {state.failed}</Text>
            <Text style={styles.metricMissing}>미등록 {state.notFound}</Text>
          </View>
          {recentResults.map((result, index) => (
            <View key={`${result.characterName}:${index}`} style={styles.resultRow}>
              <Text style={styles.resultName}>{result.characterName}</Text>
              <Text style={styles.resultLabel}>{RESULT_LABEL[result.kind]}{result.message ? ` · ${result.message}` : ''}</Text>
            </View>
          ))}
          {state.status === 'running' ? (
            <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'CANCEL' })} style={styles.cancelButton}>
              <Text style={styles.cancelText}>갱신 취소</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'RESET' })} style={styles.doneButton}>
              <Text style={styles.doneText}>확인</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={styles.note}>APK에서만 사용할 수 있어요. 앱을 닫거나 다른 화면으로 이동하면 진행이 중단돼요.</Text>

      {state.status === 'running' && target ? (
        <OfficialRankingWebView
          characterId={target.characterId}
          characterName={target.characterName}
          requestKey={state.index + 1}
          onStats={(stats) => {
            if (!claimTarget()) return;
            dispatch({ type: 'LOOKUP_SUCCESS' });
            void save.mutateAsync({ id: target.characterId, input: stats })
              .then(() => dispatch({ type: 'SAVE_SUCCESS', characterName: target.characterName }))
              .catch((error: unknown) => dispatch({ type: 'FAIL', characterName: target.characterName, message: error instanceof Error ? error.message : '저장 실패' }));
          }}
          onSynced={() => {
            if (!claimTarget()) return;
            dispatch({ type: 'LOOKUP_SUCCESS' });
            dispatch({ type: 'SAVE_SUCCESS', characterName: target.characterName });
          }}
          onNotFound={() => {
            if (claimTarget()) dispatch({ type: 'NOT_FOUND', characterName: target.characterName });
          }}
          onError={(message) => {
            if (claimTarget()) dispatch({ type: 'FAIL', characterName: target.characterName, message });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.goldBorder, backgroundColor: theme.colors.card },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headingBody: { flex: 1, gap: 3 },
  title: { color: theme.colors.text, fontSize: 17, fontWeight: '900' },
  subtitle: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  badge: { color: theme.colors.accentDark, backgroundColor: theme.colors.goldSoft, borderRadius: theme.radius.pill, paddingHorizontal: 9, paddingVertical: 6, fontSize: 9, fontWeight: '900' },
  targetSummary: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  startButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.button, backgroundColor: theme.colors.accentDark },
  startButtonText: { color: theme.colors.white, fontWeight: '900' },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.78 },
  progressPanel: { gap: 11, padding: 14, borderRadius: 18, backgroundColor: theme.colors.nightPanel, borderWidth: 1, borderColor: theme.colors.nightBorder },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressEyebrow: { color: theme.colors.screenTextMuted, fontSize: 10, fontWeight: '800' },
  currentName: { color: theme.colors.screenText, fontSize: 18, fontWeight: '900', marginTop: 2 },
  count: { color: theme.colors.cream, fontSize: 15, fontWeight: '900' },
  track: { height: 8, borderRadius: 99, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.15)' },
  fill: { height: '100%', borderRadius: 99, backgroundColor: theme.colors.accentSoft },
  metrics: { flexDirection: 'row', justifyContent: 'space-between' },
  metricSuccess: { color: theme.colors.mint, fontSize: 11, fontWeight: '900' },
  metricFailed: { color: theme.colors.peach, fontSize: 11, fontWeight: '900' },
  metricMissing: { color: theme.colors.screenTextMuted, fontSize: 11, fontWeight: '900' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.2)' },
  resultName: { color: theme.colors.screenText, fontSize: 11, fontWeight: '800' },
  resultLabel: { flex: 1, color: theme.colors.screenTextMuted, fontSize: 10, textAlign: 'right' },
  cancelButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: theme.colors.danger },
  cancelText: { color: theme.colors.peach, fontWeight: '900' },
  doneButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: theme.colors.card },
  doneText: { color: theme.colors.accentDark, fontWeight: '900' },
  note: { color: theme.colors.textDim, fontSize: 10, lineHeight: 15 },
});
