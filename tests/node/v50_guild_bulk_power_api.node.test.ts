import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('guild official sync targets are role and guild scoped on the server', () => {
  const source = read('supabase/functions/api/characters.ts');
  assert.match(source, /handleListGuildOfficialSyncTargets/);
  assert.match(source, /requireGuildRole\(account,\s*\['owner','admin'\]\)/);
  assert.match(source, /eq\('guild_id',\s*guildId\)/);
  assert.match(source, /eq\('status',\s*'active'\)/);
  assert.match(source, /is\('left_at',\s*null\)/);
  assert.match(source, /is_primary/);
  assert.match(source, /official_sync_enabled/);
});

test('guild official sync target route and typed client query exist', () => {
  const routes = read('supabase/functions/api/index.ts');
  const api = read('src/characters/api.ts');
  const queries = read('src/characters/queries.ts');
  const types = read('src/characters/types.ts');
  assert.match(routes, /path === '\/guild\/official-sync-targets'/);
  assert.match(api, /guildOfficialSyncTargets/);
  assert.match(api, /\/guild\/official-sync-targets/);
  assert.match(queries, /useGuildOfficialSyncTargets/);
  assert.match(types, /GuildOfficialSyncTarget/);
});

