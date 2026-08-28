import { bulkSyncReducer, initialBulkSyncState } from '@/characters/guildBulkSyncMachine';

describe('guildBulkSyncMachine', () => {
  it('starts with exactly the first target in lookup phase', () => {
    const state = bulkSyncReducer(initialBulkSyncState, { type: 'START', total: 3 });
    expect(state).toMatchObject({ status: 'running', phase: 'lookup', index: 0, total: 3 });
  });

  it('does not advance until a looked-up result has been saved', () => {
    const running = bulkSyncReducer(initialBulkSyncState, { type: 'START', total: 2 });
    const saving = bulkSyncReducer(running, { type: 'LOOKUP_SUCCESS' });
    expect(saving).toMatchObject({ phase: 'saving', index: 0, success: 0 });
    const next = bulkSyncReducer(saving, { type: 'SAVE_SUCCESS', characterName: '곰히' });
    expect(next).toMatchObject({ phase: 'lookup', index: 1, success: 1 });
  });

  it('continues after failures and not-found results', () => {
    let state = bulkSyncReducer(initialBulkSyncState, { type: 'START', total: 3 });
    state = bulkSyncReducer(state, { type: 'FAIL', characterName: '곰히', message: '저장 실패' });
    expect(state).toMatchObject({ index: 1, failed: 1, status: 'running' });
    state = bulkSyncReducer(state, { type: 'NOT_FOUND', characterName: '아띠곰' });
    expect(state).toMatchObject({ index: 2, notFound: 1, status: 'running' });
    state = bulkSyncReducer(state, { type: 'LOOKUP_SUCCESS' });
    state = bulkSyncReducer(state, { type: 'SAVE_SUCCESS', characterName: '이든곰' });
    expect(state).toMatchObject({ status: 'completed', success: 1, failed: 1, notFound: 1 });
  });

  it('cancels without starting another target', () => {
    const running = bulkSyncReducer(initialBulkSyncState, { type: 'START', total: 4 });
    const cancelled = bulkSyncReducer(running, { type: 'CANCEL' });
    expect(cancelled).toMatchObject({ status: 'cancelled', index: 0 });
  });
});

