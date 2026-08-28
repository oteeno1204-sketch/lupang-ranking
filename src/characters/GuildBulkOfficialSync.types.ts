import type { GuildOfficialSyncTarget } from '@/characters/types';

export type GuildBulkOfficialSyncProps = {
  targets: GuildOfficialSyncTarget[];
  loading?: boolean;
  onFinished?: () => void;
};
