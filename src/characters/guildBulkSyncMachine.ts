export type BulkSyncStatus = 'idle' | 'running' | 'completed' | 'cancelled';
export type BulkSyncPhase = 'lookup' | 'saving';
export type BulkSyncResultKind = 'success' | 'failed' | 'notFound';

export type BulkSyncResult = {
  characterName: string;
  kind: BulkSyncResultKind;
  message?: string;
};

export type BulkSyncState = {
  status: BulkSyncStatus;
  phase: BulkSyncPhase;
  index: number;
  total: number;
  success: number;
  failed: number;
  notFound: number;
  results: BulkSyncResult[];
};

export const initialBulkSyncState: BulkSyncState = {
  status: 'idle',
  phase: 'lookup',
  index: 0,
  total: 0,
  success: 0,
  failed: 0,
  notFound: 0,
  results: [],
};

export type BulkSyncEvent =
  | { type: 'START'; total: number }
  | { type: 'LOOKUP_SUCCESS' }
  | { type: 'SAVE_SUCCESS'; characterName: string }
  | { type: 'FAIL'; characterName: string; message: string }
  | { type: 'NOT_FOUND'; characterName: string }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

function advance(
  state: BulkSyncState,
  result: BulkSyncResult,
  counters: Pick<Partial<BulkSyncState>, 'success' | 'failed' | 'notFound'>,
): BulkSyncState {
  const nextIndex = state.index + 1;
  return {
    ...state,
    ...counters,
    index: nextIndex >= state.total ? state.index : nextIndex,
    phase: 'lookup',
    status: nextIndex >= state.total ? 'completed' : 'running',
    results: [...state.results, result],
  };
}

export function bulkSyncReducer(state: BulkSyncState, event: BulkSyncEvent): BulkSyncState {
  if (event.type === 'START') {
    return {
      ...initialBulkSyncState,
      status: event.total > 0 ? 'running' : 'completed',
      total: Math.max(0, event.total),
    };
  }
  if (event.type === 'RESET') return initialBulkSyncState;
  if (event.type === 'CANCEL') {
    return state.status === 'running' ? { ...state, status: 'cancelled' } : state;
  }
  if (state.status !== 'running') return state;

  if (event.type === 'LOOKUP_SUCCESS') {
    return state.phase === 'lookup' ? { ...state, phase: 'saving' } : state;
  }
  if (event.type === 'SAVE_SUCCESS' && state.phase === 'saving') {
    return advance(state, { characterName: event.characterName, kind: 'success' }, { success: state.success + 1 });
  }
  if (event.type === 'FAIL') {
    return advance(
      state,
      { characterName: event.characterName, kind: 'failed', message: event.message },
      { failed: state.failed + 1 },
    );
  }
  if (event.type === 'NOT_FOUND') {
    return advance(state, { characterName: event.characterName, kind: 'notFound' }, { notFound: state.notFound + 1 });
  }
  return state;
}
